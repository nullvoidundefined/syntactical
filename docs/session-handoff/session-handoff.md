# Session handoff

Updated 2026-10-14, after the engineering audit cleanup slices. Confirm with `git log -1 origin/main` that nothing newer has replaced this file.

## Where things stand

- Web: https://syntactical.dev/ (GitHub Pages, `.github/workflows/deploy.yml`, deploys on every push to `main`).
- API: Railway `staging` and `production`, Postgres on Neon (`server/DEPLOY.md`, "Live environments"). Both run with `ALLOW_STUBBED_INTEGRATIONS=true` and stubbed Resend, RevenueCat, and PostHog integrations (`docs/launch-placeholders.md`).
- **The API hostnames do not resolve.** `dig +short api.syntactical.dev` and `dig +short staging-api.syntactical.dev` return nothing (checked 2026-10-13), while `app.config.ts` (`DEFAULT_API_BASE_URL`) and `eas.json` compile `https://api.syntactical.dev/v1/` and `https://staging-api.syntactical.dev/v1/` into production and preview builds. The owner must either add the CNAMEs per `server/DEPLOY.md` "DNS" or retarget those two files at the Railway hostnames in that runbook. Until then a production web build or an EAS build cannot sign in, which is what the two device-checklist runs in `docs/device-checklist.md` recorded as "blocked".
- Content: ten tracks and 30 banks in `content/manifest.json`; the 20 paid banks live in the private `syntactical-content` repo pinned by `content/paid-content.ref`.

## What shipped since the last handoff (#113)

`git log --oneline 526c067..origin/main` is the full list. The audit and its cleanup, all merged 2026-10-13 and 2026-10-14:

- The engineering audit (#166): `docs/audits/2026-10-13-engineering.md` with the four scoped reports beside it.
- CI: the duplicate server test job deleted, `typecheck:e2e` added to the `check` job, the e2e path filter widened, every action pinned to a SHA (#167); the harness meta-tests deleted (#170).
- Dependencies: `vitest`, `@types/node`, and `typescript` hoisted to the root, `@types/jest` aligned to Jest 29, `expo-status-bar` removed (#172).
- `packages/progress`: `findGoal` and `DEFAULT_DAILY_GOAL` exported and shared by the app and the server; four unused exports removed (#171).
- Pipeline: the dead judged route, A/B validators, and v1 migration deleted (#169); one runner id list and a TypeScript golden set (#173); a shared command preamble and JSON I/O (#175); review lists topic-track cards (#168); `nodejs` and `typescript-types` track configs (#164, #165).
- App: one exclusive-action hook, and purchase-complete confirms through `usePurchases` (#174).
- Server: shared `sendError`, rate-limit keys, layering and dead-config fixes (#176).
- Docs: this rewrite (README, `docs/stack.md`, the user stories, the feature list, the lexicon, this file).

## Open

The engineering-audit cleanup pass stopped early at the owner's request (2026-10-14). The ranked list is in `docs/audits/2026-10-13-engineering.md`, "Ranked cleanup opportunities"; the slices still open from it are:

- app: one modal dialog shell (`useModalPanel` plus `DialogShell` for `SignOutDialog`, `DeleteAccountDialog`, and `PaywallSheet`; row 10),
- app: test mock consolidation (the hand-mocked `expo-router` and `expo-constants` in the Jest files; row 17),
- pipeline: test fixture consolidation (row 17),
- server: one test-app factory in place of the five `createXTestApp` factories and the per-file `SKIP_DATABASE_TESTS` (row 17),
- #178 (server `changePassword` service), open and security-touching, so the owner merges it.

1. **Owner decisions** from `docs/audits/2026-10-13-engineering.md`, "Decisions for the owner": the DNS records (above), the 60% coverage rule (enforced nowhere), lint and Prettier as gates (323 files fail `prettier --check`), and workspace pruning (worktrees and merged branches).
2. **Open PRs** (`gh pr list`): #177 (pipeline provider failure cap), #178 (server `changePassword` service, security-touching, the owner merges), #159 (query drawer before an answer), #160 and #162 (misconception taxonomies and references, content), #161 (pipeline references and enrichment).
3. **Owner, outside the repo** (`docs/launch-placeholders.md`): RevenueCat products, keys, and the webhook secret; the PostHog project and key; the Resend key; the Apple Developer account for iOS builds; then remove `ALLOW_STUBBED_INTEGRATIONS`.
4. **Drafts awaiting the owner:** `app/privacy.tsx` and `app/delete-account.tsx` carry owner placeholders (see each file's header comment).
5. **Topic tracks:** `docs/superpowers/plans/2026-10-04-topic-tracks.md` is the live plan; the 2026-10-02 v2 plan and spec were executed and are deleted.

## Working rules and gotchas

- Process: `/Users/iangreenough/Desktop/code/personal/.claude/CLAUDE.md` (one review per PR, merge on green, LOWs waived, no scope added mid-PR).
- Before merging, compare the PR head with the branch tip (`gh api repos/nullvoidundefined/syntactical/pulls/<n> --jq .head.sha` against `git ls-remote origin refs/heads/<branch>`); GitHub once merged a stale head (#104).
- `server/Dockerfile` installs only the server workspace before running `tsc`, so `typescript` must stay in `server/package.json` even though it is also at the root (#172 review).
- Docker-backed tests: `SKIP_DOCKER_TESTS=1` skips the pipeline's oracle suites locally; CI runs them in `oracle-runners`. The server integration tests need `TEST_DATABASE_URL` or a local Docker.
- The pipeline's golden files are hand-written; a new runner needs `pipeline/golden/<id>.json` recorded against the real runner, and `pipeline/src/__tests__/types/oracleLanguageIds.test.ts` fails until it exists.
- Production SQL: read the Neon connection string with `neonctl connection-string main --project-id rough-paper-04073210 --ssl verify-full` into a variable and guard one-row updates in a `DO` block (`server/DEPLOY.md`).
