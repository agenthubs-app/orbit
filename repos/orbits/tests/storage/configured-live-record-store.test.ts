import assert from "node:assert/strict";
import test from "node:test";

import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { ClosableLiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

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
