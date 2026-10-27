# syntactical

Syntactical is a quiz app that drills developers on language syntax and runtime behavior. A learner picks a track, picks a difficulty, and answers a shuffled round of multiple-choice, true/false, and A/B questions. Wrong answers can be explained through the query drawer. A guest's stats stay on the device; a signed-in learner's answers sync to the API, which derives XP, the day streak, daily goals, and the review queue from them (`services/progress/`, `server/src/services/recomputeDailyProgress.ts`).

`content/manifest.json` lists twelve tracks: ten language tracks (`python`, `postgres`, `javascript`, `go`, `ruby`, `rails`, `sql`, `typescript`, `typescript-types`, `nodejs`) and two topic tracks (`backend-security`, `frontend-security`, `kind: 'topic'`). Each track has three banks, `easy`, `medium`, and `hard`, so the manifest names 36 banks, and every one is free.

The repository is an npm workspace with five packages:

| Directory                 | What it is                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the root                  | The Expo universal app (Expo Router, NativeWind, react-native-web) in `app/`, `components/`, `state/`, `services/`, `clients/`, `config/`, and `constants/`; iOS, Android, web. |
| `server/`                 | The Express 5 API on Railway with Postgres on Neon: accounts, sessions, answer-event sync, Ask and the study note, RevenueCat and PostHog hooks (`server/DEPLOY.md`).           |
| `pipeline/`               | The content pipeline CLI: oracle runners in Docker, model-assisted drafting and review, and publishing into `content/` (`pipeline/src/commands/`).                              |
| `packages/content-schema` | The manifest and bank validators shared by the app, the build, the server, and the pipeline.                                                                                    |
| `packages/progress`       | The pure progress functions (XP, daily progress, day streak, review scheduling with `ts-fsrs`) that the app and the server both run.                                            |

The web build is published at https://syntactical.dev/. `docs/stack.md` lists every dependency with its role.

## Local development

```bash
npm install
npm run dev                 # Expo; press w for the web build, i or a for a simulator
npm test                    # Jest: the app's native and web projects
npm run test:workspaces     # Vitest in each workspace (SKIP_DOCKER_TESTS=1 skips the Docker suites)
npm run e2e                 # Playwright against a real API and Postgres (needs Docker)
npm run lint                # oxlint
npx tsc --noEmit            # the app type check; npm run typecheck:workspaces and typecheck:e2e cover the rest
npm run build               # content build, then the web export into dist/
```

The server's integration tests (`npm run test:integration -w server`) and the pipeline's oracle tests need Docker; they skip locally without it and run in CI (`.github/workflows/ci.yml`). The pipeline CLI runs as `npm run pipeline -- <command>`.

Formatting follows `.prettierrc.mjs`: 2-space indent and 120 columns, except `pipeline/` and `packages/progress/`, which keep 4-space indent. The codebase predates the config and 323 files still fail `prettier --check` (counted 2026-10-13), so run `npx prettier --write <file>` only on files you change, never on `.`.

## Keyboard controls (web)

The bindings are `KEY_BINDINGS` in `constants/appConfig.ts`.

| Key               | Action                                                                  |
| ----------------- | ----------------------------------------------------------------------- |
| `1`-`4` / `A`-`D` | Select a multiple-choice option                                         |
| `T` / `F`         | Answer a True/False card                                                |
| `Enter`           | Advance to the next card (once answered) or retry on the results screen |
| `Q`               | Open or close the query drawer for the current card                     |
| `Esc`             | Close the query drawer, or return to the menu                           |

Every action is also reachable by pointer or touch; the keyboard bindings are additive for speed.

## Content

Questions are not compiled into the app logic. Every bank lives in this repository at `content/<track>/<difficulty>.json`, and `content/manifest.json` lists each one with its SHA-256 hash, content version, and topic counts. The Easy banks are bundled into the app (`services/content/bundledBanks.generated.ts`), so a first round works offline. Medium and Hard banks are downloaded from the content base URL the first time they are played, checked against the manifest hash, and cached; offline with no cached copy, the difficulty step shows "Needs a connection to load".

Each question is multiple choice (`mc`), true/false (`bool`), or A/B (`ab`), and carries a `query` (`title`, `explanation`, optional `syntax`, `tags`, and `docs`: up to three https `{ title, url }` links to official documentation) that backs the query drawer. Before an answer the drawer shows only the title and `docs`, so those must not give the answer away; the syntax, explanation, and tags appear after. Each question also carries `provenance` saying where it came from and how it was validated. The full shape is `packages/content-schema/src/validateQuestionBank.ts`.

### Editing a question

1. Edit the question in `content/<track>/<difficulty>.json`.
2. Run `npm run content:build`. It validates every bank, recomputes every hash and topic count into `content/manifest.json`, bumps the content version of each bank whose bytes changed, lists the misconceptions some card links, and regenerates `services/content/bundledManifest.generated.ts` and `services/content/bundledBanks.generated.ts`. It fails on a `.json` file under a track directory that the manifest does not list.
3. Commit the bank, `content/manifest.json`, and both generated files together. CI fails the pull request if any of them drift from what `npm run content:build` produces.

### Adding a track

1. Add the bank files `content/<track>/easy.json`, `medium.json`, and `hard.json`.
2. Add an entry to `languages` in `content/manifest.json` with `id`, `label`, `glyph`, `tagline`, `grammar` (one of `GRAMMARS` in `packages/content-schema/src/grammars.ts`; any other value renders code as plain text), `kind: 'topic'` for a topic track, `topics`, `misconceptions`, and a `banks` object whose entries each have a `path`, `"hash": ""`, `"contentVersion": 1`, and `"topicCounts": {}`. A bank entry carrying `access` or `productId` is rejected.
3. Run `npm run content:build` to fill in the hashes and regenerate the bundled files, then commit as above.

### The content pipeline

`npm run pipeline -- <command>` reads every bank from `content/` and stages its work under `pipeline/`: `classifications/`, `generated/`, `disputed/`, `oracles/`, `review/`, `review-queue/`, and `reports/` stay local and untracked, while `pipeline/taxonomy/`, `pipeline/enrichment/`, and `pipeline/references/` are committed. Model commands run through `claude -p` unless you pass `--api`, which uses `ANTHROPIC_API_KEY` (plus `ANTHROPIC_WORKSPACE_ID` when the key is organization-level). The second model, which double-checks each result, is `PIPELINE_SECOND_MODEL` (default `claude-haiku-5-5`). Each step saves as it goes and skips what is already done, so a rerun only pays for what is missing. The `--content-root` and `--free-only` flags from the old two-repository layout are refused.

To add questions to a bank:

1. `npm run pipeline -- classify` assigns each question a topic; `npm run pipeline -- gap-fill` generates questions for thin topics, keeping each only when its executed oracle proves its answer.
2. `npm run pipeline -- validate` runs every oracle in Docker and writes the report the next steps read.
3. `npm run pipeline -- review` writes `pipeline/review/<track>-<difficulty>.md` for the owner to approve or reject; rerun it to record the decisions.
4. `npm run pipeline -- publish` writes each bank that passes `validateBankForPublish` into `content/<track>/<difficulty>.json` and runs the content build. Commit the banks, the manifest, and the generated files together.

To add rationales and before-answer references to existing questions:

1. `npm run pipeline -- enrich --judge-without-oracle [--language python,postgres]` writes a rationale and misconception tag for each wrong choice into `pipeline/enrichment/`. A language needs an approved `pipeline/taxonomy/<language>.json` (draft one with `draft-taxonomy <language>`). A question without a recorded oracle run is grounded in its answer key and explanation, and both models' judges must accept each rationale.
2. `npm run pipeline -- write-references [--language python,postgres]` writes each question's reference into `pipeline/references/`: a broad topic title and links on the track's documentation hosts, shown before an answer, and a syntax reference with examples, shown after (`pipeline/src/services/references/DOC_HOSTS.ts`). Both models must agree the title and link titles do not give the answer away; a reference that does is rewritten once, then left out.
3. `npm run pipeline -- verify-doc-links` fetches every staged link (no model, but it needs network access to the documentation hosts) and records the results in `pipeline/references/doc-links.json`. A link to a `#section` passes only when that section is on the page.
4. `npm run pipeline -- apply-staging` merges the staged rationales and references into every bank without adding or dropping any question, keeping only links that passed step 3, then runs the content build. Commit the banks, the manifest, the generated files, and `pipeline/enrichment` and `pipeline/references` together.

## Deploying

- **Web.** Pushing to `main` runs `.github/workflows/deploy.yml`, which runs `npm run build` and deploys `dist/` (the static Expo web export, one HTML page per route, plus `content/`, `_headers`, and `404.html` from `scripts/writeHostFiles.mjs`) to the Cloudflare Pages project `syntactical` at the root of `https://syntactical.dev`. The build reads the public client keys (`POSTHOG_KEY`, `POSTHOG_HOST`, `REVENUECAT_WEB_BILLING_KEY`, `ETHICALADS_PUBLISHER`) from repository variables of the same names. The Cloudflare step runs only when the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` Actions secrets are set; until the cutover in `server/DEPLOY.md` ("Web app origin") the workflow also publishes to GitHub Pages, which stays the live host. Preview the export as Pages serves it with `npx --yes wrangler@4.153.0 pages dev dist`. Banks pushed to `main` reach installed apps on their next manifest refresh, with no new build.
- **API.** Pushes to `main` that touch the server, the packages, the content, or the lock file deploy staging; production deploys only by a manual `.github/workflows/server-deploy.yml` run. The runbook is `server/DEPLOY.md`. The custom hostnames `api.syntactical.dev` and `staging-api.syntactical.dev` have no DNS records yet (see the runbook's "DNS" section), so the production API URL compiled into the app (`app.config.ts`, `eas.json`) does not resolve until the owner adds the CNAMEs. The web build needs the custom domain rather than the Railway hostname: the session cookie is `SameSite=Lax` (`server/src/config/sessionCookieOptions.ts`), so the API must be same-site with `syntactical.dev` (`server/DEPLOY.md`, "Web app origin"); only a native build, which sends a Bearer token, could be pointed at the Railway hostname as a stopgap.
- **Device builds.** Internal iOS and Android builds go through EAS using the `preview` profile in `eas.json`; the checklist is `docs/device-checklist.md`.

## More documentation

- `docs/stack.md`: every dependency and tool, with its role.
- `docs/lexicon.md`: the domain vocabulary used in names.
- `docs/feature-list/features.md` and `docs/user-stories/`: what ships and the tests that cover it.
- `docs/session-handoff/session-handoff.md`: the current state and what is open.
- `docs/audits/`: the dated audit reports.
