# Syntactical v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Every task marked **Risk: high** runs under `tdd-gated-dispatch` instead: `tdd.sh open`, the `test-author` agent writes the RED tests from the **Behaviors** list (it never receives this plan's code blocks, R-411), `tdd.sh red`, the `implementer` makes them GREEN, the `slice-critic` reviews. High-risk tasks therefore list behaviors and test files, not implementation code. Standard-risk tasks run the lean tier: tests written alongside the code, one review per PR.

**Goal:** Ship Syntactical v2: an execution-verified, enriched content library produced by a build-time pipeline; accounts with cross-device sync; day streak, XP, daily goal, and spaced review; paid Medium and Hard banks on web, iOS, and Android.

**Architecture:** npm workspaces in this repo. The Expo app stays at the root. `packages/content-schema` holds content types, constants, and validators for every consumer; `packages/progress` holds XP, day streak, daily progress, and the review scheduler as pure functions shared by app and server. `pipeline/` is a Node CLI that runs oracles in hardened Docker runners and calls Claude through a `ModelProvider`. `server/` is an Express 5 API on Railway with Neon Postgres at `https://api.syntactical.dev`: auth, answer event sync, entitlements, account deletion, and paid banks. Paid bank sources live in the private `syntactical-content` repo. The web app moves to `https://syntactical.dev`.

**Tech Stack:** Expo SDK 57, Expo Router, React Native + react-native-web, NativeWind, TanStack Query, AsyncStorage, expo-secure-store, posthog-react-native, react-native-purchases; Node 22, TypeScript, Express 5, zod, helmet, cors, cookie-parser, pg, node-pg-migrate, pino, Resend, vitest, supertest, ts-fsrs; RevenueCat (`react-native-purchases`, `@revenuecat/purchases-js` Web Billing); Docker; Anthropic SDK and `claude -p`.

**Spec:** `docs/superpowers/specs/2026-10-02-syntactical-v2-design.md` (behaviors B-1 to B-64; decisions 1 to 25). Vocabulary: `docs/lexicon.md`.

**Merge mode:** owner reads and merges every PR (Gate 1, 2026-10-02, R-514).

## Global Constraints

- Node 22 for `server/`, `pipeline/`, and `packages/*`. Runner runtimes: Node Active LTS, Python and Postgres one major behind latest, exact versions pinned in each runner's Dockerfile and recorded on every question as `provenance.runtimeVersion`.
- No model provider code in the root app (`app/`, `components/`, `state/`, `services/`, `clients/`) or in `server/`.
- Content `schemaVersion` is 2 everywhere after Task 1.5; `SUPPORTED_SCHEMA_VERSION = 2`.
- Question discriminator stays `question.type` with values `'mc' | 'bool' | 'ab'`; never `kind`, never `tf`.
- Free or paid is `bankEntry.access`; never `tier`.
- A wrong choice's teaching text is `choice.rationale`, at most 280 characters.
- `session` means sign-in session only; a quiz pass is a round.
- Session tokens: 32 random bytes, base64url; only `sha256(token)` stored; expiry 30 days absolute or 14 days idle. One-time codes: 6 digits, only `sha256(code)` stored, 10-minute expiry, 5 attempts, a new code invalidates older unused ones, compared with `timingSafeEqual`.
- Cookie: `syntactical_session`, `HttpOnly; SameSite=Lax; Path=/`, `Secure` except in `NODE_ENV=development`, host-only on `api.syntactical.dev`.
- CORS: exactly `https://syntactical.dev`, credentials true. Cookie-authenticated non-GET routes require `X-Requested-With: XMLHttpRequest` and `Content-Type: application/json`. `app.set('trust proxy', 1)`.
- Answer events: batches of at most 200; `answeredAt` within [user `created_at` − 365 days, server now + 5 minutes]; the server derives `isCorrect`.
- Never log email, one-time code, session token, or webhook secrets.
- Lighthouse accessibility 100 on every route; reduced motion uses `animation: none`; screen readers and web keyboard supported on every new screen; no key binding fires while a text field has focus.
- Prices come from the RevenueCat offering's `priceString` on every platform; product id `syntactical.<language>.<difficulty>`; $5 list price. The server holds no Stripe code; RevenueCat is the only purchase webhook.
- Paid bank files never appear in this public repo, the bundle, or the web export.
- Root app tests: Jest (`native` and `web` projects), per-directory `__tests__/`. Workspace tests: vitest, one `src/__tests__/` tree mirroring `src/` (R-314). Server integration tests hit a real Postgres (CI service container), never mocks.
- Follow `docs/lexicon.md` for every new identifier.

## Review Focus

Inputs the spec implies but no single task's tests otherwise exercise; each line's test is added to the named task.

1. A user signs in on a second device while the first device still has unsynced events: both devices' events land once and both converge on the same XP (Task 3.11: two clients upload overlapping batches concurrently).
2. A device east of UTC answers just after local midnight: the day streak counts the local day (Task 3.6: `Pacific/Auckland` at 00:05 local).
3. A user buys on web, then opens the iOS app signed in but offline: the bank shows as owned from the last `/me` and says "Needs a connection" rather than showing a paywall (Task 3.18).
4. The pipeline publishes while a learner has an old cached free bank: one re-download, and the round in progress is not interrupted (Task 2.6).
5. A RevenueCat refund event is delivered before its purchase event: the entitlement ends revoked (Task 3.17).

---

## Gate 1 (owner)

Passed 2026-10-02. The owner approved the spec and plan, chose owner-merges-every-PR, and picked: RevenueCat Web Billing for web payments (Tasks 3.16 to 3.18), `claude -p` as the bulk model path (Task 1.9), and `ts-fsrs` as the review scheduler (Task 4.1).

## PR boundaries

| PR | Tasks | Risk |
|---|---|---|
| 1 | 0.1, 0.2 | high (content origin control) |
| 2 | 1.0 | standard (bug fix, test-first) |
| 3 | 1.1, 1.2 | standard |
| 4 | 1.3, 1.4, 1.5, 1.6 | high (trust-boundary content validation, private content split) |
| 5 | 1.7, 1.8 | high (runner sandbox) |
| 6 | 1.9, 1.10, 1.11 | standard |
| 7 | 1.12 (content audit fixes) | standard, content only |
| 8 | 1.13, 1.14 | standard |
| 9 | 2.1, 2.2, 2.3 | high (2.3 runs generated code) |
| 10 | 2.4, 2.5, 2.6 | standard |
| 11 | 2.7, 2.8 | standard |
| 12 | 3.1, 3.2 | high (migrations, middleware stack) |
| 13 | 3.3, 3.4, 3.5 | high (auth, sessions, CORS, CSRF) |
| 14 | 3.6, 3.7, 3.8 | high (sync concurrency) |
| 15 | 3.9, 3.10, 3.11 | high (client sessions, guest merge) |
| 16 | 3.12, 3.13 | standard |
| 17 | 3.14, 3.15 | high (entitlement gate) |
| 18 | 3.16, 3.17 | high (payments: web billing and the RevenueCat webhook) |
| 19 | 3.18 | high (purchase flow) |
| 20 | 3.21 | high (account deletion) |
| 21 | 3.19, 3.20 | standard |
| 22 | 4.1, 4.2, 4.3 | standard |
| 23 | 5.1 to 5.5 | standard |
| 24 | 6.1 | standard |

---

## Stage 0: long-lead setup and domain cutover

### Task 0.0 (owner, not code): long-lead accounts

- [ ] DNS for `syntactical.dev`: apex records to GitHub Pages; `api` CNAME to Railway (after Task 3.20 creates the service).
- [ ] GitHub repo Settings → Pages → custom domain `syntactical.dev`, enforce HTTPS.
- [ ] Create the private repo `nullvoidundefined/syntactical-content`; add a read-only deploy key; store its private half as the Actions secret `CONTENT_DEPLOY_KEY` in this repo and in Railway.
- [ ] Apple Developer Program, Play Console, tax and banking forms in both.
- [ ] RevenueCat project linked to both stores and to a Stripe account for Web Billing (test mode first), PostHog project, Resend with SPF and DKIM on `syntactical.dev`, Neon project (`main` and `ci` branches), Railway project.
- [ ] Secrets in GitHub Actions and Railway: `DATABASE_URL`, `RESEND_API_KEY`, `REVENUECAT_WEBHOOK_AUTH`, `RATE_LIMIT_KEY_SECRET`, `REVENUECAT_WEB_BILLING_PUBLIC_KEY`, `POSTHOG_API_KEY`, `ANTHROPIC_API_KEY` (pipeline CI only).

### Task 0.1: move the web build and content origin to syntactical.dev

**Risk:** high (the content base URL allowlist is a security control). **Behaviors:** B-55.

**Files:**
- Modify: `app.config.ts` (`CONTENT_ORIGIN`, `ALLOWED_BASE_URLS`, `experiments.baseUrl`)
- Modify: `services/content/validateContentBaseUrl.ts`
- Create: `public/CNAME` (contains `syntactical.dev`)
- Modify: `.github/workflows/deploy.yml` (no base path), `scripts/copySpaFallback.mjs` if it assumes `/syntactical`
- Test: `app/__tests__/appConfigOrigin.test.ts`, `services/content/__tests__/validateContentBaseUrl.test.ts`, `scripts/__tests__/packageScripts.test.ts`

**Interfaces:** Produces `extra.contentBaseUrl === 'https://syntactical.dev/content/'`; `validateContentBaseUrl(value: unknown): string | null` keeps its signature.

**Behaviors (RED tests):**
- `appConfigOrigin.test.ts`: an unset `EXPO_BASE_URL` resolves the content base URL to `https://syntactical.dev/content/`; `experiments.baseUrl` is `''`; any set value throws at config load (the preview path is removed).
- `validateContentBaseUrl.test.ts`: returns the input for exactly `https://syntactical.dev/content/`; returns `null` for the old GitHub Pages content URL, the `http://` form, `https://syntactical.dev.evil.com/content/`, `https://evilsyntactical.dev/content/`, the form without a trailing slash, a URL with userinfo (assembled at run time from parts so no credential-shaped literal is committed), `''`, `null`, and `42`.
- `packageScripts.test.ts`: `public/CNAME` contains exactly `syntactical.dev`.

**Steps:**
- [ ] `tdd.sh open 0.1`; dispatch `test-author` with the behaviors; `tdd.sh red`.
- [ ] Dispatch `implementer`; `tdd.sh green`; `slice-critic`.
- [ ] `npm test && npx tsc --noEmit && npm run build`; `grep -r "nullvoidundefined.github.io" app.config.ts services clients state` returns nothing.
- [ ] Commit `feat(web): serve the app and content from syntactical.dev`.

### Task 0.2: live-site check for the custom domain and old URL

**Risk:** standard. **Behaviors:** B-56.

**Files:** Create `scripts/checkLiveSite.mjs` (export `checkLiveSite(fetchImpl)`); test `scripts/__tests__/checkLiveSite.test.ts`; modify `.github/workflows/deploy.yml` (run it after deploy).

- [ ] **Step 1: Write the failing test**

```ts
import { checkLiveSite } from '../checkLiveSite.mjs';

function fakeFetch(map: Record<string, { status: number; location?: string }>) {
  return async (url: string) => {
    const hit = map[url];
    return { status: hit.status, headers: { get: (name: string) => (name === 'location' ? hit.location ?? null : null) } };
  };
}

describe('checkLiveSite', () => {
  it('passes when the old Pages URL redirects to the same path and both pages load', async () => {
    const result = await checkLiveSite(
      fakeFetch({
        'https://nullvoidundefined.github.io/syntactical/python/easy': { status: 301, location: 'https://syntactical.dev/python/easy' },
        'https://syntactical.dev/': { status: 200 },
        'https://syntactical.dev/python/easy': { status: 200 },
      }),
    );
    expect(result).toEqual({ isHealthy: true, problems: [] });
  });

  it('reports a redirect to the wrong path', async () => {
    const result = await checkLiveSite(
      fakeFetch({
        'https://nullvoidundefined.github.io/syntactical/python/easy': { status: 301, location: 'https://syntactical.dev/' },
        'https://syntactical.dev/': { status: 200 },
        'https://syntactical.dev/python/easy': { status: 200 },
      }),
    );
    expect(result.isHealthy).toBe(false);
    expect(result.problems).toContain('old deep link redirects to https://syntactical.dev/');
  });
});
```

- [ ] **Step 2:** `npx jest scripts/__tests__/checkLiveSite.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement**

```js
// Checks the live site after a deploy: the custom domain serves the root and a
// deep link, and the old GitHub Pages deep link redirects to the same path.
const OLD_DEEP_LINK = 'https://nullvoidundefined.github.io/syntactical/python/easy';
const NEW_ROOT = 'https://syntactical.dev/';
const NEW_DEEP_LINK = 'https://syntactical.dev/python/easy';

export async function checkLiveSite(fetchImpl = fetch) {
  const problems = [];
  for (const url of [NEW_ROOT, NEW_DEEP_LINK]) {
    const response = await fetchImpl(url, { redirect: 'manual' });
    if (response.status !== 200) problems.push(`${url} returned ${response.status}`);
  }
  const old = await fetchImpl(OLD_DEEP_LINK, { redirect: 'manual' });
  const location = old.headers.get('location');
  if (location !== NEW_DEEP_LINK) problems.push(`old deep link redirects to ${location}`);
  return { isHealthy: problems.length === 0, problems };
}
```

- [ ] **Step 4:** pass; the deploy step imports `checkLiveSite`, prints `problems`, and exits 1 when `isHealthy` is false.
- [ ] **Step 5:** commit `chore(deploy): check the custom domain and old-URL redirect after deploy`.

---

## Stage 1: workspaces, schema v2, audit

### Task 1.0: key bindings ignore text fields and out-of-range choices (bug fix)

**Risk:** standard (existing bug; fix test-first, R-403). **Behaviors:** B-57, B-58.

**Files:** Modify `state/useKeyboardNav.ts` (skip when `event.target` is an `input`, `textarea`, `select`, or contenteditable), `state/useQuizEngine.ts` (ignore a choice index outside the current question's choices); tests `components/quiz/__tests__/keyboard.web.test.tsx`, `state/__tests__/useQuizEngine.test.tsx`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('does nothing for a bound key typed into a focused text field', async () => {
  render(
    <>
      <input aria-label="probe field" />
      <RoundHarness questions={[mcQuestion]} />
    </>,
  );
  const field = screen.getByLabelText('probe field');
  field.focus();
  fireEvent.keyDown(field, { key: 'a' });
  fireEvent.keyDown(field, { key: 'q' });
  expect(screen.queryByText(/correct|incorrect/i)).toBeNull();
  expect(screen.queryByTestId('query-modal')).toBeNull();
});

it('ignores a choice key beyond the question’s choices', () => {
  const { result } = renderHook(() => useQuizEngine([threeChoiceQuestion]));
  act(() => result.current.selectChoice(3));
  expect(result.current.isAnswered).toBe(false);
});
```

- [ ] **Step 2:** both FAIL today (`useKeyboardNav.ts` has no target check; `useQuizEngine` records index 3).
- [ ] **Step 3:** add the editable-target guard in the keydown handler and an index bound in `selectChoice`.
- [ ] **Step 4:** pass; full `npm test`.
- [ ] **Step 5:** commit `fix(keyboard): ignore bound keys in text fields and out-of-range choice keys` (test and fix together).

### Task 1.1: npm workspaces scaffold

**Risk:** standard. **Behaviors:** B-1.

**Files:**
- Modify: `package.json` (`"workspaces": ["packages/*", "pipeline", "server"]`, script `test:workspaces`: `npm test --workspaces --if-present`)
- Modify: `tsconfig.json` (`exclude`: `packages`, `pipeline`, `server`), `jest.config.js` (`testPathIgnorePatterns` adds `/packages/`, `/pipeline/`, `/server/`), `metro.config.js` (`watchFolders` adds `packages/`)
- Create for each of `packages/content-schema`, `packages/progress`, `pipeline`, `server`: `package.json` (`"type": "module"`, `"name": "@syntactical/<name>"`, scripts `test: vitest run`, `typecheck: tsc --noEmit`, and for the two packages `build: tsc -p tsconfig.build.json`, `exports` pointing at `dist/`, `react-native` pointing at `src/index.ts`), `tsconfig.json` (strict, `module: NodeNext`), `vitest.config.ts`, `src/index.ts`, `src/__tests__/index.test.ts`
- Modify: `.github/workflows/ci.yml` (job per workspace: `npm ci`, `npm run build -w` for packages, `npm run typecheck -w <ws>`, `npm test -w <ws>`)
- Test: `scripts/__tests__/packageScripts.test.ts`

- [ ] **Step 1: Write the failing test** (append to `packageScripts.test.ts`)

```ts
import rootPackage from '../../package.json';
import jestConfig from '../../jest.config.js';

describe('workspaces', () => {
  it('declares the workspace packages', () => {
    expect(rootPackage.workspaces).toEqual(['packages/*', 'pipeline', 'server']);
  });

  it('keeps workspace tests out of the root Jest projects', () => {
    for (const project of jestConfig.projects) {
      expect(project.testPathIgnorePatterns).toEqual(expect.arrayContaining(['/packages/', '/pipeline/', '/server/']));
    }
  });
});
```

- [ ] **Step 2:** `npx jest scripts/__tests__/packageScripts.test.ts` → FAIL.
- [ ] **Step 3:** make the edits; each workspace's `src/__tests__/index.test.ts` asserts its package name constant, for example `expect(PACKAGE_NAME).toBe('@syntactical/progress')`.
- [ ] **Step 4:** `npm install && npm test && npm run test:workspaces && npx tsc --noEmit && npm run lint && npm run build` all pass.
- [ ] **Step 5:** commit `chore(repo): add npm workspaces for content-schema, progress, pipeline, and server`.

### Task 1.2: move the content contract into packages/content-schema

**Risk:** standard (pure move; existing tests prove behavior is unchanged). **Behaviors:** B-2.

**Files:**
- Move: `services/content/types/{Question,Query,Manifest,LanguageEntry,BankEntry,CachedBank}.ts`, `services/content/validateManifest.ts`, `services/content/validateQuestionBank.ts`, `services/content/isSafeBankPath.ts`, `services/content/SHA256_HEX.ts`, and the constants they need (`SUPPORTED_SCHEMA_VERSION`, `QUESTION_TYPES`, `GRAMMARS`, `Grammar`, `CONTENT_LIMITS`, `DIFFICULTIES`, `DifficultyId`) from `constants/appConfig.ts` → `packages/content-schema/src/` (the package imports nothing from the app)
- Move tests: `services/content/__tests__/validateManifest.test.ts`, `validateQuestionBank.test.ts`, `isSafeBankPath.test.ts`, `fixtures/contentFixtures.ts` → `packages/content-schema/src/__tests__/` (vitest imports)
- Modify: every importer (`services/content/*.ts`, `state/*.ts`, `components/**/*.tsx`, `constants/appConfig.ts`, `scripts/buildContentManifest.mjs`) to import from `@syntactical/content-schema`

**Interfaces:** Produces `@syntactical/content-schema` named exports: `Question`, `Query`, `Manifest`, `LanguageEntry`, `BankEntry`, `CachedBank`, `validateManifest`, `validateQuestionBank`, `isSafeBankPath`, `SHA256_HEX`, `SUPPORTED_SCHEMA_VERSION`, `QUESTION_TYPES`, `GRAMMARS`, `Grammar`, `CONTENT_LIMITS`, `DIFFICULTIES`, `DifficultyId`.

- [ ] **Step 1:** failing test `packages/content-schema/src/__tests__/exports.test.ts`:

```ts
import { expect, it } from 'vitest';
import * as schema from '../index';

it('exports the shared content contract', () => {
  for (const name of ['validateManifest', 'validateQuestionBank', 'isSafeBankPath', 'SHA256_HEX', 'SUPPORTED_SCHEMA_VERSION', 'DIFFICULTIES', 'GRAMMARS', 'CONTENT_LIMITS']) {
    expect(schema).toHaveProperty(name);
  }
});
```

- [ ] **Step 2:** `npm test -w @syntactical/content-schema` → FAIL.
- [ ] **Step 3:** `git mv` the files, export them from `src/index.ts`, rewrite imports; change no logic.
- [ ] **Step 4:** `npm run build -w @syntactical/content-schema && npm test && npm run test:workspaces && npx tsc --noEmit && npm run content:build && git diff --exit-code content services/content/*.generated.ts && npm run build`; `test -f services/content/validateQuestionBank.ts` must fail; `grep -r "constants/appConfig" packages/` returns nothing.
- [ ] **Step 5:** commit `refactor(content): move the content contract into @syntactical/content-schema`.

### Task 1.3: schema v2 question types and the two validators

**Risk:** high (validation of content downloaded from the network is a trust boundary). **Behaviors:** B-3, B-4, B-6.

**Files:**
- Modify: `packages/content-schema/src/types/Question.ts` (v2 union from the spec); create `types/Choice.ts` (`{ text; code?; rationale?; misconceptionId? }`), `types/Criterion.ts`, `types/Provenance.ts`, `types/BankContext.ts`
- Modify: `packages/content-schema/src/validateQuestionBank.ts` (schema 2, `context: BankContext` argument; drops bad questions, keeps the bank)
- Create: `packages/content-schema/src/validateBankForPublish.ts`
- Test: `packages/content-schema/src/__tests__/validateQuestionBank.test.ts`, `validateBankForPublish.test.ts`

**Interfaces:**
- `validateQuestionBank(raw: unknown, context: BankContext): { questions: Question[]; dropped: { id: string; rule: string }[] } | null`
- `validateBankForPublish(bank: { questions: Question[] }, context: BankContext): { problems: { id: string; rule: string }[] }`
- `type BankContext = { topicIds: readonly string[]; misconceptionIds: readonly string[] }`

**Behaviors (RED tests):**
- A schema-2 `mc` question with choices `[{ text }, { text, rationale, misconceptionId }]` and no `topic` validates in `validateQuestionBank`.
- The same question fails `validateBankForPublish` with `missing-topic` and one `missing-rationale` per wrong choice lacking it.
- A `rationale` over 280 characters is dropped with `rationale-too-long`; the rest of the bank is kept.
- A present `topic` outside `context.topicIds` drops the question with `unknown-topic`; a present `misconceptionId` outside `context.misconceptionIds` drops it with `unknown-misconception`.
- An `ab` question validates only with exactly two choices, `answerIndex` 0 or 1, and `criterion.type` in `performance | correctness | readability` with non-empty `statement` and `evidence`; each violation drops it with a named rule; `choice.code` is allowed and length-limited by `CONTENT_LIMITS`.
- A `bool` question accepts optional `rationale` and `misconceptionId` under the same rules.
- `provenance` with `source`, `validation.method`, `validation.status`, `isHumanReviewed` is required; missing provenance drops the question with `missing-provenance`.
- A bank with `schemaVersion: 1` returns `null`.
- Every v1 rule still holds in v2 form (id, prompt, 2 to 6 choices for `mc`, `answerIndex` in range, query title and explanation non-empty, `CONTENT_LIMITS` lengths).

- [ ] `tdd.sh open 1.3` → test-author → `tdd.sh red` → implementer → `tdd.sh green` → slice-critic → commit `feat(content-schema): schema v2 questions with client and publish validators`.

### Task 1.4: manifest v2 validator

**Risk:** high. **Behaviors:** B-5.

**Files:** Modify `packages/content-schema/src/types/{Manifest,LanguageEntry,BankEntry}.ts`, `validateManifest.ts`; create `buildBankContext.ts`; tests `src/__tests__/validateManifest.test.ts`, `buildBankContext.test.ts`.

**Interfaces:** `BankEntry = { path; hash; access: 'free' | 'paid'; productId?: string; contentVersion: number; topicCounts: Record<string, number> }`; `LanguageEntry` adds `topics: { id: string; label: string }[]` and `misconceptions: { id: string; description: string }[]`; `buildBankContext(language: LanguageEntry): BankContext`.

**Behaviors (RED tests):**
- `access: 'paid'` without `productId` rejects the manifest; `access: 'free'` with a `productId` rejects it; any other `access` value rejects it.
- `productId` must equal `syntactical.<language>.<difficulty>` for its own entry.
- `contentVersion` must be a positive integer; `topicCounts` keys must be ids in the language's `topics`.
- A misconception id must start with `<language>.` and be kebab-case; duplicate topic or misconception ids reject the manifest.
- `buildBankContext` returns the language's topic ids and misconception ids.
- `schemaVersion: 1` rejects; every v1 rule (safe paths, SHA-256 hex hashes, unknown difficulty keys rejected) still holds.

- [ ] Gated cycle; commit `feat(content-schema): manifest v2 with bank access, product ids, topics, and misconceptions`.

### Task 1.5: convert content to schema v2 and move paid sources out of the public repo

**Risk:** high (bundled and cached content path; paid content leaves the public repo). **Behaviors:** B-7.

**Files:**
- Create: `pipeline/src/commands/migrateV1.ts` (one-time converter: wraps choices as `{ text }`; adds `provenance: { source: 'original', validation: { method: 'judged', status: 'pending' }, isHumanReviewed: false }`; sets bank entry `access` (`easy` → free, else paid), `productId`, `contentVersion: 1`, `topicCounts: {}`; empty `topics` and `misconceptions`; writes free banks to `content/` and paid banks to `CONTENT_PRIVATE_DIR` (default `../syntactical-content`), then deletes the paid files from `content/`)
- Modify: `content/**/*.json`, `content/manifest.json`
- Modify: `services/content/loadQuestionBank.ts`, `state/ContentProvider.tsx`, `state/useQuestionBank.ts`, `services/content/readCachedBank.ts` (pass `buildBankContext(language)`), `components/quiz/MultipleChoiceCard.tsx` (render `choice.text`)
- Test: `pipeline/src/__tests__/commands/migrateV1.test.ts`, `components/quiz/__tests__/cards.test.tsx`, `services/content/__tests__/loadQuestionBank.test.ts`

**Behaviors (RED tests):**
- `migrateV1` on a v1 `mc` question returns a v2 question whose `choices[i].text` equals the v1 string at `i`, the same `answerIndex`, and `provenance.source === 'original'`.
- `migrateV1` on a v1 `bool` question keeps `answer` and adds provenance.
- `migrateV1` on the v1 manifest marks every `easy` bank `access: 'free'` with no `productId`, and every other bank `access: 'paid'` with `syntactical.<language>.<difficulty>`.
- After `migrateV1` on a fixture tree, paid bank files exist only under the private directory and not under `content/`.
- `MultipleChoiceCard` renders the same accessible names for a converted question as for the v1 string choices.
- A cached v1 bank in AsyncStorage is treated as absent and never rendered.
- `SUPPORTED_SCHEMA_VERSION === 2`.

- [ ] Gated cycle. Then clone `syntactical-content` beside this repo, run `npx tsx pipeline/src/commands/migrateV1.ts`, commit the paid banks in `syntactical-content`, run `npm run content:build` here, `npm test`, `npm run build`, and play one round per language in the web build.
- [ ] Commit `feat(content): convert every bank to schema v2 and move paid banks to the private content repo`.

### Task 1.6: content build reads the private directory and never ships paid banks

**Risk:** high (the guard that keeps paid content out of public outputs). **Behaviors:** B-60.

**Files:** Modify `scripts/buildContentManifest.mjs` (hash free banks from `content/` and paid banks from `CONTENT_PRIVATE_DIR`; bundle only free banks; fail on a paid bank under `content/` or a free bank under the private directory), `package.json` `build` script (copy only free banks into `dist/content`), `.github/workflows/ci.yml` and `deploy.yml` (check out `syntactical-content` with `CONTENT_DEPLOY_KEY` into `../syntactical-content`); tests `scripts/__tests__/buildContentManifest.test.ts`, `scripts/__tests__/packageScripts.test.ts`.

**Interfaces:** `buildContentManifest({ rootDir, privateDir, dryRun? }): { bundledBanks: Record<string, unknown>; staticBankPaths: string[]; manifest: Manifest }`.

**Behaviors (RED tests):**
- With `python/easy` free in `content/` and `python/medium` paid in the private dir, `bundledBanks` keys are exactly `['python/easy']` and `staticBankPaths` excludes any medium or hard bank; the manifest lists both with correct hashes.
- A paid bank found under `content/` fails the build with `paid bank in public content: python/medium`; a free bank under the private dir fails with `free bank in private content: python/easy`.
- After `npm run build`, `dist/content` contains no file for a paid bank (test walks a fixture export).
- A missing private dir fails with a message naming `CONTENT_PRIVATE_DIR`, never a path guess.
- The build fails when any file under `pipeline/` (review queue, review files, reports) contains the text of a paid-bank question (matched by prompt).

- [ ] Gated cycle; commit `feat(content): build from public free banks and private paid banks without shipping paid content`.

### Task 1.7: hardened Docker runners

**Risk:** high (executes model-written code). **Behaviors:** B-8, B-12.

**Files:**
- Create: `pipeline/runners/{python,node,postgres}/Dockerfile` (non-root user 10001, pinned runtime) with a harness that reads an oracle JSON on stdin and writes `{ outcome: 'value' | 'exception' | 'syntax-error', value?, exceptionType?, stdout }`
- Create: `pipeline/src/clients/dockerRunner.ts`, `pipeline/src/types/OracleRun.ts`, `pipeline/src/types/Oracle.ts`
- Test: `pipeline/src/__tests__/clients/dockerRunner.test.ts` (runs in the pipeline CI job, which has Docker)

**Interfaces:** `runOracle(oracle: Oracle, limits?: { timeoutMs: number }): Promise<OracleRun>`; `Oracle = { language: 'python' | 'node' | 'postgres'; code: string; setupSql?: string; choiceCode?: string[] }`; `OracleRun = { outcome: 'value' | 'exception' | 'syntax-error' | 'timeout' | 'sandbox-violation' | 'resource-limit'; value?: string; exceptionType?: string; runtimeVersion: string }`.

**Behaviors (RED tests):**
- Python `print(0.1 + 0.2)` → `{ outcome: 'value', value: '0.30000000000000004' }`, `runtimeVersion` matching `/^Python 3\.\d+\.\d+$/`.
- Node `[] + {}` → `'[object Object]'`; Postgres `SELECT NULL = NULL` after setup SQL → a null value.
- Python code raising `TypeError` → `{ outcome: 'exception', exceptionType: 'TypeError' }`.
- Opening a socket (Python `socket.create_connection`, Node `fetch`) never yields a value.
- `while True: pass` with `timeoutMs: 2000` → `timeout` within 4 seconds and the container is gone.
- Allocating 512 MB → `resource-limit`; a fork bomb → `resource-limit`; a write to `/etc` fails; `id -u` inside prints `10001`.
- Output beyond 64 KB (`print('x' * 10**9)` in a loop) is truncated and recorded `resource-limit`; the harness never buffers more than the cap.
- The argument list includes `--rm --network none --cpus 1 --memory 256m --memory-swap 256m --pids-limit 64 --read-only --tmpfs /tmp:rw,noexec,nosuid,size=64m --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges`.

- [ ] Gated cycle; commit `feat(pipeline): hardened oracle runners for Python, Node, and Postgres`.

### Task 1.8: oracle validator and golden set

**Risk:** high (decides content correctness). **Behaviors:** B-9, B-10, B-11.

**Files:** Create `pipeline/src/services/validateQuestion.ts`, `pipeline/src/types/ValidationResult.ts`, `pipeline/golden/{python,node,postgres}.json`; test `pipeline/src/__tests__/services/validateQuestion.test.ts`.

**Interfaces:** `validateQuestion(question: Question, oracle: Oracle, run = runOracle): Promise<ValidationResult>`; `ValidationResult = { status: 'passed' | 'failed' | 'not-executable'; reason?: 'answer-mismatch' | 'nondeterministic' | 'ambiguous' | 'runner-error'; observed?: string; runtimeVersion?: string }`.

**Behaviors (RED tests, fake `run`):**
- Every golden-set question marked correct → `passed`; every one marked wrong → `failed` / `answer-mismatch` (at least 10 per language, half deliberately wrong).
- Three runs with different values → `failed` / `nondeterministic`.
- Two choices matching the observed value → `failed` / `ambiguous`.
- An `exception` outcome matches a choice naming the exception type ("raises TypeError").
- A `bool` question compares `String(answer)` with the observed boolean output.
- No oracle → `not-executable`.
- The golden set against the real runners in CI matches the same expectations.

- [ ] Gated cycle; commit `feat(pipeline): validate questions by executing their oracles, with a golden set`.

### Task 1.9: ModelProvider

**Risk:** standard. **Behaviors:** B-14.

**Files:** Create `pipeline/src/clients/modelProvider.ts`, `pipeline/src/clients/claudeCliProvider.ts`, `pipeline/src/clients/anthropicApiProvider.ts`, `pipeline/src/types/ModelOutputInvalid.ts`; test `pipeline/src/__tests__/clients/modelProvider.test.ts`. Dependencies: `@anthropic-ai/sdk`, `zod`.

**Interfaces:** `interface ModelProvider { generate<T>(request: { system: string; prompt: string; schema: z.ZodType<T>; promptVersion: string }): Promise<{ value: T; model: string }> }`; `createModelProvider(kind: 'cli' | 'api', deps?)`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createModelProvider } from '../../clients/modelProvider';
import { ModelOutputInvalid } from '../../types/ModelOutputInvalid';

const schema = z.object({ topic: z.string() });

describe('ModelProvider', () => {
  it('parses structured output from the CLI path', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ result: '{"topic":"strings"}', model: 'claude-x' }) });
    const provider = createModelProvider('cli', { exec });
    await expect(provider.generate({ system: 's', prompt: 'p', schema, promptVersion: 'v1' })).resolves.toEqual({ value: { topic: 'strings' }, model: 'claude-x' });
  });

  it('throws ModelOutputInvalid after three schema failures', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ result: '{"nope":1}', model: 'claude-x' }) });
    const provider = createModelProvider('cli', { exec });
    await expect(provider.generate({ system: 's', prompt: 'p', schema, promptVersion: 'v1' })).rejects.toBeInstanceOf(ModelOutputInvalid);
    expect(exec).toHaveBeenCalledTimes(3);
  });

  it('parses structured output from the API path', async () => {
    const create = vi.fn().mockResolvedValue({ model: 'claude-y', content: [{ type: 'text', text: '{"topic":"wtf"}' }] });
    const provider = createModelProvider('api', { messages: { create } });
    await expect(provider.generate({ system: 's', prompt: 'p', schema, promptVersion: 'v1' })).resolves.toEqual({ value: { topic: 'wtf' }, model: 'claude-y' });
  });
});
```

- [ ] **Step 2:** FAIL. **Step 3:** the CLI path runs `claude -p --output-format json --system-prompt <system> <prompt>` through the injected `exec` and parses `result`; the API path calls `messages.create` with the model from `PIPELINE_MODEL` (default `claude-opus-5-5`); both `schema.safeParse`, retry at most twice more, then throw. **Step 4:** pass. **Step 5:** commit `feat(pipeline): model provider over claude -p and the Anthropic API`.

### Task 1.10: oracle drafting stage

**Risk:** standard. **Behaviors:** supports B-13.

**Files:** Create `pipeline/src/services/draftOracle.ts`, `pipeline/prompts/draftOracle.md`, `pipeline/oracles/<language>/<difficulty>.json` (committed for free banks; paid bank oracles live in `syntactical-content/oracles/`); test `pipeline/src/__tests__/services/draftOracle.test.ts`.

**Interfaces:** `draftOracle(question: Question, language: string, provider: ModelProvider): Promise<Oracle | { isExecutable: false; reason: string }>`.

- [ ] **Step 1:** tests with a fake provider: a Python question about `0.1 + 0.2` yields `{ language: 'python', code: 'print(0.1 + 0.2)' }`; a conceptual question yields `{ isExecutable: false }`; an oracle containing `socket`, `requests`, `urllib`, or `fetch(` is refused before it is run.
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(pipeline): draft oracles for existing questions`.

### Task 1.11: `pipeline validate` and the pipeline report

**Risk:** standard. **Behaviors:** B-13.

**Files:** Create `pipeline/src/commands/validate.ts`, `pipeline/src/services/writePipelineReport.ts`, `pipeline/src/types/PipelineReport.ts`, `pipeline/src/cli.ts`; test `pipeline/src/__tests__/commands/validate.test.ts`.

**Interfaces:** `PipelineReport = { runId; stage; startedAt; finishedAt; questions: { id; bankKey; status; reason?; runtimeVersion? }[]; counts: Record<string, number>; agreement?: Record<string, number> }`, written to `pipeline/reports/<stage>-<runId>.json` and `pipeline/reports/latest.json` (question text for paid banks is never copied into the public report, ids only).

- [ ] **Step 1:** test over a 3-question fixture bank with a fake `validateQuestion`: one `passed`, one `failed` with reason, one `not-executable`; `counts` match; content files are byte-identical before and after.
- [ ] **Steps 2–4:** implement; add the root script `"pipeline": "npm run cli -w pipeline --"`. **Step 5:** commit `feat(pipeline): validate command and pipeline report`.

### Task 1.12 (operational): run the audit and fix failures

**Risk:** standard (content only). **Behaviors:** B-13 on real content.

- [ ] Build the runner images; `npm run pipeline -- draft-oracles`, then `npm run pipeline -- validate` over all 9 banks.
- [ ] For each `failed` question, the owner decides fix or delete; decisions go in `pipeline/reports/audit-decisions.json` as `{ id, decision: 'fixed' | 'deleted', note }`.
- [ ] Re-run until no failure is unexplained; `validate --stamp-provenance` writes `provenance.validation` and `runtimeVersion` onto passed questions (publish takes this over in Task 2.6).
- [ ] Commit (both repos): `fix(content): correct audit failures found by execution validation`.

### Task 1.13: quality page

**Risk:** standard. **Behaviors:** B-15, B-64 (route).

**Files:** Modify `scripts/buildContentManifest.mjs` (summarize the committed `pipeline/reports/latest.json` into `services/quality/qualityReport.generated.ts`; fail when a published bank has no report entry); create `services/quality/summarizeReport.ts`, `app/quality.tsx` (`QualityScreen`), `components/quality/QualityTable.tsx`; tests `services/quality/__tests__/summarizeReport.test.ts`, `app/__tests__/qualityRoute.test.tsx`, `scripts/__tests__/buildContentManifest.test.ts`.

- [ ] **Step 1:** tests: `summarizeReport` returns `{ audited, auditFailuresInOriginal, rejectedByReason, methodMix, agreement, humanReviewRate }` from a fixture report; `/quality` renders one `h1` "Content quality" and every number with an accessible label; the build throws `missing report for python/hard` when the fixture report lacks that bank.
- [ ] **Steps 2–4:** implement; link "Content quality" from the language screen footer; pass; Lighthouse 100 on `/quality`.
- [ ] **Step 5:** commit `feat(quality): public content quality page from the pipeline report`.

### Task 1.14: verified badge

**Risk:** standard. **Behaviors:** B-16.

**Files:** Create `components/quiz/VerifiedBadge.tsx`; modify `components/quiz/QuestionCardFrame.tsx`; test `components/quiz/__tests__/VerifiedBadge.test.tsx`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react-native';
import { VerifiedBadge } from '../VerifiedBadge';

it('shows the runtime when the output was executed and passed', async () => {
  await render(<VerifiedBadge provenance={{ source: 'original', runtimeVersion: 'Python 3.13.2', validation: { method: 'executed', status: 'passed' }, isHumanReviewed: false }} />);
  expect(screen.getByText('Output verified on Python 3.13.2')).toBeTruthy();
});

it.each([
  { method: 'judged', status: 'passed' },
  { method: 'executed', status: 'failed' },
  { method: 'executed', status: 'pending' },
] as const)('shows nothing for %p', async (validation) => {
  await render(<VerifiedBadge provenance={{ source: 'original', runtimeVersion: 'Python 3.13.2', validation, isHumanReviewed: true }} />);
  expect(screen.queryByText(/Output verified/)).toBeNull();
});
```

- [ ] **Steps 2–4:** implement (returns `null` unless executed and passed); render it in the card frame header; pass. **Step 5:** commit `feat(quiz): verified badge for execution-validated questions`.

---

## Stage 2: topics and enrichment

### Task 2.1: topic classification

**Risk:** standard. **Behaviors:** B-17, B-18.

**Files:** Create `pipeline/src/commands/classify.ts`, `pipeline/src/services/classifyQuestion.ts`, `pipeline/prompts/classifyQuestion.md`, `pipeline/topics.json` (the closed list from the spec), `pipeline/review-queue/`; tests `pipeline/src/__tests__/services/classifyQuestion.test.ts`, `pipeline/src/__tests__/commands/classify.test.ts`.

**Interfaces:** `classifyQuestion(question, topics, provider): Promise<{ topic: string; confidence: number }>`; `CLASSIFY_CONFIDENCE_MIN = 0.7`.

- [ ] **Step 1:** tests with a fake provider: a topic outside the list fails the schema enum; confidence 0.6 writes `pipeline/review-queue/<id>.json` for a free-bank question and `syntactical-content/review-queue/<id>.json` for a paid-bank question (nothing with paid question text under `pipeline/`), and leaves `question.topic` unset; two runs disagreeing on 1 of 4 questions report `agreement.classify = 0.75`; a bank where `wtf` exceeds 20% is flagged `wtf-overuse`.
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(pipeline): classify questions into topics with agreement tracking`.

### Task 2.2: misconception taxonomy

**Risk:** standard. **Behaviors:** supports B-21.

**Files:** Create `pipeline/src/commands/draftTaxonomy.ts`, `pipeline/prompts/draftTaxonomy.md`, `pipeline/taxonomy/<language>.json` (owner-approved, committed); modify `scripts/buildContentManifest.mjs` (copy the approved taxonomy into the manifest); test `pipeline/src/__tests__/commands/draftTaxonomy.test.ts`.

- [ ] **Step 1:** tests: the draft writes `pipeline/taxonomy/<language>.draft.json`, never the approved file; ids match `^<language>\.[a-z0-9]+(-[a-z0-9]+)*$`; more than 40 entries fails with `taxonomy-too-large`; the build copies only the approved file.
- [ ] **Steps 2–4:** implement; the owner reviews and renames `.draft.json` to `.json`. **Step 5:** commit `feat(pipeline): draft and approve the misconception taxonomy`.

### Task 2.3: gap-fill generation

**Risk:** high (generated code runs in the runner through the agent's execute tool). **Behaviors:** B-19.

**Files:** Create `pipeline/src/commands/gapFill.ts`, `pipeline/src/services/generateQuestion.ts` (tool-use loop with an `execute` tool bound to `runOracle`), `pipeline/prompts/generateQuestion.md`; test `pipeline/src/__tests__/services/generateQuestion.test.ts`.

**Behaviors (RED tests):**
- A topic with 7 questions requests exactly 3; a topic with 10 or more requests none.
- A drafted question is kept only when `validateQuestion` returns `passed`; a mismatch triggers a revision; after 3 failed revisions it is dropped and reported `generation-failed`.
- The `execute` tool runs only through `runOracle` with the runner limits; the agent cannot choose docker flags or the image.
- A generated question carries `provenance.source = 'generated'`, the model id, `promptVersion`, and the passing run's `runtimeVersion`.
- A normalized prompt equal to an existing one is dropped as `duplicate`.

- [ ] Gated cycle; commit `feat(pipeline): gap-fill thin topics with execution-checked generation`.

### Task 2.4: rationales and misconception tags

**Risk:** standard. **Behaviors:** B-20, B-21.

**Files:** Create `pipeline/src/commands/enrich.ts`, `pipeline/src/services/writeRationales.ts`, `pipeline/src/services/judgeRationale.ts`, `pipeline/prompts/{writeRationales,judgeRationale}.md`; tests under `pipeline/src/__tests__/services/`.

**Interfaces:** `writeRationales(question, observed: string, taxonomy, provider): Promise<{ choiceIndex: number; rationale: string; misconceptionId: string }[]>`; `judgeRationale(question, observed, rationale, provider): Promise<{ isConsistent: boolean; reason: string }>`.

- [ ] **Step 1:** tests with fakes: one rationale per wrong choice, none for the correct one; over 280 characters fails the zod schema; a `misconceptionId` outside the taxonomy fails the schema enum; `isConsistent: false` drops that rationale and reports `rationale-contradicts-oracle`; the prompt contains the observed output; two tagging runs report `agreement.misconception`.
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(pipeline): per-choice rationales and misconception tags, judged against oracle output`.

### Task 2.5: review stage

**Risk:** standard. **Behaviors:** supports B-22.

**Files:** Create `pipeline/src/commands/review.ts` (writes `pipeline/review/<bankKey>.md` for free banks and `syntactical-content/review/<bankKey>.md` for paid banks: each pending item with question, oracle output, proposed topic and rationales; the owner marks `- [x] approve` or `- [x] reject: <reason>`), `pipeline/src/services/readReviewDecisions.ts`; test `pipeline/src/__tests__/services/readReviewDecisions.test.ts`.

- [ ] **Step 1:** tests: parsing returns `{ id, decision: 'approve' | 'reject' | 'pending', reason? }[]`; an unchecked item is `pending`; a 10% sample of executed questions per bank (minimum 3) is always included; an approved item sets `provenance.isHumanReviewed = true`.
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(pipeline): file-based human review stage`.

### Task 2.6: publish

**Risk:** standard. **Behaviors:** B-22; Review Focus 4.

**Files:** Create `pipeline/src/commands/publish.ts`; modify `scripts/buildContentManifest.mjs` (compute `topicCounts`, increment `contentVersion` when a bank's hash changes); tests `pipeline/src/__tests__/commands/publish.test.ts`, `services/content/__tests__/prefetchChangedBanks.test.ts`.

- [ ] **Step 1:** tests: publish refuses a question that is neither `passed` nor human-reviewed and reports it; publish runs `validateBankForPublish` and refuses the whole bank on any problem; afterwards `topicCounts` match and `contentVersion` increments only for changed banks; paid banks are written only to the private directory; Review Focus 4: with a cached free bank at the old hash and a round in progress, a new manifest triggers one download and the in-progress round's questions are unchanged.
- [ ] **Steps 2–4:** implement (publish writes content, then calls `buildContentManifest`); pass. **Step 5:** commit `feat(pipeline): publish only validated or reviewed content and rebuild the manifest`.

### Task 2.7: topic view and topic rounds

**Risk:** standard. **Behaviors:** B-23, B-64 (route).

**Files:** Create `components/menu/TopicStep.tsx`, `app/[language]/[difficulty]/index.tsx` (topic list); move the round route to `app/[language]/[difficulty]/play.tsx` with `?topic=<id>`; modify `state/useQuizEngine.ts` (`useQuizEngine(questions, { topic?: string })` filters before shuffling); tests `components/menu/__tests__/TopicStep.test.tsx`, `components/menu/__tests__/menuKeyboard.web.test.tsx`, `state/__tests__/useQuizEngine.test.tsx`, `app/__tests__/routing.test.tsx`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('starts a round of only the chosen topic', () => {
  const { result } = renderHook(() => useQuizEngine(bankWithTopics, { topic: 'strings' }));
  expect(result.current.questions.every((question) => question.topic === 'strings')).toBe(true);
  expect(result.current.questions).toHaveLength(2);
});
```

```tsx
it('lists topics from the manifest with counts', async () => {
  await render(<TopicStep language="python" difficulty="easy" onSelectTopic={onSelectTopic} onBack={jest.fn()} />);
  expect(screen.getByRole('button', { name: /Whole bank/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Strings, 10 questions/ })).toBeTruthy();
});
```

Keyboard (web): `1` picks "Whole bank", `2` the first topic, `Esc` goes back. Routing: `/python/easy` shows the topic list; `/python/easy/play?topic=strings` starts the filtered round; an unknown topic falls back to the whole bank.

- [ ] **Steps 2–4:** implement; pass; Lighthouse 100 on the new route. **Step 5:** commit `feat(menu): browse a bank by topic and play one topic`.

### Task 2.8: rationale first in the query drawer

**Risk:** standard. **Behaviors:** B-24.

**Files:** Modify `components/query/QueryDrawer.tsx` (prop `chosenRationale?: string`), `components/quiz/QuizRound.tsx` (Explain passes the chosen wrong choice's rationale; the Query button passes none); tests `components/query/__tests__/QueryDrawer.test.tsx`, `components/quiz/__tests__/QuizRound.test.tsx`.

- [ ] **Step 1:** tests: after a wrong answer, Explain opens the drawer with a "Why that answer is tempting" heading and the rationale above the query title; the Query button before answering shows no rationale section; a choice without a rationale shows only the query; heading levels do not skip.
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(query): show the chosen wrong answer's rationale first`.

---

## Stage 3: accounts, sync, progression, payments

### Task 3.1: server skeleton

**Risk:** high (sets the middleware stack every security control depends on). **Behaviors:** B-62; foundation for B-25 to B-39.

**Files:** Create `server/src/app.ts` (`createApp(deps)`: `helmet`, `cors`, `cookie-parser`, `express.json({ limit: '10kb' })`, `trust proxy` 1, request id, routes, error handler), `server/src/index.ts`, `server/src/config/env.ts` (zod-validated env), `server/src/middleware/requestId.ts`, `server/src/middleware/errorHandler.ts`, `server/src/routes/health.ts` (`/health`, `/health/ready`, outside `/v1`), `server/src/clients/logger.ts` (pino with redaction paths `req.headers.cookie`, `req.headers.authorization`, `res.headers["set-cookie"]`, `*.email`, `*.code`, `*.token`); tests `server/src/__tests__/routes/health.test.ts`, `server/src/__tests__/clients/logger.test.ts`, `server/src/__tests__/config/env.test.ts`.

**Behaviors (RED tests):**
- `GET /health` returns 200 `{ status: 'ok' }` without touching the database (a db stub that throws is never called).
- `GET /health/ready` returns 200 `{ status: 'ok', database: 'ok' }` with a reachable database and 503 `{ status: 'degraded' }` with an unreachable one.
- Every response carries an `X-Request-Id` UUID, and every log line carries the same id.
- Log redaction: a line logged with email, code, token, cookie, and authorization values built at run time contains none of those values.
- A response carrying `Set-Cookie: syntactical_session=<run-time token>` through `createApp` with the pino destination captured leaves no log line containing the token.
- The error handler logs a `pg` error by `code` and constraint name only: a unique violation whose `detail` contains a run-time email leaves no log line containing that email.
- `REVENUECAT_WEBHOOK_AUTH` shorter than 32 characters, or empty, fails startup.
- A missing required env variable fails startup with a message naming the variable and never printing any value.
- Error responses are `{ error: { code, message, requestId } }` with no stack trace when `NODE_ENV=production`.
- `helmet` headers are present (`X-Content-Type-Options: nosniff`).

- [ ] Gated cycle; commit `feat(server): Express 5 skeleton with health checks, request ids, and redacted logs`.

### Task 3.2: migrations

**Risk:** high (schema for auth, money, and sync). **Behaviors:** foundation.

**Files:** One `server/migrations/<timestamp>_create-<table>.js` per table (node-pg-migrate, ESM, `up` and `down`): `users (id uuid pk, email citext unique, timezone text null, created_at)`; `daily_goal_changes (user_id fk, from_date date, goal int check (goal in (10,20,50)), pk (user_id, from_date))`; `one_time_codes (id, email citext, code_hash bytea, expires_at, attempts int default 0, used_at, invalidated_at, created_at; index on email)`; `sessions (id, user_id fk, token_hash bytea unique, created_at, last_used_at, expires_at, revoked_at)`; `answer_events (user_id fk, event_id uuid, question_id text, bank_key text, choice_index int, is_correct bool, answered_at timestamptz, round_kind text check in ('bank','topic','review'), received_at, pk (user_id, event_id))`; `daily_progress (user_id, local_date date, xp int, is_goal_met bool, pk (user_id, local_date))`; `entitlements (id uuid pk, user_id uuid null references users on delete set null, product_id text, status text check in ('granted','revoked'), source text, updated_at, unique (user_id, product_id))`; `purchase_events (provider text, provider_event_id text, user_id null, product_id, kind text, payload jsonb, occurred_at, received_at, pk (provider, provider_event_id))`; `rate_limit_counters (key text, window_start timestamptz, count int, pk (key, window_start))`. Test `server/src/__tests__/migrations/migrations.test.ts`.

**Behaviors (RED tests, real Postgres):**
- `up`, `down`, `up` succeeds on an empty database.
- A duplicate `(user_id, event_id)` in `answer_events` fails with a unique violation; the same `event_id` under another user succeeds.
- A goal of 15 fails the check constraint; a duplicate `(provider, provider_event_id)` fails.
- Deleting a user cascades to sessions, answer events, daily progress, and goal changes; entitlements and purchase events keep their rows with `user_id` set null.

- [ ] Gated cycle; commit `feat(server): database schema for users, sessions, events, progress, and entitlements`.

### Task 3.3: one-time codes

**Risk:** high. **Behaviors:** B-25, B-26, B-63 (rate-limit key).

**Files:** Create `server/src/routes/authCodes.ts`, `server/src/services/issueOneTimeCode.ts`, `server/src/clients/emailClient.ts` (Resend; `sendSignInCode(email, code)`), `server/src/middleware/rateLimit.ts` (Postgres counters keyed by `HMAC-SHA256(RATE_LIMIT_KEY_SECRET, normalized email)` and `HMAC-SHA256(RATE_LIMIT_KEY_SECRET, ip key)` with `trust proxy` 1, so no plaintext or brute-forceable email or IP is stored), `server/src/schemas/authSchemas.ts`; tests.

**Behaviors (RED tests):**
- A well-formed email gets 202, one row whose `code_hash` is `sha256(code)` and `expires_at` 10 minutes ahead, and one `sendSignInCode` call with a 6-digit code.
- Emails are normalized (trim, NFKC, lowercase) before the rate-limit key and every lookup: 5 requests for `Foo@Example.com`, `FOO@example.com`, and `foo@example.com ` then a 6th in a new casing gets 429.
- The code comes from an injected `randomInt(0, 1_000_000)` (Node `crypto.randomInt` in production), zero-padded to 6 digits; the test asserts the injected generator is the one called.
- Rate-limit counters increment atomically (`INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`): 20 concurrent requests for one email send at most 5 codes.
- IPv6 clients are keyed by their /64 prefix and IPv4-mapped addresses (`::ffff:a.b.c.d`) are unmapped and keyed as the IPv4 address: `2001:db8::1` and `2001:db8::2` share a counter, `::ffff:203.0.113.7` and `::ffff:203.0.113.8` do not.
- A `rate_limit_counters` row never contains the plaintext email or IP, and its key differs from `sha256(email)` (keyed HMAC with a server secret).
- Rows whose `window_start` is older than the window are deleted on the next insert; after the window passes, no row keyed by the user's email or IP remains. Account deletion also deletes counter rows keyed by the user's email.
- `RATE_LIMIT_KEY_SECRET` shorter than 32 characters, or empty, fails startup.
- `POST /v1/auth/codes` with `Content-Type: text/plain`, `application/x-www-form-urlencoded`, or `multipart/form-data` gets 415; `application/json; charset=utf-8` passes.
- The plaintext code appears in no table and no log line.
- A malformed email gets 400; the body for an existing and a new email is identical.
- The 6th request for one email within an hour → 429; the 21st from one IP within an hour → 429; counters reset after the window.
- A spoofed `X-Forwarded-For` chain with extra hops does not change the IP key beyond the one trusted hop.
- A Resend failure → 503 and no usable code row.
- Issuing a new code sets `invalidated_at` on earlier unused codes for that email.

- [ ] Gated cycle; commit `feat(auth): issue rate-limited one-time sign-in codes`.

### Task 3.4: sessions

**Risk:** high. **Behaviors:** B-27, B-28.

**Files:** Create `server/src/routes/authSessions.ts`, `server/src/services/verifyOneTimeCode.ts`, `server/src/services/createSession.ts`; tests.

**Behaviors (RED tests):**
- A correct code (body `{ email, code, timezone }`) → 201; first sign-in creates a `users` row with that timezone if it is a valid IANA zone; a `sessions` row stores `sha256(token)` with a 30-day expiry; the code is marked used.
- A web request gets `Set-Cookie: syntactical_session=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` and no token in the body; with `NODE_ENV=development` the cookie omits `Secure`.
- A native request (`X-Client: native`) gets `{ data: { token } }` and no `Set-Cookie`.
- Reused, expired, invalidated, and wrong codes all return 400 with the same body `{ error: { code: 'invalid-code' } }`.
- The 5th wrong attempt exhausts the code.
- Hash comparison uses `crypto.timingSafeEqual`.
- Two concurrent requests with the same correct code create exactly one session (row lock on the code).
- A code issued for `foo@example.com` verifies for `FOO@example.com ` (normalized), and wrong guesses under both casings count against the same `attempts`.
- Every verify takes `SELECT ... FOR UPDATE` on the code row and increments `attempts` in the same transaction: 50 concurrent wrong guesses leave `attempts` at 5 and the then-correct code is rejected.
- The session-creation response's `Set-Cookie` token never appears in any log line (captured pino destination).

- [ ] Gated cycle; commit `feat(auth): exchange a one-time code for a session on web and native`.

### Task 3.5: requireSession, CORS, CSRF guard, sign-out

**Risk:** high. **Behaviors:** B-29, B-30, B-31, B-63.

**Files:** Create `server/src/middleware/requireSession.ts` (updates `last_used_at`; enforces 30-day absolute and 14-day idle expiry), `server/src/middleware/cors.ts`, `server/src/middleware/csrfGuard.ts`, `server/src/middleware/requireJson.ts`, `server/src/routes/signOut.ts`; tests.

**Behaviors (RED tests):**
- A valid cookie authenticates; a valid bearer token authenticates; with both present the bearer token decides, and a failing bearer token returns 401 even if the cookie is valid.
- Unknown, revoked, absolute-expired, and idle-expired tokens → 401 with the same body.
- `Origin: https://syntactical.dev` gets `Access-Control-Allow-Origin` with credentials; `https://evil.com`, `null`, `https://syntactical.dev.evil.com`, and `http://syntactical.dev` get none.
- A cookie-authenticated `POST` without `X-Requested-With: XMLHttpRequest` → 403; any non-GET route except the webhook with `Content-Type: text/plain`, `application/x-www-form-urlencoded`, or `multipart/form-data` → 415, authenticated or not, while `application/json; charset=utf-8` and a bodyless `DELETE` without `Content-Type` pass; bearer-authenticated native requests and the webhook routes are exempt from the header check.
- `DELETE /v1/auth/sessions/current` sets `revoked_at`, clears the cookie, and the same token then gets 401.

- [ ] Gated cycle; R-109 security review over PR 13 on `securityReviewModel`; commit `feat(auth): session middleware for cookie and bearer, CORS allowlist, CSRF guard, and sign-out`.

### Task 3.6: shared progress package

**Risk:** high (these derivations decide synced XP and day streak). **Behaviors:** B-33 (XP part), B-34, B-35; Review Focus 2.

**Files:** Create `packages/progress/src/{computeXp,computeDailyProgress,computeDayStreak,toLocalDate}.ts`, `packages/progress/src/types/AnswerEvent.ts`, `packages/progress/src/constants.ts` (`XP_BY_DIFFICULTY = { easy: 1, medium: 2, hard: 3 }`, `REVIEW_BONUS_XP = 1`, `DAILY_GOALS = [10, 20, 50]`); tests in `packages/progress/src/__tests__/`.

**Interfaces:** `AnswerEvent = { eventId: string; questionId: string; bankKey: string; choiceIndex: number; isCorrect: boolean; answeredAt: string; roundKind: 'bank' | 'topic' | 'review' }`; `computeXp(event: AnswerEvent, isDueReview: boolean): number`; `computeDailyProgress(events: AnswerEvent[], timezone: string, goalHistory: { from: string; goal: number }[], isDueReview: (event: AnswerEvent) => boolean): { localDate: string; xp: number; isGoalMet: boolean }[]`; `computeDayStreak(progress, today: string): number`; `toLocalDate(instant: string, timezone: string): string`.

**Behaviors (RED tests):**
- A correct hard answer earns 3 XP, a wrong answer 0, a correct due review on easy 2.
- `toLocalDate('2026-10-02T11:05:00Z', 'Pacific/Auckland') === '2026-10-03'` (Review Focus 2).
- Goal met on consecutive local dates gives that streak length; a missed day resets it; today not yet met does not break a streak that ended yesterday.
- A goal change affects `isGoalMet` only on and after its `from` date.
- Results do not depend on event order (property test over 100 shuffles).

- [ ] Gated cycle; commit `feat(progress): pure XP, daily progress, and day streak functions`.

### Task 3.7: answer event ingest and download

**Risk:** high (idempotency, concurrency, trust boundary). **Behaviors:** B-32, B-33, B-34 (server side), B-36 (server side); Review Focus 1.

**Files:** Create `server/src/routes/answerEvents.ts` (`POST` with `express.json({ limit: '256kb' })`, `GET ?after=`), `server/src/services/ingestAnswerEvents.ts`, `server/src/services/recomputeDailyProgress.ts`, `server/src/services/readServerManifest.ts`, `server/src/schemas/answerEventSchemas.ts`; tests.

**Behaviors (RED tests):**
- A batch of 50 events inserts 50 rows; re-posting it inserts 0 and returns identical totals.
- The server sets `is_correct` from `choiceIndex` against the bank's answer, ignoring any client value; a `choiceIndex` outside the question's choices → 422.
- An event more than 5 minutes in the future, or before the user's `created_at` minus 365 days, → the whole batch 422 with the offending ids; nothing inserted.
- A batch over 200 events → 413; an unknown `bankKey` or `questionId` → 422.
- Two concurrent uploads of overlapping batches for one user both succeed and leave each event once; derived XP equals `computeXp` summed over distinct events.
- `daily_progress` for the affected local dates is recomputed with `@syntactical/progress` in the same transaction.
- `GET /v1/answer-events?after=<cursor>` returns at most 500 events ordered by `received_at, event_id` with a `nextCursor`, and never another user's events; the cursor is opaque base64url decoded by zod into `(received_at, event_id)`, and `' OR 1=1 --`, an oversized value, or a non-cursor string returns 400.

- [ ] Gated cycle; commit `feat(sync): idempotent answer event upload and paged download`.

### Task 3.8: /me

**Risk:** standard. **Behaviors:** B-35 (goal change), timezone storage.

**Files:** Create `server/src/routes/me.ts` (`GET`, `PATCH`), `server/src/schemas/meSchemas.ts`; test `server/src/__tests__/routes/me.test.ts`.

- [ ] **Step 1:** tests: `GET /v1/me` returns `{ data: { email, timezone, dailyGoal, dayStreak, xpToday, xpTotal, entitlements: string[] } }` computed from stored data; `PATCH /v1/me` accepts a `timezone` only when `Intl.supportedValuesOf('timeZone')` includes it and a `dailyGoal` only in 10/20/50, else 400; a goal change inserts `daily_goal_changes` with `from_date` = today in the user's timezone.
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(server): profile endpoint with progress and entitlements`.

### Task 3.9: client stats v2 and the answer event log

**Risk:** high (stored learner data migration). **Behaviors:** B-40.

**Files:** Modify `services/stats/types/Stats.ts` (v2: `answerStreak`, `goalHistory`, `isSignUpPromptDismissed`, `syncCursor?`), `services/stats/isStoredStats.ts`, `services/stats/recordAnswer.ts` (also appends an answer event with `eventId` from `expo-crypto` `randomUUID`); create `services/stats/migrateStatsV1.ts`, `services/stats/answerEventLog.ts` (stored separately under `syntactical.events.v1`, entries `AnswerEvent & { ownerUserId: string | null; isSynced: boolean; isHeld: boolean }`); modify `state/StatsProvider.tsx` (migrate on hydrate), `constants/appConfig.ts` (`STORAGE_SCHEMA_VERSION = 2`; stats key stays `syntactical.stats.v1`); tests in `services/stats/__tests__/` and `state/__tests__/`.

**Behaviors (RED tests):**
- A stored v1 value migrates: totals and tracks unchanged, `streak` becomes `answerStreak`, goal history `[{ from: today, goal: 20 }]`, an empty event log.
- A migration that throws keeps the v1 value under `REJECTED_STORAGE_KEY` and keeps changes in memory.
- Each recorded answer appends exactly one event with a UUID v4 `eventId`, ISO `answeredAt`, its `roundKind`, and the current `ownerUserId` (null for a guest).
- The event log is capped at 5,000 entries; synced entries are trimmed oldest first; unsynced entries are never trimmed.
- The existing StatsProvider tests (rejected backup, hydration gating) still pass.

- [ ] Gated cycle; commit `feat(stats): v2 stats with an answer event log and v1 migration`.

### Task 3.10: client API and session storage

**Risk:** high (client session handling; API origin pin). **Behaviors:** B-28 client side, sign-in half of B-36, B-64 (sign-in route).

**Files:** Create `services/content/validateApiBaseUrl.ts` (accepts exactly `https://api.syntactical.dev/v1/`), `clients/apiClient.ts` (`apiFetch(path, init)`: base from `extra.apiBaseUrl` validated; `credentials: 'include'` and `X-Requested-With: XMLHttpRequest` on web; `Authorization: Bearer` from SecureStore and `X-Client: native` on native; JSON only), `clients/sessionTokenStore.ts`, `state/AuthProvider.tsx` (`useAuth()`: `{ user, isSignedIn, requestCode, verifyCode, signOut }`; sends the device IANA timezone with `verifyCode`), `app/sign-in.tsx` (`SignInScreen`), `components/auth/{EmailStep,CodeStep}.tsx`; modify `app.config.ts` (`extra.apiBaseUrl`); tests.

**Behaviors (RED tests):**
- `validateApiBaseUrl` accepts exactly `https://api.syntactical.dev/v1/` and rejects `http://`, other hosts, lookalike hosts, a missing trailing slash, a URL with userinfo (assembled at run time), `''`, and `null`.
- With an invalid `extra.apiBaseUrl`, `apiFetch` throws `ApiUnavailable` and makes no network request (never falls back to a literal URL).
- On web, `apiFetch` sends `credentials: 'include'` and `X-Requested-With: XMLHttpRequest`, and never reads or writes a token.
- On native, a successful `verifyCode` stores the token in SecureStore (mocked); later calls send `Authorization: Bearer <token>`; `signOut` deletes it even when the network call fails.
- A 401 response clears the stored token and sets `isSignedIn` false.
- The sign-in screen has one `h1`, labeled inputs, Enter submits, errors announced with `role="alert"`, a 60-second resend cooldown, and typing letters into the email field triggers no quiz key binding.
- The token never appears in AsyncStorage, logs, or analytics.

- [ ] Gated cycle; commit `feat(auth): sign-in screen and API client for web cookies and native tokens`.

### Task 3.11: sync queue and guest merge

**Risk:** high (concurrency and data loss). **Behaviors:** B-36, B-61; Review Focus 1.

**Files:** Create `services/sync/buildUploadBatches.ts`, `services/sync/mergeDownloadedEvents.ts`, `state/useSyncQueue.ts` (uploads unsynced events owned by the signed-in user, or guest events on that user's first sign-in on this device, in batches of 200 after sign-in, on app foreground, and every 5 minutes when online; backoff up to 15 minutes), `components/auth/SignOutDialog.tsx`; modify `state/StatsProvider.tsx` (mark synced by id; store `syncCursor`); tests.

**Behaviors (RED tests):**
- First sign-in claims guest events for that user, uploads them in batches of 200, and marks each synced only after a 2xx; a 1,000-event guest log fully syncs.
- A dropped response after the server stored a batch retries the same batch, and totals stay equal (integration test against a running test server).
- A 422 for out-of-bounds timestamps marks those events `isHeld`, keeps them, and uploads the rest.
- A second device pages `GET /answer-events?after=` until `nextCursor` is null, merges by `eventId` without duplicates, and derives the same XP, day streak, and review queue as the first; two devices uploading overlapping batches concurrently converge (Review Focus 1).
- Signing out with unsynced events opens a dialog offering "Sync now" or "Discard"; events owned by user A are never uploaded while user B is signed in.

- [ ] Gated cycle; R-109 review over PR 15; commit `feat(sync): upload the answer event log and merge a guest's history on sign-in`.

### Task 3.12: header and daily goal

**Risk:** standard. **Behaviors:** B-35 (client), B-64 (settings route).

**Files:** Modify `components/layout/AppShell.tsx` (day streak, XP today, `DailyGoalRing`); create `components/progress/DailyGoalRing.tsx`, `app/settings.tsx` (`SettingsScreen`: daily goal 10/20/50, sign in or out), `state/useProgressSummary.ts` (guest: computed locally with `@syntactical/progress`; signed in: last `/me` plus unsynced local events); tests.

- [ ] **Step 1:** tests: the header's accessible text reads "Day streak 3, 12 of 20 XP today"; the ring is `role="progressbar"` with `aria-valuenow`/`aria-valuemax` and `animation: none` under reduced motion; choosing 50 in settings updates the ring and, when signed in, sends `PATCH /me`; the answer streak stays in the stats panel.
- [ ] **Steps 2–4:** implement; pass; Lighthouse 100 on `/settings`. **Step 5:** commit `feat(progress): day streak, XP, and daily goal in the header and settings`.

### Task 3.13: sign-up prompt

**Risk:** standard. **Behaviors:** B-41.

**Files:** Create `components/auth/SignUpPrompt.tsx`; modify `components/quiz/ResultsScreen.tsx`; tests.

- [ ] **Step 1:** tests: a guest finishing a first round sees "Save your progress" with Sign up and Not now; Not now hides it permanently (`isSignUpPromptDismissed` persisted); a signed-in user never sees it; the prompt is a labeled region with a heading and keyboard-operable buttons; Enter on a focused "Not now" does not trigger Retry.
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(auth): one-time sign-up prompt after a guest's first round`.

### Task 3.14: paid bank endpoint

**Risk:** high (entitlement gate on paid content). **Behaviors:** B-37.

**Files:** Create `server/src/routes/banks.ts`, `server/src/services/hasEntitlement.ts`, `server/src/services/readServerBank.ts` (reads paid banks from `PAID_CONTENT_DIR`, populated from `syntactical-content` at image build, verified against the manifest at startup); tests.

**Behaviors (RED tests):**
- No session → 401; a session without the entitlement → 403; a `granted` entitlement → 200 with the stored bytes verbatim (`Content-Type: application/json`) whose SHA-256 equals the manifest bank hash; a `revoked` entitlement → 403.
- A free bank path → 404; traversal attempts (`..%2F`, an unknown language) → 404 without reading outside `PAID_CONTENT_DIR`.
- `Cache-Control: private, no-store`.
- The server refuses to start when any paid bank file's hash differs from the manifest.

- [ ] Gated cycle; commit `feat(server): serve paid banks only to entitled users`.

### Task 3.15: client paid bank loading

**Risk:** standard (the gate is server-side; the client reuses hash verification). **Behaviors:** B-44.

**Files:** Modify `services/content/loadQuestionBank.ts` (paid banks through `apiFetch`, verified with `verifyBankHash`, cached), `services/content/prefetchChangedBanks.ts` (prefetch a paid bank only when the user holds its entitlement), `components/menu/DifficultyStep.tsx` (disabled when there is no local copy and the device is offline, based on cache presence); tests.

- [ ] **Step 1:** tests: an entitled user's paid bank downloads through `apiFetch` under the `['bank', language, difficulty, hash]` query key (the download indicator shows), is hash-checked, cached, and plays offline after a simulated restart; a hash mismatch discards the body; a guest's launch makes no request for any paid bank; offline with no cached copy shows "Needs a connection".
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(content): load paid banks from the API and cache them for offline play`.

### Task 3.16: RevenueCat Web Billing on web

**Risk:** high (payment flow and user mapping). **Behaviors:** B-38.

**Files:** Create `clients/webBillingClient.ts` (`@revenuecat/purchases-js`: `configure({ apiKey, appUserId: user.id })`, `getOfferings()`, `purchase(package)`), `app/purchase-complete.tsx` (polls `/me`); modify `state/AuthProvider.tsx` (configure web billing with the server user id after sign-in, reset on sign-out); tests.

**Behaviors (RED tests):**
- After web sign-in, Web Billing is configured with `appUserId` equal to the server user id; before sign-in it is never configured (guests cannot buy).
- Buying a paid bank purchases the offering package whose product id equals the bank's `productId`.
- `/purchase-complete` polls `/me` every 2 seconds for up to 30 seconds and shows "Unlocked" or "Still processing, check back shortly".
- Sign-out resets the Web Billing user so the next account cannot see the previous one's purchases.
- No Stripe or RevenueCat secret key appears in the web bundle (only the public RevenueCat web billing key).

- [ ] Gated cycle; commit `feat(payments): RevenueCat Web Billing on web`.

### Task 3.17: RevenueCat webhook and user mapping

**Risk:** high. **Behaviors:** B-39.

**Files:** Create `server/src/routes/revenueCatWebhook.ts`, `server/src/services/recordPurchaseEvent.ts`, `server/src/services/recomputeEntitlement.ts` (latest event by provider `event_timestamp_ms`); modify `state/AuthProvider.tsx` (`Purchases.logIn(user.id)` after sign-in, `Purchases.logOut()` on sign-out, native only); tests.

**Behaviors (RED tests):**
- A wrong, empty, missing, or different-length `Authorization` header → 401, never 500: both sides are SHA-256 hashed before `timingSafeEqual`, so lengths always match.
- `NON_RENEWING_PURCHASE` for a mapped product from `APP_STORE`, `PLAY_STORE`, or `RC_BILLING` (web) → a purchase event and `granted` for the user whose id equals `app_user_id`; `REFUND` or `CANCELLATION` → `revoked`; a duplicate event id → no change.
- A refund event whose `event_timestamp_ms` precedes delivery of its purchase still leaves the entitlement `revoked`, because entitlements are recomputed from the latest event by provider time, not arrival (Review Focus 5).
- Two concurrent deliveries of one event leave one `purchase_events` row.
- An unknown `app_user_id` records the event with `user_id` null and grants nothing; an unmapped store product records the event, grants nothing, and logs a warning with no PII.
- After native sign-in, `Purchases.logIn` was called with the server user id; after sign-out, `Purchases.logOut` was called.

- [ ] Gated cycle; R-109 review over PR 18; commit `feat(payments): RevenueCat webhook and app user mapping`.

### Task 3.18: client purchase flow and restore

**Risk:** high. **Behaviors:** B-42, B-43, B-64 (paywall); Review Focus 3.

**Files:** Create `state/usePurchases.ts` (web: `webBillingClient`; native: `react-native-purchases` offerings, `purchasePackage`, `restorePurchases`), `components/purchase/PaywallSheet.tsx`; modify `components/menu/DifficultyStep.tsx` (lock and localized price for paid banks without the entitlement), `app/settings.tsx` ("Restore purchases" on native); tests.

**Behaviors (RED tests):**
- A paid bank without the entitlement shows a lock with the accessible name "Medium, locked, <price>", where the price is the RevenueCat offering's `priceString` on every platform; selecting it opens the paywall and fires `paywall_viewed` once.
- A guest selecting a paid bank goes to sign-in first, then back to the paywall.
- On web, Buy calls `webBillingClient.purchase` for the bank's package and then routes to `/purchase-complete`.
- On native, Buy calls `purchasePackage`; success refetches `/me`.
- Restore calls `restorePurchases`, then `/me`, and unlocks every entitled bank.
- Offline, with an entitlement known from the last `/me` and no cached bank, the bank shows "Needs a connection", not the paywall (Review Focus 3).
- The paywall has one `h1`, a focus trap, Escape closes it, and reduced motion disables its slide.

- [ ] Gated cycle; commit `feat(payments): paywall, purchase, and restore on web and native`.

### Task 3.19: analytics

**Risk:** standard. **Behaviors:** B-45.

**Files:** Create `constants/analyticsEvents.ts` (registry: `round_started`, `round_completed`, `signup_prompt_shown`, `signup_prompt_accepted`, `paywall_viewed`, `purchase_completed`, `review_round_completed`, `bank_exhausted`), `clients/analyticsClient.ts` (`trackEvent(name, properties)`; PostHog with `persistence: 'memory'` for guests and `identify(user.id)` after sign-in); wire triggers in `state/useQuizEngine.ts`, `components/auth/SignUpPrompt.tsx`, `components/purchase/PaywallSheet.tsx`, `state/usePurchases.ts`; tests.

- [ ] **Step 1:** tests: a name outside the registry fails at type level (`@ts-expect-error`) and throws at runtime; each trigger fires its event exactly once; properties named `email`, `code`, or `token` throw in tests; guest mode creates no cookies and no AsyncStorage keys; `bank_exhausted` fires when every question in a bank has at least one answer event.
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(analytics): PostHog events from a fixed registry, cookieless for guests`.

### Task 3.20: deploy the API

**Risk:** standard. **Behaviors:** operational.

**Files:** Create `server/Dockerfile` (multi-stage, non-root user; a build stage mounts `CONTENT_DEPLOY_KEY` with BuildKit `--mount=type=secret,id=content_deploy_key`, checks out `syntactical-content`, and copies only the paid bank files to `PAID_CONTENT_DIR`; the key never enters an `ARG`, `ENV`, or layer), `server/railway.json` (start `node-pg-migrate up && node dist/index.js`, health check `/health`), `.github/workflows/server.yml` (vitest with a Postgres service container, `tsc`, image build).

- [ ] Check: `docker history --no-trunc` and every layer of the built image contain no key material and no `.ssh` directory (scripted in `server.yml`).
- [ ] Steps: `docker build server` → deploy to Railway → the owner adds the `api` CNAME → `curl https://api.syntactical.dev/health` and `/health/ready` return ok → a credentialed fetch from `https://syntactical.dev` in Safari works (spec assumption ledger) → commit `chore(server): container, migrations on deploy, and CI`.

### Task 3.21: account deletion

**Risk:** high (PII, store requirement). **Behaviors:** B-59.

**Files:** Create `server/src/routes/deleteMe.ts`, `server/src/services/deleteUser.ts`, `components/auth/DeleteAccountDialog.tsx`; modify `app/settings.tsx`; tests.

**Behaviors (RED tests):**
- `DELETE /v1/me` (session, CSRF header) deletes the user's sessions, answer events, daily progress, and goal changes in one transaction; deletes every `one_time_codes` row for the user's normalized email; replaces every string in each of the user's `purchase_events.payload` that equals the user's email or display name after the same normalization on both sides (trim, NFKC, lowercase), at any depth and under any key (`subscriber_attributes.$email`, `$displayName`, aliases), with `[deleted]`; deletes the `users` row, which sets `entitlements.user_id` and `purchase_events.user_id` to null (the rows stay for accounting); responds 204 and clears the cookie.
- After deletion, a case-insensitive search of every table for the run-time email finds nothing (the payload fixture carries a mixed-case copy of the email), and the user's entitlement rows still exist with `user_id` null.
- The same token then gets 401; signing in again with the same email creates a new, empty user with no entitlements.
- The settings screen shows "Delete account" with a confirmation dialog that requires typing `DELETE`; cancel changes nothing; success signs out locally and clears the event log.
- No log line from deletion contains the email.

- [ ] Gated cycle; R-109 review over PR 20; commit `feat(account): delete an account and its personal data`.

---

## Stage 4: learning loop

### Task 4.1: review scheduler

**Risk:** standard. **Behaviors:** B-46.

**Files:** Create `packages/progress/src/scheduleReview.ts` (wraps `ts-fsrs`: `fsrs().next(card, at, isCorrect ? Rating.Good : Rating.Again)`), `packages/progress/src/buildReviewState.ts`, `packages/progress/src/types/ReviewItem.ts`; add `ts-fsrs` to `packages/progress`; tests in `packages/progress/src/__tests__/`.

**Interfaces:** `ReviewItem = { id: string; card: Card }` (`Card` from `ts-fsrs`: `due`, `stability`, `difficulty`, `reps`, `lapses`, `state`, …); `newReviewItem(id: string, at: string): ReviewItem`; `scheduleReview(item: ReviewItem, isCorrect: boolean, at: string): ReviewItem`; `buildReviewState(events: AnswerEvent[], misconceptionOf: (questionId: string, choiceIndex: number) => string | undefined): { questions: Record<string, ReviewItem>; misconceptions: Record<string, ReviewItem> }`; `isDueReview(event: AnswerEvent, priorEvents: AnswerEvent[]): boolean`.

- [ ] **Step 1: Write the failing tests**

```ts
import { expect, it } from 'vitest';
import { buildReviewState } from '../buildReviewState';
import { newReviewItem, scheduleReview } from '../scheduleReview';
import { fixtureEvents, fixtureMisconceptionOf } from './fixtures/reviewFixtures';

it('pushes a correct review further out and brings a miss back within a day', () => {
  const learned = scheduleReview(scheduleReview(newReviewItem('py-easy-01', '2026-09-20T10:00:00Z'), true, '2026-09-20T10:00:00Z'), true, '2026-09-23T10:00:00Z');
  const previousGap = learned.card.due.getTime() - Date.parse('2026-09-23T10:00:00Z');
  const afterCorrect = scheduleReview(learned, true, learned.card.due.toISOString());
  expect(afterCorrect.card.due.getTime() - learned.card.due.getTime()).toBeGreaterThan(previousGap);
  const afterMiss = scheduleReview(learned, false, learned.card.due.toISOString());
  expect(afterMiss.card.due.getTime() - learned.card.due.getTime()).toBeLessThanOrEqual(86_400_000);
  expect(afterMiss.card.lapses).toBe(learned.card.lapses + 1);
});

it('replays the same events to the same review state whatever their arrival order', () => {
  const reversed = [...fixtureEvents].reverse();
  expect(buildReviewState(reversed, fixtureMisconceptionOf)).toEqual(buildReviewState(fixtureEvents, fixtureMisconceptionOf));
});
```

- [ ] **Steps 2–4:** implement (replay sorts by `answeredAt`, then `eventId`; a misconception item aggregates its questions' outcomes); the server's `recomputeDailyProgress` switches its `isDueReview` from always-false to this function (test in `server/src/__tests__/services/recomputeDailyProgress.test.ts`: a correct due review earns the bonus). **Step 5:** commit `feat(progress): spaced review scheduler replayed from answer events`.

### Task 4.2: review rounds

**Risk:** standard. **Behaviors:** B-47, B-48, B-64 (review route).

**Files:** Create `state/useReviewQueue.ts`, `app/review.tsx` (`ReviewScreen`); modify `state/useQuizEngine.ts` (`roundKind: 'review'`), `components/layout/AppShell.tsx` ("N reviews due" link); tests.

- [ ] **Step 1:** tests: with 3 due items and the network off, `/review` plays those 3 questions from cached or bundled banks; a question from an uncached paid bank is skipped; correct due answers add the review bonus and count toward the daily goal; completion fires `review_round_completed`; zero due items shows "Nothing due" with the next due time.
- [ ] **Steps 2–4:** implement; pass; Lighthouse 100 on `/review`. **Step 5:** commit `feat(review): offline review rounds from due items`.

### Task 4.3: weakness report

**Risk:** standard. **Behaviors:** B-49.

**Files:** Create `services/progress/buildWeaknessReport.ts`, `components/stats/WeaknessReport.tsx`; modify `components/stats/StatsPanel.tsx`; tests.

- [ ] **Step 1:** tests: fewer than 20 answers in the last 7 days shows "Keep playing to see your weak spots" with the remaining count; otherwise the top 3 misconceptions by miss rate (at least 3 attempts each) with their manifest descriptions; tapping one starts a review round of that misconception's questions; a misconception with no misses never appears; a signed-in user's synced events still count (they are kept locally).
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(stats): weekly weakness report by misconception`.

---

## Stage 5: A/B cards

### Task 5.1: AbCard

**Risk:** standard. **Behaviors:** B-50, B-51.

**Files:** Create `components/quiz/AbCard.tsx`, `components/quiz/AbEvidence.tsx`; modify `components/quiz/QuizRound.tsx`, `state/useRoundKeyboard.ts` (`currentType` adds `'ab'`, accepting `A`/`B`/`1`/`2`), `components/quiz/KeyboardHintBar.tsx`, `components/quiz/QuestionCardFrame.tsx` (`TYPE_LABEL.ab = 'Which is optimal'`); tests `components/quiz/__tests__/AbCard.test.tsx`, `components/quiz/__tests__/keyboard.web.test.tsx`.

- [ ] **Step 1:** tests: the criterion statement is visible before answering; both options render `choice.code` as code blocks labeled "Option A" and "Option B" for screen readers; `A` and `2` each select; `3`, `4`, `C`, `D` do nothing; after answering, the evidence matches the criterion type; the hint bar lists A and B on `ab` cards.
- [ ] **Steps 2–4:** implement; pass. **Step 5:** commit `feat(quiz): A/B which-is-optimal cards`.

### Task 5.2: correctness A/B validator

**Risk:** standard. **Behaviors:** B-51 (evidence).

**Files:** Create `pipeline/src/services/validateCorrectnessAb.ts`; test `pipeline/src/__tests__/services/validateCorrectnessAb.test.ts`.

- [ ] Tests (fake `run`): option A passes every edge case and option B fails one → `passed` with `evidence = 'Fails for input []: IndexError'`; both pass → `failed` / `no-distinguishing-case`; both fail → `failed` / `neither-correct`. Implement through `runOracle`; commit `feat(pipeline): correctness A/B validation by edge-case execution`.

### Task 5.3: performance A/B benchmark

**Risk:** standard. **Behaviors:** B-52.

**Files:** Create `pipeline/src/services/benchmarkAb.ts`, a `bench` mode in each runner harness; test `pipeline/src/__tests__/services/benchmarkAb.test.ts`.

- [ ] Tests (fake timings): publish only when the faster option's median beats the other by at least `AB_MIN_RATIO = 2` on two separate runs of 30 iterations; 2.1x then 1.6x → `failed` / `unstable`; evidence reads `"A: 1.2 ms, B: 9.8 ms median on Node 22.11.0"`; Postgres uses `EXPLAIN (ANALYZE, FORMAT JSON)` execution time on a fixture table. Commit `feat(pipeline): benchmark-validated performance A/B cards`.

### Task 5.4: readability A/B

**Risk:** standard. **Behaviors:** B-53.

**Files:** Create `pipeline/src/services/judgeReadabilityAb.ts`, `pipeline/prompts/judgeReadabilityAb.md`; test `pipeline/src/__tests__/services/judgeReadabilityAb.test.ts`.

- [ ] Tests: publish refuses a readability card without `provenance.isHumanReviewed`; the judge's rubric reason is stored as `criterion.evidence`. Commit `feat(pipeline): rubric-judged readability A/B cards with required human approval`.

### Task 5.5 (operational): author 5 A/B cards per bank

- [ ] Generate 5 A/B cards per bank across the three criterion types, review, publish (paid banks into `syntactical-content`); commit `feat(content): A/B cards for every bank`.

---

## Stage 6: store release

### Task 6.1: production builds and store submission

**Risk:** standard. **Behaviors:** B-54.

**Files:** Modify `eas.json` (`development`, `preview`, `production` profiles), `app.config.ts` (RevenueCat and PostHog keys from env), `docs/device-checklist.md` (rows for sign-in, sign-out with unsynced events, purchase, restore on a fresh install, review round offline, paid bank offline, account deletion, reduced motion on the paywall and goal ring).

- [ ] Create the 6 products in App Store Connect and Play Console with ids `syntactical.<language>.<difficulty>`, map them in RevenueCat, price them at the $5 tier.
- [ ] Run EAS production builds; run the device checklist on a real iPhone and Android phone with sandbox purchases; record results in the checklist's Runs table.
- [ ] Store listings and privacy labels (email, purchase history, usage data, account deletion available in-app); submit. Commit `chore(release): production EAS profiles and the v2 device checklist`.

---

## Self-review

- Spec coverage: B-1 (1.1), B-2 (1.2), B-3/B-4/B-6 (1.3), B-5 (1.4), B-7 (1.5), B-8/B-12 (1.7), B-9/B-10/B-11 (1.8), B-13 (1.11, 1.12), B-14 (1.9), B-15 (1.13), B-16 (1.14), B-17/B-18 (2.1), B-19 (2.3), B-20/B-21 (2.4, 2.2), B-22 (2.6), B-23 (2.7), B-24 (2.8), B-25/B-26 (3.3), B-27/B-28 (3.4, 3.10), B-29/B-30/B-31 (3.5), B-32/B-33 (3.7), B-34/B-35 (3.6, 3.7, 3.8), B-36 (3.7, 3.11), B-37 (3.14), B-38 (3.16, 3.17), B-39 (3.17), B-40 (3.9), B-41 (3.13), B-42/B-43 (3.18), B-44 (3.15), B-45 (3.19), B-46 (4.1), B-47/B-48 (4.1, 4.2), B-49 (4.3), B-50/B-51 (5.1, 5.2), B-52 (5.3), B-53 (5.4), B-54 (6.1), B-55 (0.1), B-56 (0.2), B-57/B-58 (1.0, 5.1), B-59 (3.21), B-60 (1.5, 1.6), B-61 (3.11), B-62 (3.1), B-63 (3.3, 3.5), B-64 (1.13, 2.7, 3.10, 3.12, 3.18, 4.2).
- Placeholders: none. High-risk tasks deliberately carry behaviors instead of implementation code (R-411).
- Type consistency: `AnswerEvent`, `BankContext`, `Choice`, `Oracle`, `OracleRun`, `ValidationResult`, `ModelProvider`, `PipelineReport`, and `ReviewItem` (wrapping the `ts-fsrs` `Card`) are each defined once and reused by name.
