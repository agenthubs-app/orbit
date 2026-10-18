# R20a S1 Task Drawer Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open a Web task's detail in the new To-do drawer at `?task=<id>` and let its owner edit, save with CAS, or cancel there.

**Architecture:** Keep `TaskListWorkspace` as the task-list owner and reuse the existing kit `Drawer` and `createTasksClient.update`. The legacy detail route already redirects to the list with `task`; selection and closing must synchronize that parameter without leaving the list. A failed or conflicting save keeps the draft and reloads the server detail without silently rebasing it.

**Tech Stack:** Next.js client component, React, TypeScript, existing Orbit 2026 UI kit, Node test runner, Playwright product harness.

**Spec:** `docs/designs/redesign-2026-10/sprints/R20a-task-todo-calendar/PLANNER.md` (§8 Task route and b3 detail) plus user RD-33 decision of 2026-10-19 (S1: new To-do detail drawer, `?task=<id>`, edit/save/CAS/cancel; no independent edit page).

## Global Constraints

- Work only in D-line owned files; preserve the Task `plan` and `memo` slots and shell kit files.
- Each S1 fix has its own path-scoped commit; do not push. Do not run full suites until sprint closure.
- Use existing language copy, token CSS, `Orbit2026Scope`, and `ToastProvider`; no new dependency.
- A task conflict is visible and never overwrites a newer version without a fresh user action.

## Review Focus

- An encoded/non-ASCII task ID in the old route opens the same drawer; route and browser tests cover it.
- A task absent from the current page can still open by direct `?task=`; component test covers it.
- A conflicting save leaves entered text intact and does not retry with a new CAS token automatically; browser test covers it.
- A canceled edit sends no PATCH and restores the displayed server data; component test covers it.
- Account/task changes do not show the prior actor's draft; component test covers it.

---

### Task 1: Detail Drawer and URL

**Files:**
- Modify: `repos/orbits/app/(app)/app/orbit-2026/todo/TaskListWorkspace.tsx`
- Modify: `repos/orbits/app/(app)/app/orbit-2026/todo/task-list.module.css`
- Test: `repos/orbits/tests/pages/task-list-workspace.test.tsx`
- Test: `repos/orbits/tests/pages/task-legacy-detail-route.test.ts`

**Interfaces:** Consume `initialSelectedId` from `TodoTaskSlot` and the existing `Drawer` export. Produce selection/close behavior that sets or removes only `task` in the current `/app/tasks` URL; preserve other query parameters.

- [x] Write tests: clicking a row opens a dialog drawer and sets `task`; direct `initialSelectedId` opens even if no row is on the first page; closing removes `task`; legacy encoded ID redirects to `tab=todo&view=all&task=<decoded id>`.
- [x] Run `node --test --import tsx tests/pages/task-list-workspace.test.tsx tests/pages/task-legacy-detail-route.test.ts` in `repos/orbits`; confirm the new assertions fail for the expected missing behavior. (A test-only CSS-module loader was required; see ledger.)
- [x] Replace the selected-task shell rail with the kit `Drawer` (keep task list and current read/error states); synchronize selection/close with `history.replaceState` and preserve the existing route redirect. Do not make the whole Task page a new editor route.
- [x] Re-run those tests; require all pass. Check a 390-width drawer manually in the product browser harness. (The full 390-width product-browser file passed 10/10.)

### Task 2: Edit, CAS, Conflict, and Cancel

**Files:**
- Modify: `repos/orbits/app/(app)/app/orbit-2026/todo/TaskListWorkspace.tsx`
- Modify: `repos/orbits/app/(app)/app/orbit-2026/todo/task-list.module.css`
- Modify only if needed for empty notes: `repos/orbits/app/(app)/app/tasks/tasks-client.ts`
- Modify only if new copy is required: `repos/orbits/app/(app)/app/orbit-2026/copy/task.ts`
- Test: `repos/orbits/tests/pages/task-list-workspace.test.tsx`
- Test: `repos/orbits/tests/pages/task-list-product-browser.test.ts`
- Test if client changes: `repos/orbits/tests/pages/web-tasks-client.test.ts`

**Interfaces:** `createTasksClient.update(task: TaskView, title: string, notes: string)` sends `expectedUpdatedAt=task.updatedAt`. The form edits only title and notes; date/status controls remain their existing flows.

- [x] Write failing tests: Edit reveals title/notes fields in the drawer; Cancel sends no write; Save sends one `PATCH action=update` with the displayed `updatedAt`, refreshes list/detail and closes edit mode; 409 shows conflict, preserves entered text, refreshes the server detail, and does not auto-resubmit; account/task switch discards the prior draft.
- [ ] Run targeted Node and browser tests, confirming the new cases fail for the expected missing edit path. (The four new component cases were RED before implementation; the browser queue only ran after implementation.)
- [x] Implement the smallest form state in the drawer; disable duplicate submit, validate nonblank title, keep fields on ordinary failure, and use existing mutation/toast conventions. Permit clearing notes only if the existing server contract accepts the empty string; prove it in `web-tasks-client.test.ts` if changed. (Server rejects empty notes, so the existing client restriction remains.)
- [x] Re-run targeted tests plus `npm run typecheck:app`, `npm run lint`, and `npm run copy:qa` in `repos/orbits`. Record any existing baseline failure separately; do not call it passed. (The full copy QA reports 218 existing issues; focused Web copy QA reports 26 elsewhere and no new task issue.)
- [ ] Path-scope commit S1 code and tests as `fix(R20a): restore task drawer editing`; include the plan file in that commit if confirmed, and record the SHA in `REPORT.md`.
