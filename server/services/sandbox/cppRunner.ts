/**
 * cpp-runner RPC 客户端 — 与 Docker 沙箱通信
 *
 * 仅供离线内容环境和内容校验脚本调用；生产运行时不部署也不依赖 cpp-runner。
 * 本地/离线环境下如果 runner 不可用，返回 stub 结果。
 */
import { sandboxConfig, type CppRunnerRequest, type CppRunnerResponse } from '../../../config/sandbox.js';
import { logger } from '../../logger.js';

const STUB_RESPONSE: CppRunnerResponse = {
  compileOk: false,
  compileStderr: '',
  runOk: null,
  stdout: '',
  stderr: 'runner_unavailable',
  exitCode: -1,
  timedOut: false,
  peakMemoryKb: 0,
  wallMs: 0,
};

/**
 * 健康检查
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${sandboxConfig.runnerUrl}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 编译并运行 C++ 代码
 */
export async function runCpp(request: CppRunnerRequest): Promise<CppRunnerResponse> {
  const isAvailable = await healthCheck();

  if (!isAvailable) {
    logger.warn('cpp-runner unavailable — returning stub response');
    return STUB_RESPONSE;
  }

  try {
    const res = await fetch(`${sandboxConfig.runnerUrl}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: request.source,
        stdin: request.stdin ?? '',
        timeoutMs: request.timeoutMs ?? sandboxConfig.runTimeoutMs,
      }),
      signal: AbortSignal.timeout(sandboxConfig.compileTimeoutMs + sandboxConfig.runTimeoutMs + 5000),
    });

    if (!res.ok) {
      const errorText = await res.text();
      logger.error({ status: res.status, body: errorText }, 'cpp-runner returned error');
      return {
        ...STUB_RESPONSE,
        compileOk: false,
        compileStderr: `Runner HTTP error: ${res.status}`,
      };
    }

    return (await res.json()) as CppRunnerResponse;
  } catch (err) {
    logger.error({ err }, 'cpp-runner call failed');
    return STUB_RESPONSE;
  }
}

/**
 * 验证 C++ 代码 — 编译、运行并与预期输出比对
 */
export async function verifyCpp(params: {
  source: string;
  sampleInputs: string[];
  expectedOutputs: string[];
}): Promise<{ verified: boolean; results: CppRunnerResponse[] }> {
  const results: CppRunnerResponse[] = [];

  if (params.sampleInputs.length === 0) {
    // 无样例输入 — 仅编译检查
    const result = await runCpp({ source: params.source });
    results.push(result);
    return { verified: result.compileOk === true, results };
  }

  for (let i = 0; i < params.sampleInputs.length; i++) {
    const result = await runCpp({
      source: params.source,
      stdin: params.sampleInputs[i],
    });
    results.push(result);

    if (!result.compileOk || !result.runOk) {
      return { verified: false, results };
    }

    // 比对输出
    const expected = (params.expectedOutputs[i] ?? '').trim();
    const actual = (result.stdout ?? '').trim();

    if (expected && actual !== expected) {
      logger.info(
        { testCase: i, expected, actual },
        'Output mismatch in sandbox verify',
      );
      return { verified: false, results };
    }
  }

  return { verified: true, results };
}
