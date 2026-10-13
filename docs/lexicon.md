## Domain vocabulary

One line per domain noun used in this codebase's names (files, functions, variables, data keys, routes, tables). Every term below is in code; each entry names the file that defines or first uses it, and the names it was chosen over. A new term is added in the PR that introduces it.

`language` and `difficulty` are not listed separately. A language is an entry in `content/manifest.json`'s `languages` list (`LanguageEntry`, id such as `python`); a difficulty is one of `DIFFICULTIES` in `@syntactical/content-schema` (`packages/content-schema/src/difficulties.ts`): `easy`, `medium`, `hard`, type `DifficultyId`. Never introduce `level`, `subject`, or `tier` as synonyms for either. `track` is not a synonym: it names the stats record for a language and difficulty pair (below).

`kind` (`LanguageEntry.kind`, `'language'` or `'topic'`, missing means `'language'`) tells a language track from a topic track. A topic track such as `backend-security` occupies the `language` slot: its manifest entry is a `LanguageEntry`, it plays under `app/[language]`, and its stats record is the track `backend-security:easy`.

### Content

- bank: the questions for one language and difficulty pair, stored as `content/<language>/<difficulty>.json` (`{ schemaVersion, questions }`) and loaded through `state/useQuestionBank.ts`. Chosen over `deck`, `pool`, `set` because the content files, the manifest's `banks` map, and `useQuestionBank` all use it.
- question: one item in a bank, discriminated by `question.type`: `'mc'` (multiple choice), `'bool'` (true/false), or `'ab'` (A/B); identified by `id` (`packages/content-schema/src/validateQuestionBank.ts`). Chosen over `card`, `item`; `Card` is reserved for the React components that render one (`components/quiz/`).
- choice: one answer option of an `mc` or `ab` question, `{ text, rationale?, misconceptionId? }` in `question.choices`, the correct one at `question.answerIndex` (`validateQuestionBank.ts`). Chosen over `option`, `answer`; `answer` is the boolean field of a `bool` question.
- query: the per-question reference shown in the query drawer, `question.query` = `{ title, explanation, syntax?, tags? }` (`components/query/QueryDrawer.tsx`). Chosen over `explanation`, `reference` because the original prompt named the feature "Query" (`docs/original-prompt.md`).
- rationale: on a wrong choice, the text explaining what a learner who picked it probably believed and why the runtime disagrees (`validateQuestionBank.ts`, rendered by the quiz cards). Chosen over `explanation`, which `query.explanation` already uses.
- topic: one subject group inside a bank, `question.topic`, with ids and labels per track in the manifest and in `pipeline/topics.json`; a round can be limited to one topic (`?topic=` in `app/[language]/[difficulty]/length.tsx`). Chosen over `category`, `section`; distinct from `query.tags`.
- criterion: on an `ab` question, the stated basis for "optimal" (`components/quiz/AbEvidence.tsx`, `validateQuestionBank.ts`). Chosen over `metric`, `rubric`.
- misconception: a named wrong belief from a per-track taxonomy, id `<language>.<kebab-slug>`, referenced by `choice.misconceptionId` and aggregated by the weakness report (`services/progress/types/WeaknessReport.ts`, `pipeline/taxonomy/`). Chosen over `mistake`, `error`, because `error` names runtime exceptions in question content.
- provenance: `question.provenance`, where a question came from and how it was checked: `source`, optional `model`, `promptVersion`, `runtimeVersion`, `validation: { method, status }`, `isHumanReviewed` (`validateQuestionBank.ts`; `components/quiz/VerifiedBadge.tsx` reads it). Chosen over `metadata`, `audit`.
- code block: the Prism-tokenized rendering of `question.code` or `query.syntax` as nested `Text` runs (`components/quiz/CodeBlock.tsx`, `services/codeBlock/tokenizeCode.ts`). Chosen over `snippet`, `syntax highlighter`.
- grammar: the Prism language id that highlights a track's code blocks, `LanguageEntry.grammar`, one of `GRAMMARS` (`packages/content-schema/src/grammars.ts`). Chosen over `syntax`, because `query.syntax` is a question field.
- manifest: `content/manifest.json` (`Manifest`): every track, its display fields, its grammar, its topics and misconceptions, and a bank entry per difficulty (`packages/content-schema/src/validateManifest.ts`). Chosen over `catalog`, `index`.
- bank entry: `manifest.languages[].banks[<difficulty>]` (`BankEntry`): `path`, `hash`, `access`, `productId`, `contentVersion`, `topicCounts` (`packages/content-schema/src/types/BankEntry.ts`). Chosen over `bank meta`.
- bank hash: the SHA-256 of a bank file's bytes, written into the bank entry by `npm run content:build` (`scripts/buildContentManifest.mjs`) and checked against downloaded bytes by `services/content/verifyBankHash.ts`. Chosen over `version`, `etag`.
- content version: `bankEntry.contentVersion`, a counter the pipeline increments on each publish of a bank (`packages/content-schema/src/findBankEntryProblem.ts`, `state/useQuestionBank.ts`). Chosen over reusing the bank hash, which people cannot read.
- bundled bank: the copy of a free bank shipped inside the app build (`services/content/bundledBanks.generated.ts`), used when no cached bank exists. Chosen over `default bank`, `seed`.
- cached bank: the last verified bank downloaded at runtime and stored on the device with its bank hash (`services/content/`). Chosen over `stored bank`, `local bank`.
- content base URL: the absolute URL the manifest and free banks are fetched from, `extra.contentBaseUrl` in `app.config.ts`. Chosen over `api url`, because paid banks come from the API base URL, a separate setting.
- bank access: `bankEntry.access`: `'free'` (easy banks, static host, bundled) or `'paid'` (medium and hard banks, served by `GET /v1/banks/:language/:difficulty` after an entitlement check; `packages/content-schema/src/types/BankEntry.ts`). Chosen over `tier` (forbidden above) and `plan`.
- product id: `bankEntry.productId`, the id of a paid bank's product, `syntactical.<language>.<difficulty>`, shared by the App Store, Play, and Web Billing through RevenueCat (`packages/content-schema/src/types/BankEntry.ts`, `server/src/types/PaidBank.ts`). Chosen over `sku`, `price id`.
- download indicator: the status line shown while a bank transfers (`components/layout/DownloadIndicator.tsx`). Chosen over `spinner`, `loader`.

### Play

- round: one pass through a shuffled list of questions, from the first question to the results screen (`state/useQuizEngine.ts`); a topic round plays one topic of a bank and a review round plays due questions. Chosen over `session`, `attempt`, because `session` is reserved for sign-in.
- round length: how many questions a round takes from its pool: 20, 50 (`ROUND_LENGTHS` in `constants/appConfig.ts`), or every question (`services/quiz/roundLength.ts`).
- review round: a round built from the review queue instead of a bank (`app/review.tsx`, `services/review/buildReviewQueue.ts`). Chosen over `review session`, `practice`.
- review state: the per-question `ts-fsrs` card (`due`, `stability`, `difficulty`, `reps`, `lapses`, `state`), rebuilt by replaying answer events (`packages/progress/src/buildReviewState.ts`, `services/review/types/ReviewQueue.ts`). Only a missed question gets a card. Chosen over `srs card`, `schedule`.
- weakness report: the on-device summary of the most-missed misconceptions (`services/progress/buildWeaknessReport.ts`, `components/stats/WeaknessReport.tsx`). Chosen over `insights`, and `analytics`, which names PostHog events.
- verified badge: the card label "Output verified on <runtime>", shown only when `provenance.validation` is `executed` and `passed` (`components/quiz/VerifiedBadge.tsx`). Chosen over `checkmark`, `trusted`.

### Progress

- stats: the device's stored learner record (`Stats`, `services/stats/types/Stats.ts`) under `STORAGE_KEY` (`syntactical.stats.v1`): totals, tracks, the answer streak, the goal history, and the answer event log; schema version 2, migrated from v1 by `services/stats/migrateStatsV1.ts`. Chosen over `progress` as the storage name, because the key is already shipped.
- track: the stats record for one language and difficulty pair, `stats.tracks[<language>:<difficulty>]` (`services/stats/types/LanguageDifficultyStats.ts`). Chosen over `course`, `path`; never a synonym for language or difficulty.
- answer streak: consecutive correct answers, reset by a wrong answer (`stats.answerStreak`, `services/stats/types/Stats.ts`). Chosen over plain `streak`, which the day streak makes ambiguous.
- day streak: consecutive calendar days, in the user's timezone, on which the daily goal was met (`packages/progress/src/computeDayStreak.ts`). Chosen over plain `streak`, `daily streak`.
- answer event: one answered question, recorded append-only with a client-generated UUID `eventId`, `questionId`, `bankKey`, `choiceIndex`, `isCorrect`, `answeredAt`, and `roundKind`; the unit of sync (`packages/progress/src/types/AnswerEvent.ts`, `server/src/routes/answerEvents.ts`). Chosen over `attempt`, `response`.
- XP: points per correct answer scaled by difficulty, plus a bonus for a correct due review (`packages/progress/src/computeXp.ts`). Chosen over `points`, `score`.
- daily goal: the XP target per calendar day, 10, 20, or 50 (`DAILY_GOALS` and `DEFAULT_DAILY_GOAL` in `packages/progress/src/constants.ts`; set in `app/settings.tsx`). Chosen over `daily target`, `quota`.
- daily progress: XP earned and whether the goal was met for one user on one local date (`packages/progress/src/computeDailyProgress.ts`; the server's `daily_progress` table, `server/migrations/`). Chosen over `day stats`.

### Accounts and purchases

- guest: a learner with no account; progress lives only on the device until the first sign-in uploads it (`state/useSyncQueue.ts`). Chosen over `anonymous user`.
- user: an account identified by email (`users` table, `server/migrations/`). Chosen over `account`, `member`.
- session: a sign-in session only: an opaque token whose SHA-256 is stored in `sessions`, carried in the `syntactical_session` cookie on the web or an `Authorization: Bearer` header on native (`server/src/routes/authSessions.ts`). Reserved so it never names a quiz pass.
- one-time code: the 6-digit sign-in code sent by email, stored only as a SHA-256 hash, single use (`one_time_codes` table, `server/src/routes/authCodes.ts`). Chosen over `OTP`, `magic code`, `PIN`.
- password: the optional secret a user may set beside the email code; never stored, logged, or kept on the device (`server/src/routes/authPasswordSessions.ts`, `authSignups.ts`, `mePassword.ts`). Chosen over `passphrase`, `PIN`.
- password hash: `users.password_hash`, a PHC-format scrypt string (`server/src/types/PasswordHashParams.ts`, `server/src/constants/auth.ts`). Chosen over `password digest`, `credential`.
- password policy: the length rule plus the breach check, applied at sign-up and at every password write, never at sign-in (`server/src/services/checkPasswordPolicy.ts`). Chosen over `password strength`.
- breach check: the Have I Been Pwned range lookup of a password's SHA-1 prefix, behind an interface (`server/src/clients/passwordBreachClient.ts`). Chosen over `pwned check`, `HIBP check`.
- sign-up: creating an account with an email and a password, finished by a one-time code (`POST /v1/signups`, `server/src/routes/authSignups.ts`). Chosen over `register`.
- auth method: `sessions.auth_method`, how a session was created: `'code'` or `'password'` (`server/src/services/insertSession.ts`). Chosen over `login type`, `provider`.
- fresh code sign-in: a session whose auth method is `'code'` and whose `created_at` is at most 10 minutes old; the only way to set a password without the current one (`server/src/routes/mePassword.ts`, `server/src/services/isFreshCodeSession.ts`). Chosen over `step-up`, `sudo mode`.
- entitlement: the right of one user to one paid bank, whichever platform it was bought on (`entitlements` table; `server/src/routes/banks.ts`). Chosen over `purchase` (the event) and `license`.
- purchase event: one RevenueCat webhook delivery, keyed by RevenueCat's event id (`purchase_events` table, `server/src/routes/revenueCatWebhook.ts`). Chosen over `transaction`, `order`.
- admin: a user with `users.is_admin`, set only in the database; an admin grants or revokes paid banks for their own account through `PUT /v1/admin/access` (`server/src/middleware/requireAdmin.ts`, `server/src/routes/adminAccess.ts`). Purchases always win over an admin grant.
- analytics event: one PostHog event from the fixed registry in `constants/analyticsEvents.ts` (`clients/analyticsClient.ts`). Chosen over `metric`, `log`.

### Content pipeline

- pipeline: the `pipeline/` workspace CLI that audits and enriches content at build time (`pipeline/src/commands/`: `validate`, `classify`, `gapFill`, `enrich`, `review`, `publish`, `draftOracles`, `draftTaxonomy`, `rewritePrompts`); no app or server code calls a model. Chosen over `generator`.
- oracle: the code (and optional setup SQL) whose execution output decides a question's answer (`pipeline/src/types/Oracle.ts`). Chosen over `check`, `test`, `probe`.
- runner: the per-language Docker image plus harness that executes an oracle with no network and fixed limits (`pipeline/runners/<id>/`, ids in `pipeline/src/types/OracleLanguage.ts`). Chosen over `sandbox` as an identifier.
- model provider: the pipeline interface (`ModelProvider`) over the Anthropic API (`pipeline/src/clients/`). Chosen over `llm client`, `ai service`.
- golden set: the fixed set of known-correct and deliberately wrong questions per runner that the validator must classify perfectly (`pipeline/golden/<id>.json`, `pipeline/src/__tests__/services/goldenSet.test.ts`). Chosen over `fixtures`.
- pipeline report: the JSON a pipeline run writes under `pipeline/reports/` (`pipeline/src/types/PipelineReport.ts`). Chosen over `stats file`, because `stats` names learner stats.
