import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test, { type TestContext } from "node:test";
import type { SyncChangeKind } from "../src/api/contract/sync";
import type { DomainChange, DomainManifest, DomainPage, OfflineReadEnvelope } from "../src/api/contract/universal-read";
import { initializeLocalSyncDatabase } from "../src/data/sync/local-sync-database";
import { createSyncCoordinator, type SyncCoordinatorLifecycle } from "../src/data/sync/sync-coordinator";
import type { SyncClient } from "../src/data/sync/sync-client";
import { KNOWN_SYNC_DOMAINS } from "../src/data/sync/sync-domains";
import { WEB_MIRROR_DOMAIN_IDS } from "../src/data/sync/web-mirror-storage";
import { NodeTestDatabase } from "./helpers/node-sync-database";
import { dashboardGraphRows, localContactsAnalysisContacts, localDashboardSections } from "../src/view-models/dashboard-local";

// Sprint 0117: the App side of the dashboard-graph domain — the real
// coordinator and the real SQLite mirror (node:sqlite) against a scripted host
// that speaks the domain protocol. Pulled rows become the device graph the
// shared computations run on; an edit replaces a record, a delete removes it,
// a revoked grant retires every row.
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
    async sync() { const request = session.synchronize("dashboard_graph", { reason: "explicit" }); await request.started; return request.promise; },
    async records(kind: SyncChangeKind) { return (await session.readCollection(kind))?.records ?? []; },
  };
}

const at = (minute: number) => `2026-10-01T00:${String(minute).padStart(2, "0")}:00.000000Z`;
const src = (id: string) => ({ type: "manual", id: `src:${id}`, label: "手动记录" });
function graphRow(collection: string, recordId: string, minute: number, data: Record<string, unknown> | null): DomainChange {
  return { id: `${collection}/${recordId}`, revision: String(minute), operation: "upsert", payload: { collection, recordId, occurredAt: at(minute), updatedAt: at(minute), data } };
}
const contact = (id: string, name: string, minute: number, extra: Record<string, unknown> = {}) => graphRow("contacts", id, minute, {
  id, displayName: name, organization: "星河能源", role: "CEO", stage: "nurture", source: src(id), evidenceIds: [`e:${id}`], createdAt: at(minute), updatedAt: at(minute), ...extra,
});

function seedLog(): DomainChange[] {
  return [
    contact("c1", "张伟", 1, { primaryIndustryId: "technology_internet" }),
    contact("c2", "佐藤 花子", 2),
    graphRow("connections", "k1", 3, { id: "k1", accountId: A, contactId: "c1", stage: "nurture", valueTypes: ["commercial_opportunity"], summary: "储能", businessRelevanceScore: 92, source: src("k1"), evidenceIds: ["e:k1"], createdAt: at(3), updatedAt: at(3) }),
    graphRow("tasks", "t1", 4, { id: "t1", title: "跟进张伟", status: "open", contactId: "c1", connectionId: "k1", dueAt: "2026-10-03T00:00:00.000Z", source: src("t1"), evidenceIds: ["e:t1"], createdAt: at(4), updatedAt: at(4) }),
    graphRow("events", "ev1", 5, { id: "ev1", name: "储能论坛", startsAt: "2026-10-05T00:00:00.000Z", source: { type: "event_import", id: "src:ev1" }, evidenceIds: ["e:ev1"] }),
    graphRow("evidence", "e1", 50, null),
  ];
}

test("a granted dashboard-graph domain is pulled into the mirror and the shared code computes the sections from it", async (t) => {
  const host: Host = { epoch: "e1", granted: ["notes", "dashboard-graph"], calls: [], log: { "dashboard-graph": seedLog() } };
  const d = await device(t, host);
  const result = await d.sync();
  assert.equal(result?.error, null, String(result?.error));
  assert.ok(host.calls.includes("page:dashboard-graph"), "dashboard-graph is pulled");
  const rows = dashboardGraphRows(await d.records("dashboard_graph"));
  assert.equal(rows.length, 6);
  const sections = await localDashboardSections(rows, { actorId: A, now: NOW });
  assert.equal(sections.aggregate.relationshipAssetTotals.contacts, 2);
  assert.equal(sections.aggregate.relationshipAssetTotals.eventsRepresented, 1);
  assert.equal(sections.aggregate.highValueCount, 1);
  assert.equal(sections.aggregate.provenance.collectedAt, "2026-10-01T00:50:00.000Z", "a source row's record time is the graph's generatedAt");
  assert.deepEqual(sections.opportunities.highPriorityOpportunities.map((item) => item.contactId), ["c1"]);
  assert.deepEqual(sections.roleCounts, [{ role: "CEO", count: 2 }]);
});

test("an edit replaces a record, a delete removes it, and the next computation follows", async (t) => {
  const host: Host = { epoch: "e1", granted: ["dashboard-graph"], calls: [], log: { "dashboard-graph": seedLog() } };
  const d = await device(t, host);
  await d.sync();
  host.log["dashboard-graph"]!.push(contact("c3", "Émile Zola", 60));
  host.log["dashboard-graph"]!.push({ id: "events/ev1", revision: "61", operation: "delete", payload: null });
  host.log["dashboard-graph"]!.push(contact("c2", "佐藤 花子（改名）", 62));
  const result = await d.sync();
  assert.equal(result?.error, null);
  const sections = await localDashboardSections(dashboardGraphRows(await d.records("dashboard_graph")), { actorId: A, now: NOW });
  assert.equal(sections.aggregate.relationshipAssetTotals.contacts, 3);
  assert.equal(sections.aggregate.relationshipAssetTotals.eventsRepresented, 0, "the deleted event left the device");
  assert.ok(sections.aggregate.newContacts.contacts.some((item) => item.name === "佐藤 花子（改名）"));
});

test("a lease that no longer grants dashboard-graph retires every row on the device", async (t) => {
  const host: Host = { epoch: "e1", granted: ["notes", "dashboard-graph"], calls: [], log: { "dashboard-graph": seedLog() } };
  const d = await device(t, host);
  await d.sync();
  assert.equal((await d.records("dashboard_graph")).length, 6);
  host.granted = ["notes"];
  await d.sync();
  assert.deepEqual(await d.records("dashboard_graph"), [], "revoked: retired");
});

test("malformed mirror rows are ignored, never computed half-built", () => {
  const good = seedLog()[0]!;
  const rows = dashboardGraphRows([
    { id: good.id, payload: good.payload },
    { id: "contacts/other", payload: good.payload },
    { id: "contacts/c9", payload: { ...good.payload!, recordId: "c9", updatedAt: "2026-10-01T00:00:00Z" } },
    { id: "secrets/x", payload: { ...good.payload!, collection: "secrets", recordId: "x" } },
    { id: "contacts/c8", payload: { ...good.payload!, recordId: "c8", data: [1, 2] } },
  ]);
  assert.deepEqual(rows.map((row) => row.recordId), ["c1"]);
});

test("the contacts section names the page's contacts from the device's contacts copy and carries the graph's role counts", async () => {
  const rows = dashboardGraphRows(seedLog().map((change) => ({ id: change.id, payload: change.payload })));
  const sections = await localDashboardSections(rows, { actorId: A, now: NOW });
  const card = (id: string, name: string) => ({ id, card: { id, displayName: name, organization: "星河能源", role: "CEO", sourceType: "manual", status: "nurture" as const, pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: NOW }, tags: [], search: { text: name, occurredAt: at(1), updatedAt: at(1), error: null }, detail: null });
  const section = localContactsAnalysisContacts(sections, [card("c1", "张伟"), card("c2", "佐藤 花子"), card("c-other", "别人")]) as { contacts: { id: string; displayName: string }[]; roleCounts: unknown };
  assert.deepEqual(section.contacts.map((item) => item.id).sort(), ["c1", "c2"], "only contacts the page references");
  assert.deepEqual(section.roleCounts, sections.roleCounts);
});

test("the App knows the domain, and the browser mirror whitelist carries it (decision recorded in the threat model)", () => {
  assert.equal(KNOWN_SYNC_DOMAINS["dashboard-graph"], "dashboard_graph");
  assert.ok(WEB_MIRROR_DOMAIN_IDS.includes("dashboard-graph"));
});
