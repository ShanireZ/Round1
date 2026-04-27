# cpp-runner — C++ 编译执行沙箱
#
# 多阶段构建：
# 1. builder: 安装依赖、编译 TypeScript
# 2. runner: 最小运行时 + g++ 编译器

# ── 构建阶段 ──────────────────────────────────────────────
FROM node:24.15.0-slim AS builder

WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npx tsc && npm prune --omit=dev

# ── 运行阶段 ──────────────────────────────────────────────
FROM node:24.15.0-slim AS runner

# 安装 g++ 编译器
RUN apt-get update && \
    apt-get install -y --no-install-recommends g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/package.json ./
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# 创建非 root 用户
RUN groupadd -r runner && useradd -r -g runner -s /bin/false runner
USER runner

# 创建临时工作目录
RUN mkdir -p /tmp/cpp-runner

ENV PORT=6100
ENV WORK_DIR=/tmp/cpp-runner
ENV COMPILE_TIMEOUT_MS=10000
ENV RUN_TIMEOUT_MS=1000

EXPOSE 6100

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://localhost:6100/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/entrypoint.sh"]
