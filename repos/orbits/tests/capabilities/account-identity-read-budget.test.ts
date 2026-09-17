import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";
import { createStorageAccountSessionProvider } from "../../features/account/storage/account-live-record-provider";

test("identity reads transfer only the persisted member and account, independent of workspace size", async () => {
  const timestamp = "2026-09-17T00:00:00.000Z";
  const records: LiveRecord[] = [];
  for (let i = 0; i < 1000; i++) {
    const common = { workspaceId: "w", userId: `a${i}`, sourceType: "manual", sourceId: "test", evidenceIds: [], createdAt: timestamp, updatedAt: timestamp, lifecycleState: "active" as const };
    records.push({ ...common, collectionName: "accounts", recordId: `a${i}`, payload: { id: `a${i}`, name: "Account", createdAt: timestamp, updatedAt: timestamp } });
    records.push({ ...common, collectionName: "profiles", recordId: `p${i}`, payload: { id: `p${i}`, accountId: `a${i}`, displayName: "Member", createdAt: timestamp, updatedAt: timestamp } });
  }
  const store = createMemoryLiveRecordStore(records);
  let transferred = 0;
  const provider = createStorageAccountSessionProvider({ workspaceId: "w", store: { ...store, listRecords(query) {
    assert.ok(query.payloadId || query.payloadAccountId, "must not fetch the entire workspace");
    const result = store.listRecords(query);
    transferred += result.length;
    return result;
  } } });
  const graph = await provider.readAccountSessionGraph({ userId: "p7" });
  assert.deepEqual(graph.accounts.map(item => item.id), ["a7"]);
  assert.deepEqual(graph.profiles.map(item => item.id), ["p7"]);
  assert.equal(transferred, 2);
  transferred = 0;
  assert.equal((await provider.readAccountSessionGraph({ userId: "a7" })).profiles[0]?.id, "p7");
  assert.equal(transferred, 2);
  assert.equal((await provider.readAccountSessionGraph({ userId: "missing" })).accounts.length, 0);
});
