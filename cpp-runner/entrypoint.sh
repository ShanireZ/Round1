#!/bin/sh
set -e

# cpp-runner 容器入口脚本
# 在 Docker 容器内以低权限用户运行 Node.js 服务

exec node /app/dist/server.js
