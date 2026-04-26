/**
 * cpp-runner 沙箱配置
 *
 * 开发环境（Win11 + Docker Desktop）：loopback HTTP
 * 生产环境（Ubuntu 24.04）：Unix socket / Docker + gVisor
 */
import { env } from './env.js';

export const sandboxConfig = {
  /** cpp-runner 服务地址 */
  runnerUrl: env.SANDBOX_RUNNER_URL,
  /** Docker 镜像名 */
  runnerImage: env.SANDBOX_RUNNER_IMAGE,
  /** 运行时 (runsc / runc) */
  runnerRuntime: env.SANDBOX_RUNNER_RUNTIME,
  /** 编译超时 (ms) */
  compileTimeoutMs: env.SANDBOX_COMPILE_TIMEOUT_MS,
  /** 运行超时 (ms) */
  runTimeoutMs: env.SANDBOX_TIMEOUT_MS,
  /** 内存限制 (MB) */
  memoryMb: env.SANDBOX_MEM_MB,
  /** 进程数限制 */
  pidsLimit: env.SANDBOX_PIDS_LIMIT,
  /** HTTP 请求超时 (ms) — 包含编译+运行 */
  httpTimeoutMs: env.SANDBOX_COMPILE_TIMEOUT_MS + env.SANDBOX_TIMEOUT_MS + 5000,
} as const;

export interface CppRunnerRequest {
  source: string;
  stdin?: string;
  timeoutMs?: number;
}

export interface CppRunnerResponse {
  compileOk: boolean;
  compileStderr: string;
  runOk: boolean | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  peakMemoryKb: number | null;
  wallMs: number | null;
}
