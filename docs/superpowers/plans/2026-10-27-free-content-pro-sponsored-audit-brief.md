# Adversarial audit brief: free content, Pro, sponsored cards, and model failover

This is the prompt for an independent, adversarial audit of the plan by a model from a different vendor (OpenAI Codex), so its blind spots are not the planner's. Run it read-only from the repository root once the environment can reach `api.openai.com` and holds an OpenAI credential:

```bash
npm install -g @openai/codex@0.164.0
printenv OPENAI_API_KEY | codex login --with-api-key
codex exec --sandbox read-only --cd "$(git rev-parse --show-toplevel)" --ephemeral \
  --output-last-message codex-audit.md \
  "$(sed -n '/^## Prompt$/,$p' docs/superpowers/plans/2026-10-27-free-content-pro-sponsored-audit-brief.md | tail -n +2)" \
  < /dev/null
```

Stdin is closed so the run cannot wait on input. `codex-audit.md` is the report; it is triaged, not merged as is.

## Prompt

You are auditing an implementation plan adversarially. Your job is to find what is wrong, wasteful, fragile, or tangled, not to praise what works. Assume the planner was optimistic and that parallel writers produced parts that do not fit together. You are in a read-only sandbox: read anything in the repository, run read-only commands (`git`, `grep`, `rg`, `cat`, `sed`, `ls`), and change nothing.

Read these first:

- `docs/superpowers/specs/2026-10-27-free-content-pro-sponsored-design.md` (the design; section 6 is model failover)
- `docs/superpowers/plans/2026-10-27-free-content-pro-sponsored.md` (99 tasks in nine areas; start with "The areas", "Global Constraints", "Review Focus", "How to execute this plan", and "Seams and fixtures", then read every area)
- `docs/audits/2026-10-27-monetization-marketing.md` if it is on this branch (the product reasoning); otherwise skip it
- The source files each task names. Check the plan's claims about the current code against the code. Line numbers in the plan are from commit `6f12b7c`.

Audit along these axes, in this order of weight:

1. **Correctness against the code.** A task that quotes lines that do not exist, names an export or signature the code does not have, or whose RED test would fail for a reason other than the one its Step 2 predicts, or would pass before the implementation. A GREEN step that would not make its own test pass.
2. **Cross-area contradictions.** Two tasks that define the same interface differently, a task that consumes something no earlier task produces, an ordering in "The areas" that leaves CI red longer than the plan admits, or a deletion in one area that a later area still imports.
3. **Security and data handling.** Paths where a purchase grants more than it should or a refund or expiry fails to revoke; webhook ordering and idempotency gaps; the test-only webhook route or the fixture purchase store reachable in production; any place a prompt, learner message, answer, email, token, or SDK error object can reach a log or an error; AdMob or EthicalAds settings that would contradict the privacy labels.
4. **Modularity.** Places where the plan couples things that should be separate, or duplicates logic that should live once: for example the product-id normalisation written on both server and app, `ModelProvider` and the failover breaker, the sponsor feeds (house, direct, EthicalAds, AdMob), `SponsorProvider` versus `useSponsorContent`, the static-render flags (`useIsHydrated` versus `ContentProvider`'s own flag). Propose the module boundary, its interface, and which tasks change. Prefer a shared package or a single seam only where it removes real duplication or a real failure mode; say when duplication is the cheaper choice.
5. **Optimisation.** Tasks that could be merged, split, deleted, or reordered to shorten the critical path or the red window; tests that cost more than they protect; runtime cost (bundle size, first-launch downloads, cold start, the model calls' time budget and token spend); CI cost.
6. **Missing work.** Spec requirements with no task, rollback paths that are absent (a bad content import, a failed Cloudflare cutover, a model switch that degrades answers), migrations without a down path, observability the cutover will need.
7. **Over-engineering.** Anything the plan builds that the product at its current scale does not need (the audit's unit economics are the reference for scale).

Rules for your report:

- Every finding cites evidence: the plan's task id and the quoted plan text, and for claims about the code, `path:line` from this repository. A finding without evidence is not a finding; leave it out.
- Rank findings by severity: `blocker` (the plan as written cannot be executed or ships a defect), `major` (real cost or risk that should change the plan before execution), `minor` (worth a one-line change), `idea` (an optional improvement).
- For each finding give: severity, axis (1 to 7), the tasks affected, what is wrong, a concrete proposed change (which task changes and how, or the new task's title and one-paragraph contents), and the cost of not doing it.
- When you disagree with a decision the plan records as settled (its "Cross-area decisions" section and the spec's "Resolved questions"), say so only with a concrete failure the decision causes.
- Check before you claim. If a task says a test fails at import with a given message, confirm the imported module does not exist at `6f12b7c`. If you could not verify something, say "unverified" and why.
- No em dashes. Plain prose. No praise section.

Format:

```
# Adversarial audit: <date>

## Summary
<five lines at most: the count by severity and the three changes that matter most>

## Findings
### <n>. <title> (<severity>, axis <k>)
- Tasks: <ids>
- Evidence: <plan quotes and path:line>
- Problem: <...>
- Change: <...>
- Cost of not changing: <...>

## Modularization proposal
<the module boundaries you recommend, each with its interface, the tasks it replaces or merges, and the net task count change>

## Verified claims
<the plan claims you checked against the code and found correct, one line each, so the reader knows what was covered>
```
