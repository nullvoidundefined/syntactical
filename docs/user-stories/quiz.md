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

**E2E test:** none; covered by `components/menu/__tests__/menu.test.tsx`, `components/menu/__tests__/DifficultyStep.test.tsx`, `app/__tests__/menuRoutes.test.tsx`
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

**E2E test:** `e2e/specs/guestRound.spec.ts`; also covered by `components/quiz/__tests__/QuizRound.test.tsx`, `components/quiz/__tests__/cards.test.tsx`, `state/__tests__/useQuizEngine.test.tsx`, `services/quiz/__tests__/quizService.test.ts`
**Ticket:** IAN-564

## US-QUIZ-003: Read the explanation behind a question

**As** a developer who just answered incorrectly
**I want to** open the query behind the question
**So that** I learn the rule instead of only seeing the right answer

**Acceptance criteria:**

- [ ] After an incorrect answer an Explain action appears and opens that question's query without advancing the round.
- [ ] Before an answer, the query drawer shows only the title and documentation links, with a note that the explanation follows an answer.
- [ ] After an answer, the query drawer shows the title, syntax, explanation, tags, and documentation links.
- [ ] The drawer closes by its close control, by tapping the backdrop, and by the platform back gesture.
- [ ] Answer and advance actions are inert while the drawer is open.

**E2E test:** none; covered by `components/query/__tests__/QueryDrawer.test.tsx`, `components/quiz/__tests__/QuizRound.test.tsx`
**Ticket:** IAN-564

## US-QUIZ-004: See results and retry

**As** a developer who finished a round
**I want to** see my score and start another round
**So that** I can measure progress and drill the same bank again

**Acceptance criteria:**

- [ ] The results screen shows the correct count, the total, and the rounded percentage.
- [ ] Retry starts a new round with a fresh order and resets the index, answer, score, and drawer.
- [ ] Leaving a round early records no completion, and a finished round records exactly one.

**E2E test:** none; covered by `components/quiz/__tests__/QuizRoundCompletion.test.tsx`, `app/__tests__/roundRoute.test.tsx`, `state/__tests__/useQuizEngine.test.tsx`
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

**E2E test:** none; covered by `components/stats/__tests__/StatsPanel.test.tsx`, `state/__tests__/StatsProvider.test.tsx`, `services/stats/__tests__/statsService.test.ts`, `clients/__tests__/storageClient.test.ts`
**Ticket:** IAN-564

## US-QUIZ-006: Highlighted code in questions

**As** a developer reading a question
**I want to** see its code with syntax highlighting for that language
**So that** I can read the snippet quickly and accurately

**Acceptance criteria:**

- [ ] Question code and query syntax render as highlighted tokens with whitespace preserved.
- [ ] A language whose grammar the build does not include renders as plain text.
- [ ] Hostile code content renders as literal text and never as HTML.

**E2E test:** none; covered by `components/quiz/__tests__/CodeBlock.test.tsx`, `components/quiz/__tests__/codeWiring.test.tsx`, `services/codeBlock/__tests__/tokenizeCode.test.ts`, `services/codeBlock/__tests__/tokenizeCodeAllowlist.test.ts`
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

**E2E test:** `e2e/specs/keyboardNavigation.spec.ts`; also covered by `components/quiz/__tests__/keyboard.web.test.tsx`, `components/quiz/__tests__/KeyboardHintBar.web.test.tsx`, `components/quiz/__tests__/KeyboardHintBar.test.tsx`, `components/menu/__tests__/menuKeyboard.web.test.tsx`
**Ticket:** IAN-564

## US-QUIZ-008: Ask about a question after answering it

**As** a developer who has bought a bank
**I want to** ask a follow-up question about the question I just answered
**So that** I can clear up what the explanation did not

**Acceptance criteria:**

- [ ] After an answer, the query drawer shows "Ask about this card" to a signed-in user with any granted entitlement, and to no one else; it never shows before an answer.
- [ ] Asking sends the question's bank, id, and the chosen choice by its bank index; the answer appears with the questions left today.
- [ ] A question from a paid bank can be asked about only by a user entitled to that bank.
- [ ] Each user gets 20 answers per UTC day; an ask that fails or is declined does not use one up, and the limit, a missing purchase, and an unavailable model each show their own message.
- [ ] The learner's message is never logged by the server.

**E2E test:** none; covered by `server/src/__tests__/routes/ask.integration.test.ts`, `components/query/__tests__/AskPanel.test.tsx`, `components/quiz/__tests__/quizRoundAsk.test.tsx`
**Ticket:** none

## US-QUIZ-009: Read a weekly study note

**As** a signed-in developer
**I want to** read a short note on how my week of practice went
**So that** I know what to work on next

**Acceptance criteria:**

- [ ] The home screen shows "This week's study note" to a signed-in user, and nothing to a guest.
- [ ] Until 20 answers from the last 7 days have synced, it says how many more are needed; no model is called.
- [ ] Once there are 20, a note is written from a summary of those answers (counts per bank, review answers, the most missed misconceptions) that holds no question text.
- [ ] One note is written per local week (Monday to Sunday in the user's timezone) and shown for the rest of that week.
- [ ] When no note can be written, the home screen shows nothing, and nothing is stored.

**E2E test:** none; covered by `server/src/__tests__/routes/studyNote.integration.test.ts`, `components/stats/__tests__/StudyNote.test.tsx`, `state/__tests__/useStudyNote.test.tsx`
**Ticket:** none
