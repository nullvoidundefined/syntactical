# Session Handoff: jsdom runner shipped, password sign-in through Task 7.3

## Last commit

- `chore/handoff-through-92`: refreshes this handoff through #92. Before it, `main` was at `b97f221` (#92, the jsdom runner review follow-ups).

## Production state

- Web: https://syntactical.dev/ (GitHub Pages custom domain since #76). The deploy.yml runs succeeded for `b97f221`, `7da1e47`, and `dcd0a4d`; the runs for `e1faeca` and `3c9a311` were cancelled by the next push.
- API on Railway (`server/DEPLOY.md`):
  - Staging is https://api-staging-accd.up.railway.app. It deploys on pushes to `main` that touch `server/`, `packages/`, `content/`, or `package-lock.json`; the server-deploy.yml runs for `dcd0a4d`, `e1faeca`, and `3a85705` (the password migration and services) succeeded.
  - Production is https://api-production-9973.up.railway.app. It deploys only by manual run, and no production run has been confirmed since #76.
- When `server/DEPLOY.md` and `docs/launch-placeholders.md` were written, the `api.syntactical.dev` and `staging-api.syntactical.dev` DNS records did not exist.
- `content/manifest.json` still lists only Python, Postgres, and JavaScript (9 banks). Paid banks live in the private syntactical-content repo, pinned by `content/paid-content.ref` (#54, #62).

## Session metrics

- Since the #87 handoff, 6 PRs landed across parallel sessions: #85 (password sign-in spec and plan), #88, #90, and #89 (Tasks 7.1 to 7.3), #91 (slice 5, the jsdom runner), and #92 (its review follow-ups).
- #92 fixed the three LOWs from the #91 review in one round: a throwing `window.close()` no longer turns a printed value into RunnerFailure, pending `window.setTimeout` output being dropped is documented and pinned, and a DOM-heavy oracle is tested to stop as `resource-limit`.

## What shipped

- App:
  - Sign-in and answer sync (#33, #35).
  - Paywall, purchase, and restore on web and native (#52).
  - Privacy and account-deletion pages (#59).
  - The syntactical.dev domain (#76).
  - Topic-track menu groups and source links (#71).
  - The content quality page was removed (#84, IAN-601).
- Server:
  - Express 5 API with one-time-code sessions (#19, #23, #29, #30, #32).
  - Paid bank endpoint and RevenueCat web billing (#36, #37).
  - PostHog analytics, cookieless for guests (#50).
  - Account deletion (#41).
  - Container, CI, and the Railway deploy workflow (#53, #58, #65, #67).
- Pipeline:
  - Oracle runners for Python, Postgres, JS, Ruby, Rails, and Go (#14, #63, #64).
  - Gap-fill, enrich, and review (#24, #25, #27, #70, #77).
  - Topic tracks, slices 1 to 3: #71, #72, #74 (3a), and #79 (3b).
  - Topic tracks, slice 5: the jsdom runner with `jsdom` 26.1.0, `dompurify` 3.2.6, and an 18-entry golden set (#91, #92). `TRACK_RUNNERS['frontend-security']` is `['jsdom', 'node']`.
  - Hardening: #73 (harness PID 1), #81, and #86.
- Password sign-in (`docs/superpowers/plans/2026-10-02-syntactical-v2.md`, Tasks 7.1 to 7.10, spec in #85):
  - 7.1: password and session auth-method columns (#88).
  - 7.2: scrypt hashing and hash slots (#89).
  - 7.3: password rules and breach check (#90).
- Tests: a Playwright e2e suite against the real API and Postgres (#60, IAN-601), and A/B cards for every bank (#61).

## Pending

1. **Topic tracks, slices 4 and 6** (`docs/superpowers/plans/2026-10-04-topic-tracks.md`; slice 5 shipped in #91):
   - Slice 4: Backend Security content.
   - Slice 6: Frontend Security content. Its oracles run on the jsdom runner: they must print synchronously, because `window.setTimeout` callbacks still pending at the end are dropped and `requestAnimationFrame` is not defined (#92, also stated in `generateSecurityQuestion.md`).

   Before running a slice, decide the pending disputed cards: they do not count toward the gap-fill quota (#79 LOW).

2. **Owner, outside the repo:**
   - Topic tracks need four store and RevenueCat products, `syntactical.{backend,frontend}-security.{medium,hard}`, and a logged-in Codex CLI where the pipeline runs (#68).
   - Post-merge steps for #76: set the Pages custom domain, enforce HTTPS, set `ALLOWED_ORIGINS=https://syntactical.dev` on both Railway environments and redeploy, then run the Safari credentialed-fetch check in `server/DEPLOY.md`.
   - Decide on DNS for `api` and `staging-api`, or change `API_BASE_URL` in `eas.json` (#57).
3. **Owner review:**
   - 9 readability A/B cards await human approval (#61). An agent must not set `isHumanReviewed`.
   - The privacy and deletion pages are drafts with `[OWNER NAME]`, `[CONTACT EMAIL]`, and `[EFFECTIVE DATE]` placeholders (#59).
4. **Password sign-in, Tasks 7.4 to 7.10:**
   - Open PR: #93, Task 7.4 (sign-up with email and password, verified by a one-time code), head `08efbb9`, `**Risk:** high`. It touches auth, so the owner reads and merges it. When this was written, all checks passed except `oracle-runners`, which was pending.
   - Not started: 7.5 (password sign-in), 7.6 (set and change a password, `hasPassword` on `/me`), 7.7 to 7.9 (app screens and settings form), 7.10 (privacy page, store answers, lexicon).
   - #85 merged, but no PR comment records the owner confirming spec decisions 31 to 37. Confirm them before 7.5.
5. **Carried over:**
   - IAN-596: Lighthouse, VoiceOver, and reduced motion on the live site.
   - IAN-595: EAS device builds. The prep shipped in #57; no builds have run.
   - IAN-583 and IAN-584: CodeBlock and tokenizer tests.
   - Narrowing the `app.config.ts` base-URL allowlist: still open, and its tests still cover `/preview`.
   - Monetization is in effect per-bank products (#36, #37, #52). No decision record exists.

## Next session

- Start from `main`, not an older worktree base. Run `git log -1 origin/main` and confirm this handoff is the one you are reading.
- Gotchas:
  - `tdd.sh amend` cannot re-prove RED once the implementation exists. The lock denies test deletions while a slice is RED. A test file can be named by id (`path::<describe> <test>`) when it already holds passing tests.
  - Codex's read-only sandbox cannot run Vitest (a temp-dir EPERM). If a Codex review ends without findings, fall back to `pr-reviewer`.
  - After a security review, any further commit needs another security round. Waive LOWs under the standing waiver instead of fixing them late.
  - Railway rejects BuildKit secret mounts, `railway up` needs `--path-as-root`, and service settings live in Railway, not `railway.json` (#58, #65, #67).
  - Docker-backed tests and e2e need `DOCKER_CONFIG=/tmp/dcfg`. A stale Metro cache in `$TMPDIR` can bake production URLs into local e2e runs (#60, #76).
  - The remote branch `feat/jsdom-runner` was not deleted when #91 merged.
  - A guard blocks force pushes. After rebasing a pushed branch, push it under a new name and delete the old remote branch (#92 did this).
  - `pr-reviewer` must run in the background (R-708), with `~/.claude/enforce/agent-watchdog.sh` on its output file.
  - The judge's page parse runs in a `.ts` worker loaded directly by Node, so the pipeline needs Node 22.18 or later. On an older Node, every quote check fails closed (#86).
