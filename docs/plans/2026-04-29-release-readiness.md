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
- Completed a second UI/UX copy and functional-page closure pass across ExamSession, ExamResult, Dashboard, Account, Coach, Admin, A2UI BYOC, and UI Gallery surfaces. User-visible implementation terms such as API endpoint paths, `runtime`, `payload`, `Attempt ID`, `Tab Nonce`, `owner`, `assignment-only`, raw import states, and English admin status labels were replaced with role-facing Chinese business copy while preserving the underlying API/data contracts.
- Completed a third UI/UX and functional-page closure pass across Login/AuthCallback/CompleteProfile, Dashboard, ExamNew/Session/Result, Account, Coach, Admin content/import/review/settings/users, command navigation, and sidebar navigation. Remaining raw enum/JSON field names are code/data-contract terms or developer-gallery examples, not production page copy.
- Completed a fourth navigation/accessibility closure pass: AppShell sidebar and mobile navigation now share the same role-aware navigation sections, student accounts no longer see Coach/Admin links, mobile AppShell gets a Sheet navigation trigger, Auth/App/Focus layouts expose skip-to-content, and the remaining AuthLayout/Sheet visible implementation copy was localized to user-facing Chinese.
- Completed a fifth account-security closure pass: login and account security now expose the enabled Passkey route, support browser WebAuthn login/binding/removal through `@simplewebauthn/browser`, use in-app dialogs for TOTP/Passkey destructive actions, and keep the server passkey summary limited to opaque credential row id, suffix, backup, and creation metadata.

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
- Role-aware AppShell navigation and mobile Sheet access.

## Automated Verification

- `npm run verify:ui-tokens`: passed, `verifyUiTokenUsage: ok (105 files checked)`.
- `npm run build:client`: passed. Vite still reports `/font/*.woff2` as runtime-resolved, which matches the current same-origin font proxy design. Vite also reports the existing large `UIGallery` chunk warning, which is acceptable for the local dev/visual-audit surface.
- `npm run build:server`: passed.
- `npm run client:test`: passed, 14 files / 77 tests.
- `npm run verify:offline-artifacts`: passed, `verifyOfflineArtifactNames: ok (137 files checked)`.
- `npm run lint`: exit 0, with the existing Fast Refresh warning in `client/src/components/a2ui/round1A2uiCatalog.tsx`.
- `npm run test:e2e -- ui-visual-audit.spec.ts`: passed, 11 tests.
- `npm run test -- server/__tests__/coach-classes.integration.test.ts`: passed, 9 tests after fixing the date-sensitive invite fixture.
- `npm run test`: passed after starting local Redis/Postgres, 29 files / 221 tests.
- `npm run migrate:status`: passed against local Postgres, 14/14 migrations applied.
- `npm run healthcheck -- --api-url https://127.0.0.1:7654/api/v1/health --frontend-url https://127.0.0.1:4399 --json`: passed after temporarily starting the local API and frontend dev servers; API reported db=ok and redis=ok.
- `npm run healthcheck -- --api-url https://127.0.0.1:7654/api/v1/health --frontend-url https://127.0.0.1:4399 --include-external --include-offline --runner-url http://127.0.0.1:4401/health --json`: passed for local config presence and offline runner health. This does not replace real mail delivery, Turnstile production, or PM2 checks on the target host.
- Production CSS scan after `build:client`: passed; no invalid CSS custom-property arbitrary values matching `max-width:--*`, `z-index:--*`, `border-radius:--*`, `box-shadow:--*`, `transition-duration:--*`, or related patterns were found in `client/dist/assets`.
- Second closure pass verification: `npm run verify:ui-tokens`, `npm run client:test`, `npm run build:client`, focused `npx eslint <touched UI/test files>`, focused `npx prettier --check <touched UI/doc/test files>`, `git diff --check`, and `npm run test:e2e -- ui-visual-audit.spec.ts` passed after the copy/localization changes. The UI Gallery visual-audit assertions were synchronized to the localized labels. The default sandbox still hits `spawn EPERM` for Vitest/Vite/Playwright subprocesses, so those commands were rerun with elevated permissions under the known local pattern.
- Third closure pass verification: `npm run verify:ui-tokens`, `npm run client:test`, `npm run build:client`, focused `npx eslint <touched UI/doc files>`, `git diff --check`, `npm run test:e2e -- ui-visual-audit.spec.ts`, and full `npm run test` passed. Default sandbox again hit `spawn EPERM` for tsx/Vite/Playwright subprocesses; the affected commands passed when rerun with the established elevated local pattern.
- Fourth closure pass verification: focused `npm run client:test -- src/lib/navigation.test.ts`, full `npm run client:test`, `npm run verify:ui-tokens`, `npm run build:client`, full `npm run lint`, focused `npx eslint <touched UI/e2e files>`, `git diff --check`, and `npm run test:e2e -- ui-visual-audit.spec.ts` passed. The first visual-audit run saw a transient Vite HMR WebSocket `ERR_NO_BUFFER_SPACE`; an immediate fresh rerun passed 11/11. The only lint output remains the pre-existing Fast Refresh warning in `client/src/components/a2ui/round1A2uiCatalog.tsx`.
- Fifth closure pass verification: `npm run client:test`, `npm run verify:ui-tokens`, `npm run build:client`, `npm run test -- server/__tests__/auth-integration.test.ts`, `npm run test:e2e -- ui-visual-audit.spec.ts`, and `git diff --check` passed. Default sandbox again hit the known `spawn EPERM` subprocess limit for Vite/Vitest/Playwright; the affected commands passed with the established elevated local pattern. The visual-audit helper now retries only the Playwright execution-context teardown race before checking horizontal overflow.

## Local Runtime Retest

- Docker Desktop was initially stopped. It was started locally, then `docker compose -f docker-compose.dev.yml up -d pg redis` brought the local Postgres and Redis services online.
- Final local container status: `r1-pg` healthy on `127.0.0.1:4397`, `r1-redis` healthy on `127.0.0.1:4395`, and the existing local `r1-cpp-runner` healthy on `127.0.0.1:4401`.
- The local API/frontend healthcheck used the development HTTPS certificates and temporarily set `NODE_TLS_REJECT_UNAUTHORIZED=0` only for the local self-signed certificate smoke. Do not use that setting for production validation.
- The API and frontend dev servers were started only for the healthcheck and stopped after the run.

## Deployment-Test Gate

Current code, UI, local DB/Redis-backed tests, local migration status, and local API/frontend healthchecks are green. Before marking the production deployment test green, run these on the target deployment host:

```bash
npm run migrate:status
npm run test
npm run healthcheck -- --api-url https://<domain>/api/v1/health --frontend-url https://<domain> --include-external --pm2
```

Production deployment still requires the Step 06 manual checks: domain and Cloudflare Full Strict, Caddy TLS/static cache headers, PM2 reload, `.env` permissions, backup/restore rehearsal, Sentry smoke, mail/Turnstile smoke, Redis degradation rehearsal, and rollback rehearsal.
