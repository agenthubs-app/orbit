import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";

import type { SyncRecord } from "../src/api/contract/sync";
import type { DomainPage, ReadScope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createLocalSyncRepository } from "../src/data/sync/local-sync-repository";
import { NodeTestDatabase } from "./helpers/node-sync-database";

// Client mirror layer of the three-layer topology: one device database only
// ever holds the signed-in user's rows, and every read is bound to that user.
const baseUrl = "https://host.example";
const WORKSPACE = "workspace-host";
const A = "actor-a";
const B = "actor-b";
const scopesFor = (actorId: string, epoch: string): ReadScope[] =>
  ["tasks", "notes"].map((domainId) => ({ baseUrl, actorId, workspaceId: WORKSPACE, domainId, authorizationEpoch: epoch }));
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");

function page(domainId: string, epoch: string, ids: readonly string[]): DomainPage {
  return {
    domainId, authorizationEpoch: epoch, schemaVersion: 1, registryVersion: 1,
    changes: ids.map((id) => ({ id, revision: `rev:${id}`, operation: "upsert", payload: { id, owner: A } })),
    nextCursor: `cursor:${domainId}`, highWatermark: "hw1", hasMore: false, generation: "g1", serverTime: "2026-09-18T01:00:00Z",
  };
}

function legacyRecord(actorId: string, id: string): SyncRecord<Record<string, unknown>> {
  return {
    actorId, workspaceId: WORKSPACE, kind: "task", id, revision: `rev:${id}`, updatedAt: "2026-09-18T01:00:00.000Z",
    deletedAt: null, payload: { id }, syncState: "synced", aiVisibility: "available_when_synced",
  };
}

async function device(t: TestContext) {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const scopesA = scopesFor(A, "epoch-a");
  const repoA = createLocalSyncRepository({
    actorId: A, database, baseUrl, registeredDomainIds: ["tasks", "notes"], activeReadScopes: () => scopesA, hashPayload,
  });
  await repoA.applyDomainPage(scopesA[0]!, page("tasks", "epoch-a", ["task:a:1", "task:a:2", "task:a:3"]));
  await repoA.applyDomainPage(scopesA[1]!, page("notes", "epoch-a", ["note:a:1"]));
  return { database, scopesA, repoA };
}

test("mirror holds only the signed-in user's rows and refuses pages carrying another user's records", async (t) => {
  const { database, scopesA, repoA } = await device(t);
  const tasks = await repoA.listRecords({ workspaceId: WORKSPACE, kind: "task" });
  assert.deepEqual(tasks.map((record) => record.id).sort(), ["task:a:1", "task:a:2", "task:a:3"]);
  assert.ok(tasks.every((record) => record.actorId === A));

  // Legacy page path: a record stamped with B's actorId never lands in A's mirror.
  await assert.rejects(
    repoA.applyPage({ workspaceId: WORKSPACE, records: [legacyRecord(A, "task:a:4"), legacyRecord(B, "task:b:1")], cursor: "c", syncedAt: "2026-09-18T01:00:00.000Z", bootstrapState: "complete" }),
    /actorId does not match the authenticated database scope/,
  );
  // Domain page path: a scope issued to B cannot be applied through A's repository.
  await assert.rejects(
    repoA.applyDomainPage(scopesFor(B, "epoch-b")[0]!, page("tasks", "epoch-b", ["task:b:1"])),
    /read scope does not match/,
  );
  const stored = await database.all<{ record_id: string }>("SELECT record_id FROM sync_records ORDER BY record_id");
  assert.deepEqual(stored.map((row) => row.record_id), ["note:a:1", "task:a:1", "task:a:2", "task:a:3"]);
});

test("account switch on the same device: B's repository cannot read A's rows", async (t) => {
  const { database, scopesA } = await device(t);
  const scopesB = scopesFor(B, "epoch-b");
  const repoB = createLocalSyncRepository({
    actorId: B, database, baseUrl, registeredDomainIds: ["tasks", "notes"], activeReadScopes: () => scopesB, hashPayload,
  });
  // B with B's own grants sees nothing: A's rows live under A's epoch, and B's scope is not readable yet.
  assert.deepEqual(await repoB.listRecords({ workspaceId: WORKSPACE, kind: "task" }), []);
  assert.equal(await repoB.getRecord({ workspaceId: WORKSPACE, kind: "task", id: "task:a:1" }), null);
  // B presenting A's scope is rejected outright.
  await assert.rejects(repoB.applyDomainPage(scopesA[0]!, page("tasks", "epoch-a", ["task:a:9"])), /read scope does not match/);
  await assert.rejects(repoB.resetDomain(scopesA[0]!), /read scope does not match/);
  const stored = await database.all<{ record_id: string }>("SELECT record_id FROM sync_records WHERE domain_id = 'tasks' ORDER BY record_id");
  assert.deepEqual(stored.map((row) => row.record_id), ["task:a:1", "task:a:2", "task:a:3"], "A's rows are untouched by B's session");
});

test("revocation clears one domain's mirror and leaves the others readable", async (t) => {
  const { scopesA, repoA } = await device(t);
  await repoA.resetDomain(scopesA[0]!);
  assert.deepEqual(await repoA.listRecords({ workspaceId: WORKSPACE, kind: "task" }), []);
  assert.equal(await repoA.getRecord({ workspaceId: WORKSPACE, kind: "task", id: "task:a:1" }), null);
  const notes = await repoA.listRecords({ workspaceId: WORKSPACE, kind: "note" });
  assert.deepEqual(notes.map((record) => record.id), ["note:a:1"]);
  // A fresh grant repopulates the domain from the host.
  await repoA.applyDomainPage(scopesA[0]!, page("tasks", "epoch-a", ["task:a:1"]));
  assert.deepEqual((await repoA.listRecords({ workspaceId: WORKSPACE, kind: "task" })).map((record) => record.id), ["task:a:1"]);
});

test("epoch rotation retires every row, cursor and readable flag of the old epoch so the next pull is a full rebuild", async (t) => {
  const { database, scopesA, repoA } = await device(t);
  const rotated = scopesFor(A, "epoch-a2");
  const repoRotated = createLocalSyncRepository({
    actorId: A, database, baseUrl, registeredDomainIds: ["tasks", "notes"], activeReadScopes: () => rotated, hashPayload,
  });
  assert.deepEqual(await repoRotated.listRecords({ workspaceId: WORKSPACE, kind: "task" }), [], "nothing is readable under the new epoch yet");
  assert.equal(await repoRotated.retireEpochs(WORKSPACE, "tasks", "epoch-a2"), 3, "three old-epoch task rows retired");
  const leftovers = await database.all<{ table: string; n: number }>(
    `SELECT 'records' AS "table", COUNT(*) AS n FROM sync_records WHERE domain_id='tasks' AND authorization_epoch='epoch-a'
     UNION ALL SELECT 'cursors', COUNT(*) FROM sync_cursors WHERE domain_id='tasks' AND authorization_epoch='epoch-a'
     UNION ALL SELECT 'scope', COUNT(*) FROM local_read_scope_state WHERE domain_id='tasks' AND authorization_epoch='epoch-a'`,
  );
  assert.deepEqual(leftovers.map((row) => row.n), [0, 0, 0]);
  assert.deepEqual((await repoA.listRecords({ workspaceId: WORKSPACE, kind: "note" })).map((record) => record.id), ["note:a:1"], "other domains keep their old-epoch rows");
  await repoRotated.applyDomainPage(rotated[0]!, page("tasks", "epoch-a2", ["task:a:1", "task:a:9"]));
  assert.deepEqual((await repoRotated.listRecords({ workspaceId: WORKSPACE, kind: "task" })).map((record) => record.id).sort(), ["task:a:1", "task:a:9"]);
  await assert.rejects(repoRotated.retireEpochs(WORKSPACE, "unknown", "epoch-a2"), /not registered/);
  void scopesA;
});

// Browser variant of the client layer: rows are ciphertext at rest, so a device
// database restored next to a different key (another profile, another user's
// key store) yields nothing readable even for the right actor and scope.
test("a mirror encrypted under one key cannot be read through another key, even by the same actor and scope", async (t) => {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const codec = (key: string) => ({
    encode: async (s: string) => `${key}:${Buffer.from(s, "utf8").toString("base64")}`,
    decode: async (s: string) => { if (!s.startsWith(`${key}:`)) throw new Error("PAYLOAD_CODEC_KEY_MISMATCH"); return Buffer.from(s.slice(key.length + 1), "base64").toString("utf8"); },
  });
  const scopesA = scopesFor(A, "epoch-a");
  const withKeyA = createLocalSyncRepository({ actorId: A, database, baseUrl, registeredDomainIds: ["tasks", "notes"], activeReadScopes: () => scopesA, hashPayload, payloadCodec: codec("key-a") });
  await withKeyA.applyDomainPage(scopesA[0]!, page("tasks", "epoch-a", ["task:a:1"]));
  assert.deepEqual((await withKeyA.listRecords({ workspaceId: WORKSPACE, kind: "task" })).map((record) => record.id), ["task:a:1"]);
  const withKeyB = createLocalSyncRepository({ actorId: A, database, baseUrl, registeredDomainIds: ["tasks", "notes"], activeReadScopes: () => scopesA, hashPayload, payloadCodec: codec("key-b") });
  await assert.rejects(withKeyB.listRecords({ workspaceId: WORKSPACE, kind: "task" }), /PAYLOAD_CODEC_KEY_MISMATCH/);
  await assert.rejects(withKeyB.getRecord({ workspaceId: WORKSPACE, kind: "task", id: "task:a:1" }), /PAYLOAD_CODEC_KEY_MISMATCH/);
  const stored = await database.all<{ payload_json: string }>("SELECT payload_json FROM sync_records");
  assert.ok(stored.every((row) => row.payload_json.startsWith("key-a:") && !row.payload_json.includes("owner")), "the file itself never holds plaintext");
});
