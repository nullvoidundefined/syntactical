# Session Handoff: password sign-in done (Stage 7), admin access live

## Last commit

- `chore/handoff-through-113`: refreshes this handoff through #113. Before it, `main` was at `526c067` (#113, signed-out users leave /admin).

## Production state

- Web: https://syntactical.dev/ (GitHub Pages, deploys on every push to `main`). Password sign-in, sign-up, the Settings password form, the admin page, and the UI fixes are live; the owner checked them on iPhone Safari on 2026-10-05.
- API on Railway (`server/DEPLOY.md`): https://api.syntactical.dev (production) and https://staging-api.syntactical.dev (staging).
  - Staging deploys on pushes to `main` that touch `server/`, `packages/`, `content/`, or `package-lock.json`.
  - Production deploys only by a manual `server-deploy.yml` run on `main`. Last run: `9642e83` on 2026-10-05 (run 37303153341), which added `users.is_admin` and `/v1/admin/access`.
- The owner's account (ian.greenough.developer@gmail.com) has `is_admin = true` in production, set by a one-row guarded update; no API can set the flag. The owner turned on all six paid banks from the admin page.
- `content/manifest.json` still lists only Python, Postgres, and JavaScript (9 banks). Paid banks live in the private syntactical-content repo, pinned by `content/paid-content.ref` (#54, #62).

## Session metrics

- Since the #108 handoff: #109 (Task 7.9 Settings password form), #100 (privacy page, Task 7.10), #110 and #111 (admin self-service access, server and app), #112 (visible email labels, full-width inputs, spacing, admin switches, home link), #113 (sign-out on /admin goes home).
- Under the saved process rules (one round of each review, LOWs ticketed) each PR took one review round; LOWs are in IAN-634 to IAN-637.

## What shipped

- App: sign-in and sync (#33, #35), paywall and purchase (#52), privacy and deletion pages (#59, #100), syntactical.dev (#76), topic-track menu (#71), quality page removed (#84), admin page (#111), auth and admin UI fixes (#112, #113).
- Server: one-time-code sessions (#19 to #32), paid banks and RevenueCat (#36, #37), PostHog (#50), account deletion (#41), container and Railway deploy (#53, #58, #65, #67), admin access (#110).
- Pipeline: oracle runners (#14, #63, #64), gap-fill and enrich (#24, #25, #27, #70, #77), topic tracks slices 1 to 3 and 5 (#71, #72, #74, #79, #91, #92), hardening (#73, #81, #86).
- Password sign-in, plan Stage 7 complete (spec #85): #88, #89, #90, #93, #97, #99, #104, #106, #107, #109, #100.
- Admin access (owner request 2026-10-05): `users.is_admin` set only in the database; `/v1/admin/access` lets an admin grant or revoke paid banks for their own account; purchases always win (an admin toggle never revokes a `revenuecat` row; a refunded purchase may be re-granted as `admin`).
- Tests: Playwright e2e against the real API and Postgres (#60), A/B cards for every bank (#61), CodeBlock tests (#101).

## Pending

1. **Topic tracks, slices 4 and 6** (`docs/superpowers/plans/2026-10-04-topic-tracks.md`): Backend and Frontend Security content. Gap-fill ran in the `backend-track` and `frontend-track` worktrees. Frontend oracles run on jsdom and must print synchronously (#92). Decide the pending disputed cards first (#79 LOW).
2. **Owner, outside the repo:**
   - RevenueCat: create the Web Billing products, give the key "Apps: read"; then the agent wires entitlements, offering, webhook, and `REVENUECAT_WEBHOOK_AUTH` (the last stub on the servers). Topic tracks need four more products, `syntactical.{backend,frontend}-security.{medium,hard}` (#68).
   - PostHog: create the Syntactical organization; then the agent creates the project and wires the keys.
   - Store accounts and the device checklist (IAN-595: no EAS builds have run).
3. **Owner review:**
   - 9 readability A/B cards await human approval (#61). An agent must not set `isHumanReviewed`.
   - The privacy and deletion pages still carry `[OWNER NAME]`, `[CONTACT EMAIL]`, and `[EFFECTIVE DATE]` (#59).
4. **LOW review findings, ticketed:** IAN-634 (Settings password form), IAN-635 (admin server), IAN-636 (admin page), IAN-637 (auth and admin UI). Notable: the admin page lists never refetch on revisit, and the switch focus ring is unconfirmed in a browser.
5. **Carried over:** IAN-596 (Lighthouse, VoiceOver, reduced motion on the live site); monetization is per-bank products (#36, #37, #52) with no decision record.

## Next session

- Start from `main`. Run `git log -1 origin/main` and confirm this handoff is the one you are reading.
- Process: one general and one security review per high-risk PR; ticket LOWs, never fix them after the security review; no scope added mid-PR; flag past about 90 minutes per task (`feedback-rapid-process` memory).
- Gotchas:
  - GitHub can stop syncing a PR to new pushes (#104 merged a stale head). Before merging, compare `gh api repos/nullvoidundefined/syntactical/pulls/<n> --jq .head.sha` with `git ls-remote origin refs/heads/<branch>`, and merge with `--match-head-commit`.
  - GitGuardian flags names like `mockSignInWithPassword = ...` and keeps flagging the old commit after a rename (incidents 37869767, 37871242 are false positives; the check is not required).
  - Production SQL: read `neonctl connection-string main --project-id rough-paper-04073210 --ssl verify-full` into a variable, append `&sslrootcert=/etc/ssl/cert.pem` (local psql 14), and guard one-row updates in a DO block.
  - The local web build fails to resolve `@syntactical/content-schema` in a fresh worktree; visual checks happen on the live site after merge.
  - Run `~/.claude/hooks/harness-sync.sh </dev/null` by hand; without the redirect it waits on stdin.
  - `tdd.sh amend` cannot re-prove RED once the implementation exists.
  - Railway rejects BuildKit secret mounts, `railway up` needs `--path-as-root`, and service settings live in Railway (#58, #65, #67).
  - Docker-backed tests and e2e need `DOCKER_CONFIG=/tmp/dcfg`. A stale Metro cache in `$TMPDIR` can bake production URLs into local e2e runs (#60, #76).
  - Check `pgrep -fl "src/cli.ts"` before starting a pipeline run on the shared content root.
  - macOS `sed` has no `\|` alternation; use `sed -E`. A guard blocks force pushes: push a rebased branch under a new name.
  - The pipeline needs Node 22.18 or later (#86).
