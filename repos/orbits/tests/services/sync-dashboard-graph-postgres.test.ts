import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { type TestContext } from "node:test";
import { Pool } from "pg";

import { createSyncDomainHandlers } from "../../app/api/sync/domain-handlers";
import { createLiveDashboardAggregateService } from "../../features/dashboard/live-service";
import { createLiveNetworkDistributionAnalyticsService } from "../../features/dashboard/live-distribution-service";
import { createLiveOpportunityReminderAnalyticsService } from "../../features/dashboard/live-opportunity-service";
import { networkDistributionProviderForAccount, opportunityProviderForAccount } from "../../features/dashboard/service-factory";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { isSyncCollection } from "../../features/sync/commit-order-lock";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { DASHBOARD_SYNC_DOMAINS, findSyncDomain, ownerGuardedCollections, SYNC_DOMAINS } from "../../features/sync/domain-registry";
import { domainManifestSchema, domainPageSchema, offlineReadEnvelopeSchema } from "../../shared/api-schema/universal-read";
import { computeDashboardSections } from "../../shared/compute/dashboard-local";
import { dashboardGraphFromSyncRows, dashboardGraphSyncRow, type DashboardGraphSyncRow } from "../../shared/compute/dashboard-graph";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

// Sprint 0117 (dashboard D3): the dashboard and contacts analysis are computed
// on the device from its copy of the sync domain "dashboard-graph" — one row
// per stored record of the actor's six graph collections, the events
// collection included. This local Postgres plays the server holding accounts
// A, B, an empty account and one whose activity strings force the SQL
// fallback; every device pull goes through the real sync route handlers. The
// device result (shared/compute, the code the App runs) is compared item by
// item with the server's SQL read model (0101) and its snapshot (0102).

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const options = { skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required", timeout: 180_000 };
const W = "workspace:dashboard-graph";
const A = "actor:graph-a";
const B = "actor:graph-b";
const EMPTY = "actor:graph-empty";
const FALLBACK = "actor:graph-fallback";
const ACTORS = [A, B, EMPTY, FALLBACK] as const;
const SECRET = "dashboard-graph-secret-0123456789abcdef0123456789abcdef";
const DOMAIN = "dashboard-graph";
const NOW = "2026-09-27T00:00:00.000Z";
const GRAPH_READ = "when 'contact_detail_states' then jsonb_build_object";
const VERSION_READ = "/* dashboard:graph-version */";
const IDENTITY = { source: "test:d3", sourceLabel: "D3 storage" };

type Row = LiveRecord<Record<string, unknown>>;
let clock = Date.parse("2026-09-26T00:00:00.000Z");
/** A strictly decreasing record time (µs precision exercised by the extra digits). */
function stamp(): string {
  clock -= 61_001;
  return new Date(clock).toISOString();
}

const source = (type: string, id: string, label?: string) => ({ type, id, ...(label === undefined ? {} : { label }) });

function record(collectionName: string, recordId: string, payload: Record<string, unknown>, options: { userId?: string | null; lifecycleState?: Row["lifecycleState"]; at?: string; occurredAt?: string | null } = {}): Row {
  const at = options.at ?? stamp();
  return {
    workspaceId: W, collectionName, recordId, userId: options.userId === undefined ? A : options.userId,
    sourceType: "system", sourceId: `source:${recordId}`, evidenceIds: [],
    occurredAt: options.occurredAt === undefined ? at : options.occurredAt, createdAt: at, updatedAt: at,
    deletedAt: options.lifecycleState === "deleted" ? at : null, lifecycleState: options.lifecycleState ?? "active", payload,
  };
}

const contact = (id: string, fields: Record<string, unknown>, options: Parameters<typeof record>[3] = {}) => record("contacts", options.userId && options.userId !== A ? `${id}@${options.userId}` : id, {
  id, displayName: `Name ${id}`, stage: "active", source: source("manual", `src:${id}`, `Label ${id}`), evidenceIds: [`e:${id}`],
  createdAt: stamp(), updatedAt: "2026-09-01T00:00:00.000Z", ...fields,
}, options);
const connection = (id: string, contactId: string, fields: Record<string, unknown>, options: Parameters<typeof record>[3] = {}) => record("connections", id, {
  id, accountId: options.userId ?? A, contactId, stage: "active", valueTypes: [], summary: `Summary ${id}`, source: source("manual", `src:${id}`),
  evidenceIds: [`e:${id}`], suggestedActions: [`act ${id}`], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...fields,
}, options);
const task = (id: string, fields: Record<string, unknown>, options: Parameters<typeof record>[3] = {}) => record("tasks", id, {
  id, title: `Task ${id}`, status: "open", source: source("manual", `src:${id}`, `Task source ${id}`), evidenceIds: [`e:${id}`],
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: stamp(), ...fields,
}, options);
const event = (id: string, fields: Record<string, unknown> = {}, options: Parameters<typeof record>[3] = {}) => record("events", id, {
  id, name: `Event ${id}`, startsAt: "2026-10-01T00:00:00.000Z", source: source("event_import", `src:${id}`), evidenceIds: [`e:${id}`, "e:shared"],
  organizerNote: `private note ${id}`, ...fields,
}, options);
const evidence = (id: string, summary: string, options: Parameters<typeof record>[3] = {}) => record("evidence", id, {
  id, sourceType: "manual", sourceId: `s:${id}`, summary, occurredAt: "2026-09-01", confidence: 0.8, createdBy: "t",
}, options);
const detailState = (contactId: string, tags: string[], options: Parameters<typeof record>[3] = {}) => record("contact_detail_states", `state:${contactId}:${options.userId ?? A}`, { contactId, tags }, options);

/** A varied corpus: Chinese/Japanese/Latin labels, aliases, thresholds, ties, deletes, foreign and ownerless rows. */
function corpus(): Row[] {
  const tieAt = "2026-09-10T10:10:10.123Z";
  return [
    contact("c01", { displayName: "张伟", role: "CEO", location: "東京都 港区", organization: "星河能源", primaryIndustryId: "technology_internet", stage: "nurture" }),
    contact("c02", { displayName: "佐藤 花子", role: " 销售总监 ", location: "Tokyo", organization: "Acme", primaryIndustryId: "finance_investment", source: source("event_import", "src:c02") }),
    contact("c03", { displayName: "Émile Zola", role: "   ", location: "  ", organization: "Acme", primaryIndustryId: "not_an_industry", stage: "nurture", source: source("business_card_ocr", "src:c03", "  ") }),
    contact("c04", { displayName: "李娜", role: "Founder", location: "osaka", organization: " Acme ", primaryIndustryId: "technology_internet", evidenceIds: ["e:c04", "", 7, "e:c04", "e:shared"] }),
    contact("c05", { displayName: "王一凡", role: "Investor Partner", location: "大阪", organization: "Capital Partners", stage: "needs_follow_up", source: source("referral", "src:c05") }),
    contact("c06", { displayName: "Jürgen Straße", role: "Consultant", location: "Paris", organization: "星河能源", primaryIndustryId: "technology_internet", stage: "nurture" }),
    contact("c07", { displayName: "mIxEd CaSe", role: "operator", location: "paris", organization: "東京ベンチャーズ", stage: "captured", accountId: A }),
    contact("c08", { displayName: "山田 太郎", role: "代表取締役", location: "神戸", organization: "Delta", primaryIndustryId: "retail_consumer", stage: "nurture" }),
    contact("c09", { displayName: "陈静", location: "上海", organization: "Epsilon Capital", primaryIndustryId: "retail_consumer", stage: "nurture", source: source("chat_summary", "src:shared", "First label") }),
    contact("c10", { displayName: "Zoë Durand", role: "Marketing Lead", location: "深圳", organization: "Zeta", primaryIndustryId: "retail_consumer", stage: "nurture", source: source("chat_summary", "src:shared", "Last label") }),
    contact("c11", { displayName: "赵六", role: "顾问", location: "Yokohama", organization: "横浜商事", stage: "archived", source: source("weird_type", "src:c11") }),
    // Activity strings in mixed ASCII formats, ordered like en-US localeCompare on both sides.
    contact("c12", { createdAt: "2026-09-19T23:59:59.999999+00:00" }),
    contact("c13", { createdAt: "2026-09-19 23:59:59" }),
    contact("c14", { createdAt: "2026-09-19T23:59:59Z" }),
    contact("c15", { createdAt: "2026-09-19t23:59:59z" }),
    contact("c01-dup", { id: "c01", displayName: "Dup 张伟", organization: "Dup Org", role: "Head of Sales", stage: "nurture" }),
    contact("c-deleted", { role: "CEO", stage: "nurture" }, { lifecycleState: "deleted" }),
    contact("c-invalid-evidence", { evidenceIds: ["", 3] }),
    contact("c-invalid-stage", { stage: "unknown" }),
    contact("c-foreign-account", { displayName: "secret-foreign-account", accountId: B, stage: "nurture" }),

    connection("k01", "c01", { businessRelevanceScore: 69.5, relationshipStrength: 90, valueTypes: ["commercial_opportunity"], summary: "储能试点合作伙伴" }),
    connection("k02", "c02", { businessRelevanceScore: 69.49999999999999, valueTypes: ["strategic_fit"] }),
    connection("k03", "c04", { valueTypes: ["commercial_opportunity", "referral_path", "bogus"] }),
    connection("k04", "c05", { businessRelevanceScore: 0, relationshipStrength: 95, valueTypes: ["referral_path"], trustLevel: "trusted" }),
    connection("k05", "c06", { relationshipStrength: 70, valueTypes: ["strategic_fit", "bogus"] }),
    connection("k06", "c08", { relationshipStrength: 45, stage: "nurture" }),
    connection("k07", "c02", { businessRelevanceScore: 88, relationshipStrength: 30, valueTypes: ["commercial_opportunity"] }),
    connection("k08", "contact:missing", { businessRelevanceScore: 99 }),
    connection("k09", "c07", { businessRelevanceScore: 70.4 }),
    connection("k10", "c09", { businessRelevanceScore: 12, relationshipStrength: 44.99999999999999, stage: "nurture" }),
    connection("k11", "c10", { businessRelevanceScore: 85, stage: "nurture", valueTypes: ["knowledge_exchange"] }),
    connection("k12", "c11", { businessRelevanceScore: 91, stage: "archived", valueTypes: ["community_context"] }),
    connection("k-deleted", "c01", { businessRelevanceScore: 99 }, { lifecycleState: "deleted" }),
    connection("k-invalid", "c01", { businessRelevanceScore: 99, summary: "  " }),

    event("ev1", { name: "储能论坛" }),
    event("ev2", { source: source("manual", "src:ev2") }),
    event("ev3", { name: "東京 AI Night", location: "東京" }),
    event("ev-deleted", {}, { lifecycleState: "deleted" }),
    event("ev-invalid", { name: "" }),

    task("t01", { contactId: "c01", connectionId: "k01", dueAt: "2026-09-27T00:00:00.000Z" }),
    task("t02", { contactId: "contact:missing", dueAt: "2026-09-25T12:00:00.000Z", status: "scheduled" }),
    task("t03", { dueAt: "not a date" }),
    task("t04", { contactId: "c02", connectionId: "k07" }),
    task("t05", { contactId: "c05", connectionId: "k04", dueAt: "2026-09-28T00:00:00.000Z" }),
    task("t06", { contactId: "  ", dueAt: "2026-08-01T00:00:00.000Z" }),
    task("t07", { contactId: "c06", connectionId: "k05", dueAt: "2026-09-30T23:59:00.000Z", status: "scheduled" }),
    task("t08", { updatedAt: "2026-09-19T23:59:59.5+09:00", contactId: "c10", connectionId: "k11", dueAt: "2026-10-09T00:00:00" }),
    task("t09", { updatedAt: "2026-09-19T23:59:59_", title: "跟进 張偉" }),
    task("t-tie-a", { title: "同一时刻 A" }, { at: tieAt }),
    task("t-tie-b", { title: "同一时刻 B" }, { at: tieAt }),
    task("t-completed", { status: "completed" }),
    task("t-deleted", { status: "open" }, { lifecycleState: "deleted" }),
    task("t-invalid", { status: "waiting" }),

    evidence("evd1", "secret evidence text a1"),
    evidence("evd-latest", "secret evidence text latest", { at: "2026-12-30T00:00:00.123456Z" }),
    detailState("c01", ["vip", "储能"], { at: "2026-12-31T00:00:00.000Z" }),
    detailState("c06", ["investor"]),

    // B shares domain ids with A; nothing may cross.
    contact("c01", { displayName: "secret-b-张", role: "CFO", location: "Tokyo", stage: "nurture", primaryIndustryId: "finance_investment" }, { userId: B }),
    connection("k-b1", "c01", { businessRelevanceScore: 91, summary: "secret-b-relationship" }, { userId: B }),
    task("t-b1", { contactId: "c01", connectionId: "k-b1", dueAt: "2026-09-28T00:00:00.000Z", title: "secret-b-task" }, { userId: B }),
    event("ev-b1", { name: "secret-b-event" }, { userId: B }),
    evidence("evd-b1", "secret-b-evidence", { userId: B }),
    // Non-ASCII activity strings cannot be ordered in SQL: that account's server read falls back to the graph.
    contact("c-fullwidth", { createdAt: "２０２６-09-19T00:00:00.000Z", displayName: "全角 时间" }, { userId: FALLBACK }),
    contact("c-fullwidth-2", { createdAt: "2026-09-18T00:00:00.000Z", displayName: "半角 时间" }, { userId: FALLBACK }),
    // Ownerless seed rows are in nobody's graph.
    contact("c-unowned", { displayName: "secret-ownerless", stage: "nurture" }, { userId: null }),
    event("ev-unowned", { name: "secret-ownerless-event" }, { userId: null }),
  ];
}

async function host(t: TestContext) {
  clock = Date.parse("2026-09-26T00:00:00.000Z");
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `dashboard_graph_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  t.after(async () => { try { await client.close(); } finally { try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); } } });
  await admin.query(`create schema ${schema}`);
  await client.query(ORBIT_RECORDS_SCHEMA_SQL);
  await client.query(STRICT_SYNC_REVISION_SQL);
  const store = createPostgresLiveRecordStore({ client });
  const identity = async (actor: string, state: "active" | "deleted") => store.upsertRecord({
    workspaceId: W, collectionName: "accounts", recordId: actor, userId: actor, sourceType: "manual", sourceId: actor, evidenceIds: [],
    lifecycleState: state, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: new Date(Date.now()).toISOString(), payload: { id: actor },
  });
  for (const actor of ACTORS) await identity(actor, "active");
  const service = createDomainReadService({ client, cursorSecret: SECRET, now: () => NOW, domains: DASHBOARD_SYNC_DOMAINS });
  const handlersFor = (actor: string) => createSyncDomainHandlers({
    resolveActor: async () => ({ id: actor, userId: actor, workspaceId: W }), createService: () => service, now: () => Date.parse(NOW),
    conditionalRead: { client, workspaceId: W, version: "test" },
  });
  const provider = (sqlClient: LiveRecordSqlClient = client) => createStorageDashboardAggregateProvider({ sqlClient, workspaceId: W, ...IDENTITY });
  return { client, store, identity, handlersFor, provider };
}

type Host = Awaited<ReturnType<typeof host>>;

/** A device's copy of the domain, following its cursor through the real route handler (resets on 409 like the App). */
function device(h: Host, actor: string) {
  const rows = new Map<string, Record<string, unknown>>();
  let cursor: string | undefined;
  const log = { resets: 0 };
  return {
    rows,
    log,
    graphRows(): DashboardGraphSyncRow[] {
      return [...rows.values()].map((payload) => dashboardGraphSyncRow(payload)).filter((row): row is DashboardGraphSyncRow => row !== null);
    },
    async pull(): Promise<{ upserts: number; deletes: number; ids: string[] }> {
      let upserts = 0, deletes = 0;
      const ids: string[] = [];
      for (let page = 0; page < 60; page += 1) {
        const response = await h.handlersFor(actor).domain(new Request(`https://orbit.local/api/sync/domains/${DOMAIN}?limit=7${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`), DOMAIN);
        if (response.status === 409) { rows.clear(); cursor = undefined; log.resets += 1; continue; }
        assert.equal(response.status, 200, await response.clone().text());
        const raw = ((await response.json()) as { data: unknown }).data;
        const data = domainPageSchema.parse(raw);
        for (const change of data.changes) {
          ids.push(change.id);
          if (change.operation === "upsert") { rows.set(change.id, change.payload as Record<string, unknown>); upserts += 1; }
          else { rows.delete(change.id); deletes += 1; }
        }
        cursor = data.nextCursor;
        if (!data.hasMore) return { upserts, deletes, ids };
      }
      throw new Error("pagination did not terminate");
    },
  };
}

async function seed(h: Host) {
  for (const row of corpus()) await h.store.upsertRecord(row);
}

async function serverSections(h: Host, actorId: string, sqlClient?: LiveRecordSqlClient) {
  const provider = h.provider(sqlClient);
  const now = () => NOW;
  const dashboard = createLiveDashboardAggregateService({ provider });
  const distribution = createLiveNetworkDistributionAnalyticsService({ now, provider: networkDistributionProviderForAccount(provider, actorId) });
  const opportunity = createLiveOpportunityReminderAnalyticsService({ now, provider: opportunityProviderForAccount(provider, actorId) });
  const unwrap = <T>(result: { success: true; data: T } | { success: false }): T => {
    assert.equal(result.success, true, JSON.stringify(result));
    return (result as { data: T }).data;
  };
  return {
    aggregate: unwrap(await dashboard.getDashboardAggregate({ actorId, activityLimit: 4 })),
    summary: unwrap(await dashboard.getDashboardSummary({ actorId })),
    distributions: unwrap(await distribution.getDistributions()),
    gaps: unwrap(await distribution.getNetworkGaps()),
    opportunities: unwrap(await opportunity.getOpportunityReminderAnalytics()),
    roleCounts: [...(await provider.readContactRoleCountsForAccount!(actorId))].sort((left, right) => (left.role < right.role ? -1 : 1)),
  };
}

async function deviceSections(d: ReturnType<typeof device>, actorId: string) {
  const sections = await computeDashboardSections(dashboardGraphFromSyncRows(d.graphRows()), {
    actorId, now: NOW, activityLimit: 4, aggregate: IDENTITY, distribution: IDENTITY, opportunity: IDENTITY,
  });
  return { ...sections, roleCounts: [...sections.roleCounts].sort((left, right) => (left.role < right.role ? -1 : 1)) };
}

function recordingClient(client: LiveRecordSqlClient): LiveRecordSqlClient & { texts: string[] } {
  const texts: string[] = [];
  return { texts, query: (text: string, values?: readonly unknown[]) => { texts.push(text); return client.query(text, values as unknown[]); } } as LiveRecordSqlClient & { texts: string[] };
}

test("registry: dashboard-graph is a leased device domain of the actor's six graph collections; every one, the events collection included, is owner guarded and takes the commit-order lock", options, async (t) => {
  const domain = findSyncDomain(DOMAIN, SYNC_DOMAINS);
  assert.ok(domain, "dashboard-graph is leased to every authorized account");
  assert.equal(domain.exposure, "device");
  assert.deepEqual(domain.ownership, { rule: "column", column: "user_id" });
  assert.equal(domain.source.kind, "dashboard_graph");
  assert.deepEqual([...domain.fields].sort(), ["collection", "data", "occurredAt", "recordId", "updatedAt"]);
  for (const collection of ["contacts", "connections", "contact_detail_states", "evidence", "events", "tasks"]) {
    assert.ok(ownerGuardedCollections().includes(collection), `${collection} is owner guarded`);
    assert.ok(isSyncCollection(collection), `${collection} writes take the commit-order lock`);
  }
  const h = await host(t);
  const lease = offlineReadEnvelopeSchema.parse(((await (await h.handlersFor(A).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"))).json()) as { data: unknown }).data);
  assert.deepEqual(lease.grants.map((grant) => grant.domainId), [DOMAIN]);
});

test("isolation: A's device holds only A's own records; B's, ownerless and other-account contacts never arrive, and a source row carries no content", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const a = device(h, A);
  const b = device(h, B);
  await a.pull();
  await b.pull();
  const aText = JSON.stringify([...a.rows.values()]);
  for (const secret of ["secret-b", "secret-ownerless", "secret-foreign-account", "secret evidence text", "private note"]) {
    assert.ok(!aText.includes(secret), `${secret} must not reach A's device`);
  }
  assert.ok(!JSON.stringify([...b.rows.values()]).includes("星河能源"), "A's labels never reach B");
  assert.ok(a.rows.has("events/ev1") && a.rows.has("tasks/t01") && a.rows.has("contact_detail_states/state:c01:actor:graph-a"));
  assert.ok(!a.rows.has("contacts/c-foreign-account"), "a contact of A's row set whose accountId is another account is not A's graph");
  assert.ok(!a.rows.has("contacts/c-deleted") && !a.rows.has("events/ev-deleted"), "soft-deleted rows are not sent to a new device");
  for (const [id, payload] of a.rows) {
    assert.deepEqual(Object.keys(payload).sort(), ["collection", "data", "occurredAt", "recordId", "updatedAt"], id);
    assert.ok(dashboardGraphSyncRow(payload), `${id} is a well-formed row`);
    if (payload.collection === "evidence") assert.equal(payload.data, null, "a source row carries only its record time");
  }
  assert.equal(JSON.stringify(a.rows.get("events/ev1")?.data).includes("organizerNote"), false, "only the projected event fields leave the server");
  assert.deepEqual([...b.rows.keys()].sort(), ["connections/k-b1", "contacts/c01@actor:graph-b", "events/ev-b1", "evidence/evd-b1", "tasks/t-b1"]);
});

test("incremental: a full first pull, then only the changed record; B's and ownerless writes send nothing; soft deletes and a contact moving to another account are deletes", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const a = device(h, A);
  const first = await a.pull();
  // A first pull's first page carries no tombstones; its later pages may carry
  // the delete of a record the device never had (as the contacts domain does),
  // which leaves the copy unchanged.
  assert.ok(first.upserts > 40 && first.deletes <= 5, `first pull ${JSON.stringify({ upserts: first.upserts, deletes: first.deletes })}`);
  for (const gone of ["contacts/c-deleted", "contacts/c-foreign-account", "connections/k-deleted", "events/ev-deleted", "tasks/t-deleted"]) assert.ok(!a.rows.has(gone), gone);
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 0, ids: [] }, "nothing changed");

  await h.store.upsertRecord(event("ev1", { name: "储能论坛（第二届）" }));
  assert.deepEqual(await a.pull(), { upserts: 1, deletes: 0, ids: ["events/ev1"] }, "an event edit sends that event only");
  assert.equal((a.rows.get("events/ev1")!.data as { name: string }).name, "储能论坛（第二届）");

  await h.store.upsertRecord(evidence("evd1", "secret evidence edited"));
  assert.deepEqual(await a.pull(), { upserts: 1, deletes: 0, ids: ["evidence/evd1"] }, "a source edit moves its record time only");
  assert.equal(a.rows.get("evidence/evd1")!.data, null);

  await h.store.upsertRecord(contact("c01", { displayName: "secret-b-2" }, { userId: B }));
  await h.store.upsertRecord(event("ev-unowned", { name: "secret-ownerless-2" }, { userId: null }));
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 0, ids: [] }, "another account's and ownerless writes send A nothing");

  await h.store.deleteRecord({ workspaceId: W, collectionName: "tasks", recordId: "t04", deletedAt: stamp() });
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 1, ids: ["tasks/t04"] }, "a soft-deleted task is a delete");

  await h.store.upsertRecord(contact("c07", { displayName: "mIxEd CaSe", accountId: B }));
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 1, ids: ["contacts/c07"] }, "a contact whose accountId leaves A is removed from A's graph");
  await h.store.upsertRecord(contact("c07", { displayName: "mIxEd CaSe", accountId: A }));
  assert.deepEqual(await a.pull(), { upserts: 1, deletes: 0, ids: ["contacts/c07"] }, "and comes back when it returns");
  assert.deepEqual(await a.pull(), { upserts: 0, deletes: 0, ids: [] });
});

test("revocation: an actor whose identity rows are gone gets no grant and cannot read the graph; the epoch change resets the cursor and the rebuild matches", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const a = device(h, A);
  await a.pull();
  await h.identity(A, "deleted");
  const lease = offlineReadEnvelopeSchema.parse(((await (await h.handlersFor(A).lease(new Request("https://orbit.local/api/sync/lease?baseUrl=https%3A%2F%2Fapp.local"))).json()) as { data: unknown }).data);
  assert.deepEqual(lease.grants, []);
  assert.equal((await h.handlersFor(A).domain(new Request(`https://orbit.local/api/sync/domains/${DOMAIN}`), DOMAIN)).status, 403);
  await h.identity(A, "active");
  const before = [...a.rows.keys()].sort();
  await a.pull();
  assert.equal(a.log.resets, 1, "the old cursor is refused once and the domain is rebuilt");
  assert.deepEqual([...a.rows.keys()].sort(), before);
});

test("the manifest stays conditional: unchanged is a 304; an event write is a 200", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const manifest = async (etag?: string) => h.handlersFor(A).manifest(new Request("https://orbit.local/api/sync/manifest", etag ? { headers: { "If-None-Match": etag } } : {}));
  let response = await manifest();
  assert.equal(response.status, 200);
  const entry = domainManifestSchema.parse(((await response.json()) as { data: unknown }).data).domains.find((domain) => domain.domainId === DOMAIN);
  assert.ok(entry && Number(entry.watermark) > 0);
  const etag = response.headers.get("ETag")!;
  assert.equal((await manifest(etag)).status, 304);
  // Writers stamp updated_at with the current time; the manifest watermark is max(updated_at) + count.
  await h.store.upsertRecord(event("ev2", { name: "manifest" }, { at: "2027-03-01T00:00:00.000000Z" }));
  response = await manifest(etag);
  assert.equal(response.status, 200);
});

test("owner guard and lock on the events collection: an owned event cannot change owner, a first owner can still be given, and an unlocked event write is refused", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const locked = (sql: string) => `with sync_write_lock as materialized (select set_config('orbit.sync_write_lock_key', orbit_records_sync_write_lock_key()::text, true) as k from (select pg_advisory_xact_lock(orbit_records_sync_write_lock_key())) l) ${sql}`;
  await assert.rejects(
    h.client.query(locked("update orbit_records set user_id = $2 from sync_write_lock where workspace_id = $1 and collection_name = 'events' and record_id = 'ev1'"), [W, B]),
    /SYNC_OWNER_CHANGE_UNREGISTERED/, "an owned event cannot move to another owner",
  );
  await assert.rejects(
    h.client.query(locked("update orbit_records set user_id = null from sync_write_lock where workspace_id = $1 and collection_name = 'events' and record_id = 'ev1'"), [W]),
    /SYNC_OWNER_CHANGE_UNREGISTERED/, "an owned event cannot lose its owner",
  );
  await h.client.query(locked("update orbit_records set user_id = $2 from sync_write_lock where workspace_id = $1 and collection_name = 'events' and record_id = 'ev-unowned' and user_id is null"), [W, A]);
  await assert.rejects(
    h.client.query("update orbit_records set payload = payload where workspace_id = $1 and collection_name = 'events' and record_id = 'ev1'", [W]),
    /SYNC_WRITE_LOCK_REQUIRED/, "an event write without the commit-order lock is refused",
  );
});

test("parity: for every account, the device's dashboard and contacts-analysis sections equal the server's SQL read model and its snapshot, before and after writes", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const devices = new Map(ACTORS.map((actor) => [actor, device(h, actor)] as const));
  const compare = async (phase: string) => {
    for (const actor of ACTORS) {
      const d = devices.get(actor)!;
      await d.pull();
      const local = await deviceSections(d, actor);
      const measured = recordingClient(h.client);
      const first = await serverSections(h, actor, measured);
      for (const key of Object.keys(local) as (keyof typeof local)[]) {
        assert.deepEqual(local[key], first[key], `${phase} ${actor} ${key}: device = server`);
      }
      // The second read is served from the snapshot (no graph read) and still equals the device.
      measured.texts.length = 0;
      const snapshot = await serverSections(h, actor, measured);
      assert.equal(measured.texts.some((text) => text.includes(GRAPH_READ)) , actor === FALLBACK, `${phase} ${actor}: the snapshot read reads the graph only for the fallback account's aggregate`);
      assert.ok(measured.texts.some((text) => text.includes(VERSION_READ)), `${phase} ${actor}: gaps/opportunities come from the versioned snapshot`);
      assert.deepEqual(local.gaps, snapshot.gaps, `${phase} ${actor} gaps: device = snapshot`);
      assert.deepEqual(local.opportunities, snapshot.opportunities, `${phase} ${actor} opportunities: device = snapshot`);
    }
  };
  await compare("initial");
  const a = await deviceSections(devices.get(A)!, A);
  // The corpus exercises what it claims: thresholds, short lists, CJK labels, the generatedAt from a source's record time.
  assert.equal(a.aggregate.highValueCount, 8);
  assert.equal(a.aggregate.relationshipAssetTotals.eventsRepresented, 3);
  assert.equal(a.aggregate.newContacts.contacts.length, 5);
  assert.equal(a.aggregate.provenance.collectedAt, "2026-12-31T00:00:00.000Z");
  assert.ok(a.opportunities.highPriorityOpportunities.length > 0 && a.gaps.gaps.length > 0);
  assert.ok(a.distributions.structureDistributions.location.some((bucket) => bucket.label === "东京"), "location aliases merge");
  assert.ok(a.roleCounts.length > 3);
  const empty = await deviceSections(devices.get(EMPTY)!, EMPTY);
  assert.equal(empty.aggregate.state, "empty");

  // Writes of every kind move the device and the server together.
  await h.store.upsertRecord({ ...connection("k05", "c06", { relationshipStrength: 69 }), lifecycleState: "deleted", deletedAt: stamp() });
  await h.store.upsertRecord(connection("k09", "c07", { businessRelevanceScore: 96, valueTypes: ["referral_path"] }));
  await h.store.upsertRecord(contact("c16", { displayName: "新联系人", role: "CTO", location: "東京", stage: "nurture" }, { at: "2026-09-26T12:00:00.000Z" }));
  await h.store.deleteRecord({ workspaceId: W, collectionName: "tasks", recordId: "t01", deletedAt: stamp() });
  await h.store.upsertRecord(event("ev3", { name: "東京 AI Night 2" }));
  await h.store.upsertRecord(detailState("c06", ["investor", "vip"]));
  await h.store.upsertRecord(evidence("evd-newest", "secret newest", { at: "2027-01-02T03:04:05.678901Z" }));
  await h.store.upsertRecord(task("t10", { contactId: "c16", connectionId: "k09", dueAt: "2026-09-29T00:00:00.000Z", title: "新任务" }));
  await h.store.upsertRecord(contact("c01", { displayName: "secret-b-3", stage: "active" }, { userId: B }));
  await compare("after-writes");
  const after = await deviceSections(devices.get(A)!, A);
  assert.equal(after.aggregate.provenance.collectedAt, "2027-01-02T03:04:05.678Z", "a source's record time moves generatedAt on the device too");
});

test("the registered demo reset handler may clear an event's owner under the lock and rotates the previous owner's epoch, so the device rebuilds without the event", options, async (t) => {
  const h = await host(t);
  await seed(h);
  const a = device(h, A);
  await a.pull();
  assert.ok(a.rows.has("events/ev1"));
  const { actAsOwnerChangeHandler, rotateAuthorizationEpochs } = await import("../../features/sync/owner-guard");
  const { acquireSyncCommitOrderLock } = await import("../../features/sync/commit-order-lock");
  // Without the handler name the guard refuses, even under the lock.
  await assert.rejects(h.client.transaction(async (tx) => {
    await acquireSyncCommitOrderLock(tx);
    await tx.query("update orbit_records set user_id = null where workspace_id = $1 and collection_name = 'events' and record_id = 'ev1'", [W]);
  }), /SYNC_OWNER_CHANGE_UNREGISTERED/);
  // A name that is not a registered reassign handler opens nothing.
  await assert.rejects(h.client.transaction(async (tx) => { await actAsOwnerChangeHandler(tx, "owner-backfill-0114"); }), /registered owner-change handler/);
  await h.client.transaction(async (tx) => {
    await acquireSyncCommitOrderLock(tx);
    await actAsOwnerChangeHandler(tx, "demo-event-owner-reset");
    await tx.query("update orbit_records set user_id = null where workspace_id = $1 and collection_name = 'events' and record_id = 'ev1'", [W]);
    await rotateAuthorizationEpochs(tx, W, [A]);
  });
  await a.pull();
  assert.equal(a.log.resets, 1, "the rotated epoch refuses the old cursor once");
  assert.ok(!a.rows.has("events/ev1"), "the rebuilt copy no longer holds the event that left");
  const local = await deviceSections(a, A);
  const server = await serverSections(h, A);
  assert.deepEqual(local.aggregate, server.aggregate);
  assert.equal(local.aggregate.relationshipAssetTotals.eventsRepresented, 2);
});
