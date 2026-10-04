# Syntactical Stack

Every significant language, runtime, framework, library, tool, service, and
infrastructure piece this application uses, grouped by layer. The repository holds
one Expo universal app in `app/`, `components/`, `state/`, `services/`, `clients/`,
`config/`, and `constants/`; it builds for iOS, Android, and the web.

Last updated: 2026-10-02 (Vite app, gh-pages, and the Tailwind 4 alias removed at the cutover, EAS added, IAN-564)

## Languages and runtimes

### TypeScript

- **Version:** ~6.0.3
- **What it is:** JavaScript with static types, checked at build time.
- **Docs:** https://www.typescriptlang.org/docs/
- **Role here:** The language of the Expo app; `npx tsc --noEmit` runs in CI.
- **Why chosen:** Expo's templates and tooling are TypeScript-first, and the content validators and query layer benefit from checked shapes.
- **Configured in:** `tsconfig.json` (extends `expo/tsconfig.base`, strict).

### Node.js

- **Version:** 22 (CI)
- **What it is:** The JavaScript runtime for build scripts, tests, and tooling.
- **Docs:** https://nodejs.org/docs/latest-v22.x/api/
- **Role here:** Runs Jest, the Expo CLI, and the content scripts in `scripts/`.
- **Why chosen:** Required by the Expo and Jest toolchains.
- **Configured in:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml` (`setup-node`).

## Frontend

### Expo

- **Version:** ^57.0.26 (SDK 57)
- **What it is:** A framework and toolchain for building React Native apps for iOS, Android, and the web from one codebase.
- **Docs:** https://docs.expo.dev/
- **Role here:** Builds the app for all three platforms; `expo export --platform web` produces the GitHub Pages build.
- **Why chosen:** Owner decision (IAN-564): one universal app instead of a separate web app and native apps; React Native without Expo would mean maintaining native projects by hand.
- **Configured in:** `app.config.ts`, `package.json` (`main: expo-router/entry`), `babel.config.js`, `metro.config.js`.

### Expo Router

- **Version:** ~57.0.24
- **What it is:** File-based routing for Expo apps: each file in `app/` is a screen with a URL.
- **Docs:** https://docs.expo.dev/router/introduction/
- **Role here:** Routes `/`, `/<language>`, and `/<language>/<difficulty>`; the web build uses single-page output with base URL `/syntactical`, and `404.html` serves deep links on GitHub Pages.
- **Why chosen:** The Expo default; gives real URLs on the web and native navigation on devices from the same files.
- **Configured in:** `app.config.ts` (`web.output: single`, `experiments.baseUrl`), `app/`.

### React and React DOM

- **Version:** 19.2.3
- **What it is:** The UI library both apps are written in.
- **Docs:** https://react.dev/
- **Role here:** Components and hooks for every screen of the Expo app.
- **Why chosen:** Already the project's UI library; the version is pinned to what Expo SDK 57 requires.
- **Configured in:** `package.json`.

### React Native

- **Version:** 0.86.3
- **What it is:** React for native mobile UIs, rendering platform views instead of HTML.
- **Docs:** https://reactnative.dev/docs/getting-started
- **Role here:** The component primitives (`View`, `Text`, `Pressable`, `Modal`) every Expo screen uses.
- **Why chosen:** Required by Expo; the version matches SDK 57.
- **Configured in:** `package.json`.

### react-native-web

- **Version:** ^0.21.2
- **What it is:** An implementation of React Native's components on top of the DOM.
- **Docs:** https://necolas.github.io/react-native-web/
- **Role here:** Renders the Expo app in the browser, so one codebase serves the web build.
- **Why chosen:** Expo's standard web target; the alternative, a separate web app, was rejected in favor of one codebase (owner decision 1).
- **Configured in:** `package.json`; used automatically by Expo's web bundler.

### NativeWind

- **Version:** ^4.2.7 (with react-native-css-interop ^0.2.7)
- **What it is:** Tailwind CSS class names for React Native components, compiled to native styles.
- **Docs:** https://www.nativewind.dev/
- **Role here:** Styles every Expo component with Tailwind utility classes, the same styling vocabulary the earlier web app used.
- **Why chosen:** Owner decision 2 keeps Tailwind; v4 is the stable release (v5, which supports Tailwind 4, is a pre-release). `react-native-css-interop` is a direct dependency because npm nested it under NativeWind, where Babel's JSX runtime could not resolve it.
- **Configured in:** `tailwind.config.js`, `global.css`, `babel.config.js`, `metro.config.js`, `nativewind-env.d.ts`.

### Tailwind CSS

- **Version:** ^3.4.19
- **What it is:** A utility-first CSS framework.
- **Docs:** https://v3.tailwindcss.com/docs
- **Role here:** The theme (the obsidian/signal palette and fonts) in `tailwind.config.js`, consumed by NativeWind.
- **Why chosen:** Already the project's styling system; version 3 because NativeWind 4 requires it.
- **Configured in:** `tailwind.config.js`, `global.css`.

### react-native-safe-area-context

- **Version:** ~5.7.0
- **What it is:** Insets for notches, status bars, and home indicators.
- **Docs:** https://docs.expo.dev/versions/latest/sdk/safe-area-context/
- **Role here:** Keeps the app shell clear of device cutouts.
- **Why chosen:** The Expo-supported way to read safe areas; required by Expo Router.
- **Configured in:** `app/_layout.tsx`.

### react-native-screens

- **Version:** ~4.26.0
- **What it is:** Native screen containers for navigation.
- **Docs:** https://docs.expo.dev/versions/latest/sdk/screens/
- **Role here:** Used by Expo Router's navigators.
- **Why chosen:** A required peer of Expo Router.
- **Configured in:** `package.json`.

### react-native-reanimated

- **Version:** 4.5.1
- **What it is:** An animation library that runs animations on the UI thread.
- **Docs:** https://docs.swmansion.com/react-native-reanimated/
- **Role here:** The download indicator's sweep and the reduced-motion check (`useReducedMotion`); also required by NativeWind.
- **Why chosen:** Required by NativeWind 4; reusing it avoids a second animation library.
- **Configured in:** `package.json`.

### expo-linking, expo-constants, expo-status-bar

- **Version:** ~57.0.11, ~57.0.20, ~57.0.1
- **What it is:** Expo modules for deep links, build-time configuration, and the status bar.
- **Docs:** https://docs.expo.dev/versions/latest/sdk/constants/
- **Role here:** `expo-constants` reads the content base URL from `app.config.ts` (`extra.contentBaseUrl`); `expo-linking` is required by Expo Router; `expo-status-bar` was added by `expo install` for Expo Router's defaults.
- **Why chosen:** Expo's own modules for these jobs.
- **Configured in:** `app.config.ts`.

### Prism

- **Version:** ^1.30.0
- **What it is:** A syntax highlighter that tokenizes code by language grammar.
- **Docs:** https://prismjs.com/
- **Role here:** Highlights question code. The app renders Prism tokens as nested `Text` runs and never renders HTML, and a grammar outside the build's `GRAMMARS` list renders as plain text.
- **Why chosen:** Already in use; its tokenizer runs without a DOM, so the native app can reuse it.
- **Configured in:** `services/codeBlock/tokenizeCode.ts` and `components/quiz/CodeBlock.tsx`; `services/codeBlock/types/prismjs.d.ts` holds local typings so no `@types/prismjs` dependency is needed.

## Data

### AsyncStorage

- **Version:** 2.2.0
- **What it is:** A key-value store for React Native, backed by `localStorage` on the web.
- **Docs:** https://react-native-async-storage.github.io/async-storage/
- **Role here:** Stores lifetime stats under `syntactical.stats.v1` and the hash-bound content cache under `syntactical.content.v1.`; on the web it reads the stats the earlier web app wrote under the same key.
- **Why chosen:** Small JSON documents need no database; SQLite would not remove the hydration or ordering work (spec review stack option 7).
- **Configured in:** `clients/readJson.ts`, `clients/writeJson.ts`, `constants/appConfig.ts`.

### TanStack Query

- **Version:** ^5.104.0
- **What it is:** A server-state library that fetches, caches, and deduplicates requests.
- **Docs:** https://tanstack.com/query/latest/docs/framework/react/overview
- **Role here:** Fetches the manifest and banks, shares one in-flight request per bank, reports loading and error states with Retry, and drives the download indicator.
- **Why chosen:** Owner decision 11, following the React convention that server state goes through TanStack Query; AsyncStorage still holds the cache so each bank stays bound to its verified hash.
- **Configured in:** `config/queryClient.ts`, `services/content/buildBankQuery.ts`, `services/content/buildManifestQuery.ts`.

## Integrations

### expo-crypto

- **Version:** ~57.0.3
- **What it is:** Hashing and random-value functions for Expo (SubtleCrypto on the web).
- **Docs:** https://docs.expo.dev/versions/latest/sdk/crypto/
- **Role here:** Computes the SHA-256 of each downloaded bank so it can be compared with the manifest hash.
- **Why chosen:** Expo's own crypto module; works on iOS, Android, and the web without a native setup.
- **Configured in:** `clients/hashClient.ts`.

### NetInfo

- **Version:** 12.0.1
- **What it is:** Network connectivity status for React Native.
- **Docs:** https://github.com/react-native-netinfo/react-native-netinfo
- **Role here:** Lets the difficulty step label a bank with no local copy as "Needs a connection to load" while offline.
- **Why chosen:** The standard connectivity module for React Native.
- **Configured in:** `package.json`.

### posthog-react-native

- **Version:** ^4.78.4
- **What it is:** The PostHog product analytics SDK for React Native and Expo; it also runs in the web build.
- **Docs:** https://posthog.com/docs/libraries/react-native
- **Role here:** Sends the eight events of the fixed registry (`round_started`, `round_completed`, `signup_prompt_shown`, `signup_prompt_accepted`, `paywall_viewed`, `purchase_completed`, `review_round_completed`, `bank_exhausted`). A guest is anonymous: `persistence: 'memory'` writes no cookie and no AsyncStorage key. A signed-in user is identified by the server user id; sign-out resets. No event carries an email, code, or token. With no `POSTHOG_KEY` at build time every call is a no-op.
- **Why chosen:** The spec names PostHog; this is its one SDK that covers iOS, Android, and the web from the same code, and its memory persistence gives the cookieless guest mode. Its native extras (session replay, device info) are optional peers and are not installed.
- **Configured in:** `clients/analyticsClient.ts` (the only module that imports it), `constants/analyticsEvents.ts`, `app.config.ts` (`extra.posthogKey` from `POSTHOG_KEY`, a public `phc_` project key; `extra.posthogHost` from `POSTHOG_HOST`).

## Testing

### Jest with jest-expo

- **Version:** jest ^29.7.0, jest-expo ^57.0.5
- **What it is:** A JavaScript test runner, with Expo's presets for native and web.
- **Docs:** https://docs.expo.dev/develop/unit-testing/
- **Role here:** Runs every Expo test in two projects: `native` (iOS preset) and `web` (files ending `.web.test.tsx`).
- **Why chosen:** The runner Expo supports out of the box; Vitest, the house default, has no maintained React Native preset.
- **Configured in:** `jest.config.js`, `jest.setup.ts`, `config/jestStyleStub.js`.

### React Native Testing Library

- **Version:** ^14.0.1
- **What it is:** Component testing for React Native, querying by role and text.
- **Docs:** https://callstack.github.io/react-native-testing-library/
- **Role here:** Native component and hook tests. Version 14 is asynchronous: `render`, `fireEvent`, and `renderHook` are awaited.
- **Why chosen:** The standard for React Native; the version Expo SDK 57's router testing utilities require.
- **Configured in:** `jest.config.js`.

### React Testing Library

- **Version:** ^16.3.3
- **What it is:** DOM component testing.
- **Docs:** https://testing-library.com/docs/react-testing-library/intro/
- **Role here:** Web-only tests (`*.web.test.tsx`) that need real DOM elements, such as the single `h1`, rendered through react-native-web.
- **Why chosen:** React Native Testing Library renders through a test renderer and cannot produce DOM elements.
- **Configured in:** `jest.config.js` (web project).

### jest-axe

- **Version:** ^11.0.0 (with @types/jest-axe)
- **What it is:** Runs the axe-core accessibility rules against rendered DOM and adds the `toHaveNoViolations` matcher.
- **Docs:** https://github.com/NickColley/jest-axe
- **Role here:** Web tests (`*.web.test.tsx`) that check a screen for accessibility violations, the same rule engine Lighthouse uses.
- **Why chosen:** The project requires a 100 Lighthouse accessibility score; this checks signed-in views that a headless Lighthouse run cannot reach.
- **Configured in:** `app/__tests__/settingsAccessibility.web.test.tsx`.

### @types/jest and @types/node

- **Version:** ^30.0.0, ^26.6.4
- **What it is:** Type definitions for Jest's globals and Node's APIs.
- **Docs:** https://github.com/DefinitelyTyped/DefinitelyTyped
- **Role here:** Let `tsc` check tests and `app.config.ts`.
- **Why chosen:** Expo's base tsconfig does not load them.
- **Configured in:** `tsconfig.json` (`types`).

## Tooling

### tsx

- **Version:** ^4.23.15
- **What it is:** Runs TypeScript files directly with Node.
- **Docs:** https://tsx.is/
- **Role here:** Runs `scripts/buildContentManifest.mjs`, which imports the app's TypeScript validators, so the build validates content with the same code the app uses.
- **Why chosen:** The alternative, duplicating the validators in JavaScript, would let the two drift.
- **Configured in:** `package.json` (`content:build`).

### oxlint

- **Version:** ^1.81.0
- **What it is:** A fast JavaScript and TypeScript linter.
- **Docs:** https://oxc.rs/docs/guide/usage/linter
- **Role here:** `npm run lint` in CI.
- **Why chosen:** Already the project's linter.
- **Configured in:** `.oxlintrc.json`.

## CI/CD

### GitHub Actions

- **Version:** none (hosted service)
- **What it is:** GitHub's CI and deployment runner.
- **Docs:** https://docs.github.com/actions
- **Role here:** `ci.yml` runs lint, type check, tests, the web build, and the content drift check on every pull request; `deploy.yml` publishes to Pages on every push to `main`.
- **Why chosen:** The repository already deploys through it.
- **Configured in:** `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`.

## Hosting

### GitHub Pages

- **Version:** none (hosted service)
- **What it is:** Static hosting from a GitHub repository.
- **Docs:** https://docs.github.com/pages
- **Role here:** Serves the Expo web export at `/syntactical/` and the question content (`content/`) the app downloads at runtime.
- **Why chosen:** Free static hosting already in use; owner decision 3 serves question content from it instead of a CMS or API.
- **Configured in:** `.github/workflows/deploy.yml`, `scripts/copySpaFallback.mjs`.

### EAS (Expo Application Services)

- **Version:** none (hosted service; the CLI runs through `npx eas-cli@latest`)
- **What it is:** Expo's cloud build service for native iOS and Android binaries.
- **Docs:** https://docs.expo.dev/eas/
- **Role here:** Builds the internal-distribution `preview` profile (an Android APK and an iOS build) for the manual device checklist; it is not part of CI or the Pages deploy.
- **Why chosen:** The build service Expo supports, so no local Xcode or Android Studio setup is required to produce a device build.
- **Configured in:** `eas.json`, `docs/device-checklist.md`.
