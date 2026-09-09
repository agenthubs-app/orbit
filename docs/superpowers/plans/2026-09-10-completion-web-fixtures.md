# Completion Web Fixture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the intended isolated Web tests independent of ambient database configuration while preserving real database/security coverage.

**Architecture:** Inject the existing in-memory notification delivery implementation into mock scheduler tests. Scope environment changes to tests that explicitly exercise mock or unconfigured runtimes, using the repository's save/delete/restore pattern.

**Tech Stack:** TypeScript, node:test, existing storage and authentication services, PostgreSQL test database.

**Spec:** Approved completion design in the 2026-09-09 conversation: fix fixtures and audits without weakening behavior, then complete native features and verification. This plan covers test-fixture repair only.

## Global Constraints

- Work only in `/Users/xzhao/Projects/orbit/.worktrees/remote-sync-20260907`; preserve the main worktree's uncommitted changes.
- Preserve actor isolation, fail-closed authentication, notification revocation, and explicit user confirmation for external actions.
- Run GitNexus upstream impact before editing every existing symbol; report HIGH/CRITICAL risk before editing. Use `orbit-remote-sync`.
- Use apply_patch for manual edits and record failing behavior before repair. No production credentials, database writes, email, model calls, or deployment.
- Database verification may use only the previously created local scratch database `orbit_merge_verify_20260907_c45a` on `127.0.0.1:5432`, workspace `test:remote-sync-20260907`, with an environment whitelist excluding credentials.
- Do not change production source, skip tests, weaken result assertions, expand route whitelists, or modify unrelated user work.
- Implementers own only the listed Web test files. Controller owns staging/commits and report artifacts.

### Task 1: Isolate Mock, Unconfigured, and Environment Restoration Fixtures

**Files:** Modify only:
- `repos/orbits/tests/capabilities/agent-actor-brief-boundaries.test.ts`
- `repos/orbits/tests/capabilities/agent-pre-event-brief-delivery.test.tsx`
- `repos/orbits/tests/pages/mobile-auth-routes.test.ts`
- `repos/orbits/tests/capabilities/orbit-ai-trace-debug.test.ts`
- `repos/orbits/tests/pages/app-party-live-route-services.test.ts`
- `repos/orbits/tests/capabilities/business-card-scan-ocr-live-store.test.ts`

**Interfaces:** `createAgentSchedulerRouteHandler` accepts `deliveryForActor(actorId)`. `createStorageNotificationDeliveryService` accepts `{ actorId, store, workspaceId }`. `createMemoryLiveRecordStore()` provides the real local store. Production DB URL precedence is `ORBIT_EVENT_DATABASE_URL`, `ORBIT_LIVE_DATABASE_URL`, `ORBIT_DATABASE_URL`.

- [ ] Reproduce the six known DB-configured fixture failures with the listed files. Confirm the two OCR API failures when DB variables are absent. Use sanitized environment; provider responses in these tests are local fixtures, not real credentials.
- [ ] Run upstream impact on each changed named helper, and file-level impact for anonymous test callbacks.
- [ ] In the two successful scheduler-route tests, add an explicit `deliveryForActor`. Create fresh real memory-backed delivery state per actor/test. In the actor-binding test, record `delivery:<actor>` alongside collector/runtime and update the exact expected call ordering to match the handler. In the candidate test, assert the resolved actor equals the fixture actor. Retain every existing identity rejection and generated-brief assertion.

```ts
deliveryForActor(actorId) {
  return createStorageNotificationDeliveryService({
    actorId,
    store: createMemoryLiveRecordStore(),
    workspaceId: "test:scheduler-delivery",
  });
},
```

- [ ] In `mobile-auth-routes.test.ts`, add the three DB variables to the existing `previousEnv` map, delete them before mock auth modules are loaded, and restore with the existing `after` loop. Leave production Auth.js session revocation untouched. Existing cookie acceptance and OAuth broker/exchange assertions must pass in this explicitly mock file; real password reset/revocation tests remain enabled separately.
- [ ] In the first trace-debug test only, save the three DB env values, delete them in its try block, and restore them in its finally block. Keep exact local storage identity, graph, provider response queue, and trace assertions. The separate live-trace-store test must still verify `orbit_records` with a database.

```ts
const keys = ["ORBIT_EVENT_DATABASE_URL", "ORBIT_LIVE_DATABASE_URL", "ORBIT_DATABASE_URL"] as const;
const previousDatabaseEnv = new Map(keys.map((key) => [key, process.env[key]]));
// Inside the existing try block, before importing the configured route:
for (const key of keys) delete process.env[key];
// Inside the existing finally block:
for (const [key, value] of previousDatabaseEnv) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
```

- [ ] In the Party test named `party keeps a sourced event pending until event operations are configured`, use the existing `withUnconfiguredLiveParty` helper and remove the contradictory explicit `mode: "mock"` argument. Preserve pending state, event-specific recovery link, and `EVENT_OPERATIONS_NOT_CONFIGURED` evidence checks.
- [ ] In the OCR test file's existing finally blocks, restore absent environment values by deleting the property instead of assigning JavaScript undefined, which becomes the string `"undefined"` in `process.env`. Limit changes to the existing captured module/feature/database/provider variables. Use the established explicit branch or a small same-file restore helper if it removes repeated logic; do not add a cross-project environment abstraction.

```ts
if (previousEventDatabaseUrl === undefined) delete process.env.ORBIT_EVENT_DATABASE_URL;
else process.env.ORBIT_EVENT_DATABASE_URL = previousEventDatabaseUrl;
```

- [ ] Run all six files without all three DB variables and with the owned local DB configured; require zero failures and zero skips in both focused runs. Also run `tests/capabilities/notification-delivery-ledger.test.ts`, `tests/capabilities/password-reset.test.ts`, and `tests/capabilities/orbit-ai-live-trace-store.test.ts` with the database to protect durable actor/security behavior. Use `rg --files` to confirm these paths before running; do not silently omit an unavailable guard.
- [ ] Run Web full `npm run typecheck`, not only app-source typecheck, since these edits are tests.
- [ ] Self-review and report changed paths, impact summaries, exact red/green commands and counts, and any unresolved failure. Leave staging/commit to the controller.

### Task 2: Review and Verify the Fixture Checkpoint

**Files:** Controller report/plan updates; no additional feature scope.

**Interfaces:** Task 1 produces environment-independent focused tests and retains configured-database security tests.

- [ ] Obtain independent spec-compliance and code-quality review of Task 1; repair required findings and rerun the named covering checks.
- [ ] Run the complete Web suite with a sanitized environment and the owned database. Enable `ORBIT_RUN_POSTGRES_SMOKE=1` and `ORBIT_LIFECYCLE_TEST_DATABASE_URL` pointing only to that local database. Record all remaining audit failures explicitly.

```sh
env -i PATH="$PATH" HOME="$HOME" USER="$USER" TMPDIR="$TMPDIR" LANG=en_US.UTF-8 \
  ORBIT_EVENT_DATABASE_URL=postgresql://xzhao@127.0.0.1:5432/orbit_merge_verify_20260907_c45a \
  ORBIT_LIFECYCLE_TEST_DATABASE_URL=postgresql://xzhao@127.0.0.1:5432/orbit_merge_verify_20260907_c45a \
  ORBIT_WORKSPACE_ID=test:remote-sync-20260907 ORBIT_RUN_POSTGRES_SMOKE=1 \
  node --test --test-concurrency=4 --import tsx 'tests/**/*.test.{ts,tsx}'
```

- [ ] Run `git diff --check`, GitNexus change detection, then commit only reviewed fixture repairs and relevant plan records. Continue to audit/native phases; this checkpoint is not overall completion.

## Fixture Checkpoint Evidence

Task 1 independent review: spec compliant and quality approved, no findings.
Final whole-checkpoint review: approved for scoped local commit, no findings.
GitNexus change detection: six test files, 14 mapped symbols, zero affected flows,
LOW risk. Future audit/native plans are excluded from this checkpoint's commit.
Exactly six test files changed; no production source or skip predicates changed.
Focused matrix: offline 57/57 and configured database 57/57, both zero skips.
Named guards: 16/16, zero skips. Password-reset/session revocation exercises
PostgreSQL; the trace guard injects memory storage and only proves its live-record
contract, not a PostgreSQL trace read. Real trace readback remains outstanding.
Full Web typecheck and diff check passed.

Complete Web run: 2714 tests, 2707 passed, seven failed, zero skipped. All remaining
failures are in the two audit suites: stale DataCard route expectation, sign-out
replay evidence, home query parameters, status-button semantics, missing runtime
coverage, starfield ownership, and manifest P0 candidates. This is not overall
completion or a green full-suite claim. The two historical offline OCR failures
did not reproduce on this base; Node's undefined-to-string environment coercion
was independently reproduced and the restore branches corrected.

## Historical Baseline

Before merge-test repairs, the 2026-09-10 database run had 2708 tests: 2686 passed, 21 failed, one smoke test skipped. Eight failures belong to the separate merge-regression plan, six to this plan, and seven to audit repair. The correct smoke flag was subsequently verified by a focused 2/2 passing event-experience migration run. Offline mode additionally exposed two OCR failures from incorrectly restored database environment variables.
