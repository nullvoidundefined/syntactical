# User Stories Index

This index lists the user story files for Syntactical, one file per product area, and the ID prefix each file uses.

| Area    | File                     | Story IDs                            |
| ------- | ------------------------ | ------------------------------------ |
| Quiz    | [quiz.md](quiz.md)       | `US-QUIZ-001` to `US-QUIZ-007`       |
| Content | [content.md](content.md) | `US-CONTENT-001` to `US-CONTENT-005` |

Each story has an As / I want to / So that statement, an acceptance-criteria checklist, and the tests that cover it. The two files cover the guest quiz and the content path; accounts, sync, purchases, review rounds, and progress have no story file, and `docs/feature-list/features.md` lists them with their tests instead.

The end-to-end suite is Playwright under `e2e/` (`npm run e2e`, `.github/workflows/e2e.yml`): seven specs against a real API and a throwaway Postgres, `accountDeletion`, `apiOutage`, `appBarLayout`, `guestRound`, `keyboardNavigation`, `modalOverlays`, and `signInSync` (`e2e/specs/`). A story names the spec that covers it when one does; otherwise it names the Jest or Vitest files.
