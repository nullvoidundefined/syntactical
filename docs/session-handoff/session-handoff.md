# Session handoff

Updated 2026-11-22, through #217. The free content, Pro, sponsored cards, and model failover work (areas 1 to 9) is all on `main`, and no PR is open. What is left is owner work outside the repository, tracked in `docs/launch-placeholders.md`. Confirm with `git log -1 origin/main` that nothing newer has replaced this file.

## Where things stand

- Model: every bank is free. One Pro tier, sold as `syntactical.pro.annual` (yearly) or `syntactical.pro.lifetime`, removes the sponsored cards and raises the Ask limit from 5 to 20 a day. Free users see one sponsored card on the results screen (from the third round, then every third round) and one in the track list: AdMob native and non-personalised on iOS and Android; EthicalAds, a direct sponsor from `content/sponsor.json`, or the house Pro card on the web. Spec: `docs/superpowers/specs/2026-10-27-free-content-pro-sponsored-design.md`. Plan: `docs/superpowers/plans/2026-10-27-free-content-pro-sponsored.md`. Reasoning: `docs/audits/2026-10-27-monetization-marketing.md`.
- Web: https://syntactical.dev/ is served by the Cloudflare Pages project `syntactical` since the 2026-10-30 cutover (`server/DEPLOY.md`, "Web app origin"); `.github/workflows/deploy.yml` deploys every push to `main` to it, with the web build's public keys from repository variables. The export is static, one HTML file per route; track and bank pages carry their text for crawlers, and `scripts/writeHostFiles.mjs` writes `_headers`, `404.html`, `sitemap.xml`, and `robots.txt`.
- API: Railway `staging` and `production`, Postgres on Neon (`server/DEPLOY.md`, "Live environments"). Ask and the study note call Anthropic first and fail over to OpenAI (`server/DEPLOY.md`, "Changing or losing a model"). Stubbed integrations and owner keys are tracked in `docs/launch-placeholders.md`.
- DNS: `api.syntactical.dev` and `staging-api.syntactical.dev` resolve to their Railway custom-domain targets (checked with `dig +short` on 2026-11-22). The web build must keep using these hostnames, not the Railway ones: the session cookie is `SameSite=Lax` (`server/src/config/sessionCookieOptions.ts`), so the API must be same-site with `syntactical.dev` (`server/DEPLOY.md`, "Web app origin"). The two device-checklist runs in `docs/device-checklist.md` that recorded sign-in as "blocked" predate the DNS records and have not been rerun.
- Content: 12 tracks and 36 banks, all free, under `content/<track>/<difficulty>.json`. Easy banks are bundled; Medium and Hard download on first use and are cached. No build reads the private `syntactical-content` repo.

## What shipped since the handoff through #113

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
- Docs: this rewrite (README, `docs/stack.md`, the user stories, the feature list, the lexicon, this file) (#179).

#177 to #205 (2026-10-14 to 2026-10-27):

- Content: the TypeScript Types (#182) and Node.js (#184) tracks, with near-duplicate easy cards dropped; misconception lists (#160) and before-answer references, rationales, and misconception tags for Python, JavaScript, and Postgres (#162).
- App: number hints only on cards a key can select (#183) and one shared hint cap; the query drawer no longer gives the answer away before an answer (#159); Ask about a question after answering it (#196); the weekly study note on the home screen (#197); every bank free, with Medium and Hard downloaded on first use (#201).
- Web: a static export with real page bodies and a Cloudflare Pages deploy step (#203); crawlable track and bank pages, `sitemap.xml`, and `robots.txt` (#205).
- Server: the `changePassword` service (#178); the `anthropic-workspace-id` header so org-level API keys work (#198).
- Pipeline: a run-level provider failure cap (#177); node oracles get a `require` (#181); before-answer references, checked doc links, and answer-key enrichment (#161).
- Audit cleanup slices: one server test-app factory (#186), deduped app helpers (#188), one modal dialog shell (#189), shared pipeline fixtures (#190, #192), shared `expo-router` and `expo-constants` mocks (#191), shared password-test skip import (#194), `settle()` in place of real sleeps (#193), analytics mocks no longer virtual (#180), manifest taxonomy test fixtures (#195).
- Docs: the monetization and marketing audit (#199); the spec and plan for free content, Pro, sponsored cards, and model failover (#200).

#202 to #217 (2026-10-27 to 2026-11-22):

- Pro: annual and lifetime from the RevenueCat webhook (#202); Pro in the app with truthful restore (#206); the Pro sheet links the privacy policy and terms of use, with one source for the Pro Ask limit (#210); a late RevenueCat event after a `TRANSFER` follows the purchase to its new account (#212).
- Sponsored cards: the web card with the house Pro card and a direct sponsor (#207); AdMob native cards on iOS and Android, with consent (#208).
- Server: Anthropic and OpenAI failover for Ask and the study note (#204).
- App: Explain my mistake, a one-tap AI explanation of a missed card (#213); Practice these, a review round from the study note's misconceptions (#214).
- Web: Expo's route-list and bracket pages dropped from the export, shorter bank descriptions (#211); Cloudflare Pages is the only web host after the 2026-10-30 cutover (#216).
- Docs: store listing, review notes, privacy labels, and legal pages (#209); the 2026-10-30 launch setup rows marked done (#215); Pro product descriptions within App Store Connect's 55-character limit (#217).

## Open

No PR is open, and the engineering-audit cleanup slices from `docs/audits/2026-10-13-engineering.md` are merged (above). Everything below waits on the owner.

1. **Launch setup, in order** (`docs/launch-placeholders.md`, "Current state"; the OpenAI fallback and the "Model smoke" secrets are done as of 2026-11-22): the AdMob app ids, four native ad units, and consent message; the EAS project, its environment variables, and the Apple Developer and Play Console records; the "two area 7 decisions" the placeholders page names but does not list (the nearest match is "Open questions (area 7)" in `docs/superpowers/plans/2026-10-27-free-content-pro-sponsored.md`); then removing `ALLOW_STUBBED_INTEGRATIONS`.
2. **Waiting on prerequisites:** the App Store and Play Pro products, then `REVENUECAT_WEB_BILLING_KEY`; the Google Search Console property and sitemap; the EthicalAds publisher id (about 50,000 monthly pageviews first).
3. **Small owner checks:** click "Send test event" on both RevenueCat webhooks and expect 200; confirm Apple's standard EULA or supply a custom one (`components/purchase/ProSheet.tsx`); confirm the Anthropic and OpenAI data-retention terms for `app/privacy.tsx` and `app/delete-account.tsx` (each file's header comment lists its placeholders).
4. **Owner decisions** from `docs/audits/2026-10-13-engineering.md`, "Decisions for the owner": the 60% coverage rule (enforced nowhere), lint and Prettier as gates (323 files failed `prettier --check` on 2026-10-13), and workspace pruning (worktrees and merged branches). The DNS records from that list are done.
5. **Device checklist:** rerun `docs/device-checklist.md` once an EAS build exists; the earlier runs were blocked on DNS.
6. **Topic tracks:** `docs/superpowers/plans/2026-10-04-topic-tracks.md` is the live plan.

## Working rules and gotchas

- Process: `/Users/iangreenough/Desktop/code/personal/.claude/CLAUDE.md` (one review per PR, merge on green, LOWs waived, no scope added mid-PR).
- Before merging, compare the PR head with the branch tip (`gh api repos/nullvoidundefined/syntactical/pulls/<n> --jq .head.sha` against `git ls-remote origin refs/heads/<branch>`); GitHub once merged a stale head (#104).
- `server/Dockerfile` installs only the server workspace before running `tsc`, so `typescript` must stay in `server/package.json` even though it is also at the root (#172 review).
- Docker-backed tests: `SKIP_DOCKER_TESTS=1` skips the pipeline's oracle suites locally; CI runs them in `oracle-runners`. The server integration tests need `TEST_DATABASE_URL` or a local Docker.
- The pipeline's golden files are hand-written; a new runner needs `pipeline/golden/<id>.json` recorded against the real runner, and `pipeline/src/__tests__/types/oracleLanguageIds.test.ts` fails until it exists.
- Production SQL: read the Neon connection string with `neonctl connection-string main --project-id rough-paper-04073210 --ssl verify-full` into a variable and guard one-row updates in a `DO` block (`server/DEPLOY.md`).
