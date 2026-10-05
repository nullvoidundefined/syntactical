# Session Handoff: password sign-in and sign-up live (7.1 to 7.8), settings form next

## Last commit

- `chore/handoff-through-107`: refreshes this handoff through #107. Before it, `main` was at `04b5b6b` (#107, Task 7.8 sign-up screen).

## Production state

- Web: https://syntactical.dev/ (GitHub Pages, deploys on every push to `main`). It now opens sign-in on the password step, with "Use a code instead", "Forgot password?", and "Create an account" (#104, #106, #107).
- API on Railway (`server/DEPLOY.md`): https://api.syntactical.dev (production) and https://staging-api.syntactical.dev (staging).
  - Staging deploys on pushes to `main` that touch `server/`, `packages/`, `content/`, or `package-lock.json`.
  - Production deploys only by a manual `server-deploy.yml` run on `main`. It was deployed at `feba009` on 2026-10-05 (run 37284808553) and serves Tasks 7.1 to 7.6; a smoke check of `POST /v1/auth/sessions/password` with an unknown email returned 400 `AUTH_INVALID_CREDENTIALS`.
- `content/manifest.json` still lists only Python, Postgres, and JavaScript (9 banks). Paid banks live in the private syntactical-content repo, pinned by `content/paid-content.ref` (#54, #62).

## Session metrics

- This session landed #85, #88, #89, #90, #93, #97, #99 (spec and server Tasks 7.1 to 7.6), #104 and #106 (Task 7.7), and #107 (Task 7.8), plus agent-governance #211 (secret-scan treats only quoted values as literals).
- Process drifted on 7.7 and 7.8 (2 general and 3 security rounds each) because LOWs were fixed after the security review. The rules are now in the `feedback-rapid-process` memory: ticket or waive LOWs, one round of each review, no mid-PR scope, stop at about 90 minutes per high-risk task.

## What shipped

- App: sign-in and sync (#33, #35), paywall and purchase (#52), privacy and deletion pages (#59), syntactical.dev (#76), topic-track menu (#71), quality page removed (#84).
- Server: one-time-code sessions (#19 to #32), paid banks and RevenueCat (#36, #37), PostHog (#50), account deletion (#41), container and Railway deploy (#53, #58, #65, #67).
- Pipeline: oracle runners (#14, #63, #64), gap-fill and enrich (#24, #25, #27, #70, #77), topic tracks slices 1 to 3 and 5 (#71, #72, #74, #79, #91, #92; `TRACK_RUNNERS['frontend-security']` is `['jsdom', 'node']`), hardening (#73, #81, #86).
- Password sign-in (plan Tasks 7.1 to 7.10, spec #85): columns #88, hashing #89, rules and breach check #90, sign-up API #93, sign-in API #97, password change API #99, app sign-in screen #104 and #106, app sign-up screen #107.
- App tests: CodeBlock token colors (IAN-583) and keyword tagging for typescript, go, rust, ruby, and bash (IAN-584), #101.
- Tests: a Playwright e2e suite against the real API and Postgres (#60, IAN-601), and A/B cards for every bank (#61).

## Pending

1. **Topic tracks, slices 4 and 6** (`docs/superpowers/plans/2026-10-04-topic-tracks.md`; slice 5 shipped in #91):
   - Slice 4: Backend Security content. Gap-fill was running in the `backend-track` worktree when this was written.
   - Slice 6: Frontend Security content. Gap-fill was running in the `frontend-track` worktree when this was written. Its oracles run on the jsdom runner: they must print synchronously, because `window.setTimeout` callbacks still pending at the end are dropped and `requestAnimationFrame` is not defined (#92, also stated in `generateSecurityQuestion.md`).

   Before running a slice, decide the pending disputed cards: they do not count toward the gap-fill quota (#79 LOW).

2. **Owner, outside the repo:**
   - Topic tracks need four store and RevenueCat products, `syntactical.{backend,frontend}-security.{medium,hard}`, and a logged-in Codex CLI where the pipeline runs (#68).
   - Post-merge steps for #76: set the Pages custom domain, enforce HTTPS, set `ALLOWED_ORIGINS=https://syntactical.dev` on both Railway environments and redeploy, then run the Safari credentialed-fetch check in `server/DEPLOY.md`.
   - Decide on DNS for `api` and `staging-api`, or change `API_BASE_URL` in `eas.json` (#57).
3. **Owner review:**
   - 9 readability A/B cards await human approval (#61). An agent must not set `isHumanReviewed`.
   - The privacy and deletion pages are drafts with `[OWNER NAME]`, `[CONTACT EMAIL]`, and `[EFFECTIVE DATE]` placeholders (#59).
4. **Password sign-in, Tasks 7.9 and 7.10:**
   - 7.9 (settings password form, `PUT me/password`, forgot-password return to `/settings?form=password`): not started. It is the next task; reuse `PasswordField`, `AuthForm`, `AuthButton isSubmit`, and `services/auth/readReturnTo.ts`.
   - 7.10: open PR #100 (privacy page), held until 7.9 merges so the live site does not describe the settings form early. Its body records the review.
   - LOWs noted for later: `AuthButton` takes no ref (sign-up focuses Continue with a DOM query); `app/sign-up.tsx` reads `NavigationContext` from an internal expo-router path; a sign-up start in flight when the user leaves can return to the code step with an empty password (the server refuses it).
   - The owner confirmed spec decisions 31 to 37 on 2026-10-05, keeping scrypt N = 2^17. The Railway API service allows 24 GB in staging and production (Pro plan, no override), above decision 35's 512 MB minimum.
5. **Carried over:**
   - IAN-596: Lighthouse, VoiceOver, and reduced motion on the live site.
   - IAN-595: EAS device builds. The prep shipped in #57; no builds have run.
   - Monetization is in effect per-bank products (#36, #37, #52). No decision record exists.

## Next session

- Start from `main`, not an older worktree base. Run `git log -1 origin/main` and confirm this handoff is the one you are reading.
- Gotchas:
  - `tdd.sh amend` cannot re-prove RED once the implementation exists. The lock denies test deletions while a slice is RED. A test file can be named by id (`path::<describe> <test>`) when it already holds passing tests.
  - Codex's read-only sandbox cannot run Vitest (a temp-dir EPERM). If a Codex review ends without findings, fall back to `pr-reviewer`.
  - After a security review, any further commit needs another security round. Waive LOWs under the standing waiver instead of fixing them late.
  - GitHub can stop syncing a PR to new pushes (#104 merged a stale head). Before merging, compare `gh api repos/nullvoidundefined/syntactical/pulls/<n> --jq .head.sha` with `git ls-remote origin refs/heads/<branch>`, and merge with `--match-head-commit`.
  - GitGuardian flags `mockSignInWithPassword = ...` style names and keeps flagging the commit even after a rename (incidents 37869767, 37871242 are false positives; the check is not required).
  - Run `~/.claude/hooks/harness-sync.sh </dev/null` by hand; without the redirect it waits on stdin.
  - Railway rejects BuildKit secret mounts, `railway up` needs `--path-as-root`, and service settings live in Railway, not `railway.json` (#58, #65, #67).
  - Docker-backed tests and e2e need `DOCKER_CONFIG=/tmp/dcfg`. A stale Metro cache in `$TMPDIR` can bake production URLs into local e2e runs (#60, #76).
  - Pipeline runs (gap-fill and enrich) are live in six worktrees, all on the same content root: `backend-track` and `frontend-track` (slices 4 and 6), `go-track`, `rails-track`, and `ruby-track` (the Go, Rails, and Ruby bank generation on `feat/{go,rails,ruby}-track`), and `sleepy-robinson-a67b97` (on `fix/model-json-fence`, after #94 merged). Check `pgrep -fl "src/cli.ts"` before starting another run on the same content root.
  - The macOS `sed` does not support `\|` alternation; use `sed -E` with `|`. A mutation check written with `\|` silently changes nothing and passes.
  - A guard blocks force pushes. After rebasing a pushed branch, push it under a new name and delete the old remote branch (#92 did this).
  - `pr-reviewer` must run in the background (R-708), with `~/.claude/enforce/agent-watchdog.sh` on its output file.
  - The judge's page parse runs in a `.ts` worker loaded directly by Node, so the pipeline needs Node 22.18 or later. On an older Node, every quote check fails closed (#86).
