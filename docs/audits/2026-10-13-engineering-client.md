# Engineering audit: client app (2026-10-13)

Scope: the Expo 57 / React Native 0.86 / expo-router client only: `app/`, `components/`, `services/`, `state/`, `clients/`, `config/`, `constants/`, and the root files `app.config.ts`, `global.css`, `tailwind.config.js`, `metro.config.js`, `babel.config.js`, `jest.config.js`, `jest.setup.ts`. `server/`, `pipeline/`, `packages/`, `scripts/`, `e2e/` are covered by other dispatches. Goal: refactor, simplify, and clean-up opportunities ranked by value-to-effort, with correctness bugs noted in passing.

Confidence labels: HIGH-CONFIDENCE means the evidence is a quoted location and a grep or test run; SPECULATIVE means the finding needs a check the auditor could not complete from the code alone.

## Coverage

| Surface                                                       | How checked  | Notes                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----- | -------------------------------------------------------------------- |
| `npx tsc --noEmit` (root tsconfig)                            | executed     | Clean, exit 0. A second run with `--noUnusedLocals --noUnusedParameters` produced no non-test diagnostics.                                                                                                                                                                                                                                |
| `npx oxlint`                                                  | executed     | Exit 0, no errors. 19 warnings in non-test files, 20 more in tests (all `react/*` plugin rules). Listed under Code Quality.                                                                                                                                                                                                               |
| `npm test -- --silent`                                        | executed     | 233 suites, 1627 tests, all passing, 44.6 s wall.                                                                                                                                                                                                                                                                                         |
| Non-test source in scope (about 9 000 lines across 190 files) | read in full | Every file under the seven directories plus the root config files.                                                                                                                                                                                                                                                                        |
| Tests in scope (about 31 000 lines, 233 files)                | sampled      | Support files read in full (`authTestSupport.ts`, `apiTestSupport.ts`, `adminAccessTestSupport.ts`, `preloadNativeModal.ts`, `choiceName.ts`); the `signUp` native/web pair compared by test name; metrics gathered by grep (mock-count assertions, real sleeps, `jest.mock` boilerplate, render-helper definitions, fix-commit pairing). |
| Dead-export scan                                              | executed     | Script over every `export function                                                                                                                                                                                                                                                                                                        | const | class | type` in non-test, non-generated source counting non-test importers. |
| Dependency usage                                              | executed     | Importer count per `package.json` entry; peer-dependency check against `expo` and `expo-router`.                                                                                                                                                                                                                                          |
| Bug-fix discipline                                            | executed     | Last 60 commits; each `fix:` commit touching an in-scope path checked for a test-file change.                                                                                                                                                                                                                                             |
| Credential exposure scan                                      | not covered  | Not part of this dispatch (client cleanup). Must be run by the consolidating audit; nothing here should be read as clearing it.                                                                                                                                                                                                           |
| Runbook-vs-code drift, workspace hygiene, deploy config       | not covered  | `docs/runbooks/` and deploy surfaces belong to other dispatches. This checkout is itself a git worktree under `.claude/worktrees/`, which the workspace-hygiene scan should account for.                                                                                                                                                  |
| `server/`, `pipeline/`, `packages/`, `scripts/`, `e2e/`       | not covered  | Other agents. `packages/content-schema` and `packages/progress` were read only where the client calls them.                                                                                                                                                                                                                               |

## Ranked cleanup opportunities

Ranked by value divided by effort. Effort: S under one hour, M half a day, L multi-day. Each item has its full evidence in the sections below.

| #   | Opportunity                                                                                                                                                                                           | Effort | Confidence         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------ |
| 1   | One modal dialog shell for `SignOutDialog`, `DeleteAccountDialog`, `PaywallSheet` (focus-in, Escape, Tab wrap, focus-return, overlay choice are written three times, two of them differently)         | M      | HIGH               |
| 2   | One `useExclusiveAction` hook for the in-flight guard written four times (`sign-in.tsx` inlines it three times by hand)                                                                               | S      | HIGH               |
| 3   | `purchase-complete.tsx` re-implements `usePurchases().confirm`: a third parser of `GET /me` and a duplicate `purchase_completed` event                                                                | S      | HIGH               |
| 4   | Shared small helpers: `createTimeoutRace` (2 copies plus `withTimeout`), `countUtf8Bytes` (2), `readErrorCode` (3)                                                                                    | S      | HIGH               |
| 5   | Manifest lookups: `languages.find(({ id }) => id === x)` at 13 sites, `DIFFICULTIES.find` at 7, and `banks as Record<...>` casts in three routes and `TopicStep` where `findBankEntry` already exists | S      | HIGH               |
| 6   | `Constants.expoConfig?.extra as Record<string, unknown>` repeated at 5 sites with five hand-written `typeof` checks                                                                                   | S      | HIGH               |
| 7   | `expo-status-bar` has no importer anywhere; `react-native-css-interop` is already a dependency of `nativewind`                                                                                        | S      | HIGH / SPECULATIVE |
| 8   | `useClearOnBlur` and its internal `expo-router/build/react-navigation/core` import duplicated in `sign-up.tsx` and `PasswordSettingsForm.tsx`                                                         | S      | HIGH               |
| 9   | `apiPut` and `SentRequestInit` exist only so test doubles of `apiFetch` never see `PUT`; the five doubles that care already filter on `method === 'PUT'`                                              | S      | HIGH               |
| 10  | `AuthProvider.tsx` (406 lines) carries response parsing that belongs in `services/auth/`                                                                                                              | M      | HIGH               |

Further items that did not make the top ten but are cheap: eight `logWarning({ err: new Error('fixed text') }, ...)` calls (section Code Quality), seven exported types with no importer, a dead `eslint-disable` directive in a project that runs oxlint, two near-identical `ERROR_MESSAGES` tables, and the test-suite items in the Testing section (48 hand-written `expo-router` mocks in 8 shapes, 23 real 50 ms sleeps).

## Executive summary

The client is in good operational shape: typecheck and lint are clean, the full Jest suite is green in under a minute, every `fix(app)` commit in the last 60 is paired with a test change, and the dependency direction (routes and components call state, state calls services and clients, clients wrap SDKs) holds with no violations found. The codebase is small (about 9 000 non-test lines) and consistently commented.

The cleanup value is concentrated in duplication that grew as features were added one PR at a time: three modal dialogs each re-implement the same keyboard and focus contract, four screens hand-roll the same busy guard, the `GET /me` response is parsed three different ways, and a dozen small helpers (`createTimeoutRace`, `countUtf8Bytes`, `readErrorCode`, manifest lookups, config reads) exist in two to thirteen copies. None of it is dangerous today; all of it makes the next feature cost more than it should and makes the three dialogs drift (they already have: one uses a narrower focus-trap selector and a capture-phase listener).

Top three priorities:

1. Extract the modal shell (item 1) and the exclusive-action hook (item 2). Together they remove roughly 250 lines and eliminate the only place the three dialogs have already diverged.
2. Collapse the duplicated helpers (items 3 to 6, 8). Each is under an hour and each deletes a copy that will otherwise drift.
3. Reduce test-fixture boilerplate (Testing section). 48 files mock `expo-router` by hand in 8 shapes and 44 mock `expo-constants`; a `__mocks__/expo-router.ts` and a shared `settle()` built on fake timers would remove most of it and cut the 23 real 50 ms sleeps.

## Operational basics

| Check      | Status                                                                                                                                                                                                                                  |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests run  | Yes. `npm test -- --silent`: 233 suites, 1627 tests, 0 failures, 44.6 s.                                                                                                                                                                |
| Typecheck  | Yes. `npx tsc --noEmit` exit 0.                                                                                                                                                                                                         |
| Lint       | Yes. `npx oxlint` exit 0 (warnings only; see Code Quality).                                                                                                                                                                             |
| CI green   | Not verified in this dispatch (CI config is another agent's surface).                                                                                                                                                                   |
| E2E wired  | Not verified here; `e2e/` out of scope.                                                                                                                                                                                                 |
| Monitoring | Not applicable to the client beyond PostHog; `clients/logClient.ts` writes structured warnings to `console.warn` only, so there is no client error sink in production. Not a blocker for a static web app plus store builds, but noted. |

## Architecture and design

**Dependency direction holds.** `app/` imports `components/`, `state/`, `services/`, `clients/`; `components/` imports `state/`, `services/`, `clients/` (only `analyticsClient` and `apiClient`, both legitimate); `state/` imports `services/` and `clients/`; `services/` imports `clients/` and the workspace packages; `clients/` imports SDKs. No `services/` file imports React. No `state/` file imports `components/`. No catch-all `utils/` directory exists. HIGH-CONFIDENCE, by reading every import line.

**Two platform-split strategies coexist.** Four files use the Metro `.web.ts` suffix (`clients/purchaseStoreClient.web.ts`, `clients/purchasesIdentity/{identifyPurchaser,resetPurchaser,index}.web.ts`); everything else branches on `Platform.OS` at run time (35 sites in non-test source). `readSessionToken.ts`, `writeSessionToken.ts`, `clearSessionToken.ts` each branch on `Platform.OS === 'web'` and could be one `sessionTokenStore.ts` with a `.web.ts` no-op twin, matching the purchase client. The three `IS_WEB` module constants (`PasswordSettingsForm.tsx:51`, `PasswordSignInStep.tsx:27`, `SignUpStep.tsx:24`) and seven function-scope `isWeb` locals are the same value spelled two ways. Effort S each, risk low, SPECULATIVE on whether the owner prefers one strategy.

**`purchaseStoreClient.ts:420` reaches into a sibling's private state.** It imports `purchaserQueue` from `purchasesIdentity/purchaserQueue` to await the identity call before reading offerings. Correct, but the queue is the identity module's implementation detail; an exported `whenPurchaserReady(): Promise<void>` would name the contract. S, SPECULATIVE.

**`state/useIsReducedMotion.ts:1174` bends production code for a test environment.** The `typeof Reanimated.useReducedMotion === 'function'` guard exists because Expo Router's testing library installs a reanimated mock without the hook. A `jest.mock('react-native-reanimated')` in `jest.setup.ts` that adds the hook would let the production file be one line. S, HIGH-CONFIDENCE on the cause (the comment says so).

## Code quality

### Duplication

**D1. Modal dialog shell, three copies.** HIGH-CONFIDENCE.

- `components/auth/SignOutDialog.tsx:1013-1071` (`DialogPanel`): `markModalOpen` effect; web effect that focuses the panel, listens for `keydown` on `document` (bubble phase), calls `wrapTab` on Tab, `stopPropagation` plus `onCancel` on Escape.
- `components/auth/DeleteAccountDialog.tsx:266-354` (`DialogPanel`): same contract, but the Tab wrap is re-implemented inline at lines 284-301 with the selector `'button:not([disabled]), input:not([disabled])'` (no `a[href]`, no `[tabindex]`, no `aria-disabled` filter, unlike `wrapTab.ts:1453-1457`) and the listener is capture-phase (`addEventListener('keydown', handleKeyDown, true)`).
- `components/purchase/PaywallSheet.tsx:2094-2120` (`usePanelKeyboard`): same contract again as a hook, which additionally restores focus to `document.activeElement` on unmount.
- The trigger-focus-return (`wasOpenRef` effect) is duplicated verbatim at `SignOutDialog.tsx:1093-1098` and `DeleteAccountDialog.tsx:376-381`; `setBusy`/`isBusyRef` at `1100-1103` and `383-386`; the `Modal` vs `ModalOverlay` choice at `1167-1174` and `423-430`.
- Direction: one `useModalPanel(panelRef, onClose)` hook (PaywallSheet's is the best starting point) and one `DialogShell` component that owns the overlay choice and trigger focus return. `to confirm`: whether the capture-phase listener in `DeleteAccountDialog` was deliberate (its comment says "so a focused text input cannot swallow the key first"; `SignOutDialog` has no text input, `PaywallSheet` has none either, so the shared hook can use capture phase for all three). Effort M. Risk: the three `*.web.test.tsx` keyboard suites (`SignOutDialogKeyboard`, `DeleteAccountDialog.web`, `difficultyPaywallFocus.web`) will catch a regression.

**D2. In-flight guard, four hand-written copies.** HIGH-CONFIDENCE.

- `app/sign-in.tsx:1081-1099`, `1101-1119`, `1128-1145`: three functions each open with `if (isInFlightRef.current) return; isInFlightRef.current = true; setIsBusy(true); setErrorMessage(null); try { ... } finally { isInFlightRef.current = false; setIsBusy(false); }`.
- `app/sign-up.tsx:1253-1264` (`runExclusive`), `components/auth/InlineCodeSignIn.tsx:576-589` (`runExclusive`), `components/auth/PasswordSettingsForm.tsx:818-847` (inline in `save`).
- Direction: `state/useExclusiveAction.ts` returning `{ isBusy, run }`. `sign-in.tsx` shrinks by about 30 lines. Effort S. Risk: low; the sign-in double-submit tests (`signInPassword.test.tsx:257-259`, `signUp.test.tsx` "sends one request when pressed again while the first is in flight") assert the behavior.

**D3. `GET /me` parsed three ways; `purchase_completed` fired from two places.** HIGH-CONFIDENCE.

- `state/useEntitlements.ts:1126-1133` (`fetchEntitlements`), `state/useProfile.ts:1337-1342` (`fetchProfile`), `app/purchase-complete.tsx:713-717` (`hasEntitlement`). Each reads `body.data.entitlements` with its own cast.
- `purchase-complete.tsx:739-753` polls `apiFetch('me')` directly and calls `trackEvent('purchase_completed', { productId })` at line 748; `state/usePurchases.ts:1511-1517` (`confirm`) does the same fetch via the entitlements query and fires the same event at line 1515.
- Direction: the route calls `usePurchases().confirm(productId)` inside its poll loop and deletes `hasEntitlement`; `fetchEntitlements` becomes the one entitlement reader. `to confirm`: `confirm` uses `queryClient.fetchQuery` with `staleTime: 0`, so repeated polling is still a network call each time (good); and `purchaseCompleteRoute.test.tsx` and `purchaseCompleteAnalytics.test.tsx` mock `apiClient` directly, so they would need to go through the query client. Effort S for the code, S-M for the tests.

**D4. Small helper duplicates.** HIGH-CONFIDENCE.

- `createTimeoutRace`: `clients/apiClient.ts:203-215` and `clients/fetchContentText.ts:341-353` are the same function with a different error class; `clients/purchasesIdentity/enqueuePurchaserCall.ts:610-616` (`withTimeout`) is the same race in `Promise.race(...).finally(clearTimeout)` form. One `clients/raceTimeout.ts` taking an error factory.
- `countUtf8Bytes`: `clients/fetchContentText.ts:305-307` and `services/content/loadQuestionBank.ts:358-360`, identical.
- `readErrorCode(body)`: `state/AuthProvider.tsx:108-111`, `components/auth/PasswordSettingsForm.tsx:749-752` (identical), `services/sync/runSyncPass.ts:1675-1678` (same result via `isRecord`). One `services/api/readErrorCode.ts`.
- Effort S for all three. Risk: none beyond import churn.

**D5. Manifest lookups.** HIGH-CONFIDENCE.

- `manifest.languages.find(({ id }) => id === language)` or the `entry.id` form at 13 non-test sites: `app/review.tsx:33`, `app/[language]/index.tsx:37`, `app/[language]/[difficulty]/{index,length,play}.tsx:19/22/43`, `components/menu/{DifficultyStep,LengthStep,TopicStep}.tsx:104/27/54`, `services/admin/describeProduct.ts:10`, `services/content/{buildBankQuery,findBankEntry}.ts:28/9`, `state/ContentProvider.tsx:32`, `state/useQuestionBank.ts:37`.
- `DIFFICULTIES.find(({ id }) => id === x)` at 7 sites (list in the grep: `review.tsx:34`, `play.tsx:44`, `[language]/index.tsx:124`, `TopicStep.tsx:62`, `DifficultyStep.tsx:43`, `LengthStep.tsx:28`, `describeProduct.ts:11`).
- The bank-entry casts that `findBankEntry` already encapsulates: `app/[language]/[difficulty]/index.tsx:50` and `length.tsx:85` (`languageEntry.banks as Record<string, { topicCounts?: ... }>`), `app/[language]/index.tsx:221` (`as keyof typeof languageEntry.banks`), `components/menu/TopicStep.tsx:1893` (`banks as Record<string, { topicCounts: ... } | undefined>`), `components/menu/DifficultyStep.tsx:1592-1599` (`readPrice` with a structural parameter type).
- Direction: `services/content/findLanguageEntry.ts` and `findDifficulty.ts` next to `findBankEntry.ts`; routes and menu steps call `findBankEntry` for `topicCounts`/`productId`. `to confirm`: `findDifficulty` may belong in `@syntactical/content-schema` beside `DIFFICULTIES` (out of this dispatch's scope). Effort S.

**D6. Expo config reads.** HIGH-CONFIDENCE. `Constants.expoConfig?.extra` is read with a bespoke cast and `typeof` check at `clients/analyticsClient.ts:50-52`, `clients/purchasesIdentity/identifyPurchaser.ts:638-643`, `clients/webBillingClient/configureWebBilling.ts:718-719`, `clients/apiClient.ts:136-139`, `app/_layout.tsx:352-357`. Direction: `config/readExtraString(key): string | null` and one `jest.mock('expo-constants')` shape (44 test files mock it today). Effort S.

**D7. `useClearOnBlur`.** HIGH-CONFIDENCE. `app/sign-up.tsx:1236-1239` and `components/auth/PasswordSettingsForm.tsx:781-784` are the same four lines, each importing `NavigationContext` from `expo-router/build/react-navigation/core` (an internal path; the comment at `sign-up.tsx:1193` acknowledges the risk). One copy in `state/useClearOnBlur.ts` halves the exposure to that path changing. Effort S.

**D8. Error-message tables.** HIGH-CONFIDENCE. `app/sign-in.tsx:1054-1061` and `components/auth/InlineCodeSignIn.tsx:553-560` are both `Record<FailureReason, string>` over the same six reasons; four of six strings are identical and `'rate-limited'` is the shared constant in one and a literal in the other. Direction: one table in `services/auth/` with the two sign-in-specific strings as overrides. Effort S. `to confirm`: whether the "or use a code instead" suffix on the sign-in route is deliberate copy (it reads like it is).

**D9. `appConfig*.test.ts` helpers.** HIGH-CONFIDENCE. Five test files (`appConfigApiBaseUrl`, `appConfigOrigin`, `appConfigPostHogKey`, `appConfigRevenueCatKeys`, `appConfigE2eOrigins`) each define their own `jest.isolateModules` loader and `process.env` save/restore. One `loadAppConfig(env)` fixture. Effort S.

### Over-abstraction

**O1. `apiPut`.** HIGH-CONFIDENCE. `clients/apiClient.ts:234-244`: `SentRequestInit` and `apiPut` exist, per the comment at line 234, "so the shape callers and test doubles of apiFetch see is unchanged". Two callers (`PasswordSettingsForm.tsx:830`, `useAdminAccess.ts:1047`). The five test doubles that distinguish PUT already filter on `request.method === 'PUT'` (`settingsPassword.web.test.tsx:184`, `adminRoute.test.tsx:214`, `adminRoute.web.test.tsx:156`, `PasswordSettingsForm.test.tsx:108`, `.web.test.tsx:77`). Adding `'PUT'` to `ApiRequestInit['method']` deletes 10 lines and one export. `to confirm`: that no test double throws on an unknown method (grep for `throw` inside the 24 `jest.mock('.../apiClient')` blocks). Effort S.

**O2. `logWarning({ err: new Error('fixed text') }, 'message')`.** HIGH-CONFIDENCE, 8 sites: `clients/purchaseStoreClient.ts:436/450/461`, `clients/purchasesIdentity/identifyPurchaser.web.ts:666`, `resetPurchaser.web.ts:702`, `clients/webBillingClient/readWebBillingPrices.ts:787`, `purchaseWebBillingProduct.ts:764`, `clients/purchasesIdentity/enqueuePurchaserCall.ts:622`. An `Error` is constructed only so `logClient.serializeContextValue` can turn it back into `{ name, message }`. The intent (never log the SDK's own error, which can carry the user id) is right; the mechanism is a detour. Direction: `logWarning({ reason: 'store prices unavailable' }, ...)` or a `logFixedFailure(reason)` helper. Effort S. Risk: `logClientErrors.test.ts` and any test asserting on the warn JSON shape.

**O3. Seven exported types with no importer.** HIGH-CONFIDENCE (dead-export scan): `RoundQuestion` (`services/quiz/shuffleChoices.ts:983`), `AdminAccessState` (`state/useAdminAccess.ts:996`), `BuyOutcome`, `PurchasesState` (`state/usePurchases.ts:1470/1472`), `AccountFacts`, `ProfileSnapshot` (`state/useProfile.ts:1308/1309`), `CompleteSignUpResult` (`state/AuthProvider.tsx:79`). All used inside their own file; drop `export`. Effort S. No function, component, hook, or constant export was found without a non-test importer.

**O4. `hashClient` and `uuidClient` seams are bypassed by the setup.** `jest.setup.ts` mocks `expo-crypto` directly (`randomUUID` from `node:crypto`), and 13 test files mock `hashClient` while 1 mocks `uuidClient`. The wrappers are fine as seams, but the project mocks at two layers for the same SDK. SPECULATIVE on which layer to keep; the cheaper fix is to mock `expo-crypto` only in `jest.setup.ts` and delete the 14 per-file mocks.

### Inconsistent patterns

- **Storage reads.** `clients/readJson.ts` (fallback on any failure) and `clients/readStoredJson.ts` (reports `isReadFailed`, returns raw text on parse failure) are two AsyncStorage read adapters. The split is justified by the comment in `readStoredJson.ts:513-517` (stats must not overwrite an unreadable key), but `readJson` could be `readStoredJson` plus a fallback, which would give the content cache the same "read failed" signal for free. SPECULATIVE, S.
- **Boolean naming.** `RecordedAnswer.wasCorrect` (`services/stats/types/RecordedAnswer.ts:1551`) is renamed to `isCorrect` in `buildLoggedAnswerEvent.ts:1171`; `useQuizEngine` exposes `wasCorrect`. One name would remove the mapping line. S.
- **`eslint-disable-next-line react-hooks/exhaustive-deps`** at `components/auth/InlineCodeSignIn.tsx:601` has no effect: the project lints with oxlint (`.oxlintrc.json`), not ESLint. The only such directive in source. S.
- **`CodeStep.cooldownRestartKey` prop plus effect** (`components/auth/CodeStep.tsx:174-176`) resets a timer via setState-in-effect (the oxlint warning at `CodeStep.tsx:34`). Passing the same counter as React `key` on the `<CodeStep>` element in the three callers would remount it and delete the prop and the effect. S, SPECULATIVE on whether the remount flicker is acceptable (the input is refocused on mount anyway).

### oxlint warnings in non-test source (19)

All are `react/*` plugin rules and none is an error. By kind: `refs` (reading `ref.current` during render) at `state/AuthProvider.tsx:121,126` (lazy ref init, accepted React pattern), `state/useProfile.ts:65,69`, `state/useSyncQueue.ts:31`, `components/layout/DownloadIndicator.tsx:18,31`; `only-export-components` at `state/AuthProvider.tsx:394,404`, `state/ContentProvider.tsx:109`, `state/SyncProvider.tsx:46` (providers co-exported with their hooks; Fast Refresh only); `set-state-in-effect` at `components/auth/CodeStep.tsx:34`, `app/purchase-complete.tsx:51`; `immutability` at `state/useSyncQueue.ts:85`. Of these, `DownloadIndicator.tsx:1369` is the one worth a line: `useRef(new Animated.Value(0)).current` constructs a new `Animated.Value` on every render and discards it; `useRef<Animated.Value | null>(null)` with lazy init, or `useState(() => new Animated.Value(0))`, fixes the warning and the allocation. S.

### Oversized files (non-test, top 10 by lines)

| File                                       | Lines | Would splitting help?                                                                                                                                                                                               |
| ------------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state/AuthProvider.tsx`                   | 406   | Yes. Lines 99-130 (`readSessionResponse`, `readErrorCode`, `SIGN_UP_REFUSALS`, `readSignUpRefusal`) are pure response parsing and belong in `services/auth/`; the provider keeps the state machine. Item 10.        |
| `state/StatsProvider.tsx`                  | 319   | Partly. `usePersistedSlot`, `loadSlot`, `changeSlot`, `queueKeyRemoval` (lines 654-695) are a self-contained persistence primitive; `state/usePersistedSlot.ts` would let them be unit-tested without the provider. |
| `components/quiz/QuizRound.tsx`            | 258   | No. Already decomposed into `CardBody`, `QuestionCard`, `AnswerActions`, `RoundHeader`; the remainder is wiring.                                                                                                    |
| `components/auth/PasswordSettingsForm.tsx` | 218   | Yes, via D1/D2/D4/D7: `readErrorCode`, `useClearOnBlur`, and the in-flight guard leave; `readRefusal` could join the auth response parsers.                                                                         |
| `components/auth/DeleteAccountDialog.tsx`  | 215   | Yes, via D1: about 90 lines are the shell.                                                                                                                                                                          |
| `components/auth/SignOutDialog.tsx`        | 210   | Yes, via D1.                                                                                                                                                                                                        |
| `app/settings.tsx`                         | 185   | Marginal. `RestorePurchases`, `AdminLink`, `AccountSection`, `LegalLinks` are already separate functions; moving `AccountSection` to `components/auth/` would let it be tested without the route.                   |
| `app/sign-up.tsx`                          | 180   | Yes, via D2/D7/D8.                                                                                                                                                                                                  |
| `clients/apiClient.ts`                     | 165   | Via O1 and D4 only.                                                                                                                                                                                                 |
| `state/useSyncQueue.ts`                    | 152   | No. Dense but single-purpose; the comments carry the invariants.                                                                                                                                                    |

## Security

Client-side only. Nothing new found; the existing controls read as intended:

- `apiClient.ts` sends `credentials: 'include'` only on web, `X-Requested-With` on web, a bearer from `expo-secure-store` on native, refuses redirects, and clears the stored session on a 401 only when the stored value is the one the request sent (`handleUnauthorized`, lines 217-232). HIGH-CONFIDENCE by reading; the `apiClientHardening.test.ts` suite (377 lines) exercises it.
- `readReturnTo.ts` bounds length and pattern before any navigation. `resolveBankUrl.ts` checks origin and path containment. `loadQuestionBank.ts:385-387` validates bank id segments before building the paid-bank path.
- `app.config.ts` rejects non-public vendor keys by prefix and refuses non-loopback E2E URLs; five `appConfig*.test.ts` files cover it.
- `analyticsClient.ts` refuses property names containing `code`, `email`, `token`; `persistence: 'memory'`.
- No credential-shaped literals in source (the test support files build identities with `node:crypto` at run time, as the global rules require).

One SPECULATIVE note: `DeleteAccountDialog`'s inline focus trap (D1) uses `button:not([disabled])`, while the shared `wrapTab` filters on `aria-disabled`. If react-native-web renders a disabled `Pressable` with `aria-disabled` rather than the `disabled` attribute, the delete dialog's Tab cycle can land on the disabled "Delete my account" button. `to confirm`: inspect the DOM in `DeleteAccountDialog.web.test.tsx` for a disabled Cancel/Confirm and assert the Tab order skips it. Resolving D1 with `wrapTab` removes the question.

## Credential exposure scan

Not run in this dispatch (scope: client cleanup). The consolidating audit must run the full scan (git history, working tree, session transcripts, shell history, vendor CLI caches) before the combined report is considered complete. No credential-shaped strings were seen while reading the in-scope source.

## Database

Not applicable to the client. The on-device stores (`AsyncStorage` for stats, event log, content cache, and auth identity; `expo-secure-store` for the native session) have a versioned schema (`STORAGE_SCHEMA_VERSION`, `isStoredStats`, `isStoredStatsV1`, `migrateStatsV1`) and a capped event log (`capEventLog`). Read-failure handling (`resolveStoredStats`, `resolveStoredEventLog`) keeps changes in memory rather than overwriting an unreadable key. This is well above the usual bar for client persistence.

## API design (client side)

- Status-code constants in `constants/appConfig.ts:` cover every branch the client takes; no magic numbers found except `HTTP_NO_CONTENT = 204` defined locally at `components/auth/DeleteAccountDialog.tsx:252` instead of in `appConfig.ts`. S.
- Response parsing is scattered (D3, D4): `readErrorCode` three times, `GET /me` three times, `(body as { data?: ... } | null)?.data` cast idiom at 9 sites. A `services/api/readData(body)` plus the per-endpoint parsers already in `services/` (`parseProfile`, `parseAccessEntry`) would make the pattern uniform.
- Query keys are consistent: `['me', ...]` prefix shared by `useProfile`, `useEntitlements`, and `useAdminAccess`'s invalidation; `['bank', ...]`, `['manifest']`, `['ownedBank', ...]`, `['admin', 'access', userId]`. No key is built in more than one place except `useProfile.ts:1355/1369/1406`, where the same four-element key is assembled three times by hand; a `buildProfileKey(userId, today, syncedCount)` would match `buildEntitlementsKey`. S.

## Performance

**Polling and intervals** (grep for `setInterval`, `refetchInterval`, `setTimeout` loops):

- `app/purchase-complete.tsx:739-755`: polls `GET /me` every 2 s for at most 30 s, gated on `canPoll` and cleared on unmount. Bounded; fine.
- `app/[language]/index.tsx:252-261`: two re-checks 2 s apart after a `pending` purchase, gated on mount. Bounded; fine.
- `state/useSyncQueue.ts:2050-2057`: 5-minute interval gated on `isReady && isOnline`, suppressed while a backoff timer is pending. Fine.
- `state/useCoarseNow.ts:1088`: a 30 s `setInterval` per hook instance. It is instantiated at least three times on the home screen (`AppShell` via `useProgressSummary`, `ReviewDueLink` via `useReviewQueue`, `WeaknessReport` via both `useReviewQueue` and its own call). Each tick re-runs `buildReviewQueue` (`services/review/buildReviewQueue.ts:1061`), which replays the whole event log (up to `EVENT_LOG_CAP = 5000` entries) through `buildReviewState`, in two separate `useMemo`s (`useReviewQueue` is called from two components with no shared cache). On the home screen that is two full replays every 30 s while idle. Not a network cost and not user-visible today, but it is the one unbounded recurring computation in the client. Direction: a `ReviewQueueProvider` (or a `useQuery` with the event log length and `now` in its key) so the replay happens once per tick. P2, effort M, SPECULATIVE on whether 5000-event replay is measurable on low-end Android.

**No N+1 or bundle findings.** `prismjs` grammars are imported statically (`services/codeBlock/tokenizeCode.ts:112-118`, seven languages); the web bundle carries all seven regardless of which bank is open. Lazy-loading per grammar is possible but the grammars are small; not worth the complexity now.

## Testing

**Strengths.** 233 suites and 1627 tests over about 9 000 source lines; integration-style tests against a routed `fetch` fake rather than mocked internals for the auth, sync, and admin flows; every behavior change in the last 60 commits is paired with a test (next section); negative-input tests exist for every network-facing parser read (`apiClientHardening`, `loadQuestionBankWarnings`, `syncServerResponses`, `appConfig*`).

**Mock-count assertions.** 227 `toHaveBeenCalled*` assertions out of 3 588 `expect(` calls (6 percent). Sampled `app/__tests__/signInPassword.test.tsx` (25 of them) and `clients/__tests__/analyticsClient.test.ts` (18): all assert an observable contract ("sends one request", "navigates to /", "never captures a forbidden property") rather than internal call shape. No vacuous assertion found. HIGH-CONFIDENCE for the two sampled files; the rest are inferred from the ratio.

**Boilerplate that wants a fixture.** HIGH-CONFIDENCE by grep:

- `jest.mock('expo-router', ...)` in 48 test files in at least 8 shapes (`{ router: { push: jest.fn() } }`, `{ router: { push, replace } }`, with/without `useLocalSearchParams`, `Link`, `Redirect`). A root `__mocks__/expo-router.ts` exposing `router.push`, `router.replace`, `useLocalSearchParams`, `Link`, `Redirect` as resettable mocks would delete most of the 48 blocks.
- `jest.mock('expo-constants')` in 44 files and `jest.mock('expo-secure-store')` in 40, both already mocked once in `jest.setup.ts`; many per-file copies exist only to change `extra`. A `setExpoExtra(overrides)` helper beats re-mocking the module.
- 55 test files define their own `render*` helper; `EmailField.web.test.tsx` defines three (`renderSignIn`, `renderSignUp`, `renderCodeEmail`).
- Effort M for the `expo-router` mock; S for the others. Risk: a shared mock shape can hide a test that needed a specific `router` method to be absent; keep per-file overrides possible.

**Real sleeps.** 37 `await new Promise((resolve) => setTimeout(resolve, N))` calls in tests: 23 at 50 ms, 7 at 30 ms, 2 at 20 ms, 5 at 0 ms, in 19 files, mostly through a per-file `settleBackgroundWork()` (`state/__tests__/useQuestionBank.test.tsx:91-95`). 50 ms is a guess at how long React Query and AsyncStorage take to settle; it is both slow (about 1.2 s of pure waiting per run) and the usual source of CI-only flakes when a slow runner needs 60 ms. Only 17 files use `jest.useFakeTimers`. Direction: one shared `settle()` built on `waitFor` against a concrete condition, or fake timers with `advanceTimersByTimeAsync`. Effort M (19 files). Risk: `waitFor` needs a condition per call site; some sites wait for "nothing happened", which needs a short fixed wait anyway.

**Fan-out.** `StatsProvider` has 14 test files and `settings` 9 (`settingsPassword`, `settingsRestore`, `settingsRestoreMessages`, `settingsAdminLink`, `settingsAccessibility`, ...). The split-by-concern naming is deliberate and readable; the cost is that each file re-declares the provider tree. A `renderSettings()` fixture in a `settingsTestSupport.ts` would match what `authTestSupport.ts` already does for auth.

**Native/web pairs.** `signUp.test.tsx` (22 tests) and `signUp.web.test.tsx` (14 tests) overlap on about five behaviors (h1, hint, breached refusal, short-password refusal, returnTo forwarding) and diverge on the rest (web: `<form>` semantics, Tab order, Enter; native: secure store, time zone, no-storage leak checks). The overlap is the platform-independent core and is the right thing to run under both presets. No drift found between the two.

**`preloadNativeModal.ts`** (`components/auth/__tests__/preloadNativeModal.ts`) exists to pre-pay React Native's lazy `Modal` getter so the first native test does not hit its timeout on a cold CI cache. Eight native suites import it (the `SignOutDialog`, `DeleteAccountDialog`, `difficultyPaywall*`, and `settingsRestore*` files). Four native suites that also render a `Modal` do not: `components/query/__tests__/QueryDrawer.test.tsx`, `QueryDrawerSource.test.tsx`, `QueryDrawerMotion.test.tsx`, and `components/quiz/__tests__/codeWiring.test.tsx`. HIGH-CONFIDENCE by grep. Either they are fast enough that it does not matter (they may run after another suite has warmed the cache, which is order-dependent) or the import belongs in `jest.setup.ts` for the native project so no suite has to remember it. The second is one line and removes eight per-file imports. S.

## Dependencies and supply chain

| Package                           | Finding                                                                                                                                                                     | Confidence  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `expo-status-bar ~57.0.1`         | No importer in source, tests, config, or `app.config.ts`; not a peer dependency of `expo` or `expo-router`. Remove.                                                         | HIGH        |
| `react-native-css-interop ^0.2.7` | No direct importer. It is a direct dependency of `nativewind@4.2.7` (pinned `0.2.7`), so the root entry is redundant. Keeping it pins the version, which may be deliberate. | SPECULATIVE |
| `expo-linking ~57.0.11`           | No direct importer, but a required peer of `expo-router`. Keep.                                                                                                             | HIGH        |
| `react-native-screens ~4.26.0`    | No direct importer, but a required peer of `expo-router`. Keep.                                                                                                             | HIGH        |
| `tsx`                             | Used by `content:build` and `scripts/`. Keep.                                                                                                                               | HIGH        |
| Everything else                   | Has at least one non-test importer or is a test runner.                                                                                                                     | HIGH        |

Lockfile present (`package-lock.json`). CVE scan (`npm audit`) not run in this dispatch; it belongs with the consolidating supply-chain pass since the workspace lockfile covers `server/` and `pipeline/` too.

## Deployment and infrastructure

Out of scope except the root config files. `app.config.ts`, `metro.config.js`, `babel.config.js`, `tailwind.config.js`, `global.css`, `jest.config.js`, `jest.setup.ts` were read; nothing to flag. `tailwind.config.js` `content` globs cover `app/` and `components/` only; `className` strings in `state/` would be missed, and there are none today (checked by grep for `className` outside `app/` and `components/`: zero). Worth a comment on the config line so the next person who adds JSX under `state/` knows.

## Bug fix discipline

All 60 recent commits scanned; those touching an in-scope path with a `fix` subject:

| SHA     | Subject                                                                | Test files changed |
| ------- | ---------------------------------------------------------------------- | ------------------ |
| 4a4d831 | fix(app): name True/False buttons from their visible text              | 2                  |
| 03b024a | fix(app): record a bank completion only when every question was played | 1                  |
| 465f564 | fix(app): admin switch and email label accessibility                   | 2                  |
| cff55c7 | fix(app): admin page load states, refetch, and cache reset             | 2                  |
| 7b42213 | fix(app): name answer choices from visible content                     | 8                  |
| ac0d839 | fix(app): round length analytics, labels, and comments                 | 5                  |
| 4562e69 | fix(app): settings password form follow-ups                            | 2                  |
| 4336218 | fix(app): keep the query drawer clear of the status bar                | 1                  |
| d7a90e6 | fix(app): answer choice names start with the visible letter            | 7                  |
| ca8328c | fix(quiz): shuffle multiple-choice answers once per round              | 5                  |
| 526c067 | fix(app): send a signed-out user from /admin to the home page          | 1                  |
| 77e8adb | fix(app): visible email labels, full-width inputs, admin switches      | 6                  |
| 3861f29 | fix(app): land the PR 104 review fixes and the E2E sign-in path        | 8                  |
| 1200533 | fix(app): accept only lowercase sub-paths for EXPO_BASE_URL            | 1                  |
| 9af5085 | fix(app): keep the app bar contents in the page column                 | 5                  |
| 75f989d | fix(app): hide the stats panel until the first answer                  | 4                  |
| e1baa27 | fix(app): tagline reads "who know all the answers"                     | 0                  |
| d9555d2 | fix(app): shorten the home page tagline                                | 0                  |
| 3b71b93 | fix(a11y): keep keyboard focus inside the sign-out dialog              | 2                  |

Two unpaired fixes, both marketing-copy changes to one string on the home page (`e1baa27`, `d9555d2`). Not behavior; no finding. Every behavioral fix is paired. HIGH-CONFIDENCE.

## Runbook-vs-code drift

Not covered in this dispatch.

## Workspace hygiene

Not covered beyond noting that this checkout is a worktree at `.claude/worktrees/narrow-app-config-allowlist-57d11e` under the main checkout. The consolidating audit's duplicate-directory scan should treat `.claude/worktrees/*` as expected, not as stray copies.

## Correctness notes in passing

- **`app/review.tsx:805-811`, `describeSource` fallback.** `ROUND_SOURCE.grammar` is `'python'`, so a review question whose language is no longer in the manifest renders its code with Python highlighting. `'plain'` is the honest fallback (`tokenizeCode.ts:140` handles it). SPECULATIVE on whether the case can occur (a bank that was removed from the manifest but whose events remain in the log would trigger it). S.
- **`components/layout/DownloadIndicator.tsx:1369`.** `useRef(new Animated.Value(0)).current` allocates a throwaway `Animated.Value` on every render (see oxlint section). S.
- **`app/[language]/index.tsx:234`.** `setSelectedDifficulty(null)` during render on sign-out. Allowed by React for the rendering component and commented; noted only because the same effect is reachable through `closePaywall`. No change needed.
- **`state/useProfile.ts:1352`.** `syncedIds` is recomputed by `filter().map()` on every render of every `useProfile` caller (`AppShell`, `settings.tsx` twice). Only its `.length` enters the key and a `Set` of it is built per fetch. A `useMemo` on `eventLog` is a one-line win. S.
- **`components/auth/DeleteAccountDialog.tsx:284-301`.** Focus-trap selector narrower than `wrapTab`; see D1 and the Security note.

## Tech debt register

| Item                                                                      | Risk       | Note                                                                                                                                                     |
| ------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Three divergent modal shells (D1)                                         | Medium     | Already drifted once; next accessibility fix will be applied to one of three.                                                                            |
| Internal `expo-router/build/react-navigation/core` import, two sites (D7) | Medium     | Breaks on an expo-router internal reshuffle; one site halves the blast radius, and `sign-up.tsx:1193` already notes the CI web bundle is the only guard. |
| `useReviewQueue` replay per 30 s tick, per caller (Performance)           | Low        | Scales with event log size; cap is 5000.                                                                                                                 |
| Two platform-split strategies (Architecture)                              | Low        | Cosmetic until someone adds a fourth `.web.ts` and a tenth `Platform.OS` branch in the same PR.                                                          |
| Real 50 ms sleeps in 19 test files (Testing)                              | Low-Medium | CI flake source; not observed failing in this run.                                                                                                       |
| `useIsReducedMotion` test-environment guard in production code            | Low        | One line; fix lives in `jest.setup.ts`.                                                                                                                  |
| `eslint-disable` directive with no linter to honor it                     | Low        | Misleading.                                                                                                                                              |

## Prioritized recommendations

| #   | Recommendation                                                                                               | Impact | Effort |
| --- | ------------------------------------------------------------------------------------------------------------ | ------ | ------ |
| 1   | Extract `useModalPanel` + `DialogShell`; migrate `SignOutDialog`, `DeleteAccountDialog`, `PaywallSheet` (D1) | H      | M      |
| 2   | Add `useExclusiveAction`; replace the four hand-written guards (D2)                                          | M      | S      |
| 3   | Route `purchase-complete.tsx` through `usePurchases().confirm`; delete `hasEntitlement` (D3)                 | M      | S      |
| 4   | One `raceTimeout`, one `countUtf8Bytes`, one `readErrorCode` (D4)                                            | M      | S      |
| 5   | `findLanguageEntry`, `findDifficulty`; use `findBankEntry` in routes and `TopicStep`/`DifficultyStep` (D5)   | M      | S      |
| 6   | `config/readExtraString`; one `expo-constants` test helper (D6)                                              | M      | S      |
| 7   | Remove `expo-status-bar`; decide on `react-native-css-interop` (Dependencies)                                | L      | S      |
| 8   | Move `useClearOnBlur` to `state/` (D7)                                                                       | M      | S      |
| 9   | Fold `PUT` into `apiFetch`; delete `apiPut` (O1)                                                             | L      | S      |
| 10  | Move auth response parsers out of `AuthProvider.tsx` (Oversized files)                                       | M      | M      |
| 11  | `__mocks__/expo-router.ts` and a shared `settle()`; retire the 50 ms sleeps (Testing)                        | M      | M      |
| 12  | Drop the 7 unused `export` keywords, the dead `eslint-disable`, the synthetic `new Error` logs (O2, O3)      | L      | S      |
| 13  | Share `useReviewQueue`'s result across the home screen (Performance)                                         | L      | M      |

Items 2 through 9 and 12 together are about one working day and remove roughly 400 lines. Item 1 is the one worth doing first because it is the only place the duplication has already produced divergent behavior.
