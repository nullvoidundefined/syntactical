# syntactical

Syntactical is a flashcard and lightning-round quiz app that drills developers on language syntax and behavior. Pick a language (Python, Postgres, or JavaScript), pick a difficulty (Easy, Medium, or Hard), and answer a shuffled round of multiple-choice and true/false questions. Wrong answers can be explained through the query drawer, and lifetime stats and streaks persist on the device.

It is one Expo universal app (Expo Router, NativeWind, react-native-web) that runs on iOS, Android, and the web. The web build is published at https://nullvoidundefined.github.io/syntactical/. See `docs/stack.md` for every dependency and why it was chosen.

## Local development

```bash
npm install
npm run dev      # starts Expo; press w for the web build, i or a for a simulator
npm test         # Jest (native and web projects)
npm run lint     # oxlint
npm run build    # content build, then the web export into dist/
```

Run `npx tsc --noEmit` to type check; CI runs it too.

Formatting follows `.prettierrc.mjs`: 2-space indent and 120 columns, except `pipeline/` and `packages/progress/` code, which keeps 4-space indent at the same width. The codebase predates the config and about 400 files still differ from it, so run `npx prettier --write <file>` only on files you change, never on `.`, to keep diffs free of whole-file reformatting.

## Keyboard controls (web)

| Key | Action |
|---|---|
| `1`-`4` / `A`-`D` | Select a multiple-choice option |
| `T` / `F` | Answer a True/False card |
| `Enter` | Advance to the next card (once answered) or retry on the results screen |
| `Q` | Open or close the query drawer for the current card |
| `Esc` | Close the query drawer, or return to the menu |

Every action is also reachable by pointer or touch; the keyboard bindings are additive for speed.

## Content

Questions are not compiled into the app logic. `content/manifest.json` lists every bank with its SHA-256 hash. Free banks live in `content/<language>/<difficulty>.json`; the app downloads them at runtime from the content base URL, verifying each against the manifest hash, and bundled copies let it work offline.

Paid banks are not in this repository. They live in the private repository `nullvoidundefined/syntactical-content` at the same `<language>/<difficulty>.json` paths, reach the API image as `PAID_CONTENT_DIR`, and reach entitled owners only through `GET /v1/banks/:language/:difficulty`. They are never bundled and never on the static host: `npm run content:build` fails on a paid bank file under `content/`, and `npm run build` fails when the web export holds one (`scripts/assertNoPaidBanks.mjs`).

Each question is either multiple choice or true/false, and carries a `query` (`title`, `syntax`, `explanation`, `tags`) that backs the query drawer:

```json
{
  "id": "py-easy-01",
  "type": "mc",
  "prompt": "...",
  "code": "...",
  "choices": ["...", "...", "...", "..."],
  "answerIndex": 0,
  "query": { "title": "...", "syntax": "...", "explanation": "...", "tags": ["..."] }
}
```

A true/false question uses `"type": "bool"` and `"answer": true` or `false` in place of `choices` and `answerIndex`.

### Editing a question

1. Edit the question in `content/<language>/<difficulty>.json` (free banks only; paid banks change through the pipeline, below).
2. Run `npm run content:build`. It validates the content, recomputes every free bank hash into `content/manifest.json` (a paid entry is kept as it is), and regenerates `services/content/bundledManifest.generated.ts` and `services/content/bundledBanks.generated.ts`.
3. Commit the bank, `content/manifest.json`, and both `services/content/*.generated.ts` files together, then push. CI fails the pull request if any of them drift from what `npm run content:build` produces.

### Adding a language

1. Add the bank files, `content/<language>/<difficulty>.json`, for each difficulty the language offers.
2. Add an entry to `languages` in `content/manifest.json` with `id`, `label`, `glyph`, `tagline`, `grammar` (the Prism language id used for highlighting), and a `banks` object whose entries each have a `path` and `"hash": ""`.
3. Run `npm run content:build` to fill in the hashes and regenerate the bundled files, then commit and push as above.

### Publishing paid banks

Clone `nullvoidundefined/syntactical-content` beside this repository (`../syntactical-content`), or pass `--content-root <path>` or set `SYNTACTICAL_CONTENT_ROOT`. The pipeline reads and writes paid banks there and refuses a content root inside this repository. Run `npm run pipeline -- publish`; it writes changed paid banks into the content checkout and rewrites `content/manifest.json` with their hashes. Then commit and push in `syntactical-content` first, and commit the manifest and generated files here.

A `grammar` that the build does not include renders code as plain text; the supported list is `GRAMMARS` in `constants/appConfig.ts`. A language outside that list needs the list and the Prism imports in `services/codeBlock/tokenizeCode.ts` extended in code.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which installs dependencies, runs `npm run build`, and publishes `dist/` (the Expo web export plus the free banks and manifest in `content/`) to GitHub Pages. Watch the run under the Actions tab. The site is served at `/syntactical/`, and `404.html` serves deep links to the single-page app. Banks pushed to `main` reach installed apps on their next manifest refresh, with no new build.

## Device builds

Internal iOS and Android builds go through EAS using the `preview` profile in `eas.json`. The commands, the Apple Developer requirement for iOS, and the manual checklist to run on each build are in `docs/device-checklist.md`.

## More documentation

- `docs/stack.md`: every dependency and tool, with its role.
- `docs/lexicon.md`: the domain vocabulary used in names.
- `docs/feature-list/features.md` and `docs/user-stories/`: what ships and its acceptance criteria.
