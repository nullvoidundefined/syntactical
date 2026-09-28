# Original prompt

This file preserves the prompts that defined this project, verbatim, for future reference.

Note: the source text used an em dash in one place; it is rendered below as a colon to satisfy this environment's `no-em-dash` rule (R-207). No other wording was changed.

## Initial prompt

I am building a high-velocity developer-focused flashcard and lightning-round quiz web app called "syntactical" and deploying it live via GitHub Pages. We are building this as a clean, multi-file Vite + React + Tailwind CSS project (not a single monolithic file).

The vibe: Linear/Vercel meets covert dark-mode ops. Subtle tone: no cheesy military jargon, no gamer aesthetic, no cartoonish icons. Tactical/obsidian dark theme.

1. Modular React structure: `Menu`, `QuizView`, `Card`, `QueryDrawer`, and `Stats` components. Data separated by language and difficulty.
2. Two-step landing menu: Step 1 choose Python or Postgres, Step 2 choose Medium or Hard.
3. Rigorous, distinct question banks per language/difficulty combination, mixing multiple-choice and True/False cards.
4. A "Query" action on every card that opens a slide-over explaining the methods/syntax/context behind that card's example.
5. Full keyboard navigation: 1-4 or A-D for multiple choice, T/F for booleans, Enter to advance, Esc to return to the menu. Track streaks and completion stats in localStorage.
6. `vite.config.js` configured with the correct `base` path handling for GitHub Pages.
7. A step-by-step deploy guide, covering both a GitHub Actions workflow and the `gh-pages` package as an alternative.

Please provide the directory structure and the complete code for the project files.

## Refinement 1: language-specific rigor

Let's make sure to avoid very remedial questions. For each language, it should focus on things that are more specific to that language.

This retargeted every question bank away from generic programming/SQL trivia toward idioms and internals specific to Python and Postgres respectively.

## Refinement 2: mobile-first

And yeah, I probably should have said this from the very beginning, but this should be a mobile-first application.

This triggered a full responsive pass across every component: unprefixed Tailwind classes target mobile by default, with `sm:` and larger breakpoints used only to add or restore desktop affordances (keyboard-hint text, secondary labels, side-by-side button rows) rather than the other way around.

## Refinement: stable card height

Cards should have a min-height so that they so the cards don't jitter in size as theor content changes

Question cards keep a reserved body height (`min-h-[22rem]` on mobile, `min-h-[32rem]` from `sm` up) so advancing from a short True/False card to a tall multiple-choice card with a code block does not jump the Continue row or the keyboard hint bar. Taller questions still grow past that floor.

## Refinement: JavaScript track

Add JavaScript as a third language track, with 100 easy questions and 100 medium questions. No hard bank. Hard stays available for Python and Postgres, and is hidden when JavaScript is selected so an empty round cannot start.

## Refinement: JavaScript hard bank

Add 100 hard JavaScript questions and show the Hard tier for that track again. Python and Postgres are unchanged.
