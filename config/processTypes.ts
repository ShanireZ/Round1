export const ROUND1_PROCESS_TYPES = {
  RUNTIME_WORKER: "runtime-worker",
  CONTENT_WORKER: "content-worker",
} as const;

export type Round1WorkerProcessType =
  (typeof ROUND1_PROCESS_TYPES)[keyof typeof ROUND1_PROCESS_TYPES];

export function ensureRound1ProcessType(defaultType: Round1WorkerProcessType) {
  process.env.ROUND1_PROCESS_TYPE ??= defaultType;
  return process.env.ROUND1_PROCESS_TYPE;
}

export function isRound1WorkerProcessType(processType: string | undefined): boolean {
  return (
    processType === ROUND1_PROCESS_TYPES.RUNTIME_WORKER ||
    processType === ROUND1_PROCESS_TYPES.CONTENT_WORKER
  );
}

export function resolveRound1DbApplicationName(processType: string | undefined): string {
  if (processType === ROUND1_PROCESS_TYPES.CONTENT_WORKER) {
    return "round1-content-worker";
  }

  if (isRound1WorkerProcessType(processType)) {
    return "round1-worker";
  }

  return "round1-api";
}
