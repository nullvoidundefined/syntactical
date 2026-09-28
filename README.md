# syntactical

High-velocity flashcard and lightning-round quiz drills for developers, built as a Vite + React + Tailwind CSS single-page app. Pick a language track (Python or Postgres), pick a difficulty (Medium or Hard), and run the deck entirely from the keyboard.

## Stack

- **Vite** (build tool / dev server)
- **React 19** (functional components, hooks only)
- **Tailwind CSS v4** (via `@tailwindcss/vite`, CSS-first theme in `src/index.css`)
- No backend, no database - all state lives in `localStorage`

## Directory structure

```
syntactical/
├── .github/workflows/deploy.yml   # GitHub Actions -> GitHub Pages
├── index.html
├── vite.config.js                 # base path handling for GH Pages
├── src/
│   ├── main.jsx                   # React root
│   ├── App.jsx                    # view router: menu vs. quiz
│   ├── index.css                  # Tailwind entry + theme tokens
│   ├── constants/
│   │   └── appConfig.js           # languages, difficulties, key bindings
│   ├── data/
│   │   ├── index.js                # getQuestionBank(language, difficulty)
│   │   ├── python/{medium,hard}.js
│   │   └── postgres/{medium,hard}.js
│   ├── clients/
│   │   └── localStorageClient.js  # thin localStorage read/write wrapper
│   ├── services/
│   │   ├── quizService.js         # shuffle, grading, accuracy (pure)
│   │   └── statsService.js        # persisted-stats reducers (pure)
│   ├── hooks/
│   │   ├── useQuizEngine.js       # round state machine
│   │   ├── useQuizStats.js        # stats state <-> localStorage
│   │   └── useKeyboardNav.js      # global key-binding listener
│   └── components/
│       ├── layout/AppShell.jsx
│       ├── menu/
│       │   ├── MainMenu.jsx        # two-step wizard orchestrator
│       │   ├── LanguageStep.jsx
│       │   ├── DifficultyStep.jsx
│       │   └── SelectionCard.jsx
│       ├── quiz/
│       │   ├── QuizView.jsx        # round orchestrator + retry remount
│       │   ├── Card.jsx            # shared card chrome + Query trigger
│       │   ├── MultipleChoiceCard.jsx
│       │   ├── BooleanCard.jsx
│       │   ├── ProgressBar.jsx
│       │   ├── KeyboardHintBar.jsx
│       │   └── ResultsScreen.jsx
│       ├── query/QueryDrawer.jsx   # slide-over explanation panel
│       └── stats/StatsPanel.jsx
```

## Keyboard controls

| Key | Action |
|---|---|
| `1`-`4` / `A`-`D` | Select a multiple-choice option |
| `T` / `F` | Answer a True/False card |
| `Enter` | Advance to the next card (once answered) / retry on results screen |
| `Q` | Open or close the Query drawer for the current card |
| `Esc` | Close the Query drawer, or return to the menu |

Every action is also reachable by mouse/click; the keyboard bindings are additive for speed.

## Local development

```bash
npm install
npm run dev
```

## Building

```bash
npm run build      # outputs to dist/
npm run preview    # serve the production build locally
```

`vite.config.js` sets `base` to `/syntactical/` only for the production build (`command === 'build'`), so `npm run dev` keeps serving from `/`. **If you rename the GitHub repo, update `REPO_NAME` in `vite.config.js` to match.**

## Deploying to GitHub Pages

### Option A: GitHub Actions (recommended, already configured)

1. Push this project to a GitHub repository named to match `REPO_NAME` in `vite.config.js` (default: `syntactical`), or update that constant to match whatever the repo is actually named.
2. In the repo, go to **Settings -> Pages** and set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow at `.github/workflows/deploy.yml` will:
   - install dependencies,
   - run `npm run build`,
   - upload `dist/` as a Pages artifact,
   - deploy it.
4. Watch the run under the **Actions** tab. When it finishes, the deployed URL appears in the job summary and under **Settings -> Pages** (typically `https://<username>.github.io/syntactical/`).

No further steps are needed after the first push, every subsequent push to `main` redeploys automatically.

### Option B: `gh-pages` CLI (manual, from your machine)

1. Make sure the repo has a `main` (or default) branch already pushed to GitHub.
2. Confirm `REPO_NAME` in `vite.config.js` matches the actual GitHub repo name.
3. Run:
   ```bash
   npm run deploy
   ```
   This runs `predeploy` (`npm run build`) automatically, then publishes `dist/` to a `gh-pages` branch via the `gh-pages` package.
4. In the repo, go to **Settings -> Pages** and set **Source** to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.
5. The site will be live at `https://<username>.github.io/syntactical/` within a minute or two.

Use Option A for a zero-touch pipeline; use Option B if you'd rather deploy on demand without GitHub Actions.

## Data model

Every question in `src/data/**` follows one of two shapes:

```js
// Multiple choice
{
  id: 'py-med-01',
  type: 'mc',
  prompt: '...',
  code: '...',            // optional snippet
  choices: ['...', '...', '...', '...'],
  answerIndex: 0,
  query: { title, syntax, explanation, tags },
}

// True / False
{
  id: 'pg-med-01',
  type: 'bool',
  prompt: '...',
  code: '...',            // optional snippet
  answer: true,
  query: { title, syntax, explanation, tags },
}
```

`query` backs the Query drawer, and is required on every card per the spec: it names the underlying method/syntax rule and explains the context, not just restates the answer.

## Adding a new question bank

Add a new file under `src/data/<language>/<difficulty>.js` exporting an array in the shape above, then register it in `src/data/index.js`'s `QUESTION_BANKS` map. If it's a new language, also add an entry to `LANGUAGES` in `src/constants/appConfig.js`.
