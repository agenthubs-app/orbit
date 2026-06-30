# Search Backend Abstractions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable Relationship Search backend and data-store abstractions, provide one deterministic fixture-backed implementation, wire feature-owned search usage through stable interfaces, test it with mock data, update docs, and commit.

**Architecture:** Relationship Search will split service orchestration from retrieval backend and data-store reads. The default provider stays fixture-backed and side-effect free, while env vars select backend/store implementations without changing API routes or Orbit AI callers. Feature-owned search use starts with a Contacts recommendation search tool adapter that wraps the existing rule matcher and keeps business policy outside Search.

**Tech Stack:** TypeScript, Node test runner with `tsx`, existing Orbit service factory and capability test patterns.

## Global Constraints

- Use TDD: every production behavior below starts with a failing test.
- Do not add live database, vector, HTTP, AI, calendar, email, notification, or device calls.
- Default mode remains mock/fixture-backed.
- Search owns retrieval mechanics; Contacts/Recommendations own `contacts.recommend` policy; Orbit AI owns tool selection and artifact mapping.
- Configurable selectors must be env-driven and explicit: unsupported selector values fail visibly.
- Route/API payload shape must remain stable.

---

### Task 1: Search backend and store selector tests

**Files:**
- Modify: `repos/orbits/tests/capabilities/relationship-natural-search-mock.test.ts`
- Create: `repos/orbits/features/search/backend.ts`
- Create: `repos/orbits/features/search/stores/fixture-store.ts`
- Create: `repos/orbits/features/search/backend-factory.ts`

**Interfaces:**
- Produces: `RELATIONSHIP_SEARCH_BACKENDS`, `RELATIONSHIP_SEARCH_STORES`, `resolveRelationshipSearchBackendKind`, `resolveRelationshipSearchStoreKind`, `createRelationshipSearchBackend`
- Consumes: existing `RelationshipNaturalSearchService`

- [ ] Add tests that default backend/store resolve to fixture-backed deterministic implementations.
- [ ] Add tests that `ORBIT_RELATIONSHIP_SEARCH_BACKEND=basic_rules` and `ORBIT_RELATIONSHIP_SEARCH_STORE=fixture` produce the same mock data.
- [ ] Add tests that unsupported backend/store values return visible configuration failures.
- [ ] Run the focused test and confirm the new assertions fail before implementation.

### Task 2: Fixture-backed backend/store implementation

**Files:**
- Modify: `repos/orbits/features/search/backend.ts`
- Modify: `repos/orbits/features/search/stores/fixture-store.ts`
- Modify: `repos/orbits/features/search/backend-factory.ts`
- Modify: `repos/orbits/features/search/mock-service.ts`
- Modify: `repos/orbits/features/search/service-factory.ts`

**Interfaces:**
- Consumes: `RelationshipSearchBackend`, `RelationshipSearchStore`
- Produces: `createBackendRelationshipNaturalSearchService`

- [ ] Move query/filter matching behind `RelationshipSearchBackend`.
- [ ] Move fixture reads behind `RelationshipSearchStore`.
- [ ] Keep `createMockRelationshipNaturalSearchService()` as a compatibility wrapper using the configured backend/store.
- [ ] Make service factory use configured backend/store while preserving existing `createRelationshipNaturalSearchService(mode)` API.
- [ ] Run focused tests and confirm Search API payloads remain stable.

### Task 3: Feature-owned contact recommendation search adapter

**Files:**
- Create: `repos/orbits/features/contacts/contact-recommendation-search.ts`
- Modify: `repos/orbits/features/orbit-ai/contact-recommendation-matching.ts`
- Modify: `repos/orbits/tests/capabilities/orbit-ai-contact-recommendation-methods.test.ts`

**Interfaces:**
- Produces: `createContactsRecommendationSearchTool`, `ContactsRecommendationSearchTool`
- Consumes: `RelationshipNaturalSearchService`

- [ ] Add failing tests that `contacts.recommend` policy can use a feature-owned Contacts adapter.
- [ ] Implement the adapter in Contacts, mapping criteria to Search input and candidates.
- [ ] Update Orbit AI matcher to delegate search/ranking through the adapter while keeping its public matcher API stable.
- [ ] Run focused Orbit AI contact recommendation tests.

### Task 4: Docs and verification

**Files:**
- Modify: `repos/orbits/features/search/DESIGN.md`
- Modify: `repos/orbits/features/search/relationship-natural-search-mock/LIVE_IMPLEMENTATION.md`
- Modify: `repos/orbits/features/contacts/DESIGN.md`
- Modify: `repos/orbits/features/orbit-ai/DESIGN.md`
- Modify: `knowledge/docs/zh/feature-search-design.zh.md`
- Modify: `knowledge/docs/zh/feature-contacts-design.zh.md`
- Modify: `knowledge/docs/zh/feature-orbit-ai-design.zh.md`

**Interfaces:**
- Consumes: final code names and env vars
- Produces: updated implementation documentation

- [ ] Document backend/store env vars and the basic fixture implementation.
- [ ] Document Contacts adapter ownership for `contacts.recommend`.
- [ ] Run focused capability tests, lint/typecheck as available, `git diff --check`, and `gitnexus_detect_changes`.
- [ ] Commit all intended docs/code/test changes, excluding unrelated untracked files.
