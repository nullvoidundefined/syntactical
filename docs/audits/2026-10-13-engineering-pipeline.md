# Engineering audit: content pipeline and content packaging (2026-10-13)

Scope: `pipeline/` (src, runners, prompts, taxonomy, golden, topics.json), `packages/content-schema/`, `content/` (structure and validation only), `scripts/` (build scripts and their tests). The client app and `server/` are covered by other dispatches. Goal: evidence-backed refactor, simplification, and cleanup opportunities, ranked by value to effort.

Effort scale: S < 1 h, M half a day, L multi-day. Confidence: HIGH-CONFIDENCE (verified by reading the cited lines and a grep or a run) or SPECULATIVE (plausible, needs the stated confirmation).

## Ranked cleanup opportunities (top 10 by value to effort)

| #   | Opportunity                                                                                                                                                                                                          | Value       | Effort | Confidence                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------ | ------------------------------------------------------------------------ |
| 1   | Delete the dead "judged route" cluster (judge services, Codex provider, source fetcher, page-text worker, two prompts, `parse5`)                                                                                     | High        | M      | HIGH-CONFIDENCE                                                          |
| 2   | Fix `pipeline review` for topic tracks: it lists only `disputed` items, and nothing writes disputed files any more, so topic-track review files are always empty                                                     | High        | S      | HIGH-CONFIDENCE (read; confirm by running review on a staged topic bank) |
| 3   | Delete the dead A/B validators (`services/ab/*`, `types/ab/*`, `judgeReadabilityAb.md`)                                                                                                                              | Medium-High | S-M    | HIGH-CONFIDENCE                                                          |
| 4   | Delete the one-shot v1 migration (`commands/migrateV1.ts`, two services, two tests, `fixtures/v1-content`)                                                                                                           | Medium      | S      | HIGH-CONFIDENCE                                                          |
| 5   | One `loadValidatedManifest` + `listBankEntries` + `readBankQuestions` helper set; nine commands repeat the same 10-line preamble and 20 sites repeat the languages/banks loop                                        | High        | M      | HIGH-CONFIDENCE                                                          |
| 6   | One JSON read/write helper set: three atomic-write implementations, two identical optional-JSON readers, eight inline ENOENT try/catch blocks                                                                        | Medium      | S      | HIGH-CONFIDENCE                                                          |
| 7   | Provider consistency and cost control: restore the consecutive-failure stop that #115 deleted, classify Anthropic SDK transient errors, honor `--api` for `rewrite-prompts`, one model id source                     | Medium-High | S-M    | HIGH-CONFIDENCE                                                          |
| 8   | One source of truth for the runner id list (five hand-copied lists; the golden-set test omits `typescript`)                                                                                                          | Medium      | S      | HIGH-CONFIDENCE                                                          |
| 9   | Gitignore the pipeline's staging output dirs (`reports/`, `oracles/`, `generated/`, `classifications/`, `enrichment/`, `review-queue/`, `review/`, `taxonomy/*.draft.json`)                                          | Medium      | S      | HIGH-CONFIDENCE on state, SPECULATIVE on risk                            |
| 10  | Test-suite hygiene: shared fixture helpers (12 copies of `writeJson`, 3 of `mcCard`/`boolCard`, 20 hand-built manifests), remove the wall-clock assertion that failed in this run, make Docker suites opt-in locally | Medium      | M      | HIGH-CONFIDENCE                                                          |

Small nits worth folding into whichever of the above touches the file: double schema validation of model output (`generateBatch.ts:86`, `rewritePrompts.ts:53`), batch-size constants duplicated between `generateBatch.ts:24` and `fillBank.ts:57-58`, `readSourceQuestions` taking a list that always has one element, two stale comments pointing at deleted code.

## Coverage

| Surface                                                                                  | How checked                                                                                                                  | Notes                                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pipeline/src` (commands, services, clients, types)                                      | executed + read                                                                                                              | `npm run typecheck -w pipeline` exit 0; `npm test -w pipeline` 1170 passed, 1 failed (timing assertion, see Testing), 220 s because Docker suites ran            |
| `pipeline/runners/*`                                                                     | executed (through the Docker suites and the golden set) + read (node, typescript harnesses in full; others by size and diff) | 9 Docker suites ran against real images; `SKIP_DOCKER_TESTS` was not set                                                                                         |
| `pipeline/prompts/*.md`                                                                  | read                                                                                                                         | all 10 templates read; callers traced                                                                                                                            |
| `pipeline/taxonomy`, `topics.json`, `golden/*.json`                                      | read + executed (golden set replays)                                                                                         | typescript has no golden file                                                                                                                                    |
| `packages/content-schema`                                                                | executed + read                                                                                                              | `npm run typecheck` exit 0; `npm test` 539 passed; `npm run build` ran inside `content:build`                                                                    |
| `content/`                                                                               | executed + read                                                                                                              | `npm run content:build` exit 0 and `git status` clean afterwards (deterministic); field inventory over all 10 free banks (1002 questions) via a throwaway script |
| `scripts/*.mjs` and `scripts/__tests__`                                                  | executed + read                                                                                                              | `npx jest scripts/__tests__` 63 passed                                                                                                                           |
| Pipeline CLI commands end to end (`classify`, `gap-fill`, `enrich`, `publish`, `review`) | not covered                                                                                                                  | every one needs a model or Docker; the Anthropic API was never called, per the dispatch                                                                          |
| Credential exposure: working tree + git history of scoped paths                          | executed                                                                                                                     | 0 matches (see section)                                                                                                                                          |
| Credential exposure: session transcripts, shell history, vendor CLI caches               | not covered                                                                                                                  | outside this dispatch's scope; the consolidating process owns them                                                                                               |
| Client app, `server/`                                                                    | not covered                                                                                                                  | other dispatches                                                                                                                                                 |

## Executive summary

The pipeline is small (6.4k source lines) and heavily tested (13.3k test lines), typechecks, and the content build is deterministic. The main cost is dead weight left behind by the 2026-10-05 pivot to batch generation (#115): the judged route (Claude + Codex blind answers, allowlisted source fetching, parse5 page parsing, worker-thread isolation) and the A/B validators are still in the tree with their tests (about 1,700 source lines and 8,600 test lines across both clusters plus the v1 migration) but have no production caller. One behavioral bug fell out of that pivot: topic-track review is scoped to disputed cards that nothing produces any more. The second cost is repetition: nine commands each re-implement manifest loading, paid-root checks, bank iteration, and JSON I/O.

Top three priorities:

1. Decide the fate of the judged route and A/B validators (keep as a documented, tested-but-unwired library, or delete). Until decided, every refactor pays to keep them compiling and green, and the only test failure in this run is inside them.
2. Fix topic-track review scope (`pipeline/src/commands/review.ts:78`), then run `pipeline review` on a staged topic bank to confirm items appear.
3. Collapse the command preamble and JSON I/O into shared helpers, which also closes the one inconsistency where `validate` trusts an unvalidated manifest.

## Operational basics (for a build-time pipeline)

| Check                       | Result                                                                                                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typecheck                   | yes: pipeline and content-schema exit 0                                                                                                                                                  |
| Unit tests run              | yes: 1170/1171 pipeline (1 timing failure), 539/539 schema, 63/63 scripts                                                                                                                |
| CI wires these              | yes: `.github/workflows/ci.yml:23` runs `content:build` and fails on manifest drift; `:38-40` runs workspace typecheck and tests; `:84` runs the Docker runner suites and the golden set |
| Content build deterministic | yes: `content:build` left no diff                                                                                                                                                        |
| Rollback                    | content is committed JSON; rollback is `git revert`. Paid banks are pinned by `content/paid-content.ref` (one sha, tested by `scripts/__tests__/paidContentRef.test.ts`)                 |
| Monitoring                  | not applicable; the pipeline writes `pipeline/reports/<stage>-<runId>.json` and `latest.json` per run                                                                                    |

No blocker in this scope.

## Findings

### Dead code

**F1. The judged route has no production caller.** HIGH-CONFIDENCE. Effort M. Risk: the owner may intend to revive it for the 300 `judged/pending` original questions; git history keeps it either way.

`judgeQuestion` (`pipeline/src/services/judge/judgeQuestion.ts:65`) is imported only by its own test. `git log -S judgeQuestion -- pipeline/src/commands pipeline/src/services/gapFill` shows it was wired into gap-fill in #79 and unwired in #115 ("batch question generation", 2026-10-05), which deleted `evaluateDraft.ts`, `generateQuestion.ts`, `gapFillJudged.test.ts`, and `prompts/generateSecurityQuestion.md` but kept everything the judge depended on. Files with zero non-test importers (confirmed by grep over `pipeline/src`, `scripts`, app, and server):

- `services/judge/`: `judgeQuestion.ts`, `verifySources.ts`, `extractPageText.ts`, `extractPageTextIsolated.ts`, `pageTextWorker.ts`, `normalizeQuoteText.ts`, `buildBlindAnswerPrompt.ts`, `buildConsistencyPrompt.ts`, `blindAnswerSchema.ts`, `consistencySchema.ts`, `JUDGE_PROMPT_VERSION.ts`
- `clients/`: `codexCliProvider.ts` (`createCodexCliProvider`, `assertCodexReady`, `buildCodexEnv`), `sourceFetcher.ts`, `checkSourceUrl.ts`, `isPublicAddress.ts`, `SOURCE_ALLOWED_HOSTS.ts`, `SOURCE_FETCH_LIMITS.ts`
- `types/judge/JudgeDeps.ts`, `types/judge/JudgeOutcome.ts`, `types/SourceFetchResult.ts`
- `prompts/blindAnswer.md`, `prompts/judgeConsistency.md`
- dependency `parse5` (`pipeline/package.json:18`): only `extractPageText.ts:11` imports it

Only `readDisputedCards.ts` is still called, by `publish/readDisputedQuestions.ts:10` and `review/readBankInputs.ts:80`, to read `disputed/<language>/<difficulty>.json`. Nothing writes that file: `grep -rn disputed pipeline/src` outside judge/ shows readers only. `FillBankResult.disputed` (`types/FillBankResult.ts:3`) is never set, so `gap-fill-disputed` in the report (`commands/gapFill.ts:60`) is always 0.

Stale comment: `clients/SOURCE_ALLOWED_HOSTS.ts:2` says "Keep pipeline/prompts/generateSecurityQuestion.md in step (a test checks it)"; that prompt was deleted in #115.

Fix direction: delete the cluster plus its tests (`__tests__/services/judge/*`, `__tests__/clients/{sourceFetcher,checkSourceUrl,isPublicAddress,sourceAllowlistPrompt,codexCliProvider}.test.ts`), drop `parse5`, and either delete `readDisputedCards` and the `disputed` branches in publish/review (`publishBank.ts:36-38`, `readBankInputs.ts:79-83`, `buildReviewItems.ts:51-56,72`, `renderReviewItem.ts:33-52`, `types/review/DisputedFacts.ts`) or keep them behind a documented "disputed files are written by hand" contract. To confirm: whether `docs/superpowers/specs/2026-10-04-topic-tracks-design.md` still plans a judged path for non-executable cards.

**F2. The A/B validators have never been wired into a command.** HIGH-CONFIDENCE. Effort S-M. Risk: 12 `ab` cards exist in content (all `judged/pending`, awaiting human approval per `docs/session-handoff/session-handoff.md:38`); the specs describe these validators.

`benchmarkAb` (`services/ab/benchmarkAb.ts:113`), `validateCorrectnessAb` (`validateCorrectnessAb.ts:97`), `judgeReadabilityAb` (`judgeReadabilityAb.ts:59`), `applyAbResult` (`applyAbResult.ts:21`) and their helpers (`buildBenchOracle`, `readAbSnippets`, `readBenchSamples`, `medianOf`, `AB_BENCH`, `AB_MIN_RATIO`, `buildReadabilityPrompt`, `prompts/judgeReadabilityAb.md`, `types/ab/*`) have no importer outside `__tests__/services/ab/*` and `__tests__/services/oracleRunPath.test.ts:15-18`. `git log -S "validateCorrectnessAb(" -- pipeline/src/commands pipeline/src/cli.ts` is empty: no command ever called them since #28 added them. Deleting them means trimming the A/B cases out of `oracleRunPath.test.ts` (the sandbox-path security test), which is the only coupling.

**F3. One-shot v1 migration still shipped.** HIGH-CONFIDENCE. Effort S.

`commands/migrateV1.ts:1-3` says it "ran once on 2026-10-03 and the committed content is now v2"; it is not registered in `cli.ts`. Delete it with `services/migrateBankV1.ts`, `services/migrateManifestV1.ts`, their two tests, and `__tests__/fixtures/v1-content/` (10 files; only those two tests read it).

**F4. Package entry exports a constant with one vacuous test.** HIGH-CONFIDENCE. Effort S.

`pipeline/src/index.ts` exports only `PACKAGE_NAME`; `__tests__/index.test.ts` asserts the string. CI's workspace import check (`ci.yml:37`) checks content-schema and progress, not pipeline. Same pattern in `packages/content-schema/src/__tests__/index.test.ts` and `exports.test.ts` (asserts `toHaveProperty` on 10 names). `QUESTION_TYPES` (`packages/content-schema/src/questionTypes.ts`) has zero consumers outside that export test.

### Duplication

**F5. Nine commands repeat the same manifest preamble; 20 sites repeat the bank loop.** HIGH-CONFIDENCE. Effort M. Risk: low; the command tests exercise every path.

`readJson` is defined locally in `commands/gapFill.ts:45`, `classify.ts:47`, `enrich.ts:47`, `validate.ts:37`, `migrateV1.ts:13`, `draftTaxonomy.ts:24`, `draftOracles.ts:27`, `publish.ts:48`, `review.ts:43`. The block

```ts
const checked = validateManifest(await readJson(join(contentDir, 'manifest.json')));
if ('rule' in checked) throw new Error(`Manifest rejected: ${sanitizeLogText(checked.rule)}`);
const { languages } = checked.manifest;
if (languages.some(({ banks }) => Object.values(banks).some(({ access }) => access !== 'free'))) {
  await assertContentRootUsable(contentRoot, pipelineDir, contentDir);
}
```

appears at `classify.ts:90-98`, `gapFill.ts:78-86`, `enrich.ts:58-69`, `publish.ts:72-82`, `review.ts:53-62`, `rewritePrompts.ts:31-40` (with an extra wrap), and in reduced form at `draftTaxonomy.ts:33-36`, `draftOracles.ts:61-65`. The outlier is `validate.ts:57`: `(await readJson(...)) as Manifest` with no validation, although it joins the same manifest paths into file paths (`:62-65`) that every sibling comments as "untrusted". `for (const { banks, id } of languages) for (const [difficulty, entry] of Object.entries(banks))` plus `bankKey = \`${languageId}/${difficulty}\`` occurs 20 times across commands, services, and scripts (`scripts/buildContentManifest.mjs:33-37`already has`listBankEntries`; `assertNoPaidBanks.mjs:11`has`listPaidEntries`; `writeRouteEntries.mjs:37-45`loops by hand).`resolveBankOutputRoot`exists but`classify.ts:123`and`publish.ts:104`inline`access === 'free' ? pipelineDir : contentRoot`. `isFilePresent`is duplicated between`publish.ts:52-54`and`buildContentManifest.mjs:92-94`.

Fix direction: `services/content/loadValidatedManifest.ts` (read, validate, throw with sanitized rule, return `{ manifest, hasPaidBanks }`), `listBankEntries(manifest)` yielding `{ languageId, difficulty, bankKey, entry }`, and `readBankQuestions(file)`. To confirm: whether `validate` should also refuse an invalid manifest (it would after this change; `validate.test.ts` needs a case).

**F6. Three atomic writers, two identical optional readers, eight inline ENOENT handlers.** HIGH-CONFIDENCE. Effort S.

- Writers: `services/writeFileAtomic.ts` (uuid temp, cleans up on failure); `services/writePipelineReport.ts:18-22` private `writeAtomic` (temp name `tmp-<pid>`, no cleanup, so a failed write leaves `latest.json.tmp-<pid>` behind); `services/classify/writeJsonAtomic.ts` (mkdir + stringify + writeFileAtomic). Callers that re-implement `JSON.stringify(v, null, 2) + '\n'` with their own `mkdir`: `draftOracles.ts:49-50`, `publish/publishBank.ts:64-68`, `commands/rewritePrompts.ts:84`, `migrateV1.ts:17-19`.
- Readers: `services/gapFill/readJsonIfPresent.ts` and `services/review/readOptionalJson.ts` have the same body. The same ENOENT try/catch is inlined in `enrich/readEnrichment.ts:16-24`, `enrich/readTaxonomy.ts:17-25`, `classify/readLatestReport.ts:18-26`, `readExistingOracles.ts:25-33`, `createOracleSource.ts:16-24`, `review/reviewBank.ts:42-51`, `commands/rewritePrompts.ts:51-65`, `publish/readSourceQuestions.ts:8-16`.

Fix direction: keep `writeJsonAtomic` and `readJsonIfPresent`, route everything through them, and give `writePipelineReport` the shared writer. To confirm: none of the inline sites need to distinguish "not JSON" from "missing" differently than the shared reader does (they all throw on non-JSON already).

**F7. Model output is schema-checked twice.** HIGH-CONFIDENCE. Effort S.

`generateWithRetries.ts:60-63` already returns `schema.safeParse(json).data`. `services/gapFill/generateBatch.ts:78-87` passes `schema: batchSchema` and then runs `batchSchema.safeParse(value)` again and throws `ModelOutputInvalid(PROMPT_VERSION, 'expected a cards array')`, which cannot fire. `services/gapFill/rewritePrompts.ts:41-54` does the same with `replySchema`.

**F8. Five hand-copied runner id lists.** HIGH-CONFIDENCE. Effort S.

`types/OracleLanguage.ts:1` (union), `clients/dockerRunner.ts:20` (`LANGUAGES` array), `services/readExistingOracles.ts:16` (`z.enum([...])`), `services/RUNNER_GRAMMARS.ts:6-15` (keys), `__tests__/services/goldenSet.test.ts:31` (`LANGUAGES` without `typescript`). Because the test list omits `typescript` and `pipeline/golden/typescript.json` does not exist, the B-9 golden guarantee ("every runner classifies its golden set correctly") does not hold for the newest runner. Fix direction: `export const ORACLE_LANGUAGES_IDS = [...] as const` with `OracleLanguage = typeof ...[number]`, derive the other four, and add a typescript golden file. To confirm: whether the golden test should iterate the constant (then a missing golden file fails loudly).

**F9. Prompt templates are filled three ways.** HIGH-CONFIDENCE. Effort S.

`services/enrich/fillTemplate.ts` is the safe one-pass filler. `classify/buildClassifyPrompt.ts:13-15`, `buildDraftPrompt.ts:16-18`, and `taxonomy/buildTaxonomyPrompt.ts:17-21` use chained `.replace('{{X}}', () => ...)`. The chains are safe only because the untrusted `QUESTION_DATA` is substituted last; reordering a line would let question text that contains `{{LANGUAGE}}` be rewritten. `serializeQuestionData.ts:10` and `ab/buildReadabilityPrompt.ts:17` inline `.replaceAll('<', '\\u003c')` instead of `escapeForPrompt`. Fix direction: every builder uses `fillTemplate` + `escapeForPrompt`.

**F10. Two CLI providers duplicate their environment and limit code.** HIGH-CONFIDENCE. Effort S (moot if F1 deletes the Codex provider).

`claudeCliProvider.ts:18-24` and `codexCliProvider.ts:17-23`: `KIBIBYTE`, `MAX_STDOUT_BYTES`, `*_TIMEOUT_MS = 300_000`, `PASSED_ENV_NAMES`, and `buildCliEnv`/`buildCodexEnv` differ only in the prefix list.

**F11. Batch sizing constants live in two places.** HIGH-CONFIDENCE. Effort S.

`generateBatch.ts:24` `MAX_BATCH_SIZE = 10`; `fillBank.ts:57-58` `batch < 2` and `Math.min(10, needed)`. `TARGET_QUESTIONS_PER_TOPIC.ts`, `MAX_PROMPT_LENGTH.ts`, `MAX_REWRITTEN_PROMPT_LENGTH.ts`, `GENERATE_RUN_LIMITS.ts`, `CLASSIFY_CONFIDENCE_MIN.ts` are one-line modules each with a single importer.

**F12. Runner harnesses share about 60 percent of their text.** SPECULATIVE on net value. Effort M. Risk: this is security-reviewed PID 1 hardening; a change needs the security review.

`runners/node/harness.mjs` (140 lines) and `runners/typescript/harness.mjs` (155) differ by 63 lines; `runners/jsdom/harness.mjs` by 41; `runners/ruby/harness.rb` and `runners/rails/harness.rb` by 9. The PID 1 probe, signal no-ops, `classify`, `killGroup`, and the output caps are identical. A shared core would need to be copied into each build context because `runnerImageTag.ts:14-15` hashes the per-runner directory. Leave unless a harness bug has to be fixed in three places.

### Over-abstraction and inconsistency

**F13. `readSourceQuestions` takes a list that always has one element.** HIGH-CONFIDENCE. Effort S. `publish.ts:107` calls `readSourceQuestions([isFree ? publicFile : privateFile])`; the "first of files that exists" loop in `publish/readSourceQuestions.ts:8-16` is dead.

**F14. One-line wrappers.** SPECULATIVE on value (repo convention is one export per file). `services/classify/removeFileIfPresent.ts` wraps `rm(file, { force: true })`; `services/gapFill/countQuestionsNeeded.ts` is one `Math.max` with its own test file; `services/pickProviderKind.ts`, `services/exitCodeFor.ts`, `services/resolveBankOutputRoot.ts` (inlined anyway at `classify.ts:123`, `publish.ts:104`).

**F15. Provider behavior differs by path.** HIGH-CONFIDENCE. Effort S-M.

- Model id: `anthropicApiProvider.ts:8` hard-codes `DEFAULT_MODEL = 'claude-opus-5-5'` (override `PIPELINE_MODEL`); `claudeCliProvider.ts:94-108` passes no `--model`, so `provenance.model` depends on the operator's `claude` default. One config value should feed both.
- Transient errors: only the CLI path raises `ProviderTransientError` (`createSpawnExec.ts:29,51`). The API path lets SDK errors (429, 529, network) escape as plain `Error`, which `fillBank.ts:63-64` and `enrichBank.ts:40` treat as fatal and abort the run (after staging partial results). To confirm: whether the SDK's built-in 2 retries are enough for a full gap-fill run.
- Lost safety stop: `codexCliProvider.ts:64-65` says gap-fill "stops on its own after a streak", but #115 deleted `MAX_CONSECUTIVE_PROVIDER_FAILURES.ts` and `grep -rn streak pipeline/src` finds only that comment. With a provider that fails every call, `fillBank.ts:55-69` breaks out of one topic's loop and moves to the next topic, then the next bank: up to 10 tracks x 3 banks x ~10 topics = ~300 paid-but-wasted calls before the command ends. Restore a run-level consecutive-failure cap.
- `runCli.ts:185-191`: `rewrite-prompts` always calls `createProvider('cli')` and ignores `--api`; the usage string at `:199` also omits it. Every other model command honors `pickProviderKind(argv)`. `runCli.test.ts` does not cover `rewrite-prompts` at all (only a stub at `:66`).

### Correctness bugs noticed in passing

**F16. Topic-track review is always empty.** HIGH-CONFIDENCE by reading; confirm by running. Effort S.

`commands/review.ts:78` sets `scope: kind === 'topic' ? 'disputed' : 'all'`, and `services/review/buildReviewItems.ts:72` skips every item without the `disputed` kind under that scope. Disputed cards were only produced by the judged route (F1), which #115 unwired, so for `backend-security` and `frontend-security` the review file lists zero items: generated cards, review-queue entries, failed validations, and enrichment for those tracks never reach the owner through `pipeline review`. Fix direction: drop the `scope` parameter (or key it on something that still exists). To confirm: run `pipeline review` with a staged `generated/backend-security/easy.json` and check `review/backend-security-easy.md`.

**F17. `validate` trusts the manifest it reads.** HIGH-CONFIDENCE. See F5; `validate.ts:57`.

**F18. `generateBatch.ts:90` dead fallback.** HIGH-CONFIDENCE. `new Set(args.existingKeys ?? existingPrompts)` mixes two key spaces (normalized prompt+code keys vs raw prompts); `fillBank.ts:61` always passes both, so the fallback never runs. Make `existingKeys` required.

### Schema and data

**F19. The strict publish gate does not apply to committed content.** HIGH-CONFIDENCE on the facts; the remedy is an owner decision.

`scripts/buildContentManifest.mjs:56-62` validates banks with the lenient `validateQuestionBank`; `validateBankForPublish` runs only inside `pipeline publish` (`publishBank.ts:54`). Inventory of the 10 committed free banks (1002 questions): 300 are `validation: judged/pending` with `isHumanReviewed: false` (the 312 `source: original` minus the 12 `ab` cards), 312 have no `topic` (python, postgres, javascript: all 104 each; their manifest entries have `topics: []` and depend on `pipeline/topics.json` at classify/publish time), and only 29 choices carry a `misconceptionId` although five approved taxonomies exist. Every one of those 300 would be refused by `validateBankForPublish` (`validation-pending`, `missing-topic`). So either the gate is aspirational for the three oldest languages or those banks are ahead of the pipeline that is supposed to produce them. Fields in banks and the schema agree otherwise: every key path found in content is described by `types/Question.ts`, `Choice.ts`, `Query.ts`, `Provenance.ts`, `Criterion.ts`; no schema field is absent from content except `provenance.validation.evidence` (judged route) and `choices[].code` outside `ab` cards.

**F20. Topics have two sources of truth until a publish.** HIGH-CONFIDENCE. `pipeline/topics.json` (8 languages) is the fallback only when a manifest entry has `topics: []` (`classify/pickTopics.ts`); `publish/fillEmptyTopics.ts` copies it into the manifest on the first successful publish. Seven of ten tracks already carry topics in the manifest. Once python, postgres, and javascript are classified and published, `topics.json` can be deleted and `pickTopics`, `readFallbackTopics`, `fillEmptyTopics`, `labelTopic` with it. Runner ids (F8) and the taxonomy list (`pipeline/taxonomy/<id>.json`, read by both `enrich/readTaxonomy.ts` and `buildContentManifest.mjs:210-245`) are the other lists; the taxonomy flow is coherent (approved file is the source, manifest is the projection filtered to linked ids).

**F21. Manifest build determinism.** HIGH-CONFIDENCE: `content:build` produced no diff, and `ci.yml:23` enforces it on every PR. `hashAllBanks` runs under `Promise.all` but writes per-entry fields, so order cannot leak into output.

### Cost and robustness of the generation loop

- Retries are bounded: `generateWithRetries.ts:10` `MAX_ATTEMPTS = 3` for parse/schema failures, and both batch callers set `maxAttempts: 1`. There is no retry on transport errors in either provider beyond the SDK's own. No concurrency anywhere (every loop is sequential), so no cap is needed.
- Idempotency: `fillBank` dedupes against existing + staged keys (`fillBank.ts:50-51`), `enrichBank` resumes from its staging file (`enrichBank.ts:23-30`), `draftOracles` merges (`draftOracles.ts:46-51`), `classifyBank` rewrites the whole classifications file each run (`classifyBank.ts:68`) and re-classifies every question twice: a rerun on an already classified bank repays 2 calls per question. To confirm: whether a resume check (skip ids already in `classifications/<lang>/<diff>.json`) is wanted.
- Partial writes: every staging write goes through a rename (`writeFileAtomic`, `writeJsonAtomic`), and `fillBank.ts:90-106`, `draftOracles.ts:102-114`, `gapFill.ts:135-147` stage partial results in `finally`. Only `writePipelineReport`'s private writer skips cleanup (F6).
- The missing run-level failure cap (F15) is the one real cost hazard.
- Hard-coded model id (F15).

### Testing

- 1 failure in this run: `__tests__/services/judge/extractPageTextVisibility.test.ts:172-177` asserts wall-clock `< PAGE_PARSE_TIMEOUT_MS / 2` (1000 ms) and measured 1565 ms while nine Docker suites and another agent's test run shared the machine. It is inside the dead cluster (F1); if kept, assert on the parser's push count instead of time.
- Docker suites run by default: `npm test -w pipeline` took 220 s; 9 files gate on `SKIP_DOCKER_TESTS=1` (opt-out) with a 600 s lock wait (`fixtures/dockerTestLock.ts:18`). CI already runs them separately (`ci.yml:84`); making them opt-in locally (`RUN_DOCKER_TESTS=1`) would cut the default run to about 10 s. SPECULATIVE on preference.
- Duplicated helpers (HIGH-CONFIDENCE): `writeJson` defined in 12 test files, `readJson` in 6, `buildManifest` in 3, `mcCard`/`boolCard`/`buildOracle` copied verbatim between `__tests__/commands/gapFillBatch.test.ts:30-62` and `__tests__/services/gapFill/generateBatch.test.ts:23-58`; 20 test files hand-build a full manifest fixture (`glyph`, `tagline`, 64-char hash). The only shared fixture module is `fixtures/dockerTestLock.ts`. A `fixtures/content.ts` with `buildManifest`, `writeJson`, `mcCard`, `boolCard`, and `scriptedProvider` would remove several hundred lines.
- Mock-count assertions: only `__tests__/clients/modelProvider.test.ts:46,65,77,194,231` (`toHaveBeenCalledTimes`), and there the count is the behavior under test (retry attempts). Acceptable.
- `vi.mock` of real modules in 4 files (`ensureRunnerImage`, `sourceFetcher` x2, `oracleRunPath`); the last is the sandbox-path security test and is appropriate.
- No test calls the Anthropic API (grep for `new Anthropic`, `ANTHROPIC_API_KEY`, `api.anthropic.com` in tests: none).
- Golden tests would fail: each golden entry replays a recorded run and also runs against the real runner (`goldenSet.test.ts:98`); at least half the entries are deliberately wrong. Sound. Gap: no typescript golden file (F8).
- Meta tests in `scripts/__tests__` (`ciWorkflow.test.ts`, `packageScripts.test.ts`, `workspaceImports.test.ts`, `paidContentRef.test.ts`) assert workflow and package.json text; `packageScripts.test.ts:10-12` pins the exact `build` script string, so every build change edits the test. SPECULATIVE: the global rules call this "gates guarding gates"; the B-60 paid-content checks in `publicContentTree.test.ts` are the ones with a real failure behind them and should stay.

### Security (pipeline-specific)

Prompt injection: every builder wraps untrusted text in data tags with `<` escaped (`serializeQuestionData.ts`, `escapeForPrompt.ts`) and every prompt states the data-not-instructions rule; `fillTemplate` is single-pass. The three chained-replace builders (F9) are correct today by ordering only. The CLI provider runs `claude -p` with tools, MCP, and settings off, prompt on stdin (`claudeCliProvider.ts:94-109`); generated code reaches Docker only through `runSandboxed.ts` with fixed limits, and `oracleRunPath.test.ts` enforces that. Logs pass through `sanitizeLogText`. No issue found beyond F9's fragility.

### Credential exposure scan

Patterns from the role definition (Anthropic, Stripe, GitHub, Vercel, Resend, Render, Slack, AWS, SendGrid, Google, private keys), content-free mode (`grep -rlE` and `grep -cE`):

| Target                                                                                                           | Result                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Working tree: `pipeline/`, `packages/content-schema/`, `scripts/`, `content/` (excluding `node_modules`, `dist`) | 0 files match                                                                    |
| Untracked `.env*` under scoped dirs                                                                              | none present                                                                     |
| Git history, all refs, scoped paths (`git log -p --all -- pipeline packages/content-schema scripts content`)     | 0 matching patch lines                                                           |
| Claude Code session transcripts, shell history, vendor CLI configs                                               | not covered by this dispatch; the consolidating process owns the repo-wide sweep |

No remediation needed in scope.

### Dependencies and supply chain

`npm outdated -w pipeline -w @syntactical/content-schema`: `@anthropic-ai/sdk` 0.131.0 (latest 0.133.0), `parse5` 7.3.0 (8.0.1; removable with F1), `zod` 4.6.5 (4.6.7), `vitest` 3.2.7 (5.0.4, major), `@types/node` ^22 in both workspaces while the root pins ^26 (runtime is Node 22.23.1; `pageTextWorker.ts:3-5` needs 22.18+ for type stripping). `npm audit --omit=dev -w pipeline`: 1 high (`source-map-js` via `tailwindcss@3.4.19 -> postcss`), a root-app dependency, not the pipeline's. The content-schema package has no runtime dependencies, which is right for a contract shared with the app and server.

### Deployment and infrastructure

`npm run build` chains `content:build`, the Expo export, `copySpaFallback`, `writeRouteEntries`, and `assertNoPaidBanks` (root `package.json:7`); `assertNoPaidBanks` checks both path and hash and runs as the last step (tested, including the URL-encoded-path self-detection). Runner images are tagged by a hash of their build context (`runnerImageTag.ts`), so an edited harness never reuses an old image. The CLI loads `scripts/buildContentManifest.mjs` by URL with a hand-written type (`cli.ts:22-28`); converting it to TypeScript under `pipeline/src` would remove the cast and the untyped `manifest`/`bank` handling in the script, but it is also imported by Jest tests under `scripts/__tests__`, so this is a M-effort move with a to-confirm on the Jest config.

### Bug fix discipline (last 60 commits, 173 in 30 days)

28 `fix:` commits in the last 60. 25 touch a test file. Unpaired:

- `bc4a20b fix(content): make wrong answers as convincing as the right one (#158)`: changes `prompts/generateBatch.md` only, while `__tests__/services/gapFill/generateBatchPromptRules.test.ts` exists for exactly this kind of rule. A prompt-rule assertion was the obvious test.
- `04b8eb0 fix(content): repin Rails paid banks ... (#140)`: `content/paid-content.ref` only (data).
- `e86372b fix(content): correct the rotate rationale on a flipped Ruby bool`: bank JSON only (data).

Three unpaired in 30 days meets the rubric's P1 threshold, but two are data-only; the pattern finding is P2: prompt changes labelled `fix:` ship without a prompt-rules test.

### Runbook-vs-code drift

No `docs/runbooks/`. Drift found between code and its own documentation: `runCli.ts:199` usage omits `--api` for `rewrite-prompts` and the command ignores it (F15); `codexCliProvider.ts:64-65` describes a streak stop that no longer exists (F15); `SOURCE_ALLOWED_HOSTS.ts:2` references a deleted prompt (F1); `types/FillBankResult.ts:1` says disputes are "present when judging is enabled" and nothing enables it (F1).

### Workspace hygiene

One checkout of the project (`~/Desktop/code/personal/production/syntactical`). `git worktree list` reports 28 worktrees under `.claude/worktrees/` (gitignored). That many parallel worktrees share one stash stack and one object store; a cleanup plan (`git worktree prune` plus deleting merged branches) is recommended, no deletions by the auditor.

Staging output dirs are not ignored: `git check-ignore pipeline/reports pipeline/oracles pipeline/generated pipeline/classifications pipeline/enrichment pipeline/review-queue pipeline/taxonomy/go.draft.json` matches nothing. Any command run leaves untracked files in the repo; `generated/` holds full draft question text, so an unscoped `git add -A` would commit unreviewed content (F-rank 9).

## Tech debt register

| Item                                                                                      | Risk   | Note                                                                                                 |
| ----------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------- |
| Judged route and A/B validators kept but unwired                                          | Medium | ~1.7k source / ~8.6k test lines maintained for no runtime behavior; the one failing test lives there |
| Topic-track review scoped to a kind nothing produces                                      | High   | silent: review reports 0 items and exits 0                                                           |
| No run-level provider failure cap                                                         | Medium | cost exposure on a bad day, especially with `--api`                                                  |
| Three oldest languages behind the pipeline (no topics, judged/pending, no misconceptions) | Medium | the publish gate cannot be applied to them; `topics.json` lingers as a second source of truth        |
| `validate` reads an unvalidated manifest                                                  | Low    | repo-controlled input                                                                                |
| Docker suites in the default local test run                                               | Low    | 220 s local runs                                                                                     |
| `scripts/buildContentManifest.mjs` untyped, loaded via URL cast                           | Low    | one place where the TS boundary is a string                                                          |
| 28 worktrees                                                                              | Low    | hygiene                                                                                              |

## Prioritized recommendations

| #   | Action                                                                                                                                                                                   | Impact | Effort   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------- |
| 1   | Fix topic-track review scope (`review.ts:78`); add a test that a generated topic-track card appears in the review file                                                                   | H      | S        |
| 2   | Decide and execute: delete the judged route, Codex provider, source fetcher, `parse5` (F1); delete or keep-and-document the A/B validators (F2); delete the v1 migration (F3)            | H      | M        |
| 3   | Restore a consecutive-failure stop for gap-fill and enrich; classify SDK transport errors as transient; one `PIPELINE_MODEL` read for both providers; honor `--api` in `rewrite-prompts` | H      | S-M      |
| 4   | Shared `loadValidatedManifest` / `listBankEntries` / `readBankQuestions`; make `validate` use it                                                                                         | H      | M        |
| 5   | One JSON read/write helper set; drop the double schema checks and duplicated batch constants                                                                                             | M      | S        |
| 6   | Single runner id constant; add `golden/typescript.json` and iterate the constant in the golden test                                                                                      | M      | S        |
| 7   | Gitignore pipeline staging output                                                                                                                                                        | M      | S        |
| 8   | Test fixtures module; replace the wall-clock assertion; Docker suites opt-in locally                                                                                                     | M      | M        |
| 9   | Owner decision on the three unclassified languages: run classify/publish for them and retire `topics.json`, or document that the publish gate applies only to pipeline-produced banks    | M      | decision |
| 10  | Bump `zod`, `@anthropic-ai/sdk`; align `@types/node` with the root; plan the vitest 5 move with the server workspace                                                                     | L      | S        |
