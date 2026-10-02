# Session Handoff: IAN-564 closed, syntactical is one Expo universal app

## Last commit

- `chore/close-ian-564`: deletes the fully executed Expo plan, marks the spec shipped except B-38 and B-40, and refreshes this handoff. `main` was at `6571fed` (PR 3, nullvoidundefined/syntactical#4) before it.

## Production state

- https://nullvoidundefined.github.io/syntactical/ serves the Expo web export. The Deploy to GitHub Pages run for `6571fed` succeeded, and the home page and a direct quiz URL both loaded after it.
- `src/`, Vite, and `gh-pages` are gone. Question banks ship as JSON under `content/`, 100 questions per bank across Python, Postgres, and JavaScript at easy, medium, and hard.

## Session metrics

- This session: 1 chore commit (plan deletion, spec status, handoff). No code changes.
- IAN-564 overall: PRs #2, #3, #4 squash-merged. Rework count 4 (see PR #4 body). Velocity flag: none.

## What shipped

- IAN-564 closed as done. PR 2 R-517 `r1:M2,L4; r2:none`, PR 3 R-517 `r1:M3,L2`; R-109 reviews on both found nothing (`docs/security-reviews/`).
- Spec `docs/superpowers/specs/2026-10-02-expo-universal-app-design.md` stays, with its Status line naming the two open items.

## Pending

1. **Owner, about 10 minutes:** IAN-596, Lighthouse accessibility at 100, VoiceOver, and reduced motion on the live site (B-38).
2. **Owner:** IAN-595, EAS internal device builds and `docs/device-checklist.md` (B-40). Needs the owner's Expo and Apple Developer accounts.
3. **Low:** IAN-583 (CodeBlock color tests) and IAN-584 (tokenizer keyword tests for 5 more grammars).
4. **Low, security control:** narrow the `app.config.ts` base-URL allowlist to drop the unused `/syntactical/preview` path. Its own PR with an R-109 review.
5. **Open product decision:** monetization ($5/month vs. a one-time unlock per language). No code started.

## Next session

- Start from `main`, not an older worktree base: run `git log -1 origin/main` and confirm this handoff is the one you are reading.
- Gotchas:
  - `tdd.sh amend` cannot re-prove RED once the implementation exists.
  - Delete obsolete tests before `tdd.sh red`; the lock denies test deletions while the slice is RED.
  - jsdom never fires `animationend`, so web tests of the query Modal mock reduced motion to true.
