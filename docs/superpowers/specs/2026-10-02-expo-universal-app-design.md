# Expo universal app with runtime question content

**Ticket:** IAN-564
**Branch:** `feat/expo-universal-app`
**Status:** draft, revised after the adversarial spec review, awaiting owner approval
**Date:** 2026-10-02

## Goal

Syntactical is currently a static Vite + React single-page app deployed to GitHub Pages. This work replaces it with one Expo app that builds for iOS, Android, and the web from a single codebase, and moves the question banks out of the JavaScript bundle into JSON files that the app downloads at runtime. The owner can then edit questions, or add a whole language, by pushing JSON, without rebuilding or resubmitting the mobile app.

## Owner decisions (2026-10-02)

1. One Expo app (Expo Router, NativeWind, react-native-web), not a monorepo with a separate web app. The Expo web export replaces the Vite build on GitHub Pages.
2. Tailwind stays, through NativeWind. Tailwind is not converted to plain CSS, because React Native does not use CSS.
3. Question content is published as JSON on GitHub Pages and fetched at runtime, cached for offline use, with a bundled copy as the fallback. A hosted CMS, a custom Express + Postgres API, and EAS Update alone were considered and rejected: the JSON approach meets the goal at no cost and with no server or login to secure.
4. The fetch is one slice of this ticket, not a separate ticket.
5. The fetched manifest defines the languages and their difficulties as well as pointing to the banks, so adding a language is a JSON push.
6. The ticket ends with the web build live and EAS internal device builds installable on the owner's phone. App Store and Play Store submission is a follow-up ticket.
7. The content threat model and acceptance boundary below are approved as written; content signing is not required.
8. Target about one day of work: the eight behavior slices ship as three PRs, and bank versions are content hashes computed at build time instead of numbers the owner bumps by hand.
9. No Playwright suite. This overrides the shared convention that keyboard navigation, screen reader, and reduced-motion behavior are tested in E2E, and R-607's e2e spec per user story; those behaviors are covered by component tests and a manual Lighthouse and screen-reader pass before the web cutover.
10. A very subtle indicator shows while a new language or a changed bank is downloading.
11. TanStack Query fetches the manifest and banks, following CLAUDE-FRONTEND-REACT.md. It provides request deduplication, loading and error states with Retry, and the is-fetching flag that drives the download indicator. AsyncStorage still holds the hash-bound cache; TanStack Query's own persister is not used, because the cache entry must bind each bank to its verified hash.

## Domain vocabulary

Existing terms in `docs/lexicon.md` (`bank`, `round`, `query`, `question`, `code block`) keep their meanings. `track`, `tier`, `level`, and `subject` stay banned as identifiers; this spec uses `language` and `difficulty`.

- manifest - the fetched `manifest.json` that lists every language, its display fields, its highlighting grammar, and the bank file and bank hash for each of its difficulties - chosen over: `catalog`, `index`, because `index` already names `src/data/index.js` and `catalog` suggests something purchasable.
- bank hash - the SHA-256 of a bank file's bytes, written into the manifest at build time, compared against the cached bank's hash to decide whether to download, and checked against the downloaded bytes before they are accepted - chosen over: `version`, `etag`, because it is computed rather than maintained by hand, and it is manifest data rather than an HTTP header.
- bundled bank - the copy of a bank shipped inside the app build, used when no cached bank exists - chosen over: `default bank`, `seed`, because `seed` implies a database.
- cached bank - the last verified bank downloaded at runtime and stored on the device, stored together with its bank hash as one entry - chosen over: `stored bank`, `local bank`.
- content base URL - the absolute URL the manifest and banks are fetched from, configured as `CONTENT_BASE_URL` - chosen over: `api url`, because there is no API.
- grammar - the Prism language id used to highlight a language's code blocks, named per language in the manifest - chosen over: `syntax`, because `query.syntax` already names a question field.
- download indicator - the subtle status element shown while a bank is transferring - chosen over: `spinner`, `loader`, because it names what is happening rather than how it looks.

## Acceptance criteria

Ordered by slice. Each line is one behavior a test can fail.

### Slice 1: scaffold

- B-1: The Expo web export builds with base path `/syntactical/`, and the root route renders the app shell with exactly one web `h1`; on iOS and Android the same title carries `accessibilityRole="header"`.
- B-2: A direct load or reload of `/syntactical/python/easy` on the web export serves the app and renders that route, including for a language id that did not exist when the app was built.

### Slice 2: storage and stats

- B-3: `storageClient.readJson` returns the fallback when the key is missing, when the stored value is not valid JSON, and when storage throws; `writeJson` resolves without throwing when storage rejects the write.
- B-4: Stats written by the current Vite build under `syntactical.stats.v1` are read unchanged by the Expo web build served from the same origin.
- B-5: No round can start, and no stats write happens, until stats hydration completes; an answer recorded immediately after hydration is added to the stored history rather than replacing it.
- B-6: Two stats writes issued back to back persist in issue order, and a failed write leaves the in-memory stats intact for the rest of the session.
- B-7: Answering correctly increments total answered, total correct, and the current streak, and raises the best streak when exceeded; answering incorrectly resets the current streak; per-language and per-difficulty accuracy match the answers given.
- B-8: Exactly one completion is recorded per finished round; leaving a round early records none.

### Slice 3: content

- B-9: `exportQuestionBanks` produces nine bank files whose questions deep-equal the current `src/data` modules, and a manifest listing the three current languages. This test is deleted with `src/data` in PR 3, because `content/` then becomes owner-edited and a frozen fixture would fail on every edit.
- B-10: `buildContentManifest` writes the SHA-256 of each bank file's bytes into the manifest, and the deploy workflow runs it before publishing `content/`.
- B-11: `validateManifest` rejects each malformed field named under Validation rules: a wrong root shape, an empty `languages` array, a duplicate or non-conforming language id, a missing display field, an empty `banks` object, an unknown difficulty key, an unknown grammar, and each unsafe bank path.
- B-12: `validateQuestionBank` drops each malformed question named under Validation rules, including a duplicate question id and a choice count outside 2 to 4, and keeps the valid questions in the same bank.
- B-13: A manifest or bank whose `schemaVersion` is newer than the app supports, a bank with zero valid questions, and a document over its size limit are each rejected as a whole, and the previous copy stays in use.
- B-14: A downloaded bank whose SHA-256 does not equal its manifest bank hash is rejected and not cached.
- B-15: The cached bank, or the bundled bank when none is cached, is available before any fetch resolves, and a round may start from it once the cache read completes.
- B-16: After each manifest refresh, every bank whose manifest hash differs from its local copy's, or that has no local copy, is fetched in the background and, when verified and valid, written to the cache with its hash in one entry; a bank whose hash matches is not fetched.
- B-17: When two refreshes of the same bank overlap, only one request is in flight, and a response for a manifest hash that is no longer current is discarded rather than cached.
- B-18: A fetch that fails, is redirected, or does not finish its body within 8 seconds leaves the current copy in use and shows no error.
- B-19: A bank with no cached or bundled copy shows a loading state while online, and an error state with a Retry action when its fetch fails; a round cannot start from either state.
- B-20: A validation rejection logs one warning naming the document and the rule that failed.

### Slice 4: menu and download indicator

- B-21: The language step lists every language in the manifest, and the difficulty step lists only the difficulties that language's `banks` names, each with its label and description from the app's difficulty registry.
- B-22: A difficulty with no cached or bundled bank while offline is disabled and labeled "Needs a connection to load".
- B-23: While a bank is transferring, the download indicator is visible and announced once to assistive technology as a polite status; it is not shown while only the manifest is fetching, and it disappears when the transfer ends, whether it succeeded or failed.
- B-24: With reduced motion requested, the download indicator renders without animation.

### Slice 5: quiz

- B-25: A round presents every question of the bank exactly once, in a shuffled order.
- B-26: "Next" is unavailable until the current question is answered, and a second answer to an answered question is ignored.
- B-27: Answering a multiple-choice and a boolean question marks it correct or incorrect, and the progress bar shows the current position out of the total.
- B-28: After an incorrect answer an Explain action appears; it opens that question's query and does not advance the round.
- B-29: The query drawer opens from a question card, shows the query's title, syntax, explanation, and tags, and closes by its close control, by tapping the backdrop, and by the platform back gesture; answer and advance actions are inert while it is open, and advancing closes it.
- B-30: The results screen shows the correct count, the total, and the rounded percentage.
- B-31: Retry starts a new round with a fresh order and resets the index, the answer, the score, and the drawer state; the menu action and the Back action return to the menu without recording a completion.
- B-32: A bank refresh that lands during a round leaves that round's questions, order, answers, and score unchanged, and the refreshed bank is used from the next round.
- B-33: A prompt, a choice, a query explanation, and query tags containing `<script>` and HTML markup render as literal text in the real components.

### Slice 6: code block

- B-34: `CodeBlock` renders `question.code` and `query.syntax` as Prism tokens in nested `Text`, preserving whitespace, and never uses `dangerouslySetInnerHTML`.
- B-35: Hostile `question.code` and `query.syntax` values (the cases in the current `highlightQuestionCode` test, translated) render as literal text through the real renderer.
- B-36: Each existing language highlights with its own grammar, and a language whose grammar the build does not include renders as plain unhighlighted text.

### Slice 7: web parity and cutover

- B-37: On the web build, every binding in `KEY_BINDINGS` performs its action, Escape closes an open drawer before it leaves the round, and on native the keyboard hint bar is not rendered.
- B-38: Before the web cutover, a manual Lighthouse run on the web build scores 100 on accessibility, and a screen-reader and reduced-motion pass is recorded in the PR body.
- B-39: The GitHub Pages deploy publishes the Expo web export and `content/` at `/syntactical/`, the `dev`, `lint`, `test`, and `build` scripts run their Expo equivalents, and the repository no longer contains Vite configuration, `src/data`, or Vite dependencies.

### Slice 8: device builds and docs

- B-40: An EAS internal-distribution build installs and completes a round on an iOS device and an Android device, and the manual checklist records a pass for safe-area insets on a notched device, the query drawer, and the download indicator.
- B-41: `docs/stack.md` has an entry for Expo, Expo Router, NativeWind, react-native-web, TanStack Query, AsyncStorage, expo-crypto, Prism, and Jest; `docs/feature-list/features.md` and the user stories describe the shipped behavior; the README's setup and content-editing instructions run as written.

## Architecture

```
app/                              Expo Router screens
  _layout.tsx                     root layout, safe-area provider, theme, download indicator
  index.tsx                       language step
  [language]/index.tsx            difficulty step
  [language]/[difficulty].tsx     quiz round, then results
components/                       React Native rewrites of the current components
  menu/  quiz/  query/  stats/  layout/
state/                            hooks and providers (CLAUDE-FRONTEND-REACT.md: never a hooks/ directory)
  useQuizEngine, useQuizStats     ported; stats hydration added
  useLanguageManifest             new: the manifest with its load state
  useQuestionBank                 new: the bank with its load state
  useContentDownloads             new: whether any manifest or bank transfer is in flight (TanStack Query's useIsFetching)
  useKeyboardNav                  web build only
services/
  quiz/                           quizService, unchanged logic
  stats/                          statsService, unchanged logic
  content/                        loadLanguageManifest, loadQuestionBank, validateManifest,
                                  validateQuestionBank, resolveBankUrl, verifyBankHash
clients/
  storageClient                   AsyncStorage behind the existing readJson / writeJson interface
  contentClient                   fetch with an 8 second timeout and redirect: "error"
config/
  queryClient                     the TanStack Query client
constants/
  appConfig                       difficulty registry (labels, descriptions), key bindings, storage keys
content/                          source of truth for question content
  manifest.json
  <language>/<difficulty>.json
scripts/
  exportQuestionBanks             one-time: converts src/data/*.js to content/*.json
  buildContentManifest            build and deploy: writes each bank's hash into manifest.json
```

Dependencies flow `app -> components -> state -> services -> clients` (R-303).

### Routing and the static host

The web export uses Expo Router's single-page output (`web.output: "single"`) with `experiments.baseUrl` set to `/syntactical`. The deploy copies `index.html` to `404.html`, so GitHub Pages serves the app for any path under the base, and the client router resolves `/syntactical/<language>/<difficulty>` at runtime. A language added by JSON after the build therefore has a working URL with no rebuild. An unknown language or difficulty id in the URL renders a "Not found" screen with a link to the menu.

### Coexistence until cutover

The Expo app is added beside the Vite app: Expo uses `app/` and the new top-level directories, Vite keeps `src/` and `index.html`. Until PR 3, the deploy workflow builds both into one Pages artifact: Vite at `/syntactical/` and the Expo export at `/syntactical/preview/` (built with that base). Nothing in `src/` is deleted before PR 3, so the live Vite app keeps building throughout.

### Content loading

TanStack Query implements the fetching side of this contract (owner decision 11): one query per manifest and per bank, keyed by language, difficulty, and bank hash, with its client configured in `config/queryClient.ts`. The hash-bound AsyncStorage cache and the verification step are this app's own code.

1. **Cold start.** The app reads the cached manifest and the cached banks it needs from AsyncStorage, falling back to the bundled copies. A round may start as soon as that read completes; it never waits on the network.
2. **Refresh.** In the background, the manifest is fetched. Every bank whose manifest hash differs from its local copy's, or that has no local copy, is then prefetched, so a new language or a changed bank is ready before the user opens it.
3. **Verify.** A fetched bank's bytes are hashed with SHA-256 (`expo-crypto`) and must equal the manifest's bank hash. Then the document is validated. Only a verified, valid document is cached, and the bank and its hash are written as one AsyncStorage entry, so a cached bank can never be paired with the wrong hash.
4. **Coordination.** One request per bank is in flight at a time. When a response arrives, it is committed only if its hash still matches the current manifest; a response for an outdated manifest is discarded.
5. **Round isolation.** A round takes a snapshot of its bank when it starts. A refresh that lands mid-round is used from the next round on.
6. **No copy at all.** A bank in the manifest with no cached or bundled copy shows a loading state while it downloads, and an error state with Retry if the download fails. A round cannot start from either.

### Download indicator

A thin, low-contrast progress line at the top edge of the app shell, below the safe-area inset, appears only while a bank is transferring. The manifest is fetched on every launch and is small, so its fetch does not show the line, and a refresh that finds every hash unchanged shows nothing. A difficulty card whose bank is downloading for the first time shows a small inline "Downloading" label in place of its question count. The line has `role="status"` on the web and `accessibilityLiveRegion="polite"` on Android (iOS announces through `AccessibilityInfo.announceForAccessibility`), announcing "Updating questions" once per transfer. With reduced motion, the line is static rather than animated.

### Data conversion

`scripts/exportQuestionBanks` reads the nine current bank modules and writes them to `content/` as JSON with no change to the question objects. It writes the initial manifest from `LANGUAGES` in `appConfig.js`, adding each language's grammar. The owner edits the manifest's display fields, grammars, and bank paths by hand; `buildContentManifest` fills in every bank hash, so the owner never edits a hash. The conversion parity test (B-9) is deleted with `src/data` and the `LANGUAGES` list in PR 3. The `DIFFICULTIES` display registry stays in `appConfig.js`.

### Storage

`storageClient` keeps the `readJson(key, fallback)` / `writeJson(key, value)` interface, made asynchronous, backed by `@react-native-async-storage/async-storage`. On the web, AsyncStorage stores data in `window.localStorage`, so keeping the `syntactical.stats.v1` key and the same GitHub Pages URL carries existing stats over with no migration code. Cached banks and the cached manifest use keys under the `syntactical.content.v1.` prefix.

`useQuizStats` gains an explicit hydration state: it reads stored stats once at startup, and the quiz cannot start until hydration completes. After hydration, the in-memory stats are the source of truth, and every change is persisted through a single write queue, so writes land in order. A failed write is logged and leaves the in-memory stats intact.

### Keyboard navigation

`useKeyboardNav` and `KeyboardHintBar` render only on the web build. Every action is reachable by touch on every platform.

### Scripts

| Script | Before | After |
|---|---|---|
| `dev` | `vite` | `expo start` |
| `build` | `vite build` | `buildContentManifest`, then `expo export --platform web`, then copy `index.html` to `404.html` |
| `preview` | `vite preview` | `npx serve dist` |
| `lint` | `oxlint` | `oxlint` (unchanged) |
| `test` | `node --test` | `jest` |
| `deploy` | `gh-pages -d dist` | removed; the GitHub Actions workflow deploys |

## Content format

```jsonc
// content/manifest.json
{
  "schemaVersion": 1,
  "languages": [
    {
      "id": "python",
      "label": "Python",
      "glyph": "PY",
      "tagline": "Runtime semantics, stdlib, and the sharp edges.",
      "grammar": "python",
      "banks": {
        "easy":   { "path": "python/easy.json",   "hash": "<sha256 of the file>" },
        "medium": { "path": "python/medium.json", "hash": "<sha256 of the file>" },
        "hard":   { "path": "python/hard.json",   "hash": "<sha256 of the file>" }
      }
    }
  ]
}
```

```jsonc
// content/python/easy.json
{ "schemaVersion": 1, "questions": [ /* question objects, same shape as today */ ] }
```

Difficulty display fields (label and description) stay in the app's registry, since they are copy rather than content; the manifest names which difficulties a language has through the keys of `banks`.

### Validation rules

The validators are hand-written (no schema library, R-331; see stack option 6 in the spec review).

**Manifest.** The root is an object with an integer `schemaVersion` the app supports and a non-empty `languages` array. Each language is an object with an `id` matching `^[a-z0-9-]{1,32}$` and unique across the manifest; non-empty string `label`, `glyph`, and `tagline` of at most 120 characters; a `grammar` from the set of Prism grammars the build includes (`python`, `sql`, `javascript`, `typescript`, `go`, `rust`, `ruby`, `bash`, `plain`); and a non-empty `banks` object whose keys are difficulty ids in the app's registry. Each bank entry has a `hash` of 64 lowercase hexadecimal characters and a `path` that passes the path rule. The manifest is at most 64 KB.

**Bank path rule.** The path must be a relative path of segments matching `^[a-z0-9-]+$` separated by `/`, ending in `.json`. It is resolved with `new URL(path, CONTENT_BASE_URL)`, and the result must have the same origin as the content base URL and a pathname that starts with the base's pathname. Percent-encoding, backslashes, a leading `/`, and `..` are rejected before resolution. Fetches use `redirect: "error"`.

**Bank.** The root is an object with an integer `schemaVersion` the app supports and a `questions` array of 1 to 500 items, and the file is at most 512 KB. A question is valid when it has an `id` matching `^[a-z0-9-]{1,64}$` and unique within the bank, a non-empty `prompt` of at most 2,000 characters, and a `query` object with a non-empty `title` (at most 200 characters) and `explanation` (at most 4,000 characters), and either `type: "mc"` with a `choices` array of 2 to 4 non-empty strings of at most 300 characters and an integer `answerIndex` inside that array, or `type: "bool"` with a boolean `answer`. Optional `code` and `query.syntax` are strings of at most 4,000 characters, and optional `query.tags` is an array of at most 10 non-empty strings of at most 40 characters.

## Error handling

The rule is that the user always gets a round when any copy of the bank exists.

| Failure | Behavior |
|---|---|
| Offline, a redirect, or the body not finished within 8 seconds | The cached copy is used, or the bundled copy when none is cached. No error is shown |
| The manifest or a bank fails validation as a whole, exceeds its size limit, or fails hash verification | That download is discarded, the last good copy stays in use, and one warning is logged |
| One question inside an otherwise valid bank fails validation | Only that question is dropped; the rest of the bank is cached |
| `schemaVersion` is newer than the app supports | The download is ignored; the app needs a store update to read the new format |
| A bank has no cached or bundled copy | Loading state while online; error state with Retry when the fetch fails; "Needs a connection to load" when offline. No round starts |
| A bank validates but contains zero valid questions | Treated as a failed validation |
| An AsyncStorage write fails (quota or platform error) | Logged; the in-memory state continues for the session, and the previous cached copy remains |
| The URL names an unknown language or difficulty | A "Not found" screen with a link to the menu |

## Security

**Risk:** PR 1 and PR 2 are high (slice 3 validates input on a trust boundary, and slice 6 replaces the markup-rendering boundary, R-110); PR 3 is standard.

- **Threat model:** content is fetched only from the owner's GitHub Pages over HTTPS. The realistic threats are a malformed or oversized edit by the owner and a partially deployed update; compromise of the repository or of Pages is out of scope (owner decision 7). Content is always rendered as React Native `Text`. The current `CodeBlock` renders Prism output with `dangerouslySetInnerHTML`; slice 6 replaces it with tokens rendered as nested `Text`, so no fetched string is ever interpreted as markup on any platform.
- **Acceptance boundary:** every validation rule above has a test that feeds it the invalid value and asserts rejection (B-11 to B-14); the path rule has tests for encoded traversal, backslashes, root-relative paths, absolute URLs, and other origins; hostile strings render as literal text in every real component (B-33, B-35).

## Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Jest through `jest-expo` | Services, validators, the path rule, hash verification, the content loader's coordination, the storage client, and the stats write queue |
| Component | React Native Testing Library | The menu steps, the cards, the query drawer, the code block, the results screen, the stats panel, the download indicator, and keyboard bindings on the web build |
| Native | Manual checklist on a device build | A full round, safe-area insets, the query drawer, and the download indicator |

There is no E2E suite (owner decision 9). Jest replaces `node --test` because it is the test runner Expo's toolchain supports out of the box (`jest-expo` preset); Vitest, the house default, has no maintained React Native preset (R-331). The existing `highlightQuestionCode` test is translated into B-35. Accessibility on the web build must reach a Lighthouse accessibility score of 100, checked manually before the cutover.

## Slices

| # | Slice | Risk |
|---|---|---|
| 1 | Expo scaffold: Expo Router, NativeWind, Jest, routing on the static host, and the web export deploying to `/syntactical/preview/` | standard |
| 2 | `storageClient` on AsyncStorage; stats service and hook ported with hydration and the write queue, and the `syntactical.stats.v1` key unchanged | standard |
| 3 | Content: the export script and parity fixture, `content/` JSON, validators, the path rule, `contentClient`, hash verification, the loaders with coordination, cache and fallback, and `buildContentManifest` | high |
| 4 | Menu screens (language step, difficulty step) rendered from the manifest, and the download indicator | standard |
| 5 | Quiz screens: the cards, progress bar, Explain, results, retry, the query drawer as a `Modal`, and the stats panel | standard |
| 6 | `CodeBlock` built from `Prism.tokenize()` tokens rendered as nested `Text`, with the grammar mapping and plain-text fallback | high |
| 7 | Web parity: keyboard shortcuts on the web, accessibility, the cutover to Expo at `/syntactical/`, and removal of Vite and `src/` | standard |
| 8 | EAS internal device builds, and the docs: `docs/stack.md`, the feature list, user stories, and the README | standard |

The slices ship as three PRs off `main` (owner decision 8), each PR running its slices in order under the TDD lock:

| PR | Slices | Risk |
|---|---|---|
| 1 | 1, 2, 3: scaffold, storage, content | high |
| 2 | 4, 5, 6: every screen and `CodeBlock` | high |
| 3 | 7, 8: web parity, the cutover from Vite, EAS builds, docs | standard |

## Non-goals

- App Store and Play Store listings and submission (follow-up ticket).
- An admin interface for editing questions.
- Accounts, sync of stats across devices, and any server.
- Content signing.
- A Playwright E2E suite (owner decision 9).
- Native device automation such as Maestro; the manual checklist covers this ticket.

## Spec review

**Reviewer:** Codex (account default model), read-only, run 2026-10-02 against commit `e4698eb`. Two owner decisions landed while it ran (content hashes and no Playwright, commit `015c6d7`), so findings about hand-bumped versions and Playwright were checked against the revised design.

| # | Sev | Disposition |
|---|---|---|
| 1 | HIGH | Fixed: the Expo app coexists with Vite until PR 3; nothing in `src/` is deleted earlier; parity fixture keeps B-9 alive (Coexistence until cutover, B-9) |
| 2 | HIGH | Fixed: stats hydration gate and an ordered write queue (Storage, B-5, B-6) |
| 3 | HIGH | Fixed: downloaded bytes are hashed and must equal the manifest's bank hash (Content loading step 3, B-14) |
| 4 | HIGH | Fixed: single in-flight request per bank, commit only for the current manifest, bank and hash stored as one entry (Content loading step 4, B-16, B-17) |
| 5 | HIGH | Fixed: single-page output, `/syntactical` base URL, `404.html` fallback (Routing and the static host, B-2) |
| 6 | MEDIUM | Fixed: loading, error, and Retry states for a bank with no copy (B-19) |
| 7 | MEDIUM | Fixed: a round may start once the cache read completes, never waiting on the network (Content loading step 1, B-15) |
| 8 | MEDIUM | Fixed: round snapshot (Content loading step 5, B-32) |
| 9 | MEDIUM | Fixed: root shapes, id grammar, uniqueness, non-empty collections (Validation rules, B-11, B-12) |
| 10 | MEDIUM | Fixed: size, count, and length limits; the timeout covers the body (Validation rules, B-13, B-18) |
| 11 | MEDIUM | Fixed: segment grammar, URL resolution with origin and prefix checks, `redirect: "error"` (Bank path rule) |
| 12 | MEDIUM | Fixed: the `DIFFICULTIES` registry stays (Data conversion, B-21) |
| 13 | MEDIUM | Fixed: TanStack Query adopted for fetching (owner decision 11) |
| 14 | LOW | Fixed: hooks live in `state/` |
| 15 | MEDIUM | Fixed: the literal-text criterion moved to slice 5 against the real components (B-33) |
| 16 | MEDIUM | Fixed: web `h1`, native header role (B-1) |
| 17 | MEDIUM | Fixed: slice 6 is high risk, hostile-input tests translated (B-35) |
| 18 | MEDIUM | Fixed: Explain after an incorrect answer (B-28) |
| 19 | MEDIUM | Fixed: retry reset, menu, and Back (B-31) |
| 20 | MEDIUM | Fixed: shuffle, advance guard, answer lock (B-25, B-26) |
| 21 | MEDIUM | Fixed: streaks, breakdowns, one completion per round (B-7, B-8) |
| 22 | MEDIUM | Fixed: progress, correct count, total, percentage (B-27, B-30) |
| 23 | MEDIUM | Fixed: tags, backdrop, inert actions, close on advance, Escape order (B-29, B-37) |
| 24 | MEDIUM | Fixed: choices limited to 2 to 4, matching the labels and bindings (Validation rules) |
| 25 | MEDIUM | Fixed: per-language grammar in the manifest, plain-text fallback (B-36) |
| 26 | MEDIUM | Fixed: write-failure behavior (B-3, B-6, Error handling) |
| 27 | MEDIUM | Superseded: content hashes replaced the version-bump check, so there is no comparison base to define |
| 28 | MEDIUM | Fixed: script table and a single Pages artifact carrying both builds until cutover (Scripts, Coexistence, B-39) |
| 29 | MEDIUM | Fixed: safe-area checklist, warning logging, difficulty registry, and docs completion criteria (B-20, B-21, B-40, B-41) |

Stack options: keep Expo, NativeWind, static JSON hosting, AsyncStorage, Prism, `Modal`, and the manual device checklist (options 1, 3, 4, 7, 8, 9, 11). Option 2 (routing) is resolved by finding 5. Option 5 (TanStack Query) is adopted as owner decision 11. Option 6 (Zod): keep hand-written validators, since two small formats do not justify a dependency. Option 10 (Playwright) and option 12 (version script) are superseded by owner decisions 9 and 8.
