# Contact Lifecycle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical four-stage relationship lifecycle, validated transition rules, and actor-scoped atomic persistence without switching existing Web or iOS read paths.

**Architecture:** Keep current six-value `RelationshipStage` only as a legacy parser while introducing four-value `ConnectionStage`. Implement a pure transition function over a versioned actor-owned connection and its relationship tasks, then persist its mutation plan through a dedicated memory/Postgres repository with serializable transactions and idempotency receipts. Existing pages, Contacts adapters, and preview routes remain unchanged until the migration/cutover plan.

**Tech Stack:** TypeScript, Node test runner with tsx, PostgreSQL, existing `orbit_records`, existing live database configuration, GitNexus.

**Spec:** `docs/superpowers/specs/2026-08-21-contact-lifecycle-and-filters-design.md`

## Global Constraints

- `ConnectionStage` is exactly `needs_follow_up | active | nurture | archived`.
- Existing Acquisition `ContactDraftStatus` remains `pending_confirmation | confirmed`.
- `captured` and `reviewing` are accepted only by legacy migration parsing; no new business API returns them as relationship stages.
- Contact, Connection, and relationship Task ownership must equal the authenticated actor.
- `needs_follow_up` requires a dated `follow_up` task; `nurture` requires a dated `maintenance` task; `active` requires a non-empty goal; `archived` has no open relationship task.
- Every mutation uses integer versions, `Idempotency-Key`, a request hash, and one atomic transaction.
- Do not change current Web/iOS UI, Contacts read adapters, or live route behavior in this plan.
- Run GitNexus impact analysis before editing every existing symbol and staged change detection before every commit.
- Stage only this plan's files and hunks; preserve all unrelated worktree changes.

---

## File Structure

```text
repos/orbits/shared/contract/source.ts
  Adds the cross-client ConnectionStageCode without removing legacy RelationshipStageCode.
repos/orbits/shared/domain/source-types.ts
  Adds canonical constants/type guard and compile-time contract assertion.
repos/orbits/shared/storage/transactional-postgres.ts
  Provides a small shared query/serializable-transaction runtime backed by pg.Pool.
repos/orbits/features/connections/lifecycle/contract.ts
  Owns aggregate, task, audit, command, error, snapshot, and mutation-plan types.
repos/orbits/features/connections/lifecycle/transition.ts
  Pure invariant validation and stage/task transition logic.
repos/orbits/features/connections/lifecycle/repository.ts
  Repository interface for actor reads and atomic mutation plans.
repos/orbits/features/connections/lifecycle/memory-repository.ts
  Deterministic transactional test implementation with idempotency receipts.
repos/orbits/features/connections/lifecycle/migrations.ts
  Receipt table and actor/task query indexes.
repos/orbits/features/connections/lifecycle/postgres-repository.ts
  Serializable orbit_records mutation implementation with row locks.
repos/orbits/features/connections/lifecycle/service.ts
  Validates commands, hashes requests, applies pure transitions, and maps errors.
repos/orbits/features/connections/lifecycle/service-factory.ts
  Creates memory or configured Postgres services without changing existing factories.
repos/orbits/shared/storage/migrations.ts
  Runs lifecycle schema migration after the base orbit_records schema.
repos/orbits/tests/domain/connection-stage-contract.test.ts
repos/orbits/tests/services/relationship-lifecycle-transition.test.ts
repos/orbits/tests/services/relationship-lifecycle-memory-repository.test.ts
repos/orbits/tests/services/transactional-postgres.test.ts
repos/orbits/tests/services/relationship-lifecycle-migrations.test.ts
repos/orbits/tests/services/relationship-lifecycle-postgres.test.ts
repos/orbits/tests/services/relationship-lifecycle-service.test.ts
```

### Task 1: Canonical Connection Stage Type

**Files:**
- Modify: `repos/orbits/shared/contract/source.ts`
- Modify: `repos/orbits/shared/domain/source-types.ts`
- Create: `repos/orbits/tests/domain/connection-stage-contract.test.ts`

**Interfaces:**
- Produces: `ConnectionStageCode`, `CONNECTION_STAGE_VALUES`, `ConnectionStage`, `isConnectionStage()`, and `ConnectionStageMatchesContract`.
- Preserves: `RelationshipStageCode`, `RELATIONSHIP_STAGE_VALUES`, `RelationshipStage`, and `isRelationshipStage()` for legacy readers.

- [ ] **Step 1: Write the failing contract test**

```ts
import assert from "node:assert/strict";
import test from "node:test";

import {
  CONNECTION_STAGE_VALUES,
  isConnectionStage,
  isRelationshipStage,
} from "../../shared/domain/source-types";

test("connection stages exclude acquisition-only legacy values", () => {
  assert.deepEqual([...CONNECTION_STAGE_VALUES], [
    "needs_follow_up",
    "active",
    "nurture",
    "archived",
  ]);
  assert.equal(isConnectionStage("active"), true);
  assert.equal(isConnectionStage("captured"), false);
  assert.equal(isConnectionStage("reviewing"), false);
  assert.equal(isRelationshipStage("captured"), true);
});
```

- [ ] **Step 2: Run RED**

Run: `cd repos/orbits && node --test --import tsx tests/domain/connection-stage-contract.test.ts`

Expected: FAIL because `CONNECTION_STAGE_VALUES` and `isConnectionStage` are not exported.

- [ ] **Step 3: Add the exact cross-client and domain types**

Add to `shared/contract/source.ts`:

```ts
export type ConnectionStageCode =
  | "needs_follow_up"
  | "active"
  | "nurture"
  | "archived";
```

Add to `shared/domain/source-types.ts`:

```ts
export const CONNECTION_STAGE_VALUES = [
  "needs_follow_up",
  "active",
  "nurture",
  "archived",
] as const;

export type ConnectionStage = (typeof CONNECTION_STAGE_VALUES)[number];

export function isConnectionStage(value: unknown): value is ConnectionStage {
  return includesValue(CONNECTION_STAGE_VALUES, value);
}

export type ConnectionStageMatchesContract = ContractMatches<
  ConnectionStage,
  ConnectionStageCode
>;
```

Import `ConnectionStageCode` alongside the existing contract types. Do not remove or narrow the legacy six-value declarations.

- [ ] **Step 4: Run GREEN and compile-time contract tests**

Run: `cd repos/orbits && node --test --import tsx tests/domain/connection-stage-contract.test.ts tests/domain/contracts.test.ts`

Expected: PASS.

- [ ] **Step 5: Run staged impact detection and commit**

```bash
git add repos/orbits/shared/contract/source.ts repos/orbits/shared/domain/source-types.ts repos/orbits/tests/domain/connection-stage-contract.test.ts
npx gitnexus detect-changes --scope staged --repo orbit
git commit -m "feat(connections): define canonical lifecycle stages"
```

### Task 2: Pure Lifecycle Transition Model

**Files:**
- Create: `repos/orbits/features/connections/lifecycle/contract.ts`
- Create: `repos/orbits/features/connections/lifecycle/transition.ts`
- Create: `repos/orbits/tests/services/relationship-lifecycle-transition.test.ts`

**Interfaces:**
- Consumes: `ConnectionStage`, `SourceReferenceDTO`.
- Produces: `RelationshipConnectionAggregate`, `RelationshipLifecycleTask`, `RelationshipLifecycleAudit`, `RelationshipStageCommand`, `RelationshipTaskCompletionCommand`, `RelationshipLifecycleSnapshot`, `RelationshipLifecycleMutationPlan`, `RelationshipLifecycleError`, `applyRelationshipStageCommand()`, and `applyRelationshipTaskCompletion()`.

- [ ] **Step 1: Write failing invariant tests**

Create fixtures for one actor-owned connection and tasks. Cover these exact cases:

```ts
test("needs follow-up creates a dated follow-up task", () => {
  const result = applyRelationshipStageCommand({
    command: {
      actorId: "account:xiaoyu",
      connectionId: "connection:mina",
      expectedVersion: 3,
      idempotencyKey: "stage:mina:follow-up:v1",
      nextTask: {
        dueAt: "2026-08-25T01:00:00.000Z",
        taskId: "task:mina:follow-up:1",
        title: "发送关西渠道介绍",
      },
      stage: "needs_follow_up",
    },
    current: activeConnection,
    now: "2026-08-21T01:00:00.000Z",
    tasks: [],
  });

  assert.equal(result.connection.stage, "needs_follow_up");
  assert.equal(result.connection.version, 4);
  assert.equal(result.upsertTasks[0]?.purpose, "follow_up");
});
```

Also assert:

- missing/invalid `dueAt` fails for `needs_follow_up` and `nurture`;
- empty `activeGoal` fails for `active`;
- archive fails unless `dismissTaskIds` exactly covers all open relationship tasks;
- a task owned by another actor fails before any mutation plan is returned;
- completing the final follow-up/maintenance task requires next task, active transition, nurture transition, or archive;
- due date passing never changes stage;
- every successful command increments connection version exactly once and changed task versions exactly once.

- [ ] **Step 2: Run RED**

Run: `cd repos/orbits && node --test --import tsx tests/services/relationship-lifecycle-transition.test.ts`

Expected: FAIL because the lifecycle modules do not exist.

- [ ] **Step 3: Define exact canonical shapes**

Use these minimum fields in `contract.ts`:

```ts
export type RelationshipTaskStatus =
  | "open"
  | "scheduled"
  | "completed"
  | "dismissed";

export type RelationshipTaskPurpose = "follow_up" | "maintenance";

export interface RelationshipConnectionAggregate {
  actorId: string;
  activeGoal: string | null;
  connectionId: string;
  contactId: string;
  createdAt: string;
  stage: ConnectionStage;
  updatedAt: string;
  version: number;
}

export interface RelationshipLifecycleTask {
  actorId: string;
  connectionId: string;
  contactId: string;
  createdAt: string;
  dueAt: string;
  purpose: RelationshipTaskPurpose;
  status: RelationshipTaskStatus;
  taskId: string;
  title: string;
  updatedAt: string;
  version: number;
}
```

Define `RelationshipStageCommand` as a discriminated union so `needs_follow_up`/`nurture` require `nextTask`, `active` requires `activeGoal`, and `archived` requires `dismissTaskIds`. Define error codes exactly as `NOT_FOUND | FORBIDDEN | CONFLICT | INVALID_TRANSITION | INVALID_TASK | IDEMPOTENCY_CONFLICT`.

- [ ] **Step 4: Implement pure transitions**

`transition.ts` must normalize non-empty text, parse valid ISO instants, validate ownership and versions, and return new objects without mutating inputs. It must return a `RelationshipLifecycleMutationPlan` containing the next connection, task upserts, task dismissals, and one audit record; it performs no database, network, notification, or AI call.

- [ ] **Step 5: Run GREEN**

Run: `cd repos/orbits && node --test --import tsx tests/services/relationship-lifecycle-transition.test.ts`

Expected: PASS for all transition matrix cases.

- [ ] **Step 6: Detect and commit**

```bash
git add repos/orbits/features/connections/lifecycle/contract.ts repos/orbits/features/connections/lifecycle/transition.ts repos/orbits/tests/services/relationship-lifecycle-transition.test.ts
npx gitnexus detect-changes --scope staged --repo orbit
git commit -m "feat(connections): model lifecycle transitions"
```

### Task 3: Atomic Memory Repository

**Files:**
- Create: `repos/orbits/features/connections/lifecycle/repository.ts`
- Create: `repos/orbits/features/connections/lifecycle/memory-repository.ts`
- Create: `repos/orbits/tests/services/relationship-lifecycle-memory-repository.test.ts`

**Interfaces:**
- Consumes: Task 2 aggregate, task, audit, snapshot, and mutation-plan types.
- Produces: `RelationshipLifecycleRepository`, `RelationshipLifecycleMutationInput`, `RelationshipLifecycleMutationResult`, `MemoryRelationshipLifecycleRepository`, and `createMemoryRelationshipLifecycleRepository(seed)`.

- [ ] **Step 1: Write failing repository tests**

Test actor-scoped reads, version conflicts, atomic rollback when an operation throws, successful task/connection/audit commit, same-key/same-hash replay, and same-key/different-hash conflict.

```ts
const first = await repository.mutate(
  {
    actorId: "account:xiaoyu",
    command: "change_stage",
    connectionId: "connection:mina",
    expectedVersion: 3,
    idempotencyKey: "stage:mina:follow-up:v1",
    requestHash: "hash:request-a",
  },
  (snapshot) => applyRelationshipStageCommand({
    command,
    current: snapshot.connection,
    now,
    tasks: snapshot.tasks,
  }),
);
const replay = await repository.mutate(
  {
    actorId: "account:xiaoyu",
    command: "change_stage",
    connectionId: "connection:mina",
    expectedVersion: 3,
    idempotencyKey: "stage:mina:follow-up:v1",
    requestHash: "hash:request-a",
  },
  () => {
    throw new Error("an idempotent replay must not execute the operation");
  },
);
assert.equal(first.replayed, false);
assert.equal(replay.replayed, true);
```

- [ ] **Step 2: Run RED**

Run: `cd repos/orbits && node --test --import tsx tests/services/relationship-lifecycle-memory-repository.test.ts`

Expected: FAIL because repository modules do not exist.

- [ ] **Step 3: Implement clone-on-read atomic memory state**

Key connections by `actorId + NUL + connectionId`, tasks by `actorId + NUL + taskId`, and receipts by `actorId + NUL + idempotencyKey`. Run the operation against cloned state, verify connection version advances exactly once, then commit all maps together. Store the response snapshot in the receipt. Expose read-only `audits()` and `tasksForActor()` helpers for tests.

- [ ] **Step 4: Run GREEN and transition regressions**

Run: `cd repos/orbits && node --test --import tsx tests/services/relationship-lifecycle-transition.test.ts tests/services/relationship-lifecycle-memory-repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Detect and commit**

```bash
git add repos/orbits/features/connections/lifecycle/repository.ts repos/orbits/features/connections/lifecycle/memory-repository.ts repos/orbits/tests/services/relationship-lifecycle-memory-repository.test.ts
npx gitnexus detect-changes --scope staged --repo orbit
git commit -m "feat(connections): add atomic lifecycle repository"
```

### Task 4: Transaction Runtime and Lifecycle Schema

**Files:**
- Create: `repos/orbits/shared/storage/transactional-postgres.ts`
- Create: `repos/orbits/features/connections/lifecycle/migrations.ts`
- Modify: `repos/orbits/shared/storage/migrations.ts`
- Create: `repos/orbits/tests/services/transactional-postgres.test.ts`
- Create: `repos/orbits/tests/services/relationship-lifecycle-migrations.test.ts`
- Modify: `repos/orbits/tests/services/postgres-live-record-storage.test.ts`
- Modify: `repos/orbits/tests/services/live-record-storage.test.ts`

**Interfaces:**
- Produces: `TransactionalSqlExecutor`, `TransactionalPostgresClient`, `createTransactionalPostgresClient()`, `createConfiguredTransactionalPostgresRuntime()`, `RELATIONSHIP_LIFECYCLE_SCHEMA_SQL`, and `runRelationshipLifecycleMigrations()`.
- Consumes: existing `resolveLiveDatabaseConnectionConfig()` and base `orbit_records` migration.

- [ ] **Step 1: Write failing transaction runtime tests**

Use a fake pool/connection and assert serializable `begin`, operation queries, `commit`, and release on success; `rollback` and release on failure; original operation error wins over rollback failure; empty connection string is rejected.

- [ ] **Step 2: Write failing schema tests**

Assert SQL contains:

```sql
create table if not exists relationship_lifecycle_command_receipts (
  workspace_id text not null,
  actor_id text not null,
  idempotency_key text not null,
  command text not null,
  request_hash text not null,
  response_snapshot jsonb not null,
  created_at timestamptz not null,
  primary key (workspace_id, actor_id, idempotency_key)
);

create index if not exists orbit_records_actor_collection_idx
  on orbit_records (workspace_id, collection_name, user_id);
```

Also require a tasks-only expression index over `user_id`, `payload ->> 'connectionId'`, `payload ->> 'status'`, and `payload ->> 'dueAt'` where `collection_name = 'tasks'`.

- [ ] **Step 3: Run RED**

Run: `cd repos/orbits && node --test --import tsx tests/services/transactional-postgres.test.ts tests/services/relationship-lifecycle-migrations.test.ts tests/services/live-record-storage.test.ts tests/services/postgres-live-record-storage.test.ts`

Expected: FAIL because the runtime/schema exports do not exist and migration call counts are unchanged.

- [ ] **Step 4: Implement the isolated shared runtime**

Copy no Events imports. Define a cached configured runtime keyed by connection string, workspace id, and pool max. Default to a small pool of 2. The transaction method uses a checked-out PoolClient and serializable isolation. Do not alter `LiveRecordStoreLike` or existing Event Operations runtime in this task.

- [ ] **Step 5: Implement and register idempotent schema SQL**

`runOrbitRecordsMigration()` runs base orbit_records SQL, then lifecycle migration, then existing Event Operations migrations. Update exact test call counts and regex assertions. Schema execution remains idempotent.

- [ ] **Step 6: Run GREEN**

Run: `cd repos/orbits && node --test --import tsx tests/services/transactional-postgres.test.ts tests/services/relationship-lifecycle-migrations.test.ts tests/services/live-record-storage.test.ts tests/services/postgres-live-record-storage.test.ts`

Expected: PASS.

- [ ] **Step 7: Detect and commit**

```bash
git add repos/orbits/shared/storage/transactional-postgres.ts repos/orbits/features/connections/lifecycle/migrations.ts repos/orbits/shared/storage/migrations.ts repos/orbits/tests/services/transactional-postgres.test.ts repos/orbits/tests/services/relationship-lifecycle-migrations.test.ts repos/orbits/tests/services/live-record-storage.test.ts repos/orbits/tests/services/postgres-live-record-storage.test.ts
npx gitnexus detect-changes --scope staged --repo orbit
git commit -m "feat(storage): add lifecycle transaction runtime"
```

### Task 5: PostgreSQL Lifecycle Repository

**Files:**
- Create: `repos/orbits/features/connections/lifecycle/postgres-repository.ts`
- Create: `repos/orbits/tests/services/relationship-lifecycle-postgres.test.ts`

**Interfaces:**
- Consumes: Task 3 repository interface, Task 4 `TransactionalPostgresClient`, existing `orbit_records` shape.
- Produces: `createPostgresRelationshipLifecycleRepository({ client, workspaceId })`.

- [ ] **Step 1: Write failing SQL repository tests**

Use a transaction-capable fake executor to verify SQL order and parameters for:

- receipt lookup before aggregate lock;
- `connections` row `FOR UPDATE` constrained by workspace, record id, and actor owner;
- referenced `contacts` ownership check;
- related `tasks` lock constrained by actor and connection id;
- compare-and-swap connection update using payload version;
- task upserts/dismissals, lifecycle audit insert, and receipt insert in the same transaction;
- missing row, actor mismatch, stale version, and duplicate idempotency hash failures perform no writes.

- [ ] **Step 2: Run RED**

Run: `cd repos/orbits && node --test --import tsx tests/services/relationship-lifecycle-postgres.test.ts`

Expected: FAIL because `postgres-repository.ts` does not exist.

- [ ] **Step 3: Implement strict record parsers and SQL mutation**

Parse only canonical actor-owned payloads. Existing connection/task records without `version` may be read as version 1 in this foundation, but every successful write persists explicit versions. Use collection names `connections`, `contacts`, `tasks`, and `relationship_lifecycle_audits`. Store audit bodies without private task text; include actor id, connection id, old/new stage, task ids, source, and timestamp.

- [ ] **Step 4: Run GREEN**

Run: `cd repos/orbits && node --test --import tsx tests/services/relationship-lifecycle-postgres.test.ts tests/services/relationship-lifecycle-memory-repository.test.ts`

Expected: PASS.

- [ ] **Step 5: Detect and commit**

```bash
git add repos/orbits/features/connections/lifecycle/postgres-repository.ts repos/orbits/tests/services/relationship-lifecycle-postgres.test.ts
npx gitnexus detect-changes --scope staged --repo orbit
git commit -m "feat(connections): persist lifecycle mutations"
```

### Task 6: Lifecycle Command Service and Factory

**Files:**
- Create: `repos/orbits/features/connections/lifecycle/service.ts`
- Create: `repos/orbits/features/connections/lifecycle/service-factory.ts`
- Create: `repos/orbits/tests/services/relationship-lifecycle-service.test.ts`
- Modify: `repos/orbits/docs/architecture/modules/connections.md`

**Interfaces:**
- Consumes: Task 2 transitions, Task 3 repository, Task 4 configured runtime, Task 5 Postgres repository.
- Produces: `RelationshipLifecycleService`, `createRelationshipLifecycleService(repository, now)`, `createConfiguredRelationshipLifecycleService()`, `changeStage()`, and `completeTask()`.

- [ ] **Step 1: Write failing service tests**

Assert service validation rejects blank actor/connection/idempotency values and invalid versions before repository calls; hashes canonical command JSON; returns replay metadata; maps repository errors without reporting preview or fake writes; and keeps all external side-effect flags false.

- [ ] **Step 2: Run RED**

Run: `cd repos/orbits && node --test --import tsx tests/services/relationship-lifecycle-service.test.ts`

Expected: FAIL because service modules do not exist.

- [ ] **Step 3: Implement the service boundary**

Use SHA-256 over canonical JSON excluding `idempotencyKey`. `changeStage()` and `completeTask()` load/mutate through the repository and call only pure Task 2 transitions. `createConfiguredRelationshipLifecycleService()` returns null when live database configuration is absent; it does not fall back to memory or preview success.

- [ ] **Step 4: Update Connections architecture documentation**

Document the new canonical lifecycle service, four-stage type, actor ownership, and the fact that current public routes remain on their old behavior until migration/cutover.

- [ ] **Step 5: Run focused and package verification**

Run:

```bash
cd repos/orbits
node --test --import tsx \
  tests/domain/connection-stage-contract.test.ts \
  tests/services/relationship-lifecycle-transition.test.ts \
  tests/services/relationship-lifecycle-memory-repository.test.ts \
  tests/services/transactional-postgres.test.ts \
  tests/services/relationship-lifecycle-migrations.test.ts \
  tests/services/relationship-lifecycle-postgres.test.ts \
  tests/services/relationship-lifecycle-service.test.ts
npm run typecheck
```

Expected: all focused tests pass and TypeScript exits 0. If repository-wide typecheck has unrelated pre-existing failures, record exact output and run a targeted `tsc` over every new/modified source file before reporting this phase.

- [ ] **Step 6: Detect and commit**

```bash
git add repos/orbits/features/connections/lifecycle/service.ts repos/orbits/features/connections/lifecycle/service-factory.ts repos/orbits/tests/services/relationship-lifecycle-service.test.ts repos/orbits/docs/architecture/modules/connections.md
npx gitnexus detect-changes --scope staged --repo orbit
git commit -m "feat(connections): expose lifecycle command service"
```

## Phase Gate

This plan is complete only when:

- all seven focused test files pass;
- `ConnectionStage` excludes `captured/reviewing` while legacy parsing remains intact;
- memory and PostgreSQL repositories prove actor isolation, version conflicts, idempotent replay, and atomic rollback;
- no existing Web/iOS route or presenter is switched to the new service;
- GitNexus staged detection reports only expected connection/storage/test/documentation scope;
- the worktree's pre-existing unrelated files remain unstaged and unmodified by these tasks.
