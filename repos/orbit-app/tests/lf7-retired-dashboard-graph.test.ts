import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { SyncChangeKind } from "../src/api/contract/sync";
import type { DomainChange, DomainManifest, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import { PAGE_COPY_DEFINITIONS, RETIRED_PAGE_COPY_IDS } from "../src/data/sync/page-copies";
import { KNOWN_SYNC_DOMAINS, RETIRED_SYNC_DOMAINS } from "../src/data/sync/sync-domains";
import { WEB_MIRROR_DOMAIN_IDS, WEB_MIRROR_PAGE_COPY_IDS } from "../src/data/sync/web-mirror-storage";
import { NodeTestDatabase } from "./helpers/node-sync-database";

// LF7: the dashboard-graph domain (0117) has no reader since the dashboard route
// redirects to Home and the 人脈 analysis computes from contacts. The real
// coordinator and SQLite mirror against a scripted host that still grants it:
// this build never pulls it, and deletes what an earlier build stored (with the
// dashboard's provenance-audit page copy) while every live domain stays.
const baseUrl = "https://host.example";
const A = "actor-a";
const W = "workspace-host";
const T0 = Date.parse("2026-10-02T09:00:00.000Z");
const NOW = "2026-10-02T09:00:00.000Z";
const hashPayload = async (json: string) => createHash("sha256").update(json).digest("hex");

interface Host { epoch: string; granted: string[]; log: Record<string, DomainChange[]>; calls: string[] }

function lease(host: Host): OfflineReadEnvelope {
  return {
    version: 2, baseUrl, actorId: A, subject: "user-a", sessionExpiresAt: T0 + 30 * 86_400_000, offlineReadExpiresAt: T0 + 7 * 86_400_000, lastVerifiedAt: T0,
    grants: host.granted.map((domainId) => ({ workspaceId: W, domainId, authorizationEpoch: host.epoch })), databaseKeyRef: "key-ref",
  };
}

function client(host: Host): SyncClient {
  return {
    async getLease() { host.calls.push("lease"); return lease(host); },
    async getManifest(): Promise<DomainManifest> {
      return { registryVersion: 2, domains: host.granted.map((domainId) => ({ domainId, schemaVersion: 2, workspaceId: W, authorizationEpoch: host.epoch, generation: "g", watermark: String((host.log[domainId] ?? []).length), history: "complete", membershipCursor: null })) };
    },
    async getDomainPage(input): Promise<DomainPage> {
      host.calls.push(`page:${input.domainId}`);
      if (!host.granted.includes(input.domainId)) throw new Error(`ungranted ${input.domainId}`);
      const log = host.log[input.domainId] ?? [];
      const after = input.cursor ? Number(input.cursor) : 0;
      return {
        domainId: input.domainId, schemaVersion: 2, registryVersion: 2, authorizationEpoch: host.epoch, changes: log.slice(after),
        nextCursor: String(log.length), highWatermark: String(log.length), hasMore: false, generation: "g", serverTime: NOW,
      };
    },
    async getPage() { throw new Error("legacy /api/sync must not be used"); },
  };
}

async function device(t: TestContext, host: Host) {
  const database = new NodeTestDatabase();
  t.after(() => database.close());
  await initializeLocalSyncDatabase(database);
  const lifecycle: SyncCoordinatorLifecycle = {
    async setScope() { return true; },
    async withDatabase(scope, operation) { return operation(database, scope ?? { baseUrl, actorId: A }); },
  };
  const session = createSyncCoordinator({ lifecycle, now: () => T0, hashPayload }).openScope({ actorId: A, baseUrl, client: client(host), scopeKey: "k" });
  t.after(() => session.deactivate());
  return {
    async sync() { const request = session.synchronize("note", { reason: "explicit" }); await request.started; return request.promise; },
    async records(kind: SyncChangeKind) { return (await session.readCollection(kind))?.records ?? []; },
    database,
  };
}

const note = (id: string, minute: number): DomainChange => ({ id, revision: String(minute), operation: "upsert", payload: { id, title: `note ${id}`, body: "", updatedAt: `2026-10-01T00:${String(minute).padStart(2, "0")}:00.000Z` } });
const graphChange: DomainChange = { id: "contacts/c1", revision: "1", operation: "upsert", payload: { collection: "contacts", recordId: "c1", occurredAt: null, updatedAt: "2026-10-01T00:01:00.000000Z", data: { id: "c1" } } };

/** What a 0117 build left on the device: graph rows and cursor in two epochs, and the dashboard's last source audit. */
async function seedEarlierBuild(database: NodeTestDatabase) {
  for (const [epoch, recordId] of [["e0", "c0"], ["e1", "c1"]] as const) {
    await database.run("INSERT INTO sync_records (workspace_id, domain_id, authorization_epoch, kind, record_id, revision, updated_at, payload_json, sync_state, ai_visibility) VALUES (?, 'dashboard-graph', ?, 'dashboard_graph', ?, '1', ?, '{}', 'synced', 'excluded')", [W, epoch, `contacts/${recordId}`, NOW]);
    await database.run("INSERT INTO sync_cursors (workspace_id, domain_id, authorization_epoch, cursor, last_successful_sync_at, bootstrap_state, completeness, generation) VALUES (?, 'dashboard-graph', ?, '6', ?, 'complete', 'complete', 'g')", [W, epoch, NOW]);
  }
  await database.run("INSERT INTO sync_meta (key, value) VALUES (?, ?)", ["page_copy:" + JSON.stringify([W, "e1", "provenance-audit", "single"]), JSON.stringify({ data: {}, syncedAt: NOW })]);
  await database.run("INSERT INTO sync_meta (key, value) VALUES (?, ?)", ["page_copy_index:" + JSON.stringify([W, "e1", "provenance-audit"]), JSON.stringify(["single"])]);
}

const count = async (database: NodeTestDatabase, sql: string, params: unknown[] = []) => (await database.get<{ n: number }>(sql, params as never))!.n;

test("a lease that still grants dashboard-graph never pulls it", async (t) => {
  const host: Host = { epoch: "e1", granted: ["notes", "dashboard-graph"], calls: [], log: { notes: [note("n1", 1)], "dashboard-graph": [graphChange] } };
  const d = await device(t, host);
  const result = await d.sync();
  assert.equal(result?.error, null, String(result?.error));
  assert.ok(host.calls.includes("page:notes"), "live domains still sync");
  assert.equal(host.calls.includes("page:dashboard-graph"), false, "the retired domain is not downloaded");
  assert.equal(await count(d.database, "SELECT count(*) AS n FROM sync_records WHERE domain_id='dashboard-graph'"), 0);
  assert.equal((await d.records("note")).length, 1);
});

test("the first sync deletes the graph and the source-audit copy an earlier build stored, in every epoch, and keeps the rest", async (t) => {
  const host: Host = { epoch: "e1", granted: ["notes", "dashboard-graph"], calls: [], log: { notes: [note("n1", 1)], "dashboard-graph": [graphChange] } };
  const d = await device(t, host);
  await seedEarlierBuild(d.database);
  await d.database.run("INSERT INTO sync_meta (key, value) VALUES (?, ?)", ["page_copy:" + JSON.stringify([W, "e1", "home-week", "single"]), JSON.stringify({ data: { days: [] }, syncedAt: NOW })]);
  const result = await d.sync();
  assert.equal(result?.error, null, String(result?.error));
  assert.equal(await count(d.database, "SELECT count(*) AS n FROM sync_records WHERE domain_id='dashboard-graph'"), 0, "both epochs' rows are gone");
  assert.equal(await count(d.database, "SELECT count(*) AS n FROM sync_cursors WHERE domain_id='dashboard-graph'"), 0, "and their cursors");
  assert.equal(await count(d.database, "SELECT count(*) AS n FROM sync_meta WHERE key LIKE '%provenance-audit%'"), 0, "the source-audit copy and its index are gone");
  assert.equal(await count(d.database, "SELECT count(*) AS n FROM sync_meta WHERE key LIKE '%home-week%'"), 1, "a live page copy stays");
  assert.equal((await d.records("note")).length, 1, "a live domain stays");
});

test("this build neither knows the domain nor carries it in the browser mirror whitelist", () => {
  assert.equal(Object.hasOwn(KNOWN_SYNC_DOMAINS, "dashboard-graph"), false);
  assert.ok(RETIRED_SYNC_DOMAINS.includes("dashboard-graph"));
  assert.equal(WEB_MIRROR_DOMAIN_IDS.includes("dashboard-graph"), false);
  assert.equal(WEB_MIRROR_PAGE_COPY_IDS.includes("provenance-audit"), false);
  assert.equal(PAGE_COPY_DEFINITIONS.some((definition) => definition.id === "provenance-audit"), false);
  assert.ok(RETIRED_PAGE_COPY_IDS.includes("provenance-audit"));
});
