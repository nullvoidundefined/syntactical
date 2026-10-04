# Store listing drafts

Drafts for the App Store and Google Play listings. Every claim below matches what the app does today (checked against `docs/feature-list/features.md`, `content/manifest.json`, and the routes under `app/`). Change the copy freely, but do not add a feature the app lacks. Character limits are the stores' own.

## Shared facts

- Three languages: Python, Postgres, JavaScript.
- Each language has three difficulties. Easy is free; Medium and Hard are paid banks, one purchase per bank.
- Questions are multiple choice or true/false. After a wrong answer, Explain opens the query behind the question (syntax, explanation, tags).
- Streak, XP, and a daily goal of 10, 20, or 50 XP.
- Review rounds replay missed questions on a spaced schedule, built on the device, so they work offline.
- Free play works offline once the free banks are bundled or cached; paid banks work offline after they have downloaded once.
- Signing in is optional (email code, no password). Guests keep progress on the device; signed-in users sync progress across devices.

## App Store (iOS)

| Field              | Limit | Draft                                                                                                                           |
| ------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------- |
| Name               | 30    | Syntactical                                                                                                                     |
| Subtitle           | 30    | Code quizzes that stick                                                                                                         |
| Keywords           | 100   | python,postgres,javascript,quiz,coding,sql,programming,learn,developer,practice,interview                                       |
| Promotional text   | 170   | Practice the parts of Python, Postgres, and JavaScript that trip people up, one question at a time.                             |
| Support URL        |       | PLACEHOLDER: owner supplies (see `docs/launch-placeholders.md`)                                                                 |
| Privacy policy URL |       | `https://nullvoidundefined.github.io/syntactical/privacy` (app route `app/privacy.tsx`; the owner fills its placeholders first) |
| Marketing URL      |       | Optional. `https://syntactical.dev`                                                                                             |
| Category           |       | Education (primary), Developer Tools (secondary)                                                                                |
| Age rating         |       | 4+ expected: no objectionable content, no web browsing, no user-generated content. Confirm in the questionnaire.                |
| Copyright          |       | PLACEHOLDER: owner's name or entity and year                                                                                    |

### Description (iOS and Play full description, limit 4000)

```
Syntactical is a quiz for the parts of a language that behave differently than you expect.

Pick Python, Postgres, or JavaScript, then pick a difficulty. Each round is a shuffled pass through a bank of multiple-choice and true/false questions about runtime semantics, query planning, coercion, scope, and the sharp edges in between.

Get one wrong and tap Explain. The Query panel shows the syntax, the reasoning, and the tags behind the question, so you learn why the answer is what it is.

What you get
- Python, Postgres, and JavaScript, each at Easy, Medium, and Hard.
- Easy banks are free. Medium and Hard banks are one-time purchases, one per language and difficulty.
- A streak, XP, and a daily goal of 10, 20, or 50 XP.
- Review rounds that bring back the questions you missed, on a schedule that spaces them out. They are built on your device, so they work offline.
- Free play that works offline once the free banks are on your device.
- Optional sign-in with an email code, no password. Sign in to keep your progress across devices and to restore purchases. Delete your account at any time from Settings.

Your answers and progress stay on your device until you sign in. Usage analytics are anonymous until you sign in, and are never tied to your email.
```

### What's New (limit 4000 on iOS, 500 on Play)

```
First release. Python, Postgres, and JavaScript quizzes with free Easy banks, paid Medium and Hard banks, review rounds, a daily goal, and optional sign-in.
```

## Google Play

| Field                | Limit | Draft                                                                                                                                   |
| -------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------- |
| App name             | 30    | Syntactical                                                                                                                             |
| Short description    | 80    | Quiz yourself on Python, Postgres, and JavaScript. Learn why each answer is right.                                                      |
| Full description     | 4000  | Use the description above                                                                                                               |
| Category             |       | Education                                                                                                                               |
| Tags                 |       | Education, programming (pick from Play's list)                                                                                          |
| Contact email        |       | PLACEHOLDER: owner supplies                                                                                                             |
| Privacy policy       |       | `https://nullvoidundefined.github.io/syntactical/privacy`                                                                               |
| Account deletion URL |       | `https://nullvoidundefined.github.io/syntactical/delete-account` (Play requires this page; the in-app path is Settings, Delete account) |

## Screenshots

Owner captures them from a production build on a real device or simulator: the language step, a question mid-round, the Query panel after a wrong answer, the daily goal in Settings, and the paywall. Use Medium or Hard for the paywall so the localized price shows.
