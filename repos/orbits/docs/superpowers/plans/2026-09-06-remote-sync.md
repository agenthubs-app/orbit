# Remote Sync Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the merge and verification checkpoints. Independent test reconciliation may use scoped agents.

**Goal:** Merge the reviewed remote `chat-agent` state into an isolated local branch without losing either branch's behavior or the user's uncommitted work.

**Architecture:** Merge local `862cb54b4fe466c31119a31054af7e7139ac3c9f` with remote `49fe4909bda2344daf61950b6a6ddea31f85d6d5`. Preserve the local task/reminder and inbox-detail flows while integrating remote durable notification delivery and Agent execution. Keep the original dirty checkout unchanged.

**Tech Stack:** Git worktree, TypeScript, Node test runner, Next.js, Expo.

**Spec:** The user approved the preceding review and isolated integration approach on 2026-09-06. This is an integration task, not a redesign or a deployment request.

## Global Constraints

- No push, deployment, production migration, live email, real push delivery, or model call.
- The main checkout and its uncommitted theme/reading-canvas work remain untouched.
- Preserve both parents' functional changes; do not resolve files wholesale with ours/theirs.
- Do not downgrade the local Expo notification dependency or weaken type checks.
- Only resolve merge conflicts and demonstrated integration regressions. Report unrelated failing checks separately.
- Run GitNexus impact before manually changing functions; run change detection before committing.
- Database tests may use isolated local test data only. Missing prerequisites and skips are not passes.

## Task 1: Protect Work And Establish Baseline

**Files:** Git metadata and temporary backup/test output outside the app.

- [x] Create a backup branch at the local parent, a binary diff, and an archive of modified/untracked non-ignored files.
- [x] Create `integration/remote-sync-20260907` in the existing ignored worktree directory.
- [x] Install each app's exact existing lockfile dependencies without modifying lockfiles.
- [x] Run both type checks, all mobile tests, and targeted Web reminder/notification/contract/conflicting-page tests.
- [x] Diagnose any unexpected baseline failure before moving into the merge; do not silently proceed past an unresolved failure gate.

Baseline: both type checks passed; mobile 732/732 passed. The Web subset initially
had one stale Chinese-label test. Its three expectations were aligned with the
existing localized live-contact behavior, without changing production code.
The rerun passed 35 tests with zero failures; one PostgreSQL race test was explicitly
skipped because this isolated checkout had no database configuration.

## Task 2: Merge Dependencies And Shared Contracts

**Files:** Both apps' `package.json` and `package-lock.json`; Web `shared/contract/index.ts`; mobile generated contract copies.

- [ ] Run `git merge --no-commit --no-ff 49fe4909bda2344daf61950b6a6ddea31f85d6d5` in the integration worktree.
- [ ] Preserve local scripts and add remote scripts/dependencies; retain `expo-notifications: ~57.0.15`.
- [ ] Export both task/reminder and durable-notification types from the Web contract barrel.
- [ ] Run the existing mobile `npm run sync:contract`; never hand-edit generated copies.
- [ ] Regenerate lockfiles from the resolved package objects, install, and verify contract/domain/schema sync tests.

## Task 3: Preserve Mobile Notification And Inbox Behavior

**Files:** Mobile `app/_layout.tsx`, `src/api/AuthSessionProvider.tsx`, `src/components/OrbitNotificationsCoordinator.tsx`, `src/notifications/*`, `src/screens/inbox/RelationshipInboxScreen.tsx`, and their targeted tests.

- [ ] Inspect both notification lifecycles and map local reminder vs durable delivery responsibilities.
- [ ] Add failing regressions for the exact integration boundary before changing behavior: one notification handler, both payload forms, device registration respecting explicit opt-in, and logout cleanup covering both existing registrations.
- [ ] Preserve local reminder scheduling/cancellation and local inbox detail routes; add remote delivery-card handling without restoring removed inline conversation state.
- [ ] Keep actor scoping, failure visibility, cold-start response handling, and account-switch cleanup. Do not make notification views complete tasks.
- [ ] Run the notification/auth/inbox tests and full mobile type check; review integration changes independently.

## Task 4: Reconcile Conflicting Tests

**Files:** Web `tests/pages/app-agent-contact-recommendations.test.tsx`; `tests/services/event-canonical-membership-migration-apply-repository.test.ts`, `event-canonical-membership-migration-ledger-postgres.test.ts`, `event-canonical-membership-operator-cli-postgres.test.ts`, `event-profile-contract-repair-operator-cli-postgres.test.ts`, and `postgres-live-record-storage.test.ts`.

- [ ] Combine both parents' assertions and fixture isolation; retain typed real-module imports and robust cleanup.
- [ ] Keep the new migration wait/failure-stop and SQL-version assertions.
- [ ] Verify affected tests with isolated database prerequisites when available; preserve explicit skip reasons otherwise.

## Task 5: Verify And Record The Local Merge

**Files:** Integration documentation and only demonstrated regression fixes within the changed app surfaces.

- [ ] Scan for remaining conflict markers and verify neither parent was accidentally dropped.
- [ ] Run Web and mobile type checks, full test suites, and the Node 22 Web production build.
- [ ] Compare failures to parent evidence; fix integration regressions with failing-test evidence and keep unrelated gaps visible.
- [ ] Review the resolved merge, run GitNexus change detection, and create a two-parent local merge commit only after required checks pass.
- [ ] Verify the original branch and dirty checkout remain intact; deliver the integration branch/worktree and exact verification limitations. No remote integration is authorized.
