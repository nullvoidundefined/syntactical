# Engineering audit (cross-cutting): 2026-10-13

Scope: workspace and build configuration, dependencies, test strategy, `packages/progress`, docs and runbook drift, workspace hygiene, and git-history signal. Line-level review of the app, `server/`, and `pipeline/` code is covered by separate audits and is not repeated here.

Repository age at audit: 15 days (first commit 2026-09-28), 173 commits, 158 PRs. Branch audited: `claude/syntactical-engineering-audit-25871a` at `9efd81d`.

Effort scale: S under 1 hour, M half a day, L multi-day. Confidence: HIGH-CONFIDENCE (evidence shown settles it) or SPECULATIVE (evidence suggests it; a named check would settle it).

## Ranked cleanup opportunities

Ranked by value divided by effort.

| #   | Opportunity                                                                                                                                                                                                                                                                                                             | Effort                       | Confidence | Section                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------- | --------------------------- |
| 1   | Delete the `test` job in `.github/workflows/server.yml`; it reruns, verbatim, what `ci.yml` already runs on every PR (server typecheck, unit, and integration tests with a Postgres service).                                                                                                                           | S                            | HIGH       | Build and CI, B1            |
| 2   | Point `api.syntactical.dev` and `staging-api.syntactical.dev` at Railway, or change the defaults. Neither hostname resolves, yet `app.config.ts`, `eas.json`, and the handoff doc treat them as live.                                                                                                                   | S (owner, DNS)               | HIGH       | Docs drift, D1              |
| 3   | Rewrite or delete the stale docs that now contradict the code: `README.md`, `docs/stack.md`, `docs/user-stories/README.md`, `docs/feature-list/features.md`, `docs/lexicon.md`, `docs/session-handoff/session-handoff.md`.                                                                                              | M                            | HIGH       | Docs drift, D2 to D7        |
| 4   | Remove the harness meta-tests that pin the past (`scripts/__tests__/packageScripts.test.ts` asserts the exact `build` script string and that Vite files are absent; `ciWorkflow.test.ts` regex-tests YAML). Keep the two that guard a product invariant (`publicContentTree`, `paidContentRef`).                        | S                            | HIGH       | Test strategy, T1           |
| 5   | Hoist the duplicated dev tooling to the root: `vitest` (declared 4 times), `@types/node` (`^22` in 4 workspaces, `^26` at root, 4 separate installs), `typescript` (root and server). Fix `@types/jest@30` against `jest@29`.                                                                                           | S                            | HIGH       | Dependencies, P1            |
| 6   | Decide the 60% coverage rule: it is in the shared conventions and enforced nowhere (no `coverageThreshold` in `jest.config.js`, no `coverage` block in any vitest config). Enforce it or write the override into the project `CLAUDE.md`.                                                                               | S to decide, M to make green | HIGH       | Test strategy, T2           |
| 7   | Trim `packages/progress`: 7 of 17 public exports have no consumer outside the package; `services/progress/findGoalForDate.ts` reimplements the package's private `findGoal`; the default daily goal lives in two app-side constants instead of beside `DAILY_GOALS`.                                                    | S                            | HIGH       | packages/progress, G1 to G3 |
| 8   | Prune the workspace: 28 git worktrees (several locked, on branches whose PRs merged weeks ago), 279 local branches of which 141 are already merged into `origin/main`, 163 remote branches. Main checkout sits on `feat/javascript-path`.                                                                               | S                            | HIGH       | Workspace hygiene, W1       |
| 9   | Make `lint` and `prettier --check` mean something: 53 oxlint warnings pass CI (0 errors), and 341 files fail `prettier --check`. One formatting commit plus `.git-blame-ignore-revs`, then `--deny-warnings` after the 53 are cleared.                                                                                  | M                            | HIGH       | Code quality, Q1, Q2        |
| 10  | Close the CI gaps: `typecheck:e2e` runs nowhere in CI; `e2e.yml`'s path filter skips `constants/`, `config/`, `scripts/`, `content/`, and the Metro, Babel, and Tailwind configs, all of which change the web build; `ci.yml` and `deploy.yml` use floating `@v4` action tags while the other three workflows pin SHAs. | S                            | HIGH       | Build and CI, B2 to B4      |

Two further structural signals from the git history (section H) are worth a design conversation rather than a cleanup ticket: six of the sixteen pipeline `fix:` commits are about unwrapping model JSON from prose or fences, and five of the seventeen app `fix:` commits are about accessible names for answer choices.

## Coverage

| Surface                                                                                                                                                                                                                                                                                                                                              | How checked                                                                              | Note                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root `package.json`, `tsconfig.json`, `jest.config.js`, `jest.setup.ts`, `vitest.config.ts`, `eas.json`, `.gitignore`, `.oxlintrc.json`, `.prettierrc.mjs`, `babel.config.js`, `metro.config.js`                                                                                                                                                     | read                                                                                     |                                                                                                                                                                                                                                                                |
| Workspace manifests and tsconfigs (`packages/progress`, `packages/content-schema`, `pipeline`, `server`)                                                                                                                                                                                                                                             | read                                                                                     |                                                                                                                                                                                                                                                                |
| `scripts/*.mjs`, `scripts/__tests__/*`, `config/*`                                                                                                                                                                                                                                                                                                   | read; `npx jest scripts/__tests__ config/__tests__` executed (19 suites, 74 tests, pass) |                                                                                                                                                                                                                                                                |
| `.github/workflows/*.yml`, `.github/actions/check-api-image/action.yml`                                                                                                                                                                                                                                                                              | read                                                                                     |                                                                                                                                                                                                                                                                |
| `server/Dockerfile`, `server/Dockerfile.dockerignore`, `server/scripts/*`                                                                                                                                                                                                                                                                            | read                                                                                     | Image build not executed (Docker side effects; CI runs it).                                                                                                                                                                                                    |
| Root type check, e2e type check                                                                                                                                                                                                                                                                                                                      | executed: `npx tsc --noEmit` (clean), `npx tsc --noEmit -p e2e` (clean)                  |                                                                                                                                                                                                                                                                |
| `npm run lint`                                                                                                                                                                                                                                                                                                                                       | executed: 53 warnings, 0 errors                                                          |                                                                                                                                                                                                                                                                |
| `npx prettier --check .`                                                                                                                                                                                                                                                                                                                             | executed: 341 files differ                                                               |                                                                                                                                                                                                                                                                |
| `npm run typecheck:workspaces`                                                                                                                                                                                                                                                                                                                       | executed, clean                                                                          |                                                                                                                                                                                                                                                                |
| `npm test -w @syntactical/progress`                                                                                                                                                                                                                                                                                                                  | executed: 15 files, 77 tests, pass                                                       |                                                                                                                                                                                                                                                                |
| Root `npm test` (jest, 233 files), pipeline and server vitest suites, Playwright                                                                                                                                                                                                                                                                     | not executed                                                                             | Other audits cover them; the root vitest config starts a Postgres container on any run. `npx jest --listTests` counted 233 files.                                                                                                                              |
| `npm ls --depth=0` per workspace, `npm outdated`                                                                                                                                                                                                                                                                                                     | executed                                                                                 | No extraneous, missing, or invalid entries.                                                                                                                                                                                                                    |
| `packages/progress/src/**`                                                                                                                                                                                                                                                                                                                           | read in full; consumers found with grep across app and server                            |                                                                                                                                                                                                                                                                |
| Docs: `README.md`, `docs/stack.md`, `server/DEPLOY.md`, `docs/session-handoff/session-handoff.md`, `docs/user-stories/*`, `docs/feature-list/features.md`, `docs/lexicon.md` (head and term list), `docs/device-checklist.md` (structure and runs), `docs/launch-placeholders.md` (structure), `docs/security-reviews/*.json` (status fields via jq) | read                                                                                     | `docs/superpowers/*` listed by size only.                                                                                                                                                                                                                      |
| DNS for `api.syntactical.dev`, `staging-api.syntactical.dev`, `syntactical.dev`                                                                                                                                                                                                                                                                      | executed (`dig +short`)                                                                  |                                                                                                                                                                                                                                                                |
| Git history: 60-day log, fix-commit pairing, blob sizes, ignored-but-tracked files                                                                                                                                                                                                                                                                   | executed                                                                                 |                                                                                                                                                                                                                                                                |
| Credential exposure scan, repository (git history all refs, working tree)                                                                                                                                                                                                                                                                            | executed, count-only: 0 matching lines, 0 files                                          |                                                                                                                                                                                                                                                                |
| Credential exposure scan, home-directory surfaces (session transcripts, shell history, vendor CLI configs)                                                                                                                                                                                                                                           | not covered                                                                              | The auto-mode permission classifier denied the count-only scan of `~/.claude/projects/*.jsonl`, shell history, and vendor CLI config files ("Credential Exploration"). The owner should run the role's pattern list against those paths in their own terminal. |
| Generated trees                                                                                                                                                                                                                                                                                                                                      | none in this repository                                                                  | `services/content/*.generated.ts` are checked for drift by `ci.yml`.                                                                                                                                                                                           |

Note on the secret-scan hook: while grepping `server/src/config/env.ts` for variable names, the PostToolUse hook flagged the adjacent names `RESEND_API_KEY:` and `REVENUECAT_WEBHOOK_AUTH:` in the output as a credential. The output held names only, no values. No rotation is needed; the hook's regex matches `NAME: NEXT_NAME:` sequences.

## Executive summary

The build, test, and deploy machinery is unusually complete for a 15-day-old repository: strict TypeScript everywhere, three test runners each scoped to the tree they suit, integration tests on a real Postgres, Playwright against the real API, a hardened image build with a key scan and a health run, and a content drift check in CI. Type checks and the harness tests pass locally. There is no `TODO`, no stray `console.log`, no commented-out code, nothing tracked that `.gitignore` names, and nothing larger than `package-lock.json` in history.

The cost of that pace is drift and duplication at the edges. One CI job is a full duplicate. The docs were written for the 2026-10-02 shape of the project (three languages, no server, no e2e suite) and have not followed the 120 PRs since; the handoff and the deploy runbook disagree with each other and with DNS about whether the API hostnames exist. Dev tooling is declared four times over with split `@types/node` majors. Lint and Prettier both run and both are non-blocking in practice. The 60% coverage rule is unmeasured. And the working copy carries 28 worktrees and 279 local branches.

Top three priorities:

1. Fix or retarget the API hostnames (D1). A production or preview build today points at a host that does not resolve.
2. Delete the duplicate CI job and close the three CI gaps (B1 to B4). Cheapest win, removes a full server test matrix from every server PR.
3. Replace the stale docs with current ones or delete them (D2 to D7). Every one of them is on the path a new session reads first.

## Operational basics

| Basic                       | State                                                                                                                                                                                               | Blocker             |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| Tests run                   | Yes. 233 jest files, 224 vitest files across four workspaces, 8 Playwright specs.                                                                                                                   | no                  |
| CI green on this branch     | Not checked from this worktree (no `gh` run inspection in scope). Type check, lint, harness tests, and progress tests pass locally.                                                                 | no                  |
| E2E wired to a trigger      | Yes, `e2e.yml` on pull requests, with a path filter (see B3).                                                                                                                                       | no                  |
| Monitoring / error tracking | Health endpoints (`/health`, `/health/ready`) checked by the image HEALTHCHECK and Railway. No error tracker (Sentry or similar) in any manifest. PostHog is product analytics, not error tracking. | no, but note        |
| Rollback plan               | Production deploys are manual (`workflow_dispatch`), staging on push. No written rollback step in `server/DEPLOY.md`; Railway's redeploy-previous is the implied path.                              | no, but note        |
| Coverage minimum enforced   | No. See T2.                                                                                                                                                                                         | no, decision needed |

## Build and CI

### B1. `server.yml` `test` job duplicates `ci.yml` (HIGH-CONFIDENCE, S)

`.github/workflows/ci.yml` runs, on every PR: the `workspaces` job (`npm run typecheck:workspaces`, `npm run test:workspaces` with `SKIP_DOCKER_TESTS=1`) and the `server-integration` job (`npm run test:integration -w server` against a `postgres:17` service). `.github/workflows/server.yml` `test` job runs, on server-touching PRs: `npm run typecheck -w server`, `npm test -w server`, `npm run test:integration -w server` against an identical `postgres:17` service. Every step of the second is a subset of the first.

Fix direction: delete the `test` job from `server.yml`, keeping its `image` job. To confirm: nothing depends on the job name `test` (branch protection required checks).

### B2. `typecheck:e2e` is defined and never run (HIGH-CONFIDENCE, S)

`package.json` has `"typecheck:e2e": "tsc --noEmit -p e2e"`; root `tsconfig.json` excludes `e2e`; no workflow calls `typecheck:e2e`. `npx tsc --noEmit -p e2e` passes today, so the gap is latent, not failing.

Fix direction: add `npm run typecheck:e2e` to the `check` job in `ci.yml` or to `e2e.yml`.

### B3. `e2e.yml` path filter skips inputs to the web build (HIGH-CONFIDENCE, S)

`e2e.yml` triggers on `app/**`, `components/**`, `state/**`, `services/**`, `clients/**`, `server/**`, `packages/**`, `e2e/**`, `app.config.ts`, `package.json`, `package-lock.json`. Not listed: `constants/**` (the app config and grammar list), `config/**` (the Metro resolver and query client), `scripts/**` (route entries and SPA fallback the e2e web host serves), `content/**`, `metro.config.js`, `babel.config.js`, `tailwind.config.js`, `global.css`. A change to any of those ships without a browser run.

Fix direction: add the missing paths, or drop the filter and accept the 20-minute job on every PR.

### B4. Action pinning is inconsistent (HIGH-CONFIDENCE, S)

`ci.yml` and `deploy.yml` use `actions/checkout@v4` and `actions/setup-node@v4`; `e2e.yml`, `server.yml`, and `server-deploy.yml` pin `@11d5960a...` and `@49933ea5...` with version comments. Pick one. The pinned form is the one the deploy path already uses.

### B5. Root `build` builds `@syntactical/progress` for no consumer (SPECULATIVE, S)

`"build": "npm run content:build && npm run build -w @syntactical/progress && expo export ..."`. Metro resolves `@syntactical/progress` through the `react-native` export condition to `./src/index.ts` (`packages/progress/package.json` `exports`), and no script under `scripts/` or `server/scripts/` imports the package (grep: none). `content:build` builds `content-schema` because `scripts/buildContentManifest.mjs` imports it from Node. The progress build step looks like a leftover.

To confirm: remove the step, run `npm run build`, and check `dist/` is byte-identical.

### B6. Three vitest configs with one alias block pasted three times (HIGH-CONFIDENCE, S)

`vitest.config.ts`, `pipeline/vitest.config.ts`, `server/vitest.config.ts`, and `server/vitest.integration.config.ts` each define the same `resolve.alias` for the two shared packages. The root config also lists `globalSetup: ['server/src/__tests__/integration/globalSetup.ts']`, so any `npx vitest run` from the root, including one scoped to `packages/progress`, starts a throwaway Postgres container first (comment in the file says so). That is a Docker side effect attached to a unit-test command.

Fix direction: a `vitest.workspace.ts` (or `projects`) at the root that references the four per-workspace configs, with the integration project the only one that carries `globalSetup`; or a shared `vitest.alias.ts` imported by all four. To confirm: the TDD harness (`tdd.sh`) resolves the root config by path; check what it expects.

### B7. JavaScript build and deploy scripts are outside every type check (HIGH-CONFIDENCE, S)

Root `tsconfig.json` includes `**/*.ts` and `**/*.tsx` only; `expo/tsconfig.base` sets `allowJs` but nothing sets `checkJs`. Unchecked: `scripts/assertNoPaidBanks.mjs`, `scripts/buildContentManifest.mjs`, `scripts/copySpaFallback.mjs`, `scripts/writeRouteEntries.mjs`, `server/scripts/copyContent.mjs`, `config/resolveWorkspaceRequest.js`, `pipeline/runners/*/harness.mjs`, `pipeline/runners/typescript/tsHelpers.js`. Several are on the deploy path (the image content copy, the paid-bank guard). They have tests, which is why this is S rather than P1.

Fix direction: `// @ts-check` at the top of each plus `checkJs` in the root tsconfig, or convert `scripts/*.mjs` to `.ts` run through `tsx` (already a devDependency; `content:build` already uses it).

### B8. No Node version pin (HIGH-CONFIDENCE, S)

No `engines` in `package.json`, no `.nvmrc`. CI uses `node-version: 22`; the Dockerfile pins `node:22.21.1-bookworm-slim`; the handoff says the pipeline needs 22.18 or later (#86); this machine runs 22.23.1. Add `"engines": { "node": ">=22.18" }` and a `.nvmrc`.

### B9. `jest.config.js` and `vitest.config.ts` both at the root: justified (HIGH-CONFIDENCE)

Jest runs the Expo app tree (jest-expo presets, native and web projects); Vitest runs the four Node workspaces. `docs/stack.md` records why (no maintained React Native preset for Vitest). The split is correct; the duplication is in the config bodies (B6), not the runner choice.

## Dependencies

`npm ls --depth=0 --workspaces --include-workspace-root` reports no extraneous, invalid, or missing packages. `npm outdated` (report only):

| Package             | Current | Latest  | Where                                    |
| ------------------- | ------- | ------- | ---------------------------------------- |
| `@types/node`       | 22.20.5 | 26.6.5  | four workspaces (root already on 26)     |
| `vitest`            | 3.2.7   | 5.0.4   | four workspaces                          |
| `typescript`        | 6.0.3   | 7.0.2   | root and server                          |
| `parse5`            | 7.3.0   | 8.0.1   | pipeline                                 |
| `@anthropic-ai/sdk` | 0.131.0 | 0.133.0 | pipeline                                 |
| `express`           | 5.2.1   | 5.3.0   | server                                   |
| `zod`               | 4.6.5   | 4.6.7   | pipeline, server (two separate installs) |
| `resend`            | 6.32.0  | 6.32.1  | server                                   |

### P1. Dev tooling declared per workspace with split majors (HIGH-CONFIDENCE, S)

`vitest@^3.2.7` is in `packages/progress`, `packages/content-schema`, `pipeline`, and `server`. `@types/node@^22.20.5` is in all four while root has `@types/node@^26.6.4`, so npm installs four nested copies (`packages/*/node_modules/@types/node`, `pipeline/node_modules/@types/node`, `server/node_modules/@types/node`). `typescript@~6.0.3` is in root and `server`. `zod@^4.6.5` is nested under both `pipeline/node_modules` and `server/node_modules` rather than hoisted. Root has `@types/jest@^30.0.0` against `jest@^29.7.0`.

Fix direction: move `vitest`, `@types/node`, and `typescript` to root `devDependencies` only, align `@types/node` on one major, and set `@types/jest` to `^29`. To confirm: `jest-expo@57` peer range for `@types/jest`; whether Expo tooling pins `@types/node`.

### P2. `expo-status-bar` is a direct dependency with no import and no dependent (HIGH-CONFIDENCE, S)

Zero imports across the repo; `npm ls expo-status-bar` shows nothing depends on it. `docs/stack.md` says it "was added by `expo install` for Expo Router's defaults". Remove it.

`expo-linking`, `react-native-screens`, `react-native-web`, and `react-native-css-interop` also have zero direct imports but are peers of `expo-router`, `expo`, and `nativewind`; they stay.

### P3. `react-native-reanimated`: one import, fifteen mocks (SPECULATIVE, S)

The only source import is `state/useIsReducedMotion.ts`; fifteen test files mock it. NativeWind 4 lists it as a peer, so it cannot be dropped, but the hook could use `AccessibilityInfo.isReduceMotionEnabled` from React Native and the mocks could go. To confirm: whether NativeWind actually loads it at runtime on web (if it does, the mock in `jest.setup.ts` stays and the per-file mocks still go).

### P4. Two schema-validation styles (HIGH-CONFIDENCE, informational)

`packages/content-schema` validates with hand-written predicates (`isRecord`, `isTextWithin`, `findBankEntryProblem`, ...) and returns a `{ isValid, rule }` result; `pipeline` and `server` validate with `zod@4`. The content-schema style is deliberate (it ships into the app bundle; no zod there) and documented by its file names. Not a finding, recorded so the next auditor does not re-raise it.

No two HTTP clients, no two date libraries, no deprecated packages found.

## Test strategy

Runner map: Jest (`jest.config.js`, two projects) owns `app/`, `components/`, `state/`, `services/`, `clients/`, `config/`, `scripts/__tests__/`, `constants/`: 233 files. Vitest owns `packages/content-schema` (25 files), `packages/progress` (15 files), `pipeline` (86 files), `server` (98 files; integration tests split into `vitest.integration.config.ts`). Playwright owns `e2e/specs` (8 specs).

E2E against the project conventions: auth (`signInSync.spec.ts`: sign-in, claim, sync; sign-out with unsynced answers), happy path (`guestRound.spec.ts`), error states (`apiOutage.spec.ts`: sign-in and paid banks during an outage, recovery), plus keyboard navigation, reduced motion, modal overlays, account deletion, paid bank gating. Screen-reader checks are in Jest (`jest-axe` in the `*.web.test.tsx` files), not Playwright. Coverage of the convention list is complete.

Directories with source and no dedicated test file, after checking sibling `__tests__` folders: `services/admin/` (`describeProduct.ts`, `parseAccessEntry.ts`; exercised through `app/__tests__/adminRoute*.test.tsx`), `server/src/schemas/` (5 files; exercised through route tests). No directory is untested outright.

### T1. Harness meta-tests that pin the past (HIGH-CONFIDENCE, S)

`scripts/__tests__/packageScripts.test.ts` asserts the `build` script character for character (`expect(build).toBe('npm run content:build && npm run build -w @syntactical/progress && expo export ...')`), that no dependency name contains `vite`, and that `vite.config.js`, `index.html`, and `src` do not exist. `scripts/__tests__/ciWorkflow.test.ts` regex-matches `ci.yml` and `server-deploy.yml` text. These are "cutover" tests from 2026-10-02. They prevent nothing a reviewer would miss and they tax every build-chain change (B5 cannot land without editing a test). The global rule is "gates do not guard gates".

Keep `publicContentTree.test.ts`, `noPaidQuestionIds.test.ts`, and `paidContentRef.test.ts`: those guard B-60 (no paid bank on the static host), a product invariant.

### T2. The 60% coverage minimum is not enforced (HIGH-CONFIDENCE, S to decide)

No `coverageThreshold` in `jest.config.js`; no `test.coverage` in any of the four vitest configs; the only mentions of "coverage" in the tree are a directory-skip list and a security-review control name. The shared conventions say 60% minimum. Either add thresholds (and accept a first run that may fail) or record the override in the project `CLAUDE.md`.

### T3. Fix-commit pairing (P2 pattern note)

Of 51 `fix:` commits in 60 days, 6 touched no test file: `bc4a20b`, `04b8eb0`, `e86372b` (content wording), `e1baa27`, `d9555d2` (tagline copy), `36108b1` (card min-height). All but the last are copy or content edits where a test adds nothing; the project rule "`fix:` commits include a test" reads as violated only because the type is wrong. Use `content:` or `chore:` for wording changes so the rule stays measurable.

## packages/progress

Verdict: it earns its place. The server (`recomputeDailyProgress.ts`, `readProfile.ts`, `updateProfile.ts`) and the app (`services/progress/*`, `services/review/buildReviewQueue.ts`, `services/stats/*`) both replay the same events through `computeDailyProgress`, `computeDayStreak`, `findDueReviewEventIds`, and `toLocalDate`, and the pinned `ts-fsrs@5.4.2` with stated `SCHEDULER_PARAMETERS` is the reason both sides reach the same due dates. Tests: 77, all passing, 15 files for 13 source files.

### G1. Seven public exports with no external consumer (HIGH-CONFIDENCE, S)

From `packages/progress/src/index.ts`, grep across app, server, pipeline, and scripts (excluding the package and tests): `REVIEW_BONUS_XP`, `XP_BY_DIFFICULTY`, `isDueReview`, `orderAnswerEvents`, `newReviewItem`, `scheduleReview` have zero consumers; `PACKAGE_NAME` is consumed only by the CI import smoke (`ci.yml` `workspaces` job) and `scripts/__tests__/workspaceImports.test.ts`. `isDueReview.ts` is a per-event wrapper whose own comment says to call `findDueReviewEventIds` instead. Drop the unused exports (keep the modules internal) and let the smoke test import a real function.

### G2. Duplicated goal lookup and split default (HIGH-CONFIDENCE, S)

`services/progress/findGoalForDate.ts` reimplements the private `findGoal` in `packages/progress/src/computeDailyProgress.ts` (same sort, same scan, one adds a default). The default goal is `DEFAULT_DAILY_GOAL` in `constants/appConfig.ts` on the app side and `PROGRESS_DEFAULTS.DAILY_GOAL` in `server/src/constants/progressDefaults.ts` on the server side, while `DAILY_GOALS` lives in the package. Export `findGoalForDate` and `DEFAULT_DAILY_GOAL` from the package and delete the two copies. To confirm: both constants are 20 today.

### G3. `computeDailyProgress` takes a callback every caller builds the same way (SPECULATIVE, S)

Both callers (`services/progress/computeLocalProgressSummary.ts`, `server/src/services/recomputeDailyProgress.ts`) compute `findDueReviewEventIds(events)` and pass `({ eventId }) => dueReviewIds.has(eventId)`. The package could do that internally. Keep the injectable form only if a test needs it.

## Docs and runbook drift

### D1. The API hostnames do not resolve (HIGH-CONFIDENCE, P1, S for the owner)

`dig +short api.syntactical.dev` and `dig +short staging-api.syntactical.dev` return nothing from this machine (`syntactical.dev` resolves to GitHub Pages, so the resolver works). Meanwhile: `app.config.ts:7` `DEFAULT_API_BASE_URL = 'https://api.syntactical.dev/v1/'`; `eas.json` preview `API_BASE_URL: https://staging-api.syntactical.dev/v1/` and production `https://api.syntactical.dev/v1/`; `docs/session-handoff/session-handoff.md` "API on Railway: https://api.syntactical.dev (production) and https://staging-api.syntactical.dev (staging)"; `server/DEPLOY.md` "The `api.syntactical.dev` record (Cloudflare) does not exist yet". The runbook is the one that is right. A production web build or an EAS build today calls a dead host. The two device-checklist runs (2026-10-06, 2026-10-08) list sign-in as "blocked", consistent with this.

Fix direction: create the CNAMEs per `server/DEPLOY.md` "DNS", or set `API_BASE_URL` to the `*.up.railway.app` hosts in `eas.json` and the deploy workflow until then. To confirm: `dig` from another network, and `/health` on the Railway hostnames.

### D2. `README.md` describes the 2026-10-02 product (HIGH-CONFIDENCE, M with D3 to D7)

"Pick a language (Python, Postgres, or JavaScript)": `content/` has ten tracks (backend-security, frontend-security, go, javascript, postgres, python, rails, ruby, sql, typescript). "lifetime stats and streaks persist on the device": there is an account, sync, and a server-derived profile. "Local development" lists `npm run dev`, `test`, `lint`, `build` and nothing about the server, the e2e suite, the pipeline, or Docker. "about 400 files still differ" from Prettier: 341 today.

### D3. `docs/stack.md` predates the server, the pipeline, and the shared packages (HIGH-CONFIDENCE)

"Last updated: 2026-10-02". It lists no Express, pg, node-pg-migrate, pino, helmet, zod, Resend, Anthropic SDK, parse5, ts-fsrs, Vitest, Playwright, RevenueCat, expo-secure-store, Railway, Neon, or Docker. It says GitHub Pages serves "at `/syntactical/`" and Expo Router uses "base URL `/syntactical`"; `app.config.ts` and `server/DEPLOY.md` say the site root. Its CI section names `ci.yml` and `deploy.yml` only; there are five workflows. Either regenerate it from the manifests or delete it and let `package.json` be the stack list.

### D4. `docs/user-stories/README.md` says there is no e2e suite (HIGH-CONFIDENCE)

"The project has no end-to-end suite (owner decision 9)". `e2e/` has 8 Playwright specs and a CI workflow. `docs/user-stories/content.md` names `services/content/__tests__/validateManifest.test.ts` and `validateQuestionBank.test.ts`; neither exists (the validators moved to `packages/content-schema`).

### D5. `docs/feature-list/features.md` last updated 2026-10-02 (HIGH-CONFIDENCE)

Predates accounts, password sign-in, paid banks, admin access, review rounds, XP, streaks, daily goals, topic tracks, analytics, and the privacy and deletion pages.

### D6. `docs/lexicon.md` marks 30 terms "planned" and 21 "in code" (HIGH-CONFIDENCE)

Its own rule is that a planned term becomes "in code" in the PR that introduces it. Grep finds `misconception` in 13 app and server files, `provenance` in 14, `entitlement` in 16, `review` in 31, `daily` in 25, `guest` in 21, `session` in 33, and so on for most of the 30. The pipeline terms (`oracle`, `runner`, `golden set`) are in `pipeline/src`. Flip the labels or drop the column.

### D7. `docs/session-handoff/session-handoff.md` is frozen at PR #113 (HIGH-CONFIDENCE)

Last refreshed 2026-10-05 (`1b7f916`); `main` is at #158. It says the manifest "still lists only Python, Postgres, and JavaScript (9 banks)" (see D2), that `REVENUECAT_WEBHOOK_AUTH` is "the last stub on the servers" where `server/DEPLOY.md` says both environments run with "the six stubs", and that the API is live at hostnames that do not resolve (D1). Seven refreshes landed in four days, then none in eight. Either keep the cadence (one refresh per merged PR, as the commit history shows was the intent) or replace the file with a pointer to `git log` and the open tickets.

### D8. `server/DEPLOY.md` smaller drifts (HIGH-CONFIDENCE, S)

The environment table omits `PASSWORD_HASH_CONCURRENCY` (`server/src/config/env.ts:50`, read in `startServer.ts:116`). It names `CONTENT_SOURCE=fixture` as if it were a variable; the composite action writes a `content-source` step output and nothing in the tree reads `CONTENT_SOURCE`. Both one-line fixes.

### D9. `docs/security-reviews/` is a closed ledger (HIGH-CONFIDENCE, S)

19 JSON files for PRs 1 to 33 (IAN-486, IAN-564, IAN-601). Status counts: 7 HIGH fixed, 39 MEDIUM fixed, 66 LOW fixed, 15 LOW waived, 0 open. Nothing to re-verify. The convention ended at #33 (later PRs record reviews in the PR body, per the project `CLAUDE.md`). Add a one-line README saying so, or move the directory under `docs/archive/`.

### D10. `docs/superpowers/` holds 548 KB of plans and specs (SPECULATIVE, S)

`plans/2026-10-02-syntactical-v2.md` (127 KB) and `specs/2026-10-02-syntactical-v2-design.md` (105 KB) describe work the handoff says shipped; the precedent in `b64d241` ("delete the executed plan") was to remove executed plans. `plans/2026-10-04-topic-tracks.md` (272 KB) has slices 4 and 6 pending per the handoff, so it stays. To confirm: whether anything still cites the v2 plan by section.

## Workspace hygiene

### W1. Worktrees and branches (HIGH-CONFIDENCE, S, do not delete without a plan)

`git worktree list`: 28 entries. The main checkout at `/Users/iangreenough/Desktop/code/personal/production/syntactical` is on `feat/javascript-path`, not `main`. Worktrees under `.claude/worktrees/` include locked ones on `feat/paid-banks`, `feat/payments-webhook`, `feat/server-skeleton`, `feat/sync-api`, all PRs that merged in the first week. `git branch | wc -l`: 279 local branches; `git branch --merged origin/main`: 141 of them. `git branch -r | wc -l`: 163 remote branches, so "delete branch after squash merge" is not happening on the remote either.

Recommendation: a cleanup plan, not a command. `git worktree prune` after unlocking, `git branch -d` for the 141 merged, enable "Automatically delete head branches" on the GitHub repository, and return the main checkout to `main`.

No duplicate copies of the project exist under `~/Desktop/code`, `~/code`, or `~/projects` (one `package.json` with `"name": "syntactical"` found, the main checkout).

### W2. Tracked files, ignored files, large blobs (HIGH-CONFIDENCE, clean)

`git ls-files -i -c --exclude-standard`: none. Untracked non-ignored files: none. Root tracked files: 17, all config. Largest blobs in history: fifteen revisions of `package-lock.json` at about 600 KB each; the largest tracked source file is `docs/superpowers/plans/2026-10-04-topic-tracks.md` (268 KB). No binaries, no build output.

### W3. Markers and leftovers (HIGH-CONFIDENCE, clean)

`TODO`/`FIXME`/`HACK`/`XXX` in source: 0. `console.log` or `console.debug` outside tests: 0 (the two hits in `pipeline/src/services/ab/buildBenchOracle.ts` are strings that silence the sandboxed console). Commented-out code blocks over five lines: 0.

## Code quality (cross-cutting only)

### Q1. 53 lint warnings pass CI (HIGH-CONFIDENCE, M)

`npm run lint`: 0 errors, 53 warnings: 30 `react(immutability)`, 10 `react(refs)`, 5 `react(only-export-components)`, 3 `eslint(no-unused-vars)` (`pipeline/src/__tests__/commands/gapFillTopicTrack.test.ts:4`, `pipeline/src/services/migrateManifestV1.ts:32`, `state/__tests__/AuthProviderIntegrity.web.test.tsx:37`), 2 `react(set-state-in-effect)` (`app/purchase-complete.tsx:51`, `components/auth/CodeStep.tsx:34`), 2 `react(globals)`, 1 `eslint(no-unsafe-optional-chaining)` (`server/src/__tests__/routes/authPasswordSessionsEnumeration.integration.test.ts:123`). `ci.yml` runs `npm run lint` without `--deny-warnings`, so the count only grows. Clear the three unused variables and the one unsafe chain now (S), review the `refs` and `set-state-in-effect` ones (they can be real bugs), then turn on `--deny-warnings`.

### Q2. Prettier is a check nobody can run (HIGH-CONFIDENCE, M)

`npx prettier --check .`: 341 files differ. `README.md` and `.prettierrc.mjs` both say "format only the files you touch, never `.`". That policy means every PR carries incidental reformatting and the check can never gate CI. One formatting commit, its SHA in `.git-blame-ignore-revs`, then `prettier --check` in `ci.yml`. The 4-space override for `pipeline/` and `packages/progress/` in `.prettierrc.mjs` conflicts with the shared convention (4-space, 100 columns, everywhere); the project file is the documented override and wins, but the two-width rule is a cost with no stated benefit.

## Git history signal (60 days, which is the whole history)

173 commits: 76 `feat`, 51 `fix`, 24 `chore`, 9 `refactor`, 9 `docs`, 4 `test`. By scope: pipeline 38, app 32, content 25, server 15, quiz 8, docs 8, auth 8. Fix commits by scope: app 17, pipeline 16, content 6, server 3.

### H1. Pipeline: six fixes on unwrapping model output (SPECULATIVE on the fix, HIGH on the pattern)

`52c4d17` "read batch JSON the model wraps in prose", `ae6a216` "read model JSON wrapped in a single code fence", `798291d` "send raw existing prompts; SQL-style single-quoted strings", `0c4e9d2` "keep batch prompts short and free of the answer", `17c9fdb` "sql batch prompt shows setup statements in code", `edd7cda` "tell Rails batches the database starts empty". Each patches the prompt or the parser after a new failure shape. The structural alternative is the SDK's tool-use or structured-output path, where the model returns a schema-validated object and there is nothing to unwrap. To confirm: which `@anthropic-ai/sdk@0.131` call the batch generator uses, and whether the pipeline audit already recommends this.

### H2. App: five fixes on accessible names for answer choices (HIGH on the pattern)

`824f06e`, `d7a90e6` "answer choice names start with the visible letter", `7b42213` "name answer choices from visible content", `4a4d831` "name True/False buttons from their visible text", `465f564` "admin switch and email label accessibility". Four of five are the same control. A single `buildChoiceAccessibleName` helper used by every answer button, with one contract test that renders each question type and asserts the name, would have absorbed all of them. To confirm: whether `components/quiz/__tests__/accessibleNames.web.test.tsx` already is that test and the fixes were adding cases to it (if so, the hot spot is closed).

## Security (cross-cutting only)

Nothing in scope here contradicts the other audits. Noted in passing: the image build path (`Dockerfile.dockerignore` allow-list, `scanImageForKeys.sh` with a self-test, `deployToRailway.sh` refusing key-shaped files, `stageBuildContent.sh` pinning the GitHub host key and the content commit) is well above the usual bar. `app.config.ts` refuses non-public vendor keys and non-loopback e2e URLs by prefix check. The credential exposure scan of the repository (all refs, working tree, the role's pattern list plus the RevenueCat and PostHog prefixes) found 0 matches; the home-directory surfaces were not scanned (see Coverage).

## Tech debt register

| Item                                                              | Risk                  | Note                                                        |
| ----------------------------------------------------------------- | --------------------- | ----------------------------------------------------------- |
| Dead API hostnames in build defaults (D1)                         | High until DNS exists | Every non-e2e build targets them.                           |
| Docs frozen at 2026-10-02 to 10-05 (D2 to D7)                     | Medium                | Misleads every new session; cheap to fix per file.          |
| Duplicate CI job, unpinned actions, e2e path filter (B1 to B4)    | Low to medium         | Wasted minutes and one blind spot.                          |
| Dev tooling declared four times, split `@types/node` (P1)         | Low                   | Four extra installs; a future bump touches five files.      |
| Unenforced coverage and non-blocking lint and format (T2, Q1, Q2) | Medium                | Rules that are not measured drift.                          |
| Root vitest config starts Docker (B6)                             | Low                   | Surprising for a unit run; harness-driven.                  |
| 28 worktrees, 279 local branches (W1)                             | Low                   | Cognitive load, stale `core.hooksPath` risk the role names. |
| JS build scripts outside type check (B7)                          | Low                   | All tested; conversion is cheap.                            |

## Prioritized recommendations

| #   | Action                                                                                                                                                                                          | Impact | Effort    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- |
| 1   | Create the `api` and `staging-api` CNAMEs or retarget `eas.json` and `app.config.ts` defaults (D1)                                                                                              | H      | S (owner) |
| 2   | Delete `server.yml` `test` job; add `typecheck:e2e` to CI; widen the e2e path filter; pin the two unpinned workflows (B1 to B4)                                                                 | M      | S         |
| 3   | Rewrite `README.md` and either regenerate or delete `docs/stack.md`; fix the two broken test paths and the "no e2e suite" line in `docs/user-stories`; refresh or retire the handoff (D2 to D7) | M      | M         |
| 4   | Delete the cutover meta-tests in `scripts/__tests__` (T1)                                                                                                                                       | M      | S         |
| 5   | Hoist `vitest`, `@types/node`, `typescript` to root; drop `expo-status-bar`; fix `@types/jest` major (P1, P2)                                                                                   | M      | S         |
| 6   | Trim `packages/progress` exports; move `findGoalForDate` and the default goal into the package (G1, G2)                                                                                         | M      | S         |
| 7   | Decide coverage enforcement; clear the 4 lint warnings that are defects, then `--deny-warnings`; one Prettier commit with `.git-blame-ignore-revs` (T2, Q1, Q2)                                 | M      | M         |
| 8   | Worktree and branch cleanup plan; return the main checkout to `main` (W1)                                                                                                                       | L      | S         |
| 9   | Add `engines` and `.nvmrc`; `@ts-check` or `.ts` for the build scripts; shared vitest alias or workspace file (B6 to B8)                                                                        | L      | S         |
| 10  | Design conversation on structured model output (H1) and a single accessible-name helper (H2)                                                                                                    | M      | M to L    |
