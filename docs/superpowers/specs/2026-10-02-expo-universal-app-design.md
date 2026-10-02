# Expo universal app with runtime question content

**Ticket:** IAN-564
**Branch:** `feat/expo-universal-app`
**Status:** draft, awaiting owner review
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
7. The slice 3 threat model and acceptance boundary below are approved as written; content signing is not required.

## Domain vocabulary

Existing terms in `docs/lexicon.md` (`bank`, `round`, `query`, `question`, `code block`) keep their meanings. `track`, `tier`, `level`, and `subject` stay banned as identifiers; this spec uses `language` and `difficulty`.

- manifest - the fetched `manifest.json` that lists every language, its display fields, and the bank file and bank version for each of its difficulties - chosen over: `catalog`, `index`, because `index` already names `src/data/index.js` and `catalog` suggests something purchasable.
- bank version - the integer `version` the manifest records for one bank, raised by the owner on every edit to that bank and compared against the cached bank to decide whether to download - chosen over: `revision`, `etag`, because it is owner-maintained data, not an HTTP header.
- bundled bank - the copy of a bank shipped inside the app build, used when no cached bank exists - chosen over: `default bank`, `seed`, because `seed` implies a database.
- cached bank - the last validated bank downloaded at runtime and stored on the device - chosen over: `stored bank`, `local bank`.
- content base URL - the absolute URL the manifest and banks are fetched from, configured as `CONTENT_BASE_URL` - chosen over: `api url`, because there is no API.

## Acceptance criteria

Ordered by slice. Each line is one behavior a test can fail.

- B-1 (slice 1): The Expo web export builds, and its root route renders the app shell with one `h1` on web, iOS, and Android.
- B-2 (slice 2): `storageClient.readJson` returns the fallback when the key is missing, when the stored value is not valid JSON, and when storage throws.
- B-3 (slice 2): Stats written by the current Vite build under `syntactical.stats.v1` are read unchanged by the Expo web build served from the same origin.
- B-4 (slice 3): `exportQuestionBanks` produces nine bank files whose questions deep-equal the current `src/data` modules, and a manifest listing the three current languages with every bank version at 1.
- B-5 (slice 3): `validateManifest` rejects each malformed manifest field named under Validation rules, including a bank path containing `..` or an absolute URL.
- B-6 (slice 3): `validateQuestionBank` drops each malformed question named under Validation rules and keeps the valid questions in the same bank.
- B-7 (slice 3): A bank or manifest whose `schemaVersion` is newer than the app supports, or a bank with zero valid questions, is rejected as a whole and the previous copy stays in use.
- B-8 (slice 3): `useQuestionBank` returns the cached bank, or the bundled bank when none is cached, before any fetch resolves.
- B-9 (slice 3): A fetched bank whose bank version is newer than the cached bank's and that validates is written to the cache, and one whose version is not newer is not fetched.
- B-10 (slice 3): A fetch that fails or exceeds 8 seconds leaves the current copy in use and shows no error.
- B-11 (slice 3): `checkBankVersions` exits non-zero when a bank file's contents differ from `main` and its bank version in the manifest did not increase.
- B-12 (slice 3): A prompt, a choice, and a query explanation containing `<script>` and HTML markup render as literal text.
- B-13 (slice 4): The language step lists every language in the manifest, and the difficulty step lists only the difficulties that language's `banks` names.
- B-14 (slice 4): A difficulty with no cached or bundled bank while offline is disabled and labeled "Needs a connection to load".
- B-15 (slice 5): Answering a multiple-choice and a boolean question marks it correct or incorrect, advances on "Next", and the results screen reports the round's score.
- B-16 (slice 5): The query drawer opens from a question card, shows the query's title, syntax, and explanation, and closes by its close control and by the platform back gesture.
- B-17 (slice 5): Stats recorded during a round appear in the stats panel and persist across an app restart.
- B-18 (slice 6): `CodeBlock` renders `question.code` and `query.syntax` as Prism tokens in nested `Text` with token classes mapped to colors, and never uses `dangerouslySetInnerHTML`.
- B-19 (slice 7): On the web build, every binding in `KEY_BINDINGS` performs its action, and on native the keyboard hint bar is not rendered.
- B-20 (slice 7): The Playwright suite covers a full round, stats surviving a reload, and offline fallback, and the web build scores 100 on Lighthouse accessibility.
- B-21 (slice 7): The GitHub Pages deploy publishes the Expo web export and `content/`, and the repository no longer contains Vite configuration or dependencies.
- B-22 (slice 8): An EAS internal-distribution build installs and completes a round on an iOS device and an Android device, recorded in the manual checklist.

## Architecture

```
app/                              Expo Router screens
  _layout.tsx                     root layout, safe-area provider, theme
  index.tsx                       language step
  [language]/index.tsx            difficulty step
  [language]/[difficulty].tsx     quiz round, then results
components/                       React Native rewrites of the current components
  menu/  quiz/  query/  stats/  layout/
hooks/
  useQuizEngine, useQuizStats     ported with logic unchanged
  useQuestionBank                 new: returns the bank for a language and difficulty, with its load state
  useLanguageManifest             new: returns the manifest, with its load state
  useKeyboardNav                  web build only
services/
  quiz/                           quizService, unchanged logic
  stats/                          statsService, unchanged logic
  content/                        loadLanguageManifest, loadQuestionBank, validateManifest, validateQuestionBank
clients/
  storageClient                   AsyncStorage behind the existing readJson / writeJson interface
  contentClient                   fetch with an 8 second timeout against CONTENT_BASE_URL
content/                          source of truth for question content
  manifest.json
  <language>/<difficulty>.json
scripts/
  exportQuestionBanks             one-time: converts src/data/*.js to content/*.json
  checkBankVersions               CI: fails when a bank's contents changed without a bank version bump
```

Dependencies flow `app -> components -> hooks -> services -> clients` (R-303).

### Content load sequence

1. `useQuestionBank` returns the cached bank immediately, or the bundled bank when no cached bank exists, so a round starts without waiting on the network.
2. In the background, `loadLanguageManifest` fetches `manifest.json`, then `loadQuestionBank` fetches the bank file when the manifest's bank version is newer than the cached bank's.
3. Each fetched document passes through its validator. A document that passes is written to the cache and used from the next round on. A document that fails is discarded and the previous copy stays in use.

The manifest follows the same rule: cached manifest first, bundled manifest when none is cached, refreshed in the background.

### Data conversion

`scripts/exportQuestionBanks` reads the nine current bank modules and writes them to `content/` as JSON with no change to the question objects. It writes the initial manifest from `LANGUAGES` and `DIFFICULTIES` in `appConfig.js`, every bank version starting at 1. After the export, `src/data/` and the language and difficulty lists in `appConfig.js` are deleted, and `content/` becomes the only place questions are edited.

### Storage

`storageClient` keeps the `readJson(key, fallback)` / `writeJson(key, value)` interface, made asynchronous, backed by `@react-native-async-storage/async-storage`. On the web, AsyncStorage stores data in `window.localStorage`, so keeping the `syntactical.stats.v1` key and the same GitHub Pages URL carries existing stats over with no migration code. Cached banks and the cached manifest use keys under the `syntactical.content.v1.` prefix.

### Keyboard navigation

`useKeyboardNav` and `KeyboardHintBar` render only on the web build. Every action is reachable by touch on every platform.

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
      "banks": {
        "easy":   { "path": "python/easy.json",   "version": 1 },
        "medium": { "path": "python/medium.json", "version": 1 },
        "hard":   { "path": "python/hard.json",   "version": 1 }
      }
    }
  ]
}
```

```jsonc
// content/python/easy.json
{ "schemaVersion": 1, "questions": [ /* question objects, same shape as today */ ] }
```

Difficulty display fields (label and description) stay in the app, since they are copy rather than content; the manifest only names which difficulties a language has, through the keys of `banks`.

### Validation rules

The validators are hand-written (no schema library, R-331). A manifest is valid when `schemaVersion` is an integer the app supports and every language has a non-empty string `id`, `label`, `glyph`, and `tagline`, and a `banks` object whose keys are known difficulty ids and whose values have a relative `path` ending in `.json` with no `..` segment and an integer `version` of at least 1.

A question is valid when it has a non-empty string `id`, `prompt`, `query.title`, and `query.explanation`, and either `type: "mc"` with a `choices` array of 2 to 6 non-empty strings and an integer `answerIndex` inside that array, or `type: "bool"` with a boolean `answer`. Optional `code`, `query.syntax`, and `query.tags` must be a string, a string, and an array of strings when present.

## Error handling

The rule is that the user always gets a round.

| Failure | Behavior |
|---|---|
| Offline, or the request times out after 8 seconds | The cached copy is used, or the bundled copy when none is cached. No error is shown |
| The manifest or a bank fails validation as a whole | That download is discarded, the last good copy stays in use, and a warning is logged |
| One question inside an otherwise valid bank fails validation | Only that question is dropped; the rest of the bank is cached |
| `schemaVersion` is newer than the app supports | The download is ignored; the app needs a store update to read the new format |
| A language in the manifest has no cached or bundled bank and the device is offline | The difficulty card shows "Needs a connection to load" and is disabled |
| A bank validates but contains zero questions | It is treated as a failed validation |

## Security

**Risk:** slice 3 is high (input validation on a trust boundary, R-110); every other slice is standard.

- **Threat model:** content is fetched only from the owner's GitHub Pages over HTTPS. The realistic threat is a malformed edit by the owner; compromise of the repository or of Pages is out of scope (owner decision 7). Content is always rendered as React Native `Text`. The current `CodeBlock` renders Prism output with `dangerouslySetInnerHTML`; slice 6 replaces it with tokens rendered as nested `Text`, so no fetched string is ever interpreted as markup on any platform.
- **Acceptance boundary:** every validation rule above has a test that feeds it the invalid value and asserts rejection, and a test feeds a prompt, a choice, and a query explanation containing `<script>` and HTML markup and asserts they render as literal text. A bank path containing `..` or an absolute URL is rejected.

## Testing

| Layer | Tool | Covers |
|---|---|---|
| Unit | Jest through `jest-expo` | Services, validators, the content loader, the storage client, and hooks |
| Component | React Native Testing Library | Cards, the menu steps, the query drawer, the code block, and the stats panel |
| E2E (web) | Playwright against the Expo web export | Choosing a language and difficulty, answering, results, stats surviving a reload, offline fallback, keyboard navigation, and accessibility |
| Native | Manual checklist on a device build | The same main path, safe-area insets, and the query drawer |

Jest replaces `node --test` because Expo's toolchain supports only Jest; Vitest, the house default, is not supported for React Native (R-331). The existing `highlightQuestionCode` test is ported. Accessibility on the web build must reach a Lighthouse accessibility score of 100.

## Slices

| # | Slice | Risk |
|---|---|---|
| 1 | Expo scaffold: Expo Router, NativeWind, Jest, and the web export deploying to a Pages preview path as an empty app shell | standard |
| 2 | `storageClient` on AsyncStorage; stats service and hook ported with the `syntactical.stats.v1` key unchanged | standard |
| 3 | Content: the export script, `content/` JSON, validators, `contentClient`, the loaders, cache and fallback, and the `checkBankVersions` CI step | high |
| 4 | Menu screens (language step, difficulty step) rendered from the manifest | standard |
| 5 | Quiz screens: the cards, progress bar, results, the query drawer as a `Modal`, and the stats panel | standard |
| 6 | `CodeBlock` built from `Prism.tokenize()` tokens rendered as nested `Text` | standard |
| 7 | Web parity: keyboard shortcuts on the web, accessibility, the Playwright suite, and removal of Vite | standard |
| 8 | EAS internal device builds, and the docs: `docs/stack.md`, the feature list, user stories, and the README | standard |

Each slice ships as one PR off `main`, except that slices 1 to 7 replace the Vite app progressively, so the web deploy switches from Vite to Expo only in slice 7. Until then the Expo build deploys to a preview path and the live site stays on Vite.

## Non-goals

- App Store and Play Store listings and submission (follow-up ticket).
- An admin interface for editing questions.
- Accounts, sync of stats across devices, and any server.
- Content signing.
