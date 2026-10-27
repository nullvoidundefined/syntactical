# Adversarial audit of the free content, Pro, sponsored cards, and model failover plan, 2026-10-27

Audited: `docs/superpowers/plans/2026-10-27-free-content-pro-sponsored.md` (99 tasks, nine areas) and its spec, on branch `claude/free-content-pro-plan` at `a4a5389`. Brief: `docs/superpowers/plans/2026-10-27-free-content-pro-sponsored-audit-brief.md`.

Method: three fresh Claude Opus reviewers with no part in writing the plan, each given the brief and one slice of the plan (areas 1 and 2; areas 3, 4, and 9; areas 5 to 8), and told to check every claim against the code at `6f12b7c` and to check their areas' interfaces against the rest of the plan. Nothing was executed: `node_modules` is not installed in this environment, so findings that depend on installed package behaviour or on vendor documentation the reviewers could not reach are marked unverified. Their full reports follow as appendices A to C; this section consolidates and ranks them.

The planner spot-checked the most consequential findings against the code before ranking: both blockers in areas 1 and 2, the missing Anthropic processor line, today's revoke rule, and the web deploy's missing build environment all hold.

## Summary

| Severity | Areas 1 and 2 | Areas 3, 4, 9 | Areas 5 to 8 | Total |
| -------- | ------------- | ------------- | ------------ | ----- |
| Blocker  | 2             | 0             | 1            | 3     |
| Major    | 3             | 6             | 10           | 19    |
| Minor    | 5             | 13            | 12           | 30    |
| Idea     | 1             | 3             | 3            | 7     |

The verdict: the plan's structure holds, and most quoted code and RED predictions check out (each appendix ends with the claims it verified). It is not executable as written. Three blockers would stop it, and a cluster of majors would ship real defects: refunds that do not revoke, a test-only route one environment variable away from granting free Pro, sandbox purchases granting production Pro, a cutover order that takes the site and the mobile content host offline, and a privacy policy that omits the vendor that already receives every learner question.

## Blockers

1. **Three pipeline commands are missed and silently skip every bank (Task 1.6).** `draft-oracles`, `draft-taxonomy`, and `write-references` still filter on `access === 'free'` (`pipeline/src/commands/draftOracles.ts:58`, `draftTaxonomy.ts:37`, `writeReferences.ts:59`). After the import they process nothing, with no error, and the pipeline typecheck stays red despite Step 4's claim. Fix: add them to Task 1.6 with a RED case that one of them reads a Medium bank. (A1)
2. **No task moves the app, server, and fixture manifests to schema 3.** Area 1 hands it to area 2, and area 2 assumes area 1 did it. About ten app tests and seven server tests and fixtures still write `schemaVersion: 2`, and Task 2.8's new tests write schema 2 too, so they cannot pass. Recommended fix: do not bump the manifest version at all. The retired-key rule already rejects a stale manifest by name, and an old client already rejects the new shape. (A2)
3. **The crawlable text disappears on hydration (Tasks 7.3, 7.4).** The track summary and bank titles render only before hydration, so the DOM Google indexes, which it reads after running JavaScript, has none of them, and Task 7.6's own URL Inspection check fails. This came from the planner's brief, not the writer. Fix: render both always, as secondary content below the step. (C1)

## Majors, grouped

**Purchases and entitlements (area 3)**

- **Refunds of the annual may never revoke.** The plan revokes on a `REFUND` type and makes an annual `CANCELLATION` expiry-only. Today `CANCELLATION` revokes (`server/src/constants/revenueCatEvents.ts:21`), and RevenueCat reports a refund as `CANCELLATION` with `cancel_reason: CUSTOMER_SUPPORT`; to the reviewers' knowledge it has no `REFUND` type (unverified). Fix: a `CUSTOMER_SUPPORT` cancellation revokes both products, with a sandbox refund check at cutover. (B3)
- **The test-only webhook is guarded by `NODE_ENV` alone.** Every other test seam is an injected `startServer` option the production entrypoint never passes. One wrong Railway variable turns on an unauthenticated free-Pro route. Fix: a `testWebhook` start option, refused outside test, passed only by the e2e runner. (B1)
- **Sandbox purchases grant production Pro.** TestFlight and Play license-test purchases are free, so any beta tester gets permanent lifetime Pro, and the plan's deploy runbook relies on this. Fix: record `SANDBOX` events but grant from them only where `REVENUECAT_ACCEPT_SANDBOX` is set (staging). (B6)
- **Restore onto another account never grants Pro.** RevenueCat's `TRANSFER` is ignored, and unhandled types are validated against the full schema first, so a payload without `product_id` may answer 400 and be retried forever. Settings still says "Purchases restored." Fix: check the type before the schema, add a `TRANSFER` task, and report restore truthfully. (B2)

**Model failover (area 9)**

- **An OpenAI 400 on a flagged prompt counts as a configuration failure.** That sends the learner's message to Anthropic, which the spec forbids, and lets one user disable the primary for 15 minutes. Fix: one classifier where a policy 400 is a decline and any other 400 is transient. The OpenAI behaviour is unverified. (B4)

**Privacy and store accuracy**

- **The privacy policy does not list Anthropic today.** Task 9.9 edits a line "beside Anthropic" that does not exist, though Ask and the study note already send learner text to Claude on `main`. This gap predates the plan. Fix: add Anthropic as primary and OpenAI as fallback processor, with a page test that both names render. (B5)
- **The privacy page and labels understate what the AdMob SDK collects**, such as approximate location from IP and diagnostics, per Google's SDK disclosures (unverified offline). (C8)
- **The privacy page says "no ads" between the two area 6 PRs** while a direct sponsor or EthicalAds may already show. (C18, minor)

**Ads policy and layout (area 6)**

- **Real AdMob unit ids are put in the `preview` environment**, and a configured unit id wins over test mode, so internal builds would serve live ads. That is the invalid-traffic pattern AdMob suspends accounts for. Fix: test mode wins; ids only in `production`. (C7)
- **Sponsored cards appear late and shift Retry, Menu, and the track list**, inviting accidental taps, which AdMob's native ad policy prohibits. Fix: reserve a fixed-height slot. (C9)
- **The late-ad destroy guarantee is proven by the test mock, not by app code**, and the library may expose only `NativeAd.createForAdRequest` (unverified for 17.4). Fix: an app-owned hook that holds the lifecycle. (C11)

**Hosting and the static build (area 5)**

- **The cutover removes the GitHub custom domain before Cloudflare holds it.** That takes down the web app, every installed app's content host, and the store-required legal pages, and no rollback is written. Fix: add the domain on Cloudflare first, verify, then remove it from GitHub; record the DNS records; keep GitHub Pages for 14 days. (C5)
- **The deploy workflow never passes the web build's public keys.** Setting `POSTHOG_KEY`, `REVENUECAT_WEB_BILLING_KEY`, or `ETHICALADS_PUBLISHER` as the docs say does nothing. Fix: map them from repository variables into the build step. (C6)
- **Areas 5 and 7 contradict each other on `react-dom/server` under the jsdom test project.** One side is wrong (unverified). Fix: one rule, either a node-environment test or a `TextEncoder` polyfill. (C2)
- **Once Task 7.1 gives pages real bodies, nothing re-checks hydration**, and `purchase-complete` and `length` will mismatch, while a deep-linked round can start on stale bundled questions. Fix: move Task 7.1 into area 5 first and gate the round on content hydration. (C4)

**Plan mechanics**

- **Two GREEN steps break an earlier area's exact-list test**: Task 6.1 against 4.2's event list, and Task 7.5 against 5.5's file list. (C3)
- **CI stays red for 23 tasks across areas 1 and 2**, which hides wrong expectations until Task 2.15. Fix: expand then contract, so the schema accepts both shapes first and rejects the old one last, keeping CI green after every task. (A4)
- **Later areas quote code that areas 1 and 2 already rewrote** (area 3's `startServer.ts` and `ask.ts` steps, Task 5.3's anchor), and the temporary `legacyPaidProducts` module is never deleted. (A5)
- **Area 8 asks the implementer to verify store consoles it cannot see**, and describes area 7's pages without depending on area 7. (C10)
- **Medium and Hard banks are cached in the same small store as learner stats** (localStorage on web, AsyncStorage on Android), with no budget. A learner who explores the catalogue can fill it, after which stats writes fail. Storage limits come from platform docs, unverified here. Fix: a bank store with a cap and least-recently-used eviction, or IndexedDB on the web. (A3)

## Modularization: what the reviewers recommend, and what they say to leave alone

| Proposal                                                                                                                                              | Effect on tasks              | Source |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------ |
| `BankStore` seam (`read`, `write` with a budget and LRU, `listLocal`), `.web.ts` on IndexedDB; `ContentProvider` stops reading every bank at startup  | +1 task; shrinks 2.6 and 7.1 | A      |
| Expand, then contract, for the schema change                                                                                                          | +1 task; red window to zero  | A      |
| One webhook intake that reads the event type first, with a `TRANSFER` branch                                                                          | +1 task                      | B      |
| `PRO_PRODUCT_RULES` per product (cancellation behaviour, requires expiry, refund rule) read by recompute and record                                   | 0                            | B      |
| `readActiveProRows` as the one active-Pro query behind `hasPro`, the profile, and admin                                                               | 0                            | B      |
| `classifyModelFailure(status, code)` shared by both providers; providers stay separate from the failover                                              | 0                            | B      |
| Move the model availability check out of the server into a scheduled smoke workflow                                                                   | -1 task (delete 9.7)         | B      |
| `testWebhook` as a start option beside the other test seams                                                                                           | 0                            | B      |
| One content-hydration flag (`ContentProvider`'s); drop `useIsHydrated` unless a route needs a pure mount flag                                         | -1 task                      | C      |
| Sponsor feeds behind one chain, direct-sponsor query hoisted into `SponsorProvider`, eligibility checked once                                         | 0                            | C      |
| Keep duplicated: product ids and `normalizeProductId` on server and app (add one contract test); the small per-runtime "for each manifest bank" loops | 0                            | A, B   |

Net: about one task more than the plan has now.

## Recommended order of fixes

1. The three blockers.
2. The security and money majors: B1, B3, B6, B2, B4.
3. The compliance majors: B5 (the Anthropic gap, which is worth fixing on `main` now, independent of the plan), C8, and C18.
4. The ads-policy majors: C7, C9, C11.
5. Hosting: C5 and C6.
6. Plan mechanics: A4 (expand and contract) before execution starts, then A5, C3, C4, C10, C2, and A3.
7. The minors, most of which are one-line corrections to line numbers, task ids, expected outputs, and JSX snippets.

---

## Appendix A: Areas 1 and 2: content, unlocked banks, deploy

Full report of reviewer A. Finding numbers here are the ones cited above as A1, A2, and so on.

Scope: areas 1 and 2 of `docs/superpowers/plans/2026-10-27-free-content-pro-sponsored.md`, its header sections, and its closing sections, plus the interfaces other areas consume from them. Code claims are checked against commit `6f12b7c` unless a path is the plan itself.

### Summary

2 blockers, 3 major, 5 minor, 1 idea.

1. Task 1.6 misses three pipeline commands (`draft-oracles`, `draft-taxonomy`, `write-references`). They still filter on `access === 'free'`, so after the import they skip every bank without saying so, and the pipeline typecheck and suite stay red.
2. Nobody owns the manifest moving to schema 3 in the app, server, CI-fixture, and new area 2 test manifests. Area 1 hands it to "the app writer"; area 2 assumes area 1 did it. Task 2.8's two new tests write schema 2 manifests and cannot pass. Either own the bump in one task or drop it: the retired-key rule already gives the protection.
3. Medium and Hard banks get cached in the same small key-value store (web localStorage, Android AsyncStorage) as the learner's stats, with no budget or eviction. A learner who visits most tracks can fill it, after which stats writes fail.

### Findings

#### 1. Task 1.6 misses `draft-oracles`, `draft-taxonomy`, and `write-references`, which then skip every bank (blocker, axis 1)

- Tasks: 1.6, 1.7, 1.8
- Evidence: Task 1.6 **Files** modifies only "`publish.ts` ..., `classify.ts`, `gapFill.ts`, `enrich.ts`, `review.ts`, `validate.ts`, `rewritePrompts.ts`, `runCli.ts`, `pipeline/src/cli.ts`". Step 4 expects "the whole pipeline suite passes (green for the first time since Task 1.1); `tsc` exits 0", and its grep omits `access`. The code still reads `access` in three commands the task does not touch:
  - `pipeline/src/commands/draftOracles.ts:56-60`: `for (const [difficulty, { access, path }] ...) { if (access !== 'free') { log(\`skipping paid bank ${bankKey}\`); continue; }`
  - `pipeline/src/commands/draftTaxonomy.ts:36-37`: `for (const { access, path } of Object.values(entry.banks)) { if (access === 'free') {`
  - `pipeline/src/commands/writeReferences.ts:58-59`: `for (const [difficulty, { access, path }] ...) { if (access !== 'free') continue;`
  - The tests are missed too. `pipeline/src/__tests__/commands/draftOracles.test.ts:24-25` calls `buildBankEntry('python/easy.json', 'free')` and `buildBankEntry('python/medium.json', 'paid', 'syntactical.python.medium')`, which Task 1.6 reduces to `buildBankEntry(path: string)`. `writeReferences.test.ts:1-3` and `draftTaxonomy.test.ts:116-131` run over a copy of the real content and expect free banks to be read; the draft-taxonomy case "never sends a paid bank" plants `python/medium.json`.
  - A stale comment remains at `pipeline/src/types/publish/PublishBankArgs.ts:13`.
- Problem: After Task 1.1, destructuring `access` from `BankEntry` is a type error, so pipeline `tsc` cannot exit 0. After Task 1.2 strips `access` from the manifest, each command fails silently:
  - `draft-oracles` logs "skipping paid bank" for all 36 banks.
  - `draft-taxonomy` sends the model an empty question list.
  - `write-references` writes no reference for any bank.

  Task 1.8's README tells the owner to run all three on Medium and Hard. Task 1.7's retired-flag test lists `write-references` and `draft-oracles` but never checks that they read a bank.

- Change: Add the three commands to Task 1.6, and make the RED test (`oneContentTree.test.ts`) cover one of them, for example `write-references` producing a reference for a Medium question.
  - **Code:** in each command, drop the `access` filter, and drop the "skipping paid bank" branch in `draftOracles`.
  - **Tests:** in `draftOracles.test.ts`, call `buildBankEntry(path)` and have the medium entry produce oracles. Rewrite the `draftTaxonomy` "never sends a paid bank" case as "sends Easy, Medium, and Hard questions". In `writeReferences.test.ts`, count questions across all three python banks.
  - **Grep:** add `\.access\b\|{ access` and `PublishBankArgs` to the Step 4 grep.
- Cost of not changing: the free-banks PR cannot go green as written. If an implementer silences only the type errors, the three content commands ship doing nothing for all 36 banks, with no error.

#### 2. Nobody owns the manifest moving to schema 3 outside the schema package and pipeline; Task 2.8's new tests write schema 2 (blocker, axis 2)

- Tasks: 1.1, 2.5, 2.6, 2.8, 2.9, 2.11, Cross-area decision 6
- Evidence:
  - **The two areas assume each other did it.** Area 1, "Open questions (area 1)" item 1, says: "Knock-on for the app writer: `services/content/__tests__/contentCache.test.ts:102`, `loadLanguageManifest.test.ts:57`, and `state/__tests__/useQuestionBank.test.tsx:209` use manifest `schemaVersion: 3` as 'unsupported' and must move to 4; app and server manifest fixtures at `schemaVersion: 2` move to 3". Area 2, "Open questions (area 2)" item 1, says: "my new tests use `SUPPORTED_SCHEMA_VERSION`, and I assumed area 1 updated the existing fixtures ... If it did not, Tasks 2.9 and 2.11 must also rewrite those values". No task does it.
  - **Task 2.9 and Task 2.11 pin the old value.** Task 2.9 rewrites `startServer.integration.test.ts` `writeContent` with `schemaVersion: 2` and adds "(keep whatever `schemaVersion` area 1 left in this file)". Task 2.11 says "keep the `schemaVersion` area 1 left at line 2" of `server/ci-fixture/public/manifest.json` (2 at `6f12b7c`).
  - **Task 2.8's tests write schema 2.** Both new manifests use `schemaVersion: SUPPORTED_SCHEMA_VERSION`, which Task 1.1 keeps at 2, for the manifest itself:
    - `startServerPublicContent.integration.test.ts`: `JSON.stringify({ languages: [language], schemaVersion: SUPPORTED_SCHEMA_VERSION })`
    - `askAllBanks.integration.test.ts`: the same.

    The server validates with source aliases (`server/vitest.integration.config.ts:13-16`), and `server/src/services/readManifest.ts:10-13` throws `Invalid manifest: ...`.

  - **Server fixtures still at 2:** `server/src/__tests__/services/readServerManifest.test.ts:70` writes `schemaVersion: 2`, and `readServerManifestGuards.test.ts:42` defaults `schemaVersion = 2`. Neither line is in Task 2.9's edits.
  - **App fixtures:** `services/content/__tests__/contentCache.test.ts:102`, `loadLanguageManifest.test.ts:57`, and `state/__tests__/useQuestionBank.test.tsx:209` use 3 as the unsupported version. Task 2.6 Step 7 still claims "the full Jest run passes (including `useQuestionBank.test.tsx`, ... `contentCache.test.ts`, ...)".

- Problem: After Task 2.9, both of Task 2.8's integration files fail on every case with `Invalid manifest: schemaVersion is not supported`.
  - Its RED prediction is wrong too: "the index case passes" and "the hash-mismatch case passes" both fail.
  - The three app tests fail because 3 is now the supported version.
  - The server unit and integration suites that read `readServerManifest` or start the server fail.
  - The CI fixture's server cannot boot. DEPLOY.md, rewritten in Task 2.12, offers `stageBuildContent.sh fixture` for local image checks.
  - The implementer must change RED tests it may not edit ("GREEN is by the implementer, who does not edit RED tests").
- Change: Pick one of the two options.
  - (a) Cheapest: do not bump the manifest version at all. The new retired-key rule (Task 1.1) already rejects a stale manifest by name. An old client's validator already rejects a new entry, because `findBankEntryProblem.ts:18-19` returns `access is invalid` when `access` is absent. The bump buys no behaviour and costs about 10 fixture edits plus the constant split. Drop `SUPPORTED_MANIFEST_SCHEMA_VERSION`, keep 2, and keep Task 1.1's retired-key cases. The spec's "schemaVersion is bumped" is satisfied in spirit by the rejection rule; record the deviation beside "Open questions (area 1)" item 1.
  - (b) If the bump stays, add a Task 1.1b "Manifest fixtures at schema 3 across workspaces" that owns:
    - in the app, the three files above (3 to 4);
    - on the server, `readServerManifest.test.ts:70`, `readServerManifestGuards.test.ts:42`, `startServer.integration.test.ts:83`, and `server/ci-fixture/public/manifest.json:2`;
    - in Task 2.8's two tests, `SUPPORTED_MANIFEST_SCHEMA_VERSION` for the manifest and `SUPPORTED_SCHEMA_VERSION` for banks;
    - and it fixes the Step 4 expectations of Tasks 2.6, 2.8, and 2.9.
- Cost of not changing: the PR cannot reach the green gate at Task 2.15 without unplanned edits to RED tests. Because CI is red from Task 1.1 anyway (finding 4), none of this shows until the end.

#### 3. Medium and Hard banks get cached in the same small store as the learner's stats, with no budget (major, axis 6)

- Tasks: 2.5, 2.6, Cross-area decision 5, Global Constraints "Banks"
- Evidence:
  - **The plan's design and sizes.** Cross-area decision 5 says: "Opening a track's difficulty step downloads that track's Medium and Hard banks ... Roughly 400 KB per visited track". The spec says "Bundle size stays at about 2.2 MB instead of 6.5 MB", so Medium and Hard together are about 4.3 MB. The Easy banks alone are 2,152,932 bytes (`du -bc content/*/easy.json`).
  - **Where banks are cached.** Task 2.6 caches every download under the shared key (`writeCachedBank` writes `syntactical.content.v1.bank.<lang>.<diff>` through `writeJson`). `clients/readJson.ts:3-4` says "On the web AsyncStorage is backed by localStorage".
  - **What fails when the store is full.** The learner's stats share the store: `state/StatsProvider.tsx:92-100` (`writeJson(slot.key, next)`) and `:112-114` (`throw new Error('event log change was not persisted')`). `clients/writeJson.ts:7-14` returns false on a failed write.
  - **Startup reads every bank.** `state/ContentProvider.tsx:47-62` (`readAllCachedBanks`) reads and validates every cached bank before the first render.
- Problem: Nothing bounds the content cache. Browsers cap localStorage at about 5 MB per origin. React Native AsyncStorage on Android has a documented 6 MB default database size; that is unverified here because `node_modules` is absent.
  - A learner who opens most tracks' difficulty steps, plus Easy banks refreshed after a content update, approaches 6.5 MB of bank JSON in that store.
  - After that, stats writes fail: answers stay in memory and are lost on reload, and the guest claim on sign-in throws. Bank writes fail too, so "plays the cached copy after a restart with no network" (Task 2.5) stops holding.
  - Startup hydration also reads and validates up to about 6.5 MB of JSON before first render, roughly three times today's worst case.
- Change: Add a task after 2.6, "Content cache budget", with a RED test that fills the store with banks and asserts that a stats write still succeeds and that the oldest Medium or Hard bank is evicted.
  - **Cap:** keep at most N cached non-bundled banks (for example 6, about 2.4 MB), recording last use in a small index key, and evict least recently used on write.
  - **Better, on the web:** move bank bodies out of localStorage. Use IndexedDB or the Cache API; on native use the file system.
  - **Seam:** see "Modularization proposal": a `BankStore` behind `readCachedBank` and `writeCachedBank`.
  - **Startup:** have `ContentProvider` read banks lazily per bank instead of all slots at startup.
- Cost of not changing: guests who explore the catalogue on the web or on Android lose progress without any error, which is the worst failure for a learning app. The size grows with every track added.

#### 4. The 23-task red window hides the plan's wrong gates until Task 2.15; reorder as expand, then contract (major, axis 5)

- Tasks: header "How to execute this plan", "Sequencing inside the free-banks PR", Cross-area decision 6, all of areas 1 and 2
- Evidence:
  - **How long CI is red.** "that PR's CI is green only after Task 2.15". "root `npx tsc --noEmit`, the app Jest suites, and the server suites: red from 1.1 ... until the app and server tasks of area 2".
  - **The push rules contradict each other.** "each opened as a draft at its first RED commit and pushed after every GREEN" against "Do not push the branch for review between 1.2 and 1.4". The drift check is satisfied once Task 1.3 commits the regenerated files, so the window is 1.2 to 1.3. CI is red anyway.
  - **The per-task "still red" lists are already wrong.** Task 1.6 (finding 1), Task 2.6 Step 7, and Tasks 2.8 and 2.9 (finding 2).
- Problem: For 8 + 15 tasks on four workspaces, CI gives no signal. The only check is each task's hand-written list of expected failures, and at least four of those lists are wrong. Every defect lands at once at Task 2.15. The settled decision fails concretely here: findings 1 and 2 are exactly the kind of error a green-per-task CI would catch at the task that caused it.
- Change: Split Task 1.1 into expand and contract steps, and order the work so every workspace stays green after each task.
  1. **1.1a (expand).** `BankEntry.access` and `productId` become optional and ignored; the validator accepts entries with or without them. No version change.
  2. **Content.** 1.2 (import), then 1.3 and 1.4 (build).
  3. **Pipeline.** 1.5 to 1.7.
  4. **App, server, deploy, and e2e.** Area 2.
  5. **1.1b (contract), last.** The retired-key rejection, plus whatever finding 2 decides about the version, and the fixture updates.

  Only the paid-behaviour suites go red, and each goes red inside the task that removes that behaviour. This also allows two PRs: content and pipeline, then app, server, and deploy.

- Cost of not changing: a long debugging tail at the end of the branch, and the implementer is likely to "fix" RED tests (forbidden) to reach green.

#### 5. Later areas anchor on code that areas 1 and 2 already rewrote; `legacyPaidProducts` is never removed (major, axis 2)

- Tasks: 2.3, 2.7, 2.9, 2.15; area 3 (the `startServer.ts` step quoted at plan line 5048, Task 3.8); Task 4.3; Task 5.3
- Evidence:
  - **`startServer.ts` (area 3 against Task 2.9).** Task 2.9 writes `admin: { database: pool, paidProductIds: LEGACY_PAID_PRODUCT_IDS, ... }` and has no derived `paidProductIds` line. Area 3 (plan line 5048) says: "Delete the `LEGACY_PAID_PRODUCT_IDS` declaration area 2 added and the line that builds `paidProductIds` from it ... replace `admin: { database: pool, paidProductIds, rateLimitKeySecret: env.RATE_LIMIT_KEY_SECRET },`". That text does not exist after Task 2.9. Area 3 never mentions deleting `server/src/constants/legacyPaidProducts.ts` or `legacyPaidProducts.test.ts` (grep of the plan after line 4775 finds neither), and the `buildLegacyPaidProductIds` import stays.
  - **`ask.ts` (Task 3.8 against Task 2.9).** Task 3.8 quotes `ask.ts` lines 22-23 (`hasAnyEntitlement` and `hasEntitlement` imports), line 40 (`paidBanks`), and lines 72-79 (the `paidBank` block). Task 2.9 Step 5 already deleted or replaced all of them. Area 3's own open question (plan line 8806) admits: "I assumed ... that `AskDeps.paidBanks` and the `ask.ts` gate still exist".
  - **Task 5.3 against Task 2.3.** Task 5.3 anchors on "`const PURCHASE_PENDING = ...` (line 24)" and "imports, lines 13-19" of `app/[language]/index.tsx`, which Task 2.3 replaced as a whole file without that constant.
  - **Task 4.3.** It says "area 3 removed its only importer from `app/[language]/index.tsx`" and that the paywall suites "area 3 deleted". It was area 2 (Task 2.3).
- Problem: Line numbers are allowed to drift, but the plan's rule is "the quoted text, not the number, identifies the lines to replace", and here the quoted text is gone. Area 3 is security-touching and owner-merged, so ambiguity there is costly. The legacy module and its test survive as dead code, and the docs rows Task 2.15 writes point at it.
- Change:
  - Rewrite area 3's `startServer.ts` step against Task 2.9's output. Delete `legacyPaidProducts.ts`, its test, and the import. Re-quote Task 3.8 against Task 2.9's `ask.ts` (the single `if (!(await hasAnyEntitlement(database, userId))) {` gate).
  - Rewrite Task 5.3's anchor as "after the imports of the version Task 2.3 wrote".
  - Fix the attribution in Task 4.3.
  - Simpler still for Task 2.9: since nothing can be bought, pass the 24 ids as a literal constant in `startServer.ts` and drop the module, test, and docs row (Tasks 2.7 and 2.15 shrink).
- Cost of not changing: guesswork in the owner-gated area 3, and an orphan module whose test still asserts "24 Medium and Hard products".

#### 6. The rollback window closes as soon as the owner deletes the content deploy key (minor, axis 6)

- Tasks: 1.2 Step 9, 2.12, 2.15
- Evidence:
  - **The plan's instructions.** Task 1.2: "After the free-banks PR merges, the owner archives `nullvoidundefined/syntactical-content`". Task 2.12 line 50: "The old `CONTENT_DEPLOY_KEY` secret is no longer read; delete it, and remove its read-only deploy key". Task 2.15: "delete it, and remove its read-only deploy key".
  - **Why that matters.** Production server deploys are manual (`.github/workflows/server-deploy.yml:66`). The old workflow refuses to deploy production without the key (`server-deploy.yml:95-99`).
- Problem: Once the key and secret are gone, reverting the merge cannot deploy production. The only remaining path is a forward fix, and the plan names no rollback for a bad import or a failed server cutover.
- Change: In Tasks 2.12 and 2.15, tell the owner to keep the secret and deploy key, and to leave the repo archived but readable, until production has run the new image for an agreed soak (for example one week). Add one line naming `git revert -m 1 <merge>` as the rollback.
- Cost of not changing: a bad content import or server start-up failure in production can only be fixed forward, under pressure.

#### 7. Review rounds cannot see Medium or Hard banks downloaded this session or never opened on this device (minor, axis 6)

- Tasks: 2.5, 2.6, Cross-area decision 5
- Evidence:
  - **The review index reads only local copies.** `services/review/buildQuestionIndex.ts:1-4`: "read only from local copies (cached or bundled) ... A bank with no local copy (an uncached paid bank) contributes nothing, and its questions are skipped by every review". `state/useReviewQueue.ts:15` reads `readLocalBank`.
  - **That snapshot is fixed at startup.** `state/ContentProvider.tsx:69-76` builds `readLocalBank` from the startup snapshot. Task 2.6 keeps that shape and keeps the prefetch to "banks the device already has".
- Problem: Before this plan, every free bank was bundled, so the review index always found it. Now two thirds of the catalogue is local only after a first visit:
  - A signed-in learner on a new device or after a reinstall gets no reviews for synced Medium and Hard answers until they open each track's difficulty step.
  - A bank downloaded in this session stays invisible to reviews until restart.
  - If finding 3's quota is hit, those reviews never appear.
- Change: In Task 2.6, extend the prefetch rule so it also fetches banks named by the learner's due review items. Have `readLocalBank` fall back to the query cache (`['bank', lang, diff, hash]`). Add a case to `prefetchChangedBanksFirstUse.test.ts`.
- Cost of not changing: due reviews silently missing for the banks learners care most about. The quiz engine is untouched, but the review experience changes, against Global Constraints "No change to ... review scheduling".

#### 8. The server silently skips a listed bank whose file is missing; every bank is now required (minor, axis 3)

- Tasks: 2.9, "Open questions (area 2)" item 2
- Evidence:
  - **The plan keeps the skip.** Task 2.9's `readServerQuestions` keeps "A bank the manifest lists but the directory lacks is skipped". Before, a missing paid bank threw (`server/src/services/readServerQuestions.ts:50`, `throw new Error(\`Paid bank missing: ${path}\`)`).
  - **The answer key depends on it.** `server/src/services/readServerManifest.ts:1-3` says the answer key exists to "reject unknown banks".
- Problem: Any start path that skips `copyContent.mjs` boots with a partial index. That includes the e2e `CONTENT_DIR` and local runs. Sync then rejects that bank's answer events and Ask answers 404, with no start-up error. Nothing is paid now, so there is no reason to tolerate a missing bank.
- Change: In Task 2.9, make a missing listed bank throw `Bank missing: <path>`. Flip the `readServerManifest.test.ts` case "skips a manifest bank whose file is missing" to expect the throw, and add a case to `startServerPublicContent.integration.test.ts`.
- Cost of not changing: lost answer events for a whole bank from a misconfigured deploy, discovered from learner reports.

#### 9. Wrong line references, and Step 4 checks that will not print what they claim (minor, axis 1)

- Tasks: 1.1, 1.5, 1.8, area 2 "Resolved"
- Evidence:
  - **Task 1.5 lines.** It edits "`pipeline/src/commands/applyStaging.ts` (lines 1-5, 162-163)", but the file is 65 lines and the `access` filter is at lines 42-43.
  - **Task 1.1 grep.** Step 4 expects `grep -rn "access\|productId" src` to print "only `RETIRED_KEYS` ... and the cases in `validateManifestFreeBanks.test.ts`". Task 1.1's own `supportedSchemaVersion.ts` comment contains "`access` and `productId`", so the grep prints it as well.
  - **README `server/` row.** Task 1.8 leaves the README `server/` row, "it belongs to area 2's server tasks". Area 2 says "Resolved: the root `README.md` ... is covered by area 1's Task 1.8 and area 7's Task 8.6, so this area leaves it alone". The row stays stale until area 8, and "area 7's Task 8.6" is mislabelled.
- Problem: An agent that verifies exact output stops on a false alarm or edits the wrong lines.
- Change: Fix the numbers and the expected grep output. Give the README `server/` row to Task 2.15.
- Cost of not changing: wasted `DISPUTE` cycles.

#### 10. Paid-only code and tests outlive the paid banks (minor, axis 7)

- Tasks: 2.6, 2.9
- Evidence:
  - `clients/apiClient.ts:17-23,61-68`: `responseType: 'text'` exists "for a caller that verifies the bytes, such as a paid bank". Its only caller is `services/content/loadQuestionBank.ts:65`, which Task 2.6 deletes. `clients/__tests__/apiClientText.test.ts:24` exercises `apiFetch('banks/python/medium', { responseType: 'text' })`.
  - `app/__tests__/signInReturnTo.test.tsx:73` and `signInPassword.test.tsx:169` test "returns to the paid bank paywall".
  - `services/review/buildQuestionIndex.ts:3` says "(an uncached paid bank)".
  - Owner-scoped keys `syntactical.content.v1.paid.*` (`constants/contentCacheKeys.ts:6`) are left in storage with no cleanup.
- Problem: Dead options and tests that describe retired behaviour, and orphaned storage. The orphaned keys add to finding 3 on devices that held an admin grant.
- Change: In Task 2.6, drop `responseType` and its test, rename or rewrite the two sign-in cases around a neutral `returnTo`, fix the comment, and remove keys with the `syntactical.content.v1.paid.` prefix once during hydration.
- Cost of not changing: small but permanent confusion, and a few hundred KB of orphaned storage per affected device.

#### 11. Many tests copy the whole content tree, which triples in size (idea, axis 5)

- Tasks: 1.3, 1.4, 1.5, 2.11, "Open questions (area 2)" item 6
- Evidence:
  - **New tests.** `buildContentManifestEveryBank.test.ts` and `buildContentManifestUnlistedBank.test.ts` run `cp(REPOSITORY_CONTENT_DIR, contentDir, { recursive: true })` in `beforeEach`. So does `applyStagingEveryBank.test.ts`.
  - **Existing tests that do the same.** `applyStaging.test.ts`, `writeReferences.test.ts`, `draftTaxonomy.test.ts`, and several `scripts/__tests__/buildContentManifest*.test.ts`.
  - **The image check.** `check-api-image` now always stages the real content.
  - **The size.** The tree goes from about 2.2 MB to about 6.5 MB, and Task 1.3's misconception cases also rewrite all 36 banks through `stripMisconceptionLinks`.
- Problem: Test time and disk churn grow about threefold for suites that need one track.
- Change: Give the copying tests a helper that copies the manifest plus one track's three banks (and prunes the manifest to that track). Keep one full-tree test for the build.
- Cost of not changing: slower CI on every PR. It is not a correctness issue.

### Modularization proposal

**A `BankStore` seam for the app's content path (replaces finding 3's cap and finding 7's fallback; changes Tasks 2.6 and 7.1).** Today the loading path is spread over five places that each assume something about the others:

- `ContentProvider` snapshots every cached bank at startup and builds a synchronous `readLocalBank`.
- `useQuestionBank` decides between local and download.
- `buildBankQuery` and `loadQuestionBank` fetch, verify, validate, and write.
- `prefetchChangedBanks` decides refresh policy.
- The build script's `BUNDLED_DIFFICULTIES` decides what is bundled, which the app only learns implicitly when `readBundledBank` returns null.

Proposed interface:

```ts
type BankStore = {
  read(language: string, difficulty: string, context: BankContext): Promise<CachedBank | null>; // cached, else bundled
  write(language: string, difficulty: string, bank: CachedBank): Promise<boolean>; // applies the budget and LRU eviction
  listLocal(): Promise<ReadonlyArray<{ language: string; difficulty: string; hash: string }>>;
};
```

How it would be used:

- **Platforms.** It ships as `bankStore.ts` (AsyncStorage or the file system) and `bankStore.web.ts` (IndexedDB), matching the repo's `.web.ts` split.
- **Callers.** `useQuestionBank` gets a bank through one React Query key, `['bank', lang, diff, hash]`, whose `queryFn` tries `read` and then the network. `readLocalBank` becomes a thin wrapper over the query cache, so reviews see this session's downloads. `prefetchChangedBanks` iterates `listLocal()` instead of the manifest.
- **Startup.** `ContentProvider` stops reading every bank at startup, which also removes most of the reason for Task 7.1's `isHydrated` flag on banks.
- **Task count.** Net task change: +1 (the store with its budget test). Task 2.6 shrinks, and Task 7.1's `useQuestionBank` edits become unnecessary.

**Expand, then contract, for the schema (finding 4).** This is not a module but a reordering: Task 1.1 splits into 1.1a and 1.1b, a net +1 task, and the red window drops to zero. If finding 2's option (a) is taken, 1.1b shrinks to the retired-key rule alone.

**Not worth a shared module.** Several loops do "for each manifest bank, act on its file": `copyContent.mjs` (server image), `writeFixtureContent.ts` (e2e), `assertNoUnlistedBanks` (build), Task 1.2's verification loop, and `readServerQuestions`. Each is under 20 lines, runs in a different runtime (shell plus Node script, Playwright, tsx build, server), and enforces a different rule. Sharing them would couple the image build to the app build for no failure mode removed. Duplication is the cheaper choice here.

### Verified claims

- **Task 1.1 file contents.** `findBankEntryProblem.ts:1-21`, `validateManifest.ts` lines 12, 28-37, 52, and 72, `supportedSchemaVersion.ts:1-2`, `index.ts:10`, and `BankEntry.ts:1-8` match the quoted text.
- **Task 1.1 RED prediction holds.** Schema 3 is rejected as "schemaVersion is not supported". Schema 2 without `access` yields `languages[0].banks.easy.access is invalid`. A missing named export reads as `undefined` under Vitest.
- **`SUPPORTED_SCHEMA_VERSION` readers.** It is read by `validateQuestionBank.ts:187`, `services/content/readCachedBank.ts:25`, and the pipeline's `fillBank.ts`, `generateBatch.ts`, and `publishBank.ts`, as area 1's open question 1 says. Keeping it at 2 for banks is consistent.
- **Manifest shape for Task 1.2 Step 4.** `content/manifest.json` has 36 `"access"` lines and 24 `"productId"` lines, each on its own line. `JSON.stringify(manifest, null, 2) + "\n"` reproduces the file byte for byte, so the diff stat of 1 insertion and 61 deletions holds.
- **Task 1.2 paths.** `content/paid-content.ref` is `0fd7296fd7ad525fcc24bab3ea3d9e943c4845f0`. The private repo layout `<track>/<difficulty>.json` matches `stageBuildContent.sh:52-54`. The 12 track ids match the manifest order.
- **Task 1.2 deletions and build script.** `scripts/assertNoPaidBanks.mjs`, `paidContentRef.test.ts`, `noPaidQuestionIds.test.ts`, and `publicContentTree.test.ts` exist. The `package.json` `build` script is quoted exactly.
- **Task 1.3 line references.** `buildContentManifest.mjs` lines 21, 73-125, 179-182, 220-245, and 247-280 match the quoted code.
- **Task 1.3 RED predictions hold.** With no `access` the old code reads every bank from `content/`. The "ships an entry only a Medium card links" case passes and "drops an entry the manifest lists" fails with `[ENTRY_A, ENTRY_B]`. `stripMisconceptionLinks` covers every bank.
- **Root Jest content-schema source.** Root Jest maps `@syntactical/content-schema` to source (`jest.config.js`), and so do the server and pipeline Vitest configs. Tests never read a stale build.
- **Task 1.5 RED holds.** `applyStaging.ts:42-43` skips every bank without `access: 'free'`, so the tally is `{ references: 0, rationales: 0 }`.
- **Task 1.6 RED holds.** `loadCommandManifest` calls `assertContentRootUsable(undefined, ...)`, whose error passes `undefined` to `sanitizeLogText`, giving `Cannot read properties of undefined (reading 'replace')`.
- **Task 1.6 coverage of content-root code.** Its edits cover every `contentRoot` and `resolveBankFile` user in the files it lists, and `CliDeps` matches the fields Task 1.7's `buildDeps` supplies.
- **Task 2.2 RED holds.** `app/[language]/index.tsx:32-33` calls `useEntitlements()` (GET `me`) and `usePurchases({ shouldLoadPrices: true })`.
- **Task 2.5 prefetch RED holds.** `prefetchChangedBanks.ts:23-24` fetches any bank whose local copy is missing once `access` is gone.
- **Task 2.6 coverage.** `paidBankPrefix` is used only by `buildBankCacheKey.ts` and one deleted test. No surviving app test outside the deleted suites depends on `'locked'`, the owner cache, or `apiFetch('banks/...')`.
- **Area 7 consumes Task 2.6's text correctly.** Its edits to `useQuestionBank` quote the `enabled` line exactly as Task 2.6 writes it.
- **Task 2.7 RED holds.** `PAID_CONTENT_DIR` is required, never stubbed, and refined to an absolute path (`server/src/config/env.ts:35-40`).
- **Task 2.9 file coverage.** Its delete and modify lists cover every server file that names `paidBanks`, `PaidBank`, `PAID_CONTENT_DIR`, `readPaidBanks`, `createBanksRouter`, `isInsideDir`, or `assertPaidDirSeparate`.
- **Task 2.9 line references.** `startServer.ts:25,96-102,122,129,149,163`, `app.ts:30-31,53-54,78,150-153`, and `ask.ts:22-23,40,72-79` match the quoted text.
- **Task 2.10 RED predictions hold.** `copyContent.mjs` exits 2 without a tier argument. Private mode exits 1 on the missing `paid-content.ref` in the temp copy. `deployToRailway.sh:27-28` requires `build/paid-content`.
- **Task 2.11 coverage.** Its Dockerfile, `Dockerfile.dockerignore:21`, `server.yml:38-45`, `server-deploy.yml:3-6,57-59,95-102`, and `check-api-image/action.yml` edits cover every `CONTENT_DEPLOY_KEY` and `paid-content` reference under `.github` and `server/`. `checkImageHealth.sh` and `scanImageForKeys.sh` name neither.
- **Task 2.13 and 2.14 coverage.** The e2e references to paid content are exactly `global-setup.ts:67,71,89,103,138`, `e2eEnv.ts:17`, `startWebHost.ts:3`, `writeFixtureContent.ts`, `paidBank.spec.ts`, `apiOutage.spec.ts:44-47`, and `modalOverlays.spec.ts:17-27`.
- **Old manifests degrade gracefully on the live web.** `readCachedManifest` returns null for an invalid cached manifest, so the provider falls back to the bundled one (`ContentProvider.tsx:65`). An open tab on the old bundle rejects the new manifest and keeps its own (`loadLanguageManifest.ts:31-33`).
- **Unverified:** whether every misconception id that Medium and Hard cards link is in the approved `pipeline/taxonomy/<language>.json`. If one is not, Task 1.3's first rebuild fails validation. The paid banks are not in this checkout.
- **Unverified:** the exact localStorage and Android AsyncStorage limits in finding 3, which come from platform documentation because `node_modules` is not installed.

---

## Appendix B: Areas 3, 4, and 9: Pro on the server and in the app, model failover

Full report of reviewer B. Finding numbers here are the ones cited above as B1, B2, and so on.

### Summary

Counts: 0 blocker, 6 major, 13 minor, 3 idea.
The three changes that matter most:

1. Gate `POST /v1/test/webhook` behind a `startServer` option that only `e2e/support/runApi.mts` passes, as the other test seams already are, instead of `NODE_ENV` alone (finding 1).
2. Make the webhook state machine handle what RevenueCat actually sends: check the event type before the full schema, handle `TRANSFER` so restore on another account works, and treat a `CANCELLATION` with `cancel_reason: CUSTOMER_SUPPORT` (a refund) as a revoke on the annual (findings 2 and 3). Refuse `SANDBOX` events in production (finding 6).
3. Classify failures so that a learner's message can never open a 15-minute breaker or reach the other vendor. An OpenAI 400 for a flagged prompt is a decline, not a config failure (finding 4). Also fix the privacy pages: Task 9.9 anchors on an Anthropic line that does not exist (finding 5).

### Findings

#### 1. The test-only webhook is guarded by an environment variable alone, unlike every other test seam (major, axis 3)

- Tasks: 3.9, 3.11, 4.15
- Evidence: Task 3.9 says "`startServer` passes `testWebhook` only when `env.NODE_ENV === 'test'` ... so no new env flag", and Step 3 adds `const isTestWebhookMounted = NODE_ENV === 'test';` (plan line 8552). Task 3.11 relies on this: "Railway runs `NODE_ENV=production`, so it never exists there" (line 8736). Today each test seam is gated twice. It is an injected `StartOptions` field that the production entrypoint never passes (`server/src/index.ts`, `startServer(process.env, { logger })`), and it is also refused outside test (`server/src/startServer.ts:84-92`). `NODE_ENV` defaults to `development` (`server/src/config/env.ts:34`), and Railway's value is a dashboard variable (`server/DEPLOY.md:11,77,97`).
- Problem: one variable mistake on a Railway environment (`NODE_ENV=test`, for example to get the injected seams while debugging) turns on an unauthenticated route. The route records any `NON_RENEWING_PURCHASE` for any `app_user_id`, so anyone could grant lifetime Pro to any account. The compiled route also ships in every production image, because it sits in `src/routes` and `tsconfig.build.json` builds all of `src`. The plan's Global Constraints line 46 accepts this ("or by `NODE_ENV=test` on the server").
- Change: in Task 3.9, add `StartOptions.testWebhook?: boolean`. Refuse it outside `NODE_ENV=test` with the same throw as the other seams, and mount the route only when the option is true. Task 4.15 already edits `e2e/support/runApi.mts`; it passes `testWebhook: true` there. Task 3.9's RED test calls `startServer(buildSource('test'), { logger, testWebhook: true })`. Add one case: `NODE_ENV=test` without the option answers 404, and the option with `NODE_ENV=development` throws. Change the Global Constraints "Fixtures" line and Task 3.11's DEPLOY.md paragraph to match.
- Cost of not changing: an env-var typo becomes a free-Pro-for-anyone endpoint, guarded by nothing but that one variable.

#### 2. Restore on another account never grants Pro: `TRANSFER` is ignored, and unhandled types are validated against the full event schema first (major, axis 3 and 6)

- Tasks: 3.3, 3.9 (shared handler), 3.10, 4.5, 4.8
- Evidence: Task 3.3's test pins `TRANSFER` as "200 ignored, records nothing" (plan line 5390). The handler runs `revenueCatSchemas.webhook.safeParse` before the type check (`server/src/routes/revenueCatWebhook.ts:73-82`, moved unchanged into `revenueCatEventHandler.ts` by Task 3.9). The schema requires `app_user_id` and `product_id` on every event (`server/src/schemas/revenueCatSchemas.ts:9,12`). The app's identity is the server user UUID (the `purchaserQueue` identifies the SDK), and account deletion keeps the row with `user_id` NULL (Task 3.10; migration `1790985600006`: `onDelete: 'SET NULL'`). Restore reports success whenever GET /me answers: Task 4.5 `return (await refetchProStatus()) !== null;` (line 10451), shown as `RESTORE_DONE = 'Purchases restored.'` (`app/settings.tsx:23`).
- Problem: a user deletes their account and signs up again with the same email, or signs in on a second account, then taps Restore. RevenueCat moves the receipt with a `TRANSFER` event (its default transfer behaviour). The server ignores that event, the new account never becomes Pro, the old row stays granted with no user, and the app says "Purchases restored." Unverified (no network to RevenueCat's docs): to my knowledge a `TRANSFER` payload carries `transferred_from` and `transferred_to` and no `product_id`. If so, it fails the schema with 400, not "200 ignored", so RevenueCat retries it. The plan's own Resolved question ("Unhandled webhook types. Answered 200 and not stored") is then false for it, and for any future type without those fields.
- Change: (a) In Task 3.9's handler, parse `{ event: { type } }` with a minimal schema first. Answer 200 `ignored` for an unhandled type, and validate the full schema only for handled types. Add a case to Task 3.3: an unhandled type with no `product_id` and no `app_user_id` answers 200 `ignored`. (b) New Task 3.3a, "TRANSFER moves Pro": accept `TRANSFER` with `transferred_from` and `transferred_to` arrays of ids. For each UUID in `transferred_to` that names a user, record the event and recompute both Pro products. The recompute must read events by original purchaser, which needs `purchase_events` rows reassigned (UPDATE `user_id` for the `transferred_from` ids, under the advisory lock) or a `revenuecat_customer` mapping. Pin with an integration test: a lifetime bought on user A, then a `TRANSFER` from A to B, leaves B Pro and A not. (c) In Task 4.5, `restore` resolves true only when `pro.isPro` is true, and Settings says "No purchases to restore on this account" otherwise.
- Cost of not changing: paying users who reinstall onto a new account, or recreate theirs, lose Pro. The app tells them restore worked. Support has no path except the admin toggle, which only grants the admin's own account.

#### 3. The refund path for the annual depends on an event type RevenueCat may not send (major, axis 3; partly unverified)

- Tasks: 3.3, 3.4, 3.11
- Evidence: Task 3.3: `REVOKE_TYPES: ['EXPIRATION', 'REFUND']` and `EXPIRY_ONLY_TYPES: ['CANCELLATION']`. On the annual, "`CANCELLATION` never changes status" (`revokeTypesFor`, plan Task 3.3 Step 3). Task 3.11's runbook says "`EXPIRATION` and `REFUND` revoke" (line 8730). `cancel_reason` is already in the payload allowlist (`server/src/constants/revenueCatEvents.ts:17`).
- Problem: unverified (no network): as far as I know RevenueCat has no `REFUND` event type (it has `REFUND_REVERSED`). It reports a store refund as `CANCELLATION` with `cancel_reason: 'CUSTOMER_SUPPORT'`. Under the plan, an annual refund is expiry-only. The refunded subscriber then keeps Pro until whatever `expiration_at_ms` that event carries. If RevenueCat sends the original period end, a refunded annual stays Pro for up to a year, and `hasPro` stays true. Every test pins `REFUND` revoking, so CI stays green either way.
- Change: in Task 3.3, add a rule and a test: a `CANCELLATION` whose stored `payload->>'cancel_reason' = 'CUSTOMER_SUPPORT'` revokes on both products. In SQL, add it to the revoke predicate in `readStatus` (Task 3.4). Keep `REFUND` in the list as harmless. Add `REFUND_REVERSED` as a grant type only if the owner wants a reversal to restore access. Add a cutover check to Task 4.16: refund a sandbox annual and confirm `pro.isActive` goes false.
- Cost of not changing: refunds may not revoke the annual, which the brief names as the first security concern for this area.

#### 4. An OpenAI 400 for a flagged prompt opens a 15-minute breaker and resends the learner's message to Anthropic (major, axis 3; partly unverified)

- Tasks: 9.2, 9.3, 9.4, 9.7
- Evidence: Task 9.2: "status 400, 401, 403, or 404 is `config`" (line 22876). `CONFIG_STATUSES = new Set([400, 401, 403, 404])` in `ModelProviderError`. Task 9.3 maps OpenAI failures "exactly as in Task 9.2". Task 9.4: a rejection "moves to the next" provider, and one config failure "opens it for `CONFIG_COOLDOWN_MS`". Spec section 6 and Global Constraints: "a refusal ... is final and never sent to the other vendor".
- Problem: unverified (no network): OpenAI's Responses API answers some prompts flagged by its usage-policy screen with HTTP 400 (`invalid_prompt`) rather than a `refusal` content item. With `MODEL_PRIMARY=openai`, one learner's crafted message then (a) is sent on to Anthropic, which the spec forbids, and (b) skips OpenAI for every learner for 15 minutes. A user can repeat it at the burst limit (`ASK.RATE_LIMIT.PER_USER = 10` a minute) and keep the primary disabled. A 400 also comes from request-shape problems unrelated to config.
- Change: in Task 9.2, put one `classifyModelFailure(status, code)` in `ModelProviderError.ts` with three outcomes: 401, 403, and 404 are `config`. A 400 whose error code marks the prompt (OpenAI `invalid_prompt`, or a content-policy code) is a decline: the provider resolves `null`, final, with no breaker. Any other 400 is `transient`, so it fails over for this request but takes three in a row to open the short breaker. Add a test to Task 9.3 for a 400 `invalid_prompt` that resolves `null`, and one to Task 9.4 showing one 400 does not open the config breaker. Task 9.7 then reuses the same classifier (see finding 15).
- Cost of not changing: the spec's one hard privacy rule for failover can be broken by user input, and one user can take the primary out of service.

#### 5. Task 9.9 edits a privacy line that does not exist; Anthropic is not a listed processor today (major, axis 1 and 3)

- Tasks: 9.9 (and area 8, which only checks against these pages)
- Evidence: Task 9.9: "In `app/privacy.tsx`, where the processors are listed beside Anthropic, add ... in the same sentence style as the Anthropic line" (line 23924). At `6f12b7c`, `app/privacy.tsx:56-66` lists Neon, Railway, GitHub Pages, Resend, RevenueCat, PostHog, Apple and Google, and no Anthropic. `app/delete-account.tsx:40-46` names no model vendor. `docs/store/privacy-labels.md:49` names "RevenueCat, Resend, PostHog, and our host". `git grep -n Anthropic 6f12b7c -- app/privacy.tsx app/delete-account.tsx` prints nothing.
- Problem: the step cannot be followed as written. If an implementer appends the OpenAI line anyway, the policy names the fallback vendor and still omits the primary one, which receives every learner question today.
- Change: rewrite Task 9.9 Step 3 to add two processor lines, Anthropic (primary) and OpenAI (fallback), to `app/privacy.tsx`'s "Who processes it for us" list. Add both to `docs/store/privacy-labels.md:49`, and add both vendors' retention to `app/delete-account.tsx`'s vendor list. Add one assertion to `app/__tests__/privacyPage.test.tsx` that both names render, so the line cannot be dropped later.
- Cost of not changing: the published policy omits a processor that receives user-written text, which is the store-label risk the brief asks about.

#### 6. Sandbox purchases grant Pro on the production server, and the runbook relies on it (major, axis 3)

- Tasks: 3.3, 3.11, 4.16
- Evidence: Task 3.11's DEPLOY.md text: "a sandbox purchase of either product then shows `"pro": { "isActive": true, ... }` on `GET /v1/me`" (line 8738). Every Pro test event uses `environment: 'SANDBOX'` and is granted (Task 3.3 `buildEvent`). `recordPurchaseEvent` never reads `environment`; it is only stored (`server/src/constants/revenueCatEvents.ts:9`).
- Problem: TestFlight and Play license-test purchases are free sandbox transactions. Anyone on a public TestFlight link, or App Review, can buy the lifetime product for nothing and get permanent production Pro. Sandbox annuals expire quickly; sandbox lifetimes never do.
- Change: in Task 3.3 add `REVENUECAT_ACCEPT_SANDBOX` (boolean env, default false; staging sets it true). In `recordPurchaseEvent`, a `SANDBOX` event is recorded but recomputes nothing unless the flag is set, and the server logs `{ eventType, reason: 'sandbox' }`. Pin both cases. In Task 3.11, move the "sandbox purchase" deploy check to staging. An alternative with no code: set RevenueCat's webhook environment filter per project. The code guard is cheaper to verify.
- Cost of not changing: free lifetime Pro for any beta tester, with no record separating those grants from paid ones.

#### 7. Adding `id` and `model` to `ModelProvider` breaks two inline providers that no task updates (minor, axis 1 and 2)

- Tasks: 9.2, 4.15
- Evidence: Task 9.2: "`ModelProvider` gains `readonly id: ProviderId; readonly model: string`", and its GREEN expects `npm run typecheck` to exit 0. `server/src/__tests__/routes/studyNote.integration.test.ts:198` builds `const model: ModelProvider = { answer: () => ... }`, and `server/tsconfig.json` includes all of `src`. Task 4.15 adds `modelProvider: { answer() { ... } }` to `e2e/support/runApi.mts` (line 14667), which `npm run typecheck:e2e` checks against `StartOptions.modelProvider` (`e2e/tsconfig.json` includes `**/*.mts`).
- Problem: Task 9.2's own typecheck gate fails on the study-note suite. Whichever of Task 4.15 and Task 9.2 lands second (areas 4 and 9 run in parallel) leaves `typecheck:e2e` red.
- Change: Task 9.2 lists `studyNote.integration.test.ts:198` and adds `id: 'anthropic', model: 'fake'` there. Task 4.15 uses `createFakeModelProvider({ answer: FIXTURE_ANSWER })` from `server/src/testing/fakeModelProvider.ts` instead of an inline object, so it follows the interface whichever area lands first.
- Cost of not changing: a red gate and a `DISPUTE` round in two areas.

#### 8. The fixture store is still in the production bundle; the guard test checks source text, not the graph (minor, axis 3)

- Tasks: 4.13, 4.14; header "Global Constraints" and Review Focus 18
- Evidence: Review Focus 18: "absent from the production import graph" (line 71). Global Constraints line 46: "a test fails if a fixture module is reachable from the production import graph". Task 4.14 reaches the fixture with `require('./purchaseStoreClient.fixture')` inside `selectPurchaseStoreClient`, and the guard test only rejects static `import`/`export ... from`.
- Problem: Metro collects every literal `require()` as a dependency regardless of the branch around it, so the fixture module and its `test/webhook` request ship in every production web and native bundle. Only the runtime `isLoopbackUrl(apiBaseUrl)` check stops it from running. That check is sound, because `app.config.ts:44-50` refuses a non-loopback `E2E_API_BASE_URL`, but the stated property is false and nothing tests the bundle.
- Change: either correct the two header lines to "never selected outside a loopback API URL", or make the claim true. For the second, resolve the fixture through a Metro `resolver.resolveRequest` alias enabled only when `E2E_API_BASE_URL` is set. Then add a step to the e2e workflow that runs a production `expo export --platform web` and fails if `dist/` contains `test/webhook`.
- Cost of not changing: reviewers rely on a guarantee that does not hold. This is low runtime risk.

#### 9. Task 9.6's predicted RED failure is wrong, and its request body would fail GREEN (minor, axis 1)

- Tasks: 9.6
- Evidence: Step 2: "FAIL with a TypeScript or runtime error that `createFakeModelProvider` does not accept `id` or the `transient` failure (`Type '"transient"' is not assignable`)" (line 23711). Vitest does not typecheck. `createFakeModelProvider` falls through to `default` for an unknown `failure` (`server/src/testing/fakeModelProvider.ts:19-26`), so the "primary" resolves `'A short answer.'`. The test sends `{ choiceIndex: 0, message: 'Why?', questionId }` with no `bankKey`, and `askSchemas.create` is strict and requires `bankKey` (`server/src/schemas/askSchemas.ts:14-19`).
- Problem: RED fails with `expected 'A short answer.' to be 'From the fallback.'` (and `expected 200 to be 503`), not a type error. After GREEN, both cases answer 400.
- Change: correct the expected failure lines. Use Task 3.8's `askEasy(signed)` helper, which sends `bankKey`, `Origin`, and the bearer token.
- Cost of not changing: an implementer `DISPUTE` and a wasted round.

#### 10. Task 3.4 says a Review Focus 1 case passes at RED; it fails (minor, axis 1)

- Tasks: 3.4
- Evidence: Step 2: "The lifetime NULL case and the two Review Focus 1 cases already pass (pins)" (line 5882). The first Review Focus 1 case asserts `rowOf(target.userId, ANNUAL)` equals `{ expiresAtMs: FIRST_PERIOD_END, status: 'revoked' }`. After Task 3.3, `recomputeEntitlement` never writes `expires_at`, so the value is null.
- Problem: the RED commit body would misreport which cases fail.
- Change: say that the first Review Focus 1 case fails on `expiresAtMs` (null) and the second passes.
- Cost of not changing: a confusing RED record. Low.

#### 11. The active-Pro rule is written three times (minor, axis 4)

- Tasks: 3.5, 3.6, 3.7
- Evidence: the same `WHERE user_id = $1 AND product_id = ANY($2) AND status = 'granted' AND (expires_at IS NULL OR expires_at > $3)` appears in `hasPro` (line 6212), `listAdminAccess` (line 7195), and `readPro` in `readProfile` (line 7573).
- Problem: a future change to the rule (a grace period, a sandbox filter as in finding 6) must be made in three places, and the profile, the Ask limit, and the admin page can drift apart.
- Change: Task 3.5 produces `readActiveProRows(queryable, userId, now): Promise<Array<{ productId; source; expiresAt }>>` and `hasPro` as `rows.length > 0`. Task 3.6's `grantedSourceOf` and Task 3.7's lifetime-over-annual pick consume the rows. Net zero tasks.
- Cost of not changing: drift between what the server charges against (Ask) and what it reports (profile, admin).

#### 12. Annual-product rules are split across three modules (minor, axis 4)

- Tasks: 3.3, 3.4
- Evidence: `EXPIRY_ONLY_TYPES` in `revenueCatEvents.ts`; `kindsFor(productId)` with `requiresExpiry` in `recomputeEntitlement.ts` (line 5918); `isAnnualGrantWithoutExpiry` in `recordPurchaseEvent.ts` (line 6009) restating the SQL predicate in TypeScript.
- Problem: the warning and the status rule can disagree. For example, a future grant type added to `GRANT_TYPES` is warned about but `readStatus` filters on `$8 = GRANT_TYPES` from a separate parameter. Findings 3 and 6 would add a third and fourth rule in more places.
- Change: in `server/src/constants/proProducts.ts`, add `PRO_PRODUCT_RULES: Record<ProProductId, { cancellation: 'expiry' | 'revoke'; requiresExpiry: boolean }>`. `kindsFor` and `isAnnualGrantWithoutExpiry` read it.
- Cost of not changing: each fix to the state machine touches three files and risks a mismatch.

#### 13. Events that extend an annual are ignored, so a paying subscriber loses Pro early (minor, axis 6; unverified field details)

- Tasks: 3.3, 3.4
- Evidence: Global Constraints: "every other type is answered 200 and not stored". `expires_at` comes only from grant and `CANCELLATION` events (Task 3.4).
- Problem: RevenueCat's `SUBSCRIPTION_EXTENDED` (a store-granted extension) carries a later `expiration_at_ms`, and Apple's billing grace period keeps the entitlement active past the period end (signalled with `BILLING_ISSUE`). The server drops both, so `hasPro` turns false while the store still considers the user subscribed. They see sponsored cards and the free Ask limit.
- Change: add `SUBSCRIPTION_EXTENDED` to `EXPIRY_ONLY_TYPES`. For grace, treat a `BILLING_ISSUE` carrying a grace-period expiry as expiry-only, or document the gap in Task 3.11's runbook as accepted.
- Cost of not changing: support tickets from paying users, and sponsored cards shown to Pro subscribers.

#### 14. The single-provider time budget is not a bound (minor, axis 1 and 5; SDK detail unverified)

- Tasks: 9.1, 9.5
- Evidence: "With one provider the SDK keeps one retry (two attempts, 22 seconds worst case ...)" (line 22698). The app aborts at 30 s (`constants/appConfig.ts:35`, `ASK_FETCH_TIMEOUT_MS`, used by `services/studyNote/fetchStudyNote.ts:10` too).
- Problem: to my knowledge both SDKs wait out a `retry-after` header of up to 60 s before their retry. A 429 with `retry-after: 20` makes one request 11 + 20 + 11 s, past the app's 30 s. The server still reserves and counts the Ask use after the client has gone.
- Change: in Task 9.5 set SDK `maxRetries: 0` for every provider. Have the failover wrapper do the single retry itself, on the same provider when it is the only one. Pin the whole call at `2 * ATTEMPT_TIMEOUT_MS` with an injected clock test.
- Cost of not changing: occasional answers the learner never sees but is charged for.

#### 15. The in-process availability check is code the product does not need (minor, axis 7 and 4)

- Tasks: 9.7, 9.8
- Evidence: Task 9.7 adds `checkModelAvailability`, `startModelAvailabilityChecks`, two more SDK clients built in `startServer`, an interval and its teardown, and a second copy of the status classification ("classifies 400, 401, 403, and 404 as config", line 23738). Review Focus 17 justifies it as avoiding "one slow request".
- Problem: a retired model answers 404 at once, so the first learner hit is fast, not slow. Task 9.4's failover then answers from the secondary and logs the config error anyway. The daily check opens the breaker for only 15 of 1,440 minutes. What it adds is an error line during zero-traffic hours, at the cost of boot-time network calls and lifecycle code in `startServer`.
- Change: delete Task 9.7. Give Task 9.8's workflow a `schedule:` trigger (daily) that runs the smoke script with a `--models-only` flag, which calls each SDK's `models.retrieve` and exits 1 on 404, so GitHub notifies the owner. Net one task fewer. If the in-process check stays, move `retrieve` into each provider as `verify()` and reuse finding 4's classifier.
- Cost of not changing: more server surface and a second classifier that can drift from the first.

#### 16. The smoke script is outside every typecheck (minor, axis 1)

- Tasks: 9.8
- Evidence: `"model:smoke": "tsx scripts/modelSmoke.ts"` (line 23867) puts the file at `server/scripts/modelSmoke.ts`. `server/tsconfig.json` has `"include": ["src"]`, and the root `typecheck:workspaces` runs that config.
- Problem: tsx strips types without checking them. The script imports `loadEnv`, `readServerQuestions`, and the prompt builders, whose signatures areas 2 and 9 change. It can rot unnoticed until the owner runs it before a model switch.
- Change: put the script at `server/src/scripts/modelSmoke.ts` (and exclude it from `tsconfig.build.json` if it should not ship), or add `scripts` to `server/tsconfig.json`'s `include`.
- Cost of not changing: the one check meant to gate a model switch is broken when it is needed.

#### 17. Stale area numbers in area 4 point at the wrong producer (minor, axis 2)

- Tasks: 4.9, 4.11, 4.15
- Evidence: "Consumes (settled with area 2)" for the Ask and admin contracts (lines 11907, 12485), which area 3 produces. The admin test support comment says "(server, area 2)". Task 4.15 says "the `entitlements` table with `expires_at` (area 2)" (Task 3.2 adds it) and "replace whatever stand-in area 3 put there" (line 14524), which is area 2's Task 2.14.
- Problem: an implementer checking a contract looks in the wrong area.
- Change: replace them with "area 3 (Tasks 3.6, 3.8)", "Task 3.2", and "Task 2.14".
- Cost of not changing: lost time. Low.

#### 18. Between the area 3 and area 4 merges, the deployed app cannot read Pro or use the admin page (minor, axis 2)

- Tasks: 3.6, 3.7, "The areas" ordering
- Evidence: area 3 removes `entitlements` from `/v1/me` and makes `PUT /v1/admin/access` strict on `{ isGranted }` (area 3 open question 4 admits the 400). The app on `main` still reads `data.entitlements` (`state/useEntitlements.ts:19`) for `useCanAsk` (`state/useCanAsk.ts:8`) until Task 4.10. Area 9 depends on area 3 and runs beside area 4. A push to `main` deploys staging, and production is a manual run (`.github/workflows/server-deploy.yml:4-6`).
- Problem: if production is promoted while area 4 is open (for example to ship area 9), Ask disappears for the admin and any granted user, and the admin switch answers 400.
- Change: add one line to "The areas": "do not promote the server to production between the area 3 and area 4 merges". Alternatively, keep `entitlements` on the profile until Task 4.12 and drop it in a one-line follow-up.
- Cost of not changing: a broken production app for the length of area 4. That cost is small before launch.

#### 19. Web annual subscribers get no "Manage subscription" (minor, axis 6)

- Tasks: 4.8
- Evidence: `SUBSCRIPTION_MANAGEMENT_URLS = { android: ..., ios: ... }` and `readSubscriptionManagementUrl('web')` returns null (lines 11504, 11774). The web store is RevenueCat Web Billing (`clients/purchaseStoreClient.web.ts`).
- Problem: an annual bought on the web auto-renews with no cancel path in the app. Several US state auto-renewal laws require an online cancellation path where the subscription was sold.
- Change: read RevenueCat's `CustomerInfo.managementURL` (both `react-native-purchases` and `@revenuecat/purchases-js` expose it). Show "Manage subscription" whenever it is non-null, on all three platforms, and drop the hard-coded URLs.
- Cost of not changing: a compliance gap for web annual subscribers.

#### 20. Product ids and `normalizeProductId` live in both server and app (idea, axis 4)

- Tasks: 3.1, 4.1, 4.4
- Evidence: `server/src/constants/proProducts.ts` (Task 3.1) and `constants/proProducts.ts` plus `clients/normalizeProductId.ts` (Tasks 4.1, 4.4), with the same regex `/^[a-z0-9.]+:[a-z0-9-]+$/` and ids.
- Problem: they can drift. A shared workspace package would need Dockerfile `COPY` lines (`server/Dockerfile` copies each package by name), a build step, and Jest and Metro mapping, so for about 15 lines duplication is cheaper.
- Change: keep both copies. Add one root Jest test to Task 4.4 that imports `server/src/constants/proProducts.ts` (it has no imports of its own) and asserts the same ids and the same `normalizeProductId` results over one table.
- Cost of not changing: silent drift that a single test would catch.

#### 21. The Ask upsell is keyed on the number 5 (idea, axis 4)

- Tasks: 3.8, 4.10
- Evidence: Task 4.10: "limit 5 says "That is the free tier's 5 for today. Pro has 20."" with `ASK_FREE_DAILY_LIMIT = 5` and `ASK_PRO_DAILY_LIMIT = 20` copied into `constants/appConfig.ts` (lines 12125-12126, 12371). Area 4's open question 4 chooses this on purpose.
- Problem: if the server's `DAILY_LIMIT.FREE` changes to 3, the free user's limit message loses the Pro offer, and "Pro has 20" is wrong whenever `PRO` changes.
- Change: add `tier: 'free' | 'pro'` and `proLimit` to the 200 and 429 Ask bodies (Task 3.8). The panel branches on `tier`, and both app constants go.
- Cost of not changing: a silent loss of the main in-app upsell after a server-only tuning change.

#### 22. A transient breaker opening is invisible above `info` (idea, axis 6)

- Tasks: 9.4
- Evidence: Task 9.4 logs `error` only for a config opening. A transient opening only changes state, and every call logs at `info` (`'model call'`).
- Problem: during a vendor outage the owner sees no warning-level signal that traffic moved to the fallback.
- Change: log `warn` `{ provider, model, cooldownMs }`, message `model provider skipped after repeated failures`, once per transient opening.
- Cost of not changing: outages are found from user reports.

### Modularization proposal

1. **Webhook intake** (`server/src/routes/revenueCatEventHandler.ts`, Task 3.9). Interface: `parseEventType(body): string | null` runs first and answers 200 `ignored` for unhandled types. `revenueCatSchemas.webhook` runs only for handled types. A `TRANSFER` branch (new Task 3.3a) reassigns events and recomputes. Changes Tasks 3.3 and 3.9; plus one task.
2. **Pro product rules** (`server/src/constants/proProducts.ts`). Interface: `PRO_PRODUCT_RULES[productId] = { cancellation, requiresExpiry }`, plus a refund rule on `cancel_reason`, read by `recomputeEntitlement` and `recordPurchaseEvent`. Changes Tasks 3.3 and 3.4; no count change.
3. **Pro status read** (`server/src/services/readActiveProRows.ts`). Interface: `readActiveProRows(queryable, userId, now)`. `hasPro`, `readPro`, and `listAdminAccess` derive from it. Changes Tasks 3.5 to 3.7; no count change.
4. **Model failure classification** (`server/src/clients/ModelProviderError.ts`). Interface: `classifyModelFailure(status: number | null, code: string | null): 'config' | 'transient' | 'decline'`, used by both providers (and by `verify()` if an availability check survives). `ModelProvider` stays separate from the failover: providers translate SDK errors, and the failover owns order, breaker, and logging. That split is right and should stay. Changes Tasks 9.2 to 9.4.
5. **Model availability** moves out of the server into Task 9.8's scheduled workflow. Deletes Task 9.7; one task fewer.
6. **Test seams**: `StartOptions.testWebhook` next to `emailClient`, `modelProvider`, and `passwordBreachClient`. Changes Tasks 3.9 and 4.15; no count change.
7. **Product ids across app and server**: keep the duplication, add one contract test (Task 4.4). No count change.

Net task count change: 0 (plus Task 3.3a, minus Task 9.7).

### Verified claims

- `recordPurchaseEvent.ts` lines 12, 29-34, 50, 55, 59, 86 match Task 3.1's quotes. `paidProductIds.has` at line 59 throws before the transaction, so Task 3.1's predicted RED `expected 500 to be 200` holds (Express 5 forwards the rejected async handler).
- `webhookDeps.ts:7` is `paidProductIds`. `revenueCatWebhook.ts:31,34,37,83-88` match Tasks 3.1, 3.3, and 3.9.
- `recomputeEntitlement.ts` orders by `occurred_at DESC, (kind = revoke) DESC`, so "a revoke wins a tie" is today's rule. Idempotency is `ON CONFLICT (provider, provider_event_id) DO NOTHING`.
- `revenueCatEvents.ts` is 25 lines as quoted. `revenueCatSchemas.ts:8-15` match Task 3.3.
- Migrations 000 to 017 exist, so `1790985600018` is the next number. `entitlements` has `unique (user_id, product_id)` and `user_id ON DELETE SET NULL`.
- Task 3.4's upsert keeps `updated_at` unchanged for two NULL-expiry lifetime grants (NULL is not distinct from NULL).
- `hasPro`, `server/src/services/hasPro.ts`, does not exist at `6f12b7c`, so Task 3.5's RED import failure holds.
- `adminAccess.ts`, `listAdminAccess.ts`, `setAdminAccess.ts`, `adminDeps.ts:8`, `adminSchemas.ts`, and `toAdminProductEntry.ts` match Task 3.6's description. The entry shape is unchanged and `'revenuecat'` reads as `'purchase'`.
- `readProfile.ts:34-40,56-66` and `me.integration.test.ts:120-174` match Task 3.7.
- `ask.ts:22-23,30,40,72-79,84-89,102`, `constants/ask.ts:1-12`, and `errors.ts:22-24` match Task 3.8. `createErrorResponse(code, message, requestId, details)` exists (`errors.ts:69-76`), so `error.limit` is in the envelope as area 4 consumes it.
- `server/src/testing/fakeModelProvider.ts` exists at `6f12b7c` with `prompts`, so Task 3.8 imports it validly before area 9.
- `app.ts:94-103` mounts CORS before the webhook and the webhook before `requireJson` and the CSRF guard, so a route mounted beside it serves the e2e web origin cross-origin.
- `env.ts:34` parses `NODE_ENV` as the enum with default `development`. `startServer.ts:84-92` gates the injected seams on `NODE_ENV === 'test'`. `e2e/global-setup.ts:102` sets `NODE_ENV: 'test'`.
- `clients/purchaseStoreClient.ts:20,30` match Task 4.4. The web store passes ids through unchanged.
- `state/usePurchases.ts:51-74,86-89` match Task 4.5. `useEntitlements` keys `['me', userId, 'entitlements']`, so the `['me']` invalidation Task 4.1 relies on is today's pattern.
- `installRoutedFetch` with `setRoute`, `fakeAuth`, `buildAuthModule`, and `setExpoExtra` exist with the names Task 4.1 uses.
- `app.config.ts:8,44-50` holds the three loopback hosts and refuses a non-loopback or https `E2E_API_BASE_URL`, so `isLoopbackUrl` cannot select the fixture in a store build.
- The fixture's synthetic events (annual `INITIAL_PURCHASE` with `expiration_at_ms`, lifetime `NON_RENEWING_PURCHASE` without) satisfy Task 3.4's fail-closed rule, and `test/webhook` resolves to `/v1/test/webhook`.
- Area 6's consumed names (`useProStatus`, `ProStatusState`, `isPro`, `ProSheetSource` including `'house_card'`, `ProOffer` props) match Tasks 4.1, 4.3, and 4.7.
- `constants/model.ts` and `clients/modelProvider.ts` match area 9's description (hard-coded id, `stop_reason !== 'end_turn'` resolves null). Both Ask and the study note use the 30 s `ASK_FETCH_TIMEOUT_MS`.
- The study-note route makes its model call outside any transaction (`server/src/routes/studyNote.ts:81-90`), so a 22 s failover holds no locks.
- `server/src/__tests__/config/` has no shared env fixture today, so Task 9.1's instruction to extract `buildValidEnv` is needed.

---

## Appendix C: Areas 5 to 8: static output and hosting, sponsored cards, crawlable pages, store docs

Full report of reviewer C. Finding numbers here are the ones cited above as C1, C2, and so on.

Scope: areas 5, 6, 7, and 8 of `docs/superpowers/plans/2026-10-27-free-content-pro-sponsored.md`, its header sections, and its closing sections, with interfaces checked against areas 2 and 4. Code claims were checked at `6f12b7c` with `git show`. `node_modules` is absent, so nothing was run; claims that depend on installed package behaviour are marked unverified.

### Summary

Findings: 1 blocker, 10 major, 12 minor, 3 idea.
The three changes that matter most:

1. Render the crawlable text (Tasks 7.3, 7.4) always, not only before hydration. As planned, Google indexes the hydrated DOM, which has none of it, and Task 7.6's own URL Inspection check fails.
2. Move Task 7.1 (ContentProvider renders bundled content first) into area 5. Gate the round route on ContentProvider's flag and re-audit every query-param route against real static bodies. Today Task 5.9's "no hydration error" check runs while every body is empty, so it proves nothing.
3. Fix the cutover and the build environment. Add the Cloudflare custom domain before removing the GitHub one, write a rollback, and pass the web build's public keys (`ETHICALADS_PUBLISHER`, `REVENUECAT_WEB_BILLING_KEY`, `POSTHOG_KEY`) into `npm run build` in `deploy.yml`.

### Findings

#### 1. The crawlable text disappears on hydration, so search engines that render JavaScript never see it (blocker, axis 6)

- Tasks: 7.3, 7.4, 7.6
- Evidence: Task 7.3: "The route renders it only before hydration, so the HTML a crawler reads carries it and the interactive difficulty step stands alone after mount", implemented as `{ isHydrated ? null : <TrackSummary language={language} />; }`. Task 7.4 does the same for `BankTitles`. Task 7.6 Step 3: "Run URL Inspection, then "Test live URL", on `https://syntactical.dev/python/medium`, and confirm the rendered HTML lists the bank titles." Acceptance criterion 5: "after mount the topic step stands alone."
- Problem: Googlebot indexes the DOM after it runs JavaScript. `useIsHydrated` turns true after the mount effect, so the summary and title list are removed from the very DOM Google indexes. Search Console's "Test live URL" shows that rendered HTML, so Task 7.6 Step 3 fails as written. The spec's goal, "36 pages of real text for search and for a network's review", is not met for Google or for an ad network reviewer looking at the page in a browser. Removing content after load also causes a layout shift on every track and bank page.
- Change: In Tasks 7.3 and 7.4, render `TrackSummary` and `BankTitles` unconditionally below the step, styled as secondary content (or in a collapsed disclosure that stays in the DOM). Drop `useIsHydrated` from both routes and from both route tests. Change the tests to assert the summary is present both before and after mount. Acceptance criteria 4 and 5 then read "carries ... before and after hydration."
- Cost of not changing: Area 7 ships and Google indexes 48 pages that are app shells, the stated purpose of the area fails silently, and Task 7.6 cannot pass.

#### 2. Tasks 5.1 and 5.4 import `react-dom/server` in the jsdom project; area 7 says that import cannot load there (major, axis 2)

- Tasks: 5.1, 5.4, 7.3 (open question 3)
- Evidence: `state/__tests__/useIsHydrated.web.test.tsx` and `app/__tests__/roundRouteStaticRender.web.test.tsx` (Task 5.1) and `app/__tests__/htmlShell.web.test.tsx` (Task 5.4) all import from `react-dom/server`. Area 7, open question 3: "assuming `renderToString` cannot load in the jsdom environment (no `TextEncoder`)", and Task 7.3's test avoids it: "react-dom/server needs TextEncoder, which the jsdom environment lacks". The web project uses `preset: 'jest-expo/web'` (`jest.config.js:35`). `jest.setup.ts` installs no `TextEncoder` polyfill (no match in `git grep TextEncoder 6f12b7c` outside app and workspace code). No existing suite imports `react-dom/server`.
- Problem: The two areas contradict each other, and one must be wrong. If area 7 is right (React 19's `server.browser` build creates a `TextEncoder` at module scope, and Jest 29's jsdom does not provide one), then all three suites fail at import with `ReferenceError: TextEncoder is not defined`. That is not the failure Step 2 predicts: Task 5.1 says "the last two pass" and "Cannot find module '../useIsHydrated'". In that case GREEN can never pass either. Unverified, because `node_modules` is absent.
- Change: Pick one rule and apply it to both areas. Cheapest: add `/** @jest-environment node */` to Task 5.4's shell test (it uses `DOMParser`, so swap in a string match), and split Task 5.1's server-render cases into a `.test.tsx` that runs under the native project's node environment. Alternatively, polyfill `TextEncoder` from `node:util` in `jest.setup.ts` as a one-line change inside Task 5.1. Then delete area 7's open question 3 and its mock-based workaround.
- Cost of not changing: Area 5's first task stalls on a `DISPUTE` over a test that cannot load, and Review Focus 9 has no working test.

#### 3. Two GREEN steps break an earlier area's exact-list test, and neither task updates it (major, axis 2)

- Tasks: 6.1 against 4.2; 7.5 against 5.5
- Evidence: Task 4.2 adds `it('registers exactly the nine product events, pro_purchased among them', () => { expect([...ANALYTICS_EVENTS]).toEqual([... nine names ...]) })`. Task 6.1 then adds `'ad_shown', 'ad_clicked'` to `ANALYTICS_EVENTS` and says "Run ... `npx jest` ... Expected: all pass". Task 5.5's test has `expect((await readdir(outputDir)).sort()).toEqual(['+not-found.html', '404.html', '_headers', 'index.html'])`. Task 7.5 adds `await writeSitemapFiles(outputDir);` as "the last statement of the exported `writeHostFiles`", which also writes `sitemap.xml` and `robots.txt`, and its Step 4 expects `npx jest` to pass.
- Problem: Each GREEN gate fails on the other area's test. The implementer may not edit RED tests ("GREEN is by the implementer, who does not edit RED tests"), so each failure becomes a `DISPUTE`.
- Change: Task 6.1 Step 3 also updates the Task 4.2 case to eleven names (rename it "registers exactly the product and sponsor events"), and Task 4.16's "sends the nine events" docs line becomes "eleven" in Task 6.16. Task 7.5 Step 3 also updates Task 5.5's listing case to include `robots.txt` and `sitemap.xml`. Alternatively, Task 7.5 keeps `writeSitemapFiles` out of `writeHostFiles` and adds `node scripts/writeHostFiles.mjs --sitemap` to the build.
- Cost of not changing: Two red gates and two disputes on the critical path of areas 6 and 7.

#### 4. Once Task 7.1 gives every page a real body, nothing re-audits hydration, and three routes mismatch or race (major, axis 1)

- Tasks: 5.1 (audit table), 5.9 Step 2, 7.1; cross-area decision 8
- Evidence: Task 5.1's audit table covers `play.tsx` for query parameters and nothing else. `app/purchase-complete.tsx:29-77` reads `?product` and renders `STATUS_MESSAGES[shownStatus]`. With no params (the static render), `productId` is null, so `shownStatus` is `'timed-out'`. On the first client render of `/purchase-complete?product=...`, `isWaiting` is true and the status is `'confirming'`, so the text differs. `app/[language]/[difficulty]/length.tsx:21-30` reads `?topic` into `poolSize`, which decides between `<Redirect>` and `LengthStep` and the counts it shows. Task 5.9 Step 2: "the console shows no hydration error". That check runs in area 5, while `ContentProvider` still returns `null` (`state/ContentProvider.tsx:103`), so every body is empty. Area 7 has no hydration check at all. Task 7.1 also makes `useQuestionBank` return `{ bank: localBank, status: 'ready' }` from the bundled Easy bank before the cache read. Meanwhile `play.tsx` gates only on the mount flag (Task 5.1) and the stats flag (`play.tsx:55`). `useQuizEngine` captures its questions once in `useState` (`state/useQuizEngine.ts:27`), so a deep-linked round can start on the bundled bank and keep it even after the cached version is read.
- Problem: Area 7 turns server rendering on for every route below `ContentProvider`. That includes the Web Billing return page, where a hydration error is most visible. Yet the only hydration check in the plan runs before that switch. The round route uses the wrong flag: area 7's own design note says the mount flag "would claim cached content that has not been read yet".
- Change: Move Task 7.1 into area 5 as its first task, before 5.1, so static output and real bodies arrive together. In Task 5.1, gate `play.tsx` on `useContentContext().isHydrated`, not on `useIsHydrated`. Add rows to the audit table for `purchase-complete.tsx` (render the waiting state until `useIsHydrated` or auth hydration) and `length.tsx` (show the loading state until mounted when `topic` is present). Make Task 5.9 Step 2 open `/purchase-complete?product=syntactical.pro.annual`, `/python/easy/length?topic=<id>`, and `/python/easy/play?count=20` and record zero console hydration errors.
- Cost of not changing: Recoverable hydration errors on the purchase return page and on topic rounds, which React handles by discarding the server HTML. A first-load round can also play stale bundled content. The plan's verification step would report green throughout.

#### 5. The cutover order takes the site and the mobile content host offline, and there is no rollback (major, axis 6)

- Tasks: 5.10 (runbook), 5.11
- Evidence: Task 5.10 runbook steps 5 and 6: "In the GitHub repository's Pages settings, remove the custom domain `syntactical.dev`", then "In the Pages project, add the custom domain `syntactical.dev` and wait for it to show Active". The same order appears in Task 5.11's owner checklist. `app.config.ts:6,64` points every native build's `contentBaseUrl` at `https://syntactical.dev/content/`. `docs/launch-placeholders.md:55` makes `https://syntactical.dev/privacy` and `/delete-account` the store-required URLs. Task 5.11 Step 3 ends with "Optionally disable GitHub Pages for the repository (`gh api -X DELETE repos/{owner}/{repo}/pages`)". No rollback is written anywhere.
- Problem: Between step 5 and step 6 Active, DNS still points at GitHub, and GitHub answers 404 for a domain it no longer holds. That outage hits the web app, every installed app's manifest refresh and Medium or Hard download, and the store-required legal pages. Neither document mentions the existing apex A and AAAA records that point at GitHub Pages. Cloudflare must replace them with the Pages CNAME, and the owner needs them recorded to go back. After the cutover commit, rolling back requires a revert, restored DNS, the GitHub custom domain re-added, and an artifact redeployed. None of that is written down, and the optional `DELETE` removes the fallback entirely.
- Change: Reorder the runbook in Tasks 5.10 and 5.11:
  - (a) Record the current apex records (`dig +short syntactical.dev A AAAA`) in the PR.
  - (b) Add the custom domain in the Pages project. Cloudflare swaps the record, and serving moves at once on a proxied zone.
  - (c) Verify `server: cloudflare`, `/settings`, `/content/manifest.json`, and `/privacy`.
  - (d) Only then remove the GitHub custom domain.

  Add a "Rollback" subsection to `server/DEPLOY.md`: restore the recorded records, re-add the GitHub custom domain, run `git revert <cutover sha>`, and dispatch the workflow. Keep GitHub Pages enabled for 14 days and drop the optional `DELETE` from Task 5.11. Add a post-cutover check of a native build's manifest refresh.

- Cost of not changing: A minutes-to-hours outage of the web app, the content host for every installed app, and the store-required pages, with no written way back.

#### 6. The deploy workflow never passes the web build's public keys, but the docs and the seams table say it does (major, axis 6)

- Tasks: 5.8, 5.10, 5.11, 6.11, 8.4; Seams table
- Evidence: `.github/workflows/deploy.yml:33-34` runs `npm run build` with no `env`. Task 5.11's replacement workflow keeps `run: npm run build` with no `env`. `app.config.ts:75-78` reads `POSTHOG_KEY` and `REVENUECAT_WEB_BILLING_KEY` from `process.env` at build time, and Task 6.11 adds `ETHICALADS_PUBLISHER` the same way. Task 5.10 changes the placeholders cell to "Environment of the web build (GitHub Actions secret for the web deploy)", and Task 8.4 to "(GitHub Actions secret for the Cloudflare deploy workflow)". The Seams table says: "`extra.ethicalAdsPublisher` set once the site qualifies. No code change."
- Problem: Adding the secrets in GitHub does nothing, because no step maps them into the build's environment. The web Pro purchase stays "unavailable", web analytics stays a no-op, and EthicalAds never loads, while the docs say the owner's action turns them on. The gap exists today, but area 5 rewrites this workflow and these doc cells without closing it.
- Change: In Task 5.8 (and the Task 5.11 rewrite), give the build step `env: { POSTHOG_KEY: ${{ vars.POSTHOG_KEY }}, POSTHOG_HOST: ${{ vars.POSTHOG_HOST }}, REVENUECAT_WEB_BILLING_KEY: ${{ vars.REVENUECAT_WEB_BILLING_KEY }}, ETHICALADS_PUBLISHER: ${{ vars.ETHICALADS_PUBLISHER }} }`. Use repository variables, not secrets: the keys are public by `readPublicKey`'s design, and step-level variables keep them off `npm ci`. Add a grep to Task 5.8 Step 3 that checks for them. Correct the Seams row to "set the repository variable".
- Cost of not changing: Web revenue (Pro and EthicalAds) and web analytics stay off after launch while every checklist says they are configured.

#### 7. Area 8 tells the owner to put real AdMob unit ids in the `preview` environment, which serves live ads in internal builds (major, axis 3)

- Tasks: 8.4 against 6.13
- Evidence: Task 8.4 row: "AdMob native ad unit ids ... | Owner | EAS environment variables" and "AdMob app ids ... | EAS environment variables (`preview`, `production`)". Its stub column reads "The house card shows in every sponsored slot on mobile". Task 6.13: "Internal builds must never request live ads (clicking one's own live ads breaks AdMob policy)", the ids go in the "EAS `production` environment", and a production build without them "stops at config load". `readAdMobPlacement` in Task 6.13 returns the configured unit before test mode: `if (adUnitId !== null) return { adUnitId }; return admob.isTestAds === true ? { isTest: true } : null;`. Task 8.4 also says "with the variable names Task 5.4 and Task 6.1 put in `app.config.ts`" (those tasks are `+html.tsx` and the sponsor constants).
- Problem: With the ids in `preview`, preview builds request live ads even though `ADMOB_USE_TEST_IDS=true`, because a unit id wins over test mode. Testers tapping them is exactly the invalid traffic AdMob suspends accounts for. The two rows also contradict Task 6.13 on where the ids go and on what happens when they are missing.
- Change: In Task 6.13, make test mode win: `if (admob.isTestAds === true) return { isTest: true };` before reading unit ids, with a test case. In Task 8.4, make the rows say "EAS `production` environment only", with the stub "a production build stops at config load, naming the variable", and cite Tasks 6.11 and 6.13.
- Cost of not changing: Risk of an AdMob account suspension before launch revenue starts, and contradictory owner instructions.

#### 8. The privacy page and store labels declare less than the AdMob SDK collects (major, axis 3)

- Tasks: 6.16, 8.2
- Evidence: Task 6.16 privacy copy keeps "We do not collect your name, phone number, address, contacts, photos, or precise or approximate location", next to "Google receives your device's IP address and device information". The label changes add only "Usage Data: Advertising Data" and "Identifiers: Device ID (expected: Yes)" for Apple. For Play they add "Device or other IDs" and "App activity: Other actions". The owner check is scoped to "confirm the Device ID rows below". Task 8.2's review notes say "advertising data through Google AdMob (non-personalised, not linked to the user, not used for tracking)".
- Problem: Store forms count data collected by third-party SDKs as the app's collection. Google's published disclosures for the Mobile Ads SDK (unverified offline, from memory of Google's Play and Apple disclosure pages) list approximate or coarse location derived from IP and diagnostics or performance data, alongside device identifiers. The page's categorical "we do not collect ... approximate location" and labels without those rows would then be inaccurate. That is grounds for a store rejection or a later policy strike.
- Change: In Task 6.16, widen the owner check to "every data type in Google's Mobile Ads SDK disclosure for the version in `package.json`" and add placeholder rows, marked "confirm", for Coarse Location (Apple), Approximate location (Play), and Diagnostics / App info and performance. Reword the privacy sentence to "We do not collect ... location. Google AdMob receives your IP address, from which it may infer an approximate location, to serve and count sponsored cards." Make Task 8.2's data sentence match.
- Cost of not changing: Privacy labels that understate collection at first submission.

#### 9. Sponsored cards pop in late and push buttons and tracks, which invites accidental ad taps (major, axis 3)

- Tasks: 6.6, 6.7, 6.12, 6.15
- Evidence: `components/quiz/ResultsScreen.tsx:27` lays the screen out as `flex-1 items-center justify-center`. Task 6.6 inserts the card below the Retry and Menu row, and `useResultsSponsorSlot` sets `isCardDue` only after `recordRoundCompleted()` resolves. Task 6.15's `AdMobCard` returns `null` until `nativeAd` arrives. Task 6.12's placement swaps to the house card after `ETHICAL_ADS_FILL_TIMEOUT_MS` (3000). Task 6.7 inserts the card after the first track group, and it appears only once auth has hydrated and `/v1/me` has answered.
- Problem: When the card appears, the vertically centred results column grows, so Retry and Menu jump upward under the user's finger. On the track list, every group after the first moves down while the user is choosing a track. AdMob's native ad policies prohibit placements that encourage accidental clicks. The web swap at 3 seconds also changes the card's height.
- Change: In Task 6.6, reserve the slot as soon as the round ends for an eligible user. Render a fixed-height placeholder frame with the "Sponsored" label, sized to the card, and record "due" synchronously from a cadence value read when the round starts, so the layout never moves. Alternatively, anchor the card to the bottom of the screen, outside the centred column. In Task 6.7, render the reserved frame whenever eligibility is not yet known on the client, and remove it only for a Pro user. Add an assertion that Retry's position does not change when the card fills, using `onLayout` in the native test.
- Cost of not changing: Accidental ad clicks, an AdMob policy risk, and a jumpy results screen on every third round.

#### 10. Area 8 cannot be finished by the implementer, and it reads area 7's output without depending on it (major, axis 2)

- Tasks: 8.3, 8.4 Step 1, 8.5, 8.6; "The areas" table
- Evidence: Task 8.3: "Confirm each field against RevenueCat, App Store Connect, and Play Console ... tick only when they match exactly". Task 8.4 Step 1: "For every row run its "How to verify" (or read the console it names)". Acceptance criterion 4: "`in-app-purchases.md` matches the consoles on every checklist field". The plan header says "No owner gate on the code ... owner actions outside the repo gate only the cutover checks, never a task", and area 8 is "Merged by implementer, on green". "The areas" lists area 8's dependencies as "areas 6 and 9". Tasks 8.5 and 8.6 state "track and bank pages carry their text for crawlers" and list `sitemap.xml` and `robots.txt`, which area 7 produces, and area 7 is "After launch; nothing else waits on it".
- Problem: The implementer has no console access, so Tasks 8.3 and 8.4 either stall or invite false ticks. If area 8 merges before area 7, as its declared dependencies allow, README and the handoff describe pages and files that do not exist.
- Change: Split Task 8.3 and Task 8.4 Step 1 into an owner checklist under "Per-store setup" that does not gate the PR, and keep only repo-checkable greps in area 8. Add area 7 to area 8's dependencies, or make Tasks 8.5 and 8.6 conditional on `git show origin/main:scripts/buildBankTitles.mjs`.
- Cost of not changing: Area 8's PR either never merges or merges with attestations nobody made.

#### 11. Review Focus 12 is proven by the test mock, not by app code (major, axis 1)

- Tasks: 6.13, 6.15
- Evidence: Task 6.13's `mobileAdsMock.ts` implements `useNativeAd` itself: "if (!isMounted) { outcome.destroy(); return; }" and destroys `adRef.current` on unmount. Task 6.15: "Nothing is created outside the hook, so an ad arriving after unmount is destroyed and reports nothing (Review Focus 7)". Open question 5: "`useNativeAd`'s `status` values ... whether `useNativeAd` re-requests on a new options object". Global Constraints name `react-native-google-mobile-ads` 17.x.
- Problem: The only behaviour Review Focus 12 cares about, destroying a late ad, lives entirely in the fake. If the real 17.4 hook does not destroy a late ad, or if the library exposes native ads only as `NativeAd.createForAdRequest()` plus `destroy()`, the test still passes and the app leaks native ad objects. The documented API in the versions I know of (unverified for 17.4) is `NativeAd.createForAdRequest`, with no hook. The Review Focus row is labelled with the wrong number in Task 6.15 ("Review Focus 7"; the header lists it as 12).
- Change: In Task 6.15, own the lifecycle in app code. Add a small `useSponsorNativeAd(adUnitId, options, enabled)` in `components/sponsor/` that calls `NativeAd.createForAdRequest`, keeps an `isMounted` ref, destroys a late ad, and destroys the held ad on unmount. Mock only `createForAdRequest` in `mobileAdsMock.ts`, so the Review Focus test exercises app code. Add a Step 0 that runs `grep -n "export function useNativeAd\|createForAdRequest" node_modules/react-native-google-mobile-ads/lib/typescript/index.d.ts` and records the result.
- Cost of not changing: A green test that guarantees nothing about leaks on the real SDK.

#### 12. JSX snippets in four GREEN steps are not valid JSX (minor, axis 1)

- Tasks: 6.6, 6.7, 7.3, 7.4
- Evidence: Task 6.6: `{ eligibility === 'eligible' && isCardDue ? ( ... ) : null; }` followed by `<SignUpPrompt onDismissed={() => retryRef.current?.focus?.()} />;`. Task 6.7: `{ groups.map(...) ; }`. Task 7.3: `{ isHydrated ? null : <TrackSummary language={language} />; }`. Task 7.4: the same with `BankTitles`.
- Problem: A semicolon inside a JSX expression container is a syntax error, and the trailing `;` after `<SignUpPrompt />` would render as a text node. These look like Prettier formatting the fragments as statements.
- Change: Rewrite each as plain JSX children, for example `{eligibility === 'eligible' && isCardDue ? (<View ...>...</View>) : null}` and `<SignUpPrompt ... />`.
- Cost of not changing: An implementer who pastes the snippets gets a compile error, and one who fixes them by eye may get it slightly wrong.

#### 13. The store copy contradicts the cadence code, and `MIN_ROUNDS_BEFORE_FIRST` can never decide anything (minor, axis 1)

- Tasks: 6.1, 6.5, 8.1, 8.2
- Evidence: Task 6.1: "so the first one lands on the third round's results". Task 6.5's test has `expect(due).toEqual([false, false, true, false, false, true])`. Task 8.1: "one on the results screen (from the second completed round, then every third round)". Task 8.2's table: "from round 2, then every 3 rounds". `shouldShowResultsCard` requires `completedRounds >= 2 && roundsSinceLastCard >= 3`, and both counters start at 0 and increment together, so `roundsSinceLastCard <= completedRounds` always holds and the first condition never binds. Task 6.5's case `[1, 5, false]` is an unreachable state. The spec, line 89, reads as if the first card could come after round 2.
- Change: Decide the intent. If the first card should be on round 3, delete `MIN_ROUNDS_BEFORE_FIRST` and fix the copy in 8.1 and 8.2 to "from the third round". If it should be on round 2, seed `roundsSinceLastCard` at `ROUNDS_BETWEEN` on first use and keep the constant.
- Cost of not changing: App Review notes that misstate where the reviewer will find a card, and a constant that misleads readers.

#### 14. Wrong task and line cross-references (minor, axis 1)

- Tasks: 5.3, 6.3, 6.4, 6.6, 6.13, 7.5, 8.2, 8.3, 8.4; the area 7 and 8 coverage table
- Evidence:
  - Wrong task ids:
    - Task 7.5: "`scripts/writeHostFiles.mjs` (written by Task 4.1 ...)". The script comes from Task 5.5.
    - Task 8.2: "`SponsorProvider` (Task 6.2)" should be 6.14, and "`app/delete-account.tsx` (Task 6.4)" should be 6.16.
    - Task 8.3: "Task 3.6 rewrote it for Pro". It was Task 4.16 (plan line 14688).
    - Task 8.4: "Task 5.4 and Task 6.1" should be 6.11 and 6.13.
    - The coverage table lists privacy pages under "Task 6.4" (should be 6.16) and `in-app-purchases.md` under "Task 3.6 rewrites" (should be 4.16).
  - Wrong line numbers:
    - `state/AuthProvider.tsx:243` and `:576`: `useAuth` and `useSignedInUserId` are at 390 and 400.
    - `state/useQuizEngine.ts:391`: `RoundKind` is at line 21.
    - `app/review.tsx:108`: `roundKind="review"` is at line 64.
    - `app.config.ts` "`web`, line 98": it is line 93.
  - Missing anchor: Task 5.3 inserts "after `const PURCHASE_PENDING = ...` (line 24)", but area 2's rewrite of `app/[language]/index.tsx` (plan line 2073, "whole file") has no such constant.
- Change: Correct the ids and anchors. For Task 5.3, anchor `generateStaticParams` directly above `export default function DifficultyScreen()`.
- Cost of not changing: Time lost hunting for the right task, and a reviewer checking claims against the wrong file.

#### 15. Before the cutover, a Cloudflare failure blocks the live GitHub Pages deploy (minor, axis 6)

- Tasks: 5.8
- Evidence: Task 5.8 inserts the Cloudflare steps after "Build the Expo web export and content" and before "Upload build artifact" in the `build` job. The `deploy` job `needs: build`.
- Problem: Once the owner adds the secrets (runbook step 3) but before the cutover, a bad token or a missing project fails `build`. That skips the GitHub Pages deploy, which is still the live host.
- Change: Add `continue-on-error: true` to the Cloudflare deploy step in Task 5.8 (Task 5.11 removes it with the rest), or move the Cloudflare steps into their own job that `needs: build` and downloads the artifact.
- Cost of not changing: A misconfigured Cloudflare secret freezes production web deploys until someone notices.

#### 16. The year-long immutable rule also catches sponsor icons, and the files that are content-addressed get no long cache (minor, axis 5)

- Tasks: 5.5, 6.8
- Evidence: `HOST_HEADERS` has `'/content/:track/:bank', '  Cache-Control: public, max-age=31536000, immutable'`. Task 6.8 allows `iconPath` such as `sponsor/neon.png`, so `/content/sponsor/neon.png` matches. Native `Image` loads it without `no-cache`. Expo's hashed bundles under `/_expo/static/` get Pages' default revalidation.
- Problem: A sponsor icon replaced under the same name stays stale on devices for up to a year. Meanwhile the one set of files whose URLs change with their content gets no cache benefit.
- Change: In Task 5.5, add `/content/sponsor/*  Cache-Control: no-cache` before the bank rule (it does not overlap, since it names its first segment), and `/_expo/static/*  Cache-Control: public, max-age=31536000, immutable`. Add both to the test's expected text.
- Cost of not changing: Stale sponsor creative, and repeat web visitors revalidate every bundle on every load.

#### 17. EthicalAds no-fill detection rests on a DOM probe, and the route-change reload is unreachable (minor, axis 7)

- Tasks: 6.12
- Evidence: "a placement with no child element 3 seconds after a load or reload counts as no fill"; "`reload()` runs on each later pathname change while the placement is mounted". Area 6 open question 10: "Screens are swapped by `Slot`, so a card rarely survives a route change". `app/_layout.tsx:45` renders `<Slot />`.
- Problem: The EthicalAds client documents a promise, `ethicalads.wait`, that resolves to the placements that loaded (empty when none did) for exactly this fallback. That is from memory and unverified offline, as is whether a manual `load()` returns an equivalent promise. A fixed 3 s timer misreads a slow fill as no fill and then deletes an ad that is still loading. The `reload()` branch, its `loadedPathname` ref, and its test case cover a path that `Slot` never produces.
- Change: Resolve fill from the client's promise when it exists and keep the timer only as a ceiling. Delete the reload path and its test case.
- Cost of not changing: Lost EthicalAds impressions on slow connections, and code and tests that guard a case that cannot happen.

#### 18. Privacy pages trail the sponsored-card PR by one PR (minor, axis 3)

- Tasks: 6.1 to 6.12 (`feat/sponsored-card`), 6.16 (`feat/admob-native`)
- Evidence: Area 6 header: "`feat/sponsored-card`: Tasks 6.1 to 6.12" and "`feat/admob-native`: Tasks 6.13 to 6.16". Only Task 6.16 removes "The app has no ads" from `app/privacy.tsx` and names EthicalAds.
- Problem: Between the two merges, production can show a direct sponsor or an EthicalAds ad (if the publisher variable is set) while the privacy policy says there are no ads.
- Change: Move the web half of Task 6.16 (the EthicalAds and direct-sponsor sentences, and removing "The app has no ads") into `feat/sponsored-card` as Task 6.12a. Leave the AdMob sentences in 6.16.
- Cost of not changing: A window in which the policy is false.

#### 19. The Seams table promises an e2e sponsor fixture that no task builds; area 6 has no e2e coverage (minor, axis 6)

- Tasks: Seams table; area 6
- Evidence: Seams table: "Direct sponsor ... A fixture sponsor with a far-future end date in e2e content". Searching the plan for "far-future" finds only that row. No area 6 task touches `e2e/specs/`.
- Problem: The house card now renders on `/` for every guest. The only browser check of the card is a manual row in `docs/device-checklist.md`, and Lighthouse runs in Task 5.9, before the card exists.
- Change: Add Task 6.12b. Write `e2e/fixtures/sponsor.json` into the e2e content directory in `global-setup.ts`. Add `e2e/specs/sponsoredCard.spec.ts`: a guest sees one `Sponsored:` group on `/`, plays three rounds and sees the results card on the third, and a Pro grant (an `e2e` entitlement row) hides both. Run Lighthouse accessibility on `/` with the card present.
- Cost of not changing: The card's placement, cadence, and accessible name on the real web build are untested until a person looks.

#### 20. Task 5.9's file counts contradict its own allowance for bracket pages (minor, axis 1)

- Tasks: 5.9
- Evidence: "`find dist -name play.html | wc -l` ... Expected: `36`" and "If the export also writes pages for the unexpanded segments ... They are harmless". A `dist/[language]/[difficulty]/play.html` would make the count 37.
- Change: Use `find dist -name play.html -not -path '*\[*' | wc -l`, and the same for `length.html`.
- Cost of not changing: A spurious failure in the verification step.

#### 21. Every static page has the same title, and none has a description or canonical URL (minor, axis 6)

- Tasks: 5.4, 7.3, 7.4
- Evidence: Task 5.4 hard-codes `<title>Syntactical</title>` in `app/+html.tsx`. Area 7 adds no `expo-router/head` usage. Task 7.6 leaves the trailing-slash question (`/python` against `/python/`) until after the deploy.
- Change: Remove the fixed `<title>` from `+html.tsx`. In Tasks 7.3 and 7.4, add `<Head><title>{label} quiz: Easy, Medium, Hard | Syntactical</title><meta name="description" .../><link rel="canonical" href=.../></Head>` from `expo-router/head`. Settle the trailing slash in Task 5.9 Step 2, which already records it with `wrangler pages dev`, and feed that into `toLoc` in Task 7.5.
- Cost of not changing: 48 pages with one title and no canonical URL, which weakens the indexing area 7 exists for.

#### 22. The production AdMob guard ships a placeholder list (minor, axis 1)

- Tasks: 6.13
- Evidence: `const ADMOB_SKADNETWORK_ITEMS = ['cstr6suwn9.skadnetwork', // ...the rest of the README's list, verbatim. ];`. The test only checks `expect.arrayContaining(['cstr6suwn9.skadnetwork'])`.
- Change: Add a test that the list has at least the README's count, recorded at implementation (for example `toHaveLength(N)` with N written into the test from the README), so a one-entry list cannot pass.
- Cost of not changing: iOS attribution for Google's partner networks is silently lost.

#### 23. Area 8 adds a second copy of Cloudflare rows, and one cell breaks the table (minor, axis 7)

- Tasks: 5.10 Step 4, 8.4
- Evidence: Task 5.10 adds `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` rows to "Infrastructure and store setup". Task 8.4 creates a new "Web hosting (Cloudflare Pages)" section with the same items and does not remove the first copy. The new table's last row has `curl -sI https://syntactical.dev/ | grep -i "^server: cloudflare"` with an unescaped pipe, and its separator row has seven cells for six columns.
- Change: In Task 8.4, move the 5.10 rows instead of adding new ones, and escape the pipe (`\|`).
- Cost of not changing: Two sources of truth for the same owner actions, and a table that renders wrong.

#### 24. Idea: one feed chain for the four sponsor sources (idea, axis 4)

- Tasks: 6.4, 6.10, 6.12, 6.15
- Evidence: The fallback rule "feed, then `SponsorContentSlot`" is written twice, in `SponsoredCard.tsx` and `SponsoredCard.web.tsx`. Eligibility is checked in four places (`SponsoredCard` twice, `ResultsScreen`, `TracksSponsorSlot`). `useSponsorContent` starts the direct-sponsor query in every card, even when AdMob or EthicalAds fills.
- Change: See the modularization proposal. This is optional: with four feeds the duplication is small, and the plan's split is readable.
- Cost of not changing: A fifth feed needs edits in both card files.

#### 25. Idea: security headers while `_headers` exists (idea, axis 6)

- Tasks: 5.5
- Evidence: `HOST_HEADERS` sets only `Cache-Control`.
- Change: Add `/*` with `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Content-Security-Policy: frame-ancestors 'none'`. Keep the CSP to `frame-ancestors` so EthicalAds and RevenueCat scripts are unaffected.
- Cost of not changing: Nothing breaks. The cutover is simply a cheap moment to add these.

#### 26. Idea: pin the wrangler version the action installs (idea, axis 5)

- Tasks: 5.8, 5.11
- Evidence: The action is pinned by SHA, but `wranglerVersion` is not set. Task 5.9 previews with `wrangler@4`.
- Change: Add `wranglerVersion: '4.x.y'` (resolved like the SHA) so production deploys and the local preview use the same `_headers` and `404.html` semantics.
- Cost of not changing: A future action default could change deploy behaviour without a commit.

### Modularization proposal

1. **One hydration signal for content, none for crawl text.**
   - Boundary: `ContentAccess.isHydrated` (Task 7.1) is the only flag a route uses to decide whether it may resolve content. Auth and stats keep their own `isHydrated`, which already mean "storage read". `useIsHydrated` survives only if Finding 4's `purchase-complete` and `length` fixes need a pure mount flag. If they use auth hydration (as `purchase-complete` already partly does) and `useContentContext().isHydrated` respectively, delete it.
   - Interface: `useContentContext(): ContentAccess` with `isHydrated: boolean`.
   - Tasks:
     - Task 7.1 moves to area 5 as Task 5.0.
     - Task 5.1 drops the hook and its test and gates `play.tsx` on the content flag; Review Focus 9 keeps its route test.
     - Tasks 7.3 and 7.4 drop the flag entirely (Finding 1).
     - Area 5's audit table row "Area 6 uses `useIsHydrated`" is corrected: area 6 uses `useAuth().isHydrated` through `SponsorProvider`, which is correct and should stay.
   - Net tasks: minus 1 (the hook task merges into the route task).

2. **Sponsor feeds behind one chain (optional).**
   - Interface: `type SponsorFeedState = { status: 'pending' } | { status: 'empty' } | { status: 'filled'; node: ReactNode; source: SponsorSource }` and `useAdFeed(placement): SponsorFeedState`, in two files, `adFeed.native.tsx` (AdMob, Task 6.15) and `adFeed.web.tsx` (EthicalAds, Task 6.12).
   - One platform-neutral `SponsoredCard` renders the ad feed while it is `filled`, nothing while `pending` inside a reserved frame (Finding 9), and `SponsorContentSlot` (direct, then house) once it is `empty`.
   - `SponsorProvider` keeps eligibility and consent, as app-wide state. The direct-sponsor `useQuery` moves into `SponsorProvider`, so it runs once per app, not once per card.
   - Eligibility is checked only in `SponsoredCard`. `ResultsScreen` and `TracksSponsorSlot` render the card unconditionally and let it return null.
   - Tasks: 6.4, 6.10, 6.12, and 6.15 change; no task is added or removed. Do it only if a fifth source is planned; otherwise take just the last two bullets, which remove real duplication.
   - Net tasks: 0.

3. **Host files as one script with sections.** Keep `writeHostFiles.mjs` as the single post-export step. Have Task 7.5 extend its tests rather than adding a second exact-listing assumption (Finding 3). Net tasks: 0.

Net task count change across the proposal: minus 1.

### Verified claims

- `state/ContentProvider.tsx:103` returns `null` until the cache read finishes, so area 5's static pages have empty bodies.
- `app/_layout.tsx:36-53` nests every route inside `ContentProvider`, then `AuthProvider`, `OwnedStatsProvider`, `SyncProvider`, and `AppShell`.
- `state/AuthProvider.tsx:111` holds `isHydrated` state; `useAuth` is at line 390 and `useSignedInUserId` at line 400.
- The `play.tsx` structure Task 5.1 edits exists: imports at lines 7-20, hooks at lines 34-46, and the not-found guard at line 50.
- `components/auth/AccountControl.tsx:10-12` matches the text Task 5.2 replaces.
- `components/layout/ModalOverlay.tsx:11` guards `typeof document`, and `state/useKeyboardNav.ts:92` touches `window` only inside an effect.
- `app.config.ts:93` sets `web: { bundler: 'metro', output: 'single' }`; `contentBaseUrl` defaults to `https://syntactical.dev/content/` (lines 6 and 64).
- `package.json:9`'s build script contains `copySpaFallback.mjs dist && node scripts/writeRouteEntries.mjs dist`.
- `clients/fetchContentText.ts:31` fetches with `cache: 'no-cache', redirect: 'error'`, which is the basis for the immutable bank cache.
- `.github/workflows/deploy.yml` builds with no `env` and deploys through `upload-pages-artifact` and `deploy-pages`.
- `.github/workflows/server-deploy.yml` has the "Check the Railway token is set" step pattern that Task 5.8 copies.
- `.github/workflows/ci.yml:24-25` runs the drift check and `npm run build` on every PR, so the static export runs in CI.
- `tailwind.config.js:19-25` holds `obsidian #05060a`, `surface #0d0f14`, `ink #e6e8eb`, and `signal #39e88f`.
- `.oxlintrc.json:6` sets `react/only-export-components` to `warn`.
- `jest.config.js:26-36`: the native project lists `native.*` extensions and ignores `.web.test`; the web project uses `jest-expo/web` and runs only `*.web.test.ts(x)`.
- `e2e/support/startWebHost.ts:41` falls back to `index.html`; `e2e/support/e2eEnv.ts` sets `BASE_PATH = ''` and `LOOPBACK = '127.0.0.1'`.
- `components/menu/SelectionCard.tsx:22` and `components/menu/LanguageStep.tsx:38` carry the classes Task 6.2 copies; the `groups.map` block is at lines 39-59.
- `RoundKind = 'bank' | 'review'` exists in `state/useQuizEngine.ts`, `app/review.tsx` passes `roundKind="review"`, and `QuizRound` defaults to `'bank'` and renders `ResultsScreen` at about line 219.
- `ResultsScreen.tsx` lines 1-44 match Task 6.6's quoted header, props, and `SignUpPrompt` line.
- The signatures of `readStoredJson`, `writeJson` (returns a boolean), `readJson(key, fallback)`, `removeStoredKey`, and `ContentFetchError.reason` match what Tasks 6.5 and 6.10 consume.
- `CONTENT_CACHE_KEYS` holds `paidBankPrefix` today, so Task 6.10's anchor is correct.
- `@syntactical/content-schema` exports `isSafeBankPath`, `DIFFICULTIES`, and `TRACK_CATEGORIES`.
- `config/expoConstantsMock.ts` exports `setExpoExtra`, `config/buildExpoRouterMock.ts` accepts `push` and `readParams`, and `config/settle.ts` exists.
- `content/python/easy.json` has 104 questions and 72 distinct `query.title` values, as Task 7.2 states.
- `app/` holds nine static routes; without `admin` and `purchase-complete` that leaves 7, so the sitemap has 7 + 12 + 36 = 55 URLs, as Task 7.5 expects.
- Area 4's producers match area 6's quotes: `ProStatusState` (plan line 9016), `ProSheetSource` including `'house_card'` (line 9498), `ProSheet` props (line 9513), and `ProOffer({ onClose, source })` (line 11417).
- Area 2's `useQuestionBank` (plan lines 2814-2823) has the `enabled: needsDownload && access.contentBaseUrl !== null` line and the `unknown` return that Task 7.1 edits.
- `docs/launch-placeholders.md:39` says the web billing key is a "GitHub Actions secret for Pages", which the workflow never reads.
