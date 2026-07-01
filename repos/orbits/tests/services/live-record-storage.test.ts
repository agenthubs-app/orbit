import assert from "node:assert/strict";
import test from "node:test";

import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const baseRecord: LiveRecord<{ title: string; startsAt: string }> = {
  workspaceId: "workspace:test",
  collectionName: "events",
  recordId: "event:live:operator-dinner",
  sourceType: "manual",
  sourceId: "source:events:operator-dinner",
  sourceLabel: "Operator entered event",
  provider: "memory-live-record-store",
  providerRecordId: "provider:event:operator-dinner",
  evidenceIds: ["evidence:events:operator-dinner"],
  targetType: "event",
  targetId: "event:live:operator-dinner",
  occurredAt: "2026-07-15T10:00:00.000Z",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  lifecycleState: "active",
  searchText: "operator dinner live event",
  payload: {
    title: "Operator dinner",
    startsAt: "2026-07-15T10:00:00.000Z",
  },
};

test("memory live record store isolates payloads and filters by workspace collection and record id", () => {
  const store = createMemoryLiveRecordStore([baseRecord]);

  const listed = store.listRecords({
    workspaceId: "workspace:test",
    collectionName: "events",
  });
  const missingWorkspace = store.listRecords({
    workspaceId: "workspace:other",
    collectionName: "events",
  });
  const found = store.getRecord({
    workspaceId: "workspace:test",
    collectionName: "events",
    recordId: "event:live:operator-dinner",
  });

  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.recordId, "event:live:operator-dinner");
  assert.equal(missingWorkspace.length, 0);
  assert.equal(found?.payload.title, "Operator dinner");

  if (found) {
    found.payload.title = "Mutated outside store";
  }

  assert.equal(
    store.getRecord({
      workspaceId: "workspace:test",
      collectionName: "events",
      recordId: "event:live:operator-dinner",
    })?.payload.title,
    "Operator dinner",
  );
});

test("memory live record store upserts and soft deletes records", () => {
  const store = createMemoryLiveRecordStore<{ title: string; startsAt: string }>();

  const inserted = store.upsertRecord(baseRecord);
  const updated = store.upsertRecord({
    ...inserted,
    updatedAt: "2026-07-02T00:00:00.000Z",
    payload: {
      ...inserted.payload,
      title: "Updated operator dinner",
    },
  });
  const deleted = store.deleteRecord({
    workspaceId: "workspace:test",
    collectionName: "events",
    recordId: "event:live:operator-dinner",
    deletedAt: "2026-07-03T00:00:00.000Z",
  });

  assert.equal(inserted.payload.title, "Operator dinner");
  assert.equal(updated.payload.title, "Updated operator dinner");
  assert.equal(deleted?.lifecycleState, "deleted");
  assert.equal(deleted?.deletedAt, "2026-07-03T00:00:00.000Z");
  assert.equal(
    store.getRecord({
      workspaceId: "workspace:test",
      collectionName: "events",
      recordId: "event:live:operator-dinner",
    }),
    null,
  );
  assert.equal(
    store.getRecord({
      workspaceId: "workspace:test",
      collectionName: "events",
      recordId: "event:live:operator-dinner",
      includeDeleted: true,
    })?.payload.title,
    "Updated operator dinner",
  );
});

test("orbit records migration exposes indexed JSONB live record shape", () => {
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /create table if not exists orbit_records/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /workspace_id text not null/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /collection_name text not null/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /record_id text not null/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /payload jsonb not null/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /source_type text not null/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /source_id text not null/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /evidence_ids text\[\] not null/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /created_at timestamptz not null/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /updated_at timestamptz not null/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /orbit_records_workspace_collection_idx/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /orbit_records_source_idx/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /orbit_records_target_idx/i);
  assert.match(ORBIT_RECORDS_SCHEMA_SQL, /orbit_records_search_text_idx/i);
});
