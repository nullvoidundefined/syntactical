# Session handoff

Updated 2026-10-27, after the free content, Pro, and sponsored cards, and model failover work (areas 1 to 9). On that date areas 1, 2, 5 (without the cutover), and 7 are on `main` (#201, #203, #205); areas 3, 4, 6, and 9 are built and in review as the stacked PRs #202, #206, #207, #208, and #204, and area 8 (these docs) sits on top of them. Confirm with `git log -1 origin/main` that nothing newer has replaced this file.

## Where things stand

- Model: every bank is free. One Pro tier, sold as `syntactical.pro.annual` (yearly) or `syntactical.pro.lifetime`, removes the sponsored cards and raises the Ask limit from 5 to 20 a day. Free users see one sponsored card on the results screen (from the third round, then every third round) and one in the track list: AdMob native and non-personalised on iOS and Android; EthicalAds, a direct sponsor from `content/sponsor.json`, or the house Pro card on the web. Spec: `docs/superpowers/specs/2026-10-27-free-content-pro-sponsored-design.md`. Plan: `docs/superpowers/plans/2026-10-27-free-content-pro-sponsored.md`. Reasoning: `docs/audits/2026-10-27-monetization-marketing.md`.
- Web: https://syntactical.dev/ is still served by GitHub Pages until the owner's cutover (`server/DEPLOY.md`, "Web app origin"); `.github/workflows/deploy.yml` also deploys every push to `main` to the Cloudflare Pages project `syntactical`, with the web build's public keys from repository variables. The export is static, one HTML file per route; track and bank pages carry their text for crawlers, and `scripts/writeHostFiles.mjs` writes `_headers`, `404.html`, `sitemap.xml`, and `robots.txt`.
- API: Railway `staging` and `production`, Postgres on Neon (`server/DEPLOY.md`, "Live environments"). Ask and the study note call Anthropic first and fail over to OpenAI (`server/DEPLOY.md`, "Changing or losing a model"). Stubbed integrations and owner keys are tracked in `docs/launch-placeholders.md`.
- **The API hostnames do not resolve.** `dig +short api.syntactical.dev` and `dig +short staging-api.syntactical.dev` return nothing (last checked 2026-10-13; not re-checked on 2026-10-27, because that session had no DNS access), while `app.config.ts` (`DEFAULT_API_BASE_URL`) and `eas.json` compile `https://api.syntactical.dev/v1/` and `https://staging-api.syntactical.dev/v1/` into production and preview builds. The owner must add the CNAMEs per `server/DEPLOY.md` "DNS". The web build needs the custom domain, not the Railway hostname: the session cookie is `SameSite=Lax` (`server/src/config/sessionCookieOptions.ts`), so the API must be same-site with `syntactical.dev` (`server/DEPLOY.md`, "Web app origin"). Only a native build, which sends the token in an `Authorization: Bearer` header, could be retargeted at the Railway hostname in `eas.json` as a stopgap. Until then a production web build or an EAS build cannot sign in, which is what the two device-checklist runs in `docs/device-checklist.md` recorded as "blocked".
- Content: 12 tracks and 36 banks, all free, under `content/<track>/<difficulty>.json`. Easy banks are bundled; Medium and Hard download on first use and are cached. No build reads the private `syntactical-content` repo.

## What shipped since the last handoff (#113)

`git log --oneline 526c067..origin/main` is the full list.

#114 to #165 (2026-10-06 to 2026-10-13):

- Content: the Go (#122), Ruby (#119), Backend Security (#127), Rails (#129), Frontend Security (#131), SQL (#149), and TypeScript (#154) tracks; Go and Rails top-ups (#134, #138); misconception and wording fixes (#135, #140, #153, #155, #156, #158).
- App: 20 and 50 question rounds (#117) and round lengths on the topic step (#118); tracks grouped by Frontend, Backend, Database (#142); shuffled choices once per round (#121); bank completion only when every question was played (#150); accessible names for answer choices (#126, #152); the query drawer clear of the status bar (#130); deep links served with HTTP 200 on Pages (#124); Settings password form follow-ups (#141); EAS builds linked to the Expo project (#128).
- Server: admin grants never overwrite store purchases (#147).
- Pipeline: batch question generation (#115, #116, #120, #125, #136, #151), the prompt-rewrite pass (#123), the TypeScript runner and track config (#148), the SQL, nodejs, and typescript-types track configs (#143, #164, #165), the rails runner's Action Pack (#137), jsdom heap-cap and harness fixes (#146, #157), review LOWs (#132).
- Docs: the device-checklist runs (#139), the handoff through #113 (#114).

The audit and its cleanup, merged 2026-10-13 and 2026-10-14:

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
3. **Owner, outside the repo** (`docs/launch-placeholders.md`): RevenueCat products, keys, and the webhook secret; the PostHog project and key; the Resend key; the Apple Developer account for iOS builds; then remove `ALLOW_STUBBED_INTEGRATIONS`. The free content, Pro, and sponsored cards plan is built in the repository (areas 3, 4, 6, and 9 still in review); its owner actions remain in `docs/launch-placeholders.md` and in the owner checklist at the end of the plan's area 8.
4. **Drafts awaiting the owner:** `app/privacy.tsx` and `app/delete-account.tsx` carry owner placeholders (see each file's header comment).
5. **Topic tracks:** `docs/superpowers/plans/2026-10-04-topic-tracks.md` is the live plan; the 2026-10-02 v2 plan and spec were executed and are deleted.

## Working rules and gotchas

- Process: `/Users/iangreenough/Desktop/code/personal/.claude/CLAUDE.md` (one review per PR, merge on green, LOWs waived, no scope added mid-PR).
- Before merging, compare the PR head with the branch tip (`gh api repos/nullvoidundefined/syntactical/pulls/<n> --jq .head.sha` against `git ls-remote origin refs/heads/<branch>`); GitHub once merged a stale head (#104).
- `server/Dockerfile` installs only the server workspace before running `tsc`, so `typescript` must stay in `server/package.json` even though it is also at the root (#172 review).
- Docker-backed tests: `SKIP_DOCKER_TESTS=1` skips the pipeline's oracle suites locally; CI runs them in `oracle-runners`. The server integration tests need `TEST_DATABASE_URL` or a local Docker.
- The pipeline's golden files are hand-written; a new runner needs `pipeline/golden/<id>.json` recorded against the real runner, and `pipeline/src/__tests__/types/oracleLanguageIds.test.ts` fails until it exists.
- Production SQL: read the Neon connection string with `neonctl connection-string main --project-id rough-paper-04073210 --ssl verify-full` into a variable and guard one-row updates in a `DO` block (`server/DEPLOY.md`).
