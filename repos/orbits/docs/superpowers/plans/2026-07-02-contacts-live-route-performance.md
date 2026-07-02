# Contacts Live Route Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `/app/contacts` and `/app/contacts/[id]` live-mode load time by replacing redundant full-graph reads with focused graph reads shaped to each route.

**Architecture:** Keep the existing full-graph provider APIs for compatibility, then add optional focused provider methods that services use when available and fall back from when absent. The contacts detail route gets a live-only fast path that loads one focused graph and reuses it across contact detail, connection evidence, and relationship value scoring; mock and hybrid composition stays unchanged.

**Tech Stack:** Next.js app route services, TypeScript, Node test runner with `tsx`, GitNexus impact analysis, existing live record storage providers.

## Global Constraints

- Do not implement until the user explicitly resumes implementation.
- Work inside this app repo only; use app-relative paths and do not edit parent directories.
- Do not touch unrelated dirty worktree changes.
- Before editing any function, class, or method, run GitNexus impact for that symbol and record the risk.
- Stop and report before editing if GitNexus returns `HIGH` or `CRITICAL` risk.
- Use TDD: add failing tests first, verify red, implement minimal code, verify green.
- Preserve live safety flags: no writes, no notifications, no external side effects.
- Preserve existing mock and hybrid behavior.
- Keep `readContactGraph()` and `readConnectionEvidenceGraph()` compatible.
- Run `gitnexus_detect_changes(scope: "staged")` before committing.

---

## Current Worktree Note

At planning time, the worktree already contains uncommitted contacts live optimization edits. Treat them as an implementation draft, not verified completion.

Before execution, inspect and classify these modified files:

- `app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts`
- `app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/LIVE_IMPLEMENTATION.md`
- `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts`
- `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md`
- `docs/architecture/modules/contacts.md`
- `features/analysis/live-value-service.ts`
- `features/analysis/storage/relationship-value-live-record-provider.ts`
- `features/connections/live-service.ts`
- `features/connections/storage/connection-live-record-provider.ts`
- `features/contacts/live-detail-service.ts`
- `features/contacts/live-service.ts`
- `features/contacts/storage/contact-live-record-provider.ts`
- `tests/capabilities/connection-live-store.test.ts`
- `tests/capabilities/contact-detail-live-store.test.ts`
- `tests/capabilities/contacts-live-store.test.ts`
- `tests/capabilities/relationship-value-live-store.test.ts`
- `tests/pages/app-contact-detail-live-route-services.test.ts`
- `tests/pages/app-contacts-live-route-services.test.ts`

The `contacts-route-view-model.ts` change adds service injection to `loadAppContactsRouteViewModel`. If GitNexus impact is `HIGH` or `CRITICAL`, remove that draft path from the implementation plan and keep list-route tests at the capability/provider layer instead.

## File Structure

- `features/contacts/live-service.ts`: service-facing contacts graph provider interface and list query orchestration.
- `features/contacts/live-detail-service.ts`: contact detail service graph loading.
- `features/contacts/storage/contact-live-record-provider.ts`: storage-backed full and focused contacts graph reads.
- `features/connections/live-service.ts`: service-facing connection evidence provider interface and connection lookup orchestration.
- `features/connections/storage/connection-live-record-provider.ts`: storage-backed full and focused connection/evidence graph reads.
- `features/analysis/live-value-service.ts`: relationship value scoring graph loading.
- `features/analysis/storage/relationship-value-live-record-provider.ts`: relationship value provider wrapper around connection graph reads.
- `app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts`: live-only shared graph fast path for contact detail route.
- `tests/capabilities/*.test.ts`: provider and service query-shape tests.
- `tests/pages/app-contact-detail-live-route-services.test.ts`: route-level shared graph behavior.
- `docs/**/LIVE_IMPLEMENTATION.md` and `docs/architecture/modules/contacts.md`: implementation notes.

---

### Task 1: Baseline And Impact Gate

**Files:**
- Read: all files listed in "File Structure"
- Modify: none

**Interfaces:**
- Consumes: existing code and current dirty diff
- Produces: written impact notes for each symbol that will be edited

- [ ] **Step 1: Confirm repo boundary and dirty state**

Run:

```bash
pwd
git status --short --branch
git diff --name-only -- .
```

Expected:

```text
/Users/xzhao/Projects/orbit/repos/orbits
```

Only files inside the app repo may be edited or staged.

- [ ] **Step 2: Refresh GitNexus index if stale**

Run impact checks before edits. If any GitNexus tool reports a stale index, run:

```bash
npx gitnexus analyze
```

- [ ] **Step 3: Run impact for planned symbols**

Run GitNexus impact before editing these symbols:

```text
createStorageContactGraphProvider
createLiveContactsListSearchAndFilterService
runLiveContactsQuery
createLiveContactDetailTagStatusService
loadPayload
createStorageConnectionEvidenceProvider
createLiveConnectionEvidenceService
graphOrFailure
createLiveRelationshipValueScoringService
payload
createStorageRelationshipValueProvider
createConfiguredStorageRelationshipValueProvider
loadAppContactDetailRoute
```

Expected: proceed only for `LOW` or `MEDIUM` risk. Stop and report before changing any `HIGH` or `CRITICAL` symbol.

---

### Task 2: Contacts List Focused Read Tests

**Files:**
- Modify: `tests/capabilities/contacts-live-store.test.ts`

**Interfaces:**
- Consumes: `createMemoryLiveRecordStore`, `createStorageContactGraphProvider`, `createLiveContactsListSearchAndFilterService`
- Produces: test proving list route/service reads only evidence needed for listed contacts

- [ ] **Step 1: Add the failing test**

Add a test with this assertion shape:

```ts
test("live contacts search reads only evidence needed for listed contacts", async () => {
  const workspaceId = "workspace:contacts-focused-list";
  const rawStore = createMemoryLiveRecordStore<Record<string, unknown>>();
  const listQueries: Array<LiveRecordListQuery & { returnedRowCount?: number }> = [];
  const store = {
    ...rawStore,
    listRecords(query: LiveRecordListQuery) {
      const rows = rawStore.listRecords(query);
      listQueries.push({
        ...query,
        recordIds: query.recordIds ? [...query.recordIds] : undefined,
        returnedRowCount: rows.length,
      });
      return rows;
    },
  };

  await seedGeneratedRelationshipFixturesIntoLiveStore({
    now: () => "2026-07-02T12:00:00.000Z",
    store: rawStore,
    workspaceId,
  });

  const service = createLiveContactsListSearchAndFilterService({
    provider: createStorageContactGraphProvider({
      sourceLabel: "Focused contacts storage",
      store,
      workspaceId,
    }),
  });

  const result = await service.searchContacts({ query: "North Star Foods" });

  assert.equal(result.success, true);

  const evidenceQuery = listQueries.find(
    (query) => query.collectionName === "evidence",
  );
  assert.ok(evidenceQuery);
  assert.ok(evidenceQuery.recordIds);
  assert.ok(evidenceQuery.recordIds.length > 0);
  assert.ok(
    (evidenceQuery.returnedRowCount ?? 0) < defaultMockFixtures.evidence.length,
  );
});
```

- [ ] **Step 2: Verify red**

Run:

```bash
node --test --import tsx tests/capabilities/contacts-live-store.test.ts
```

Expected before implementation: failure because the evidence query is full graph or lacks `recordIds`.

---

### Task 3: Contact Detail Focused Read Tests

**Files:**
- Modify: `tests/capabilities/contact-detail-live-store.test.ts`

**Interfaces:**
- Consumes: `createLiveContactDetailTagStatusService`, `createStorageContactGraphProvider`
- Produces: test proving contact detail loads one selected contact graph

- [ ] **Step 1: Add focused detail test**

Add assertions that capture `listRecords` calls and require:

```ts
assert.deepEqual(contactQuery?.recordIds, ["contact-selected"]);
assert.ok(evidenceQuery?.recordIds);
assert.ok(evidenceQuery.recordIds.length > 0);
assert.ok((evidenceQuery.returnedRowCount ?? 0) < totalEvidenceCount);
```

Use one selected contact and one unrelated contact in the same memory live store.

- [ ] **Step 2: Verify red**

Run:

```bash
node --test --import tsx tests/capabilities/contact-detail-live-store.test.ts
```

Expected before implementation: failure because contact detail still loads the full contacts graph.

---

### Task 4: Connection And Relationship Value Focused Read Tests

**Files:**
- Modify: `tests/capabilities/connection-live-store.test.ts`
- Modify: `tests/capabilities/relationship-value-live-store.test.ts`

**Interfaces:**
- Consumes: `createLiveConnectionEvidenceService`, `createLiveRelationshipValueScoringService`
- Produces: tests proving connection and relationship value scoring read selected connection graph only

- [ ] **Step 1: Add connection focused test**

Required assertions:

```ts
assert.deepEqual(connectionQuery?.recordIds, ["connection-selected"]);
assert.ok(evidenceQuery?.recordIds);
assert.ok((evidenceQuery.returnedRowCount ?? 0) < totalEvidenceCount);
```

- [ ] **Step 2: Add relationship value focused test**

Required assertions:

```ts
assert.deepEqual(connectionQuery?.recordIds, ["connection-selected"]);
assert.ok(evidenceQuery?.recordIds);
assert.ok((evidenceQuery.returnedRowCount ?? 0) < totalEvidenceCount);
```

- [ ] **Step 3: Verify red**

Run:

```bash
node --test --import tsx tests/capabilities/connection-live-store.test.ts tests/capabilities/relationship-value-live-store.test.ts
```

Expected before implementation: failures because both paths still use full graph reads.

---

### Task 5: Add Focused Contacts Provider API

**Files:**
- Modify: `features/contacts/live-service.ts`
- Modify: `features/contacts/storage/contact-live-record-provider.ts`
- Modify: `features/contacts/live-detail-service.ts`

**Interfaces:**
- Produces:

```ts
readContactGraphForList?(
  input?: ContactsListSearchFilterInput,
): Promise<LocalRemoteContactGraph>;

readContactGraphForContact?(
  contactId: string,
): Promise<LocalRemoteContactGraph>;
```

- [ ] **Step 1: Add optional interface methods**

In `LiveContactsGraphProvider`, keep `readContactGraph()` and add the two optional methods above.

- [ ] **Step 2: Update list service fallback**

In `runLiveContactsQuery`, use:

```ts
const graph = provider.readContactGraphForList
  ? await provider.readContactGraphForList(input)
  : await provider.readContactGraph();
```

- [ ] **Step 3: Update detail service fallback**

In contact detail graph loading, use:

```ts
const graph = provider.readContactGraphForContact
  ? await provider.readContactGraphForContact(input.contactId.trim())
  : await provider.readContactGraph();
```

- [ ] **Step 4: Implement storage focused reads**

In `createStorageContactGraphProvider`, implement:

```ts
readContactGraphForList(input?: ContactsListSearchFilterInput) {
  return readFocusedContactGraph({ mode: "list", input });
}

readContactGraphForContact(contactId: string) {
  return readFocusedContactGraph({ mode: "contact", contactId });
}
```

The focused graph must:

- read contacts with `searchText` for list mode when present;
- read one contact with `recordIds: [contactId]` for detail mode;
- keep only connections touching the visible/selected contact ids;
- read evidence with `recordIds` equal to evidence ids referenced by those connections;
- return the same `LocalRemoteContactGraph` shape as `readContactGraph()`.

- [ ] **Step 5: Verify contacts tests green**

Run:

```bash
node --test --import tsx tests/capabilities/contacts-live-store.test.ts tests/capabilities/contact-detail-live-store.test.ts
```

Expected: all tests pass.

---

### Task 6: Add Focused Connection Provider API

**Files:**
- Modify: `features/connections/live-service.ts`
- Modify: `features/connections/storage/connection-live-record-provider.ts`

**Interfaces:**
- Produces:

```ts
readConnectionEvidenceGraphForConnection?(
  connectionId: string,
): Promise<LiveConnectionEvidenceGraph>;
```

- [ ] **Step 1: Add optional interface method**

Keep `readConnectionEvidenceGraph()` and add `readConnectionEvidenceGraphForConnection`.

- [ ] **Step 2: Update connection lookup fallback**

For `getConnection`, use:

```ts
const graph = connectionId && provider.readConnectionEvidenceGraphForConnection
  ? await provider.readConnectionEvidenceGraphForConnection(connectionId)
  : await provider.readConnectionEvidenceGraph();
```

- [ ] **Step 3: Implement storage focused read**

In `createStorageConnectionEvidenceProvider`, focused read must:

- read selected connection with `recordIds: [connectionId]`;
- read only contacts referenced by that connection;
- read only evidence referenced by that connection;
- return the same `LiveConnectionEvidenceGraph` shape as the full graph method.

- [ ] **Step 4: Verify connection tests green**

Run:

```bash
node --test --import tsx tests/capabilities/connection-live-store.test.ts
```

Expected: all tests pass.

---

### Task 7: Add Focused Relationship Value Graph API

**Files:**
- Modify: `features/analysis/storage/relationship-value-live-record-provider.ts`
- Modify: `features/analysis/live-value-service.ts`

**Interfaces:**
- Produces:

```ts
readRelationshipGraphForConnection?(
  connectionId: string,
): Promise<LiveConnectionEvidenceGraph>;
```

- [ ] **Step 1: Add optional provider method**

Wrap the connection provider focused method when available:

```ts
readRelationshipGraphForConnection(connectionId: string) {
  return connectionProvider.readConnectionEvidenceGraphForConnection
    ? connectionProvider.readConnectionEvidenceGraphForConnection(connectionId)
    : connectionProvider.readConnectionEvidenceGraph();
}
```

- [ ] **Step 2: Update scoring fallback**

In relationship value graph loading, use:

```ts
const graph = provider.readRelationshipGraphForConnection
  ? await provider.readRelationshipGraphForConnection(input.connectionId)
  : await provider.readRelationshipGraph();
```

- [ ] **Step 3: Verify value tests green**

Run:

```bash
node --test --import tsx tests/capabilities/relationship-value-live-store.test.ts
```

Expected: all tests pass.

---

### Task 8: Contact Detail Route Shared Graph Fast Path

**Files:**
- Modify: `app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/contact-detail-route-service.ts`
- Modify: `tests/pages/app-contact-detail-live-route-services.test.ts`

**Interfaces:**
- Consumes: `LiveContactsGraphProvider`, `LiveConnectionEvidenceProvider`, `LiveRelationshipValueProvider`
- Produces: live route fast path that calls one focused graph load and reuses it

- [ ] **Step 1: Add route-level failing tests**

Add tests requiring:

```ts
assert.equal(graphLoads, 1);
assert.equal(model.routeState, "success");
assert.ok(model.contactPayload);
assert.ok(model.connectionPayload);
assert.ok(model.valuePayload);
assert.ok(model.assessment);
assert.ok(model.evidenceTimeline);
```

Also add a missing contact/connection test expecting a controlled `failure` or empty boundary, not an exception.

- [ ] **Step 2: Verify red**

Run:

```bash
node --test --import tsx tests/pages/app-contact-detail-live-route-services.test.ts
```

Expected before implementation: graph load count is greater than one or injected graph is not used.

- [ ] **Step 3: Implement live-only route fast path**

In `loadAppContactDetailRoute`, branch only when:

```ts
resolveModuleMode(mode) === "live"
```

The live path must:

- resolve configured storage provider or return `CONTACT_DETAIL_LIVE_STORE_UNCONFIGURED`;
- call `readContactGraphForContact(contactId.trim())` once when available;
- adapt the loaded graph into contact, connection, and relationship value providers;
- call existing live service mappers;
- return the same `AppContactDetailRouteModel` shape as the existing path.

The mock/hybrid path must keep using `resolveRouteServices(mode)`.

- [ ] **Step 4: Verify route tests green**

Run:

```bash
node --test --import tsx tests/pages/app-contact-detail-live-route-services.test.ts
```

Expected: all tests pass.

---

### Task 9: Avoid High-Impact Contacts List Route Injection

**Files:**
- Inspect: `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/contacts-route-view-model.ts`
- Inspect: `tests/pages/app-contacts-live-route-services.test.ts`

**Interfaces:**
- Produces: decision on whether list route loader injection remains in scope

- [ ] **Step 1: Run impact**

Run GitNexus impact for:

```text
loadAppContactsRouteViewModel
```

- [ ] **Step 2: If risk is HIGH or CRITICAL, remove this draft change from the implementation**

Do not keep the optional `contactsService` injection in `loadAppContactsRouteViewModel` if impact is high. Keep list focused-read verification in `tests/capabilities/contacts-live-store.test.ts` instead.

- [ ] **Step 3: If risk is LOW or MEDIUM, keep only if needed**

Only retain route-loader service injection if it proves product-route behavior that cannot be proven through provider/service tests. Otherwise remove it to keep the change smaller.

---

### Task 10: Documentation Updates

**Files:**
- Modify: `docs/architecture/modules/contacts.md`
- Modify: `features/contacts/contacts-list-search-and-filter-mock/LIVE_IMPLEMENTATION.md`
- Modify: `features/contacts/contact-detail-tag-and-status-mock/LIVE_IMPLEMENTATION.md`
- Modify: `features/connections/connection-and-evidence-service-mock/LIVE_IMPLEMENTATION.md`
- Modify: `features/analysis/relationship-value-scoring-mock/LIVE_IMPLEMENTATION.md`
- Modify: `app/(app)/app/contacts/compose-app-contacts-demo-contact-1-from-previously-approved-mock-first-capabili/LIVE_IMPLEMENTATION.md`
- Modify: `app/(app)/app/contacts/compose-app-contacts-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md`

**Interfaces:**
- Produces: docs describing focused live reads and route shared graph behavior

- [ ] **Step 1: Update notes**

Each touched live note should say:

```text
Live storage keeps the full graph method for compatibility and uses focused graph reads for list/detail paths when the provider supports them. Focused reads filter evidence by referenced ids so unrelated evidence rows are not loaded for route payloads.
```

For the contact detail route note, also say:

```text
In live mode, the route loads one focused contact graph and adapts that graph into the existing contact detail, connection evidence, and relationship value services. Mock and hybrid modes continue to use the normal service composition path.
```

---

### Task 11: Verification

**Files:**
- Modify: none unless tests reveal a defect

**Interfaces:**
- Produces: command evidence proving query shape, route behavior, lint, and full tests

- [ ] **Step 1: Run targeted tests**

Run:

```bash
node --test --import tsx tests/capabilities/contacts-live-store.test.ts tests/capabilities/contact-detail-live-store.test.ts tests/capabilities/connection-live-store.test.ts tests/capabilities/relationship-value-live-store.test.ts tests/pages/app-contacts-live-route-services.test.ts tests/pages/app-contact-detail-live-route-services.test.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 3: Run full test suite**

Run:

```bash
npm test
```

Expected: exit code 0.

- [ ] **Step 4: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output, exit code 0.

- [ ] **Step 5: Runtime measurement**

Search for the investigation measurement script:

```bash
rg "measure|query count|SQL reads|/app/contacts" scripts tests docs -n
find . -maxdepth 4 \( -iname "*measure*" -o -iname "*perf*" -o -iname "*profile*" \)
```

If found, rerun it. Expected:

- `/app/contacts/[id]` live route performs at most 3 SQL reads on normal success.
- `/app/contacts` keeps roughly the same query count but evidence rows drop materially.
- no connection string or secrets are printed.

If no script exists, report that runtime measurement could not be rerun and rely on query-shape tests as the available evidence.

---

### Task 12: Stage, Detect, Commit

**Files:**
- Stage only verified contacts live performance files
- Do not stage parent-directory untracked files

**Interfaces:**
- Produces: one traceable commit

- [ ] **Step 1: Review final diff**

Run:

```bash
git diff --stat
git diff --name-only
```

- [ ] **Step 2: Stage only intended files**

Use explicit paths. Do not use `git add .`.

- [ ] **Step 3: Run GitNexus staged change detection**

Run:

```text
gitnexus_detect_changes(scope: "staged")
```

Expected: changes are limited to contacts/connections/relationship-value live read paths, route composition, tests, and docs.

- [ ] **Step 4: Commit**

Run:

```bash
git commit -m "perf: focus contacts live graph reads"
```

- [ ] **Step 5: Final status**

Run:

```bash
git status --short --branch
```

Expected: branch ahead count increased; unrelated parent-directory untracked files remain unstaged.

---

## Self-Review

- Spec coverage: focused provider methods, shared detail graph, route behavior tests, missing-boundary behavior, mock/hybrid compatibility, safety flags, verification, and GitNexus gates are all mapped to tasks.
- Placeholder scan: no `TBD`, `TODO`, or generic "handle edge cases" placeholders remain.
- Type consistency: focused contact graph methods return `LocalRemoteContactGraph`; focused connection and relationship methods return `LiveConnectionEvidenceGraph`; route fast path adapts the same graph into existing service interfaces.
