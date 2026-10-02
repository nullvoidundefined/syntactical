# Content User Stories

This document holds the user stories for how question content is downloaded, verified, cached, and edited.

## US-CONTENT-001: Download new questions without a new release

**As** the app owner
**I want to** publish edited questions by pushing JSON
**So that** learners get fixes without installing a new build

**Acceptance criteria:**

- [ ] After each manifest refresh, a bank whose hash differs from its local copy, or that has no local copy, is fetched in the background.
- [ ] A bank whose hash matches is not fetched.
- [ ] A downloaded bank whose SHA-256 does not equal its manifest bank hash is rejected and not cached.
- [ ] A refresh that lands during a round leaves that round unchanged.

**E2E test:** none (owner decision 9); covered by `services/content/__tests__/loadQuestionBank.test.ts`, `services/content/__tests__/verifyBankHash.test.ts`, `state/__tests__/useQuestionBank.test.tsx`, `clients/__tests__/contentClient.test.ts`
**Ticket:** IAN-564

## US-CONTENT-002: Keep working offline

**As** a learner with a poor connection
**I want to** start a round from content already on my device
**So that** the app works without a network

**Acceptance criteria:**

- [ ] The cached bank, or the bundled bank when none is cached, is available before any fetch resolves.
- [ ] A fetch that fails, is redirected, or times out leaves the current copy in use and shows no error.
- [ ] A bank with no local copy shows a loading state while online and an error state with Retry when its fetch fails.

**E2E test:** none (owner decision 9); covered by `services/content/__tests__/contentCache.test.ts`, `services/content/__tests__/loadLanguageManifestOffline.test.ts`, `state/__tests__/useQuestionBankEdgeCases.test.tsx`, `clients/__tests__/contentClientTransport.test.ts`
**Ticket:** IAN-564

## US-CONTENT-003: See when a bank is downloading

**As** a learner
**I want to** see a subtle indicator while a bank transfers
**So that** I know new content is arriving without being interrupted

**Acceptance criteria:**

- [ ] The download indicator is visible and announced once as a polite status while a bank transfers.
- [ ] It is not shown while only the manifest is fetching.
- [ ] It disappears when the transfer ends, whether it succeeded or failed.
- [ ] With reduced motion requested, it renders without animation.

**E2E test:** none (owner decision 9); covered by `components/layout/__tests__/DownloadIndicator.test.tsx`, `components/layout/__tests__/DownloadIndicatorLiveRegion.web.test.tsx`, `app/__tests__/rootLayout.test.tsx`
**Ticket:** IAN-564

## US-CONTENT-004: Reject malformed content

**As** the app owner
**I want to** have malformed content rejected safely
**So that** a bad edit never breaks the app for learners

**Acceptance criteria:**

- [ ] A malformed manifest field is rejected, and a malformed question is dropped while valid questions in the bank are kept.
- [ ] A manifest or bank with a newer schema version, zero valid questions, or an oversized document is rejected as a whole, and the previous copy stays in use.
- [ ] Each rejection logs one warning naming the document and the rule.

**E2E test:** none (owner decision 9); covered by `services/content/__tests__/validateManifest.test.ts`, `services/content/__tests__/validateQuestionBank.test.ts`, `services/content/__tests__/loadQuestionBankWarnings.test.ts`, `services/content/__tests__/loadQuestionBankDroppedQuestions.test.ts`
**Ticket:** IAN-564

## US-CONTENT-005: Edit questions and add a language with JSON

**As** the app owner
**I want to** edit a bank or add a language by changing JSON and running one command
**So that** content changes need no code changes

**Acceptance criteria:**

- [ ] `npm run content:build` writes each bank's SHA-256 into the manifest and regenerates the bundled manifest and bundled banks.
- [ ] A manifest entry with an empty hash is filled in by the build.
- [ ] An unsafe bank path or an oversized bank fails the build.
- [ ] The deploy publishes `content/` next to the Expo web export.

**E2E test:** none (owner decision 9); covered by `scripts/__tests__/buildContentManifest.test.ts`, `scripts/__tests__/buildContentManifestPathRule.test.ts`, `scripts/__tests__/buildContentManifestSizeLimits.test.ts`, `scripts/__tests__/packageScripts.test.ts`
**Ticket:** IAN-564
