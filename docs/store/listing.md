# Store listing drafts

Drafts for the App Store and Google Play listings. Every claim below matches what the app does today (checked against `docs/feature-list/features.md`, `content/manifest.json`, the routes under `app/`, and `docs/superpowers/specs/2026-10-27-free-content-pro-sponsored-design.md`). Change the copy freely, but do not add a feature the app lacks. Character limits are the stores' own.

## Shared facts

- Twelve tracks: Python, Postgres, JavaScript, TypeScript, TypeScript Types, Node.js, Go, Ruby, Rails, SQL, Backend Security, and Frontend Security.
- Each track has three difficulties, Easy, Medium, and Hard: 36 question banks. Every bank is free and needs no account.
- Questions are multiple choice, true/false, or A/B. After a wrong answer, Explain opens the query behind the question (syntax, explanation, tags).
- Signed-in users can ask about a card after answering it: 5 asks a day free, 20 with Pro. Signed-in users also get a weekly study note on the home screen.
- Ask and the study note send the card and the learner's question (with Explain my mistake, their choice on a card they got wrong), or the week's summary, to Anthropic to write the answer, or to OpenAI when Anthropic is unavailable.
- Streak, XP, and a daily goal of 10, 20, or 50 XP.
- Review rounds replay missed questions on a spaced schedule, built on the device, so they work offline.
- Easy banks ship with the app and work offline from the first launch; Medium and Hard download once and then work offline.
- Syntactical Pro is the only purchase, sold as Pro Annual (`syntactical.pro.annual`, a yearly auto-renewing subscription, $19.99 US) or Pro Lifetime (`syntactical.pro.lifetime`, one-time, $39.99 US). No monthly plan. Pro removes the sponsored cards and raises the daily Ask limit from 5 to 20. Cancelling Pro Annual keeps Pro until the end of the paid year.
- Free users see sponsored cards in the app's own card style, labelled "Sponsored": one on the results screen (from the third round, then every third round) and one in the track list. Never on a question, mid-round, in the query drawer, or in review rounds. On iOS and Android they are non-personalised Google AdMob native ads, or a direct sponsor or the house Pro card when no ad loads; Google receives the device's IP address, from which it may infer an approximate location, to serve and count them. On the web, an EthicalAds text ad, a direct sponsor, or the house Pro card. No ATT prompt, no tracking.
- Signing in is optional (an email code, or a password if you set one). Guests keep progress on the device; signed-in users sync progress across devices and can restore Pro.

## App Store (iOS)

| Field              | Limit | Draft                                                                                                                                     |
| ------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Name               | 30    | Syntactical                                                                                                                               |
| Subtitle           | 30    | Code quizzes that stick                                                                                                                   |
| Keywords           | 100   | python,postgres,javascript,typescript,go,ruby,rails,sql,nodejs,security,quiz,coding,interview                                             |
| Promotional text   | 170   | Every bank is free: 12 tracks from Python to Frontend Security, Easy to Hard. Pro removes sponsored cards and raises the daily Ask limit. |
| Support URL        |       | PLACEHOLDER: owner supplies (see `docs/launch-placeholders.md`)                                                                           |
| Privacy policy URL |       | `https://syntactical.dev/privacy` (app route `app/privacy.tsx`; the owner fills its placeholders first)                                   |
| Marketing URL      |       | Optional. `https://syntactical.dev`                                                                                                       |
| Category           |       | Education (primary), Developer Tools (secondary)                                                                                          |
| Age rating         |       | 4+ expected: no objectionable content, no web browsing, no user-generated content. Confirm in the questionnaire.                          |
| Copyright          |       | PLACEHOLDER: owner's name or entity and year                                                                                              |

### Description (iOS and Play full description, limit 4000)

```
Syntactical is a quiz for the parts of a language that behave differently than you expect. Every question bank is free.

Pick a track, then a difficulty. Twelve tracks: Python, Postgres, JavaScript, TypeScript, TypeScript Types, Node.js, Go, Ruby, Rails, SQL, Backend Security, and Frontend Security. Each round is a shuffled pass through a bank of multiple-choice, true/false, and A/B questions about runtime semantics, query planning, coercion, scope, injection, and the sharp edges in between.

Get one wrong and tap Explain. The Query panel shows the syntax, the reasoning, and the tags behind the question, so you learn why the answer is what it is.

What you get
- 12 tracks, each at Easy, Medium, and Hard: 36 question banks, every one free, no account needed.
- A streak, XP, and a daily goal of 10, 20, or 50 XP.
- Review rounds that bring back the questions you missed, on a schedule that spaces them out. They are built on your device, so they work offline.
- Easy banks are on your device from the first launch. Medium and Hard download once and then work offline.
- Signed in, ask about a card after you answer it: 5 a day free, 20 a day with Pro. Signed in, you also get a weekly study note.
- Optional sign-in with an email code, or a password if you set one. Sign in to keep your progress across devices and to restore Pro. Delete your account at any time from Settings.

Syntactical Pro
- Removes the sponsored cards and raises the daily Ask limit from 5 to 20.
- Pro Annual is a subscription that renews every year until you cancel it. Pro Lifetime is a one-time purchase. There is no monthly plan.
- Manage or cancel Pro Annual in your App Store or Google Play account settings. Cancelling keeps Pro until the end of the paid year.

Sponsored cards
Free users see a sponsored card on the results screen from the third round, then every third round, and one in the track list, in the app's own style and labelled Sponsored. Never on a question, never during a round, never in review rounds. The ads are non-personalised: the app does not track you and shows no tracking prompt. Google AdMob receives your device's IP address, from which it may infer an approximate location, to serve and count them.

Your answers and progress stay on your device until you sign in. Usage analytics are anonymous until you sign in, and are never tied to your email. When you ask about a card, use Explain my mistake, or get your study note, the card and your question, your choice on a card you got wrong, or your week's summary go to Anthropic to write the answer, or to OpenAI when Anthropic is unavailable.

Privacy policy: https://syntactical.dev/privacy
Terms of use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
```

On Play, use the same text without the "Terms of use" line.

### What's New (limit 4000 on iOS, 500 on Play)

```
First release. 12 tracks and 36 question banks, every one free. Pro, yearly or lifetime, removes sponsored cards and raises the daily Ask limit from 5 to 20. Review rounds, a daily goal, and optional sign-in.
```

## Google Play

| Field                | Limit | Draft                                                                                                           |
| -------------------- | ----- | --------------------------------------------------------------------------------------------------------------- |
| App name             | 30    | Syntactical                                                                                                     |
| Short description    | 80    | 36 free quiz banks across 12 tracks. Learn why each answer is right.                                            |
| Full description     | 4000  | Use the description above                                                                                       |
| Category             |       | Education                                                                                                       |
| Tags                 |       | Education, programming (pick from Play's list)                                                                  |
| Contact email        |       | PLACEHOLDER: owner supplies                                                                                     |
| Privacy policy       |       | `https://syntactical.dev/privacy`                                                                               |
| Account deletion URL |       | `https://syntactical.dev/delete-account` (Play requires this page; the in-app path is Settings, Delete account) |

## Screenshots

Owner captures them from a production build on a real device or simulator, signed in with a sandbox account: the track list with its sponsored card, a question mid-round, the Query panel after a wrong answer, the results screen with a sponsored card, the daily goal in Settings, and the Pro sheet with both localized prices loaded. Capture the sponsored cards showing the house Pro card or a live non-personalised ad, never a Google test ad (development and preview builds label it "Test Ad"). Take the Pro sheet from a free account, before any sandbox purchase.
