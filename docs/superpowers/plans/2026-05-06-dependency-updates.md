# Dependency Updates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sequentially merge 4 Dependabot PRs (#11, #12, #13, #14) verifying each with build, lint, and tests.

**Architecture:** Sequential branch switching, rebasing, and verification using project scripts.

**Tech Stack:** GitHub CLI (gh), npm, vitest, tsc, eslint.

---

### Task 1: Update TypeScript (#12)

**Files:**
- Modify: `packages/main/package.json` (via merge)

- [ ] **Step 1: Checkout and Rebase PR #12**
Run: `gh pr checkout 12 && git rebase master`
Expected: Branch `dependabot/npm_and_yarn/packages/main/typescript-6.0.3` is at the head of `master`.

- [ ] **Step 2: Install dependencies**
Run: `cd packages/main && npm install`
Expected: `node_modules` updated with TypeScript 6.0.3.

- [ ] **Step 3: Run Verification Suite**
Run: `npm run build && npm run lint && npm run test`
Expected: All checks PASS.

- [ ] **Step 4: Merge PR #12**
Run: `gh pr merge 12 --merge && git checkout master && git pull reminders-origin master`
Expected: PR #12 merged and local `master` updated.

- [ ] **Step 5: Push to remote**
Run: `git push reminders-origin master`

---

### Task 2: Update @typescript-eslint/parser (#11)

**Files:**
- Modify: `packages/main/package.json` (via merge)

- [ ] **Step 1: Checkout and Rebase PR #11**
Run: `gh pr checkout 11 && git rebase master`

- [ ] **Step 2: Install and Verify**
Run: `cd packages/main && npm install && npm run build && npm run lint && npm run test`
Expected: All checks PASS.

- [ ] **Step 3: Merge PR #11**
Run: `gh pr merge 11 --merge && git checkout master && git pull reminders-origin master`

- [ ] **Step 4: Push to remote**
Run: `git push reminders-origin master`

---

### Task 3: Update Vitest (#13)

**Files:**
- Modify: `packages/main/package.json` (via merge)

- [ ] **Step 1: Checkout and Rebase PR #13**
Run: `gh pr checkout 13 && git rebase master`

- [ ] **Step 2: Install and Verify**
Run: `cd packages/main && npm install && npm run build && npm run lint && npm run test`
Expected: All checks PASS.

- [ ] **Step 3: Merge PR #13**
Run: `gh pr merge 13 --merge && git checkout master && git pull reminders-origin master`

- [ ] **Step 4: Push to remote**
Run: `git push reminders-origin master`

---

### Task 4: Update TypeDoc (#14)

**Files:**
- Modify: `packages/main/package.json` (via merge)

- [ ] **Step 1: Checkout and Rebase PR #14**
Run: `gh pr checkout 14 && git rebase master`

- [ ] **Step 2: Install and Verify**
Run: `cd packages/main && npm install && npm run build && npm run lint && npm run test`
Expected: All checks PASS.

- [ ] **Step 3: Merge PR #14**
Run: `gh pr merge 14 --merge && git checkout master && git pull reminders-origin master`

- [ ] **Step 4: Push to remote**
Run: `git push reminders-origin master`
