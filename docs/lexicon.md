## Domain vocabulary

One line per domain noun used in this codebase's names (files, functions, variables, data keys, routes, tables). Each entry says whether the term is **in code** today or **planned** in `docs/superpowers/specs/2026-10-02-syntactical-v2-design.md`; a planned term becomes "in code" in the PR that introduces it.

`language` and `difficulty` are not listed separately. A language is an entry in `content/manifest.json`'s `languages` list (`LanguageEntry`, id such as `python`); a difficulty is one of `DIFFICULTIES` in `@syntactical/content-schema` (`packages/content-schema/src/difficulties.ts`) (`easy`, `medium`, `hard`, type `DifficultyId`). Never introduce `level`, `subject`, or `tier` as synonyms for either. `track` is not a synonym: it names the stats record for a language and difficulty pair (below).

`kind` (`LanguageEntry.kind`, `'language'` or `'topic'`, missing means `'language'`) tells a language track from a topic track. A topic track such as `backend-security` occupies the `language` slot: its manifest entry is a `LanguageEntry`, it plays under `app/[language]`, and its stats record is the track `backend-security:easy`.

### Content

- bank - in code - the questions for one language and difficulty pair, stored as `content/<language>/<difficulty>.json` (`{ schemaVersion, questions }`) and loaded through `useQuestionBank` - chosen over: `deck`, `pool`, `set` because the original data module named it `getQuestionBank`, and the content files, the manifest's `banks` map, and `useQuestionBank` kept the noun.
- question - in code - one item in a bank, discriminated by `question.type`: `'mc'` (multiple choice) or `'bool'` (true/false), with `'ab'` planned; identified by `id` (for example `py-easy-01`) - chosen over: `card`, `item`, and `kind` because `question.prompt`, `question.type`, `question.query`, and `useQuizEngine`'s `currentQuestion` already use this noun; `Card` is reserved for the React components that render one.
- choice - in code as a string, planned as `{ text, rationale?, misconceptionId? }` - one answer option of an `mc` (or planned `ab`) question, held in `question.choices` with the correct one at `question.answerIndex` - chosen over: `option`, `answer`, because `choices` and `answerIndex` are the existing field names and `answer` is the boolean field of a `bool` question.
- query - in code - the per-question reference shown in the query drawer, `question.query` = `{ title, explanation, syntax?, tags? }`, surfaced through `QueryDrawer` - chosen over: `explanation`, `reference` because the original spec named the feature "Query" (`docs/original-prompt.md`, requirement 4), and `QueryDrawer` and the "Query" button in `QuestionCardFrame` use the term.
- rationale - planned - on a wrong choice (or the wrong value of a `bool` question), the text explaining what a learner who picked it probably believed and why the runtime disagrees; at most 280 characters - chosen over: `explanation`, because `query.explanation` already names the question-level text.
- topic - planned - one of about 10 subject groups inside a bank, `question.topic`, with ids and labels listed per language in the manifest (`operators-and-types`, `numbers-and-math`, `strings`, `iterables`, `data-structures`, `functions-and-scope`, `errors-and-control-flow`, `async-and-concurrency`, `optimization`, `wtf`, plus `security` for Postgres) - chosen over: `category`, `section`, `chapter`; distinct from `query.tags`, which are free-form labels.
- criterion - planned - on an `ab` question, the stated basis for "optimal": `{ type: 'performance' | 'correctness' | 'readability', statement, evidence }` - chosen over: `metric`, `rubric`, because readability is not a metric and a rubric is only one of three evidence kinds.
- misconception - planned - a named wrong belief from a closed per-language taxonomy listed in the manifest, id `<language>.<kebab-slug>` (for example `python.mutable-default-args`), with a one-line description; referenced by `choice.misconceptionId` - chosen over: `mistake`, `error`, because `error` names runtime exceptions in question content.
- provenance - planned - `question.provenance`, where a question came from and how it was checked: `{ source: 'original' | 'generated', model?, promptVersion?, runtimeVersion?, validation: { method: 'executed' | 'judged', status }, isHumanReviewed }` - chosen over: `metadata`, `audit`.
- code block - in code - the Prism-tokenized rendering of `question.code` or `query.syntax` as nested `Text` runs by `CodeBlock` - chosen over: `snippet`, `syntax highlighter`, because `question.code` and `query.syntax` are the fields it renders.
- grammar - in code - the Prism language id that highlights a language's code blocks, `LanguageEntry.grammar`, one of `GRAMMARS` - chosen over: `syntax`, because `query.syntax` already names a question field.
- manifest - in code - `content/manifest.json` (`Manifest`): every language, its display fields, its grammar, and a bank entry per difficulty; planned additions are per-language `topics` and `misconceptions` - chosen over: `catalog`, `index`, because `index` named the original data module and `catalog` suggests a store listing.
- bank entry - in code - `manifest.languages[].banks[<difficulty>]` (`BankEntry`), today `{ path, hash }`; planned additions are `access`, `productId`, `contentVersion`, `topicCounts` - chosen over: `bank meta`.
- bank hash - in code - the SHA-256 of a bank file's bytes, written into the bank entry by `npm run content:build`, compared with the cached bank's hash to decide whether to download, and checked against downloaded bytes by `verifyBankHash` - chosen over: `version`, `etag`, because it is computed rather than maintained, and it is manifest data rather than an HTTP header.
- content version - planned - `bankEntry.contentVersion`, a human-facing counter the pipeline increments on each publish of a bank - chosen over: reusing the bank hash, which is not readable by people.
- bundled bank - in code - the copy of a bank shipped inside the app build (`BUNDLED_BANKS`), used when no cached bank exists; planned: free banks only - chosen over: `default bank`, `seed`, because `seed` implies a database.
- cached bank - in code - the last verified bank downloaded at runtime and stored on the device with its bank hash (`CachedBank`) - chosen over: `stored bank`, `local bank`.
- content base URL - in code - the absolute URL the manifest and free banks are fetched from, `extra.contentBaseUrl`, a build-time constant from `app.config.ts`; planned value `https://syntactical.dev/content/` - chosen over: `api url`, because paid banks come from the API base URL, which is a separate setting.
- download indicator - in code - the status line shown while a bank transfers (`DownloadIndicator`) - chosen over: `spinner`, `loader`, because it names what is happening rather than how it looks.

### Play

- round - in code - one pass through a shuffled list of questions, from the first question to the results screen (`QuizRound`, `useQuizEngine`); planned variants are a topic round (one topic of a bank) and a review round - chosen over: `session`, `attempt`, because `session` is reserved for sign-in and `useQuizEngine`'s `isComplete` and `ResultsScreen`'s Retry already model one pass as a unit.
- review round - planned - a round built from due review state items instead of a bank - chosen over: `review session` (session is reserved) and `practice`.
- review state - planned - the per-question and per-misconception `ts-fsrs` card (`due`, `stability`, `difficulty`, `reps`, `lapses`, `state`), rebuilt by replaying answer events, that the scheduler reads to build a review round - chosen over: `srs card`, `schedule`.
- weakness report - planned - the on-device summary of the most-missed misconceptions over the last 7 days, shown once at least 20 answers exist in that window - chosen over: `insights`, and `analytics`, which names PostHog events.
- verified badge - planned - the card label "Output verified on <runtime> <version>", shown only when `provenance.validation` is `executed` and `passed` - chosen over: `checkmark`, `trusted`.

### Progress

- stats - in code - the device's stored learner record (`Stats`) under `STORAGE_KEY` (`syntactical.stats.v1`): totals, tracks, and the answer streak; planned v2 adds the answer event log, XP, day streak, daily goal, and review state - chosen over: `progress` as the storage name, because the key is already shipped.
- track - in code - the stats record for one language and difficulty pair, `stats.tracks[buildStatsKey(...)]`, keyed `language:difficulty` (`LanguageDifficultyStats`) - chosen over: `course`, `path`; it is never a synonym for language or difficulty.
- answer streak - in code as `stats.streak` (`{ current, best }`) - consecutive correct answers, reset by a wrong answer (`recordAnswer`) - chosen over: plain `streak`, which v2 makes ambiguous; planned rename of the field to `answerStreak` in the v2 stats migration.
- day streak - planned - consecutive calendar days, in the user's timezone, on which the daily goal was met; derived on the server for signed-in users - chosen over: plain `streak` and `daily streak`.
- answer event - planned - one answered question, recorded append-only with a client-generated UUID `eventId`, `questionId`, `bankKey`, `choiceIndex`, `isCorrect`, `answeredAt`, and `roundKind`; the unit of sync - chosen over: `attempt` and `response`, because `attempted` already names a stats counter.
- XP - planned - points earned per correct answer, scaled by difficulty, with a bonus for due review answers; derived from answer events - chosen over: `points`, and `score`, which reads as one round's result.
- daily goal - planned - the XP target per calendar day: 10, 20, or 50 - chosen over: `daily target`, `quota`.
- daily progress - planned - XP earned and whether the daily goal was met for one user on one local date (`daily_progress` table) - chosen over: `day stats`.

### Accounts and purchases

- guest - planned - a learner with no account; progress lives only on the device until first sign-in uploads it - chosen over: `anonymous user`, because no user row exists.
- user - planned - an account identified by email (`users` table) - chosen over: `account`, `member`.
- session - planned - a sign-in session only: an opaque token whose SHA-256 is stored in `sessions`, carried in the `syntactical_session` cookie on web or an `Authorization: Bearer` header on native - chosen over: nothing; reserved so it never names a quiz pass.
- one-time code - planned - the 6-digit sign-in code sent by email, stored only as a SHA-256 hash, single use, valid for 10 minutes (`one_time_codes` table) - chosen over: `OTP`, `magic code`, `PIN`.
- password - in code on the server, app screens planned (spec "Password sign-in (2026-10-05)") - the optional secret a user may set beside the email code; 12 to 128 code points after NFKC; never stored, logged, or kept on the device - chosen over: `passphrase`, `PIN`, because platform autofill and the HTML `autocomplete` values say password.
- password hash - in code - `users.password_hash`, a PHC-format scrypt string `$scrypt$v=1$ln=17,r=8,p=1$<salt>$<key>` - chosen over: `password digest`, and `credential`, which would also cover codes and session tokens.
- password policy - in code - the length rule plus the breach check, applied at sign-up and at every password write, never at sign-in - chosen over: `password strength`, because there is no strength meter or composition rule.
- breach check - in code - the Have I Been Pwned range lookup of a password's SHA-1 prefix, result `'breached' | 'clear' | 'unknown'` - chosen over: `pwned check`, `HIBP check`, because the vendor sits behind an interface.
- sign-up - in code - creating an account with an email and a password, finished by a one-time code (`signUp` in identifiers, `signups` in route paths) - chosen over: `register`, `registration`.
- auth method - in code - `sessions.auth_method`, how a session was created: `'code'` or `'password'` - chosen over: `login type`, `provider`, because there is no identity provider.
- fresh code sign-in - in code - a session whose auth method is `'code'` and whose `created_at` is at most 10 minutes old; the only way to set a password without the current one - chosen over: `step-up`, `sudo mode`, `reauth`, because it names exactly what qualifies.
- bank access - planned - `bankEntry.access`: `'free'` (Easy banks, static host, bundled) or `'paid'` (Medium and Hard banks, served by the API after an entitlement check) - chosen over: `tier`, which this lexicon forbids as a difficulty synonym, and `plan`, which implies a subscription.
- product id - planned - `bankEntry.productId`, the id of a paid bank's product, `syntactical.<language>.<difficulty>` - chosen over: `sku`, `price id`, because one id maps to App Store, Play, and web billing products through RevenueCat.
- entitlement - planned - the right of one user to one paid bank, whichever platform it was bought on (`entitlements` table) - chosen over: `purchase` (the event) and `license`.
- purchase event - planned - one RevenueCat webhook delivery (App Store, Play, or web billing), keyed by RevenueCat's event id (`purchase_events` table); email and name fields are nulled on account deletion - chosen over: `transaction`, `order`.
- analytics event - planned - one PostHog event from the fixed registry in `constants/analyticsEvents.ts` - chosen over: `metric`, and `log`, which names structured warnings from `logWarning`.

### Content pipeline

- pipeline - planned - the `pipeline/` workspace CLI that audits and enriches content at build time through the stages `validate`, `classify`, `gap-fill`, `enrich`, `review`, `publish`; no app or server code calls a model - chosen over: `generator`, because its first job is auditing.
- oracle - planned - the code (and optional setup SQL) whose execution output decides a question's answer - chosen over: `check`, `test`, `probe`, because "test" collides with the test suites.
- runner - planned - the per-language Docker image plus harness that executes an oracle with no network and fixed CPU, memory, process, and time limits - chosen over: `sandbox` as an identifier; "sandbox" stays prose for the isolation property.
- model provider - planned - the pipeline interface (`ModelProvider`) over `claude -p` and the Anthropic API key path - chosen over: `llm client`, `ai service`, because it is the seam that swaps providers.
- golden set - planned - the fixed set of known-correct and deliberately wrong questions the validator must classify perfectly - chosen over: `fixtures`, which names test inputs in general.
- pipeline report - planned - the JSON each pipeline run writes under `pipeline/reports/`: per-question outcome, rejection reasons, agreement rates - chosen over: `stats file`, because `stats` names learner stats.
