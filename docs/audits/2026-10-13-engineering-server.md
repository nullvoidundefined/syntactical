# Engineering audit: server/ (2026-10-13)

Scope: `server/` only (`src`, `migrations`, `scripts`, `ci-fixture`, `Dockerfile`, `DEPLOY.md`, `package.json`, vitest configs). Client, `pipeline/`, and `packages/` are covered by other agents. Goal: cleanup, simplification, and refactor opportunities ranked by value-to-effort, with correctness and security notes recorded in passing.

Effort: S under 1 hour, M half a day, L multi-day. Confidence: HC = high confidence (evidence read and cross-checked), SP = speculative (plausible, needs the named confirmation).

## Ranked cleanup opportunities (top 10 by value-to-effort)

| #   | Finding                                                                                                                                         | Effort | Confidence | Section                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------- |
| 1   | One shared `sendError(res, status, code, message)`; delete the three local copies and the 14 inline `res.locals as { requestId }` casts         | S      | HC         | Duplication D1              |
| 2   | Extract `changePassword` service out of `routes/mePassword.ts`; reuse the `FOR UPDATE` hash re-check from `createPasswordSession`               | M      | HC         | Layering L1, Duplication D2 |
| 3   | Shared rate-limit key functions (`byUser`, `byIp`, `byEmail`) replacing 13 identical lambdas                                                    | S      | HC         | Duplication D3              |
| 4   | Drop the duplicate CI jobs: `ci.yml` and `server.yml` both run server typecheck, unit, and integration on every server PR                       | S      | HC         | Testing T1                  |
| 5   | Move `PasswordHashSlots` interface to `services/passwordHashSlots.ts`; `services/verifyUserPassword.ts` currently imports a type from `routes/` | S      | HC         | Layering L2                 |
| 6   | Move `src/clients/fakePasswordBreachClient.ts` to `src/testing/`; it ships in the production `dist` today                                       | S      | HC         | Dead code DC1               |
| 7   | One `createTestApp` helper and one shared `SKIP_DATABASE_TESTS`; the five `createXTestApp` wrappers and 50 identical skip constants             | M      | HC         | Testing T2                  |
| 8   | Remove or use `PUBLIC_BASE_URL`: required and validated at boot, documented as "the one source for absolute URLs", read by nothing              | S      | HC         | Dead code DC2, Runbook R1   |
| 9   | Fold `POLICY_MESSAGES` (two copies) and the two `acceptPolicy`/`checkPasswordPolicy` call shapes into one `passwordPolicyError` helper          | S      | HC         | Duplication D4              |
| 10  | Replace the `(res.locals.logger ?? logger)` fallback (8 sites) with one `requestLog(res)` accessor, or make the fallback unnecessary            | S      | HC         | Inconsistency I3            |

Items 1, 3, 5, 6, 8, 9 together are one afternoon and remove roughly 120 lines of repeated code with no behavior change. Item 2 is the only one that touches a security-sensitive path (password change) and should go as its own high-risk PR with the existing `mePassword*.integration.test.ts` files as the lock.

## Coverage

| Surface                                                                                   | How checked                                                                                                                                             | Notes                                                                                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `server/src` (app, routes, middleware, services, clients, config, schemas, types, errors) | read in full; `npm run typecheck -w server` executed (clean)                                                                                            | every non-test file read                                                                                                 |
| `server/src/__tests__` unit suite                                                         | executed: `npm test -w server -- --silent`: 48 files, 393 tests, all pass in 6.0 s                                                                      |                                                                                                                          |
| `server/src/__tests__` integration suite                                                  | read only (harness, helpers, 6 sample test files); not executed                                                                                         | needs Docker or `TEST_DATABASE_URL`; dispatch said not to run it without a database; CI runs it (`server.yml`, `ci.yml`) |
| `server/migrations`                                                                       | read in full; not executed                                                                                                                              | `migrations.test.ts` runs the real `migrate:up`/`migrate:down` subprocess in CI                                          |
| `server/scripts`                                                                          | read in full; `deployToRailway.sh`, `fetchPinnedCommit.sh`, `copyContent.mjs` executed through their unit tests                                         | `checkImageHealth.sh`, `scanImageForKeys.sh`, `stageBuildContent.sh`, `start.sh` read only                               |
| `server/Dockerfile`, `Dockerfile.dockerignore`                                            | read only                                                                                                                                               | not built locally                                                                                                        |
| `server/DEPLOY.md`                                                                        | read in full, cross-checked against scripts, Dockerfile, `env.ts`                                                                                       |                                                                                                                          |
| Lint                                                                                      | executed: `npx oxlint server`: 0 errors, 1 warning                                                                                                      |                                                                                                                          |
| Formatting                                                                                | executed: `npx prettier --check "server/src/**/*.ts"`: 62 files differ                                                                                  | documented policy, see I6                                                                                                |
| Dependencies                                                                              | executed: `npm outdated -w server`                                                                                                                      |                                                                                                                          |
| Credential scan                                                                           | executed, content-free (`grep -l`, `grep -c`): server working tree 0 files, git history (all refs, `server/` paths) 0 lines, no `.env*` under `server/` | one scanner false positive, see S1                                                                                       |
| Client app, `pipeline/`, `packages/`                                                      | not covered                                                                                                                                             | out of scope by dispatch                                                                                                 |

## Executive summary

The server is small (about 5,000 non-test lines), consistently layered (routes delegate to services, services take a `Database` or `pg.PoolClient`, no ORM), and well tested (393 unit tests plus a real-Postgres integration suite that CI runs). Typecheck and lint are clean. The three recent `fix(server)` commits each changed a test. The credential sweep is clean.

The cleanup value is in repetition, not design: the same error-response boilerplate appears 34 times, the same rate-limit key lambda 13 times, the same test skip constant 50 times, and five near-identical test-app factories exist. One route (`mePassword.ts`) carries inline SQL and a hand-rolled transaction that every other route delegates to a service. One service imports a type from `routes/`. One test-only fake ships in the production build. One required environment variable is read by nothing.

Top three priorities:

1. Shared `sendError` and rate-limit key helpers (items 1, 3): mechanical, zero risk, biggest line count.
2. Delete the duplicate CI jobs (item 4): every server PR runs the integration suite twice.
3. Extract the password-change transaction into a service (item 2): the one layering break in a security path.

## Operational basics

| Check                                 | Status                                                                                                                                       |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests run and pass               | yes (393/393, executed)                                                                                                                      |
| Integration tests hit a real database | yes: `globalSetup.ts` starts `postgres:17` or uses `TEST_DATABASE_URL`; CI provides a service container (`server.yml:20-32`, `ci.yml:47-57`) |
| CI green on this branch               | not checked (no PR for this worktree); `server.yml` and `ci.yml` both gate PRs to `main`                                                     |
| Typecheck                             | yes, clean                                                                                                                                   |
| Health endpoints                      | `/health` (liveness) and `/health/ready` (DB probe), `routes/health.ts`                                                                      |
| Rollback plan                         | `migrate:down` exists and every migration has a `down`; `DEPLOY.md` has no rollback section (see R3)                                         |
| Error tracking / monitoring           | pino structured logs with redaction; no external error tracker; out of scope for this cleanup audit but noted                                |

No blockers.

## Dead code and dead configuration

**DC1. Test fake ships in the production build.** HC, S.
`src/clients/fakePasswordBreachClient.ts` has no non-test importer (grep: only `__tests__/` files and `createAuthTestApp.ts`). `tsconfig.build.json` excludes only `src/__tests__` and `src/testing`, so this file is compiled into `dist/clients/` and copied into the runtime image (`Dockerfile:52`). Fix direction: move it to `src/testing/fakePasswordBreachClient.ts` and update the six test imports. To confirm: `ls server/dist/clients` after a build. Risk: none; `startServer.ts:80` already refuses an injected client outside `NODE_ENV=test`.

**DC2. `PUBLIC_BASE_URL` is validated and never read.** HC, S.
`config/env.ts:51` requires it (`httpsUrl`, refuses credentials, query, fragment); `env.ts:66` stubs it; `DEPLOY.md:15` calls it "the one source for absolute URLs"; `middleware/dropForwardedHeaders.ts:5` says absolute URLs come from it. No code reads `env.PUBLIC_BASE_URL` (grep over `src/` excluding tests: three hits, all definitions or comments). The sign-in email holds no link (`clients/emailClient.ts:3`). Fix direction: either delete the schema entry, the stub, the DEPLOY row, and the comment, or keep it only if a feature is about to use it. To confirm: owner intent; the `httpsUrl` validator (`env.ts:13-23`) is the only non-trivial code that would go. Risk: removing a required variable from the schema loosens boot validation for a value nobody uses; Railway variables can stay set harmlessly.

**DC3. `PACKAGE_NAME` export exists only to be asserted by a vacuous test.** HC, S.
`src/index.ts:7` exports a constant; `__tests__/index.test.ts:3-6` imports it and asserts it equals itself. The comment on `index.ts:36` explains the real purpose: proving an import of the entrypoint starts nothing. Fix direction: keep the import-smoke test, drop the constant and the equality assertion, or assert on a side effect (no listening socket). Risk: none.

**DC4. Webhook path exemptions in two middleware are unreachable in production.** HC, S.
`middleware/csrfGuard.ts:16,33` and `middleware/requireJson.ts:13,22` exempt `/v1/webhooks/` by prefix. `app.ts:89-93` mounts the webhook router (or the 503 stub) before both middleware, so a webhook request never reaches them unless neither `webhooks` nor `webhooksDisabled` is set, in which case the request falls through to 404 anyway. The exemptions are belt-and-braces, not dead in the strict sense, but the duplicated literal is. Fix direction: one `WEBHOOK_MOUNT_PATH` in `constants/webhooks.ts` used by `app.ts` and both guards. Risk: none.

No unused dependencies: all 11 `dependencies` and both non-`@types` `devDependencies` (`pg-connection-string`, `supertest`) have importers.

## Duplication

**D1. Error-response boilerplate, 34 call sites.** HC, S.
`errors.ts:60-67` builds the body; every caller then repeats the status, the locals cast, and the `.json`. Three routes define an identical local helper:

```ts
// routes/authPasswordSessions.ts:37-40, routes/authSignups.ts:54-57, routes/mePassword.ts:51-54
function sendError(res: Response, status: number, code: ErrorCode, message: string): void {
  const { requestId } = res.locals as { requestId: string };
  res.status(status).json(createErrorResponse(code, message, requestId));
}
```

Every other route and middleware inlines the same four lines, for example `routes/me.ts:40`, `routes/adminAccess.ts:54-57`, `routes/answerEvents.ts:59-61`, `routes/banks.ts:41-43`, `middleware/requireSession.ts:61-64`, `middleware/rateLimit.ts:43-46`, `middleware/requireAdmin.ts:17-19`, `middleware/csrfGuard.ts:40-43`, `routes/disabledWebhook.ts:16-19`. Fix direction: export `sendError` from `errors.ts` (it already owns the shape), delete the three copies, replace the inline sites. `createErrorResponse` stays for the one caller that passes `details` (`answerEvents.ts:110`). Risk: none; the integration tests assert on status and `error.code` throughout.

**D2. `SELECT password_hash ... FOR UPDATE` then compare-to-expected, twice.** HC, part of item 2.
`services/createPasswordSession.ts:25-31` and `routes/mePassword.ts:137-143` both lock the user row, read `password_hash`, and bail when it differs from the hash read earlier. Fix direction: `lockUserPasswordHash(client, userId): Promise<string | null | undefined>` in services, used by both; or fold it into the `changePassword` service extraction (L1).

**D3. Rate-limit key lambdas, 13 copies of three shapes.** HC, S.

```ts
// by user: routes/adminAccess.ts:31, answerEvents.ts:37, answerEvents.ts:47, me.ts:28, mePassword.ts:63
keyOf: (_req, res) => String((res.locals.session as { userId: string }).userId),
// by ip: routes/authCodes.ts:42, authSessions.ts:56, authPasswordSessions.ts:63, authSignups.ts:91
keyOf: (req) => req.ip ?? 'unknown',
// by email: routes/authCodes.ts:48, authSessions.ts:62, authPasswordSessions.ts:69, authSignups.ts:90
keyOf: (_req, res) => String(res.locals.email),
```

Fix direction: `middleware/rateLimitKeys.ts` exporting `keyOfUser`, `keyOfIp`, `keyOfEmail`. `authSignups.ts:90-91` already does this locally. Risk: none.

**D4. `POLICY_MESSAGES` and the policy-check call shape.** HC, S.
`routes/authSignups.ts:45-49` and `routes/mePassword.ts:40-44` are byte-identical maps; `authSignups.ts:107-114` wraps the lookup in `acceptPolicy` while `mePassword.ts:101-105` inlines it. Fix direction: `services/checkPasswordPolicy.ts` already owns the codes; have it return the message too, or export one `passwordPolicyMessage(code)`.

**D5. Small constants defined in several places.** HC, S each.

- `const HOUR_MS = 3_600_000` in `constants/auth.ts:4`, `constants/sync.ts:2`, `constants/admin.ts:2`, `services/ingestAnswerEvents.ts:16`.
- `const TIMEZONE_MAX_LENGTH = 64` with the same comment in `schemas/authSchemas.ts:10-11` and `schemas/meSchemas.ts:8-9`.
- `type Queryable` as `Pick<pg.PoolClient, 'query'>` in `services/deleteRateLimitCountersForEmail.ts:12` and as `Database | pg.PoolClient` in `services/readProfile.ts:13`; `interface HealthDb` in `routes/health.ts:10-12` is a third DB shape.
- `REVENUECAT_EVENTS.ENTITLEMENT_SOURCE` and `REVENUECAT_EVENTS.PROVIDER` are both `'revenuecat'` (`constants/revenueCatEvents.ts:4,20`).
- `const { now = () => new Date() } = x` four times in `app.ts:113,135,141,146`.
- `res.set('Cache-Control', 'private, no-store')` inline middleware in `routes/banks.ts:26-29` and `routes/adminAccess.ts:39-42`.

Fix direction: one `constants/time.ts` (`HOUR_MS`, `DAY_MS`), one `Queryable` in `clients/database.ts`, one `noStore` middleware. Risk: none.

## Over-abstraction

**O1. `readStoredHash` returns `{ hash }` for one caller.** HC, S. `routes/mePassword.ts:71-77` wraps a nullable string in an object to distinguish "no row" from "null hash"; `rows[0]?.password_hash` with an explicit `rows.length === 0` check reads more directly. Goes away with L1.

**O2. One-type-per-file in `types/`.** SP, S. Twelve files; `LockedUser`, `UpdateProfileResult`, `IngestResult`, `PasswordHashParams`, `AdminProductEntry` each have one or two importers and could live beside their producing service. This is a convention choice, not a defect; flagged only because the dispatch asked.

Nothing else qualifies. The `Deps` interfaces per route group (`authDeps.ts`, `syncDeps.ts`, etc.) and the `createXRouter(deps)` factories are the injection seam the integration tests use; they earn their keep.

## Dependency direction

Inferred layering: `app.ts` -> `routes/` -> `middleware/`, `schemas/`, `services/` -> `clients/`, `constants/`, `types/`, `errors.ts`. Routes own HTTP (status, cookies, `res.locals`); services own SQL and take a `Database` or `pg.PoolClient`; clients wrap `pg`, Resend, HIBP. This holds everywhere except:

**L1. `routes/mePassword.ts` owns SQL and a transaction.** HC, M.
`readStoredHash` (71-77), `isSessionFresh` (79-86), and the `withTransaction` body (136-161, four queries) are inline in the route. Every comparable path delegates: `authPasswordSessions.ts:102` -> `createPasswordSession`, `adminAccess.ts:59` -> `setAdminAccess`, `answerEvents.ts:85` -> `ingestAnswerEvents`. Smaller instances: `routes/authSignups.ts:126-134` (`hasLiveCode`), `routes/signOut.ts:25` (revoke UPDATE), `middleware/requireAdmin.ts:13-15` (is_admin SELECT). Fix direction: `services/changePassword.ts` taking `{ userId, sessionId, storedHash, newHash, now }` and returning `'saved' | 'changed' | 'session-gone'`, plus `services/hasLiveCode.ts` and `services/revokeSession.ts`. To confirm: the ordering comment at `mePassword.ts:1-11` is the spec; keep it on the service. Risk: high-risk PR (auth); the four `mePassword*.integration.test.ts` files (1,623 lines) are the lock.

**L2. `services/verifyUserPassword.ts:9` imports a type from `routes/authDeps.ts`.** HC, S.
`interface PasswordHashSlots { run<T>(...) }` is declared at `routes/authDeps.ts:9-11` while the implementation `createPasswordHashSlots` is at `services/passwordHashSlots.ts:24`, which exports no type. Fix direction: declare and export the interface from `services/passwordHashSlots.ts`; `authDeps.ts` imports it. Risk: none.

**L3. `schemas/` and `services/` import each other.** HC, S, low value.
`schemas/authSchemas.ts:5` -> `services/normalizeEmail`, `schemas/meSchemas.ts:6` -> `services/isValidTimeZone` (values); `services/updateProfile.ts:10`, `ingestAnswerEvents.ts:9`, `listAnswerEvents.ts:7` -> `schemas/*` (types only). No runtime cycle, and TypeScript resolves it, but the inferred-type dependency means a schema change can break a service signature silently. Fix direction: declare `MeUpdate`, `AnswerEventInput`, `AnswerEventCursor` in `types/` and have the schemas satisfy them, or accept the cycle and note it. Risk: none.

## Oversized files and functions

Top 10 non-test files by lines, with a verdict on splitting:

| Lines | File                              | Split?                                                                                                      |
| ----- | --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 211   | `routes/authSignups.ts`           | yes, via L1-style service extraction (`hasLiveCode`, the verify transaction at 191-198 is already services) |
| 183   | `routes/mePassword.ts`            | yes, L1                                                                                                     |
| 177   | `services/passwordHash.ts`        | no; one cohesive module (encode, parse, bounds, derive)                                                     |
| 163   | `app.ts`                          | no; mostly wiring, but the four `now` defaults (D5) and the parser-skip middleware (C1) could move out      |
| 153   | `startServer.ts`                  | no                                                                                                          |
| 118   | `config/env.ts`                   | no                                                                                                          |
| 116   | `routes/answerEvents.ts`          | no; shrinks with D1/D3                                                                                      |
| 113   | `routes/authPasswordSessions.ts`  | no; shrinks with D1/D3                                                                                      |
| 106   | `routes/revenueCatWebhook.ts`     | no                                                                                                          |
| 99    | `services/recordPurchaseEvent.ts` | no                                                                                                          |

Largest test files: `authSignups.integration.test.ts` 921, `mePassword.integration.test.ts` 874, `authPasswordSessions.integration.test.ts` 782, `mePasswordGuards.integration.test.ts` 749. These shrink with T2.

## Inconsistent patterns

**I1. Two request-validation shapes.** HC, S.
Auth routes validate in a middleware that stashes into `res.locals` so a per-email rate limit can run between validation and the handler (`authCodes.ts:25-34`, `authSessions.ts:35-48`, `authPasswordSessions.ts:46-55`, `authSignups.ts:63-74`). Everything else calls `safeParse` inline (`me.ts:48`, `mePassword.ts:90`, `answerEvents.ts:57,78`, `adminAccess.ts:52`, `revenueCatWebhook.ts:81`). Both are justified by ordering, but the four middleware are near-identical. Fix direction: one `validateBody(schema, (data, res) => void)` factory; `authSignups.ts:63` already has `createValidator`.

**I2. `res.locals` typed by ad-hoc cast at every read.** HC, M.
About 20 `res.locals as { requestId: string; session: {...} }` casts; only `mePassword.ts:46-49` declares a `SessionLocals` interface. Fix direction: one `Locals` interface in `middleware/` and `Response<unknown, Locals>` on handlers, or a `readSession(res)` accessor. Risk: none; purely type-level.

**I3. `(res.locals.logger ?? logger)` fallback at 8 sites.** HC, S.
`routes/deleteMe.ts:35`, `authCodes.ts:67`, `authSignups.ts:102-104`, `mePassword.ts:108`, `revenueCatWebhook.ts:96`, `health.ts:24`, `middleware/errorHandler.ts:25,44,70`. `middleware/requestLogger.ts:12` always sets `res.locals.logger`, so in `createApp` the fallback is dead; it exists for tests that mount a router without the middleware. Fix direction: one `requestLog(res, fallback)` in `clients/logger.ts`, or guarantee the middleware in tests and drop the fallback.

**I4. Timezone validation differs by route.** SP, S.
`schemas/authSchemas.ts:19,26,36` accept any string up to 64 characters and the services silently drop an unknown zone (`upsertUserByEmail.ts:21`, `createPasswordSession.ts:35`); `schemas/meSchemas.ts:17` refuses an unknown zone with 400. Probably deliberate (a bad device zone must not block sign-in). To confirm: owner intent; if deliberate, one comment on `authSchemas.ts` saying so.

**I5. `.strict()` on some body schemas, not others.** HC, S.
`adminSchemas.ts:12` and `meSchemas.ts:19` refuse unknown fields; `authSchemas.ts:16-37` strip them. Harmless (zod strips), but a client sending `isAdmin: true` to `/v1/auth/signups` gets 202 while sending it to `PATCH /v1/me` gets 400. Fix direction: pick one; `.strict()` everywhere is the safer default.

**I6. Formatting drift: 62 of the server's TypeScript files fail `prettier --check`.** HC, documented override.
`src/testing/*` and `src/__tests__/integration/*` are 4-space; the rest is 2-space; `.prettierrc.mjs:16` grants 4-space only to `pipeline/` and `packages/progress/`. `.prettierrc.mjs:6` says "Format only the files you touch", so this is a known, accepted state, not a violation. Recorded so the next reader does not reformat 62 files in a cleanup PR by accident. Breakdown: 22 `__tests__/routes`, 10 `__tests__/integration`, 8 `services`, 3 `routes`, 3 `testing`, 2 `middleware`, 1 `schemas`, 13 other test dirs.

**I7. `@types/node` major differs across workspaces.** HC, S. Server pins `^22.20.5` (matches the `node:22` image); root has `^26.6.4`. Not wrong, but two copies are installed. To confirm: whether any root tooling needs 26.

## Database

**DB1. Migration hygiene.** HC. Sixteen migrations, timestamp-ordered, each with a `down`; `migrations.test.ts` runs `migrate:up` and `migrate:down` as real subprocesses. Migrations 011 and 012 add columns and an index that 013 removes entirely (`1790985600013_drop-incremental-progress-columns.js`). Do not squash: staging and production have applied them (`DEPLOY.md:68-73`), and `node-pg-migrate` tracks by name. Note only.

**DB2. `rate_limit_counters` purge scans by `window_start` on every limited request.** SP, S.
`middleware/rateLimit.ts:15-23` runs `DELETE ... WHERE window_start < $2 FOR UPDATE SKIP LOCKED` inside every increment. The only index is the primary key `(key, window_start)` (`1790985600008_create-rate-limit-counters.js:15`), which does not lead with `window_start`, so this is a sequential scan. Today the table is bounded (distinct keys times at most two windows), so it is cheap. To confirm: `EXPLAIN` on staging; if row counts grow past a few thousand, add an index on `window_start` or move the purge to a periodic statement. Risk: an extra index costs a write per increment.

**DB3. `requireSession` writes on every authenticated request.** SP, M.
`middleware/requireSession.ts:47-52` is `UPDATE sessions SET last_used_at = $2 ... RETURNING`, so every `GET /v1/me`, every bank download, and every answer-event page is a row write plus WAL. Correct and simple; at current traffic it does not matter. To confirm: Neon write metrics. If it matters later, add `AND last_used_at < $2 - interval '5 minutes'` with a `SELECT` fallback, which bounds writes to one per session per five minutes.

**DB4. `readProfile` runs four sequential queries inside an array literal.** HC, S.
`services/readProfile.ts:56-60`:

```ts
const [dailyGoal, progress, entitlements] = [
  await readGoal(queryable, userId, today),
  await readProgress(queryable, userId),
  await readEntitlements(queryable, userId),
];
```

Reads like `Promise.all` but is sequential. Sequential is required when `queryable` is a transaction client (`updateProfile.ts:42`), so the behavior is right; the shape is misleading. Fix direction: three plain `const` lines with a one-line comment on why not `Promise.all`.

**DB5. No N+1.** HC. `listAdminAccess.ts:17-20` does `rows.find` inside a `map` (O(products x rows), both tiny). `ingestAnswerEvents.ts:71-88` inserts a batch with one `unnest`. `recomputeDailyProgress.ts:44-49` replaces rows with one `unnest`.

**DB6. Indexes implied by WHERE clauses are present.** HC. `sessions(token_hash)` unique, `sessions(user_id)`, `one_time_codes(email)`, `entitlements(user_id, product_id)` unique, `purchase_events(user_id)`, `answer_events(user_id, received_at, event_id)` and `(user_id, answered_at)`. `verifyOneTimeCode.ts:34-41` orders by `created_at` within one email; rows per email are capped by invalidation, so the `email` index suffices.

**DB7. Queries built from input: none.** HC. Every query is parameterized; the one interpolation is a numeric constant (`createDatabasePool.ts:62`). Scratch-database names in tests are random hex (`createScratchDatabase.ts:45`).

**DB8. Pool handling.** HC. `withTransaction.ts` releases with the error on rollback failure (destroys the client), installs and removes a per-checkout error listener, and scopes timeouts with `set_config(..., true)`. `createDatabasePool.ts` sets `idle_in_transaction_session_timeout` on connect and listens for idle-client errors. `startServer.ts:131-147` ends the pool on listen failure and on close. Nothing to fix.

## API design

Status codes and the `{ data }` envelope are consistent; the one exception (`GET /v1/banks/:language/:difficulty` returns raw bank bytes) is documented at `routes/banks.ts:1-3`. Error bodies always carry `code`, `message`, `requestId`.

**A1. Body-parser 4xx errors lose their specific code.** HC, S. `middleware/errorHandler.ts:64-68` maps any error with a 4xx `status` to `INPUT_CLIENT_ERROR` "Invalid request". body-parser's `encoding.unsupported` (415) and `charset.unsupported` (415) therefore answer 415 with `INPUT_CLIENT_ERROR` rather than `INPUT_UNSUPPORTED_MEDIA_TYPE`. Clients switch on `code` (`errors.ts:1`), so the two 415 paths look different to them. Fix direction: map `type` for those two the way `entity.too.large` and `entity.parse.failed` are mapped at 51-62.

**A2. Collapsible scaffolds.** SP, M. `authSessions.ts` and `authPasswordSessions.ts` share the perIp -> validate -> perEmail -> handler -> `sendSessionResponse` shape; `authCodes.ts` and the start half of `authSignups.ts:136-160` share the issue-code flow verbatim (lines 142-159 against `authCodes.ts:59-73`). A `createIssueCodeHandler(deps)` used by both removes about 20 lines. Lower priority than D1-D4.

## Correctness and security notes (in passing)

**C1. The sync-upload parser skip matches the path exactly; Express routes loosely.** SP, S.
`app.ts:98-106` skips the 10 KB global JSON parser only when `req.path === SYNC.UPLOAD_PATH` (`'/v1/answer-events'`). Express 5 routes case-insensitively and tolerates a trailing slash, so `POST /v1/answer-events/` or `/v1/Answer-Events` reaches the route after the 10 KB parser has already consumed the body; the route's own 256 KB parser (`answerEvents.ts:69`) is then a no-op. Effect: a legitimate upload between 10 KB and 256 KB with a trailing slash gets 413. Fails closed, not open. To confirm: a test posting 20 KB to `/v1/answer-events/`. Fix direction: mount the sync router before the global parser the way the webhook router is (`app.ts:89-93`), or normalize the comparison.

**C2. Railway health check is liveness, not readiness.** SP, decision for the owner.
`DEPLOY.md:54` sets `healthcheckPath: /health`; `Dockerfile:72` likewise. `routes/health.ts:19-21` returns 200 without touching the database. A container whose pool cannot reach Neon stays "healthy" and keeps receiving traffic that then 503s. Switching to `/health/ready` means a Neon outage restarts the service up to `restartPolicyMaxRetries: 5`, which may be worse. Record the trade-off in `DEPLOY.md` either way.

**C3. `verifyOneTimeCode.test.ts` mocks `node:crypto` and counts `timingSafeEqual` calls.** SP, S.
`vi.mock('node:crypto', ...)` at 10-13 and `expect(timingSafeEqualSpy).toHaveBeenCalledTimes(2)` at 49. This asserts an implementation detail (which function compared). The integration test `verifyOneTimeCode.integration.test.ts` already covers the behavior (one attempt counted, match consumes the code). The other `toHaveBeenCalledTimes` uses (`passwordHash.test.ts`, `passwordHashSlots.test.ts`, `authCodes.integration.test.ts:128`) assert "exactly one derivation" or "never derives", which are the security properties and are fine.

**C4. Lint warning.** HC, S. `__tests__/routes/authPasswordSessionsEnumeration.integration.test.ts:123`: `(first?.body as ...).error?.code` under `no-unsafe-optional-chaining`. `first` is destructured from a non-empty array; a `const [first] = responses; if (!first) throw` guard clears it.

**S1. Secret-scanner false positive, recorded per the role's rule.** HC, S.
While dumping `server/src/testing/*.ts` for this audit, the session's secret-scan hook matched `src/testing/startTestContainer.ts:70`, a template literal that builds the throwaway container's admin URL from a passphrase generated at run time (`setupTestDatabase.ts:62`, `randomBytes(24)`). No real credential exists: the value is random per run and the container is removed after. The raw source line did land in this session's transcript. Nothing to rotate. Optional: build the URL with `new URL()` and `url.password = passphrase` so credential-shaped literals never appear in source and scanners stop firing on it.

Nothing else found. Specifically checked and clean: CSRF (header plus origin, bearer exempt), cookie flags, session hashing, timing-safe compares, rate-limit key HMAC, log redaction, scrypt parameter bounds, webhook auth before body read, TLS enforcement in production, no secret on any argv in scripts, `.dockerignore` allow-list matches what the Dockerfile copies.

## Testing

**T1. Server checks run twice on every server PR.** HC, S.
`ci.yml` (`on: pull_request` to `main`, no path filter) runs `typecheck:workspaces` and `test:workspaces` (lines 38-42, which include the server) and a `server-integration` job (44-69). `server.yml` (path-filtered) runs `typecheck -w server`, `test -w server`, and `test:integration -w server` (40-45). A PR touching `server/` therefore runs the 393 unit tests, the typecheck, and the Postgres integration suite twice. `ci.yml` also uses `actions/checkout@v4` unpinned (60) while `server.yml` pins by SHA (34-35). Fix direction: delete the `server-integration` job from `ci.yml` and exclude the server from the `workspaces` job, or delete the `test` job from `server.yml` and keep `image`. To confirm: branch-protection required-check names before removing either. Risk: a required check that no longer runs blocks every merge.

**T2. Test fixtures are copy-pasted.** HC, M.

- `const SKIP_DATABASE_TESTS = process.env.SKIP_DOCKER_TESTS === '1' && !process.env.TEST_DATABASE_URL;` is identical in 50 files.
- `insertUser` is defined in 8 test files with 5 different signatures; `signIn` in 5.
- `createBanksTestApp.ts` (30 lines), `createSyncTestApp.ts` (34), `createWebhookTestApp.ts` (43), `createAdminTestApp.ts` (87), `createAuthTestApp.ts` (128) each redeclare `ALLOWED_ORIGIN`, `SECRET_BYTES`, a `TestClock`, and a silent pino; they differ only in which `createApp` keys they pass.
  Fix direction: `integration/skipWithoutDatabase.ts` exporting the constant; `integration/createTestApp.ts` taking `{ pool, auth?, sync?, banks?, admin?, webhooks? }` and returning `{ app, clock, secrets }`; `integration/insertUser.ts` with the superset signature. Risk: 50-file import churn; mechanical.

**T3. Integration suite is real.** HC. Each file creates its own scratch database and runs the migrations through the real `npm run migrate:up` (`createMigratedDatabase.ts:15`), truncates between tests, and drops on teardown. No mocking of `pg` anywhere in `__tests__/routes` or `__tests__/services/*.integration.test.ts`. The unit suite mocks only `db.query` on health/CORS probes and the `node:crypto` spy in C3.

**T4. Unit tests that shell out take 8 of the 12 seconds of test time.** HC, note only. `deployToRailway.test.ts` (3.7 s) and `fetchPinnedCommit.test.ts` (4.5 s) create git repositories per case. Acceptable; they are the only coverage for those scripts.

**T5. Bug-fix discipline.** HC. Three `fix(server)` commits in the last 60 (`b379063`, `164efbb`, `dd79cd3`); each modified at least one test file. No unpaired fixes.

## Dependencies and supply chain

`npm outdated -w server`: `express` 5.2.1 -> 5.3.0, `resend` 6.32.0 -> 6.32.1, `zod` 4.6.5 -> 4.6.7 (all within `^`); majors available: `vitest` 3 -> 5, `typescript` 6 -> 7, `@types/node` 22 -> 26 (see I7). No known-CVE check was run (no `npm audit` in scope of this dispatch; CI does not run it either). Lockfile is used by both Dockerfile stages with `npm ci`.

## Deployment and infrastructure

Dockerfile, `.dockerignore`, `start.sh`, and `DEPLOY.md` agree with each other: build from root with the allow-list context, three stages, non-root runtime, `HEALTHCHECK` on `/health`, `CMD` runs migrations then `exec node dist/index.js`, `DATABASE_MIGRATION_URL` falls back to `DATABASE_URL` (`start.sh:10`, `DEPLOY.md:13`). `checkImageHealth.sh` proves migrations ran, non-root, and clean SIGTERM; `scanImageForKeys.sh` has a self-test. This is in good shape.

## Runbook-vs-code drift

**R1. `PUBLIC_BASE_URL`.** `DEPLOY.md:15` describes a purpose no code implements (DC2). Direction: doc ahead of code. P3.

**R2. `DEPLOY.md:73` states both environments "currently run with ALLOW_STUBBED_INTEGRATIONS=true and the six stubs".** Dated 2026-10-04 and unverifiable from the repository. Direction: unknown. P3; replace with "check `/health/ready`" rather than a point-in-time claim.

**R3. No rollback section.** `DEPLOY.md` covers deploy, first-time setup, and post-deploy checks; it does not say how to roll back a bad image (Railway redeploy of the previous deployment) or a bad migration (`migrate:down` exists in `package.json:7` and every migration has a `down`, but nothing says when it is safe). P2 for a production runbook.

No contradiction found between `DEPLOY.md` and `env.ts`, `start.sh`, `Dockerfile`, or the scripts on variable names, ports, paths, or health endpoints.

## Workspace hygiene

Not checked beyond the worktree: this dispatch runs inside `.claude/worktrees/narrow-app-config-allowlist-57d11e` and was told not to leave it. The parent repository is at `production/syntactical`; other worktrees under `.claude/worktrees/` are expected and are not duplicates.

## Tech debt register

| Item                                                 | Risk                      | Note                                    |
| ---------------------------------------------------- | ------------------------- | --------------------------------------- |
| Inline SQL and transaction in `routes/mePassword.ts` | medium                    | only layering break on an auth path; L1 |
| `PUBLIC_BASE_URL` required but unused                | low                       | DC2                                     |
| Test fake in production `dist`                       | low                       | DC1                                     |
| Duplicate CI jobs                                    | low, costs minutes per PR | T1                                      |
| Write per authenticated request in `requireSession`  | low today                 | DB3                                     |
| Sequential-scan purge in rate limiter                | low today                 | DB2                                     |
| Liveness-only Railway health check                   | low, owner decision       | C2                                      |
| 62 files off the formatter                           | none, documented          | I6                                      |

## Prioritized recommendations

| Rank | Action                                                                                                                             | Impact | Effort |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| 1    | Shared `sendError`, rate-limit key helpers, `POLICY_MESSAGES`, `HOUR_MS`, `noStore`: one mechanical PR (D1, D3, D4, D5)            | M      | S      |
| 2    | Remove the duplicate CI jobs (T1)                                                                                                  | M      | S      |
| 3    | Move the fake breach client to `src/testing`; move `PasswordHashSlots` type to services (DC1, L2)                                  | M      | S      |
| 4    | Extract `changePassword` service from `mePassword.ts`; share the hash re-check with `createPasswordSession` (L1, D2); high-risk PR | H      | M      |
| 5    | Decide `PUBLIC_BASE_URL`: delete or use; fix `DEPLOY.md:15` (DC2, R1)                                                              | L      | S      |
| 6    | One `createTestApp`, one skip constant, one `insertUser` (T2)                                                                      | M      | M      |
| 7    | Add a rollback section to `DEPLOY.md` (R3)                                                                                         | M      | S      |
| 8    | Map body-parser 415 errors to `INPUT_UNSUPPORTED_MEDIA_TYPE` (A1); test the trailing-slash upload (C1)                             | L      | S      |
| 9    | Typed `Locals` for `res.locals` (I2); `requestLog(res)` accessor (I3)                                                              | L      | M      |
| 10   | Decide liveness vs readiness for the Railway health check and record it (C2)                                                       | L      | S      |
