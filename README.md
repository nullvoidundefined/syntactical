# syntactical

Syntactical is a quiz app that drills developers on language syntax and runtime behavior. A learner picks a track, picks a difficulty, and answers a shuffled round of multiple-choice, true/false, and A/B questions. Wrong answers can be explained through the query drawer. A guest's stats stay on the device; a signed-in learner's answers sync to the API, which derives XP, the day streak, daily goals, and the review queue from them (`services/progress/`, `server/src/services/recomputeDailyProgress.ts`).

`content/manifest.json` lists ten tracks: eight language tracks (`python`, `postgres`, `javascript`, `go`, `ruby`, `rails`, `sql`, `typescript`) and two topic tracks (`backend-security`, `frontend-security`, `kind: 'topic'`). Each track has three banks, `easy`, `medium`, and `hard`; the `easy` bank is free and the other two are paid, so the manifest names 30 banks, 10 free and 20 paid.

The repository is an npm workspace with five packages:

| Directory                 | What it is                                                                                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the root                  | The Expo universal app (Expo Router, NativeWind, react-native-web) in `app/`, `components/`, `state/`, `services/`, `clients/`, `config/`, and `constants/`; iOS, Android, web. |
| `server/`                 | The Express 5 API on Railway with Postgres on Neon: accounts, sessions, answer-event sync, paid banks, RevenueCat and PostHog hooks (`server/DEPLOY.md`).                       |
| `pipeline/`               | The content pipeline CLI: oracle runners in Docker, model-assisted drafting and review, and publishing of paid banks (`pipeline/src/commands/`).                                |
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

Questions are not compiled into the app logic. `content/manifest.json` lists every bank with its SHA-256 hash. Free banks live in `content/<track>/easy.json`; the app downloads them at runtime from the content base URL, verifies each against the manifest hash, and keeps bundled copies so it works offline.

Paid banks are not in this repository. They live in the private repository `nullvoidundefined/syntactical-content` at `<track>/<difficulty>.json`, reach the API image as `PAID_CONTENT_DIR`, and reach entitled users only through `GET /v1/banks/:language/:difficulty` (`server/src/routes/banks.ts`). They are never bundled and never on the static host: `npm run content:build` fails on a paid bank file under `content/`, and `npm run build` fails when the web export holds one (`scripts/assertNoPaidBanks.mjs`). The tests that guard this are `scripts/__tests__/publicContentTree.test.ts`, `paidContentRef.test.ts`, and `noPaidQuestionIds.test.ts`.

Each question is multiple choice (`mc`), true/false (`bool`), or A/B (`ab`), and carries a `query` (`title`, `explanation`, optional `syntax`, `tags`, and `docs`: up to three https `{ title, url }` links to official documentation) that backs the query drawer. Before an answer the drawer shows only the title and `docs`, so those must not give the answer away; the syntax, explanation, and tags appear after. Each question also carries `provenance` saying where it came from and how it was validated. The full shape is `packages/content-schema/src/validateQuestionBank.ts`.

### Editing a question

1. Edit the question in `content/<track>/easy.json` (free banks only; paid banks change through the pipeline, below).
2. Run `npm run content:build`. It validates the content, recomputes every free bank hash into `content/manifest.json` (a paid entry is kept as it is), and regenerates `services/content/bundledManifest.generated.ts` and `services/content/bundledBanks.generated.ts`.
3. Commit the bank, `content/manifest.json`, and both generated files together. CI fails the pull request if any of them drift from what `npm run content:build` produces.

### Adding a track

1. Add the free bank file `content/<track>/easy.json`.
2. Add an entry to `languages` in `content/manifest.json` with `id`, `label`, `glyph`, `tagline`, `grammar` (one of `GRAMMARS` in `packages/content-schema/src/grammars.ts`; any other value renders code as plain text), `kind: 'topic'` for a topic track, and a `banks` object whose entries each have a `path`, `access`, and `"hash": ""`.
3. Run `npm run content:build` to fill in the hashes and regenerate the bundled files, then commit and push as above.

### Publishing paid banks

Clone `nullvoidundefined/syntactical-content` beside this repository (`../syntactical-content`), or pass `--content-root <path>` or set `SYNTACTICAL_CONTENT_ROOT`. The pipeline reads and writes paid banks there and refuses a content root inside this repository. Run `npm run pipeline -- publish`; it writes changed paid banks into the content checkout and rewrites `content/manifest.json` with their hashes. Commit and push in `syntactical-content` first, then commit the manifest and generated files here. In the same PR, set `content/paid-content.ref` to the full sha of that pushed `syntactical-content` commit. Deploys stage exactly that commit, so the manifest hashes and the private banks always match; a manifest change without the matching ref fails the deploy hash check (`server/scripts/stageBuildContent.sh`).

### Rationales and before-answer references for free banks

Each step saves as it goes and skips what is already done, so a rerun only pays for what is missing. Commands run through `claude -p` unless you pass `--api`, which uses `ANTHROPIC_API_KEY`. The second model, which double-checks each result, is `PIPELINE_SECOND_MODEL` (default `claude-haiku-5-5`).

1. `npm run pipeline -- enrich --judge-without-oracle [--free-only] [--language python,postgres]` writes a rationale and misconception tag for each wrong choice into `pipeline/enrichment/`. A language needs an approved `pipeline/taxonomy/<language>.json` (draft one with `draft-taxonomy <language>`). A question without a recorded oracle run is grounded in its answer key and explanation, and both models' judges must accept each rationale.
2. `npm run pipeline -- write-references [--language python,postgres]` writes each question's reference into `pipeline/references/`: a broad topic title and links on the track's documentation hosts, shown before an answer, and a syntax reference with examples, shown after (`pipeline/src/services/references/DOC_HOSTS.ts`). Both models must agree the title and link titles do not give the answer away; a reference that does is rewritten once, then left out.
3. `npm run pipeline -- verify-doc-links` fetches every staged link (no model, but it needs network access to the documentation hosts) and records the results in `pipeline/references/doc-links.json`. A link to a `#section` passes only when that section is on the page.
4. `npm run pipeline -- apply-staging` merges the staged rationales and references into the free banks without adding or dropping any question, keeping only links that passed step 3, then runs the content build (no content root needed: paid manifest entries stay as they are). Commit the banks, the manifest, the generated files, and `pipeline/enrichment`, `pipeline/references` together.

## Deploying

- **Web.** Pushing to `main` runs `.github/workflows/deploy.yml`, which runs `npm run build` and publishes `dist/` (the Expo web export plus `content/`) to GitHub Pages at the root of `https://syntactical.dev`; `404.html` serves deep links. Banks pushed to `main` reach installed apps on their next manifest refresh, with no new build.
- **API.** Pushes to `main` that touch the server, the packages, the content, or the lock file deploy staging; production deploys only by a manual `.github/workflows/server-deploy.yml` run. The runbook is `server/DEPLOY.md`. The custom hostnames `api.syntactical.dev` and `staging-api.syntactical.dev` have no DNS records yet (see the runbook's "DNS" section), so the production API URL compiled into the app (`app.config.ts`, `eas.json`) does not resolve until the owner adds the CNAMEs. The web build needs the custom domain rather than the Railway hostname: the session cookie is `SameSite=Lax` (`server/src/config/sessionCookieOptions.ts`), so the API must be same-site with `syntactical.dev` (`server/DEPLOY.md`, "Web app origin"); only a native build, which sends a Bearer token, could be pointed at the Railway hostname as a stopgap.
- **Device builds.** Internal iOS and Android builds go through EAS using the `preview` profile in `eas.json`; the checklist is `docs/device-checklist.md`.

## More documentation

- `docs/stack.md`: every dependency and tool, with its role.
- `docs/lexicon.md`: the domain vocabulary used in names.
- `docs/feature-list/features.md` and `docs/user-stories/`: what ships and the tests that cover it.
- `docs/session-handoff/session-handoff.md`: the current state and what is open.
- `docs/audits/`: the dated audit reports.
