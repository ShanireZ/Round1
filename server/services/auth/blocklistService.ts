import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { redisClient } from "../../redis.js";
import { logger } from "../../logger.js";

// ── Redis key constants ──────────────────────────────────────────────

const KEY_GITHUB = "round1:email-blocklist:github";
const KEY_MANUAL = "round1:email-blocklist:manual";
const KEY_META = "round1:email-blocklist:meta";

const GITHUB_RAW_URL =
  "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/main/disposable_email_blocklist.conf";

// ── Query ────────────────────────────────────────────────────────────

export async function isTempEmail(email: string): Promise<boolean> {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return false;
  const [inGithub, inManual] = await Promise.all([
    redisClient.sIsMember(KEY_GITHUB, domain),
    redisClient.sIsMember(KEY_MANUAL, domain),
  ]);
  return !!inGithub || !!inManual;
}

// ── Stats ────────────────────────────────────────────────────────────

export async function getStats(): Promise<{
  githubCount: number;
  manualCount: number;
  total: number;
  lastSyncAt: string | null;
}> {
  const [githubCount, manualCount, lastSyncAt] = await Promise.all([
    redisClient.sCard(KEY_GITHUB),
    redisClient.sCard(KEY_MANUAL),
    redisClient.hGet(KEY_META, "lastSyncAt"),
  ]);
  return {
    githubCount,
    manualCount,
    total: githubCount + manualCount,
    lastSyncAt: lastSyncAt ?? null,
  };
}

// ── List / Search ────────────────────────────────────────────────────

export async function listDomains(opts: {
  page: number;
  pageSize: number;
  search?: string;
  source?: "github" | "manual";
}): Promise<{ items: Array<{ domain: string; source: "github" | "manual" }>; total: number }> {
  // Collect domains from requested sources
  const sources: Array<"github" | "manual"> = opts.source
    ? [opts.source]
    : ["manual", "github"];

  const results: Array<{ domain: string; source: "github" | "manual" }> = [];

  for (const src of sources) {
    const key = src === "github" ? KEY_GITHUB : KEY_MANUAL;
    const members = await redisClient.sMembers(key);
    for (const d of members) {
      if (!opts.search || d.includes(opts.search.toLowerCase())) {
        results.push({ domain: d, source: src });
      }
    }
  }

  // Sort alphabetically
  results.sort((a, b) => a.domain.localeCompare(b.domain));

  const total = results.length;
  const start = (opts.page - 1) * opts.pageSize;
  const items = results.slice(start, start + opts.pageSize);

  return { items, total };
}

// ── Add ──────────────────────────────────────────────────────────────

export async function addDomain(domain: string): Promise<boolean> {
  const d = domain.trim().toLowerCase();
  if (!d || !d.includes(".")) return false;
  const added = await redisClient.sAdd(KEY_MANUAL, d);
  return added > 0;
}

// ── Remove ───────────────────────────────────────────────────────────

export async function removeDomain(domain: string): Promise<boolean> {
  const d = domain.trim().toLowerCase();
  const [r1, r2] = await Promise.all([
    redisClient.sRem(KEY_GITHUB, d),
    redisClient.sRem(KEY_MANUAL, d),
  ]);
  return r1 + r2 > 0;
}

// ── Rename ───────────────────────────────────────────────────────────

export async function renameDomain(
  oldDomain: string,
  newDomain: string,
): Promise<boolean> {
  const od = oldDomain.trim().toLowerCase();
  const nd = newDomain.trim().toLowerCase();
  if (!nd || !nd.includes(".")) return false;

  // Determine which set(s) the old domain is in, move to manual
  const [inGithub, inManual] = await Promise.all([
    redisClient.sIsMember(KEY_GITHUB, od),
    redisClient.sIsMember(KEY_MANUAL, od),
  ]);

  if (!inGithub && !inManual) return false;

  // Remove old, add new as manual
  const pipeline = redisClient.multi();
  if (inGithub) pipeline.sRem(KEY_GITHUB, od);
  if (inManual) pipeline.sRem(KEY_MANUAL, od);
  pipeline.sAdd(KEY_MANUAL, nd);
  await pipeline.exec();
  return true;
}

// ── GitHub Sync ──────────────────────────────────────────────────────

export async function syncFromGitHub(): Promise<{
  added: number;
  removed: number;
  total: number;
}> {
  const res = await fetch(GITHUB_RAW_URL, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`GitHub fetch failed: ${res.status} ${res.statusText}`);
  }

  const text = await res.text();
  const remoteDomains = text
    .split("\n")
    .map((l) => l.trim().toLowerCase())
    .filter((l) => l && !l.startsWith("#"));

  // Get current github set for diff
  const currentGithub = await redisClient.sMembers(KEY_GITHUB);
  const currentSet = new Set(currentGithub);
  const remoteSet = new Set(remoteDomains);

  const toAdd = remoteDomains.filter((d) => !currentSet.has(d));
  const toRemove = currentGithub.filter((d) => !remoteSet.has(d));

  // Apply changes in pipeline
  if (toAdd.length > 0 || toRemove.length > 0) {
    const pipeline = redisClient.multi();
    if (toRemove.length > 0) pipeline.sRem(KEY_GITHUB, toRemove);
    if (toAdd.length > 0) pipeline.sAdd(KEY_GITHUB, toAdd);
    await pipeline.exec();
  }

  // Update metadata
  await redisClient.hSet(KEY_META, "lastSyncAt", new Date().toISOString());

  const total = await redisClient.sCard(KEY_GITHUB);

  logger.info({ added: toAdd.length, removed: toRemove.length, total }, "Blocklist synced from GitHub");

  return { added: toAdd.length, removed: toRemove.length, total };
}

// ── Seed from file (one-time migration) ──────────────────────────────

export async function seedFromFile(): Promise<void> {
  // Only seed if both sets are empty (first boot)
  const [gc, mc] = await Promise.all([
    redisClient.sCard(KEY_GITHUB),
    redisClient.sCard(KEY_MANUAL),
  ]);
  if (gc > 0 || mc > 0) return;

  const blocklistPath = resolve(import.meta.dirname, "../../../config/temp-email-blocklist.txt");
  try {
    const content = readFileSync(blocklistPath, "utf-8");
    const domains = content
      .split("\n")
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean);
    if (domains.length > 0) {
      await redisClient.sAdd(KEY_MANUAL, domains);
      logger.info({ count: domains.length }, "Blocklist seeded from file to Redis");
    }
  } catch {
    // File not found — skip
  }
}
