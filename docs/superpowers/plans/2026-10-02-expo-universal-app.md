# Expo Universal App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Vite + React web app with one Expo app (iOS, Android, web) whose question banks are JSON files on GitHub Pages, downloaded at runtime, verified by hash, cached, and backed by a bundled copy.

**Architecture:** Expo Router screens over `components/`, `state/` (hooks and providers), `services/` (pure logic), and `clients/` (AsyncStorage, fetch, crypto, logging). TanStack Query fetches the manifest and banks; an AsyncStorage cache binds each bank to its verified SHA-256. The Expo app lives beside the Vite app until PR 3 cuts the site over.

**Tech Stack:** Expo SDK (latest stable at execution time, installed with `npx expo install`), Expo Router, NativeWind 4 with Tailwind CSS 3, react-native-web, TanStack Query 5, `@react-native-async-storage/async-storage`, `expo-crypto`, `react-native-reanimated`, `@react-native-community/netinfo`, Prism.js, Jest (`jest-expo`), React Native Testing Library, TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-02-expo-universal-app-design.md`
**Ticket:** IAN-564

## Global Constraints

- Identifiers use `language` and `difficulty`; never `track`, `tier`, `level`, or `subject` (`docs/lexicon.md`). The persisted stats object keeps its existing `tracks` field because renaming it would orphan saved stats.
- Stats storage key stays `syntactical.stats.v1`; content cache keys use the prefix `syntactical.content.v1.`.
- Web base path `/syntactical` in production; `/syntactical/preview` for the pre-cutover Expo build.
- Content base URL: `https://nullvoidundefined.github.io/syntactical/content/` (preview builds use `https://nullvoidundefined.github.io/syntactical/preview/content/`).
- Fetch timeout 8 seconds, covering the body; redirects are rejected.
- Size limits: manifest 64 KB, bank 512 KB, 1 to 500 questions per bank.
- Choices per multiple-choice question: 2 to 4.
- Language id `^[a-z0-9-]{1,32}$`; question id `^[a-z0-9-]{1,64}$`.
- Supported grammars: `python`, `sql`, `javascript`, `typescript`, `go`, `rust`, `ruby`, `bash`, `plain`.
- Never `dangerouslySetInnerHTML` anywhere in the new app.
- Hooks live in `state/`; never a `hooks/` directory (CLAUDE-FRONTEND-REACT.md).
- Every new source file starts with a header comment (R-320). Named standalone functions use the `function` keyword (shared CLAUDE.md).
- Lighthouse accessibility 100 on the web build before cutover.
- New files keep the existing 2-space indent and single quotes so the diff matches the code it replaces.

## Review Focus

1. **The owner pushes a malformed bank or manifest.** A reasonable person expects the deploy to fail loudly rather than publish content every device will silently reject. `buildContentManifest` runs the app's own validators and exits non-zero (Task 6, test "rejects a malformed bank at build time").
2. **A cached entry in AsyncStorage is corrupt** (truncated JSON, or valid JSON that fails validation). Expected: treated as absent, and the bundled copy is used (Task 10, test "ignores a corrupt cached bank").
3. **A language is removed from the manifest while the user has stats for it.** Expected: the menu and stats panel render without it and nothing crashes (Task 15, test "omits stats for a language no longer in the manifest").
4. **A code line longer than the screen.** Expected: the code block scrolls horizontally instead of clipping or wrapping (Task 20, test "wraps code in a horizontal scroll view").
5. **The connection drops mid-download.** Expected: the download indicator clears and the previous copy stays in use (Task 13, test "clears the indicator when a bank download fails").

## Gate 1

**Merge mode:** merge-on-green for PR 3 (owner decision 2026-10-02 at Gate 1): the session merges it once CI is green and the R-517 review passes, through the harness's per-merge confirmation. PR 1 and PR 2 are high-risk, so the owner reads and merges them (R-514).

**Execution:** native (owner decision 2026-10-02): the session implements every task, with the R-412 triad on the two high-risk slices.

| PR | Branch | Slices | Risk |
|---|---|---|---|
| 1 | `feat/expo-universal-app` | 1 scaffold, 2 storage and stats, 3 content | **Risk:** high |
| 2 | `feat/expo-screens` (off `main` after PR 1 merges) | 4 menu and indicator, 5 quiz, 6 code block | **Risk:** high |
| 3 | `feat/expo-cutover` (off `main` after PR 2 merges) | 7 web parity and cutover, 8 device builds and docs | **Risk:** standard |

High-risk slices (3 and 6) run the `test-author`, `implementer`, and `slice-critic` triad (R-412); every other slice runs Standard mechanics with the session writing its own failing test under the lock. Each slice is bracketed by `bash ~/.claude/enforce/tdd.sh open "<slice>" --spec docs/superpowers/specs/2026-10-02-expo-universal-app-design.md`, `tdd.sh red <test files>`, `tdd.sh green`, and `tdd.sh close`.

### Threat models and acceptance boundaries (R-110)

- **Control:** the content validators and the bank path rule. **Threat model:** malformed or oversized owner edits and partially deployed updates, over HTTPS from the owner's own Pages site; repository or Pages compromise out of scope. **Acceptance boundary:** every rule in the spec's Validation rules has a rejecting test; the path rule rejects encoded traversal, backslashes, root-relative paths, absolute URLs, and other origins.
- **Control:** the code renderer. **Threat model:** fetched strings containing markup. **Acceptance boundary:** hostile `question.code` and `query.syntax` render as literal text through the real `CodeBlock`; no `dangerouslySetInnerHTML` in the tree.

## Spec amendments made with this plan

Two spec lines changed while planning, committed with this plan:

1. **B-9:** the conversion parity test is deleted with `src/data` in PR 3 rather than kept as a fixture, because `content/` becomes owner-edited and a frozen fixture would fail on every edit.
2. **B-16 and B-23:** after each manifest refresh, every bank whose hash changed or that has no copy is prefetched in the background, and the download indicator tracks bank transfers only. The manifest itself is fetched on every launch and is small, so showing the indicator for it would flash on every start.

## File map

| Path | Responsibility | Task |
|---|---|---|
| `app.config.ts` | Expo config: base URL and content URL per build target | 1 |
| `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `tsconfig.json` | Toolchain | 1 |
| `jest.config.js`, `jest.setup.ts` | Jest projects: native (`jest-expo/ios`) and web (`jest-expo/web`, files ending `.web.test.tsx`) | 1 |
| `app/_layout.tsx` | Providers and app shell | 1, 4, 10, 12 |
| `app/index.tsx` | Language step | 1, 12 |
| `app/[language]/index.tsx` | Difficulty step | 12 |
| `app/[language]/[difficulty].tsx` | Round screen | 17 |
| `app/+not-found.tsx` | Unknown route | 2 |
| `scripts/copySpaFallback.mjs` | Copies `index.html` to `404.html` and writes `.nojekyll` | 2 |
| `.github/workflows/ci.yml` | PR checks: lint, test, both builds | 2 |
| `.github/workflows/deploy.yml` | Pages deploy | 2, 22 |
| `clients/storageClient.ts` | AsyncStorage JSON read and write | 3 |
| `clients/logClient.ts` | Structured warning output | 3 |
| `services/stats/statsService.ts` | Pure stats folding (ported) | 4 |
| `state/StatsProvider.tsx` | Hydration, write queue, context | 4 |
| `constants/appConfig.ts` | Difficulty registry, key bindings, storage keys, grammars, limits | 4, 7, 21 |
| `scripts/exportQuestionBanks.mjs` | One-time conversion of `src/data` | 5 |
| `content/manifest.json`, `content/<language>/<difficulty>.json` | Question content | 5 |
| `scripts/buildContentManifest.mjs` | Hashes, build-time validation, bundled index | 6 |
| `services/content/bundledContent.generated.ts` | Static requires for bundled banks (generated) | 6 |
| `services/content/validateManifest.ts` | Manifest validation | 7 |
| `services/content/validateQuestionBank.ts` | Bank validation | 7 |
| `services/content/resolveBankUrl.ts` | Bank path rule | 7 |
| `clients/contentClient.ts` | Fetch with timeout and redirect rejection | 8 |
| `clients/hashClient.ts` | SHA-256 through `expo-crypto` | 9 |
| `services/content/verifyBankHash.ts` | Hash comparison | 9 |
| `services/content/contentCache.ts` | Cached manifest and bank entries | 10 |
| `services/content/loadQuestionBank.ts`, `services/content/loadLanguageManifest.ts` | Fetch, verify, validate, commit | 10 |
| `services/content/bankQueries.ts` | Bank query definition and background prefetch | 10 |
| `config/queryClient.ts` | TanStack Query client | 10 |
| `state/ContentProvider.tsx`, `state/useLanguageManifest.ts`, `state/useQuestionBank.ts` | Content state | 10 |
| `components/layout/AppShell.tsx` | Header, streak readout, indicator slot | 12 |
| `components/menu/SelectionCard.tsx`, `LanguageStep.tsx`, `DifficultyStep.tsx`, `state/useIsOnline.ts` | Menu | 12 |
| `components/layout/DownloadIndicator.tsx`, `state/useContentDownloads.ts` | Download indicator | 13 |
| `services/quiz/quizService.ts` | Shuffle, grading, accuracy (ported) | 14 |
| `state/useQuizEngine.ts` | Round state with bank snapshot | 14 |
| `components/quiz/Card.tsx`, `MultipleChoiceCard.tsx`, `BooleanCard.tsx`, `ProgressBar.tsx` | Question UI | 15 |
| `components/stats/StatsPanel.tsx` | Lifetime stats | 15 |
| `components/query/QueryDrawer.tsx` | Query drawer | 16 |
| `components/quiz/ResultsScreen.tsx`, `components/quiz/QuizRound.tsx` | Round orchestration and results | 17 |
| `services/codeBlock/tokenizeCode.ts`, `components/quiz/CodeBlock.tsx` | Token rendering | 20 |
| `state/useKeyboardNav.ts`, `components/quiz/KeyboardHintBar.tsx` | Web keyboard | 21 |
| `eas.json`, `docs/device-checklist.md` | Device builds | 23 |
| `docs/stack.md`, `docs/feature-list/features.md`, `docs/user-stories/*.md`, `README.md` | Docs | 24 |

Task numbers 11, 18, and 19 are unused: their work folded into Tasks 12, 14, and 15.

---

# PR 1: scaffold, storage, content (Risk: high)

### Task 1: Expo scaffold beside the Vite app (B-1)

**Files:**
- Create: `app.config.ts`, `babel.config.js`, `metro.config.js`, `tailwind.config.js`, `global.css`, `nativewind-env.d.ts`, `tsconfig.json`, `jest.config.js`, `jest.setup.ts`, `app/_layout.tsx`, `app/index.tsx`
- Modify: `package.json`, `.gitignore`
- Test: `app/__tests__/rootLayout.test.tsx`, `app/__tests__/rootLayout.web.test.tsx`

**Interfaces:**
- Produces: `app/_layout.tsx` default export `RootLayout`; theme color names `obsidian`, `surface`, `surface-raised`, `line`, `ink`, `muted`, `signal`, `danger`, `amber`, `violet`, `cyan`; font families `sans`, `mono`; the Jest projects `native` and `web`.

- [ ] **Step 1: Widen the declared scope, open the slice, advance the ticket**

```bash
bash ~/.claude/skills/task-start/scripts/task-tier.sh set complex "Replaces the Vite build with Expo and rewrites every component onto React Native across all layers" --ticket IAN-564 --scope "app,components,state,services,clients,config,constants,content,scripts,.github,docs,package.json,package-lock.json,app.config.ts,babel.config.js,metro.config.js,tailwind.config.js,global.css,nativewind-env.d.ts,tsconfig.json,jest.config.js,jest.setup.ts,eas.json,README.md,.gitignore"
bash ~/.claude/enforce/tdd.sh open "slice 1: Expo scaffold" --spec docs/superpowers/specs/2026-10-02-expo-universal-app-design.md
```

Advance IAN-564 to `in-progress` through `/ticket-lifecycle` in the same turn.

- [ ] **Step 2: Install Expo and align React**

```bash
npm install expo
npx expo install expo-router expo-linking expo-constants expo-status-bar react-native react-native-web react-dom react-native-safe-area-context react-native-screens react-native-reanimated nativewind @react-native-async-storage/async-storage expo-crypto @tanstack/react-query @react-native-community/netinfo
npm install --save-dev tailwindcss@^3.4 typescript @types/react jest jest-expo @testing-library/react-native tsx
npx expo install --fix
```

Expected: `npx expo install --fix` reports every package compatible with the installed SDK. Each new dependency is justified in the PR body under R-331 from the spec's owner decisions and stack options (`tsx` runs the TypeScript validators from the Node build script in Task 6, instead of duplicating them in JavaScript). Then confirm the Vite app still builds with the aligned React version:

```bash
npx vite build
```

Expected: `built in`. If Vite fails on the React upgrade, stop and report; do not pin React below the SDK's version.

- [ ] **Step 3: Add the toolchain config files**

`package.json` additions (keep every existing script; Vite keeps building until PR 3):

```json
{
  "main": "expo-router/entry",
  "scripts": {
    "expo:start": "expo start",
    "test": "node --test src/__tests__/highlightQuestionCode.test.js && jest"
  }
}
```

`app.config.ts`:

```ts
// Expo configuration. The web base path and the content URL depend on the
// build target, so the pre-cutover preview build can live under
// /syntactical/preview without touching the live site.
import type { ExpoConfig } from 'expo/config';

const BASE_URL = process.env.EXPO_BASE_URL ?? '/syntactical';
const CONTENT_BASE_URL = `https://nullvoidundefined.github.io${BASE_URL}/content/`;

const config: ExpoConfig = {
  name: 'Syntactical',
  slug: 'syntactical',
  scheme: 'syntactical',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  ios: { bundleIdentifier: 'dev.nullvoidundefined.syntactical', supportsTablet: true },
  android: { package: 'dev.nullvoidundefined.syntactical' },
  web: { bundler: 'metro', output: 'single', favicon: './public/favicon.svg' },
  plugins: ['expo-router'],
  experiments: { baseUrl: BASE_URL, typedRoutes: true },
  extra: { contentBaseUrl: CONTENT_BASE_URL },
};

export default config;
```

`babel.config.js`:

```js
// Babel for Expo with NativeWind's JSX transform.
module.exports = function configureBabel(api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'nativewind' }], 'nativewind/babel'],
  };
};
```

`metro.config.js`:

```js
// Metro with NativeWind's CSS pipeline.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);
module.exports = withNativeWind(config, { input: './global.css' });
```

`tailwind.config.js` (the theme from `src/index.css`, moved for Tailwind 3):

```js
// Tailwind 3 theme for NativeWind 4: the obsidian/signal palette and fonts
// that src/index.css declared in a Tailwind 4 @theme block.
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        obsidian: '#05060a',
        surface: '#0d0f14',
        'surface-raised': '#12151c',
        line: '#1c1f26',
        ink: '#e6e8eb',
        muted: '#7c828c',
        signal: '#39e88f',
        danger: '#ff5470',
        amber: '#e0a458',
        violet: '#b98ee8',
        cyan: '#5fb8e0',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
};
```

`global.css`:

```css
/* Tailwind entry for NativeWind. */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`nativewind-env.d.ts`:

```ts
/// <reference types="nativewind/types" />
```

`tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": { "strict": true, "resolveJsonModule": true },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts", "nativewind-env.d.ts"],
  "exclude": ["src", "node_modules", "dist", "dist-expo"]
}
```

`jest.config.js`:

```js
// Two Jest projects: native components and logic under the iOS preset,
// and DOM assertions for the web build in files ending .web.test.tsx.
const shared = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/src/', '/dist'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|expo-router|nativewind|react-native-css-interop|@tanstack/.*))',
  ],
};

module.exports = {
  projects: [
    {
      ...shared,
      displayName: 'native',
      preset: 'jest-expo/ios',
      testMatch: ['**/__tests__/**/*.test.ts?(x)'],
      testPathIgnorePatterns: [...shared.testPathIgnorePatterns, '\\.web\\.test\\.tsx?$'],
    },
    {
      ...shared,
      displayName: 'web',
      preset: 'jest-expo/web',
      testMatch: ['**/__tests__/**/*.web.test.ts?(x)'],
    },
  ],
};
```

`jest.setup.ts`:

```ts
// Jest setup: AsyncStorage's in-memory mock, and a fetch that never
// resolves unless a test replaces it, so no test reaches the network.
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';

jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);

beforeEach(() => {
  global.fetch = jest.fn(() => new Promise(() => {})) as unknown as typeof fetch;
});
```

`.gitignore` additions: `.expo/`, `dist-expo/`, `expo-env.d.ts`.

- [ ] **Step 4: Write the failing tests**

`app/__tests__/rootLayout.test.tsx`:

```tsx
import { renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../_layout';
import HomeScreen from '../index';

describe('root layout on native', () => {
  it('renders exactly one header-role title', async () => {
    renderRouter({ _layout: RootLayout, index: HomeScreen }, { initialUrl: '/' });
    expect(await screen.findAllByRole('header')).toHaveLength(1);
    expect(screen.getByRole('header')).toHaveTextContent('syntactical_');
  });
});
```

`app/__tests__/rootLayout.web.test.tsx`:

```tsx
import { renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../_layout';
import HomeScreen from '../index';

describe('root layout on the web', () => {
  it('renders exactly one h1', async () => {
    renderRouter({ _layout: RootLayout, index: HomeScreen }, { initialUrl: '/' });
    await screen.findByText('syntactical', { exact: false });
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });
});
```

- [ ] **Step 5: Run the tests to verify they fail**

```bash
npx jest app/__tests__ ; bash ~/.claude/enforce/tdd.sh red app/__tests__/rootLayout.test.tsx app/__tests__/rootLayout.web.test.tsx
```

Expected: FAIL with "Cannot find module '../_layout'".

- [ ] **Step 6: Write the minimal layout and home screen**

`app/_layout.tsx`:

```tsx
// Root layout: global styles and the safe-area provider around every route.
import '../global.css';
import { Slot } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Slot />
    </SafeAreaProvider>
  );
}
```

`app/index.tsx`:

```tsx
// Language step route. Renders the app title until the menu lands in Task 12.
import { Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-obsidian">
      <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
        syntactical<Text className="text-signal">_</Text>
      </Text>
    </View>
  );
}
```

- [ ] **Step 7: Run the tests to verify they pass**

```bash
npx jest app/__tests__ && bash ~/.claude/enforce/tdd.sh green
```

Expected: 2 passed (one per project).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json app.config.ts babel.config.js metro.config.js tailwind.config.js global.css nativewind-env.d.ts tsconfig.json jest.config.js jest.setup.ts .gitignore app
git commit -m "feat(expo): scaffold the Expo app beside the Vite app

Refs: IAN-564"
```

### Task 2: Static-host routing, CI, and the preview deploy (B-2)

**Files:**
- Create: `scripts/copySpaFallback.mjs`, `app/+not-found.tsx`, `.github/workflows/ci.yml`
- Modify: `.github/workflows/deploy.yml`, `package.json`
- Test: `scripts/__tests__/copySpaFallback.test.ts`, `app/__tests__/routing.test.tsx`

**Interfaces:**
- Consumes: `RootLayout` from Task 1.
- Produces: `copySpaFallback(outputDir: string): Promise<void>`; npm script `expo:export:preview`; `NotFoundScreen` default export.

- [ ] **Step 1: Write the failing tests**

`scripts/__tests__/copySpaFallback.test.ts`:

```ts
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copySpaFallback } from '../copySpaFallback.mjs';

describe('copySpaFallback', () => {
  it('copies index.html to 404.html and writes .nojekyll', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'spa-'));
    await writeFile(join(outputDir, 'index.html'), '<div id="root"></div>');
    await copySpaFallback(outputDir);
    expect(await readFile(join(outputDir, '404.html'), 'utf8')).toBe('<div id="root"></div>');
    await expect(access(join(outputDir, '.nojekyll'))).resolves.toBeUndefined();
  });
});
```

`app/__tests__/routing.test.tsx`:

```tsx
import { Text } from 'react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import RootLayout from '../_layout';
import NotFoundScreen from '../+not-found';

function RoundRouteProbe() {
  return <Text>round route</Text>;
}

describe('routing', () => {
  it('resolves a language id that did not exist at build time', async () => {
    renderRouter(
      { _layout: RootLayout, '[language]/[difficulty]': RoundRouteProbe, '+not-found': NotFoundScreen },
      { initialUrl: '/elixir/easy' },
    );
    expect(await screen.findByText('round route')).toBeTruthy();
  });

  it('renders the not-found screen with a menu link for an unmatched path', async () => {
    renderRouter({ _layout: RootLayout, '+not-found': NotFoundScreen }, { initialUrl: '/a/b/c' });
    expect(await screen.findByText('Not found')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Back to menu' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx jest scripts/__tests__/copySpaFallback.test.ts app/__tests__/routing.test.tsx ; bash ~/.claude/enforce/tdd.sh red scripts/__tests__/copySpaFallback.test.ts app/__tests__/routing.test.tsx
```

Expected: FAIL with "Cannot find module '../copySpaFallback.mjs'" and "Cannot find module '../+not-found'".

- [ ] **Step 3: Implement**

`scripts/copySpaFallback.mjs`:

```js
// GitHub Pages has no rewrite rules, so a direct load of a client route
// would 404. Serving index.html as 404.html lets the router resolve any
// path, and .nojekyll stops Pages from dropping Expo's underscore files.
import { copyFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function copySpaFallback(outputDir) {
  await copyFile(join(outputDir, 'index.html'), join(outputDir, '404.html'));
  await writeFile(join(outputDir, '.nojekyll'), '');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await copySpaFallback(process.argv[2] ?? 'dist');
}
```

`app/+not-found.tsx`:

```tsx
// Shown for any URL that matches no route, including an unknown
// language or difficulty id.
import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-obsidian px-4">
      <Text role="heading" aria-level={1} className="font-mono text-2xl text-ink">
        Not found
      </Text>
      <Link href="/" role="link" className="mt-4 font-mono text-sm text-signal">
        Back to menu
      </Link>
    </View>
  );
}
```

`package.json` script:

```json
"expo:export:preview": "EXPO_BASE_URL=/syntactical/preview expo export --platform web --output-dir dist-expo && node scripts/copySpaFallback.mjs dist-expo"
```

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  pull_request:
    branches: [main]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm test
      - run: npm run build
      - run: npm run expo:export:preview
```

`.github/workflows/deploy.yml` build job, replacing the Build and Upload steps:

```yaml
      - name: Build the Vite site
        run: npm run build

      - name: Build the Expo preview
        run: npm run expo:export:preview

      - name: Compose the Pages artifact
        run: mkdir -p dist/preview && cp -R dist-expo/. dist/preview/

      - name: Upload build artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist
```

GitHub Pages serves only the root `404.html`, so a direct load of a preview deep link shows the Vite app. That is acceptable for a preview; the cutover in Task 22 puts the Expo `404.html` at the root, which makes B-2 hold in production.

- [ ] **Step 4: Run the tests to verify they pass, then build locally**

```bash
npx jest scripts/__tests__/copySpaFallback.test.ts app/__tests__/routing.test.tsx && bash ~/.claude/enforce/tdd.sh green
npm run expo:export:preview && ls dist-expo/404.html dist-expo/.nojekyll
```

Expected: tests pass; both files listed.

- [ ] **Step 5: Close the slice and commit**

```bash
bash ~/.claude/enforce/tdd.sh close
git add scripts app .github package.json
git commit -m "feat(expo): static-host routing, PR CI, and the preview deploy

Refs: IAN-564"
```

### Task 3: AsyncStorage client and log client (B-3)

**Files:**
- Create: `clients/storageClient.ts`, `clients/logClient.ts`
- Test: `clients/__tests__/storageClient.test.ts`

**Interfaces:**
- Produces: `readJson<T>(key: string, fallback: T): Promise<T>`; `writeJson(key: string, value: unknown): Promise<boolean>` (true when persisted); `logWarning(context: Record<string, unknown>, message: string): void`.

- [ ] **Step 1: Open slice 2 and write the failing test**

```bash
bash ~/.claude/enforce/tdd.sh open "slice 2: storage and stats" --spec docs/superpowers/specs/2026-10-02-expo-universal-app-design.md
```

`clients/__tests__/storageClient.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readJson, writeJson } from '../storageClient';

describe('storageClient', () => {
  beforeEach(() => AsyncStorage.clear());

  it('returns the fallback when the key is missing', async () => {
    expect(await readJson('missing', { empty: true })).toEqual({ empty: true });
  });

  it('returns the fallback when the stored value is not valid JSON', async () => {
    await AsyncStorage.setItem('broken', '{not json');
    expect(await readJson('broken', 7)).toBe(7);
  });

  it('returns the fallback when storage throws', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('unavailable'));
    expect(await readJson('any', 'fallback')).toBe('fallback');
  });

  it('round-trips a value', async () => {
    expect(await writeJson('stats', { a: 1 })).toBe(true);
    expect(await readJson('stats', null)).toEqual({ a: 1 });
  });

  it('resolves false without throwing when storage rejects the write', async () => {
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('quota'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(writeJson('stats', { a: 1 })).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest clients/__tests__/storageClient.test.ts ; bash ~/.claude/enforce/tdd.sh red clients/__tests__/storageClient.test.ts
```

Expected: FAIL with "Cannot find module '../storageClient'".

- [ ] **Step 3: Implement**

`clients/logClient.ts`:

```ts
// One place the app writes diagnostic warnings: a context object first,
// a fixed message second, values never interpolated into the message.
export function logWarning(context: Record<string, unknown>, message: string): void {
  console.warn(JSON.stringify({ level: 'warn', message, ...context }));
}
```

`clients/storageClient.ts`:

```ts
// Thin wrapper around AsyncStorage: JSON (de)serialization and defensive
// handling of unavailable or corrupt storage. On the web AsyncStorage is
// backed by localStorage, so keys written by the old Vite build carry over.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logWarning } from './logClient';

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<boolean> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    logWarning({ key, err: String(err) }, 'storage write failed');
    return false;
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx jest clients/__tests__/storageClient.test.ts
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add clients
git commit -m "feat(storage): AsyncStorage JSON client with defensive reads and writes

Refs: IAN-564"
```

### Task 4: Stats service port, hydration, and write queue (B-4 to B-8)

**Files:**
- Create: `constants/appConfig.ts`, `services/stats/statsService.ts`, `state/StatsProvider.tsx`
- Modify: `app/_layout.tsx`
- Test: `services/stats/__tests__/statsService.test.ts`, `state/__tests__/StatsProvider.test.tsx`, `state/__tests__/StatsProvider.web.test.tsx`

**Interfaces:**
- Consumes: `readJson`, `writeJson` (Task 3).
- Produces:
  - `type Stats = { version: number; streak: { current: number; best: number }; totals: { attempted: number; correct: number }; tracks: Record<string, { attempted: number; correct: number; completions: number }> }`
  - `createEmptyStats(): Stats`, `buildStatsKey({ language, difficulty }): string`, `recordAnswer(stats: Stats, event: { language: string; difficulty: string; wasCorrect: boolean }): Stats`, `recordCompletion(stats: Stats, event: { language: string; difficulty: string }): Stats`
  - `StatsProvider` component; `useQuizStats(): { stats: Stats; isHydrated: boolean; recordAnswer(event): void; recordCompletion(event): void }`
  - `constants/appConfig.ts` exports `DIFFICULTIES`, `DifficultyId`, `STORAGE_KEY`, `STORAGE_SCHEMA_VERSION`, `QUESTION_TYPES`.

- [ ] **Step 1: Write the failing tests**

`services/stats/__tests__/statsService.test.ts`:

```ts
import { createEmptyStats, recordAnswer, recordCompletion } from '../statsService';

const python = { language: 'python', difficulty: 'easy' };

describe('statsService', () => {
  it('counts a correct answer, extends the streak, and raises the best streak', () => {
    const stats = recordAnswer(createEmptyStats(), { ...python, wasCorrect: true });
    expect(stats.totals).toEqual({ attempted: 1, correct: 1 });
    expect(stats.streak).toEqual({ current: 1, best: 1 });
    expect(stats.tracks['python:easy']).toEqual({ attempted: 1, correct: 1, completions: 0 });
  });

  it('resets the current streak on an incorrect answer and keeps the best', () => {
    let stats = createEmptyStats();
    stats = recordAnswer(stats, { ...python, wasCorrect: true });
    stats = recordAnswer(stats, { ...python, wasCorrect: true });
    stats = recordAnswer(stats, { ...python, wasCorrect: false });
    expect(stats.streak).toEqual({ current: 0, best: 2 });
    expect(stats.totals).toEqual({ attempted: 3, correct: 2 });
  });

  it('keeps per-language and per-difficulty counts separate', () => {
    let stats = createEmptyStats();
    stats = recordAnswer(stats, { ...python, wasCorrect: true });
    stats = recordAnswer(stats, { language: 'postgres', difficulty: 'hard', wasCorrect: false });
    expect(stats.tracks['python:easy']).toEqual({ attempted: 1, correct: 1, completions: 0 });
    expect(stats.tracks['postgres:hard']).toEqual({ attempted: 1, correct: 0, completions: 0 });
  });

  it('records exactly one completion per call', () => {
    const stats = recordCompletion(createEmptyStats(), python);
    expect(stats.tracks['python:easy'].completions).toBe(1);
  });
});
```

`state/__tests__/StatsProvider.test.tsx`:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';
import { StatsProvider, useQuizStats } from '../StatsProvider';
import { STORAGE_KEY } from '../../constants/appConfig';

function StatsProbe() {
  const { stats, isHydrated, recordAnswer } = useQuizStats();
  return (
    <>
      <Text testID="hydrated">{String(isHydrated)}</Text>
      <Text testID="attempted">{stats.totals.attempted}</Text>
      <Pressable
        testID="answer"
        onPress={() => recordAnswer({ language: 'python', difficulty: 'easy', wasCorrect: true })}
      />
    </>
  );
}

const storedHistory = {
  version: 1,
  streak: { current: 2, best: 5 },
  totals: { attempted: 10, correct: 8 },
  tracks: {},
};

async function readSavedAttempted(): Promise<number> {
  const saved = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
  return saved.totals.attempted;
}

describe('StatsProvider', () => {
  beforeEach(() => AsyncStorage.clear());

  it('adds an answer recorded right after hydration to the stored history', async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(storedHistory));
    render(<StatsProvider><StatsProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    fireEvent.press(screen.getByTestId('answer'));
    await waitFor(async () => expect(await readSavedAttempted()).toBe(11));
  });

  it('ignores answers and writes nothing before hydration completes', async () => {
    let releaseRead: (value: string | null) => void = () => {};
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(
      () => new Promise((resolve) => { releaseRead = resolve; }),
    );
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    render(<StatsProvider><StatsProbe /></StatsProvider>);
    fireEvent.press(screen.getByTestId('answer'));
    expect(screen.getByTestId('hydrated')).toHaveTextContent('false');
    await act(async () => releaseRead(JSON.stringify(storedHistory)));
    expect(screen.getByTestId('attempted')).toHaveTextContent('10');
    expect(setItem).not.toHaveBeenCalled();
  });

  it('persists two back-to-back answers in order', async () => {
    render(<StatsProvider><StatsProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    fireEvent.press(screen.getByTestId('answer'));
    fireEvent.press(screen.getByTestId('answer'));
    await waitFor(async () => expect(await readSavedAttempted()).toBe(2));
  });

  it('keeps in-memory stats when a write fails', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    render(<StatsProvider><StatsProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'));
    jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('quota'));
    fireEvent.press(screen.getByTestId('answer'));
    fireEvent.press(screen.getByTestId('answer'));
    await waitFor(() => expect(screen.getByTestId('attempted')).toHaveTextContent('2'));
  });
});
```

`state/__tests__/StatsProvider.web.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { StatsProvider, useQuizStats } from '../StatsProvider';

jest.unmock('@react-native-async-storage/async-storage');

function AttemptedProbe() {
  const { stats } = useQuizStats();
  return <Text testID="attempted">{stats.totals.attempted}</Text>;
}

describe('stats carried over from the Vite build', () => {
  it('reads stats the Vite build wrote to localStorage', async () => {
    window.localStorage.setItem(
      'syntactical.stats.v1',
      JSON.stringify({ version: 1, streak: { current: 0, best: 3 }, totals: { attempted: 42, correct: 30 }, tracks: {} }),
    );
    render(<StatsProvider><AttemptedProbe /></StatsProvider>);
    await waitFor(() => expect(screen.getByTestId('attempted')).toHaveTextContent('42'));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest services/stats state/__tests__/StatsProvider ; bash ~/.claude/enforce/tdd.sh red services/stats/__tests__/statsService.test.ts state/__tests__/StatsProvider.test.tsx state/__tests__/StatsProvider.web.test.tsx
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement**

`constants/appConfig.ts`:

```ts
// Static app configuration: the difficulty display registry, question
// types, and storage keys. Languages come from the fetched manifest.
export const DIFFICULTIES = [
  { id: 'easy', label: 'Easy', description: 'Foundational syntax and idioms, still language-specific.' },
  { id: 'medium', label: 'Medium', description: 'Core syntax and everyday behavior.' },
  { id: 'hard', label: 'Hard', description: 'Internals, edge cases, and the questions that bite in review.' },
] as const;

export type DifficultyId = (typeof DIFFICULTIES)[number]['id'];

export const QUESTION_TYPES = { MULTIPLE_CHOICE: 'mc', BOOLEAN: 'bool' } as const;

export const STORAGE_KEY = 'syntactical.stats.v1';
export const STORAGE_SCHEMA_VERSION = 1;
```

`services/stats/statsService.ts` (logic unchanged from `src/services/statsService.js`, typed):

```ts
// Pure stats folding: each function returns a new stats object from an
// event. The persisted `tracks` field keeps its name so saved stats load.
import { STORAGE_SCHEMA_VERSION } from '../../constants/appConfig';

export type LanguageDifficultyStats = { attempted: number; correct: number; completions: number };
export type Stats = {
  version: number;
  streak: { current: number; best: number };
  totals: { attempted: number; correct: number };
  tracks: Record<string, LanguageDifficultyStats>;
};
type RoundKey = { language: string; difficulty: string };

export function createEmptyStats(): Stats {
  return {
    version: STORAGE_SCHEMA_VERSION,
    streak: { current: 0, best: 0 },
    totals: { attempted: 0, correct: 0 },
    tracks: {},
  };
}

export function buildStatsKey({ language, difficulty }: RoundKey): string {
  return `${language}:${difficulty}`;
}

function readLanguageDifficultyStats(stats: Stats, roundKey: RoundKey): LanguageDifficultyStats {
  return stats.tracks[buildStatsKey(roundKey)] ?? { attempted: 0, correct: 0, completions: 0 };
}

export function recordAnswer(stats: Stats, event: RoundKey & { wasCorrect: boolean }): Stats {
  const { wasCorrect } = event;
  const currentStreak = wasCorrect ? stats.streak.current + 1 : 0;
  const entry = readLanguageDifficultyStats(stats, event);
  return {
    ...stats,
    streak: { current: currentStreak, best: Math.max(stats.streak.best, currentStreak) },
    totals: {
      attempted: stats.totals.attempted + 1,
      correct: stats.totals.correct + (wasCorrect ? 1 : 0),
    },
    tracks: {
      ...stats.tracks,
      [buildStatsKey(event)]: {
        ...entry,
        attempted: entry.attempted + 1,
        correct: entry.correct + (wasCorrect ? 1 : 0),
      },
    },
  };
}

export function recordCompletion(stats: Stats, event: RoundKey): Stats {
  const entry = readLanguageDifficultyStats(stats, event);
  return {
    ...stats,
    tracks: { ...stats.tracks, [buildStatsKey(event)]: { ...entry, completions: entry.completions + 1 } },
  };
}
```

`state/StatsProvider.tsx`:

```tsx
// Owns lifetime stats for the whole app: reads them once at startup,
// refuses changes until that read completes, then persists every change
// through one ordered write queue. In-memory stats stay authoritative
// when a write fails.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { readJson, writeJson } from '../clients/storageClient';
import { STORAGE_KEY } from '../constants/appConfig';
import {
  createEmptyStats,
  recordAnswer as foldAnswer,
  recordCompletion as foldCompletion,
  type Stats,
} from '../services/stats/statsService';

type RoundKey = { language: string; difficulty: string };
type StatsContextValue = {
  stats: Stats;
  isHydrated: boolean;
  recordAnswer: (event: RoundKey & { wasCorrect: boolean }) => void;
  recordCompletion: (event: RoundKey) => void;
};

const StatsContext = createContext<StatsContextValue | null>(null);

export function StatsProvider({ children }: { children: ReactNode }) {
  const [stats, setStats] = useState<Stats>(createEmptyStats);
  const [isHydrated, setIsHydrated] = useState(false);
  const statsRef = useRef<Stats>(stats);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    readJson(STORAGE_KEY, createEmptyStats()).then((stored) => {
      statsRef.current = stored;
      setStats(stored);
      setIsHydrated(true);
    });
  }, []);

  const applyChange = useCallback(
    (fold: (current: Stats) => Stats) => {
      if (!isHydrated) return;
      const next = fold(statsRef.current);
      statsRef.current = next;
      setStats(next);
      writeQueue.current = writeQueue.current.then(() => writeJson(STORAGE_KEY, next));
    },
    [isHydrated],
  );

  const value = useMemo<StatsContextValue>(
    () => ({
      stats,
      isHydrated,
      recordAnswer: (event) => applyChange((current) => foldAnswer(current, event)),
      recordCompletion: (event) => applyChange((current) => foldCompletion(current, event)),
    }),
    [stats, isHydrated, applyChange],
  );

  return <StatsContext.Provider value={value}>{children}</StatsContext.Provider>;
}

export function useQuizStats(): StatsContextValue {
  const value = useContext(StatsContext);
  if (!value) throw new Error('useQuizStats must be used inside StatsProvider');
  return value;
}
```

The fold runs against `statsRef` outside the state updater, so two presses in the same tick fold in order and enqueue exactly one write each, and React Strict Mode's double-invoked updaters cannot enqueue duplicates.

`app/_layout.tsx`: wrap `<Slot />` in `<StatsProvider>`.

- [ ] **Step 4: Run to verify they pass**

```bash
npx jest services/stats state/__tests__/StatsProvider && bash ~/.claude/enforce/tdd.sh green
```

Expected: all pass in both projects.

- [ ] **Step 5: Close the slice and commit**

```bash
bash ~/.claude/enforce/tdd.sh close
git add constants services/stats state app/_layout.tsx
git commit -m "feat(stats): port the stats service with hydration and an ordered write queue

Refs: IAN-564"
```

### Task 5: Export the question banks to JSON (B-9)

Slice 3 is high-risk: Tasks 5 to 10 run the `test-author`, `implementer`, and `slice-critic` triad. The test code in these tasks is the test-author's brief; the implementation code is the implementer's brief.

**Files:**
- Create: `scripts/exportQuestionBanks.mjs`, `content/manifest.json`, `content/{python,postgres,javascript}/{easy,medium,hard}.json`
- Test: `scripts/__tests__/exportQuestionBanks.test.ts`

**Interfaces:**
- Produces: `exportQuestionBanks(contentDir: string): Promise<void>`; the manifest shape `{ schemaVersion: 1, languages: [{ id, label, glyph, tagline, grammar, banks: { [difficulty]: { path, hash } } }] }` with `hash: ""` until Task 6 fills it.

- [ ] **Step 1: Open slice 3 and write the failing test**

```bash
bash ~/.claude/enforce/tdd.sh open "slice 3: content" --spec docs/superpowers/specs/2026-10-02-expo-universal-app-design.md
```

`scripts/__tests__/exportQuestionBanks.test.ts`:

```ts
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportQuestionBanks } from '../exportQuestionBanks.mjs';
import { getQuestionBank } from '../../src/data/index.js';

const LANGUAGE_IDS = ['python', 'postgres', 'javascript'];
const DIFFICULTY_IDS = ['easy', 'medium', 'hard'];

describe('exportQuestionBanks', () => {
  it('writes nine banks that deep-equal the src/data modules', async () => {
    const contentDir = await mkdtemp(join(tmpdir(), 'content-'));
    await exportQuestionBanks(contentDir);
    for (const language of LANGUAGE_IDS) {
      for (const difficulty of DIFFICULTY_IDS) {
        const bank = JSON.parse(await readFile(join(contentDir, language, `${difficulty}.json`), 'utf8'));
        expect(bank).toEqual({ schemaVersion: 1, questions: getQuestionBank(language, difficulty) });
      }
    }
  });

  it('writes a manifest listing the three languages with grammars and bank paths', async () => {
    const contentDir = await mkdtemp(join(tmpdir(), 'content-'));
    await exportQuestionBanks(contentDir);
    const manifest = JSON.parse(await readFile(join(contentDir, 'manifest.json'), 'utf8'));
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.languages.map((entry: { id: string }) => entry.id)).toEqual(LANGUAGE_IDS);
    expect(manifest.languages.map((entry: { grammar: string }) => entry.grammar)).toEqual(['python', 'sql', 'javascript']);
    expect(manifest.languages[1].banks.medium.path).toBe('postgres/medium.json');
  });
});
```

The `src/` ignore pattern in `jest.config.js` covers test discovery only; importing `src/data` from this test still works. This test is deleted in Task 22 together with `src/data` (spec amendment 1).

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest scripts/__tests__/exportQuestionBanks.test.ts ; bash ~/.claude/enforce/tdd.sh red scripts/__tests__/exportQuestionBanks.test.ts
```

Expected: FAIL with "Cannot find module '../exportQuestionBanks.mjs'".

- [ ] **Step 3: Implement**

`scripts/exportQuestionBanks.mjs`:

```js
// One-time conversion of the src/data question modules into content/ JSON.
// After PR 3 deletes src/data, content/ is the only place questions live.
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getQuestionBank } from '../src/data/index.js';
import { LANGUAGES } from '../src/constants/appConfig.js';

const GRAMMAR_BY_LANGUAGE = { python: 'python', postgres: 'sql', javascript: 'javascript' };

async function writeJsonFile(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function buildLanguageEntry(language) {
  const { id, label, glyph, tagline, difficulties } = language;
  const banks = Object.fromEntries(
    difficulties.map((difficulty) => [difficulty, { path: `${id}/${difficulty}.json`, hash: '' }]),
  );
  return { id, label, glyph, tagline, grammar: GRAMMAR_BY_LANGUAGE[id], banks };
}

export async function exportQuestionBanks(contentDir) {
  for (const language of LANGUAGES) {
    await mkdir(join(contentDir, language.id), { recursive: true });
    for (const difficulty of language.difficulties) {
      const questions = getQuestionBank(language.id, difficulty);
      await writeJsonFile(join(contentDir, language.id, `${difficulty}.json`), { schemaVersion: 1, questions });
    }
  }
  await writeJsonFile(join(contentDir, 'manifest.json'), {
    schemaVersion: 1,
    languages: LANGUAGES.map(buildLanguageEntry),
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await exportQuestionBanks(process.argv[2] ?? 'content');
}
```

- [ ] **Step 4: Run to verify it passes, then export the real content**

```bash
npx jest scripts/__tests__/exportQuestionBanks.test.ts
node scripts/exportQuestionBanks.mjs content && ls content/*/
```

Expected: 2 passed; nine JSON files listed.

- [ ] **Step 5: Commit**

```bash
git add scripts content
git commit -m "feat(content): export the question banks to content JSON

Refs: IAN-564"
```

### Task 6: Build-time hashing, validation, and the bundled index (B-10, Review Focus 1)

Run Task 7 before this task: the build script imports Task 7's validators.

**Files:**
- Create: `scripts/buildContentManifest.mjs`, `services/content/bundledContent.generated.ts` (generated, committed)
- Modify: `package.json`, `.github/workflows/ci.yml`
- Test: `scripts/__tests__/buildContentManifest.test.ts`

**Interfaces:**
- Consumes: `validateManifest`, `validateQuestionBank` (Task 7), loaded from Node through `tsx`.
- Produces: `buildContentManifest(contentDir: string, generatedPath: string): Promise<void>`; `bundledContent.generated.ts` exporting `BUNDLED_MANIFEST` (the manifest object with hashes) and `BUNDLED_BANKS: Record<string, unknown>` keyed `<language>/<difficulty>`.

- [ ] **Step 1: Write the failing tests**

`scripts/__tests__/buildContentManifest.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContentManifest } from '../buildContentManifest.mjs';

async function copyContent(): Promise<string> {
  const contentDir = await mkdtemp(join(tmpdir(), 'content-'));
  await cp('content', contentDir, { recursive: true });
  return contentDir;
}

describe('buildContentManifest', () => {
  it('writes the SHA-256 of each bank file into the manifest', async () => {
    const contentDir = await copyContent();
    await buildContentManifest(contentDir, join(contentDir, 'generated.ts'));
    const manifest = JSON.parse(await readFile(join(contentDir, 'manifest.json'), 'utf8'));
    const bankBytes = await readFile(join(contentDir, 'python/easy.json'));
    expect(manifest.languages[0].banks.easy.hash).toBe(createHash('sha256').update(bankBytes).digest('hex'));
  });

  it('writes a bundled index that requires every bank', async () => {
    const contentDir = await copyContent();
    const generatedPath = join(contentDir, 'generated.ts');
    await buildContentManifest(contentDir, generatedPath);
    const generated = await readFile(generatedPath, 'utf8');
    expect(generated).toContain("'python/easy': require(");
    expect(generated).toContain('export const BUNDLED_MANIFEST');
  });

  it('rejects a malformed bank at build time', async () => {
    const contentDir = await copyContent();
    await writeFile(join(contentDir, 'python/easy.json'), JSON.stringify({ schemaVersion: 1, questions: [] }));
    await expect(buildContentManifest(contentDir, join(contentDir, 'generated.ts'))).rejects.toThrow('python/easy.json');
  });

  it('rejects a manifest with a duplicate language id at build time', async () => {
    const contentDir = await copyContent();
    const manifestPath = join(contentDir, 'manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.languages.push(manifest.languages[0]);
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(buildContentManifest(contentDir, join(contentDir, 'generated.ts'))).rejects.toThrow('manifest');
  });

  it('rejects a bank file with a UTF-8 byte-order mark', async () => {
    const contentDir = await copyContent();
    const bankPath = join(contentDir, 'python/easy.json');
    const bytes = await readFile(bankPath);
    await writeFile(bankPath, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), bytes]));
    await expect(buildContentManifest(contentDir, join(contentDir, 'generated.ts'))).rejects.toThrow('byte-order mark');
  });
});
```

The byte-order-mark rule exists because the build hashes file bytes while the app hashes decoded UTF-8 text (Task 9); the two agree only for UTF-8 without a BOM.

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest scripts/__tests__/buildContentManifest.test.ts ; bash ~/.claude/enforce/tdd.sh red scripts/__tests__/buildContentManifest.test.ts
```

Expected: FAIL with "Cannot find module '../buildContentManifest.mjs'".

- [ ] **Step 3: Implement**

`scripts/buildContentManifest.mjs`:

```js
// Runs before every web export and deploy: validates every bank and the
// manifest with the app's own validators, writes each bank's SHA-256 into
// the manifest, and regenerates the bundled-content index the app ships.
// A validation failure throws, so a bad edit fails the deploy instead of
// reaching devices.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { validateManifest } from '../services/content/validateManifest.ts';
import { validateQuestionBank } from '../services/content/validateQuestionBank.ts';

const UTF8_BOM = [0xef, 0xbb, 0xbf];

function hasByteOrderMark(bytes) {
  return UTF8_BOM.every((byte, index) => bytes[index] === byte);
}

async function hashAndCheckBank(contentDir, bankPath) {
  const bytes = await readFile(join(contentDir, bankPath));
  if (hasByteOrderMark(bytes)) throw new Error(`${bankPath}: has a byte-order mark`);
  const result = validateQuestionBank(JSON.parse(bytes.toString('utf8')));
  if (!result.isValid) throw new Error(`${bankPath}: ${result.rule}`);
  if (result.droppedQuestionIds.length > 0) {
    throw new Error(`${bankPath}: invalid questions ${result.droppedQuestionIds.join(', ')}`);
  }
  return createHash('sha256').update(bytes).digest('hex');
}

function renderBundledIndex(manifest, contentDir, generatedPath) {
  const requireBase = relative(dirname(generatedPath), contentDir) || '.';
  const requireLines = manifest.languages.flatMap((language) =>
    Object.values(language.banks).map(
      (bank) => `  '${bank.path.replace(/\.json$/, '')}': require('${requireBase}/${bank.path}'),`,
    ),
  );
  return [
    '// Generated by scripts/buildContentManifest.mjs. Do not edit by hand.',
    '// The manifest and banks the app ships as its offline fallback.',
    `export const BUNDLED_MANIFEST = ${JSON.stringify(manifest, null, 2)};`,
    '',
    'export const BUNDLED_BANKS: Record<string, unknown> = {',
    ...requireLines,
    '};',
    '',
  ].join('\n');
}

export async function buildContentManifest(contentDir, generatedPath) {
  const manifestPath = join(contentDir, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const language of manifest.languages ?? []) {
    for (const bank of Object.values(language.banks ?? {})) {
      bank.hash = await hashAndCheckBank(contentDir, bank.path);
    }
  }
  const manifestResult = validateManifest(manifest);
  if (!manifestResult.isValid) throw new Error(`manifest: ${manifestResult.rule}`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(generatedPath, renderBundledIndex(manifest, contentDir, generatedPath));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await buildContentManifest('content', 'services/content/bundledContent.generated.ts');
}
```

`package.json` scripts:

```json
"content:build": "tsx scripts/buildContentManifest.mjs",
"expo:export:preview": "npm run content:build && EXPO_BASE_URL=/syntactical/preview expo export --platform web --output-dir dist-expo && cp -R content dist-expo/content && node scripts/copySpaFallback.mjs dist-expo"
```

Add a CI step after `npm test` in `ci.yml` that fails when the committed manifest or generated index is stale:

```yaml
      - run: npm run content:build && git diff --exit-code content/manifest.json services/content/bundledContent.generated.ts
```

The deploy workflow already runs `expo:export:preview`, which now runs `content:build` and publishes `content/` beside the preview.

- [ ] **Step 4: Run to verify they pass, then generate the real files**

```bash
npx jest scripts/__tests__/buildContentManifest.test.ts
npm run content:build && git diff --stat content/manifest.json services/content/bundledContent.generated.ts
```

Expected: 5 passed; the manifest gains nine hashes and the generated file appears.

- [ ] **Step 5: Commit**

```bash
git add scripts content services/content/bundledContent.generated.ts package.json .github
git commit -m "feat(content): hash and validate banks at build time and generate the bundled index

Refs: IAN-564"
```

### Task 7: Manifest and bank validators, and the bank path rule (B-11, B-12, B-13 partial)

**Files:**
- Create: `services/content/contentTypes.ts`, `services/content/validateManifest.ts`, `services/content/validateQuestionBank.ts`, `services/content/resolveBankUrl.ts`
- Modify: `constants/appConfig.ts`
- Test: `services/content/__tests__/validateManifest.test.ts`, `services/content/__tests__/validateQuestionBank.test.ts`, `services/content/__tests__/resolveBankUrl.test.ts`

**Interfaces:**
- Produces:
  - `type Query = { title: string; explanation: string; syntax?: string; tags?: string[] }`
  - `type Question = ({ type: 'mc'; choices: string[]; answerIndex: number } | { type: 'bool'; answer: boolean }) & { id: string; prompt: string; code?: string; query: Query }`
  - `type BankEntry = { path: string; hash: string }`, `type LanguageEntry = { id: string; label: string; glyph: string; tagline: string; grammar: Grammar; banks: Partial<Record<DifficultyId, BankEntry>> }`, `type Manifest = { schemaVersion: number; languages: LanguageEntry[] }`
  - `validateManifest(input: unknown): { isValid: true; manifest: Manifest } | { isValid: false; rule: string }`
  - `validateQuestionBank(input: unknown): { isValid: true; questions: Question[]; droppedQuestionIds: string[] } | { isValid: false; rule: string }`
  - `resolveBankUrl(path: string, contentBaseUrl: string): string | null`
  - `isSafeBankPath(path: unknown): boolean`
  - `appConfig.ts` adds `SUPPORTED_SCHEMA_VERSION`, `GRAMMARS`, `Grammar`, `CONTENT_LIMITS`.

- [ ] **Step 1: Write the failing tests**

`services/content/__tests__/validateManifest.test.ts`:

```ts
import { validateManifest } from '../validateManifest';

const HASH = 'a'.repeat(64);

function buildManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    languages: [
      {
        id: 'python',
        label: 'Python',
        glyph: 'PY',
        tagline: 'Sharp edges.',
        grammar: 'python',
        banks: { easy: { path: 'python/easy.json', hash: HASH } },
        ...overrides,
      },
    ],
  };
}

describe('validateManifest', () => {
  it('accepts a well-formed manifest', () => {
    expect(validateManifest(buildManifest()).isValid).toBe(true);
  });

  it.each([
    ['a non-object root', []],
    ['a newer schemaVersion', { ...buildManifest(), schemaVersion: 2 }],
    ['an empty languages array', { schemaVersion: 1, languages: [] }],
  ])('rejects %s', (_label, input) => {
    expect(validateManifest(input).isValid).toBe(false);
  });

  it.each([
    ['an id with a colon', { id: 'py:thon' }],
    ['an id with a slash', { id: 'py/thon' }],
    ['an uppercase id', { id: 'Python' }],
    ['a missing label', { label: '' }],
    ['a tagline over 120 characters', { tagline: 'x'.repeat(121) }],
    ['an unknown grammar', { grammar: 'cobol' }],
    ['an empty banks object', { banks: {} }],
    ['an unknown difficulty key', { banks: { expert: { path: 'python/expert.json', hash: HASH } } }],
    ['a short hash', { banks: { easy: { path: 'python/easy.json', hash: 'abc' } } }],
    ['an uppercase hash', { banks: { easy: { path: 'python/easy.json', hash: 'A'.repeat(64) } } }],
    ['a traversal path', { banks: { easy: { path: '../easy.json', hash: HASH } } }],
    ['an absolute URL path', { banks: { easy: { path: 'https://evil.test/easy.json', hash: HASH } } }],
  ])('rejects a language with %s', (_label, overrides) => {
    expect(validateManifest(buildManifest(overrides)).isValid).toBe(false);
  });

  it('rejects duplicate language ids', () => {
    const manifest = buildManifest();
    manifest.languages.push({ ...manifest.languages[0] });
    expect(validateManifest(manifest)).toEqual({ isValid: false, rule: 'languages[1].id is a duplicate' });
  });
});
```

`services/content/__tests__/validateQuestionBank.test.ts`:

```ts
import { validateQuestionBank } from '../validateQuestionBank';

const query = { title: 'Title', explanation: 'Explanation' };
const mcQuestion = { id: 'py-easy-01', type: 'mc', prompt: 'Prompt?', choices: ['a', 'b'], answerIndex: 1, query };
const boolQuestion = { id: 'py-easy-02', type: 'bool', prompt: 'True?', answer: true, query };

function buildBank(questions: unknown[]) {
  return { schemaVersion: 1, questions };
}

describe('validateQuestionBank', () => {
  it('accepts valid multiple-choice and boolean questions', () => {
    const result = validateQuestionBank(buildBank([mcQuestion, boolQuestion]));
    expect(result).toEqual({ isValid: true, questions: [mcQuestion, boolQuestion], droppedQuestionIds: [] });
  });

  it.each([
    ['five choices', { choices: ['a', 'b', 'c', 'd', 'e'] }],
    ['one choice', { choices: ['a'], answerIndex: 0 }],
    ['an empty choice', { choices: ['a', ''] }],
    ['an answerIndex outside the choices', { answerIndex: 2 }],
    ['a fractional answerIndex', { answerIndex: 0.5 }],
    ['an uppercase id', { id: 'PY-1' }],
    ['an empty prompt', { prompt: '' }],
    ['a prompt over 2000 characters', { prompt: 'x'.repeat(2001) }],
    ['a missing query title', { query: { explanation: 'e' } }],
    ['an explanation over 4000 characters', { query: { title: 't', explanation: 'x'.repeat(4001) } }],
    ['a non-string code', { code: 42 }],
    ['code over 4000 characters', { code: 'x'.repeat(4001) }],
    ['more than 10 tags', { query: { ...query, tags: Array(11).fill('t') } }],
    ['a tag over 40 characters', { query: { ...query, tags: ['x'.repeat(41)] } }],
    ['an unknown type', { type: 'essay' }],
  ])('drops a question with %s and keeps the rest', (_label, overrides) => {
    const broken = { ...mcQuestion, id: 'py-easy-03', ...overrides };
    const result = validateQuestionBank(buildBank([mcQuestion, broken]));
    expect(result.isValid).toBe(true);
    if (result.isValid) expect(result.questions).toEqual([mcQuestion]);
  });

  it('drops a boolean question whose answer is not a boolean', () => {
    const result = validateQuestionBank(buildBank([mcQuestion, { ...boolQuestion, answer: 'true' }]));
    expect(result.isValid && result.droppedQuestionIds).toEqual(['py-easy-02']);
  });

  it('drops the second of two questions with the same id', () => {
    const result = validateQuestionBank(buildBank([mcQuestion, { ...boolQuestion, id: mcQuestion.id }]));
    expect(result.isValid && result.questions).toEqual([mcQuestion]);
  });

  it.each([
    ['a non-object root', []],
    ['a newer schemaVersion', { schemaVersion: 2, questions: [mcQuestion] }],
    ['zero valid questions', buildBank([{ ...mcQuestion, prompt: '' }])],
    ['an empty questions array', buildBank([])],
    ['more than 500 questions', buildBank(Array.from({ length: 501 }, (_, index) => ({ ...mcQuestion, id: `q-${index}` })))],
  ])('rejects a bank with %s as a whole', (_label, input) => {
    expect(validateQuestionBank(input).isValid).toBe(false);
  });

  it('keeps markup in strings as plain data for the renderer', () => {
    const hostile = { ...mcQuestion, prompt: '<script>alert(1)</script>' };
    const result = validateQuestionBank(buildBank([hostile]));
    expect(result.isValid && result.questions[0].prompt).toBe('<script>alert(1)</script>');
  });
});
```

`services/content/__tests__/resolveBankUrl.test.ts`:

```ts
import { resolveBankUrl } from '../resolveBankUrl';

const BASE = 'https://nullvoidundefined.github.io/syntactical/content/';

describe('resolveBankUrl', () => {
  it('resolves a safe relative path under the content base', () => {
    expect(resolveBankUrl('python/easy.json', BASE)).toBe(`${BASE}python/easy.json`);
  });

  it.each([
    '../secrets.json',
    'python/../../x.json',
    '%2e%2e/x.json',
    'python%2Feasy.json',
    'python\\easy.json',
    '/python/easy.json',
    'https://evil.test/easy.json',
    '//evil.test/easy.json',
    'python/easy.js',
    'Python/easy.json',
    'python/easy.json?x=1',
    '',
  ])('rejects %p', (path) => {
    expect(resolveBankUrl(path, BASE)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest services/content/__tests__/validate services/content/__tests__/resolveBankUrl.test.ts ; bash ~/.claude/enforce/tdd.sh red services/content/__tests__/validateManifest.test.ts services/content/__tests__/validateQuestionBank.test.ts services/content/__tests__/resolveBankUrl.test.ts
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement**

`constants/appConfig.ts` additions:

```ts
export const SUPPORTED_SCHEMA_VERSION = 1;

export const GRAMMARS = ['python', 'sql', 'javascript', 'typescript', 'go', 'rust', 'ruby', 'bash', 'plain'] as const;
export type Grammar = (typeof GRAMMARS)[number];

export const CONTENT_LIMITS = {
  manifestBytes: 64 * 1024,
  bankBytes: 512 * 1024,
  maxQuestions: 500,
  displayFieldLength: 120,
  promptLength: 2000,
  choiceLength: 300,
  minChoices: 2,
  maxChoices: 4,
  queryTitleLength: 200,
  longTextLength: 4000,
  maxTags: 10,
  tagLength: 40,
  fetchTimeoutMs: 8000,
} as const;
```

`services/content/contentTypes.ts`:

```ts
// Shapes of the fetched manifest and question banks after validation.
import type { DifficultyId, Grammar } from '../../constants/appConfig';

export type Query = { title: string; explanation: string; syntax?: string; tags?: string[] };
type QuestionBase = { id: string; prompt: string; code?: string; query: Query };
export type Question =
  | (QuestionBase & { type: 'mc'; choices: string[]; answerIndex: number })
  | (QuestionBase & { type: 'bool'; answer: boolean });
export type BankEntry = { path: string; hash: string };
export type LanguageEntry = {
  id: string;
  label: string;
  glyph: string;
  tagline: string;
  grammar: Grammar;
  banks: Partial<Record<DifficultyId, BankEntry>>;
};
export type Manifest = { schemaVersion: number; languages: LanguageEntry[] };
```

`services/content/resolveBankUrl.ts`:

```ts
// The bank path rule: only plain lowercase relative segments ending in
// .json, resolved under the content base URL with the same origin and
// path prefix. Anything else returns null and the bank is treated as
// unsafe.
const SAFE_PATH = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.json$/;

export function isSafeBankPath(path: unknown): boolean {
  return typeof path === 'string' && SAFE_PATH.test(path);
}

export function resolveBankUrl(path: string, contentBaseUrl: string): string | null {
  if (!isSafeBankPath(path)) return null;
  const base = new URL(contentBaseUrl);
  const resolved = new URL(path, base);
  const isContained = resolved.origin === base.origin && resolved.pathname.startsWith(base.pathname);
  return isContained ? resolved.toString() : null;
}
```

`services/content/validateManifest.ts`:

```ts
// Validates a fetched manifest. Returns the typed manifest, or the first
// rule it broke so the caller can log it and keep the previous copy.
import { CONTENT_LIMITS, DIFFICULTIES, GRAMMARS, SUPPORTED_SCHEMA_VERSION } from '../../constants/appConfig';
import type { Manifest } from './contentTypes';
import { isSafeBankPath } from './resolveBankUrl';

const LANGUAGE_ID = /^[a-z0-9-]{1,32}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const DIFFICULTY_IDS: readonly string[] = DIFFICULTIES.map((difficulty) => difficulty.id);
const GRAMMAR_IDS: readonly string[] = GRAMMARS;

type ManifestResult = { isValid: true; manifest: Manifest } | { isValid: false; rule: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDisplayText(value: unknown): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= CONTENT_LIMITS.displayFieldLength;
}

function findBankProblem(banks: unknown): string | null {
  if (!isRecord(banks) || Object.keys(banks).length === 0) return 'banks is empty';
  for (const [difficulty, bank] of Object.entries(banks)) {
    if (!DIFFICULTY_IDS.includes(difficulty)) return `banks.${difficulty} is not a known difficulty`;
    if (!isRecord(bank) || typeof bank.hash !== 'string' || !SHA256_HEX.test(bank.hash)) {
      return `banks.${difficulty}.hash is invalid`;
    }
    if (!isSafeBankPath(bank.path)) return `banks.${difficulty}.path is unsafe`;
  }
  return null;
}

function findLanguageProblem(language: unknown): string | null {
  if (!isRecord(language)) return 'is not an object';
  const { id, label, glyph, tagline, grammar, banks } = language;
  if (typeof id !== 'string' || !LANGUAGE_ID.test(id)) return 'id is invalid';
  if (![label, glyph, tagline].every(isDisplayText)) return 'a display field is invalid';
  if (typeof grammar !== 'string' || !GRAMMAR_IDS.includes(grammar)) return 'grammar is not supported';
  return findBankProblem(banks);
}

export function validateManifest(input: unknown): ManifestResult {
  if (!isRecord(input) || !Array.isArray(input.languages)) return { isValid: false, rule: 'root shape is invalid' };
  if (input.schemaVersion !== SUPPORTED_SCHEMA_VERSION) return { isValid: false, rule: 'schemaVersion is not supported' };
  if (input.languages.length === 0) return { isValid: false, rule: 'languages is empty' };
  const seenIds = new Set<string>();
  for (const [index, language] of input.languages.entries()) {
    const problem = findLanguageProblem(language);
    if (problem) return { isValid: false, rule: `languages[${index}].${problem}` };
    const { id } = language as { id: string };
    if (seenIds.has(id)) return { isValid: false, rule: `languages[${index}].id is a duplicate` };
    seenIds.add(id);
  }
  return { isValid: true, manifest: input as unknown as Manifest };
}
```

`services/content/validateQuestionBank.ts`:

```ts
// Validates a fetched question bank. A malformed question is dropped and
// the rest kept; a malformed root, an unsupported schema, too many
// questions, or no valid questions rejects the bank as a whole.
import { CONTENT_LIMITS, SUPPORTED_SCHEMA_VERSION } from '../../constants/appConfig';
import type { Question } from './contentTypes';

const QUESTION_ID = /^[a-z0-9-]{1,64}$/;

type BankResult =
  | { isValid: true; questions: Question[]; droppedQuestionIds: string[] }
  | { isValid: false; rule: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): boolean {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isOptionalText(value: unknown, maxLength: number): boolean {
  return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function areValidTags(tags: unknown): boolean {
  if (tags === undefined) return true;
  return Array.isArray(tags) && tags.length <= CONTENT_LIMITS.maxTags && tags.every((tag) => isText(tag, CONTENT_LIMITS.tagLength));
}

function isValidQuery(query: unknown): boolean {
  if (!isRecord(query)) return false;
  const { title, explanation, syntax, tags } = query;
  return (
    isText(title, CONTENT_LIMITS.queryTitleLength) &&
    isText(explanation, CONTENT_LIMITS.longTextLength) &&
    isOptionalText(syntax, CONTENT_LIMITS.longTextLength) &&
    areValidTags(tags)
  );
}

function isValidAnswerShape(question: Record<string, unknown>): boolean {
  const { type, choices, answerIndex, answer } = question;
  if (type === 'bool') return typeof answer === 'boolean';
  if (type !== 'mc' || !Array.isArray(choices)) return false;
  const hasValidChoices =
    choices.length >= CONTENT_LIMITS.minChoices &&
    choices.length <= CONTENT_LIMITS.maxChoices &&
    choices.every((choice) => isText(choice, CONTENT_LIMITS.choiceLength));
  return hasValidChoices && Number.isInteger(answerIndex) && (answerIndex as number) >= 0 && (answerIndex as number) < choices.length;
}

function isValidQuestion(question: unknown): question is Question {
  if (!isRecord(question)) return false;
  const { id, prompt, code, query } = question;
  return (
    typeof id === 'string' &&
    QUESTION_ID.test(id) &&
    isText(prompt, CONTENT_LIMITS.promptLength) &&
    isOptionalText(code, CONTENT_LIMITS.longTextLength) &&
    isValidQuery(query) &&
    isValidAnswerShape(question)
  );
}

function describeQuestionId(question: unknown): string {
  return isRecord(question) && typeof question.id === 'string' ? question.id : '(no id)';
}

export function validateQuestionBank(input: unknown): BankResult {
  if (!isRecord(input) || !Array.isArray(input.questions)) return { isValid: false, rule: 'root shape is invalid' };
  if (input.schemaVersion !== SUPPORTED_SCHEMA_VERSION) return { isValid: false, rule: 'schemaVersion is not supported' };
  if (input.questions.length > CONTENT_LIMITS.maxQuestions) return { isValid: false, rule: 'too many questions' };
  const seenIds = new Set<string>();
  const questions: Question[] = [];
  const droppedQuestionIds: string[] = [];
  for (const question of input.questions) {
    if (isValidQuestion(question) && !seenIds.has(question.id)) {
      seenIds.add(question.id);
      questions.push(question);
    } else {
      droppedQuestionIds.push(describeQuestionId(question));
    }
  }
  if (questions.length === 0) return { isValid: false, rule: 'no valid questions' };
  return { isValid: true, questions, droppedQuestionIds };
}
```

- [ ] **Step 4: Run to verify they pass**

```bash
npx jest services/content/__tests__/validate services/content/__tests__/resolveBankUrl.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add constants services/content
git commit -m "feat(content): manifest and bank validators and the bank path rule

Refs: IAN-564"
```

### Task 8: Content fetch client with body timeout and redirect refusal (B-13 size, B-18 client half)

**Files:**
- Create: `clients/contentClient.ts`
- Test: `clients/__tests__/contentClient.test.ts`

**Interfaces:**
- Produces: `fetchContentText(url: string, maxBytes: number, options?: { timeoutMs?: number }): Promise<string>`; rejects with `ContentFetchError` whose `reason` is `'network' | 'timeout' | 'redirect' | 'status' | 'too-large'`.

- [ ] **Step 1: Write the failing test**

`clients/__tests__/contentClient.test.ts`:

```ts
import { ContentFetchError, fetchContentText } from '../contentClient';

const URL_UNDER_TEST = 'https://example.test/content/python/easy.json';

function mockFetchResponse(body: string, overrides: Record<string, unknown> = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    url: URL_UNDER_TEST,
    redirected: false,
    text: () => Promise.resolve(body),
    ...overrides,
  });
}

async function expectReason(pending: Promise<unknown>, reason: string) {
  const error = await pending.catch((caught) => caught);
  expect(error).toBeInstanceOf(ContentFetchError);
  expect(error.reason).toBe(reason);
}

describe('fetchContentText', () => {
  afterEach(() => jest.useRealTimers());

  it('returns the body text', async () => {
    mockFetchResponse('{"ok":true}');
    await expect(fetchContentText(URL_UNDER_TEST, 1024)).resolves.toBe('{"ok":true}');
  });

  it('rejects a redirected response', async () => {
    mockFetchResponse('{}', { redirected: true, url: 'https://evil.test/x.json' });
    await expectReason(fetchContentText(URL_UNDER_TEST, 1024), 'redirect');
  });

  it('rejects a non-200 status', async () => {
    mockFetchResponse('', { ok: false, status: 404 });
    await expectReason(fetchContentText(URL_UNDER_TEST, 1024), 'status');
  });

  it('rejects a body over the byte limit', async () => {
    mockFetchResponse('x'.repeat(2048));
    await expectReason(fetchContentText(URL_UNDER_TEST, 1024), 'too-large');
  });

  it('rejects when the body does not finish within the timeout', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn().mockImplementation((_url, { signal }) =>
      Promise.resolve({
        ok: true,
        status: 200,
        url: URL_UNDER_TEST,
        redirected: false,
        text: () =>
          new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
      }),
    );
    const pending = fetchContentText(URL_UNDER_TEST, 1024, { timeoutMs: 8000 });
    await jest.advanceTimersByTimeAsync(8000);
    await expectReason(pending, 'timeout');
  });

  it('rejects a network failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
    await expectReason(fetchContentText(URL_UNDER_TEST, 1024), 'network');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest clients/__tests__/contentClient.test.ts ; bash ~/.claude/enforce/tdd.sh red clients/__tests__/contentClient.test.ts
```

Expected: FAIL with "Cannot find module '../contentClient'".

- [ ] **Step 3: Implement**

`clients/contentClient.ts`:

```ts
// Fetches one content document as text. The timeout covers the body, a
// redirect is refused (React Native's fetch may follow redirects despite
// redirect: 'error', so the final URL is checked too), and an oversized
// body is refused before parsing.
import { CONTENT_LIMITS } from '../constants/appConfig';

export type ContentFetchReason = 'network' | 'timeout' | 'redirect' | 'status' | 'too-large';

export class ContentFetchError extends Error {
  constructor(
    public readonly reason: ContentFetchReason,
    public readonly url: string,
  ) {
    super(`content fetch failed: ${reason}`);
  }
}

function measureBytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

async function readBody(url: string, signal: AbortSignal, maxBytes: number): Promise<string> {
  const response = await fetch(url, { redirect: 'error', signal, cache: 'no-cache' });
  if (response.redirected || (response.url && response.url !== url)) throw new ContentFetchError('redirect', url);
  if (!response.ok) throw new ContentFetchError('status', url);
  const text = await response.text();
  if (measureBytes(text) > maxBytes) throw new ContentFetchError('too-large', url);
  return text;
}

export async function fetchContentText(
  url: string,
  maxBytes: number,
  { timeoutMs = CONTENT_LIMITS.fetchTimeoutMs }: { timeoutMs?: number } = {},
): Promise<string> {
  const controller = new AbortController();
  let hasTimedOut = false;
  const timer = setTimeout(() => {
    hasTimedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await readBody(url, controller.signal, maxBytes);
  } catch (err) {
    if (err instanceof ContentFetchError) throw err;
    throw new ContentFetchError(hasTimedOut ? 'timeout' : 'network', url);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx jest clients/__tests__/contentClient.test.ts
```

Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add clients/contentClient.ts clients/__tests__/contentClient.test.ts
git commit -m "feat(content): fetch client with body timeout, redirect refusal, and size limit

Refs: IAN-564"
```

### Task 9: Hash client and bank hash verification (B-14)

**Files:**
- Create: `clients/hashClient.ts`, `services/content/verifyBankHash.ts`
- Test: `services/content/__tests__/verifyBankHash.test.ts`

**Interfaces:**
- Produces: `hashTextSha256(text: string): Promise<string>`; `verifyBankHash(text: string, expectedHash: string, hashText?: (text: string) => Promise<string>): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

`services/content/__tests__/verifyBankHash.test.ts`:

```ts
import { createHash } from 'node:crypto';
import { verifyBankHash } from '../verifyBankHash';

function hashWithNode(text: string): Promise<string> {
  return Promise.resolve(createHash('sha256').update(text, 'utf8').digest('hex'));
}

describe('verifyBankHash', () => {
  const bankText = '{"schemaVersion":1,"questions":[]}';

  it('accepts bytes whose SHA-256 equals the manifest hash', async () => {
    const expected = await hashWithNode(bankText);
    await expect(verifyBankHash(bankText, expected, hashWithNode)).resolves.toBe(true);
  });

  it('rejects stale bytes served for a newer manifest hash', async () => {
    const expected = await hashWithNode('{"schemaVersion":1,"questions":[{"id":"new"}]}');
    await expect(verifyBankHash(bankText, expected, hashWithNode)).resolves.toBe(false);
  });

  it('compares case-insensitively against a lowercase manifest hash', async () => {
    const expected = await hashWithNode(bankText);
    const upperHasher = (text: string) => hashWithNode(text).then((hash) => hash.toUpperCase());
    await expect(verifyBankHash(bankText, expected, upperHasher)).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest services/content/__tests__/verifyBankHash.test.ts ; bash ~/.claude/enforce/tdd.sh red services/content/__tests__/verifyBankHash.test.ts
```

Expected: FAIL with "Cannot find module '../verifyBankHash'".

- [ ] **Step 3: Implement**

`clients/hashClient.ts`:

```ts
// SHA-256 of a UTF-8 string through expo-crypto (SubtleCrypto on the web).
import { CryptoDigestAlgorithm, CryptoEncoding, digestStringAsync } from 'expo-crypto';

export function hashTextSha256(text: string): Promise<string> {
  return digestStringAsync(CryptoDigestAlgorithm.SHA256, text, { encoding: CryptoEncoding.HEX });
}
```

`services/content/verifyBankHash.ts`:

```ts
// Confirms downloaded bank text is exactly the file the manifest names.
// A partially deployed update can pair a new manifest hash with old bytes
// at the same URL; this check refuses those bytes.
import { hashTextSha256 } from '../../clients/hashClient';

export async function verifyBankHash(
  text: string,
  expectedHash: string,
  hashText: (text: string) => Promise<string> = hashTextSha256,
): Promise<boolean> {
  const actualHash = await hashText(text);
  return actualHash.toLowerCase() === expectedHash;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx jest services/content/__tests__/verifyBankHash.test.ts
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add clients/hashClient.ts services/content/verifyBankHash.ts services/content/__tests__/verifyBankHash.test.ts
git commit -m "feat(content): verify downloaded banks against the manifest hash

Refs: IAN-564"
```

### Task 10: Content cache, loaders, TanStack Query, and the content provider (B-13, B-15 to B-20, Review Focus 2)

**Files:**
- Create: `services/content/contentCache.ts`, `services/content/loadLanguageManifest.ts`, `services/content/loadQuestionBank.ts`, `services/content/bankQueries.ts`, `config/queryClient.ts`, `state/ContentProvider.tsx`, `state/useLanguageManifest.ts`, `state/useQuestionBank.ts`
- Modify: `app/_layout.tsx`
- Test: `services/content/__tests__/contentCache.test.ts`, `services/content/__tests__/loadQuestionBank.test.ts`, `state/__tests__/useQuestionBank.test.tsx`

**Interfaces:**
- Consumes: `readJson`, `writeJson`, `logWarning`, `fetchContentText`, `verifyBankHash`, `validateManifest`, `validateQuestionBank`, `resolveBankUrl`, `BUNDLED_MANIFEST`, `BUNDLED_BANKS`.
- Produces:
  - `type CachedBank = { hash: string; questions: Question[] }`
  - `readCachedManifest(): Promise<Manifest | null>`, `writeCachedManifest(manifest: Manifest): Promise<boolean>`, `readCachedBank(language: string, difficulty: string): Promise<CachedBank | null>`, `writeCachedBank(language: string, difficulty: string, bank: CachedBank): Promise<boolean>`
  - `loadLanguageManifest(contentBaseUrl: string): Promise<Manifest | null>` (null on any failure)
  - `loadQuestionBank(args: { language; difficulty; entry: BankEntry; contentBaseUrl; isHashCurrent: (hash: string) => boolean; hashText? }): Promise<CachedBank>` (throws on failure; commits to the cache only when `isHashCurrent(entry.hash)`)
  - `createQueryClient(): QueryClient` with `retry: false`, `staleTime: Infinity`, `gcTime: Infinity`, `refetchOnWindowFocus: false`
  - `services/content/bankQueries.ts`: `type ContentAccess = { contentBaseUrl; baselineManifest: Manifest; readLocalBank(language, difficulty): CachedBank | null }`, `findBankEntry`, `buildBankQuery`, `prefetchChangedBanks`
  - `ContentProvider({ contentBaseUrl, children })`, `useContentContext(): ContentAccess`
  - `useLanguageManifest(): Manifest`
  - `type QuestionBankState = { status: 'ready'; bank: CachedBank } | { status: 'loading' } | { status: 'error'; retry: () => void } | { status: 'unknown' }`; `useQuestionBank(language: string, difficulty: string): QuestionBankState`
  - Query keys: `['manifest']` and `['bank', language, difficulty, hash]`.

- [ ] **Step 1: Write the failing tests**

`services/content/__tests__/contentCache.test.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readCachedBank, writeCachedBank, type CachedBank } from '../contentCache';

const bank: CachedBank = {
  hash: 'a'.repeat(64),
  questions: [{ id: 'q-1', type: 'bool', prompt: 'P', answer: true, query: { title: 't', explanation: 'e' } }],
};

describe('contentCache', () => {
  beforeEach(() => AsyncStorage.clear());

  it('stores a bank and its hash as one entry', async () => {
    await writeCachedBank('python', 'easy', bank);
    expect(await AsyncStorage.getAllKeys()).toEqual(['syntactical.content.v1.bank.python.easy']);
    expect(await readCachedBank('python', 'easy')).toEqual(bank);
  });

  it('ignores a corrupt cached bank', async () => {
    await AsyncStorage.setItem('syntactical.content.v1.bank.python.easy', '{"hash":');
    expect(await readCachedBank('python', 'easy')).toBeNull();
  });

  it('ignores a cached bank that no longer validates', async () => {
    await AsyncStorage.setItem('syntactical.content.v1.bank.python.easy', JSON.stringify({ hash: 'x', questions: [] }));
    expect(await readCachedBank('python', 'easy')).toBeNull();
  });
});
```

`services/content/__tests__/loadQuestionBank.test.ts`:

```ts
import { createHash } from 'node:crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readCachedBank } from '../contentCache';
import { loadQuestionBank } from '../loadQuestionBank';

const BASE = 'https://example.test/content/';
const question = { id: 'q-1', type: 'bool', prompt: 'P', answer: true, query: { title: 't', explanation: 'e' } };
const bankText = JSON.stringify({ schemaVersion: 1, questions: [question] });

function hashWithNode(text: string): Promise<string> {
  return Promise.resolve(createHash('sha256').update(text).digest('hex'));
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function mockFetchText(text: string) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    redirected: false,
    url: `${BASE}python/easy.json`,
    text: () => Promise.resolve(text),
  });
}

function buildLoadArgs(overrides: Record<string, unknown> = {}) {
  return {
    language: 'python',
    difficulty: 'easy',
    contentBaseUrl: BASE,
    entry: { path: 'python/easy.json', hash: sha256(bankText) },
    isHashCurrent: () => true,
    hashText: hashWithNode,
    ...overrides,
  };
}

describe('loadQuestionBank', () => {
  beforeEach(() => AsyncStorage.clear());

  it('caches a verified, valid bank with its hash', async () => {
    mockFetchText(bankText);
    const expected = { hash: sha256(bankText), questions: [question] };
    await expect(loadQuestionBank(buildLoadArgs())).resolves.toEqual(expected);
    expect(await readCachedBank('python', 'easy')).toEqual(expected);
  });

  it('rejects and does not cache bytes whose hash does not match', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockFetchText(bankText.replace('"P"', '"Q"'));
    await expect(loadQuestionBank(buildLoadArgs())).rejects.toThrow('hash');
    expect(await readCachedBank('python', 'easy')).toBeNull();
  });

  it('discards a response whose manifest hash is no longer current', async () => {
    mockFetchText(bankText);
    await loadQuestionBank(buildLoadArgs({ isHashCurrent: () => false }));
    expect(await readCachedBank('python', 'easy')).toBeNull();
  });

  it('logs one warning naming the document and the rule when validation fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const emptyText = JSON.stringify({ schemaVersion: 1, questions: [] });
    mockFetchText(emptyText);
    const entry = { path: 'python/easy.json', hash: sha256(emptyText) };
    await expect(loadQuestionBank(buildLoadArgs({ entry }))).rejects.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ document: 'python/easy.json', rule: 'no valid questions' });
  });

  it('refuses an unsafe bank path without fetching', async () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const entry = { path: '../x.json', hash: sha256(bankText) };
    await expect(loadQuestionBank(buildLoadArgs({ entry }))).rejects.toThrow('unsafe');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

`state/__tests__/useQuestionBank.test.tsx`:

```tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Pressable, Text } from 'react-native';
import { createQueryClient } from '../../config/queryClient';
import { BUNDLED_MANIFEST } from '../../services/content/bundledContent.generated';
import { ContentProvider } from '../ContentProvider';
import { useQuestionBank } from '../useQuestionBank';

const CONTENT_BASE_URL = 'https://example.test/content/';

function BankProbe({ language = 'python', difficulty = 'easy' }: { language?: string; difficulty?: string }) {
  const result = useQuestionBank(language, difficulty);
  return (
    <>
      <Text testID="status">{result.status}</Text>
      <Text testID="count">{result.status === 'ready' ? result.bank.questions.length : 0}</Text>
      {result.status === 'error' ? <Pressable testID="retry" onPress={result.retry} /> : null}
    </>
  );
}

function renderWithProviders(ui: ReactElement) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>{ui}</ContentProvider>
    </QueryClientProvider>,
  );
}

function respondWith(text: string, url: string) {
  return Promise.resolve({ ok: true, status: 200, redirected: false, url, text: () => Promise.resolve(text) });
}

function buildManifestWithNewLanguage(): string {
  const newLanguage = {
    ...BUNDLED_MANIFEST.languages[0],
    id: 'elixir',
    grammar: 'plain',
    banks: { easy: { path: 'elixir/easy.json', hash: 'b'.repeat(64) } },
  };
  return JSON.stringify({ ...BUNDLED_MANIFEST, languages: [...BUNDLED_MANIFEST.languages, newLanguage] });
}

function countBankRequests(bankPath: string): number {
  return (global.fetch as jest.Mock).mock.calls.filter(([url]) => String(url).endsWith(bankPath)).length;
}

describe('useQuestionBank', () => {
  beforeEach(() => AsyncStorage.clear());

  it('returns the bundled bank before any fetch resolves', async () => {
    renderWithProviders(<BankProbe />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    expect(Number(screen.getByTestId('count').props.children)).toBeGreaterThan(0);
  });

  it('fetches only the manifest when every bank hash matches the bundled copy', async () => {
    global.fetch = jest.fn((url: string) => respondWith(JSON.stringify(BUNDLED_MANIFEST), url)) as never;
    renderWithProviders(<BankProbe />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('ready'));
    const fetchedUrls = (global.fetch as jest.Mock).mock.calls.map(([url]) => url);
    expect(fetchedUrls).toEqual([`${CONTENT_BASE_URL}manifest.json`]);
  });

  it('issues one request when two consumers need the same new bank', async () => {
    const manifestText = buildManifestWithNewLanguage();
    global.fetch = jest.fn((url: string) =>
      url.endsWith('manifest.json') ? respondWith(manifestText, url) : new Promise(() => {}),
    ) as never;
    renderWithProviders(
      <>
        <BankProbe language="elixir" />
        <BankProbe language="elixir" />
      </>,
    );
    await waitFor(() => expect(screen.getAllByTestId('status')[0]).toHaveTextContent('loading'));
    expect(countBankRequests('elixir/easy.json')).toBe(1);
  });

  it('shows an error with Retry when a bank with no copy fails, and Retry requests it again', async () => {
    const manifestText = buildManifestWithNewLanguage();
    global.fetch = jest.fn((url: string) =>
      url.endsWith('manifest.json') ? respondWith(manifestText, url) : Promise.reject(new TypeError('Network request failed')),
    ) as never;
    renderWithProviders(<BankProbe language="elixir" />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('error'));
    const requestsBeforeRetry = countBankRequests('elixir/easy.json');
    fireEvent.press(screen.getByTestId('retry'));
    await waitFor(() => expect(countBankRequests('elixir/easy.json')).toBe(requestsBeforeRetry + 1));
  });

  it('reports unknown for a language the manifest does not list', async () => {
    renderWithProviders(<BankProbe language="cobol" />);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unknown'));
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest services/content/__tests__/contentCache.test.ts services/content/__tests__/loadQuestionBank.test.ts state/__tests__/useQuestionBank.test.tsx ; bash ~/.claude/enforce/tdd.sh red services/content/__tests__/contentCache.test.ts services/content/__tests__/loadQuestionBank.test.ts state/__tests__/useQuestionBank.test.tsx
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement**

`services/content/contentCache.ts`:

```ts
// The on-device content cache. Each bank is stored together with its
// verified hash as one entry, so a cached bank can never be paired with
// the wrong hash. Entries that fail to parse or validate read as absent.
import { readJson, writeJson } from '../../clients/storageClient';
import { SUPPORTED_SCHEMA_VERSION } from '../../constants/appConfig';
import type { Manifest, Question } from './contentTypes';
import { validateManifest } from './validateManifest';
import { validateQuestionBank } from './validateQuestionBank';

export type CachedBank = { hash: string; questions: Question[] };

const KEY_PREFIX = 'syntactical.content.v1.';
const MANIFEST_KEY = `${KEY_PREFIX}manifest`;
const SHA256_HEX = /^[0-9a-f]{64}$/;

function buildBankKey(language: string, difficulty: string): string {
  return `${KEY_PREFIX}bank.${language}.${difficulty}`;
}

export async function readCachedManifest(): Promise<Manifest | null> {
  const result = validateManifest(await readJson<unknown>(MANIFEST_KEY, null));
  return result.isValid ? result.manifest : null;
}

export function writeCachedManifest(manifest: Manifest): Promise<boolean> {
  return writeJson(MANIFEST_KEY, manifest);
}

export async function readCachedBank(language: string, difficulty: string): Promise<CachedBank | null> {
  const stored = await readJson<{ hash?: unknown; questions?: unknown } | null>(buildBankKey(language, difficulty), null);
  if (!stored || typeof stored.hash !== 'string' || !SHA256_HEX.test(stored.hash)) return null;
  const result = validateQuestionBank({ schemaVersion: SUPPORTED_SCHEMA_VERSION, questions: stored.questions });
  return result.isValid ? { hash: stored.hash, questions: result.questions } : null;
}

export function writeCachedBank(language: string, difficulty: string, bank: CachedBank): Promise<boolean> {
  return writeJson(buildBankKey(language, difficulty), bank);
}
```

`services/content/loadLanguageManifest.ts`:

```ts
// Fetches, validates, and caches the manifest. Any failure returns null
// and the caller keeps the copy it already has.
import { fetchContentText } from '../../clients/contentClient';
import { logWarning } from '../../clients/logClient';
import { CONTENT_LIMITS } from '../../constants/appConfig';
import { writeCachedManifest } from './contentCache';
import type { Manifest } from './contentTypes';
import { validateManifest } from './validateManifest';

export async function loadLanguageManifest(contentBaseUrl: string): Promise<Manifest | null> {
  try {
    const manifestUrl = new URL('manifest.json', contentBaseUrl).toString();
    const result = validateManifest(JSON.parse(await fetchContentText(manifestUrl, CONTENT_LIMITS.manifestBytes)));
    if (!result.isValid) {
      logWarning({ document: 'manifest.json', rule: result.rule }, 'content rejected');
      return null;
    }
    await writeCachedManifest(result.manifest);
    return result.manifest;
  } catch (err) {
    logWarning({ document: 'manifest.json', rule: String(err) }, 'content rejected');
    return null;
  }
}
```

`services/content/loadQuestionBank.ts`:

```ts
// Downloads one bank, verifies its bytes against the manifest hash,
// validates it, and caches it only if that hash is still the current one.
// Throws on any failure so TanStack Query reports the error state.
import { fetchContentText } from '../../clients/contentClient';
import { logWarning } from '../../clients/logClient';
import { CONTENT_LIMITS } from '../../constants/appConfig';
import { writeCachedBank, type CachedBank } from './contentCache';
import type { BankEntry } from './contentTypes';
import { resolveBankUrl } from './resolveBankUrl';
import { validateQuestionBank } from './validateQuestionBank';
import { verifyBankHash } from './verifyBankHash';

type LoadQuestionBankArgs = {
  language: string;
  difficulty: string;
  entry: BankEntry;
  contentBaseUrl: string;
  isHashCurrent: (hash: string) => boolean;
  hashText?: (text: string) => Promise<string>;
};

function rejectBank(document: string, rule: string): never {
  logWarning({ document, rule }, 'content rejected');
  throw new Error(`${document}: ${rule}`);
}

export async function loadQuestionBank(args: LoadQuestionBankArgs): Promise<CachedBank> {
  const { language, difficulty, entry, contentBaseUrl, isHashCurrent, hashText } = args;
  const url = resolveBankUrl(entry.path, contentBaseUrl);
  if (!url) rejectBank(entry.path, 'path is unsafe');
  const text = await fetchContentText(url, CONTENT_LIMITS.bankBytes);
  if (!(await verifyBankHash(text, entry.hash, hashText))) rejectBank(entry.path, 'hash does not match');
  const result = validateQuestionBank(JSON.parse(text));
  if (!result.isValid) rejectBank(entry.path, result.rule);
  const bank = { hash: entry.hash, questions: result.questions };
  if (isHashCurrent(entry.hash)) await writeCachedBank(language, difficulty, bank);
  return bank;
}
```

`config/queryClient.ts`:

```ts
// TanStack Query client for content. Content changes only when the
// manifest hash changes, so nothing goes stale on a timer, nothing is
// garbage-collected mid-session, and failures surface for Retry.
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: Infinity, refetchOnWindowFocus: false },
    },
  });
}
```

`services/content/bankQueries.ts`:

```ts
// The TanStack Query definition for one bank download, and the background
// prefetch run after each manifest refresh. Shared by the content provider
// and useQuestionBank, so neither imports the other.
import type { QueryClient } from '@tanstack/react-query';
import type { CachedBank } from './contentCache';
import type { BankEntry, Manifest } from './contentTypes';
import { loadQuestionBank } from './loadQuestionBank';

export type ContentAccess = {
  contentBaseUrl: string;
  baselineManifest: Manifest;
  readLocalBank: (language: string, difficulty: string) => CachedBank | null;
};

export function findBankEntry(manifest: Manifest, language: string, difficulty: string): BankEntry | undefined {
  const languageEntry = manifest.languages.find((entry) => entry.id === language);
  return (languageEntry?.banks as Record<string, BankEntry> | undefined)?.[difficulty];
}

export function buildBankQuery(queryClient: QueryClient, access: ContentAccess, language: string, difficulty: string, entry: BankEntry) {
  return {
    queryKey: ['bank', language, difficulty, entry.hash],
    queryFn: () =>
      loadQuestionBank({
        language,
        difficulty,
        entry,
        contentBaseUrl: access.contentBaseUrl,
        isHashCurrent: (hash: string) => {
          const current = queryClient.getQueryData<Manifest | null>(['manifest']) ?? access.baselineManifest;
          return findBankEntry(current, language, difficulty)?.hash === hash;
        },
      }),
  };
}

export function prefetchChangedBanks(queryClient: QueryClient, manifest: Manifest, access: ContentAccess): void {
  for (const language of manifest.languages) {
    for (const [difficulty, entry] of Object.entries(language.banks)) {
      if (!entry || access.readLocalBank(language.id, difficulty)?.hash === entry.hash) continue;
      void queryClient.prefetchQuery(buildBankQuery(queryClient, access, language.id, difficulty, entry));
    }
  }
}
```

`state/useQuestionBank.ts`:

```ts
// One bank's load state. A local copy (cached or bundled) whose hash
// matches the manifest is used directly; otherwise the bank downloads,
// keyed by its hash so overlapping requests share one fetch.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { buildBankQuery, findBankEntry } from '../services/content/bankQueries';
import type { CachedBank } from '../services/content/contentCache';
import { useContentContext } from './ContentProvider';
import { useLanguageManifest } from './useLanguageManifest';

export type QuestionBankState =
  | { status: 'ready'; bank: CachedBank }
  | { status: 'loading' }
  | { status: 'error'; retry: () => void }
  | { status: 'unknown' };

export function useQuestionBank(language: string, difficulty: string): QuestionBankState {
  const queryClient = useQueryClient();
  const access = useContentContext();
  const manifest = useLanguageManifest();
  const entry = findBankEntry(manifest, language, difficulty);
  const localBank = access.readLocalBank(language, difficulty);
  const needsDownload = entry !== undefined && localBank?.hash !== entry.hash;
  const query = useQuery({
    ...buildBankQuery(queryClient, access, language, difficulty, entry ?? { path: '', hash: 'none' }),
    enabled: needsDownload,
  });
  if (!entry) return { status: 'unknown' };
  if (needsDownload && query.data) return { status: 'ready', bank: query.data };
  if (localBank) return { status: 'ready', bank: localBank };
  if (query.isError) return { status: 'error', retry: () => void query.refetch() };
  return { status: 'loading' };
}
```

A local copy is used while a newer bank downloads (B-15, B-16); the downloaded bank wins once it arrives. Because the bank query is keyed by hash, a second consumer of the same bank shares the in-flight request (B-17), and `isHashCurrent` drops a response for a manifest that has since changed.

`state/ContentProvider.tsx`:

```tsx
// Reads the cached manifest and every cached bank once at startup, then
// renders the app. Rounds never wait on the network: whatever is cached,
// or bundled, is available as soon as this read completes. It then
// refreshes the manifest and prefetches every bank whose hash changed.
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BUNDLED_BANKS, BUNDLED_MANIFEST } from '../services/content/bundledContent.generated';
import { readCachedBank, readCachedManifest, type CachedBank } from '../services/content/contentCache';
import type { Manifest } from '../services/content/contentTypes';
import { loadLanguageManifest } from '../services/content/loadLanguageManifest';
import { validateQuestionBank } from '../services/content/validateQuestionBank';
import { findBankEntry, prefetchChangedBanks, type ContentAccess } from '../services/content/bankQueries';

const ContentContext = createContext<ContentAccess | null>(null);
const BUNDLED = BUNDLED_MANIFEST as unknown as Manifest;

function readBundledBank(language: string, difficulty: string): CachedBank | null {
  const entry = findBankEntry(BUNDLED, language, difficulty);
  const result = validateQuestionBank(BUNDLED_BANKS[`${language}/${difficulty}`]);
  return entry && result.isValid ? { hash: entry.hash, questions: result.questions } : null;
}

async function readAllCachedBanks(manifest: Manifest): Promise<Map<string, CachedBank>> {
  const pairs = manifest.languages.flatMap((language) =>
    Object.keys(language.banks).map((difficulty) => `${language.id}/${difficulty}`),
  );
  const banks = await Promise.all(pairs.map((pair) => readCachedBank(...(pair.split('/') as [string, string]))));
  return new Map(pairs.flatMap((pair, index) => (banks[index] ? [[pair, banks[index] as CachedBank]] : [])));
}

export function ContentProvider({ contentBaseUrl, children }: { contentBaseUrl: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [hydrated, setHydrated] = useState<{ manifest: Manifest; banks: Map<string, CachedBank> } | null>(null);

  useEffect(() => {
    readCachedManifest().then(async (cached) => {
      const manifest = cached ?? BUNDLED;
      setHydrated({ manifest, banks: await readAllCachedBanks(manifest) });
    });
  }, []);

  const access = useMemo<ContentAccess | null>(
    () =>
      hydrated && {
        contentBaseUrl,
        baselineManifest: hydrated.manifest,
        readLocalBank: (language, difficulty) =>
          hydrated.banks.get(`${language}/${difficulty}`) ?? readBundledBank(language, difficulty),
      },
    [hydrated, contentBaseUrl],
  );

  const { data: fetchedManifest } = useQuery({
    queryKey: ['manifest'],
    queryFn: () => loadLanguageManifest(contentBaseUrl),
    enabled: access !== null,
  });

  useEffect(() => {
    if (access && fetchedManifest) prefetchChangedBanks(queryClient, fetchedManifest, access);
  }, [access, fetchedManifest, queryClient]);

  if (!access) return null;
  return <ContentContext.Provider value={access}>{children}</ContentContext.Provider>;
}

export function useContentContext(): ContentAccess {
  const value = useContext(ContentContext);
  if (!value) throw new Error('useContentContext must be used inside ContentProvider');
  return value;
}
```

`state/useLanguageManifest.ts`:

```ts
// The manifest the UI renders from: the freshly fetched one when it
// arrived and validated, otherwise the cached or bundled baseline.
import { useQuery } from '@tanstack/react-query';
import type { Manifest } from '../services/content/contentTypes';
import { useContentContext } from './ContentProvider';

export function useLanguageManifest(): Manifest {
  const { baselineManifest } = useContentContext();
  const { data } = useQuery<Manifest | null>({ queryKey: ['manifest'], enabled: false });
  return data ?? baselineManifest;
}
```

`app/_layout.tsx` becomes:

```tsx
// Root layout: global styles, safe area, the query client, and the
// content and stats providers, around every route.
import '../global.css';
import { QueryClientProvider } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { Slot } from 'expo-router';
import { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createQueryClient } from '../config/queryClient';
import { ContentProvider } from '../state/ContentProvider';
import { StatsProvider } from '../state/StatsProvider';

const CONTENT_BASE_URL = Constants.expoConfig?.extra?.contentBaseUrl as string;

export default function RootLayout() {
  const [queryClient] = useState(createQueryClient);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ContentProvider contentBaseUrl={CONTENT_BASE_URL}>
          <StatsProvider>
            <Slot />
          </StatsProvider>
        </ContentProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
```

`jest.setup.ts` gains `jest.mock('expo-constants', () => ({ expoConfig: { extra: { contentBaseUrl: 'https://example.test/content/' } } }))` so the layout tests in Tasks 1 and 2 keep passing behind the content provider; they already await their assertions with `findBy`.

- [ ] **Step 4: Run to verify they pass**

```bash
npx jest services/content state app && bash ~/.claude/enforce/tdd.sh green
```

Expected: all pass.

- [ ] **Step 5: Close slice 3, verify PR 1, push**

```bash
bash ~/.claude/enforce/tdd.sh close
git add services/content config state app jest.setup.ts
git commit -m "feat(content): cache, loaders, TanStack Query, and the content provider

Refs: IAN-564"
npm test && npm run lint && npm run build && npm run expo:export:preview
git push -u origin feat/expo-universal-app
```

Then the draft PR opens on its own (R-518). After the bookkeeping commits, run the R-109 security review on `securityReviewModel` and the R-517 `pr-reviewer` on `sonnet`, advance IAN-564 to `in-review`, and hand PR 1 to the owner, who merges it because it is high-risk. Start PR 2 only after `git log origin/main` shows PR 1.

---

# PR 2: screens and the code block (Risk: high)

```bash
git fetch origin && git checkout -b feat/expo-screens origin/main
bash ~/.claude/skills/task-start/scripts/task-tier.sh set complex "Expo screens and the token-based code block for IAN-564" --ticket IAN-564 --scope "app,components,state,services,constants,package.json,package-lock.json"
```

### Task 12: App shell and menu screens from the manifest (B-21, B-22)

**Files:**
- Create: `components/layout/AppShell.tsx`, `components/menu/SelectionCard.tsx`, `components/menu/LanguageStep.tsx`, `components/menu/DifficultyStep.tsx`, `state/useIsOnline.ts`, `app/[language]/index.tsx`
- Modify: `app/index.tsx`, `app/_layout.tsx`
- Test: `components/menu/__tests__/menu.test.tsx`, `components/menu/__tests__/DifficultyStep.test.tsx`

**Interfaces:**
- Consumes: `useLanguageManifest`, `useQuestionBank`, `useQuizStats`, `DIFFICULTIES`, `LanguageEntry`.
- Produces: `SelectionCard({ keyHint, title, subtitle, onSelect, isDisabled?, statusLabel? })`; `LanguageStep({ languages, onSelectLanguage })`; `DifficultyStep({ language, onSelectDifficulty, onBack })`; `AppShell({ children })`; `useIsOnline(): boolean`.

- [ ] **Step 1: Open slice 4 and write the failing tests**

```bash
bash ~/.claude/enforce/tdd.sh open "slice 4: menu and download indicator" --spec docs/superpowers/specs/2026-10-02-expo-universal-app-design.md
```

`components/menu/__tests__/menu.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { DIFFICULTIES } from '../../../constants/appConfig';
import type { LanguageEntry } from '../../../services/content/contentTypes';
import { LanguageStep } from '../LanguageStep';
import { SelectionCard } from '../SelectionCard';

const languages: LanguageEntry[] = [
  { id: 'python', label: 'Python', glyph: 'PY', tagline: 'Sharp edges.', grammar: 'python', banks: { easy: { path: 'python/easy.json', hash: 'a'.repeat(64) } } },
  { id: 'elixir', label: 'Elixir', glyph: 'EX', tagline: 'Pipes.', grammar: 'plain', banks: { hard: { path: 'elixir/hard.json', hash: 'b'.repeat(64) } } },
];

describe('menu', () => {
  it('lists every language in the manifest and reports the chosen id', () => {
    const onSelectLanguage = jest.fn();
    render(<LanguageStep languages={languages} onSelectLanguage={onSelectLanguage} />);
    expect(screen.getByText('Python')).toBeTruthy();
    fireEvent.press(screen.getByText('Elixir'));
    expect(onSelectLanguage).toHaveBeenCalledWith('elixir');
  });

  it('labels and disables a difficulty that needs a connection', () => {
    const onSelect = jest.fn();
    render(
      <SelectionCard keyHint={1} title="Hard" subtitle={DIFFICULTIES[2].description} onSelect={onSelect} isDisabled statusLabel="Needs a connection to load" />,
    );
    expect(screen.getByText('Needs a connection to load')).toBeTruthy();
    fireEvent.press(screen.getByText('Hard'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

`components/menu/__tests__/DifficultyStep.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { DIFFICULTIES } from '../../../constants/appConfig';
import { DifficultyStep } from '../DifficultyStep';

const mockBankState = { current: { status: 'ready', bank: { hash: 'a'.repeat(64), questions: [] } } as unknown };
const mockIsOnline = { current: true };

jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    schemaVersion: 1,
    languages: [{ id: 'elixir', label: 'Elixir', glyph: 'EX', tagline: 'Pipes.', grammar: 'plain', banks: { hard: { path: 'elixir/hard.json', hash: 'b'.repeat(64) } } }],
  }),
}));
jest.mock('../../../state/useQuestionBank', () => ({ useQuestionBank: () => mockBankState.current }));
jest.mock('../../../state/useIsOnline', () => ({ useIsOnline: () => mockIsOnline.current }));

describe('DifficultyStep', () => {
  beforeEach(() => {
    mockBankState.current = { status: 'ready', bank: { hash: 'a'.repeat(64), questions: [] } };
    mockIsOnline.current = true;
  });

  it('lists only the difficulties the language has, with registry labels and descriptions', () => {
    render(<DifficultyStep language="elixir" onSelectDifficulty={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByText('Hard')).toBeTruthy();
    expect(screen.getByText(DIFFICULTIES[2].description)).toBeTruthy();
    expect(screen.queryByText('Easy')).toBeNull();
  });

  it('disables a difficulty with no copy while offline', () => {
    mockBankState.current = { status: 'loading' };
    mockIsOnline.current = false;
    render(<DifficultyStep language="elixir" onSelectDifficulty={jest.fn()} onBack={jest.fn()} />);
    expect(screen.getByText('Needs a connection to load')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hard/ })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest components/menu ; bash ~/.claude/enforce/tdd.sh red components/menu/__tests__/menu.test.tsx components/menu/__tests__/DifficultyStep.test.tsx
```

Expected: FAIL with missing modules.

- [ ] **Step 3: Implement**

`components/menu/SelectionCard.tsx`:

```tsx
// One selectable option in a menu step: key-hint badge, label, and
// description, with an optional disabled state and status label.
import { Pressable, Text, View } from 'react-native';

type SelectionCardProps = {
  keyHint: number;
  title: string;
  subtitle: string;
  onSelect: () => void;
  isDisabled?: boolean;
  statusLabel?: string;
};

export function SelectionCard({ keyHint, title, subtitle, onSelect, isDisabled = false, statusLabel }: SelectionCardProps) {
  return (
    <Pressable
      role="button"
      aria-label={statusLabel ? `${title}, ${statusLabel}` : title}
      disabled={isDisabled}
      onPress={onSelect}
      className={`w-full rounded-lg border border-line bg-surface px-5 py-4 ${isDisabled ? 'opacity-50' : 'active:border-signal'}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-lg text-ink">{title}</Text>
        <Text className="rounded border border-line px-2 py-0.5 font-mono text-xs text-muted">{keyHint}</Text>
      </View>
      <Text className="mt-2 text-sm text-muted">{subtitle}</Text>
      {statusLabel ? <Text className="mt-2 font-mono text-xs text-amber">{statusLabel}</Text> : null}
    </Pressable>
  );
}
```

`components/menu/LanguageStep.tsx`:

```tsx
// Step 1 of the launch flow: choose a language from the manifest.
import { Text, View } from 'react-native';
import type { LanguageEntry } from '../../services/content/contentTypes';
import { SelectionCard } from './SelectionCard';

type LanguageStepProps = { languages: readonly LanguageEntry[]; onSelectLanguage: (languageId: string) => void };

export function LanguageStep({ languages, onSelectLanguage }: LanguageStepProps) {
  return (
    <View>
      <Text className="mb-4 font-mono text-xs uppercase tracking-widest text-muted">Step 1 / Select language</Text>
      <View className="gap-3">
        {languages.map((language, index) => (
          <SelectionCard
            key={language.id}
            keyHint={index + 1}
            title={language.label}
            subtitle={language.tagline}
            onSelect={() => onSelectLanguage(language.id)}
          />
        ))}
      </View>
    </View>
  );
}
```

`state/useIsOnline.ts`:

```ts
// Whether the device currently reports a network connection.
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export function useIsOnline(): boolean {
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => NetInfo.addEventListener((state) => setIsOnline(state.isConnected !== false)), []);
  return isOnline;
}
```

`components/menu/DifficultyStep.tsx`:

```tsx
// Step 2 of the launch flow: the difficulties the chosen language's
// manifest entry names, labeled from the app's registry, each showing
// whether its bank is ready, downloading, failed, or needs a connection.
import { Pressable, Text, View } from 'react-native';
import { DIFFICULTIES } from '../../constants/appConfig';
import { useIsOnline } from '../../state/useIsOnline';
import { useLanguageManifest } from '../../state/useLanguageManifest';
import { useQuestionBank, type QuestionBankState } from '../../state/useQuestionBank';
import { SelectionCard } from './SelectionCard';

type DifficultyOptionProps = { language: string; difficultyId: string; keyHint: number; onSelect: () => void };

function describeBankStatus(bankState: QuestionBankState, isOnline: boolean): string | undefined {
  if (bankState.status === 'ready') return undefined;
  if (!isOnline) return 'Needs a connection to load';
  if (bankState.status === 'error') return 'Download failed. Tap to retry';
  return 'Downloading';
}

function DifficultyOption({ language, difficultyId, keyHint, onSelect }: DifficultyOptionProps) {
  const bankState = useQuestionBank(language, difficultyId);
  const isOnline = useIsOnline();
  const { label, description } = DIFFICULTIES.find((difficulty) => difficulty.id === difficultyId)!;
  const isRetryable = bankState.status === 'error' && isOnline;
  return (
    <SelectionCard
      keyHint={keyHint}
      title={label}
      subtitle={description}
      onSelect={bankState.status === 'error' ? bankState.retry : onSelect}
      isDisabled={bankState.status !== 'ready' && !isRetryable}
      statusLabel={describeBankStatus(bankState, isOnline)}
    />
  );
}

type DifficultyStepProps = { language: string; onSelectDifficulty: (difficultyId: string) => void; onBack: () => void };

export function DifficultyStep({ language, onSelectDifficulty, onBack }: DifficultyStepProps) {
  const manifest = useLanguageManifest();
  const languageEntry = manifest.languages.find((entry) => entry.id === language);
  const difficultyIds = DIFFICULTIES.map((difficulty) => difficulty.id).filter((id) => languageEntry?.banks[id]);
  return (
    <View>
      <View className="mb-4 flex-row items-center justify-between">
        <Text className="font-mono text-xs uppercase tracking-widest text-muted">
          Step 2 / Select difficulty <Text className="text-signal">{languageEntry?.label ?? language}</Text>
        </Text>
        <Pressable role="button" aria-label="Back" onPress={onBack}>
          <Text className="font-mono text-xs text-muted">Back</Text>
        </Pressable>
      </View>
      <View className="gap-3">
        {difficultyIds.map((difficultyId, index) => (
          <DifficultyOption
            key={difficultyId}
            language={language}
            difficultyId={difficultyId}
            keyHint={index + 1}
            onSelect={() => onSelectDifficulty(difficultyId)}
          />
        ))}
      </View>
    </View>
  );
}
```

`components/layout/AppShell.tsx`:

```tsx
// The persistent frame: brand mark, live streak readout, and the content
// slot every route renders into, inside the safe area.
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuizStats } from '../../state/StatsProvider';

export function AppShell({ children }: { children: ReactNode }) {
  const { stats } = useQuizStats();
  return (
    <SafeAreaView className="flex-1 bg-obsidian">
      <View className="flex-row items-center justify-between border-b border-line px-4 py-3">
        <Text className="font-mono text-xs tracking-widest text-ink">SYNTACTICAL</Text>
        <Text className="font-mono text-xs uppercase tracking-widest text-muted">
          streak <Text className="text-signal">{stats.streak.current}</Text> / best{' '}
          <Text className="text-ink">{stats.streak.best}</Text>
        </Text>
      </View>
      <View className="flex-1">{children}</View>
    </SafeAreaView>
  );
}
```

`app/index.tsx`:

```tsx
// Language step route: the title and the language list. Lifetime stats
// join this screen in Task 15.
import { router } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { LanguageStep } from '../components/menu/LanguageStep';
import { useLanguageManifest } from '../state/useLanguageManifest';

export default function LanguageScreen() {
  const manifest = useLanguageManifest();
  return (
    <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-8">
      <View className="w-full max-w-xl">
        <View className="mb-10 items-center">
          <Text role="heading" aria-level={1} className="font-mono text-3xl text-ink">
            syntactical<Text className="text-signal">_</Text>
          </Text>
          <Text className="mt-2 text-center text-sm text-muted">
            High-velocity drills for developers who think they already know the answer.
          </Text>
        </View>
        <LanguageStep languages={manifest.languages} onSelectLanguage={(language) => router.push(`/${language}`)} />
      </View>
    </ScrollView>
  );
}
```

`app/[language]/index.tsx`:

```tsx
// Difficulty step route for one language; an unknown language shows the
// not-found screen.
import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { DifficultyStep } from '../../components/menu/DifficultyStep';
import { useLanguageManifest } from '../../state/useLanguageManifest';
import NotFoundScreen from '../+not-found';

export default function DifficultyScreen() {
  const { language } = useLocalSearchParams<{ language: string }>();
  const manifest = useLanguageManifest();
  if (!manifest.languages.some((entry) => entry.id === language)) return <NotFoundScreen />;
  return (
    <ScrollView contentContainerClassName="flex-grow items-center justify-center px-4 py-8">
      <View className="w-full max-w-xl">
        <DifficultyStep
          language={language}
          onSelectDifficulty={(difficulty) => router.push(`/${language}/${difficulty}`)}
          onBack={() => router.replace('/')}
        />
      </View>
    </ScrollView>
  );
}
```

`app/_layout.tsx`: wrap `<Slot />` in `<AppShell>` inside `StatsProvider`.

- [ ] **Step 4: Run to verify they pass**

```bash
npx jest components/menu app && bash ~/.claude/enforce/tdd.sh green
```

- [ ] **Step 5: Commit**

```bash
git add components app state
git commit -m "feat(menu): app shell and the language and difficulty steps from the manifest

Refs: IAN-564"
```

### Task 13: Download indicator (B-23, B-24, Review Focus 5)

**Files:**
- Create: `state/useContentDownloads.ts`, `components/layout/DownloadIndicator.tsx`
- Modify: `components/layout/AppShell.tsx`
- Test: `components/layout/__tests__/DownloadIndicator.test.tsx`

**Interfaces:**
- Produces: `useContentDownloads(): boolean`; `DownloadIndicator()`.

- [ ] **Step 1: Write the failing test**

`components/layout/__tests__/DownloadIndicator.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { DownloadIndicator } from '../DownloadIndicator';

const mockReducedMotion = { current: false };
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated/mock'),
  useReducedMotion: () => mockReducedMotion.current,
}));

function renderWithClient(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <DownloadIndicator />
    </QueryClientProvider>,
  );
}

function startBankFetch(client: QueryClient, outcome: Promise<unknown>) {
  void client.fetchQuery({ queryKey: ['bank', 'python', 'easy', 'h'], queryFn: () => outcome }).catch(() => undefined);
}

describe('DownloadIndicator', () => {
  beforeEach(() => {
    mockReducedMotion.current = false;
  });

  it('is hidden when no bank is transferring', () => {
    renderWithClient(new QueryClient());
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('is hidden while only the manifest is fetching', () => {
    const client = new QueryClient();
    renderWithClient(client);
    act(() => {
      void client.fetchQuery({ queryKey: ['manifest'], queryFn: () => new Promise(() => {}) });
    });
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('shows while a bank transfers and announces once', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const client = new QueryClient();
    renderWithClient(client);
    act(() => startBankFetch(client, new Promise(() => {})));
    await waitFor(() => expect(screen.getByRole('progressbar', { name: 'Updating questions' })).toBeTruthy());
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('clears the indicator when a bank download fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    renderWithClient(client);
    let failDownload: (err: Error) => void = () => {};
    act(() => startBankFetch(client, new Promise((_resolve, reject) => { failDownload = reject; })));
    await waitFor(() => expect(screen.getByRole('progressbar')).toBeTruthy());
    await act(async () => failDownload(new Error('offline')));
    await waitFor(() => expect(screen.queryByRole('progressbar')).toBeNull());
  });

  it('renders a static line when reduced motion is requested', async () => {
    mockReducedMotion.current = true;
    const client = new QueryClient();
    renderWithClient(client);
    act(() => startBankFetch(client, new Promise(() => {})));
    await waitFor(() => expect(screen.getByTestId('download-indicator-static')).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest components/layout ; bash ~/.claude/enforce/tdd.sh red components/layout/__tests__/DownloadIndicator.test.tsx
```

- [ ] **Step 3: Implement**

`state/useContentDownloads.ts`:

```ts
// True while any question bank is transferring. The manifest is fetched
// on every launch and is small, so it does not count.
import { useIsFetching } from '@tanstack/react-query';

export function useContentDownloads(): boolean {
  return useIsFetching({ queryKey: ['bank'] }) > 0;
}
```

`components/layout/DownloadIndicator.tsx`:

```tsx
// A thin, low-contrast line under the header while a bank downloads.
// Announced once per transfer as a polite status; static under reduced
// motion. Renders nothing when no bank is transferring.
import { useEffect } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useContentDownloads } from '../../state/useContentDownloads';

const STATUS_LABEL = 'Updating questions';

function SweepingLine() {
  const offset = useSharedValue(-100);
  useEffect(() => {
    offset.value = withRepeat(withTiming(300, { duration: 1400 }), -1, false);
  }, [offset]);
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateX: `${offset.value}%` }] }));
  return <Animated.View className="h-full w-1/3 bg-signal/40" style={sweepStyle} />;
}

export function DownloadIndicator() {
  const isDownloading = useContentDownloads();
  const isReducedMotion = useReducedMotion();

  useEffect(() => {
    if (isDownloading && Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(STATUS_LABEL);
  }, [isDownloading]);

  if (!isDownloading) return null;
  return (
    <View
      role="progressbar"
      aria-label={STATUS_LABEL}
      aria-live="polite"
      accessibilityLiveRegion="polite"
      className="h-px w-full overflow-hidden bg-line"
    >
      {isReducedMotion ? <View testID="download-indicator-static" className="h-full w-full bg-signal/30" /> : <SweepingLine />}
    </View>
  );
}
```

On the web, `aria-live="polite"` announces the element; `announceForAccessibility` covers iOS and Android, which is why the test's native preset sees one announcement.

`components/layout/AppShell.tsx`: render `<DownloadIndicator />` directly under the header row.

- [ ] **Step 4: Run to verify it passes, close slice 4, commit**

```bash
npx jest components/layout && bash ~/.claude/enforce/tdd.sh green && bash ~/.claude/enforce/tdd.sh close
git add state/useContentDownloads.ts components/layout
git commit -m "feat(content): subtle download indicator for bank transfers

Refs: IAN-564"
```

### Task 14: Quiz service and engine with a per-round snapshot (B-25, B-26, B-32)

**Files:**
- Create: `services/quiz/quizService.ts`, `state/useQuizEngine.ts`
- Test: `services/quiz/__tests__/quizService.test.ts`, `state/__tests__/useQuizEngine.test.tsx`

**Interfaces:**
- Consumes: `Question`.
- Produces: `shuffleQuestions<T>(items: readonly T[], random?: () => number): T[]`, `isAnswerCorrect(question: Question, submitted: number | boolean): boolean`, `calculateAccuracy(correctCount: number, totalCount: number): number`; `useQuizEngine(bankQuestions: readonly Question[])` returning `{ currentQuestion: Question | null; currentIndex; totalQuestions; submittedAnswer: number | boolean | null; isAnswered; isComplete; wasCorrect; correctCount; accuracy; submitAnswer(value): boolean | null; advanceQuestion(): void }`.

- [ ] **Step 1: Open slice 5 and write the failing tests**

```bash
bash ~/.claude/enforce/tdd.sh open "slice 5: quiz" --spec docs/superpowers/specs/2026-10-02-expo-universal-app-design.md
```

`services/quiz/__tests__/quizService.test.ts`:

```ts
import { calculateAccuracy, isAnswerCorrect, shuffleQuestions } from '../quizService';

const query = { title: 't', explanation: 'e' };

describe('quizService', () => {
  it('returns a new permutation containing every item exactly once', () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    const shuffled = shuffleQuestions(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(shuffled).not.toBe(items);
  });

  it('uses the injected random source', () => {
    expect(shuffleQuestions([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
  });

  it('grades multiple-choice and boolean answers', () => {
    expect(isAnswerCorrect({ id: 'a', type: 'mc', prompt: 'p', choices: ['x', 'y'], answerIndex: 1, query }, 1)).toBe(true);
    expect(isAnswerCorrect({ id: 'b', type: 'bool', prompt: 'p', answer: false, query }, true)).toBe(false);
  });

  it('rounds accuracy and returns 0 for an empty round', () => {
    expect(calculateAccuracy(2, 3)).toBe(67);
    expect(calculateAccuracy(0, 0)).toBe(0);
  });
});
```

`state/__tests__/useQuizEngine.test.tsx`:

```tsx
import { act, renderHook } from '@testing-library/react-native';
import type { Question } from '../../services/content/contentTypes';
import { useQuizEngine } from '../useQuizEngine';

const query = { title: 't', explanation: 'e' };
const questions: Question[] = [
  { id: 'q-1', type: 'bool', prompt: 'one', answer: true, query },
  { id: 'q-2', type: 'bool', prompt: 'two', answer: false, query },
];

describe('useQuizEngine', () => {
  it('blocks advancing before an answer and ignores a second answer', () => {
    const { result } = renderHook(() => useQuizEngine(questions));
    act(() => result.current.advanceQuestion());
    expect(result.current.currentIndex).toBe(0);
    let firstResult: boolean | null = null;
    let secondResult: boolean | null = true;
    act(() => { firstResult = result.current.submitAnswer(true); });
    act(() => { secondResult = result.current.submitAnswer(false); });
    expect(firstResult).not.toBeNull();
    expect(secondResult).toBeNull();
    expect(result.current.submittedAnswer).toBe(true);
  });

  it('presents every question once, then completes', () => {
    const { result } = renderHook(() => useQuizEngine(questions));
    const seenIds: string[] = [];
    for (let step = 0; step < questions.length; step += 1) {
      seenIds.push(result.current.currentQuestion!.id);
      act(() => { result.current.submitAnswer(true); });
      act(() => result.current.advanceQuestion());
    }
    expect(seenIds.sort()).toEqual(['q-1', 'q-2']);
    expect(result.current.isComplete).toBe(true);
  });

  it('keeps the round unchanged when the bank changes mid-round', () => {
    const { result, rerender } = renderHook(({ bank }) => useQuizEngine(bank), { initialProps: { bank: questions } });
    const firstId = result.current.currentQuestion!.id;
    act(() => { result.current.submitAnswer(true); });
    rerender({ bank: [{ id: 'q-new', type: 'bool', prompt: 'new', answer: true, query }] });
    expect(result.current.currentQuestion!.id).toBe(firstId);
    expect(result.current.totalQuestions).toBe(2);
    expect(result.current.isAnswered).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest services/quiz state/__tests__/useQuizEngine.test.tsx ; bash ~/.claude/enforce/tdd.sh red services/quiz/__tests__/quizService.test.ts state/__tests__/useQuizEngine.test.tsx
```

- [ ] **Step 3: Implement**

`services/quiz/quizService.ts`:

```ts
// Pure round logic: shuffling, grading, and accuracy.
import type { Question } from '../content/contentTypes';

export function shuffleQuestions<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function isAnswerCorrect(question: Question, submitted: number | boolean): boolean {
  return question.type === 'bool' ? submitted === question.answer : submitted === question.answerIndex;
}

export function calculateAccuracy(correctCount: number, totalCount: number): number {
  return totalCount === 0 ? 0 : Math.round((correctCount / totalCount) * 100);
}
```

`state/useQuizEngine.ts`:

```ts
// Drives one round. The shuffled question list is a snapshot taken when
// the round mounts, so a bank refresh that lands mid-round changes
// nothing until the next round.
import { useState } from 'react';
import type { Question } from '../services/content/contentTypes';
import { calculateAccuracy, isAnswerCorrect, shuffleQuestions } from '../services/quiz/quizService';

export function useQuizEngine(bankQuestions: readonly Question[]) {
  const [questions] = useState(() => shuffleQuestions(bankQuestions));
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submittedAnswer, setSubmittedAnswer] = useState<number | boolean | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const isComplete = currentIndex >= questions.length;
  const currentQuestion = isComplete ? null : questions[currentIndex];
  const isAnswered = submittedAnswer !== null;
  const wasCorrect = isAnswered && currentQuestion !== null && isAnswerCorrect(currentQuestion, submittedAnswer);

  function submitAnswer(value: number | boolean): boolean | null {
    if (isAnswered || !currentQuestion) return null;
    const isCorrect = isAnswerCorrect(currentQuestion, value);
    setSubmittedAnswer(value);
    if (isCorrect) setCorrectCount((count) => count + 1);
    return isCorrect;
  }

  function advanceQuestion(): void {
    if (!isAnswered) return;
    setSubmittedAnswer(null);
    setCurrentIndex((index) => index + 1);
  }

  return {
    currentQuestion,
    currentIndex,
    totalQuestions: questions.length,
    submittedAnswer,
    isAnswered,
    isComplete,
    wasCorrect,
    correctCount,
    accuracy: calculateAccuracy(correctCount, questions.length),
    submitAnswer,
    advanceQuestion,
  };
}
```

- [ ] **Step 4: Run to verify they pass and commit**

```bash
npx jest services/quiz state/__tests__/useQuizEngine.test.tsx
git add services/quiz state/useQuizEngine.ts state/__tests__/useQuizEngine.test.tsx
git commit -m "feat(quiz): port the quiz service and engine with a per-round snapshot

Refs: IAN-564"
```

### Task 15: Question cards, progress bar, and stats panel (B-7 display, B-27, B-33, Review Focus 3)

**Files:**
- Create: `components/quiz/Card.tsx`, `components/quiz/MultipleChoiceCard.tsx`, `components/quiz/BooleanCard.tsx`, `components/quiz/ProgressBar.tsx`, `components/stats/StatsPanel.tsx`
- Modify: `app/index.tsx` (render `<StatsPanel />` under the language list)
- Test: `components/quiz/__tests__/cards.test.tsx`, `components/stats/__tests__/StatsPanel.test.tsx`

**Interfaces:**
- Produces: `Card({ languageLabel, difficultyLabel, type, onOpenQuery, children })`; `MultipleChoiceCard({ question, grammar, submittedAnswer, isAnswered, onSelect })`; `BooleanCard({ question, grammar, submittedAnswer, isAnswered, onSelect })`; `ProgressBar({ current, total })`; `StatsPanel()`.
- Until Task 20, the cards render `question.code` in a monospace `Text`; Task 20 swaps in `CodeBlock`.

- [ ] **Step 1: Write the failing tests**

`components/quiz/__tests__/cards.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Question } from '../../../services/content/contentTypes';
import { BooleanCard } from '../BooleanCard';
import { MultipleChoiceCard } from '../MultipleChoiceCard';
import { ProgressBar } from '../ProgressBar';

const query = { title: 't', explanation: 'e' };
const HOSTILE = '<script>alert(1)</script><b>bold</b>';
const mcQuestion = { id: 'q-1', type: 'mc', prompt: HOSTILE, choices: [HOSTILE, 'plain'], answerIndex: 1, query } as Extract<Question, { type: 'mc' }>;
const boolQuestion = { id: 'q-2', type: 'bool', prompt: 'p', answer: false, query } as Extract<Question, { type: 'bool' }>;

describe('question cards', () => {
  it('renders markup in a prompt and a choice as literal text', () => {
    render(<MultipleChoiceCard question={mcQuestion} grammar="javascript" submittedAnswer={null} isAnswered={false} onSelect={jest.fn()} />);
    expect(screen.getAllByText(HOSTILE)).toHaveLength(2);
  });

  it('marks the chosen wrong answer and the correct answer once answered', () => {
    render(<MultipleChoiceCard question={mcQuestion} grammar="javascript" submittedAnswer={0} isAnswered onSelect={jest.fn()} />);
    expect(screen.getByLabelText(`${HOSTILE}, incorrect`)).toBeTruthy();
    expect(screen.getByLabelText('plain, correct')).toBeTruthy();
  });

  it('reports a boolean selection and disables both options after answering', () => {
    const onSelect = jest.fn();
    const { rerender } = render(<BooleanCard question={boolQuestion} grammar="python" submittedAnswer={null} isAnswered={false} onSelect={onSelect} />);
    fireEvent.press(screen.getByText('False'));
    expect(onSelect).toHaveBeenCalledWith(false);
    rerender(<BooleanCard question={boolQuestion} grammar="python" submittedAnswer={false} isAnswered onSelect={onSelect} />);
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('shows the position out of the total', () => {
    render(<ProgressBar current={2} total={10} />);
    expect(screen.getByText('Q3 / 10')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toHaveProp('aria-valuenow', 2);
  });
});
```

`components/stats/__tests__/StatsPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react-native';
import { StatsPanel } from '../StatsPanel';

jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({
    stats: {
      version: 1,
      streak: { current: 0, best: 0 },
      totals: { attempted: 4, correct: 3 },
      tracks: {
        'python:easy': { attempted: 4, correct: 3, completions: 1 },
        'cobol:hard': { attempted: 2, correct: 2, completions: 0 },
      },
    },
  }),
}));
jest.mock('../../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    schemaVersion: 1,
    languages: [{ id: 'python', label: 'Python', glyph: 'PY', tagline: 't', grammar: 'python', banks: {} }],
  }),
}));

describe('StatsPanel', () => {
  it('shows lifetime accuracy and a per-language, per-difficulty breakdown', () => {
    render(<StatsPanel />);
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('PY / Easy')).toBeTruthy();
  });

  it('omits stats for a language no longer in the manifest', () => {
    render(<StatsPanel />);
    expect(screen.queryByText(/cobol/i)).toBeNull();
    expect(screen.getAllByText(/%$/)).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest components/quiz/__tests__/cards.test.tsx components/stats ; bash ~/.claude/enforce/tdd.sh red components/quiz/__tests__/cards.test.tsx components/stats/__tests__/StatsPanel.test.tsx
```

- [ ] **Step 3: Implement**

`components/quiz/Card.tsx`:

```tsx
// Chrome shared by every question card: the language/difficulty/type
// header, the Query trigger, and a body slot with a stable minimum
// height so advancing does not shift the controls below it.
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

const TYPE_LABEL = { mc: 'Multiple choice', bool: 'True / False' } as const;

type CardProps = {
  languageLabel: string;
  difficultyLabel: string;
  type: 'mc' | 'bool';
  onOpenQuery: () => void;
  children: ReactNode;
};

export function Card({ languageLabel, difficultyLabel, type, onOpenQuery, children }: CardProps) {
  return (
    <View className="overflow-hidden rounded-lg border border-line bg-surface">
      <View className="flex-row flex-wrap items-center justify-between border-b border-line px-4 py-3">
        <Text className="font-mono text-[11px] uppercase tracking-widest text-muted">
          {`${languageLabel} / ${difficultyLabel} / ${TYPE_LABEL[type]}`}
        </Text>
        <Pressable role="button" aria-label="Query" onPress={onOpenQuery} className="rounded border border-line px-2 py-1">
          <Text className="font-mono text-[11px] uppercase tracking-widest text-muted">Query</Text>
        </Pressable>
      </View>
      <View className="min-h-[22rem] px-4 py-5">{children}</View>
    </View>
  );
}
```

`components/quiz/MultipleChoiceCard.tsx`:

```tsx
// A multiple-choice question: prompt, optional code, and up to four
// lettered choices that show correct and incorrect once answered.
import { Pressable, Text, View } from 'react-native';
import type { Grammar } from '../../constants/appConfig';
import type { Question } from '../../services/content/contentTypes';

const CHOICE_LABELS = ['A', 'B', 'C', 'D'];

type McQuestion = Extract<Question, { type: 'mc' }>;
type MultipleChoiceCardProps = {
  question: McQuestion;
  grammar: Grammar;
  submittedAnswer: number | boolean | null;
  isAnswered: boolean;
  onSelect: (index: number) => void;
};

function describeChoice(index: number, question: McQuestion, submittedAnswer: number | boolean | null, isAnswered: boolean) {
  if (isAnswered && index === question.answerIndex) return { toneClass: 'border-signal bg-signal/10', state: 'correct' };
  if (isAnswered && index === submittedAnswer) return { toneClass: 'border-danger bg-danger/10', state: 'incorrect' };
  return { toneClass: 'border-line', state: undefined };
}

export function MultipleChoiceCard({ question, submittedAnswer, isAnswered, onSelect }: MultipleChoiceCardProps) {
  return (
    <View>
      <Text className="text-lg leading-relaxed text-ink">{question.prompt}</Text>
      {question.code ? <Text className="mt-4 font-mono text-sm text-ink">{question.code}</Text> : null}
      <View className="mt-6 gap-2">
        {question.choices.map((choice, index) => {
          const { toneClass, state } = describeChoice(index, question, submittedAnswer, isAnswered);
          return (
            <Pressable
              key={`${index}-${choice}`}
              role="button"
              disabled={isAnswered}
              aria-label={state ? `${choice}, ${state}` : choice}
              onPress={() => onSelect(index)}
              className={`flex-row items-center gap-3 rounded-md border px-4 py-3 ${toneClass}`}
            >
              <Text className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-muted">{CHOICE_LABELS[index]}</Text>
              <Text className="flex-1 text-sm text-ink">{choice}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
```

`components/quiz/BooleanCard.tsx`:

```tsx
// A True/False statement with two large choices that show correct and
// incorrect once answered.
import { Pressable, Text, View } from 'react-native';
import type { Grammar } from '../../constants/appConfig';
import type { Question } from '../../services/content/contentTypes';

type BoolQuestion = Extract<Question, { type: 'bool' }>;
type BooleanCardProps = {
  question: BoolQuestion;
  grammar: Grammar;
  submittedAnswer: number | boolean | null;
  isAnswered: boolean;
  onSelect: (value: boolean) => void;
};

const OPTIONS = [
  { value: true, label: 'True', keyHint: 'T' },
  { value: false, label: 'False', keyHint: 'F' },
] as const;

function describeOption(value: boolean, question: BoolQuestion, submittedAnswer: number | boolean | null, isAnswered: boolean) {
  if (isAnswered && value === question.answer) return { toneClass: 'border-signal bg-signal/10', state: 'correct' };
  if (isAnswered && value === submittedAnswer) return { toneClass: 'border-danger bg-danger/10', state: 'incorrect' };
  return { toneClass: 'border-line', state: undefined };
}

export function BooleanCard({ question, submittedAnswer, isAnswered, onSelect }: BooleanCardProps) {
  return (
    <View>
      <Text className="text-lg leading-relaxed text-ink">{question.prompt}</Text>
      {question.code ? <Text className="mt-4 font-mono text-sm text-ink">{question.code}</Text> : null}
      <View className="mt-6 flex-row gap-2">
        {OPTIONS.map(({ value, label, keyHint }) => {
          const { toneClass, state } = describeOption(value, question, submittedAnswer, isAnswered);
          return (
            <Pressable
              key={label}
              role="button"
              disabled={isAnswered}
              aria-label={state ? `${label}, ${state}` : label}
              onPress={() => onSelect(value)}
              className={`flex-1 flex-row items-center justify-center gap-3 rounded-md border px-4 py-5 ${toneClass}`}
            >
              <Text className="rounded border border-line px-1.5 py-0.5 font-mono text-xs text-muted">{keyHint}</Text>
              <Text className="font-mono text-base text-ink">{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
```

`components/quiz/ProgressBar.tsx`:

```tsx
// Position within the current round, as text and as a thin bar.
import { Text, View } from 'react-native';

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const percent = total === 0 ? 0 : Math.round((current / total) * 100);
  return (
    <View className="px-4 pt-3">
      <Text className="mb-2 font-mono text-xs uppercase tracking-widest text-muted">
        {`Q${Math.min(current + 1, total)} / ${total}`}
      </Text>
      <View
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        className="h-1 w-full overflow-hidden rounded-full bg-line"
      >
        <View className="h-full bg-signal" style={{ width: `${percent}%` }} />
      </View>
    </View>
  );
}
```

`components/stats/StatsPanel.tsx`:

```tsx
// Lifetime accuracy and a per-language, per-difficulty breakdown for the
// languages the manifest currently lists.
import { Text, View } from 'react-native';
import { DIFFICULTIES } from '../../constants/appConfig';
import { calculateAccuracy } from '../../services/quiz/quizService';
import { buildStatsKey, type Stats } from '../../services/stats/statsService';
import type { Manifest } from '../../services/content/contentTypes';
import { useQuizStats } from '../../state/StatsProvider';
import { useLanguageManifest } from '../../state/useLanguageManifest';

function buildBreakdown(stats: Stats, manifest: Manifest) {
  return manifest.languages.flatMap((language) =>
    DIFFICULTIES.flatMap((difficulty) => {
      const entry = stats.tracks[buildStatsKey({ language: language.id, difficulty: difficulty.id })];
      if (!entry || entry.attempted === 0) return [];
      return [{ key: `${language.id}:${difficulty.id}`, label: `${language.glyph} / ${difficulty.label}`, accuracy: calculateAccuracy(entry.correct, entry.attempted) }];
    }),
  );
}

export function StatsPanel() {
  const { stats } = useQuizStats();
  const manifest = useLanguageManifest();
  const hasHistory = stats.totals.attempted > 0;
  const lifetimeAccuracy = calculateAccuracy(stats.totals.correct, stats.totals.attempted);
  return (
    <View className="mt-10 border-t border-line pt-6">
      <View className="flex-row items-center justify-between">
        <Text className="font-mono text-xs uppercase tracking-widest text-muted">Lifetime accuracy</Text>
        <Text className="font-mono text-xs text-ink">{hasHistory ? `${lifetimeAccuracy}%` : 'none yet'}</Text>
      </View>
      {hasHistory ? (
        <View className="mt-4 flex-row flex-wrap gap-2">
          {buildBreakdown(stats, manifest).map(({ key, label, accuracy }) => (
            <View key={key} className="rounded border border-line px-3 py-2">
              <Text className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</Text>
              <Text className="mt-1 font-mono text-sm text-ink">{`${accuracy}%`}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 4: Run to verify they pass and commit**

```bash
npx jest components/quiz/__tests__/cards.test.tsx components/stats
git add components app/index.tsx
git commit -m "feat(quiz): question cards, progress bar, and the stats panel

Refs: IAN-564"
```

### Task 16: Query drawer (B-29)

**Files:**
- Create: `components/query/QueryDrawer.tsx`
- Test: `components/query/__tests__/QueryDrawer.test.tsx`

**Interfaces:**
- Produces: `QueryDrawer({ isOpen, query, grammar, onClose })`.

- [ ] **Step 1: Write the failing test**

`components/query/__tests__/QueryDrawer.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryDrawer } from '../QueryDrawer';

const query = { title: 'NaN is never equal', syntax: "float('nan')", explanation: '<b>IEEE</b> 754', tags: ['numbers', 'float'] };

describe('QueryDrawer', () => {
  it('shows the title, syntax, explanation as literal text, and tags', () => {
    render(<QueryDrawer isOpen query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.getByText('NaN is never equal')).toBeTruthy();
    expect(screen.getByText('<b>IEEE</b> 754')).toBeTruthy();
    expect(screen.getByText('numbers')).toBeTruthy();
    expect(screen.getByText('float')).toBeTruthy();
  });

  it('closes from the close control, the backdrop, and the platform back action', () => {
    const onClose = jest.fn();
    render(<QueryDrawer isOpen query={query} grammar="python" onClose={onClose} />);
    fireEvent.press(screen.getByRole('button', { name: 'Close query' }));
    fireEvent.press(screen.getByTestId('query-backdrop'));
    fireEvent(screen.getByTestId('query-modal'), 'requestClose');
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('renders nothing visible when closed', () => {
    render(<QueryDrawer isOpen={false} query={query} grammar="python" onClose={jest.fn()} />);
    expect(screen.queryByText('NaN is never equal')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest components/query ; bash ~/.claude/enforce/tdd.sh red components/query/__tests__/QueryDrawer.test.tsx
```

- [ ] **Step 3: Implement**

`components/query/QueryDrawer.tsx`:

```tsx
// The Query panel: the syntax, method, and context behind the current
// question, in a modal that closes by its control, the backdrop, or the
// platform back action. Slides in unless reduced motion is requested.
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import type { Grammar } from '../../constants/appConfig';
import type { Query } from '../../services/content/contentTypes';

type QueryDrawerProps = { isOpen: boolean; query: Query; grammar: Grammar; onClose: () => void };

export function QueryDrawer({ isOpen, query, onClose }: QueryDrawerProps) {
  const isReducedMotion = useReducedMotion();
  return (
    <Modal testID="query-modal" visible={isOpen} transparent animationType={isReducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <View className="flex-1 flex-row">
        <Pressable testID="query-backdrop" aria-hidden className="flex-1 bg-black/60" onPress={onClose} />
        <ScrollView className="w-full max-w-[420px] border-l border-line bg-surface" contentContainerClassName="p-5">
          <View className="mb-6 flex-row items-center justify-between">
            <Text className="font-mono text-xs uppercase tracking-widest text-signal">Query</Text>
            <Pressable role="button" aria-label="Close query" onPress={onClose}>
              <Text className="font-mono text-xs text-muted">close</Text>
            </Pressable>
          </View>
          <Text role="heading" aria-level={2} className="mb-4 font-mono text-lg text-ink">
            {query.title}
          </Text>
          {query.syntax ? <Text className="mb-4 font-mono text-sm text-ink">{query.syntax}</Text> : null}
          <Text className="text-sm leading-relaxed text-ink">{query.explanation}</Text>
          {query.tags?.length ? (
            <View className="mt-6 flex-row flex-wrap gap-2">
              {query.tags.map((tag) => (
                <Text key={tag} className="rounded border border-line px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted">
                  {tag}
                </Text>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}
```

On a phone the panel is full width, so the backdrop has no width and the close control and back gesture remain; on a wide web window the backdrop fills the left side. Task 20 replaces the syntax `Text` with `CodeBlock`.

- [ ] **Step 4: Run to verify it passes and commit**

```bash
npx jest components/query
git add components/query
git commit -m "feat(quiz): query drawer as a modal with backdrop and back-action close

Refs: IAN-564"
```

### Task 17: Round screen, Explain, results, retry, and exits (B-8 wiring, B-28, B-29 inert half, B-30, B-31)

**Files:**
- Create: `components/quiz/ResultsScreen.tsx`, `components/quiz/QuizRound.tsx`, `app/[language]/[difficulty].tsx`
- Test: `components/quiz/__tests__/QuizRound.test.tsx`, `app/__tests__/roundRoute.test.tsx`

**Interfaces:**
- Consumes: `useQuizEngine`, `useQuizStats`, `useQuestionBank`, `useLanguageManifest`, `Card`, `MultipleChoiceCard`, `BooleanCard`, `ProgressBar`, `QueryDrawer`.
- Produces: `QuizRound({ language, languageLabel, difficulty, difficultyLabel, grammar, questions, onExit, onRetry })`; `ResultsScreen({ languageLabel, difficultyLabel, correctCount, totalQuestions, accuracy, onRetry, onMenu })`.

- [ ] **Step 1: Write the failing tests**

`components/quiz/__tests__/QuizRound.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Question } from '../../../services/content/contentTypes';
import { QuizRound } from '../QuizRound';

const mockRecordAnswer = jest.fn();
const mockRecordCompletion = jest.fn();
jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ recordAnswer: mockRecordAnswer, recordCompletion: mockRecordCompletion, isHydrated: true }),
}));

const query = { title: 'Why', explanation: 'Because' };
const questions: Question[] = [{ id: 'q-1', type: 'bool', prompt: 'Is it?', answer: true, query }];

function renderRound() {
  const handlers = { onExit: jest.fn(), onRetry: jest.fn() };
  render(
    <QuizRound language="python" languageLabel="Python" difficulty="easy" difficultyLabel="Easy" grammar="python" questions={questions} {...handlers} />,
  );
  return handlers;
}

describe('QuizRound', () => {
  beforeEach(() => jest.clearAllMocks());

  it('offers Explain after an incorrect answer, opening the query without advancing', () => {
    renderRound();
    fireEvent.press(screen.getByText('False'));
    fireEvent.press(screen.getByRole('button', { name: 'Explain' }));
    expect(screen.getByText('Because')).toBeTruthy();
    expect(screen.getByText('Is it?')).toBeTruthy();
  });

  it('does not offer Explain after a correct answer', () => {
    renderRound();
    fireEvent.press(screen.getByText('True'));
    expect(screen.queryByRole('button', { name: 'Explain' })).toBeNull();
  });

  it('closes the drawer when advancing, shows results, and records one completion', () => {
    renderRound();
    fireEvent.press(screen.getByText('True'));
    fireEvent.press(screen.getByRole('button', { name: 'Query' }));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.queryByText('Because')).toBeNull();
    expect(screen.getByText('100%')).toBeTruthy();
    expect(screen.getByText('1 of 1 correct')).toBeTruthy();
    expect(mockRecordCompletion).toHaveBeenCalledTimes(1);
    expect(mockRecordAnswer).toHaveBeenCalledWith({ language: 'python', difficulty: 'easy', wasCorrect: true });
  });

  it('records no completion when leaving early', () => {
    const { onExit } = renderRound();
    fireEvent.press(screen.getByRole('button', { name: 'Back to menu' }));
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(mockRecordCompletion).not.toHaveBeenCalled();
  });

  it('retries and returns to the menu from the results screen', () => {
    const { onExit, onRetry } = renderRound();
    fireEvent.press(screen.getByText('True'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
```

`app/__tests__/roundRoute.test.tsx`:

```tsx
import { fireEvent, screen } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import RoundScreen from '../[language]/[difficulty]';

jest.mock('../../state/StatsProvider', () => ({
  useQuizStats: () => ({ recordAnswer: jest.fn(), recordCompletion: jest.fn(), isHydrated: true }),
}));
jest.mock('../../state/useLanguageManifest', () => ({
  useLanguageManifest: () => ({
    schemaVersion: 1,
    languages: [{ id: 'python', label: 'Python', glyph: 'PY', tagline: 't', grammar: 'python', banks: { easy: { path: 'python/easy.json', hash: 'a'.repeat(64) } } }],
  }),
}));
jest.mock('../../state/useQuestionBank', () => ({
  useQuestionBank: () => ({
    status: 'ready',
    bank: { hash: 'a'.repeat(64), questions: [{ id: 'q-1', type: 'bool', prompt: 'Is it?', answer: true, query: { title: 't', explanation: 'e' } }] },
  }),
}));

describe('round route', () => {
  it('resets every piece of round state on Retry', async () => {
    renderRouter({ '[language]/[difficulty]': RoundScreen }, { initialUrl: '/python/easy' });
    fireEvent.press(await screen.findByText('True'));
    fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(screen.getByText('Q1 / 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest components/quiz/__tests__/QuizRound.test.tsx app/__tests__/roundRoute.test.tsx ; bash ~/.claude/enforce/tdd.sh red components/quiz/__tests__/QuizRound.test.tsx app/__tests__/roundRoute.test.tsx
```

- [ ] **Step 3: Implement**

`components/quiz/ResultsScreen.tsx`:

```tsx
// Shown when a round ends: accuracy, correct count, and Retry or Menu.
import { Pressable, Text, View } from 'react-native';

type ResultsScreenProps = {
  languageLabel: string;
  difficultyLabel: string;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  onRetry: () => void;
  onMenu: () => void;
};

export function ResultsScreen({ languageLabel, difficultyLabel, correctCount, totalQuestions, accuracy, onRetry, onMenu }: ResultsScreenProps) {
  return (
    <View className="flex-1 items-center justify-center px-4 py-8">
      <Text className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">{`${languageLabel} / ${difficultyLabel} / Complete`}</Text>
      <Text className="font-mono text-5xl text-signal">{`${accuracy}%`}</Text>
      <Text className="mt-3 text-sm text-muted">{`${correctCount} of ${totalQuestions} correct`}</Text>
      <View className="mt-10 w-full max-w-xs gap-3">
        <Pressable role="button" aria-label="Retry" onPress={onRetry} className="rounded bg-signal px-5 py-2.5">
          <Text className="text-center font-mono text-sm uppercase text-obsidian">Retry</Text>
        </Pressable>
        <Pressable role="button" aria-label="Menu" onPress={onMenu} className="rounded border border-line px-5 py-2.5">
          <Text className="text-center font-mono text-sm uppercase text-muted">Menu</Text>
        </Pressable>
      </View>
    </View>
  );
}
```

`components/quiz/QuizRound.tsx`:

```tsx
// One round: wires the engine to the cards, the query drawer, and stats,
// and switches to the results screen when the round completes. Answers
// are refused while the drawer is open, and advancing closes it.
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { Grammar } from '../../constants/appConfig';
import type { Question } from '../../services/content/contentTypes';
import { useQuizStats } from '../../state/StatsProvider';
import { useQuizEngine } from '../../state/useQuizEngine';
import { QueryDrawer } from '../query/QueryDrawer';
import { BooleanCard } from './BooleanCard';
import { Card } from './Card';
import { MultipleChoiceCard } from './MultipleChoiceCard';
import { ProgressBar } from './ProgressBar';
import { ResultsScreen } from './ResultsScreen';

export type QuizRoundProps = {
  language: string;
  languageLabel: string;
  difficulty: string;
  difficultyLabel: string;
  grammar: Grammar;
  questions: readonly Question[];
  onExit: () => void;
  onRetry: () => void;
};

export function QuizRound(props: QuizRoundProps) {
  const { language, languageLabel, difficulty, difficultyLabel, grammar, questions, onExit, onRetry } = props;
  const engine = useQuizEngine(questions);
  const { recordAnswer, recordCompletion } = useQuizStats();
  const [isQueryOpen, setIsQueryOpen] = useState(false);

  useEffect(() => {
    if (engine.isComplete) recordCompletion({ language, difficulty });
  }, [engine.isComplete]);

  function handleAnswer(value: number | boolean) {
    if (isQueryOpen) return;
    const wasCorrect = engine.submitAnswer(value);
    if (wasCorrect !== null) recordAnswer({ language, difficulty, wasCorrect });
  }

  function handleAdvance() {
    setIsQueryOpen(false);
    engine.advanceQuestion();
  }

  if (engine.isComplete) {
    return (
      <ResultsScreen
        languageLabel={languageLabel}
        difficultyLabel={difficultyLabel}
        correctCount={engine.correctCount}
        totalQuestions={engine.totalQuestions}
        accuracy={engine.accuracy}
        onRetry={onRetry}
        onMenu={onExit}
      />
    );
  }

  const question = engine.currentQuestion!;
  const answerState = { grammar, submittedAnswer: engine.submittedAnswer, isAnswered: engine.isAnswered };
  return (
    <View className="flex-1">
      <View className="flex-row px-4 pt-3">
        <Pressable role="button" aria-label="Back to menu" onPress={onExit}>
          <Text className="font-mono text-xs text-muted">Back</Text>
        </Pressable>
      </View>
      <ProgressBar current={engine.currentIndex} total={engine.totalQuestions} />
      <ScrollView contentContainerClassName="flex-grow items-center px-4 py-6">
        <View className="w-full max-w-2xl">
          <Card languageLabel={languageLabel} difficultyLabel={difficultyLabel} type={question.type} onOpenQuery={() => setIsQueryOpen(true)}>
            {question.type === 'mc' ? (
              <MultipleChoiceCard question={question} {...answerState} onSelect={handleAnswer} />
            ) : (
              <BooleanCard question={question} {...answerState} onSelect={handleAnswer} />
            )}
          </Card>
          {engine.isAnswered ? (
            <View className="mt-4 gap-3">
              {!engine.wasCorrect ? (
                <Pressable role="button" aria-label="Explain" onPress={() => setIsQueryOpen(true)} className="rounded-md border border-line py-3">
                  <Text className="text-center font-mono text-sm uppercase tracking-widest text-muted">Explain</Text>
                </Pressable>
              ) : null}
              <Pressable role="button" aria-label="Continue" onPress={handleAdvance} className="rounded-md bg-signal py-3">
                <Text className="text-center font-mono text-sm uppercase tracking-widest text-obsidian">Continue</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <QueryDrawer isOpen={isQueryOpen} query={question.query} grammar={grammar} onClose={() => setIsQueryOpen(false)} />
    </View>
  );
}
```

While the drawer is open it is a modal, so touches cannot reach the cards on native; the `isQueryOpen` guard in `handleAnswer` covers keyboard input on the web (Task 21).

`app/[language]/[difficulty].tsx`:

```tsx
// Round route: resolves the language and difficulty against the manifest,
// waits for stats hydration and a ready bank, and remounts the round
// under a new key on Retry so every piece of round state resets.
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { QuizRound } from '../../components/quiz/QuizRound';
import { DIFFICULTIES } from '../../constants/appConfig';
import { useQuizStats } from '../../state/StatsProvider';
import { useLanguageManifest } from '../../state/useLanguageManifest';
import { useQuestionBank } from '../../state/useQuestionBank';
import NotFoundScreen from '../+not-found';

export default function RoundScreen() {
  const { language, difficulty } = useLocalSearchParams<{ language: string; difficulty: string }>();
  const [roundKey, setRoundKey] = useState(0);
  const { isHydrated } = useQuizStats();
  const manifest = useLanguageManifest();
  const bankState = useQuestionBank(language, difficulty);
  const languageEntry = manifest.languages.find((entry) => entry.id === language);
  const difficultyEntry = DIFFICULTIES.find((entry) => entry.id === difficulty);

  if (!languageEntry || !difficultyEntry || bankState.status === 'unknown') return <NotFoundScreen />;
  if (bankState.status === 'error') {
    return (
      <View className="flex-1 items-center justify-center gap-4">
        <Text className="font-mono text-sm text-danger">Download failed</Text>
        <Pressable role="button" aria-label="Retry download" onPress={bankState.retry}>
          <Text className="font-mono text-sm text-signal">Retry</Text>
        </Pressable>
      </View>
    );
  }
  if (!isHydrated || bankState.status !== 'ready') return <ActivityIndicator className="flex-1" />;
  return (
    <QuizRound
      key={roundKey}
      language={language}
      languageLabel={languageEntry.label}
      difficulty={difficulty}
      difficultyLabel={difficultyEntry.label}
      grammar={languageEntry.grammar}
      questions={bankState.bank.questions}
      onExit={() => router.replace('/')}
      onRetry={() => setRoundKey((key) => key + 1)}
    />
  );
}
```

- [ ] **Step 4: Run to verify they pass, close slice 5, commit**

```bash
npx jest components/quiz app && bash ~/.claude/enforce/tdd.sh green && bash ~/.claude/enforce/tdd.sh close
git add components/quiz app
git commit -m "feat(quiz): round screen with Explain, results, retry, and exits

Refs: IAN-564"
```

### Task 20: Code block from Prism tokens (B-34, B-35, B-36, Review Focus 4)

Slice 6 is high-risk: run the triad.

**Files:**
- Create: `services/codeBlock/tokenizeCode.ts`, `components/quiz/CodeBlock.tsx`
- Modify: `components/quiz/MultipleChoiceCard.tsx`, `components/quiz/BooleanCard.tsx`, `components/query/QueryDrawer.tsx`
- Test: `services/codeBlock/__tests__/tokenizeCode.test.ts`, `components/quiz/__tests__/CodeBlock.test.tsx`

**Interfaces:**
- Produces: `type CodeToken = { text: string; types: string[] }`; `tokenizeCode(code: string, grammar: Grammar): CodeToken[]` (flattened, nested types accumulated; `plain` returns one entry with `types: []`); `CodeBlock({ code, grammar, className? })`; `TOKEN_COLORS: Record<string, string>`.

- [ ] **Step 1: Open slice 6 and write the failing tests**

```bash
bash ~/.claude/enforce/tdd.sh open "slice 6: code block" --spec docs/superpowers/specs/2026-10-02-expo-universal-app-design.md
```

`services/codeBlock/__tests__/tokenizeCode.test.ts`:

```ts
import type { Grammar } from '../../../constants/appConfig';
import { tokenizeCode } from '../tokenizeCode';

function joinText(code: string, grammar: Grammar): string {
  return tokenizeCode(code, grammar).map((entry) => entry.text).join('');
}

function findTypesOf(code: string, grammar: Grammar, word: string): string[] | undefined {
  return tokenizeCode(code, grammar).find((entry) => entry.text === word)?.types;
}

describe('tokenizeCode', () => {
  it.each(['<img src=x onerror=alert(1)>', '</code><script>1</script>'])('preserves hostile code %p as exact text', (code) => {
    expect(joinText(code, 'javascript')).toBe(code);
  });

  it('tags keywords with their grammar for each existing language', () => {
    expect(findTypesOf('def f(): pass', 'python', 'def')).toContain('keyword');
    expect(findTypesOf('SELECT 1', 'sql', 'SELECT')).toContain('keyword');
    expect(findTypesOf('const x = 1', 'javascript', 'const')).toContain('keyword');
  });

  it('returns plain text for the plain grammar', () => {
    expect(tokenizeCode('def f(): pass', 'plain')).toEqual([{ text: 'def f(): pass', types: [] }]);
  });

  it('preserves whitespace and newlines exactly', () => {
    const code = 'if x:\n    return  1\n';
    expect(joinText(code, 'python')).toBe(code);
  });
});
```

`components/quiz/__tests__/CodeBlock.test.tsx`:

```tsx
import { execSync } from 'node:child_process';
import { render, screen } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { CodeBlock } from '../CodeBlock';

describe('CodeBlock', () => {
  it('renders hostile code as literal text', () => {
    render(<CodeBlock code={'</code><script>1</script>'} grammar="javascript" />);
    expect(screen.getByTestId('code-block')).toHaveTextContent('</code><script>1</script>');
  });

  it('wraps code in a horizontal scroll view', () => {
    const { UNSAFE_getByType } = render(<CodeBlock code={'x'.repeat(400)} grammar="python" />);
    expect(UNSAFE_getByType(ScrollView).props.horizontal).toBe(true);
  });

  it('never uses dangerouslySetInnerHTML in the app tree', () => {
    const matches = execSync('grep -rl dangerouslySetInnerHTML app components state services || true', { encoding: 'utf8' }).trim();
    expect(matches).toBe('');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest services/codeBlock components/quiz/__tests__/CodeBlock.test.tsx ; bash ~/.claude/enforce/tdd.sh red services/codeBlock/__tests__/tokenizeCode.test.ts components/quiz/__tests__/CodeBlock.test.tsx
```

- [ ] **Step 3: Implement**

`services/codeBlock/tokenizeCode.ts`:

```ts
// Turns code into flat pieces tagged with Prism token types, without ever
// producing HTML. The renderer maps types to colors and renders each
// piece as Text, so code is always shown as literal characters.
import Prism from 'prismjs';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-bash';
import type { Grammar } from '../../constants/appConfig';

export type CodeToken = { text: string; types: string[] };

function flattenPiece(piece: string | Prism.Token, inheritedTypes: string[]): CodeToken[] {
  if (!(piece instanceof Prism.Token)) return [{ text: String(piece), types: inheritedTypes }];
  const aliases = piece.alias ? ([] as string[]).concat(piece.alias) : [];
  const types = [...inheritedTypes, piece.type, ...aliases];
  const children = Array.isArray(piece.content) ? piece.content : [piece.content];
  return children.flatMap((child) => flattenPiece(child, types));
}

export function tokenizeCode(code: string, grammar: Grammar): CodeToken[] {
  const prismGrammar = grammar === 'plain' ? undefined : Prism.languages[grammar];
  if (!prismGrammar) return [{ text: code, types: [] }];
  return Prism.tokenize(code, prismGrammar).flatMap((piece) => flattenPiece(piece, []));
}
```

`components/quiz/CodeBlock.tsx`:

```tsx
// A code snippet rendered from Prism tokens as nested Text: colored by
// token type, whitespace preserved, scrolling horizontally for long lines.
import { ScrollView, Text, View } from 'react-native';
import type { Grammar } from '../../constants/appConfig';
import { tokenizeCode } from '../../services/codeBlock/tokenizeCode';

export const TOKEN_COLORS: Record<string, string> = {
  comment: 'text-muted italic',
  prolog: 'text-muted',
  doctype: 'text-muted',
  cdata: 'text-muted',
  keyword: 'text-signal',
  builtin: 'text-signal/75',
  constant: 'text-signal/75',
  string: 'text-amber',
  char: 'text-amber',
  number: 'text-amber',
  boolean: 'text-amber',
  function: 'text-cyan',
  property: 'text-cyan',
  'class-name': 'text-violet',
  operator: 'text-muted',
  punctuation: 'text-muted',
};

function pickTokenColor(types: string[]): string {
  for (let index = types.length - 1; index >= 0; index -= 1) {
    const color = TOKEN_COLORS[types[index]];
    if (color) return color;
  }
  return 'text-ink';
}

export function CodeBlock({ code, grammar, className = '' }: { code: string; grammar: Grammar; className?: string }) {
  const pieces = tokenizeCode(code, grammar);
  return (
    <View className={`rounded-md border border-line bg-obsidian ${className}`}>
      <ScrollView horizontal contentContainerClassName="px-4 py-3">
        <Text testID="code-block" className="font-mono text-sm text-ink">
          {pieces.map((piece, index) => (
            <Text key={index} className={pickTokenColor(piece.types)}>
              {piece.text}
            </Text>
          ))}
        </Text>
      </ScrollView>
    </View>
  );
}
```

In `MultipleChoiceCard` and `BooleanCard`, replace the monospace `Text` for `question.code` with `<CodeBlock code={question.code} grammar={grammar} className="mt-4" />` (add `grammar` to the destructured props). In `QueryDrawer`, replace the syntax `Text` with `<CodeBlock code={query.syntax} grammar={grammar} className="mb-4" />` (add `grammar` to its destructured props).

- [ ] **Step 4: Verify, close slice 6, commit, push PR 2**

```bash
npx jest services/codeBlock components && bash ~/.claude/enforce/tdd.sh green && bash ~/.claude/enforce/tdd.sh close
git add services/codeBlock components
git commit -m "feat(quiz): code block rendered from Prism tokens as text

Refs: IAN-564"
npm test && npm run lint && npm run expo:export:preview
git push -u origin feat/expo-screens
```

Then the R-109 security review, the R-517 review, the IAN-564 transition comment, and the owner's merge (high-risk). Start PR 3 after `git log origin/main` shows PR 2.

---

# PR 3: web parity, cutover, device builds, docs (Risk: standard)

```bash
git fetch origin && git checkout -b feat/expo-cutover origin/main
bash ~/.claude/skills/task-start/scripts/task-tier.sh set complex "Web parity, Vite cutover, device builds, and docs for IAN-564" --ticket IAN-564 --scope "app,components,state,constants,scripts,.github,docs,README.md,package.json,package-lock.json,tsconfig.json,jest.config.js,eas.json,src,index.html,vite.config.js"
```

### Task 21: Web keyboard navigation (B-37)

**Files:**
- Create: `state/useKeyboardNav.ts`, `components/quiz/KeyboardHintBar.tsx`
- Modify: `constants/appConfig.ts`, `components/quiz/QuizRound.tsx`, `components/quiz/ResultsScreen.tsx`, `app/index.tsx`, `app/[language]/index.tsx`
- Test: `components/quiz/__tests__/keyboard.web.test.tsx`, `components/quiz/__tests__/KeyboardHintBar.test.tsx`

**Interfaces:**
- Produces: `useKeyboardNav({ onSelectChoice?, onSelectBool?, onAdvance?, onToggleQuery?, onEscape?, isEnabled? })` (no-op unless `Platform.OS === 'web'`); `KeyboardHintBar({ questionType, isAnswered })` (renders `null` off the web); `KEY_BINDINGS` in `constants/appConfig.ts`, copied from `src/constants/appConfig.js`.

- [ ] **Step 1: Open slice 7 and write the failing tests**

```bash
bash ~/.claude/enforce/tdd.sh open "slice 7: web parity and cutover" --spec docs/superpowers/specs/2026-10-02-expo-universal-app-design.md
```

`components/quiz/__tests__/keyboard.web.test.tsx`:

```tsx
import { act, render, screen } from '@testing-library/react-native';
import type { Question } from '../../../services/content/contentTypes';
import { QuizRound } from '../QuizRound';

jest.mock('../../../state/StatsProvider', () => ({
  useQuizStats: () => ({ recordAnswer: jest.fn(), recordCompletion: jest.fn(), isHydrated: true }),
}));

const query = { title: 'Why', explanation: 'Because' };
const mcQuestion: Question = { id: 'q-1', type: 'mc', prompt: 'Pick', choices: ['a', 'b', 'c', 'd'], answerIndex: 2, query };
const boolQuestion: Question = { id: 'q-2', type: 'bool', prompt: 'Yes?', answer: true, query };

function renderRound(question: Question, onExit = jest.fn()) {
  render(
    <QuizRound language="python" languageLabel="Python" difficulty="easy" difficultyLabel="Easy" grammar="python" questions={[question]} onExit={onExit} onRetry={jest.fn()} />,
  );
  return onExit;
}

function pressKey(key: string) {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  });
}

describe('web keyboard navigation', () => {
  it.each([
    ['3', 'c, correct'],
    ['C', 'c, correct'],
    ['a', 'a, incorrect'],
  ])('key %p selects a choice', (key, label) => {
    renderRound(mcQuestion);
    pressKey(key);
    expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('T and F answer a boolean question', () => {
    renderRound(boolQuestion);
    pressKey('f');
    expect(screen.getByLabelText('False, incorrect')).toBeTruthy();
  });

  it('Enter advances after an answer', () => {
    renderRound(mcQuestion);
    pressKey('3');
    pressKey('Enter');
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('Q toggles the query and Escape closes the drawer before leaving the round', () => {
    const onExit = renderRound(mcQuestion);
    pressKey('q');
    expect(screen.getByText('Because')).toBeTruthy();
    pressKey('Escape');
    expect(screen.queryByText('Because')).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
    pressKey('Escape');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('ignores answer keys while the drawer is open', () => {
    renderRound(mcQuestion);
    pressKey('q');
    pressKey('3');
    expect(screen.queryByLabelText('c, correct')).toBeNull();
  });
});
```

`components/quiz/__tests__/KeyboardHintBar.test.tsx`:

```tsx
import { render } from '@testing-library/react-native';
import { KeyboardHintBar } from '../KeyboardHintBar';

describe('KeyboardHintBar', () => {
  it('renders nothing on native', () => {
    const { toJSON } = render(<KeyboardHintBar questionType="mc" isAnswered={false} />);
    expect(toJSON()).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx jest components/quiz/__tests__/keyboard.web.test.tsx components/quiz/__tests__/KeyboardHintBar.test.tsx ; bash ~/.claude/enforce/tdd.sh red components/quiz/__tests__/keyboard.web.test.tsx components/quiz/__tests__/KeyboardHintBar.test.tsx
```

- [ ] **Step 3: Implement**

`constants/appConfig.ts` addition:

```ts
export const KEY_BINDINGS = {
  choice: ['1', '2', '3', '4', 'A', 'B', 'C', 'D'],
  boolTrue: ['T'],
  boolFalse: ['F'],
  next: ['Enter'],
  query: ['Q'],
  escape: ['Escape'],
} as const;
```

`state/useKeyboardNav.ts`:

```ts
// Web-only global key bindings: 1-4 and A-D choose, T/F answer booleans,
// Enter advances, Q toggles the query, Escape backs out. A no-op on
// native, where every action is a touch target.
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

const CHOICE_KEY_TO_INDEX: Record<string, number> = { 1: 0, 2: 1, 3: 2, 4: 3, a: 0, b: 1, c: 2, d: 3 };

type KeyboardHandlers = {
  onSelectChoice?: (index: number) => void;
  onSelectBool?: (value: boolean) => void;
  onAdvance?: () => void;
  onToggleQuery?: () => void;
  onEscape?: () => void;
  isEnabled?: boolean;
};

function dispatchKey(key: string, handlers: KeyboardHandlers): void {
  const { onSelectChoice, onSelectBool, onAdvance, onToggleQuery, onEscape } = handlers;
  const lowerKey = key.toLowerCase();
  if (key === 'Escape') return onEscape?.();
  if (key === 'Enter') return onAdvance?.();
  if (lowerKey === 'q') return onToggleQuery?.();
  if (onSelectBool && (lowerKey === 't' || lowerKey === 'f')) return onSelectBool(lowerKey === 't');
  if (onSelectChoice && lowerKey in CHOICE_KEY_TO_INDEX) onSelectChoice(CHOICE_KEY_TO_INDEX[lowerKey]);
}

export function useKeyboardNav(handlers: KeyboardHandlers): void {
  const latestHandlers = useRef(handlers);
  latestHandlers.current = handlers;
  const { isEnabled = true } = handlers;

  useEffect(() => {
    if (Platform.OS !== 'web' || !isEnabled) return undefined;
    function handleKeyDown(event: KeyboardEvent) {
      dispatchKey(event.key, latestHandlers.current);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled]);
}
```

`components/quiz/KeyboardHintBar.tsx`:

```tsx
// Web-only footer listing the key bindings for the current card.
import { Platform, Text, View } from 'react-native';

function Hint({ keys, label }: { keys: string; label: string }) {
  return (
    <View className="flex-row items-center gap-1.5">
      <Text className="rounded border border-signal/40 px-1 font-mono text-[10px] text-signal">{keys}</Text>
      <Text className="font-mono text-xs text-muted">{label}</Text>
    </View>
  );
}

export function KeyboardHintBar({ questionType, isAnswered }: { questionType: 'mc' | 'bool'; isAnswered: boolean }) {
  if (Platform.OS !== 'web') return null;
  return (
    <View className="flex-row items-center gap-5 border-t border-line px-6 py-4">
      {!isAnswered && questionType === 'mc' ? <Hint keys="1-4 / A-D" label="select" /> : null}
      {!isAnswered && questionType === 'bool' ? <Hint keys="T / F" label="select" /> : null}
      {isAnswered ? <Hint keys="ENTER" label="next" /> : null}
      <Hint keys="Q" label="query" />
      <Hint keys="ESC" label="menu" />
    </View>
  );
}
```

In `QuizRound`, add this call before the `if (engine.isComplete)` early return, so the hook runs on every render:

```tsx
  const currentType = engine.currentQuestion?.type;
  const canAnswer = !isQueryOpen && !engine.isAnswered;
  useKeyboardNav({
    onSelectChoice: canAnswer && currentType === 'mc' ? handleAnswer : undefined,
    onSelectBool: canAnswer && currentType === 'bool' ? handleAnswer : undefined,
    onAdvance: !isQueryOpen && engine.isAnswered ? handleAdvance : undefined,
    onToggleQuery: () => setIsQueryOpen((isOpen) => !isOpen),
    onEscape: () => (isQueryOpen ? setIsQueryOpen(false) : onExit()),
    isEnabled: !engine.isComplete,
  });
```

Render `<KeyboardHintBar questionType={question.type} isAnswered={engine.isAnswered} />` above the `QueryDrawer`. In `ResultsScreen`, call `useKeyboardNav({ onAdvance: onRetry, onEscape: onMenu })`. In `app/index.tsx`, call `useKeyboardNav({ onSelectChoice: (index) => { const language = manifest.languages[index]; if (language) router.push(`/${language.id}`); } })`. In `app/[language]/index.tsx`, number keys select the matching difficulty and Escape calls `router.replace('/')`, mirroring `src/components/menu/MainMenu.jsx`.

- [ ] **Step 4: Run to verify they pass and commit**

```bash
npx jest components app && bash ~/.claude/enforce/tdd.sh green
git add state/useKeyboardNav.ts components app constants
git commit -m "feat(web): keyboard navigation and the hint bar on the web build

Refs: IAN-564"
```

### Task 22: Cut the site over to Expo and remove Vite (B-2 in production, B-38, B-39)

**Files:**
- Delete: `src/`, `index.html`, `vite.config.js`, `scripts/exportQuestionBanks.mjs`, `scripts/__tests__/exportQuestionBanks.test.ts`
- Modify: `package.json`, `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`, `tsconfig.json`, `jest.config.js`
- Test: `scripts/__tests__/packageScripts.test.ts`

- [ ] **Step 1: Write the failing test**

`scripts/__tests__/packageScripts.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

describe('cutover', () => {
  it('runs the Expo equivalents for dev, build, test, and lint', () => {
    expect(pkg.scripts.dev).toBe('expo start');
    expect(pkg.scripts.build).toBe(
      'npm run content:build && expo export --platform web --output-dir dist && cp -R content dist/content && node scripts/copySpaFallback.mjs dist',
    );
    expect(pkg.scripts.test).toBe('jest');
    expect(pkg.scripts.lint).toBe('oxlint');
  });

  it('no longer contains Vite or the old source tree', () => {
    const dependencyNames = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(dependencyNames.filter((name) => name.includes('vite'))).toEqual([]);
    expect(existsSync('vite.config.js')).toBe(false);
    expect(existsSync('src')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx jest scripts/__tests__/packageScripts.test.ts ; bash ~/.claude/enforce/tdd.sh red scripts/__tests__/packageScripts.test.ts
```

- [ ] **Step 3: Implement**

```bash
git rm -r src index.html vite.config.js scripts/exportQuestionBanks.mjs scripts/__tests__/exportQuestionBanks.test.ts
npm uninstall vite @vitejs/plugin-react @tailwindcss/vite gh-pages
```

`package.json` scripts become exactly:

```json
{
  "dev": "expo start",
  "build": "npm run content:build && expo export --platform web --output-dir dist && cp -R content dist/content && node scripts/copySpaFallback.mjs dist",
  "content:build": "tsx scripts/buildContentManifest.mjs",
  "lint": "oxlint",
  "test": "jest",
  "preview": "npx serve dist"
}
```

Remove `"src"` from `tsconfig.json`'s `exclude` and `'/src/'` from `jest.config.js`'s `testPathIgnorePatterns`. In `deploy.yml`, replace the Vite build, Expo preview, and compose steps with one `npm run build` step. In `ci.yml`, delete the `npm run expo:export:preview` step.

- [ ] **Step 4: Verify, run the manual accessibility pass, commit**

```bash
npx jest && bash ~/.claude/enforce/tdd.sh green
npm run build && npx serve dist -l 4173
```

With the build served, open `http://localhost:4173/syntactical/` and a round page. Run Lighthouse (Chrome DevTools, mobile, Accessibility only) on both; both must score 100. Then do a VoiceOver pass (the title reads as a heading, each choice announces its state after answering, the download indicator announces once) and a reduced-motion pass (macOS System Settings, Accessibility, Display, Reduce motion: the indicator line is static and the drawer appears without sliding). Record the three results in the PR body under `## Accessibility pass`.

```bash
bash ~/.claude/enforce/tdd.sh close
git add -A
git commit -m "feat(web): cut the site over to the Expo web build and remove Vite

Refs: IAN-564"
```

### Task 23: EAS internal device builds (B-40)

**Files:**
- Create: `eas.json`, `docs/device-checklist.md`

B-40 is a manual check by design (spec, Testing); this task has no automated test.

- [ ] **Step 1: Open slice 8 and add the EAS config**

```bash
bash ~/.claude/enforce/tdd.sh open "slice 8: device builds and docs" --spec docs/superpowers/specs/2026-10-02-expo-universal-app-design.md
```

`eas.json`:

```json
{
  "cli": { "appVersionSource": "remote" },
  "build": {
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" }
    }
  }
}
```

- [ ] **Step 2: Write the checklist**

`docs/device-checklist.md`:

```markdown
# Device checklist

Run this on an EAS internal build before any release. Record the date, the build id, the device, and the OS version for each run.

| Check | iOS | Android |
|---|---|---|
| The app launches offline and shows the three languages from the bundled content | | |
| A full round completes, and the results show the correct count, the total, and the percentage | | |
| The streak in the header updates after each answer and survives an app restart | | |
| The query drawer opens from Query and from Explain, and closes by its control, the backdrop, and the back gesture | | |
| On a notched device the header sits below the notch, and no control sits under the home indicator | | |
| After a changed bank is pushed, the download line appears once, and the next round uses the new questions | | |
| With Reduce Motion on, the download line is static | | |
```

- [ ] **Step 3: Build and run the checklist**

```bash
npx eas-cli@latest login
npx eas-cli@latest build --profile preview --platform all
```

These commands need the owner's Expo account, so the owner runs them, installs both builds, fills the checklist, and commits it. An iOS internal build also needs the device registered with `npx eas-cli@latest device:create`, which needs an Apple Developer account. If that account does not exist yet, record iOS as "blocked: no Apple Developer account", run Android only, and say so in the PR body.

- [ ] **Step 4: Commit**

```bash
git add eas.json docs/device-checklist.md
git commit -m "chore(eas): internal device build profile and the device checklist

Refs: IAN-564"
```

### Task 24: Docs (B-41)

**Files:**
- Create: `docs/stack.md`, `docs/feature-list/features.md`, `docs/user-stories/README.md`, `docs/user-stories/quiz.md`, `docs/user-stories/content.md`
- Modify: `README.md`, `docs/lexicon.md`

- [ ] **Step 1: Write `docs/stack.md`** from `~/.claude/prompts/stack-template.md`: one `### <Name>` entry each for Expo, Expo Router, React Native, react-native-web, NativeWind, Tailwind CSS, TanStack Query, AsyncStorage, expo-crypto, react-native-reanimated, NetInfo, Prism, Jest with jest-expo, React Native Testing Library, tsx, oxlint, GitHub Pages, GitHub Actions, and EAS. Each entry gives the installed version from `package-lock.json`, a plain explanation, the official docs link, its role here, why it was chosen (from the spec's owner decisions and the spec review's stack options), and where it is configured.

- [ ] **Step 2: Write the feature list and user stories** from `~/.claude/prompts/user-story-area-template.md`, with two areas: `Quiz` (choosing a language and difficulty, rounds, Explain, the query drawer, results, stats) and `Content` (runtime download, offline fallback, the download indicator, adding a language with JSON). Each story's `**E2E test:**` line reads `none (owner decision 9); covered by <component test paths>`.

- [ ] **Step 3: Rewrite `README.md`** to cover what the app is; `npm install`, `npm run dev`, and `npm test`; how to edit a question (edit `content/<language>/<difficulty>.json`, run `npm run content:build`, commit the bank, `manifest.json`, and `bundledContent.generated.ts` together, push); how to add a language (add the bank files, add a `manifest.json` entry with `"hash": ""`, run `npm run content:build`); how deploys work; and how to make a device build.

- [ ] **Step 4: Add the spec's new vocabulary to `docs/lexicon.md`**: manifest, bank hash, bundled bank, cached bank, content base URL, grammar, and download indicator, copied from the spec's Domain vocabulary.

- [ ] **Step 5: Verify the README, close the slice, commit, push PR 3**

Follow the README's "edit a question" steps on a scratch edit, confirm `npm run content:build` changes exactly one hash, then revert the edit.

```bash
bash ~/.claude/enforce/tdd.sh close
git add docs README.md
git commit -m "docs: stack, feature list, user stories, README, and lexicon for the Expo app

Refs: IAN-564"
npm test && npm run lint && npm run build
git push -u origin feat/expo-cutover
```

Then the R-517 review, the merge under the Gate 1 merge mode, deploy monitoring (GitHub Actions green; `https://nullvoidundefined.github.io/syntactical/` and `https://nullvoidundefined.github.io/syntactical/python/easy` both load), and `/task-cleanup` to close IAN-564 with actuals.

---

## Self-review

- **Spec coverage:** B-1 Task 1; B-2 Task 2, verified in production after Task 22; B-3 Task 3; B-4 to B-8 Task 4, with the B-8 round wiring in Task 17; B-9 Task 5; B-10 Task 6; B-11 and B-12 Task 7; B-13 Tasks 7, 8, and 10; B-14 Task 9; B-15 to B-17, B-19, and B-20 Task 10; B-18 Tasks 8 and 10; B-21 and B-22 Task 12; B-23 and B-24 Task 13; B-25, B-26, and B-32 Task 14; B-27 and B-33 Task 15; B-28 Task 17; B-29 Tasks 16 and 17; B-30 and B-31 Task 17; B-34 to B-36 Task 20; B-37 Task 21; B-38 and B-39 Task 22; B-40 Task 23; B-41 Task 24.
- **Beyond the spec:** Task 6's build-time validation and byte-order-mark check protect against owner edits (Review Focus 1); Task 10's prefetch implements spec amendment 2.
- **Type consistency:** `CachedBank`, `Manifest`, `LanguageEntry`, `BankEntry`, `Question`, `Query`, `Grammar`, `DifficultyId`, `ContentAccess`, and `QuestionBankState` are each defined once (Tasks 4, 7, and 10) and used by those names throughout.
