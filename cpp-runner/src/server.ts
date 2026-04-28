/**
 * cpp-runner — C++ 编译执行沙箱 HTTP 服务
 *
 * 端口：4401
 * 端点：
 *   POST /run    — 编译并运行 C++ 代码
 *   GET  /health — 健康检查
 */
import express from "express";
import { execFile } from "node:child_process";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import os from "node:os";

const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = parseInt(process.env.PORT ?? "4401", 10);
const COMPILE_TIMEOUT = parseInt(process.env.COMPILE_TIMEOUT_MS ?? "10000", 10);
const RUN_TIMEOUT = parseInt(process.env.RUN_TIMEOUT_MS ?? "1000", 10);
const WORK_DIR = process.env.WORK_DIR ?? path.join(os.tmpdir(), "cpp-runner");

interface RunRequest {
  source: string;
  stdin?: string;
  timeoutMs?: number;
}

interface RunResponse {
  compileOk: boolean;
  compileStderr: string;
  runOk: boolean | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  peakMemoryKb: number | null;
  wallMs: number;
}

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.post("/run", async (req, res) => {
  const body = req.body as RunRequest;
  const start = performance.now();

  if (!body.source || typeof body.source !== "string") {
    res.status(400).json({ error: "source is required" });
    return;
  }

  // 安全检查 — 禁止危险系统调用
  const forbidden = ["system(", "exec(", "popen(", "fork(", "__asm__", "asm("];
  for (const f of forbidden) {
    if (body.source.includes(f)) {
      res.json({
        compileOk: false,
        compileStderr: `Forbidden: source contains '${f}'`,
        runOk: null,
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: false,
        peakMemoryKb: null,
        wallMs: Math.round(performance.now() - start),
      } satisfies RunResponse);
      return;
    }
  }

  const jobId = randomUUID();
  const jobDir = path.join(WORK_DIR, jobId);

  try {
    await mkdir(jobDir, { recursive: true });
    const srcFile = path.join(jobDir, "main.cpp");
    const binFile = path.join(jobDir, "main");

    await writeFile(srcFile, body.source, "utf-8");

    // ── 编译阶段 ──────────────────────────────────────────
    const compileResult = await runProcess(
      "g++",
      ["-std=c++17", "-O2", "-Wall", "-o", binFile, srcFile],
      { timeout: COMPILE_TIMEOUT, cwd: jobDir },
    );

    if (compileResult.exitCode !== 0) {
      res.json({
        compileOk: false,
        compileStderr: compileResult.stderr,
        runOk: null,
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: compileResult.timedOut,
        peakMemoryKb: null,
        wallMs: Math.round(performance.now() - start),
      } satisfies RunResponse);
      return;
    }

    // ── 运行阶段 ──────────────────────────────────────────
    const runTimeout = body.timeoutMs ?? RUN_TIMEOUT;
    const runResult = await runProcess(binFile, [], {
      timeout: runTimeout,
      cwd: jobDir,
      stdin: body.stdin,
    });

    res.json({
      compileOk: true,
      compileStderr: compileResult.stderr,
      runOk: runResult.exitCode === 0,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      exitCode: runResult.exitCode,
      timedOut: runResult.timedOut,
      peakMemoryKb: null,
      wallMs: Math.round(performance.now() - start),
    } satisfies RunResponse);
  } catch (err) {
    res.status(500).json({
      compileOk: false,
      compileStderr: err instanceof Error ? err.message : "internal error",
      runOk: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      timedOut: false,
      peakMemoryKb: null,
      wallMs: Math.round(performance.now() - start),
    } satisfies RunResponse);
  } finally {
    // 清理临时文件
    await rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
});

// ── 工具函数 ──────────────────────────────────────────────

interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

function runProcess(
  cmd: string,
  args: string[],
  opts: { timeout: number; cwd: string; stdin?: string },
): Promise<ProcessResult> {
  return new Promise((resolve) => {
    const child = execFile(
      cmd,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeout,
        maxBuffer: 1024 * 1024, // 1MB
        killSignal: "SIGKILL",
      },
      (err, stdout, stderr) => {
        const timedOut = err?.killed === true;
        const exitCode = timedOut
          ? -1
          : err
            ? ((err as NodeJS.ErrnoException & { code?: number }).code ?? 1)
            : 0;

        resolve({
          stdout: stdout.slice(0, 64 * 1024), // 限制 64KB
          stderr: stderr.slice(0, 64 * 1024),
          exitCode: typeof exitCode === "number" ? exitCode : 1,
          timedOut,
        });
      },
    );

    if (opts.stdin && child.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }
  });
}

app.listen(PORT, () => {
  console.log(`cpp-runner listening on :${PORT}`);
});
