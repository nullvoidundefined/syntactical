# Syntactical Feature List

This document lists every product area of Syntactical with the completion status of each feature, so a reader can see what ships today and what is still planned.

Last updated: 2026-10-02

## Quiz

| Feature | Status | Notes |
|---|---|---|
| Choosing a language and difficulty | Complete | The language step lists every language in the manifest; the difficulty step lists only that language's banks and disables a bank with no local copy while offline. |
| Rounds | Complete | One shuffled pass through a bank; multiple-choice and true/false questions; progress bar; Next is unavailable until the question is answered. |
| Explain | Complete | Appears after an incorrect answer and opens that question's query without advancing the round. |
| Query drawer | Complete | Shows title, syntax, explanation, and tags; closes by its control, the backdrop, or the platform back gesture. |
| Results and retry | Complete | Shows correct count, total, and percentage; Retry reshuffles and resets the round. |
| Stats and streak | Complete | Lifetime stats persist in AsyncStorage under the key the earlier web build used, so existing stats carry over. |
| Web keyboard navigation | Complete | Every binding in `KEY_BINDINGS` works on the web, with a hint bar; the hint bar is not rendered on native. |
| Device builds (iOS and Android) | Partial | `eas.json` has an internal-distribution `preview` profile; the manual checklist in `docs/device-checklist.md` has not been run yet. |

## Content

| Feature | Status | Notes |
|---|---|---|
| Runtime download with hash verification | Complete | The manifest and banks are fetched from the content base URL; a bank is accepted only when its SHA-256 equals the manifest bank hash. |
| Offline fallback to cached and bundled banks | Complete | The cached bank is used first, then the bundled bank; a failed fetch leaves the current copy in use without an error. |
| Download indicator | Complete | Visible while a bank transfers, announced once to assistive technology, and static under reduced motion. |
| Adding a language with JSON | Complete | Add bank files and a manifest entry, then run `npm run content:build`; see the README. |
| Content validation | Complete | Malformed manifests and questions are rejected or dropped with one logged warning naming the rule. |
