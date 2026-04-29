# 2026-04-29 Deployment Second Readiness Check

## Scope

- 第二轮部署前检查覆盖 `standard/03-naming-and-structure.md`、`standard/07-data-and-migrations.md`、`standard/11-testing-quality.md`、`standard/13-config-env.md`、`standard/14-deployment-ops.md`、`standard/16-git-review-release.md`、`standard/17-docs-plan-maintenance.md`、`standard/22-standard-adoption-and-audit.md`、`standard/23-first-deployment-runbook.md`、`plan/step-06-deployment.md` 与 `docs/plans/2026-04-29-release-readiness.md`。
- 按仓库说明通过 Context7 复核 PM2 ecosystem/reload 与 Caddyfile/reverse_proxy/file_server/header 相关当前文档；本次实现仍以仓库脚本和现有部署模板为准。
- 本记录是本机第二轮部署检查和演练证据；真实域名、Cloudflare Full Strict、目标机 PM2、生产邮件/Turnstile/Sentry、系统防火墙和回滚仍必须在全新服务器上执行。

## Fixes Before The Gate

- 迁移文件名前缀从重复的 `009`/`010` 收口为严格递增 `001` 到 `014`，符合 `standard/03` 与 `standard/07`。
- `scripts/migrate.ts` 增加迁移 alias 兼容：历史库里已记录的旧 `schema_migrations.name` 不会导致重跑迁移；`up`、`status`、`down` 都能按 canonical name 或 alias 识别。
- paper slot points 迁移失败演练脚本改名为 `scripts/rehearsePaperSlotPointsMigrationFailure.ts`，npm script 改为 `migrate:rehearse:paper-slot-points-failure`，避免继续绑定旧迁移序号。
- `plan/step-06-deployment.md` 修正部署命令漂移：根包没有 `npm run build`，首次部署与回滚必须使用 `npm run build:client` 和 `npm run build:server`；迁移回滚命令改为 `npm run migrate:down` / `tsx scripts/migrate.ts down`。
- `standard/23-first-deployment-runbook.md` 的部署快照已从“迁移编号阻断”改为“编号已收口，历史记录通过 alias 兼容”。

## Verification Chain

- Runtime baseline: `node -v` returned `v24.15.0`; `npm -v` returned `11.12.1`.
- Docker baseline: `r1-pg` healthy on `127.0.0.1:4397`, `r1-redis` healthy on `127.0.0.1:4395`, and `r1-cpp-runner` healthy on `127.0.0.1:4401`.
- Formatting and drift guards:
  - `npx prettier --check <touched files>` passed.
  - Migration prefix duplicate scan returned no duplicate prefixes.
  - Old migration names only remain in explicit `aliases` exports.
  - `git diff --check` passed with Windows LF/CRLF warnings only.
- Static checks:
  - `npm run verify:offline-artifacts` passed, `137 files checked`.
  - `npm run verify:ui-tokens` passed, `106 files checked`.
  - `npm run lint` exited 0 with the existing Fast Refresh warning in `client/src/components/a2ui/round1A2uiCatalog.tsx`.
- Build and tests:
  - `npm run build:client` passed. The `/font/*.woff2` build-time unresolved hints match the current same-origin R2/Caddy runtime proxy design; the existing large `UIGallery` chunk warning remains non-blocking for deployment.
  - `npm run build:server` passed.
  - `npm run client:test` passed, 14 files / 79 tests.
  - `npm run test` passed, 29 files / 221 tests. The LLM fallback log in this run is a test fixture path, not a failing deployment signal.
- Migration checks:
  - `npm run migrate:status` passed, 14/14 applied.
  - `npm run migrate:up` returned `All migrations are up to date.`
  - `npm run migrate:rehearse:paper-slot-points-failure` observed the expected `paper_question_slots.points backfill incomplete` failure inside the rehearsal transaction.
- Deployment helper scripts:
  - `npm run env:init -- --profile production-runtime --print` passed. The generated local smoke secrets are throwaway evidence and must not be reused on the production host.
  - `npm run init:admin -- --help` passed and confirms the password is never printed.
  - `npm run healthcheck -- --help` passed and lists API, frontend, offline runner, PM2, external provider, and worker checks.

## Deployment Rehearsal

- Caddy:
  - `caddy version` returned `v2.10.0`.
  - `caddy adapt --config Caddyfile.example --adapter caddyfile` passed.
  - `caddy validate --config Caddyfile.example --adapter caddyfile` parsed the config but failed on Windows while trying to create `/var/log/caddy/round1-access.json`; validate must be rerun on the target Linux host after the log directory exists.
- PM2:
  - Local `pm2 -v` is unavailable, so real PM2 process checks were not run on this machine.
  - `node -e "require('./ecosystem.config.cjs')"` confirmed the default app resolves to `round1-api` at `dist/server/server/index.js`.
- Production-shape smoke:
  - Started `node dist/server/server/index.js` with `NODE_ENV=production`, `PORT=7654`, `ROUND1_BIND_HOST=127.0.0.1`.
  - Started `vite preview` from `client/dist` on `https://127.0.0.1:4400`.
  - `npm run healthcheck -- --api-url http://127.0.0.1:7654/api/v1/health --frontend-url https://127.0.0.1:4400 --include-offline --json` passed: API readiness passed with `db=ok, redis=ok`, frontend returned 200, and offline runner returned 200.
  - Mail, Turnstile, PM2, and optional content worker checks were intentionally skipped in this local smoke and remain target-host checks.
  - The local self-signed frontend preview required temporary `NODE_TLS_REJECT_UNAUTHORIZED=0`; do not use that setting in production validation.
  - After the rehearsal, `7654`/`4400` listeners and PowerShell jobs were clear.
- Backup/restore:
  - Host `pg_dump`, `pg_restore`, and `psql` were not installed, so the rehearsal used the Postgres 18 container tools.
  - `pg_dump` produced a custom-format dump inside `r1-pg`, `pg_restore` restored it into a unique temporary database, and `psql` verified `users=58` and `schema_migrations=14`.
  - The temporary restore database and temporary dump were removed after the check.

## Target Host Gate

Before treating first production deployment as green on the new server:

- Rerun `npm ci`, `npm run build:client`, `npm run build:server`, `npm run migrate:status`, `npm run migrate:up`, `npm run test`, and `npm run client:test` on the target deployment revision.
- Install PM2, start/reload `ecosystem.config.cjs --env production`, then run `npm run healthcheck -- --api-url https://<domain>/api/v1/health --frontend-url https://<domain> --include-external --pm2`.
- Run `caddy validate` on the real Caddyfile after `/var/log/caddy` exists and verify TLS/headers/cache behavior from the public domain.
- Run production `pg_dump` to `data/backups`, restore into a temporary database, verify core table counts and `schema_migrations`, then remove the temporary database.
- Smoke real mail delivery, Turnstile, CppLearn OIDC configuration, Sentry event capture/sanitization, Redis degradation, rollback, keyboard/reduced-motion/manual browser checks, and print preview on the real domain.
