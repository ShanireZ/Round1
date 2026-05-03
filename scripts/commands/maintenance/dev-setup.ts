#!/usr/bin/env node
/**
 * dev-setup — Automated local HTTPS dev environment setup.
 * Run: npx tsx scripts/commands/maintenance/dev-setup.ts
 *
 * 1. Checks & installs mkcert if needed
 * 2. Installs local CA
 * 3. Generates dev certs for round1.local
 * 4. Reminds about /etc/hosts
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CERTS_DIR = path.resolve(__dirname, "../../certs");
const CERT_FILE = path.join(CERTS_DIR, "dev-cert.pem");
const KEY_FILE = path.join(CERTS_DIR, "dev-key.pem");

function run(cmd: string): string {
  return execSync(cmd, { encoding: "utf-8", stdio: "pipe" }).trim();
}

function hasMkcert(): boolean {
  try {
    run("mkcert -version");
    return true;
  } catch {
    return false;
  }
}

function main(): void {
  console.log("🔧 Round1 Dev Environment Setup\n");

  // 1. Check mkcert
  if (!hasMkcert()) {
    console.error(
      "❌ mkcert not found. Install it first:\n" +
        "   Windows: choco install mkcert  OR  scoop install mkcert\n" +
        "   macOS:   brew install mkcert\n" +
        "   Linux:   https://github.com/FiloSottile/mkcert#installation\n",
    );
    process.exit(1);
  }
  console.log("✓ mkcert found");

  // 2. Install local CA
  console.log("Installing local CA (may require admin privileges)…");
  run("mkcert -install");
  console.log("✓ Local CA installed");

  // 3. Generate certs
  if (!fs.existsSync(CERTS_DIR)) {
    fs.mkdirSync(CERTS_DIR, { recursive: true });
  }

  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    console.log("✓ Certificates already exist, skipping generation");
  } else {
    console.log("Generating certificates for round1.local…");
    run(
      `mkcert -cert-file "${CERT_FILE}" -key-file "${KEY_FILE}" round1.local localhost 127.0.0.1 ::1`,
    );
    console.log("✓ Certificates generated");
  }

  // 4. Hosts reminder
  console.log(
    "\n📌 Ensure your hosts file contains:\n" +
      "   127.0.0.1  round1.local\n\n" +
      "   Windows: C:\\Windows\\System32\\drivers\\etc\\hosts\n" +
      "   macOS/Linux: /etc/hosts\n",
  );

  console.log("✅ Dev environment setup complete!\n");
  console.log("   npm run dev:server   — Start backend on :7654");
  console.log("   npm run dev:client   — Start frontend on :4399");
}

main();
