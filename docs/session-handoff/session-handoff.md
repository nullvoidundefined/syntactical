# Session Handoff: IAN-564, syntactical as one Expo universal app

## Last commit

- `e6c3ba4` feat(web): B-37 ignore modifier shortcuts and auto-repeated keys in the key bindings (branch `feat/expo-cutover`, PR 3). The final commit of this session adds this handoff and `docs/security-reviews/ian-564-pr3.json` on top of it.

## Production state

- `main` is at 8bca8cd (PR 2, nullvoidundefined/syntactical#3). The live site at https://nullvoidundefined.github.io/syntactical/ is still the Vite app, and the Expo preview is at `/syntactical/preview/`. Both returned 200 after the PR 2 deploy.
- PR 3, nullvoidundefined/syntactical#4 (`feat/expo-cutover`), is open, marked ready, and CI was green at e6c3ba4. It is not merged yet. Merging it switches the live site to the Expo web export at `/syntactical/` and removes Vite.

## Session metrics

- PR 1 (#2) and PR 2 (#3) were merged as squash commits. PR 3 has 10 commits on its branch, plus the handoff commit.
- PR 3's diff touches 70 files: 928 insertions and 18,027 deletions, almost all of them the removed `src/` Vite app.
- Rework count: 4.
  - PR 2's R-517 round 1 needed fixes.
  - PR 3's R-517 round 1 needed fixes.
  - The owner deleted a stuck `tdd-lock.json` twice: once because amend could not re-prove RED with the implementation present, and once because obsolete tests could not be deleted while RED.
- Velocity flag: none.

## What shipped

- **PR 2, merged (#3, 8bca8cd):**
  - Language and difficulty menus built from the manifest.
  - The download indicator, announced on native and through a persistent live region on the web.
  - The quiz round with Explain, the query drawer, results, retry, and stats.
  - `CodeBlock`, which renders Prism tokens as nested `Text`, with an allowlist of build grammars.
  - Security review: two passes, no findings. R-517 review: round 1 found 2 MEDIUM and 4 LOW; round 2 was clean.
- **PR 3, open (#4):**
  - Web keyboard navigation and the hint bar (B-37), ignoring modifier shortcuts and auto-repeated keys.
  - The cutover (B-39): `npm run build` exports Expo at `/syntactical/`, and `deploy.yml` runs that one build. `src/`, Vite, `gh-pages`, and the `tailwindcss-v4` alias are removed.
  - `eas.json` and `docs/device-checklist.md` (B-40 config).
  - Docs (B-41): stack, feature list, user stories, README, and lexicon.
  - The production build was verified locally by driving a round with the keyboard.
- **PR 3 reviews:**
  - R-517 round 1 found 3 MEDIUM and 2 LOW, dispositioned in the PR body.
  - The R-109 review on claude-fable-5-1 over 8bca8cd..e6c3ba4 found nothing. Its artefact is `docs/security-reviews/ian-564-pr3.json`.
- **Tickets filed:**
  - IAN-583: CodeBlock color tests.
  - IAN-584: tokenizer keyword tests for 5 more grammars.
  - IAN-595: run the EAS builds and the device checklist (B-40).
  - IAN-596: the Lighthouse, VoiceOver, and reduced-motion pass on the live site (B-38). The owner deferred it at merge.

## Pending

1. **Urgent, about 15 minutes: merge PR 3.**
   - After the handoff commit is pushed, record the security artefact at the new head with `bash ~/.claude/enforce/security-review-record.sh docs/security-reviews/ian-564-pr3.json`. Skip this if the session already recorded it.
   - Add a `## Security review` section to the PR #4 body, copied from the artefact, with the range ending at the PR head.
   - Wait for CI to go green.
   - Merge with `gh pr merge 4 --squash --delete-branch --match-head-commit <head sha>`.
   - The owner said "Merge everything" on 2026-10-02. The first merge attempt was refused only for the missing `## Security review` section.
2. **After the merge, about 10 minutes:** watch the Deploy to GitHub Pages run. Then confirm that `/syntactical/` and `/syntactical/python/easy` both load the Expo app.
3. **Close IAN-564, about 10 minutes:** run `/task-cleanup`, then close the ticket with actuals. `started_at` is 2026-10-02T04:41:14Z, `risk` is high, and `findings_by_round` is PR 2 `r1:M2,L4; r2:none` and PR 3 `r1:M3,L2`.
4. **Owner tasks:** IAN-596, the accessibility pass on the live site, and IAN-595, the device builds, which need the owner's Expo and Apple Developer accounts.
5. **Low:** IAN-583 and IAN-584. Narrow the `app.config.ts` allowlist to drop the unused `/syntactical/preview` path; that is a change to a security control, so it needs its own PR and an R-109 review.

## Next session

- Read the PR #4 body and its review tables: https://github.com/nullvoidundefined/syntactical/pull/4
- Read `docs/security-reviews/ian-564-pr3.json`.
- Read `docs/superpowers/specs/2026-10-02-expo-universal-app-design.md` (B-37 to B-41).
- Read the deploy workflow, `.github/workflows/deploy.yml`.
- Gotchas:
  - In this harness, `tdd.sh amend` cannot re-prove RED once the implementation exists.
  - Delete obsolete tests before `tdd.sh red`, because the lock denies test deletions while the slice is RED.
  - jsdom never fires `animationend`, so web tests of the query Modal mock reduced motion to true.
