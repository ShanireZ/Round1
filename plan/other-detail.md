# Detail

---

## mkcert 安装

### 用 winget 安装

winget install FiloSottile.mkcert

### 安装本地 CA

mkcert -install

### 生成证书

cd D:\WorkSpace\Round1
mkdir certs
mkcert -key-file certs/key.pem -cert-file certs/cert.pem localhost 127.0.0.1 ::1

## PostgreSQL 18 + Redis（Docker Desktop）

> 前提：Windows 11 + WSL2 + Docker Desktop 已安装并运行。

### docker-compose（推荐）

在项目根目录创建了 `docker-compose.dev.yml`，一键拉起：

```powershell
cd D:\WorkSpace\Round1
docker compose -f docker-compose.dev.yml up -d
```

当前 compose 只把 Postgres、Redis 与 cpp-runner 发布到 `127.0.0.1`。如果本地旧 `pgdata` volume 曾使用 `/var/lib/postgresql` 作为挂载点，切到官方 `/var/lib/postgresql/data` 后需要执行一次 `docker compose -f docker-compose.dev.yml down -v` 重建本地开发数据。

停止 / 销毁：

```powershell
docker compose -f docker-compose.dev.yml down          # 停止，保留数据
docker compose -f docker-compose.dev.yml down -v        # 停止 + 删除 volume（慎用）
```

查看日志：

```powershell
docker compose -f docker-compose.dev.yml logs -f pg     # 仅 PostgreSQL
docker compose -f docker-compose.dev.yml logs -f redis   # 仅 Redis
```

### 单容器方式（不想用 compose 时）

```powershell
# PostgreSQL 18
docker run -d --name r1-pg `
  -p 127.0.0.1:5432:5432 `
  -e POSTGRES_DB=round1 `
  -e POSTGRES_USER=round1 `
  -e POSTGRES_PASSWORD=round1_dev `
  -v r1-pgdata:/var/lib/postgresql/data `
  postgres:18

# Redis 8 (Alpine)
docker run -d --name r1-redis `
  -p 127.0.0.1:6379:6379 `
  -v r1-redisdata:/data `
  redis:8-alpine redis-server --save 60 1 --loglevel warning
```

### 验证连接

```powershell
# PostgreSQL — 应输出 round1
docker exec r1-pg psql -U round1 -d round1 -c "SELECT current_database();"

# Redis — 应输出 PONG
docker exec r1-redis redis-cli ping
```

### .env 对应配置

```env
DATABASE_URL=postgres://round1:round1_dev@127.0.0.1:5432/round1
REDIS_URL=redis://127.0.0.1:6379
```

## 启动开发

cd D:\WorkSpace\Round1
npm run dev:client # → https://round1.local:5173/dev/ui-gallery（证书缺失时为 HTTP）
