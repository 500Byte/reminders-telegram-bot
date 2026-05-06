# Design Doc: Sequential Dependency Updates

- **Date:** 2026-05-06
- **Topic:** Sequential merging of Dependabot PRs
- **Status:** Approved

## Context
The project has 4 open Dependabot PRs in `packages/main`. To ensure stability, we will merge them sequentially, verifying each update with the project's build, lint, and test suites.

## PRs to Update
1.  **#12:** `typescript` (5.9.3 -> 6.0.3)
2.  **#11:** `@typescript-eslint/parser` (^8.56.0 -> ^8.59.2)
3.  **#13:** `vitest` (^4.0.18 -> ^4.1.5)
4.  **#14:** `typedoc` (0.28.17 -> 0.28.19)

## Workflow per PR
1.  **Checkout & Rebase:**
    - Switch to the Dependabot branch.
    - Rebase onto the latest `master`.
2.  **Verification:**
    - `npm install` in `packages/main`.
    - `npm run build` (Type checking).
    - `npm run lint` (Linting).
    - `npm run test` (Unit tests).
3.  **Merge:**
    - If verification passes, merge the PR into `master` using `gh pr merge --merge`.
    - Push the updated `master` to `reminders-origin`.

## Error Handling
If a verification step fails, the update will be paused, and the issue will be reported for manual intervention or specific fixes.
