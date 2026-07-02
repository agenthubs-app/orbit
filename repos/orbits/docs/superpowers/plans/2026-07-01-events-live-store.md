# Events Live Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit `live` mode for the Events CRUD/import capability backed by a live-store provider boundary, without adding calendar/provider import.

**Architecture:** Keep `event-crud-import` behind `features/events/service-factory.ts`. Add a focused live service beside the existing mock/hybrid service and inject a typed provider in tests; keep other Events child capabilities non-live.

**Tech Stack:** TypeScript, Node test runner with `node --test --import tsx`, existing `createModuleServiceFactory`, Events contract result envelopes, local AppError conventions.

## Global Constraints

- This phase only implements `event-crud-import` live mode.
- Calendar Provider Import is out of scope.
- `live` must be explicit and must not fall back to mock or hybrid.
- Missing live-store provider configuration must fail visibly with a controlled Events failure.
- Mock and hybrid database side-effect flags must remain false.
- Live manual creation may set `liveDatabaseWriteExecuted: true` only after a successful provider write.

---

### Task 1: Live Store Tests

**Files:**
- Create: `repos/orbits/tests/capabilities/event-crud-and-import-live-store.test.ts`

**Interfaces:**
- Consumes: `resolveEventCrudAndImportService(mode?: ModuleMode | string)`
- Consumes: future `createLiveEventCrudAndImportService(options?)`
- Produces: failing coverage for live mode registration, unconfigured failure, fake-provider reads, detail, create, and non-calendar provenance.

- [ ] **Step 1: Write failing tests**

Create a test file that asserts:

```ts
const liveResolution = resolveEventCrudAndImportService("live");
assert.equal(liveResolution.success, true);

const unconfigured = createLiveEventCrudAndImportService().listEvents();
assert.equal(unconfigured.success, false);
assert.equal(unconfigured.error.code, "EVENTS_LIVE_STORE_UNCONFIGURED");
```

Add fake provider tests for `listEvents`, `getEvent`, and `createEvent` with
`liveDatabaseWriteExecuted: true` only on the create result.

- [ ] **Step 2: Verify RED**

Run:

```bash
cd repos/orbits && node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts
```

Expected: FAIL because `live-service.ts` does not exist or the factory does not register `live`.

### Task 2: Contract and Live Service

**Files:**
- Modify: `repos/orbits/features/events/event-crud-and-import/contract.ts`
- Create: `repos/orbits/features/events/event-crud-and-import/live-service.ts`

**Interfaces:**
- Produces: `createLiveEventCrudAndImportService(options?: LiveEventCrudAndImportServiceOptions): EventCrudAndImportService`
- Produces: `LiveEventStoreProvider` with `listEvents`, `getEvent`, and `createManualEvent`.

- [ ] **Step 1: Update contract types**

Allow Events CRUD/import database execution flags to be `boolean`, add
`EVENTS_LIVE_STORE_UNCONFIGURED`, and keep all existing mock/hybrid literals
valid.

- [ ] **Step 2: Implement minimal live service**

Implement a live service that:

- returns controlled failure when no provider is configured;
- maps provider rows into `EventRecord`;
- keeps calendar, organizer-feed, network, AI, email, and notification flags false;
- marks create write provenance true only after provider success.

- [ ] **Step 3: Verify GREEN**

Run:

```bash
cd repos/orbits && node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts
```

Expected: PASS.

### Task 3: Factory and Docs

**Files:**
- Modify: `repos/orbits/features/events/service-factory.ts`
- Modify: `repos/orbits/features/events/DESIGN.md`
- Modify: `repos/orbits/docs/architecture/modules/events.md`

**Interfaces:**
- Consumes: `createLiveEventCrudAndImportService`
- Produces: `eventCrudAndImportServiceFactory.availableModes` containing `mock`, `hybrid`, and `live`.

- [ ] **Step 1: Register live constructor**

Add the live constructor only to the `event-crud-import` factory. Do not add
`live` to attendee roster, goal/readiness, encounter, want-connect, or
post-event review.

- [ ] **Step 2: Update feature docs**

Document the Events Live Store versus Calendar Provider Import split and state
which Events child capability is live in this phase.

- [ ] **Step 3: Run targeted docs and factory tests**

Run:

```bash
cd repos/orbits && node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts tests/services/core-service-factories.test.ts
```

Expected: PASS.

### Task 4: Verification

**Files:**
- No source changes unless verification exposes gaps.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: fresh verification evidence.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
cd repos/orbits && node --test --import tsx tests/capabilities/event-crud-and-import-live-store.test.ts tests/capabilities/event-crud-and-import-mock.test.ts tests/services/core-service-factories.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run lint and full suite**

Run:

```bash
cd repos/orbits && npm run lint && npm test
```

Expected: PASS.

- [ ] **Step 3: Run GitNexus change detection**

Run `mcp__gitnexus.detect_changes(scope: "all", repo: "orbit")`.

Expected: changed symbols are limited to Events CRUD/import contracts, service
factory, live-store service, docs, and focused tests.
