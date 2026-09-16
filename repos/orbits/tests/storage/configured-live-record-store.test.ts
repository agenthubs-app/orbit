import assert from "node:assert/strict";
import test from "node:test";

import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { ClosableLiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import { createEventOperationsOutboxProjector } from "../../features/events/event-operations/outbox-projector";
import { createEventRegistrationLiveRecordProvider } from "../../features/events/registration/storage/live-record-provider";
import type { EventOperationsOutboxMessage } from "../../features/events/event-operations/storage/postgres-outbox-repository";

const recordColumns = ["workspace_id", "collection_name", "record_id", "user_id", "source_type", "source_id", "source_label", "provider", "provider_record_id", "evidence_ids", "target_type", "target_id", "occurred_at", "lifecycle_state", "search_text", "payload", "created_at", "updated_at", "deleted_at"];
function insertedRow(values: readonly unknown[]): Record<string, unknown> {
  return Object.fromEntries(recordColumns.map((key, index) => [key, key === "payload" && typeof values[index] === "string" ? JSON.parse(values[index]) : structuredClone(values[index])]));
}

for (const outcome of ["inserted", "conflict", "failure"] as const) {
test(`configured insert-only capability invalidates reads before dispatch and after ${outcome}`, async () => {
  let committed: Record<string, unknown> | null = null;
  let readCount = 0;
  const heldReads: Array<() => void> = [];
  let releaseInsert!: () => void;
  const config = createConfiguredPostgresLiveRecordStore({
    env: { ORBIT_DATABASE_URL: `postgresql://unused.invalid/insert-cache-${outcome}`, ORBIT_WORKSPACE_ID: "workspace:insert-cache-test" },
    createClient: () => ({
      close: async () => {},
      async query<TRow>(text: string, values?: readonly unknown[]) {
        if (/insert into orbit_records/i.test(text)) {
          assert.match(text, /on conflict[\s\S]*do nothing/i);
          await new Promise<void>(resolve => { releaseInsert = resolve; });
          committed = insertedRow(values!);
          if (outcome === "failure") throw new Error("uncertain insert response");
          return { rows: (outcome === "conflict" ? [] : [committed]) as TRow[] };
        }
        readCount += 1;
        if (committed) return { rows: [committed] as TRow[] };
        await new Promise<void>(resolve => { heldReads.push(resolve); });
        return { rows: [] as TRow[] };
      },
    }),
  })!;
  assert.equal(typeof config.store.insertRecordIfAbsent, "function");
  const query = { workspaceId: config.workspaceId, collectionName: "contacts", recordId: "contact:pending" };
  const record: LiveRecord = { ...query, userId: "owner", sourceType: "event_import", sourceId: "event:one", lifecycleState: "active", evidenceIds: [], createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z", payload: { id: query.recordId } };
  const before = config.store.getRecord(query);
  await Promise.resolve();
  const writing = config.store.insertRecordIfAbsent!(record);
  const during = config.store.getRecord(query);
  await Promise.resolve();
  assert.equal(readCount, 2, "write dispatch must evict the older inflight read");
  releaseInsert();
  if (outcome === "failure") await assert.rejects(Promise.resolve(writing), /uncertain insert response/);
  else if (outcome === "conflict") assert.equal(await writing, null);
  else assert.equal((await writing)?.recordId, record.recordId);
  assert.equal((await config.store.getRecord(query))?.recordId, record.recordId);
  assert.equal(readCount, 3, "write completion must evict reads started during the write");
  heldReads.forEach(release => release());
  await Promise.all([before, during]);
});
}

test("configured factory preserves atomic exchange projection and owner checks through its read wrapper", async () => {
  const rows = new Map<string, Record<string, unknown>>();
  let insertOnlyCalls = 0;
  const config = createConfiguredPostgresLiveRecordStore({
    env: { ORBIT_DATABASE_URL: "postgresql://unused.invalid/projector-wrapper-test", ORBIT_WORKSPACE_ID: "workspace:projector-wrapper-test" },
    createClient: () => ({
      close: async () => {},
      async query<TRow>(text: string, values?: readonly unknown[]) {
        const key = `${values![1]}:${values![2]}`;
        if (/insert into orbit_records/i.test(text)) {
          const only = /do nothing/i.test(text);
          if (only) insertOnlyCalls += 1;
          if (only && rows.has(key)) return { rows: [] as TRow[] };
          const row = insertedRow(values!);
          rows.set(key, row);
          return { rows: [row] as TRow[] };
        }
        return { rows: (rows.has(key) ? [rows.get(key)] : []) as TRow[] };
      },
    }),
  })!;
  const provider = createStorageBusinessCardContactWriteProvider(config);
  const projector = createEventOperationsOutboxProjector({ contactRequestNotifications: null, registrationProvider: createEventRegistrationLiveRecordProvider(config), relationshipProvider: provider });
  const common = { createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z", stage: "active", evidenceIds: ["evidence:exchange"], source: { id: "event:one", type: "event_import" } };
  const message = { eventType: "event.relationship_side.project", payload: {
    ownerActorId: "owner",
    contact: { ...common, id: "contact:exchange", displayName: "Peer" },
    connection: { ...common, id: "connection:exchange", contactId: "contact:exchange", accountId: "owner", summary: "Accepted exchange", valueTypes: ["community_context"] },
    evidence: { id: "evidence:exchange", sourceId: "event:one", sourceType: "event_import", occurredAt: common.createdAt, createdBy: "owner", summary: "Accepted exchange", confidence: 1 },
  } } as unknown as EventOperationsOutboxMessage;
  await projector.project(message);
  assert.equal(insertOnlyCalls, 2);
  assert.equal((await provider.getContact("contact:exchange", "owner"))?.lifecycleInitialization, "pending");
  const connection = rows.get("connections:connection:exchange")!;
  connection.payload = { ...connection.payload as Record<string, unknown>, stage: "active", version: 2, lifecycleInitialization: "ready", activeGoal: "Explicit owner choice" };
  const preserved = structuredClone(connection);
  await projector.project(message);
  assert.deepEqual(rows.get("connections:connection:exchange"), preserved);
  connection.user_id = "foreign";
  await assert.rejects(projector.project(message), /owner conflict/i);
  assert.equal(connection.user_id, "foreign");
});

test("configured postgres live record store reuses one sql client for the same database config", () => {
  const env = {
    ORBIT_DATABASE_URL:
      "postgresql://orbit:test@example.invalid:5432/orbit_test_cache",
    ORBIT_WORKSPACE_ID: "workspace:configured-live-record-store-test",
  };
  const createdClients: ClosableLiveRecordSqlClient[] = [];

  const first = createConfiguredPostgresLiveRecordStore({
    createClient: (options) => {
      const client: ClosableLiveRecordSqlClient = {
        close: async () => undefined,
        query: async () => ({ rows: [] }),
      };

      assert.equal(options.max, 1);
      createdClients.push(client);

      return client;
    },
    env,
  });
  const second = createConfiguredPostgresLiveRecordStore({
    createClient: () => {
      throw new Error("cached database config should not create a second client");
    },
    env,
  });

  assert.ok(first);
  assert.ok(second);
  assert.equal(first.workspaceId, "workspace:configured-live-record-store-test");
  assert.equal(second.workspaceId, "workspace:configured-live-record-store-test");
  assert.equal(first.store, second.store);
  assert.equal(first.client, second.client);
  assert.equal(createdClients.length, 1);
});

test("configured postgres live record store deduplicates concurrent identical read queries", async () => {
  const env = {
    ORBIT_DATABASE_URL:
      "postgresql://orbit:test@example.invalid:5432/orbit_test_read_dedupe",
    ORBIT_WORKSPACE_ID: "workspace:configured-live-record-store-read-dedupe-test",
  };
  let queryCount = 0;
  const storeConfig = createConfiguredPostgresLiveRecordStore({
    createClient: () => ({
      close: async () => undefined,
      query: async () => {
        queryCount += 1;

        return { rows: [] };
      },
    }),
    env,
  });

  assert.ok(storeConfig);

  await Promise.all([
    storeConfig.store.listRecords({
      workspaceId: storeConfig.workspaceId,
      collectionName: "contacts",
    }),
    storeConfig.store.listRecords({
      workspaceId: storeConfig.workspaceId,
      collectionName: "contacts",
    }),
  ]);

  assert.equal(queryCount, 1);
});
