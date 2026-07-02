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

      assert.equal(options.max, 4);
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
