# 2026-04-29 Release Readiness and UI/UX Closure

## Scope

- Read and applied the relevant standards and plans: `standard/04-ui-ux.md`, `standard/05-frontend-engineering.md`, `standard/11-testing-quality.md`, `standard/14-deployment-ops.md`, `standard/15-performance-accessibility-print.md`, `standard/17-docs-plan-maintenance.md`, `standard/22-standard-adoption-and-audit.md`, `plan/uiux_plan.md`, `plan/step-05-coach-and-admin.md`, and `plan/step-06-deployment.md`.
- Checked current A2UI, shadcn/ui, and Radix guidance through Context7 before implementation. The resulting boundary remains: A2UI is the agent-facing design surface, while production pages continue to reuse local shadcn/Radix primitives and Round1 tokens.
- This record covers the final local UI/UX closure and local deployment-test readiness pass for the April 29 deployment test preparation. It is not a claim that the production domain, Caddy/TLS, PM2, database backup, Sentry, email DNS, or rollback exercises have been completed.

## UI/UX Changes

- Fixed a final CSS token compilation issue in frontend class names: Tailwind arbitrary values such as `rounded-[--radius-md]`, `z-[--z-modal]`, `shadow-[--shadow-glow]`, and `max-w-[--content-max-width]` now use explicit `var(--...)` syntax. The production CSS no longer emits invalid values such as `border-radius:--radius-md`, `z-index:--z-modal`, or `max-width:--content-max-width`.
- Added a global command panel in `client/src/components/layout/CommandBar.tsx`, opened by the desktop command trigger or `Cmd/Ctrl+K`. It uses the existing shadcn/Radix command dialog, role-aware navigation, and tokenized theme actions.
- Added the Admin dashboard entry to `adminNavItems` as `/admin` / `管理看板`, matching the UI/UX navigation contract.
- Expanded `AdminDashboard.tsx` from a link grid into an operational overview: question total, published prebuilt paper total, import batch total, user total, recent import activity, and API/DB/Redis health from `GET /api/v1/health`.
- Added a real `data-testid` root to `CoachReport` so the route can participate in browser visual regression checks.
- Fixed a time-sensitive Coach invite integration fixture that expired on 2026-04-29, changing it to a stable future date so the test remains deterministic.

## Browser Visual Acceptance

`server/__tests__/e2e/ui-visual-audit.spec.ts` now covers:

- Dashboard desktop/mobile overflow.
- Global command panel role-aware navigation into Admin dashboard.
- ExamNew catalog rendering and confirmation dialog.
- Auth entry routes and not-found.
- Account routes: `/account/class`, `/join`, `/account/security`.
- Coach routes: `/coach/classes`, `/coach/classes/:id`, `/coach/assignments`, `/coach/report`.
- Admin routes: `/admin`, `/admin/questions`, `/admin/papers`, `/admin/imports`, `/admin/review`, `/admin/users`, `/admin/settings`.
- ExamResult reduced-motion ceremony and A4 print markers.
- A2UI Round1 BYOC gallery surface.
- UI Gallery V2 Recharts and data-background patterns.

## Automated Verification

- `npm run verify:ui-tokens`: passed, `verifyUiTokenUsage: ok (105 files checked)`.
- `npm run build:client`: passed. Vite still reports `/font/*.woff2` as runtime-resolved, which matches the current same-origin font proxy design. Vite also reports the existing large `UIGallery` chunk warning, which is acceptable for the local dev/visual-audit surface.
- `npm run build:server`: passed.
- `npm run client:test`: passed, 14 files / 75 tests.
- `npm run verify:offline-artifacts`: passed, `verifyOfflineArtifactNames: ok (137 files checked)`.
- `npm run lint`: exit 0, with the existing Fast Refresh warning in `client/src/components/a2ui/round1A2uiCatalog.tsx`.
- `npm run test:e2e -- ui-visual-audit.spec.ts`: passed, 10 tests.
- `npm run test -- server/__tests__/coach-classes.integration.test.ts`: passed, 9 tests after fixing the date-sensitive invite fixture.
- Production CSS scan after `build:client`: passed; no invalid CSS custom-property arbitrary values matching `max-width:--*`, `z-index:--*`, `border-radius:--*`, `box-shadow:--*`, `transition-duration:--*`, or related patterns were found in `client/dist/assets`.

## Local Environment Blockers

- `npm run test`: still blocked by local Redis not running at `127.0.0.1:4395`. The fresh run reported 26 passed files, 174 passed tests, 46 skipped tests, and Redis-dependent failures in `auth-integration`, `pow`, and `bullmq-dead-letter`.
- `npm run migrate:status`: blocked by local Postgres not running at `127.0.0.1:4397`.
- `npm run healthcheck -- --api-url http://127.0.0.1:7654/api/v1/health --frontend-url http://127.0.0.1:4399 --json`: failed because no local API/frontend server is running on those ports.
- `docker compose -f docker-compose.dev.yml up -d pg redis`: could not start because Docker Desktop / Docker daemon was not running (`dockerDesktopLinuxEngine` pipe missing).

## Deployment-Test Gate

Current code and UI are ready for the next deployment-test pass once the runtime environment is available. Before marking the release test green, run these on the target deployment host or after starting local infra:

```bash
docker compose -f docker-compose.dev.yml up -d pg redis
npm run migrate:status
npm run test
npm run healthcheck -- --api-url https://<domain>/api/v1/health --frontend-url https://<domain> --pm2
```

Production deployment still requires the Step 06 manual checks: domain and Cloudflare Full Strict, Caddy TLS/static cache headers, PM2 reload, `.env` permissions, backup/restore rehearsal, Sentry smoke, mail/Turnstile smoke, Redis degradation rehearsal, and rollback rehearsal.
