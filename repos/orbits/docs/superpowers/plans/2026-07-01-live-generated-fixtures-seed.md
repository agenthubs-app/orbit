# Live Generated Fixtures Seed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed every `defaultMockFixtures` collection into the remote `orbit_records` live database and verify the remote copy.

**Architecture:** Add a shared storage seed module that converts each fixture DTO into a generic `LiveRecord<Record<string, unknown>>`. Add CLI scripts for seed and verify. Keep events-specific seed as-is; this goal creates a broader generated-fixture seed substrate for later feature providers.

**Tech Stack:** TypeScript, Node test runner with `tsx`, Postgres `orbit_records`, existing `LiveRecordStoreLike`, existing local env loader.

## Global Constraints

- `live-record-store.ts` remains a generic envelope and does not define contact/event/task-specific fields.
- Collection names must match `MOCK_FIXTURE_COLLECTION_NAMES`.
- Record IDs must use each DTO's stable `id`.
- Payload must preserve the original DTO object.
- Seed must be idempotent.
- Verify must check every collection count plus key records across events, contacts, evidence, attendees, intents, tasks, conversations, messages, and agent actions.
- No real secrets may be written to docs, tests, source, or output.
- Existing mock/hybrid/live behavior must not be narrowed or silently redirected.

---

### Task 1: Write Failing Generated Fixture Seed Test

**Files:**

- Create: `tests/services/live-generated-fixture-seed.test.ts`

**Interfaces:**

- Consumes: `defaultMockFixtures`, `MOCK_FIXTURE_COLLECTION_NAMES`
- Produces expected future API:
  - `seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId, now? })`
  - `GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS`

- [ ] **Step 1: Write the failing test**

The test should:

- Create a memory live record store.
- Seed twice with the same timestamp.
- Assert every fixture collection exists.
- Assert counts equal `defaultMockFixtures[collectionName].length`.
- Assert key records such as `event_01`, `event_signup_01`, `evidence:event:01`, and at least one contact/attendee/intent/task/conversation/message/agent action are present.
- Assert payload is preserved.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
node --test --import tsx tests/services/live-generated-fixture-seed.test.ts
```

Expected result: fail because the seed module does not exist.

### Task 2: Implement Shared Generated Fixture Seed Module

**Files:**

- Create: `shared/storage/seed-generated-fixtures.ts`

**Interfaces:**

- Produces:
  - `GENERATED_FIXTURE_LIVE_SEED_EXPECTED_COLLECTIONS`
  - `seedGeneratedRelationshipFixturesIntoLiveStore(options)`
  - `verifyGeneratedRelationshipFixturesInLiveStore(options)`

- [ ] **Step 1: Add mapper helpers**

The mapper must infer:

- `recordId` from `id`
- `sourceType`, `sourceId`, `sourceLabel` from `source` or evidence source fields
- `evidenceIds` from `evidenceIds` when present
- `targetType` from collection name or DTO `target`
- `targetId` from DTO references
- `occurredAt` from the strongest timestamp field available
- `createdAt` and `updatedAt` from DTO fields or fixture `generatedAt`
- `searchText` from readable string fields and evidence summaries

- [ ] **Step 2: Implement idempotent seed**

Use `store.upsertRecord(record)` for each fixture record. Return collection counts and total count.

- [ ] **Step 3: Implement verify**

List each collection and compare count and missing IDs. Return structured failures for script output and tests.

- [ ] **Step 4: Run the test to verify GREEN**

Run:

```bash
node --test --import tsx tests/services/live-generated-fixture-seed.test.ts
```

Expected result: pass.

### Task 3: Add CLI Scripts And Package Commands

**Files:**

- Create: `scripts/seed-live-generated-fixtures.ts`
- Create: `scripts/verify-live-generated-fixtures.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes existing `loadLocalEnv`, `resolveLiveDatabaseConnectionConfig`, `runOrbitRecordsMigration`, and `createPostgresLiveRecordStore`.
- Produces npm scripts:
  - `db:seed:live-generated-fixtures`
  - `db:verify:live-generated-fixtures`

- [ ] **Step 1: Add seed script**

Load local env, resolve live DB config, run migration, seed all generated fixtures, print collection counts.

- [ ] **Step 2: Add verify script**

Load local env, resolve live DB config, verify all collections, print collection counts and key record checks.

- [ ] **Step 3: Update package scripts and lint type list**

Add both scripts to `package.json` and include new TypeScript files in the `npm run lint` command's explicit `tsc` file list.

### Task 4: Remote Seed And Verification

**Files:**

- No source changes unless verification exposes a bug.

**Commands:**

```bash
node --test --import tsx tests/services/live-generated-fixture-seed.test.ts
npm run lint
npm run db:seed:live-generated-fixtures
npm run db:verify:live-generated-fixtures
```

If the remote verify passes, optionally run:

```bash
npm test
npm run build
```

### Task 5: Final Detection And Report

**Files:**

- No source changes unless detection exposes unexpected scope.

**Commands:**

```bash
gitnexus detect_changes --scope all
```

Report:

- Total seeded collections.
- Total seeded records.
- Remote workspace.
- Key record proof.
- Which future goals are unblocked.

## Execution Evidence

Completed against remote `workspace:orbit-dev`.

- `node --test --import tsx tests/services/live-generated-fixture-seed.test.ts`
  passed with both the idempotent seed test and the corrupted-key-record verify
  regression test.
- `npm run lint` passed with `shared/storage/seed-generated-fixtures.ts` and
  `tests/services/live-generated-fixture-seed.test.ts` included in the explicit
  TypeScript file list.
- `npm run db:seed:live-generated-fixtures` upserted 8267 generated fixture live
  records across all 21 `defaultMockFixtures` collections.
- `npm run db:verify:live-generated-fixtures` passed for all 21 collections:
  accounts 1, profiles 1, events 13, networkPeople 132,
  personRelationshipEdges 440, attendees 500, contacts 66, connections 510,
  evidence 4411, tasks 80, conversations 6, messages 80, dashboards 1,
  agentActions 60, permissions 1, notifications 40,
  eventParticipantIntents 500, aiAnalyses 240, matchRecommendations 350,
  interactionMemories 600, and recommendationTests 235.
- Verify now checks key payload and relationship fields for `event_01`,
  `event_signup_01`, `contact_001`, `evidence:event:01`, `participant_001`,
  `intent_001`, `task_001`, `conversation_001`, `message_0001`, and
  `agent_action_001`; it fails visibly if a key field is corrupted.
