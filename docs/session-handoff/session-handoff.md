# Session Handoff: topic tracks through slice 3, judge quote check hardened

## Last commit

- `chore/refresh-session-handoff`: rewrites this handoff, which had not changed since IAN-564 (2026-10-02, #5). Before it, `main` was at `6c65354` (#86, which parses cited pages in a worker with a hard timeout).

## Production state

- Web: https://syntactical.dev/ (GitHub Pages custom domain since #76). The deploy.yml runs succeeded for `6c65354`, `0a6a4c4`, and `9af5085`.
- API on Railway (`server/DEPLOY.md`):
  - Staging is https://api-staging-accd.up.railway.app. It deploys on every push to `main`; the server-deploy.yml run for `3189f57` succeeded.
  - Production is https://api-production-9973.up.railway.app. It deploys only by manual run, and no production run has been confirmed since #76.
- When `server/DEPLOY.md` and `docs/launch-placeholders.md` were written, the `api.syntactical.dev` and `staging-api.syntactical.dev` DNS records did not exist.
- `content/manifest.json` still lists only Python, Postgres, and JavaScript (9 banks). Paid banks live in the private syntactical-content repo, pinned by `content/paid-content.ref` (#54, #62).

## Session metrics

- This session merged #74 (slice 3a), #81 (parser-stack depth guard and site-chrome exclusion), and #86 (worker parse), and opened this docs PR.
- #81 needed 2 general-review rounds and 3 security rounds. Each security round found another parse5 cost path, so the owner chose a worker with a hard timeout (#86). #86 needed 1 round of each.
- Since the last handoff, 78 commits landed (PRs #6 to #86) across several parallel sessions.

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
  - Hardening: #73 (harness PID 1), #81, and #86.
- Tests: a Playwright e2e suite against the real API and Postgres (#60, IAN-601), and A/B cards for every bank (#61).

## Pending

1. **Topic tracks, slices 4 to 6** (`docs/superpowers/plans/2026-10-04-topic-tracks.md`):
   - Slice 4: Backend Security content.
   - Slice 5: the jsdom runner and golden set.
   - Slice 6: Frontend Security content.

   Before running a slice, decide the pending disputed cards: they do not count toward the gap-fill quota (#79 LOW).

2. **Owner, outside the repo:**
   - Topic tracks need four store and RevenueCat products, `syntactical.{backend,frontend}-security.{medium,hard}`, and a logged-in Codex CLI where the pipeline runs (#68).
   - Post-merge steps for #76: set the Pages custom domain, enforce HTTPS, set `ALLOWED_ORIGINS=https://syntactical.dev` on both Railway environments and redeploy, then run the Safari credentialed-fetch check in `server/DEPLOY.md`.
   - Decide on DNS for `api` and `staging-api`, or change `API_BASE_URL` in `eas.json` (#57).
3. **Owner review:**
   - 9 readability A/B cards await human approval (#61). An agent must not set `isHumanReviewed`.
   - The privacy and deletion pages are drafts with `[OWNER NAME]`, `[CONTACT EMAIL]`, and `[EFFECTIVE DATE]` placeholders (#59).
4. **Open PR:** #85, the spec and plan for email and password sign-in (Tasks 7.1 to 7.10). Its review is pending, the owner must confirm spec decisions 31 to 37, and its ci.yml run on `dedf140` failed (cause not examined).
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
  - The judge's page parse runs in a `.ts` worker loaded directly by Node, so the pipeline needs Node 22.18 or later. On an older Node, every quote check fails closed (#86).
