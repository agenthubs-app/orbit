import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import { SyncResetRequiredError, type SyncClient } from "../src/data/sync/sync-client";
import { NodeTestDatabase } from "./helpers/node-sync-database";

// The production path useSyncedCollection walks: lease → mirror scopes → domain pages → reads.
const baseUrl = "https://host.example";
const A = "actor-a";
const W = "workspace-host";
const T0 = Date.parse("2026-09-18T10:00:00.000Z");
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");

interface HostState {
  epoch: string;
  grantedDomains: string[];
  rows: Record<string, { id: string; revision: string; payload: Record<string, unknown> }[]>;
  calls: string[];
  now: number;
}

function lease(state: HostState): OfflineReadEnvelope {
  return {
    version: 2, baseUrl, actorId: A, subject: "user-a",
    sessionExpiresAt: state.now + 30 * 86_400_000, offlineReadExpiresAt: state.now + 7 * 86_400_000, lastVerifiedAt: state.now,
    grants: state.grantedDomains.map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: state.epoch })),
    databaseKeyRef: "key-ref",
  };
}

function client(state: HostState): SyncClient {
  return {
    async getLease() { state.calls.push("lease"); return lease(state); },
    async getManifest() { throw new Error("unused"); },
    async getDomainPage(input): Promise<DomainPage> {
      state.calls.push(`page:${input.domainId}:${input.cursor ?? "-"}`);
      if (input.cursor && !input.cursor.startsWith(`${state.epoch}:`)) throw new SyncResetRequiredError({ code: "CONFLICT", context: { syncErrorCode: "SYNC_RESET_REQUIRED" }, message: "reset", status: 409 });
      const rows = state.rows[input.domainId] ?? [];
      const after = input.cursor ? Number(input.cursor.split(":")[1]) : 0;
      const slice = rows.slice(after, after + 2);
      const next = after + slice.length;
      return {
        domainId: input.domainId, schemaVersion: 1, registryVersion: 1, authorizationEpoch: state.epoch,
        changes: slice.map((row) => ({ id: row.id, revision: row.revision, operation: "upsert", payload: row.payload })),
        nextCursor: `${state.epoch}:${next}`, highWatermark: String(rows.length), hasMore: next < rows.length,
        generation: `gen-${state.epoch}`, serverTime: new Date(state.now).toISOString(),
      };
    },
    async getPage() { throw new Error("legacy /api/sync must not be used"); },
  };
}

function device(t: TestContext, database = new NodeTestDatabase()) {
  const lifecycle: SyncCoordinatorLifecycle = {
    async setScope() { return true; },
    async withDatabase(scope, operation) { return operation(database, scope ?? { baseUrl, actorId: A }); },
  };
  t.after(() => { try { database.close(); } catch { /* closed by a later device */ } });
  return { database, lifecycle };
}

async function ready(database: NodeTestDatabase) { await initializeLocalSyncDatabase(database); }

async function sync(session: ReturnType<ReturnType<typeof createSyncCoordinator>["openScope"]>, kind: "task" | "note") {
  const request = session.synchronize(kind, { reason: "explicit" });
  await request.started;
  return request.promise;
}

test("lease → bound scopes → domain pages → readable mirror, without the legacy /api/sync page", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes", "tasks", "personal-schedule"], calls: [], now: T0, rows: {
    tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }, { id: "t2", revision: "r2", payload: { id: "t2" } }, { id: "t3", revision: "r3", payload: { id: "t3" } }],
    notes: [{ id: "n1", revision: "r1", payload: { id: "n1" } }],
  } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const coordinator = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = coordinator.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "k1" });
  const before = await session.readCollection("task");
  assert.deepEqual(before?.records, [], "nothing readable before the first lease");
  const result = await sync(session, "task");
  assert.equal(result?.error, null, `sync error: ${result?.error}`);
  assert.equal(state.calls[0], "lease");
  assert.ok(state.calls.some((call) => call.startsWith("page:tasks:")) && state.calls.some((call) => call.startsWith("page:notes:")));
  assert.equal(result?.status, "fresh", "the sync result reports a complete bootstrap");
  const tasks = await session.readCollection("task");
  assert.deepEqual(tasks?.records.map((record) => record.id).sort(), ["t1", "t2", "t3"]);
  assert.equal(tasks?.status, "local-ready", "a mirror read reports local-ready; freshness is the sync result's");
  assert.equal((await session.readCollection("note"))?.records.length, 1);
  const stored = await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'offline_read_lease'");
  assert.ok(stored, "the lease is kept with the mirror");
  session.deactivate();
});

test("an offline cold start rebinds scopes from the stored lease and reads the mirror without the network", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["tasks"], calls: [], now: T0, rows: { tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }] } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const first = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const session = first.openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "k1" });
  assert.equal((await sync(session, "task"))?.error, null);
  session.deactivate();
  // New process, network down, one hour later.
  state.now = T0 + 3_600_000;
  const offline: SyncClient = { ...client(state), async getLease() { throw new Error("offline"); }, async getDomainPage() { throw new Error("offline"); } };
  const second = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload });
  const cold = second.openScope({ actorId: A, baseUrl, client: offline, scopeKey: "k2" });
  const mirror = await cold.readCollection("task");
  assert.deepEqual(mirror?.records.map((record) => record.id), ["t1"], "mirror readable from the stored lease");
  const attempt = await sync(cold, "task");
  assert.match(attempt?.error ?? "", /offline/);
  assert.equal((await cold.readCollection("task"))?.records.length, 1, "a failed refresh leaves the mirror readable");
  // Past the lease's offline window the stored lease no longer binds anything.
  state.now = T0 + 8 * 86_400_000;
  const expired = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload }).openScope({ actorId: A, baseUrl, client: offline, scopeKey: "k3" });
  assert.deepEqual((await expired.readCollection("task"))?.records, [], "an expired lease binds no scope");
});

test("an epoch rotation retires the old epoch and rebuilds the domain in full; revocation empties it", async (t) => {
  const state: HostState = { epoch: "e1", grantedDomains: ["notes", "tasks"], calls: [], now: T0, rows: {
    tasks: [{ id: "t1", revision: "r1", payload: { id: "t1" } }, { id: "t2", revision: "r2", payload: { id: "t2" } }],
    notes: [{ id: "n1", revision: "r1", payload: { id: "n1" } }],
  } };
  const { database, lifecycle } = device(t);
  await ready(database);
  const session = createSyncCoordinator({ lifecycle, now: () => state.now, hashPayload }).openScope({ actorId: A, baseUrl, client: client(state), scopeKey: "k1" });
  assert.equal((await sync(session, "task"))?.error, null);
  const count = async (epoch: string) => (await database.get<{ n: number }>("SELECT COUNT(*) AS n FROM sync_records WHERE domain_id='tasks' AND authorization_epoch=?", [epoch]))!.n;
  assert.equal(await count("e1"), 2);
  // Rotation: the server issues e2 and a different row set.
  state.epoch = "e2";
  state.rows.tasks = [{ id: "t2", revision: "r2", payload: { id: "t2" } }, { id: "t9", revision: "r9", payload: { id: "t9" } }];
  state.calls.length = 0;
  assert.equal((await sync(session, "task"))?.error, null);
  assert.equal(await count("e1"), 0, "old epoch rows are gone");
  assert.equal(await count("e2"), 2);
  assert.ok(state.calls.includes("page:tasks:-"), "the new epoch starts from a full pull, not an old cursor");
  assert.deepEqual((await session.readCollection("task"))?.records.map((record) => record.id).sort(), ["t2", "t9"]);
  // Revocation: tasks disappears from the grants.
  state.grantedDomains = ["notes"];
  assert.equal((await sync(session, "task"))?.error, null);
  assert.equal(await count("e2"), 0, "revoked domain has no rows left");
  assert.deepEqual((await session.readCollection("task"))?.records, []);
  assert.equal((await session.readCollection("note"))?.records.length, 1, "other domains untouched");
});
