# iOS API Contract And Mobile Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the iOS contacts dashboard's seven reads with one actor-scoped, runtime-validated mobile aggregate response.

**Architecture:** Keep type contracts in `shared/contract`, add canonical Zod schemas in `shared/api-schema`, and copy both into the standalone Expo project. A mobile BFF composes existing services without internal HTTP calls; iOS validates snapshots and network data before handing typed sections to the existing view-model.

**Tech Stack:** TypeScript, Next.js route handlers, React Native/Expo, Zod, Node test runner, PostgreSQL-backed feature services.

**Spec:** `docs/superpowers/specs/2026-08-31-ios-api-contract-mobile-dashboard-design.md`

## Global Constraints

- Preserve existing Web and iOS endpoints during migration.
- Resolve the authenticated actor once and pass the canonical account id into every private feature read.
- Keep `aggregate` required and optional sections independently degradable.
- Validate server output and iOS input with the same canonical schema.
- Preserve all unrelated working-tree changes.

---

### Task 1: Shared runtime schema pipeline

**Files:**
- Create: `repos/orbits/shared/contract/mobile-contacts-dashboard.ts`
- Create: `repos/orbits/shared/api-schema/mobile-contacts-dashboard.ts`
- Modify: `repos/orbits/shared/contract/index.ts`
- Modify: `repos/orbit-app/scripts/sync-contract.mjs`
- Modify: `repos/orbits/package.json`
- Modify: `repos/orbit-app/package.json`
- Test: `repos/orbits/tests/contract-surface.test.ts`
- Test: `repos/orbits/tests/api-schema/mobile-contacts-dashboard-schema.test.ts`
- Test: `repos/orbit-app/tests/contract-sync.test.ts`

**Interfaces:**
- Produces: `mobileContactsDashboardPayloadSchema` and `MobileContactsDashboardPayloadContract`.
- Produces: synchronized App files under `src/api/contract` and `src/api/schema`.

- [ ] Write tests that require a synchronized schema directory and reject malformed nested dashboard buckets.
- [ ] Run focused server and App contract tests and confirm they fail because the schema does not exist.
- [ ] Add Zod to both package manifests and install lockfile changes.
- [ ] Define the versioned payload contract and runtime schema.
- [ ] Extend `sync:contract` to copy both canonical directories.
- [ ] Run focused tests and typechecks until they pass.
- [ ] Commit as `feat(api): add shared runtime schema pipeline`.

### Task 2: Actor-scoped mobile contacts dashboard service

**Files:**
- Create: `repos/orbits/features/mobile/contacts-dashboard-service.ts`
- Test: `repos/orbits/tests/services/mobile-contacts-dashboard-service.test.ts`

**Interfaces:**
- Consumes: existing dashboard, distribution, opportunity, profile, and contacts services.
- Produces: `createMobileContactsDashboardService(dependencies)` with `getDashboard({ actorId })`.

- [ ] Write failing tests for actor propagation, required aggregate failure, and optional section degradation.
- [ ] Run the focused test and confirm the missing service is the failure reason.
- [ ] Implement parallel section loading with one resolved actor id.
- [ ] Parse the composed payload through `mobileContactsDashboardPayloadSchema`.
- [ ] Run focused tests and server typecheck.
- [ ] Commit as `feat(api): aggregate mobile contacts dashboard`.

### Task 3: Mobile contacts dashboard API route

**Files:**
- Create: `repos/orbits/app/api/mobile/contacts-dashboard/route.ts`
- Test: `repos/orbits/tests/api/mobile-contacts-dashboard-route.test.ts`

**Interfaces:**
- Consumes: `createMobileContactsDashboardService` and `resolveAuthenticatedApiActor`.
- Produces: `GET /api/mobile/contacts-dashboard` using the standard Orbit envelope.

- [ ] Write failing route tests for `401`, successful standard envelope, and schema mismatch failure.
- [ ] Run the focused test and confirm the route is missing.
- [ ] Implement the force-dynamic route and runtime boundary headers.
- [ ] Run focused tests and server typecheck.
- [ ] Commit as `feat(api): expose mobile contacts dashboard`.

### Task 4: Validated iOS resource hook

**Files:**
- Create: `repos/orbit-app/src/hooks/useValidatedApiResource.ts`
- Test: `repos/orbit-app/tests/validated-api-resource.test.ts`

**Interfaces:**
- Consumes: `useApiResource` and any schema exposing `safeParse`.
- Produces: `useValidatedApiResource<T>(path, schema, isEmpty)` returning typed `ApiResourceState<T>`.

- [ ] Write failing tests showing valid cached/network data is typed and invalid data becomes `ORBIT_APP_CONTRACT_MISMATCH`.
- [ ] Run the focused test and confirm the hook is missing.
- [ ] Implement the wrapper without changing existing `useApiResource` callers.
- [ ] Run focused tests and App typecheck.
- [ ] Commit as `feat(ios): validate API resources at runtime`.

### Task 5: Migrate contacts dashboard to one request

**Files:**
- Modify: `repos/orbit-app/src/api/endpoints.ts`
- Modify: `repos/orbit-app/src/screens/contacts/ContactsDashboardScreen.tsx`
- Test: `repos/orbit-app/tests/contacts-dashboard-screen-source.test.ts`
- Test: `repos/orbit-app/tests/mobile-contacts-dashboard-contract.test.ts`

**Interfaces:**
- Consumes: `mobileContactsDashboardPayloadSchema` and `useValidatedApiResource`.
- Produces: one read through `ORBIT_API_ENDPOINTS.mobileContactsDashboard`.

- [ ] Write failing tests requiring exactly one dashboard resource and one refresh after mutations.
- [ ] Run focused tests and confirm the old seven-resource implementation fails the expectation.
- [ ] Replace the seven read states with the validated mobile payload while preserving current chart UI changes.
- [ ] Update refresh and mutation success paths to refresh the aggregate resource.
- [ ] Run focused tests, full App tests, and App typecheck.
- [ ] Commit as `perf(ios): load contacts dashboard in one request`.

### Task 6: End-to-end verification

**Files:**
- No production files expected.

**Interfaces:**
- Verifies the complete server-to-App contract boundary.

- [ ] Run server focused tests and typecheck.
- [ ] Run App `sync:contract`, typecheck, and full test suite.
- [ ] Authenticate against the live local server and verify the mobile endpoint returns one schema-valid response.
- [ ] Launch the iOS Simulator and verify overview, all four pie dimensions, selection, and detail navigation.
- [ ] Run `gitnexus_detect_changes(scope: "all")` and review affected flows.
- [ ] Confirm only unrelated pre-existing changes remain unstaged.
