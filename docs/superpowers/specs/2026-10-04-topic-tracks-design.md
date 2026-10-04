# Topic tracks: Backend Security and Frontend Security

Date: 2026-10-04. Status: approved in conversation, pending spec review.

## Intent

Syntactical drills developers on language behavior, and every answer is proven by running code. The owner wants categories that are not tied to one language, starting with Backend Security and Frontend Security. They should keep the app's "every answer verified" promise as far as possible.

What the owner decided:

- Question style: a mix that leans on code. Most cards are "what does this vulnerable code do" or "pick the fix". The rest are conceptual questions such as "what does `SameSite=Lax` block?".
- Trust bar for cards that cannot run: two-model agreement plus a cited, checked source. Disputed cards go to the owner.
- Approach A: a topic track is a manifest entry with `kind: "topic"`. Each question chooses its own runner and grammar.

Success means:

- Backend Security ships Easy, Medium and Hard banks of about 100 cards each.
- Every card is either `executed` (its exploit or fix was run in the sandbox) or `judged` (both models agree and a source quote was verified).
- The owner reviews only disputed cards.

## 1. Content model

### Manifest (`packages/content-schema/src/types/LanguageEntry.ts`)

- Add an optional `kind?: 'language' | 'topic'`. A missing `kind` means `'language'`, so the existing entries and bundled manifests stay valid without edits.
- For a topic entry, `grammar` is the default highlight. Backend Security uses `plain`.
- Every other field is unchanged: `id`, `label`, `glyph`, `tagline`, `topics`, `misconceptions`, `banks`, and the `productId` on each paid bank.
- Ids follow the existing `LANGUAGE_ID` pattern: `backend-security`, `frontend-security`.
- No rename of `LanguageEntry` or the `app/[language]` route. `docs/lexicon.md` gains one line: a topic track occupies the `language` slot, and `kind` tells the two apart.
- `validateManifest` accepts `kind` only as one of the two values, and rejects anything else.

### Question (`packages/content-schema/src/types/Question.ts`)

- Add an optional `grammar?: Grammar` to `QuestionBase`.
- When present, it overrides the entry's grammar for that card's code, its choices and its query drawer.
- `validateQuestionBank` rejects a grammar outside `GRAMMARS`.

### Provenance (`packages/content-schema/src/types/Provenance.ts`)

- No new method. `executed` and `judged` already exist.
- Add an optional `validation.evidence?: { sources: { url: string; title: string; quote: string }[]; verdict: string }`.
- `isValidProvenance` requires `evidence` with at least one source when the method is `judged` and the status is `passed`.

### Lexicon

- `track` keeps its meaning: the stats record for an entry and difficulty pair. For example, `backend-security:easy`.

## 2. Validation path (pipeline)

### Executed route (preferred)

- **Allowed runners.** `pipeline/src/services/TRACK_RUNNERS.ts` maps each topic id to its allowed runners:
  - `backend-security: ['python', 'node', 'postgres']`
  - `frontend-security: ['jsdom', 'node']`
  - Language tracks keep using `ORACLE_LANGUAGES`.
- **Choosing a runner.** For a topic track, the generation prompt picks a runner for each question. A draft whose `oracle.language` is not in the allowed set is dropped. The question's `grammar` is set from the chosen runner: `python` gives `python`, `postgres` gives `sql`, and `node` and `jsdom` give `javascript`.
- **Exploit proofs.** The oracle runs the vulnerable code against a payload and prints the observable outcome. Examples are a `UNION SELECT` returning another user's row, or `../` escaping a base directory.
- **Pick-the-fix cards.** These use the existing `oracle.choiceCode`. Each choice's fix runs against the same exploit, and only the correct choice may print the blocked marker. `validateQuestion` already matches snippets this way.
- **Prompt changes.** Add `pipeline/prompts/generateSecurityQuestion.md`, using the existing `{{LANGUAGE}}` placeholders plus `{{RUNNERS}}`. It prefers execution and returns `NotExecutable` with a reason when no exploit can be shown.

### Judged route (when the generator returns `NotExecutable`)

A new `pipeline/src/services/judge/judgeQuestion.ts` runs three checks, and all three must pass.

1. **Source check (deterministic).**
   - The draft cites at least one source: `{ url, title, quote }`.
   - `pipeline/src/clients/sourceFetcher.ts` fetches the URL and passes only if the normalized quote appears in the page text.
   - Allowed hosts are an exact match or a subdomain of: `owasp.org`, `cheatsheetseries.owasp.org`, `developer.mozilla.org`, `rfc-editor.org`, `datatracker.ietf.org`, `docs.python.org`, `nodejs.org`, `postgresql.org`, `w3.org`, `whatwg.org`.
2. **Blind answers.**
   - The Claude provider and a new `pipeline/src/clients/codexCliProvider.ts` each receive the question without the claimed answer and pick a choice.
   - `codexCliProvider` implements the existing `ModelProvider` interface and runs `codex exec -s read-only` with stdin closed.
3. **Agreement and consistency.**
   - Both blind answers must equal the claimed answer.
   - A judge pass, given the verified quote, must find the explanation consistent with it.

Outcomes:

- **All pass:** the card gets `{ method: 'judged', status: 'passed', evidence }`.
- **Any failure besides the source check:** the card is staged as disputed. The existing `review` command lists it with both blind answers, the quote and the claimed answer. The owner approves or rejects it.
- **Source check failure:** the draft is dropped. It never goes to review.

### Publish

- `pipeline/src/services/publish/verdictOf.ts` treats `judged + passed` with evidence as a verdict.
- `validateBankForPublish` still refuses any card whose provenance is invalid.
- Human approval through `review` works as it does today.

### Cost

- A judged card costs about 4 model calls plus 1 fetch.
- An executed card costs 1 to 3 calls.
- The prompt prefers execution.

## 3. App and frontend runner

### App

- `app/[language]/[difficulty]/play.tsx`, `app/review.tsx`, `components/quiz/AbCard.tsx`, `components/quiz/BooleanCard.tsx` and `components/query/QueryDrawer.tsx` resolve `question.grammar ?? entry.grammar`.
- `components/menu/LanguageStep.tsx` groups entries under the headings "Languages" and "Topics" by `kind`. Heading levels stay in order and the Lighthouse accessibility score stays at 100.
- `QueryDrawer` shows the first evidence source of a judged card as "Source: <title>". It is a link with `target="_blank" rel="noopener noreferrer"`. Executed cards are unchanged.
- No changes to the paywall, stats, routes or progress.

### `pipeline/runners/jsdom/`

- The image is `node:24-slim` with pinned `jsdom` and `dompurify`. The harness contract is the Node harness's, and the Docker args are unchanged (no new mounts).
- Before the oracle runs, the harness sets up `window`, `document`, `DOMParser` and `DOMPurify` from `new JSDOM('<!doctype html><body></body>', { url: 'https://app.test/' })`.
- **Provable here:**
  - DOM-sink XSS, checked by whether the injected element exists after `innerHTML`, `insertAdjacentHTML`, or a `javascript:` `href` is set
  - DOMPurify configurations
  - `postMessage` origin checks
  - prototype pollution
  - URL parser confusion
- **Judged instead:** CSP enforcement, cookie `SameSite` and `Secure`, CORS preflight, and framing headers.
- **Revisit trigger:** if more than 25% of Frontend Security cards are disputed, evaluate a headless-Chromium runner.
- **Registration:** `jsdom` joins `OracleLanguage`, `dockerRunner` `LANGUAGES`, the `readExistingOracles` enum, and `golden/jsdom.json`. The golden file has at least 10 entries, half of them deliberately wrong.

## 4. Rollout

| #   | Slice                                                                                                                                | Risk     | Depends on |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | ---------- |
| 1   | Schema and app: `kind`, `question.grammar`, `validation.evidence`, grammar per card, menu sections, source link                      | standard | none       |
| 2   | Topic tracks in gap-fill: `TRACK_RUNNERS`, runner per question, security generation prompt, dropping drafts with a disallowed runner | standard | 1          |
| 3   | Judged route: `sourceFetcher` with allowlist, `codexCliProvider`, `judgeQuestion`, disputed cards in `review`, `verdictOf`           | high     | 1          |
| 4   | Backend Security content: manifest entry and three banks, with the paid banks in `syntactical-content`                               | standard | 2, 3       |
| 5   | jsdom runner and golden set                                                                                                          | standard | none       |
| 6   | Frontend Security content                                                                                                            | standard | 2, 3, 5    |

Content runs start after the 2026-10-04 Go, Ruby and Rails generation finishes, so the two do not split the owner's `claude` CLI quota.

### Threat model for slice 3 (settled before tests)

- **Input:** URLs and quotes in model output. This is untrusted.
- **Attack:** make the pipeline fetch a loopback, private or link-local address, a non-HTTPS URL or a huge response, or use a redirect to reach any of these.
- **Acceptance boundary:**
  - HTTPS only.
  - The host is an exact match or a subdomain of the allowlist.
  - Every resolved IP is public: no loopback, RFC 1918, link-local, ULA or unspecified address.
  - Each redirect hop is re-checked, with at most 3 hops.
  - The response is capped at 2 MB, with a 10 s timeout.
  - Only text and HTML content types are accepted.
- **Severity ceiling:** a bypass that only fetches another public page on an allowlisted domain is LOW.
- **Tests:** each boundary gets an insecure-input test: `http://`, `localhost`, `127.0.0.1`, `169.254.169.254`, a redirect to a private IP, a lookalike host such as `owasp.org.evil.test`, and an oversized body.

## Owner actions outside the repo

- Create the products `syntactical.backend-security.medium`, `syntactical.backend-security.hard`, `syntactical.frontend-security.medium` and `syntactical.frontend-security.hard` in RevenueCat, App Store Connect and Play Console.
- Keep the Codex CLI logged in on the machine that runs the pipeline.

## Out of scope

- A headless-browser runner.
- Renaming `LanguageEntry` or the `[language]` route.
- Topic tracks beyond the two security tracks.
- Enrich rationales for topic tracks. They are skipped, as the language tracks currently skip them.
