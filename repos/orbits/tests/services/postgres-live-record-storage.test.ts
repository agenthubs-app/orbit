import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveLiveDatabaseConnectionConfig,
} from "../../shared/storage/live-database-config";
import {
  createPostgresLiveRecordStore,
  type LiveRecordSqlClient,
} from "../../shared/storage/postgres-live-record-store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import type { LiveRecord } from "../../shared/storage/live-record-store";

const baseRecord: LiveRecord<{ title: string; startsAt: string }> = {
  workspaceId: "workspace:test",
  collectionName: "events",
  recordId: "event:live:operator-dinner",
  sourceType: "manual",
  sourceId: "source:events:operator-dinner",
  sourceLabel: "Operator entered event",
  provider: "postgres-live-record-store",
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

interface SqlCall {
  text: string;
  values?: readonly unknown[];
}

function rowFromRecord(record: LiveRecord): Record<string, unknown> {
  return {
    workspace_id: record.workspaceId,
    collection_name: record.collectionName,
    record_id: record.recordId,
    user_id: record.userId ?? null,
    source_type: record.sourceType,
    source_id: record.sourceId,
    source_label: record.sourceLabel ?? null,
    provider: record.provider ?? null,
    provider_record_id: record.providerRecordId ?? null,
    evidence_ids: [...record.evidenceIds],
    target_type: record.targetType ?? null,
    target_id: record.targetId ?? null,
    occurred_at: record.occurredAt ?? null,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    deleted_at: record.deletedAt ?? null,
    lifecycle_state: record.lifecycleState,
    search_text: record.searchText ?? null,
    payload: record.payload,
  };
}

function createFakeSqlClient(
  rowsByCall: readonly (readonly Record<string, unknown>[])[] = [],
): LiveRecordSqlClient & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];

  return {
    calls,
    async query<TRow = Record<string, unknown>>(text, values) {
      calls.push({ text, values });

      return {
        rows: (rowsByCall[calls.length - 1] ?? []) as readonly TRow[],
      };
    },
  };
}

test("orbit records migration can run through an async SQL client", async () => {
  const client = createFakeSqlClient();

  await runOrbitRecordsMigration(client);

  assert.equal(client.calls.length, 1);
  assert.match(
    client.calls[0]?.text ?? "",
    /create table if not exists orbit_records/i,
  );
  assert.match(client.calls[0]?.text ?? "", /payload jsonb not null/i);
});

test("postgres live record store upserts records with parameterized SQL", async () => {
  const client = createFakeSqlClient([[rowFromRecord(baseRecord)]]);
  const store = createPostgresLiveRecordStore<{
    title: string;
    startsAt: string;
  }>({ client });

  const saved = await store.upsertRecord(baseRecord);

  assert.equal(saved.recordId, "event:live:operator-dinner");
  assert.equal(saved.payload.title, "Operator dinner");
  assert.equal(client.calls.length, 1);
  assert.match(client.calls[0]?.text ?? "", /insert into orbit_records/i);
  assert.match(client.calls[0]?.text ?? "", /on conflict/i);
  assert.deepEqual(client.calls[0]?.values?.slice(0, 3), [
    "workspace:test",
    "events",
    "event:live:operator-dinner",
  ]);
});

test("postgres live record store lists gets and soft deletes records", async () => {
  const deletedRow = rowFromRecord({
    ...baseRecord,
    deletedAt: "2026-07-03T00:00:00.000Z",
    lifecycleState: "deleted",
    updatedAt: "2026-07-03T00:00:00.000Z",
  });
  const client = createFakeSqlClient([
    [rowFromRecord(baseRecord)],
    [rowFromRecord(baseRecord)],
    [deletedRow],
  ]);
  const store = createPostgresLiveRecordStore<{
    title: string;
    startsAt: string;
  }>({ client });

  const listed = await store.listRecords({
    workspaceId: "workspace:test",
    collectionName: "events",
    searchText: "operator",
  });
  const found = await store.getRecord({
    workspaceId: "workspace:test",
    collectionName: "events",
    recordId: "event:live:operator-dinner",
  });
  const deleted = await store.deleteRecord({
    workspaceId: "workspace:test",
    collectionName: "events",
    recordId: "event:live:operator-dinner",
    deletedAt: "2026-07-03T00:00:00.000Z",
  });

  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.payload.title, "Operator dinner");
  assert.equal(found?.recordId, "event:live:operator-dinner");
  assert.equal(deleted?.lifecycleState, "deleted");
  assert.equal(deleted?.deletedAt, "2026-07-03T00:00:00.000Z");
  assert.match(client.calls[0]?.text ?? "", /where workspace_id = \$1/i);
  assert.match(client.calls[0]?.text ?? "", /collection_name = \$2/i);
  assert.match(client.calls[0]?.text ?? "", /search_text ilike/i);
  assert.ok(client.calls[0]?.values?.includes("%operator%"));
  assert.match(client.calls[2]?.text ?? "", /update orbit_records/i);
  assert.match(client.calls[2]?.text ?? "", /set lifecycle_state = 'deleted'/i);
});

test("live database config prefers event-specific URL over shared live URL", () => {
  assert.deepEqual(
    resolveLiveDatabaseConnectionConfig({
      ORBIT_EVENT_DATABASE_URL: "postgres://events.example/orbit",
      ORBIT_LIVE_DATABASE_URL: "postgres://shared.example/orbit",
      ORBIT_WORKSPACE_ID: "workspace:demo",
    }),
    {
      connectionString: "postgres://events.example/orbit",
      workspaceId: "workspace:demo",
    },
  );
  assert.deepEqual(
    resolveLiveDatabaseConnectionConfig({
      ORBIT_LIVE_DATABASE_URL: "postgres://shared.example/orbit",
    }),
    {
      connectionString: "postgres://shared.example/orbit",
      workspaceId: "workspace:default",
    },
  );
  assert.equal(resolveLiveDatabaseConnectionConfig({}), null);
});
