# Quiz User Stories

This document holds the user stories for choosing a language and difficulty, playing a round, reading explanations, and tracking stats.

## US-QUIZ-001: Choose a language and difficulty

**As** a developer practicing syntax
**I want to** pick a language and then a difficulty
**So that** I drill the material that matches what I am learning

**Acceptance criteria:**

- [ ] The language step lists every language in the manifest.
- [ ] The difficulty step lists only the difficulties that language provides, each with its label and description.
- [ ] A difficulty with no cached or bundled bank is disabled and labeled "Needs a connection to load" while offline.

**E2E test:** none (owner decision 9); covered by `components/menu/__tests__/menu.test.tsx`, `components/menu/__tests__/DifficultyStep.test.tsx`, `app/__tests__/menuRoutes.test.tsx`
**Ticket:** IAN-564

## US-QUIZ-002: Play a round

**As** a developer practicing syntax
**I want to** answer every question of a bank once, in a shuffled order
**So that** I get a full, unpredictable pass through the material

**Acceptance criteria:**

- [ ] A round presents every question exactly once in a shuffled order.
- [ ] Multiple-choice and true/false questions are marked correct or incorrect when answered.
- [ ] Next is unavailable until the current question is answered, and a second answer is ignored.
- [ ] The progress bar shows the position out of the total.
- [ ] Question text and choices containing HTML render as literal text.

**E2E test:** none (owner decision 9); covered by `components/quiz/__tests__/QuizRound.test.tsx`, `components/quiz/__tests__/cards.test.tsx`, `state/__tests__/useQuizEngine.test.tsx`, `services/quiz/__tests__/quizService.test.ts`
**Ticket:** IAN-564

## US-QUIZ-003: Read the explanation behind a question

**As** a developer who just answered incorrectly
**I want to** open the query behind the question
**So that** I learn the rule instead of only seeing the right answer

**Acceptance criteria:**

- [ ] After an incorrect answer an Explain action appears and opens that question's query without advancing the round.
- [ ] The query drawer shows the title, syntax, explanation, and tags.
- [ ] The drawer closes by its close control, by tapping the backdrop, and by the platform back gesture.
- [ ] Answer and advance actions are inert while the drawer is open.

**E2E test:** none (owner decision 9); covered by `components/query/__tests__/QueryDrawer.test.tsx`, `components/quiz/__tests__/QuizRound.test.tsx`
**Ticket:** IAN-564

## US-QUIZ-004: See results and retry

**As** a developer who finished a round
**I want to** see my score and start another round
**So that** I can measure progress and drill the same bank again

**Acceptance criteria:**

- [ ] The results screen shows the correct count, the total, and the rounded percentage.
- [ ] Retry starts a new round with a fresh order and resets the index, answer, score, and drawer.
- [ ] Leaving a round early records no completion, and a finished round records exactly one.

**E2E test:** none (owner decision 9); covered by `components/quiz/__tests__/QuizRoundCompletion.test.tsx`, `app/__tests__/roundRoute.test.tsx`, `state/__tests__/useQuizEngine.test.tsx`
**Ticket:** IAN-564

## US-QUIZ-005: Track stats and streak

**As** a returning developer
**I want to** see my lifetime accuracy and streak
**So that** I stay motivated and see where I am weak

**Acceptance criteria:**

- [ ] A correct answer raises the total answered, total correct, and current streak, and raises the best streak when exceeded.
- [ ] An incorrect answer resets the current streak.
- [ ] Per-language and per-difficulty accuracy match the answers given.
- [ ] Stats persist across restarts, and a failed write leaves the in-memory stats intact.
- [ ] No round starts and no stats write happens before stats have loaded.

**E2E test:** none (owner decision 9); covered by `components/stats/__tests__/StatsPanel.test.tsx`, `state/__tests__/StatsProvider.test.tsx`, `services/stats/__tests__/statsService.test.ts`, `clients/__tests__/storageClient.test.ts`
**Ticket:** IAN-564

## US-QUIZ-006: Highlighted code in questions

**As** a developer reading a question
**I want to** see its code with syntax highlighting for that language
**So that** I can read the snippet quickly and accurately

**Acceptance criteria:**

- [ ] Question code and query syntax render as highlighted tokens with whitespace preserved.
- [ ] A language whose grammar the build does not include renders as plain text.
- [ ] Hostile code content renders as literal text and never as HTML.

**E2E test:** none (owner decision 9); covered by `components/quiz/__tests__/CodeBlock.test.tsx`, `components/quiz/__tests__/codeWiring.test.tsx`, `services/codeBlock/__tests__/tokenizeCode.test.ts`, `services/codeBlock/__tests__/tokenizeCodeAllowlist.test.ts`
**Ticket:** IAN-564

## US-QUIZ-007: Drive the quiz from the keyboard on the web

**As** a developer using the web build
**I want to** answer, advance, open the query, and go back with keys
**So that** I can run a round without touching the mouse

**Acceptance criteria:**

- [ ] Each binding in `KEY_BINDINGS` performs its action on the web.
- [ ] Escape closes an open drawer before it leaves the round.
- [ ] A keyboard hint bar is shown on the web and not rendered on native.
- [ ] The menu steps are operable from the keyboard.

**E2E test:** none (owner decision 9); covered by `components/quiz/__tests__/keyboard.web.test.tsx`, `components/quiz/__tests__/KeyboardHintBar.web.test.tsx`, `components/quiz/__tests__/KeyboardHintBar.test.tsx`, `components/menu/__tests__/menuKeyboard.web.test.tsx`
**Ticket:** IAN-564
