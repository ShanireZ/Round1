const path = require("node:path");

const root = __dirname;

function parseBooleanFlag(value) {
  return ["1", "true", "yes"].includes(String(value ?? "").trim().toLowerCase());
}

function parseInstances(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const apiInstances = parseInstances(process.env.ROUND1_PM2_API_INSTANCES, 2);
const enableRuntimeWorker = parseBooleanFlag(process.env.ROUND1_PM2_ENABLE_RUNTIME_WORKER);
const enableContentWorker = parseBooleanFlag(process.env.ROUND1_PM2_ENABLE_CONTENT_WORKER);

const apps = [
  {
    name: "round1-api",
    cwd: root,
    script: path.join(root, "dist/server/server/index.js"),
    interpreter: "node",
    instances: apiInstances,
    exec_mode: "cluster",
    autorestart: true,
    max_restarts: 10,
    min_uptime: "10s",
    restart_delay: 4000,
    kill_timeout: 35000,
    max_memory_restart: "1G",
    merge_logs: true,
    time: true,
    env: {
      NODE_ENV: "production",
      PORT: process.env.PORT ?? "5100",
    },
    env_production: {
      NODE_ENV: "production",
      PORT: process.env.PORT ?? "5100",
    },
  },
];

if (enableRuntimeWorker) {
  apps.push({
    name: "round1-runtime-worker",
    cwd: root,
    script: path.join(root, "dist/server/server/services/worker/worker.js"),
    interpreter: "node",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 10,
    min_uptime: "10s",
    restart_delay: 4000,
    kill_timeout: 35000,
    max_memory_restart: "512M",
    merge_logs: true,
    time: true,
    env: {
      NODE_ENV: "production",
      ROUND1_PROCESS_TYPE: "runtime-worker",
    },
    env_production: {
      NODE_ENV: "production",
      ROUND1_PROCESS_TYPE: "runtime-worker",
    },
  });
}

if (enableContentWorker) {
  apps.push({
    name: "round1-content-worker",
    cwd: root,
    script: path.join(root, "scripts/workers/contentWorker.ts"),
    interpreter: "node",
    node_args: "--import tsx/esm",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_restarts: 10,
    min_uptime: "10s",
    restart_delay: 4000,
    kill_timeout: 35000,
    max_memory_restart: "1G",
    merge_logs: true,
    time: true,
    env: {
      NODE_ENV: process.env.NODE_ENV ?? "production",
      ROUND1_PROCESS_TYPE: "content-worker",
    },
  });
}

module.exports = { apps };
