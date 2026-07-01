# Live Record Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a thin `shared/storage` layer for indexed JSONB Live Records and wire the Events live-store provider through it.

**Architecture:** `shared/storage` owns database-neutral Live Record types, query/write interfaces, SQL migration text, and a small in-memory implementation for tests. Feature providers own DTO mapping; the first provider maps `event-crud-import` live records to the existing Events live service contract.

**Tech Stack:** TypeScript, Node test runner with `node --test --import tsx`, existing Events live service, existing `createModuleServiceFactory`, no runtime database driver dependency in this first slice.

## Global Constraints

- Keep `shared/storage` thin: no feature-specific business rules.
- Keep feature DTO mapping inside feature-owned provider files.
- Do not make Search or Orbit AI read storage directly.
- Do not replace hybrid/local-remote-store in this task.
- Do not require a running Postgres instance for the unit tests.
- Expose Postgres-compatible migration SQL for `orbit_records`.

---

### Task 1: Live Record Store Contract

**Files:**
- Create: `tests/services/live-record-storage.test.ts`
- Create: `shared/storage/live-record-store.ts`
- Create: `shared/storage/migrations.ts`

**Interfaces:**
- Produces: `LiveRecord` typed envelope with `workspaceId`, `collection`, `recordId`, source/provenance fields, timestamps, lifecycle state, search text, and `payload`.
- Produces: `LiveRecordStore` with `listRecords`, `getRecord`, `upsertRecord`, and `deleteRecord`.
- Produces: `createMemoryLiveRecordStore(seed?)`.
- Produces: `ORBIT_RECORDS_SCHEMA_SQL`.

- [ ] **Step 1: Write failing tests**

Add tests that assert an in-memory Live Record store can upsert, list by
collection/workspace, get by record id, soft-delete rows, and preserve payload
clones. Add a schema test that checks `ORBIT_RECORDS_SCHEMA_SQL` includes
`orbit_records`, `collection_name`, `record_id`, `payload jsonb`, source columns,
timestamp columns, and useful indexes.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test --import tsx tests/services/live-record-storage.test.ts
```

Expected: FAIL because `shared/storage/live-record-store.ts` does not exist.

- [ ] **Step 3: Implement minimal storage**

Create `shared/storage/live-record-store.ts` with database-neutral types and an
in-memory implementation. Create `shared/storage/migrations.ts` with a
Postgres-compatible `CREATE TABLE IF NOT EXISTS orbit_records` statement and
indexes for workspace, collection, record id, source, target, occurred time,
updated time, and full-text-ish search text.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test --import tsx tests/services/live-record-storage.test.ts
```

Expected: PASS.

### Task 2: Events Storage Provider

**Files:**
- Create: `features/events/event-crud-and-import/providers/storage-event-provider.ts`
- Modify: `tests/capabilities/event-crud-and-import-live-store.test.ts`

**Interfaces:**
- Consumes: `LiveRecordStore`.
- Produces: `createStorageEventStoreProvider(options): LiveEventStoreProvider`.

- [ ] **Step 1: Write failing Events provider tests**

Extend `event-crud-and-import-live-store.test.ts` with a test that seeds
`createMemoryLiveRecordStore` with an event record and then uses
`createStorageEventStoreProvider` through `createLiveEventCrudAndImportService`.
Assert list/detail/create all work through storage, not a hand-built fake
provider.

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts
```

Expected: FAIL because `storage-event-provider.ts` does not exist.

- [ ] **Step 3: Implement storage provider**

Create a provider that maps `orbit_records` rows in collection `events` to
`LiveEventStoreRecord`, and maps manual creation input back into a Live Record
with a stable event id, source metadata, evidence, search text, and payload.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
node --test --import tsx tests/services/live-record-storage.test.ts tests/capabilities/event-crud-and-import-live-store.test.ts
```

Expected: PASS.

### Task 3: Documentation And Typecheck Coverage

**Files:**
- Modify: `package.json`
- Modify: `docs/architecture/local-remote-database.md`
- Modify: `features/events/event-crud-and-import/LIVE_IMPLEMENTATION.md`

**Interfaces:**
- Consumes: new `shared/storage` files and Events storage provider.
- Produces: lint/typecheck coverage for the new files.

- [ ] **Step 1: Add files to lint command**

Add `shared/storage/live-record-store.ts`,
`shared/storage/migrations.ts`, and
`features/events/event-crud-and-import/providers/storage-event-provider.ts` to
the existing `npm run lint` TypeScript file list.

- [ ] **Step 2: Update docs**

Document that `shared/local-remote-store` remains the hybrid fixture-backed
store, while `shared/storage` is the new Live Record boundary for Local Postgres
and future remote Postgres. Document that Events live can now use the shared
storage provider.

- [ ] **Step 3: Verify**

Run:

```bash
npm run lint
node --test --import tsx tests/services/live-record-storage.test.ts tests/capabilities/event-crud-and-import-live-store.test.ts
```

Expected: PASS.

### Task 4: Full Verification

**Files:**
- No source changes unless verification exposes gaps.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: fresh verification evidence.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
node --test --import tsx tests/services/live-record-storage.test.ts tests/capabilities/event-crud-and-import-live-store.test.ts tests/services/local-remote-store.test.ts tests/services/hybrid-service-factories.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full checks**

Run:

```bash
npm run lint
npm test
```

Expected: PASS.

- [ ] **Step 3: Run GitNexus change detection**

Run `mcp__gitnexus.detect_changes(scope: "all", repo: "orbit")` and confirm
the affected scope matches storage, Events provider wiring, docs, and tests.
