import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import {
  createPostgresContactRecordPageReader,
  createStorageContactGraphProvider,
} from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { DASHBOARD_SHORT_LIST_LIMIT } from "../../features/dashboard/contract";
import { createLiveDashboardAggregateService, type LiveDashboardAggregateProvider } from "../../features/dashboard/live-service";
import { createLiveNetworkDistributionAnalyticsService } from "../../features/dashboard/live-distribution-service";
import { createLiveOpportunityReminderAnalyticsService } from "../../features/dashboard/live-opportunity-service";
import {
  networkDistributionProviderForAccount,
  opportunityProviderForAccount,
} from "../../features/dashboard/service-factory";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { createMobileContactsDashboardServiceFromSources } from "../../features/mobile/contacts-dashboard-service";
import { createMockProfileService } from "../../features/profile/mock-service";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

// Sprint 0101 equivalence ("对照") test. The SQL read model must return the
// same numbers and lists as the existing JavaScript graph computation, which is
// kept as the oracle: the oracle provider below exposes only the full-graph
// reads, so the services fall back to the original JS code for every section.

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const WORKSPACE = "workspace:d1-sql-read-model";
const OWNER = "account:d1-owner";
const OTHER = "account:d1-other";
const EMPTY = "account:d1-empty";
const FALLBACK = "account:d1-fallback";
const ACTORS = [OWNER, OTHER, EMPTY, FALLBACK, "account:d1-missing"] as const;
const GRAPH_PROJECTION_MARKER = "when 'contact_detail_states' then jsonb_build_object";

type Row = LiveRecord<Record<string, unknown>>;

let clock = Date.parse("2026-09-20T00:00:00.000Z");
function nextTime(): string {
  clock -= 60_000;
  return new Date(clock).toISOString();
}

function record(
  collectionName: string,
  recordId: string,
  payload: Record<string, unknown>,
  options: { userId?: string | null; lifecycleState?: Row["lifecycleState"]; updatedAt?: string } = {},
): Row {
  const updatedAt = options.updatedAt ?? nextTime();
  return {
    workspaceId: WORKSPACE,
    collectionName,
    recordId,
    userId: options.userId === undefined ? OWNER : options.userId,
    sourceType: "system",
    sourceId: `source:${recordId}`,
    evidenceIds: [],
    occurredAt: updatedAt,
    createdAt: updatedAt,
    updatedAt,
    deletedAt: options.lifecycleState === "deleted" ? updatedAt : null,
    lifecycleState: options.lifecycleState ?? "active",
    payload,
  };
}

const source = (type: string, id: string, label?: string) => ({ type, id, ...(label === undefined ? {} : { label }) });

function contact(id: string, fields: Record<string, unknown>, options: Parameters<typeof record>[3] = {}): Row {
  return record("contacts", id, {
    id,
    displayName: `Name ${id}`,
    stage: "active",
    source: source("manual", `src:${id}`, `Label ${id}`),
    evidenceIds: [`e:${id}`],
    createdAt: nextTime(),
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...fields,
  }, options);
}

function connection(id: string, contactId: string, fields: Record<string, unknown>, options: Parameters<typeof record>[3] = {}): Row {
  return record("connections", id, {
    id,
    accountId: options.userId ?? OWNER,
    contactId,
    stage: "active",
    valueTypes: [],
    summary: `Summary ${id}`,
    source: source("manual", `src:${id}`),
    evidenceIds: [`e:${id}`],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...fields,
  }, options);
}

function task(id: string, fields: Record<string, unknown>, options: Parameters<typeof record>[3] = {}): Row {
  return record("tasks", id, {
    id,
    title: `Task ${id}`,
    status: "open",
    source: source("manual", `src:${id}`, `Task source ${id}`),
    evidenceIds: [`e:${id}`],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: nextTime(),
    ...fields,
  }, options);
}

function event(id: string, fields: Record<string, unknown> = {}, options: Parameters<typeof record>[3] = {}): Row {
  return record("events", id, {
    id,
    name: `Event ${id}`,
    startsAt: "2026-10-01T00:00:00.000Z",
    source: source("event_import", `src:${id}`),
    evidenceIds: [`e:${id}`, "e:shared"],
    ...fields,
  }, options);
}

function fixtureRecords(): Row[] {
  return [
    // Contacts: more than five per list, aliases, empty/whitespace values,
    // invalid industries, investor keywords, and both source-type mappings.
    contact("c01", { role: "CEO", location: "東京都 港区", organization: "Capital Partners", primaryIndustryId: "technology_internet", stage: "nurture" }),
    contact("c02", { role: " 销售总监 ", location: "Tokyo", organization: "Acme", primaryIndustryId: "finance_investment", source: source("event_import", "src:c02") }),
    contact("c03", { role: "   ", location: "  ", organization: "Acme", primaryIndustryId: "not_an_industry", stage: "nurture", source: source("business_card_ocr", "src:c03", "  ") }),
    contact("c04", { role: "Founder", location: "osaka", organization: " Acme ", primaryIndustryId: "technology_internet", evidenceIds: ["e:c04", "", 7, "e:c04", "e:shared"] }),
    contact("c05", { role: "Investor Partner", location: "Kyoto", organization: "Beta", stage: "needs_follow_up", source: source("referral", "src:c05") }),
    contact("c06", { role: "Consultant", location: "Paris", organization: "Gamma", primaryIndustryId: "technology_internet", stage: "nurture" }),
    contact("c07", { role: "operator", location: "paris", organization: "Gamma", stage: "captured", accountId: OWNER }),
    contact("c08", { role: "代表取締役", location: "神戸", organization: "Delta", primaryIndustryId: "retail_consumer", stage: "nurture" }),
    contact("c09", { location: "Yokohama", organization: "Epsilon Capital", primaryIndustryId: "retail_consumer", stage: "nurture", source: source("chat_summary", "src:shared", "First label") }),
    contact("c10", { role: "Marketing Lead", organization: "Zeta", primaryIndustryId: "retail_consumer", stage: "nurture", source: source("chat_summary", "src:shared", "Last label") }),
    // Activity strings in mixed ASCII formats: ordered like JS localeCompare.
    contact("c12", { createdAt: "2026-09-19T23:59:59.999999+00:00" }),
    contact("c13", { createdAt: "2026-09-19 23:59:59" }),
    contact("c14", { createdAt: "2026-09-19T23:59:59Z" }),
    contact("c15", { createdAt: "2026-09-19T23:59:590" }),
    contact("c16", { createdAt: "2026-09-19T23:59:59:00" }),
    contact("c17", { createdAt: "2026-09-19t23:59:59z" }),
    // Same domain id in two records of one account: lookups by id use the last in graph order.
    contact("c01-dup", { id: "c01", displayName: "Dup C01", organization: "Dup Org", role: "Head of Sales", stage: "nurture" }),
    // Excluded contacts: soft-deleted, invalid, and owned by another account.
    contact("c-deleted", { role: "CEO", stage: "nurture" }, { lifecycleState: "deleted" }),
    contact("c-invalid-evidence", { evidenceIds: ["", 3] }),
    contact("c-invalid-stage", { stage: "unknown" }),
    contact("c-foreign-account", { accountId: OTHER, stage: "nurture" }),

    // Connections: priority exactly on, just below and above the threshold.
    connection("k01", "c01", { businessRelevanceScore: 69.5, relationshipStrength: 90, valueTypes: ["commercial_opportunity"] }),
    connection("k02", "c02", { businessRelevanceScore: 69.49999999999999, valueTypes: ["strategic_fit"] }),
    connection("k03", "c04", { valueTypes: ["commercial_opportunity", "referral_path", "bogus"] }),
    connection("k04", "c05", { businessRelevanceScore: 0, relationshipStrength: 95, valueTypes: ["referral_path"] }),
    connection("k05", "c06", { relationshipStrength: 70, valueTypes: ["strategic_fit", "bogus"] }),
    connection("k06", "c08", { relationshipStrength: 45 }),
    connection("k07", "c02", { businessRelevanceScore: 88, relationshipStrength: 30, valueTypes: ["commercial_opportunity"] }),
    connection("k08", "contact:missing", { businessRelevanceScore: 99 }),
    connection("k09", "c07", { businessRelevanceScore: 70.4 }),
    connection("k10", "c09", { businessRelevanceScore: 12, relationshipStrength: 44.99999999999999 }),
    connection("k11", "c10", { businessRelevanceScore: 69.4 }),
    connection("k-deleted", "c01", { businessRelevanceScore: 99 }, { lifecycleState: "deleted" }),
    connection("k-invalid", "c01", { businessRelevanceScore: 99, summary: "  " }),

    event("ev1"),
    event("ev2", { source: source("manual", "src:ev2") }),
    event("ev-deleted", {}, { lifecycleState: "deleted" }),
    event("ev-invalid", { name: "" }),

    task("t01", { contactId: "c01", dueAt: "2026-09-20T00:00:00.000Z" }),
    task("t02", { contactId: "contact:missing", dueAt: "2026-09-25T12:00:00.000Z", status: "scheduled" }),
    task("t03", { dueAt: "not a date" }),
    task("t04", { contactId: "c02" }),
    task("t05", { contactId: "c05", dueAt: "2026-09-21T00:00:00.000Z" }),
    task("t06", { contactId: "  ", dueAt: "2026-08-01T00:00:00.000Z" }),
    task("t08", { updatedAt: "2026-09-19T23:59:59.5+09:00" }),
    task("t09", { updatedAt: "2026-09-19T23:59:59_" }),
    task("t07", { contactId: "c06", dueAt: "2026-09-19T23:59:00.000Z", status: "scheduled" }),
    task("t-completed", { status: "completed" }),
    task("t-deleted", { status: "open" }, { lifecycleState: "deleted" }),
    task("t-invalid", { status: "waiting" }),

    record("evidence", "evd1", { id: "e:c01", sourceType: "manual", sourceId: "s", summary: "S", occurredAt: "2026-09-01", confidence: 0.8, createdBy: "t" }),
    record("contact_detail_states", "state:c01", { contactId: "c01", tags: ["vip"] }, { updatedAt: "2026-12-31T00:00:00.000Z" }),

    // Another account: overlapping contact ids must not leak across accounts.
    contact("c01", { displayName: "Other C01", role: "CFO", location: "Tokyo", stage: "nurture" }, { userId: OTHER }),
    connection("k-other", "c01", { businessRelevanceScore: 91 }, { userId: OTHER }),
    task("t-other", { contactId: "c01", dueAt: "2026-09-22T00:00:00.000Z" }, { userId: OTHER }),
    // Non-ASCII activity strings cannot be ordered in SQL: that account falls back.
    contact("c-fullwidth", { createdAt: "２０２６-09-19T00:00:00.000Z" }, { userId: FALLBACK }),
    // Unowned seed rows are invisible to every account.
    contact("c-unowned", { stage: "nurture" }, { userId: null }),
  ].map((row) => row.collectionName === "contacts" && row.userId === OTHER
    ? { ...row, recordId: "c01-other" }
    : row);
}

function oracleProvider(provider: LiveDashboardAggregateProvider): LiveDashboardAggregateProvider {
  // Only the original full-graph capabilities: every section uses the JS code.
  return {
    source: provider.source,
    sourceLabel: provider.sourceLabel,
    readDashboardGraph: () => provider.readDashboardGraph(),
    readDashboardGraphForAccount: (accountId) => provider.readDashboardGraphForAccount!(accountId),
  };
}

function recordingClient(client: LiveRecordSqlClient): LiveRecordSqlClient & { texts: string[] } {
  const texts: string[] = [];
  return {
    texts,
    query: (text: string, values?: readonly unknown[]) => {
      texts.push(text);
      return client.query(text, values as unknown[]);
    },
  } as LiveRecordSqlClient & { texts: string[] };
}

function assertShortLists(payload: Record<string, any>, label: string): void {
  const aggregateLists = [
    payload.newContacts.contacts,
    payload.highValueRelationships,
    payload.pendingFollowups.tasks,
    payload.dormantContacts.contacts,
    payload.recentActivity,
    payload.provenance.evidenceIds,
  ];
  for (const list of aggregateLists) {
    assert.ok(list.length <= DASHBOARD_SHORT_LIST_LIMIT, `${label}: list of ${list.length} exceeds ${DASHBOARD_SHORT_LIST_LIMIT}`);
  }
}

test("SQL dashboard read model equals the JS graph oracle on every number and list", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
  timeout: 120_000,
}, async () => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local equivalence test only");
  const schema = `d1_sql_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    for (const row of fixtureRecords()) await store.upsertRecord(row);
    // A JSON number with more precision than a double: 69.4999… rounds to 69.5
    // when parsed, so both implementations must count it as high value.
    await store.upsertRecord(connection("k12", "c03", {}));
    await client.query(
      `update orbit_records set payload = jsonb_set(payload, '{businessRelevanceScore}', '69.49999999999999999999'::jsonb)
       where workspace_id = $1 and collection_name = 'connections' and record_id = 'k12'`,
      [WORKSPACE],
    );

    const measured = recordingClient(client);
    const sqlProvider = createStorageDashboardAggregateProvider({ store, workspaceId: WORKSPACE, sqlClient: measured, source: "test:d1", sourceLabel: "D1 storage" });
    const oracle = oracleProvider(createStorageDashboardAggregateProvider({ store, workspaceId: WORKSPACE, sqlClient: client, source: "test:d1", sourceLabel: "D1 storage" }));
    const sqlService = createLiveDashboardAggregateService({ provider: sqlProvider });
    const oracleService = createLiveDashboardAggregateService({ provider: oracle });
    const fixedNow = () => "2026-09-27T00:00:00.000Z";

    const compareAll = async (phase: string) => {
      for (const actorId of ACTORS) {
        for (const activityLimit of [undefined, 0, 2, 4, 99]) {
          measured.texts.length = 0;
          const actual = await sqlService.getDashboardAggregate({ actorId, activityLimit });
          const expected = await oracleService.getDashboardAggregate({ actorId, activityLimit });
          assert.deepEqual(actual, expected, `${phase} aggregate ${actorId} limit ${activityLimit}`);
          assert.ok(actual.success);
          assertShortLists(actual.data, `${phase} ${actorId}`);
          assert.equal(
            measured.texts.some((text) => text.includes(GRAPH_PROJECTION_MARKER)),
            actorId === FALLBACK,
            `${phase} aggregate reads the full graph only for non-ASCII activity strings`,
          );
        }
        for (const scenario of ["empty", "pending", "failure"] as const) {
          assert.deepEqual(
            await sqlService.getDashboardAggregate({ actorId, scenario }),
            await oracleService.getDashboardAggregate({ actorId, scenario }),
            `${phase} aggregate ${actorId} ${scenario}`,
          );
        }
        assert.deepEqual(await sqlService.getDashboardSummary({ actorId }), await oracleService.getDashboardSummary({ actorId }), `${phase} summary ${actorId}`);

        measured.texts.length = 0;
        const sqlDistributions = createLiveNetworkDistributionAnalyticsService({ now: fixedNow, provider: networkDistributionProviderForAccount(sqlProvider, actorId) });
        const oracleDistributions = createLiveNetworkDistributionAnalyticsService({ now: fixedNow, provider: networkDistributionProviderForAccount(oracle, actorId) });
        const actualDistributions = await sqlDistributions.getDistributions();
        assert.deepEqual(actualDistributions, await oracleDistributions.getDistributions(), `${phase} distributions ${actorId}`);
        assert.equal(measured.texts.some((text) => text.includes(GRAPH_PROJECTION_MARKER)), false, `${phase} distributions must not read the full graph`);
        assert.ok(actualDistributions.success);
        const buckets = [
          ...actualDistributions.data.industryDistribution,
          ...actualDistributions.data.valueTypeDistribution,
          ...actualDistributions.data.relationshipStrengthDistribution,
          ...Object.values(actualDistributions.data.structureDistributions).flat(),
        ];
        for (const bucket of buckets) assert.ok(bucket.evidenceIds.length <= DASHBOARD_SHORT_LIST_LIMIT);
        assert.ok(actualDistributions.data.provenance.evidenceIds.length <= DASHBOARD_SHORT_LIST_LIMIT);
        // Gaps stay on the full graph in this sprint and keep their exact output.
        assert.deepEqual(await sqlDistributions.getNetworkGaps(), await oracleDistributions.getNetworkGaps(), `${phase} gaps ${actorId}`);
        for (const scenario of ["empty", "pending", "failure"] as const) {
          assert.deepEqual(await sqlDistributions.getDistributions({ scenario }), await oracleDistributions.getDistributions({ scenario }));
        }
      }
    };

    await compareAll("initial");

    // A database without ICU collations keeps correct answers via the graph read.
    const noIcuClient = {
      query: (text: string, values?: readonly unknown[]) => text.includes("und-x-icu")
        ? Promise.reject(Object.assign(new Error('collation "und-x-icu" for encoding "UTF8" does not exist'), { code: "42704" }))
        : client.query(text, values as unknown[]),
    } as LiveRecordSqlClient;
    const noIcuService = createLiveDashboardAggregateService({
      provider: createStorageDashboardAggregateProvider({ store, workspaceId: WORKSPACE, sqlClient: noIcuClient, source: "test:d1", sourceLabel: "D1 storage" }),
    });
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => { warnings.push(String(message)); };
    try {
      assert.deepEqual(await noIcuService.getDashboardAggregate({ actorId: OWNER }), await oracleService.getDashboardAggregate({ actorId: OWNER }));
      assert.deepEqual(await noIcuService.getDashboardSummary({ actorId: OWNER }), await oracleService.getDashboardSummary({ actorId: OWNER }));
    } finally {
      console.warn = originalWarn;
    }
    assert.ok(warnings.some((warning) => warning.includes("dashboard_activity_collation_missing")), "the fallback is logged");

    const owner = await sqlService.getDashboardAggregate({ actorId: OWNER });
    assert.ok(owner.success);
    // k01 69.5, k03 fallback 80, k05 70, k07 88, k08 99, k09 70.4, k12 69.4999…≈69.5
    assert.equal(owner.data.highValueCount, 7);
    assert.equal(owner.data.relationshipAssetTotals.contacts, 17);
    assert.equal(owner.data.relationshipAssetTotals.connections, 12);
    assert.equal(owner.data.relationshipAssetTotals.eventsRepresented, 2);
    assert.equal(owner.data.pendingFollowups.count, 9);
    assert.equal(owner.data.dormantContacts.count, 7);
    assert.equal(owner.data.highValueRelationships.length, 5);
    assert.equal(owner.data.provenance.collectedAt, "2026-12-31T00:00:00.000Z", "generatedAt includes detail states");
    const other = await sqlService.getDashboardAggregate({ actorId: OTHER });
    assert.ok(other.success);
    assert.deepEqual(other.data.newContacts.contacts.map((item) => item.name), ["Other C01"]);
    assert.deepEqual(other.data.highValueRelationships.map((item) => item.contactName), ["Other C01"]);
    const empty = await sqlService.getDashboardAggregate({ actorId: EMPTY });
    assert.ok(empty.success);
    assert.equal(empty.data.state, "empty");

    // Soft deletes, re-scored rows and new rows move both implementations together.
    await store.upsertRecord({ ...connection("k05", "c06", { relationshipStrength: 69 }), lifecycleState: "deleted", deletedAt: nextTime() });
    await store.upsertRecord(contact("c11", { role: "CTO", location: "Tokyo", stage: "nurture" }, { updatedAt: "2026-09-30T00:00:00.000Z" }));
    await store.upsertRecord({ ...task("t01", { contactId: "c01" }), lifecycleState: "deleted", deletedAt: nextTime() });
    await compareAll("after-writes");
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});

test("contacts analysis reads referenced contacts by id and role counts equal the full list", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
  timeout: 120_000,
}, async () => {
  assert.ok(databaseUrl);
  const schema = `d1_contacts_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    for (const row of fixtureRecords()) await store.upsertRecord(row);
    const measured = recordingClient(client);
    const contactProvider = createStorageContactGraphProvider({
      store,
      workspaceId: WORKSPACE,
      contactScopeRecordReader: createPostgresContactScopeRecordReader({ client: measured, workspaceId: WORKSPACE }),
      contactRecordPageReader: createPostgresContactRecordPageReader({ client: measured, workspaceId: WORKSPACE }),
    });
    const contacts = createLiveContactsListSearchAndFilterService({ provider: contactProvider });
    const dashboardProvider = createStorageDashboardAggregateProvider({ store, workspaceId: WORKSPACE, sqlClient: measured });

    for (const actorId of ACTORS) {
      const full = await contacts.listContacts({ actorId });
      assert.ok(full.success);
      // Oracle for the App "decision role %" tile: the multiset of trimmed roles
      // of the full list. The SQL role counts must describe the same multiset.
      const expectedRoles = new Map<string, number>();
      for (const item of full.data.contacts) {
        const role = item.role.trim();
        if (role) expectedRoles.set(role, (expectedRoles.get(role) ?? 0) + 1);
      }
      const roleCounts = await dashboardProvider.readContactRoleCountsForAccount!(actorId);
      assert.deepEqual(
        new Map(roleCounts.map((entry) => [entry.role, entry.count])),
        expectedRoles,
        `role counts ${actorId}`,
      );

      const wanted = ["c01", "c05", "contact:missing", "c-foreign-account", "c-deleted"];
      measured.texts.length = 0;
      const byIds = await contacts.listContacts({ actorId, contactIds: wanted });
      assert.ok(byIds.success);
      assert.deepEqual(
        byIds.data.contacts,
        full.data.contacts.filter((item) => wanted.includes(item.id)),
        `contacts by id ${actorId}`,
      );
      assert.ok(measured.texts.every((text) => !text.includes("contact list page")), "by-id read must not page the full list");
      const none = await contacts.listContacts({ actorId, contactIds: [] });
      assert.ok(none.success);
      assert.deepEqual(none.data.contacts, []);
    }

    // The composed contacts dashboard only carries contacts that the page shows.
    const service = createMobileContactsDashboardServiceFromSources({
      dashboard: createLiveDashboardAggregateService({ provider: dashboardProvider }),
      distribution: (id) => createLiveNetworkDistributionAnalyticsService({ provider: networkDistributionProviderForAccount(dashboardProvider, id) }),
      opportunity: (id) => createLiveOpportunityReminderAnalyticsService({ provider: opportunityProviderForAccount(dashboardProvider, id) }),
      profile: createMockProfileService(),
      contacts,
      contactRoleCounts: (id) => dashboardProvider.readContactRoleCountsForAccount!(id),
    });
    const result = await service.getDashboard({ actorId: OWNER });
    assert.ok(result.success);
    const referenced = new Set<string>();
    for (const item of result.data.opportunities?.highPriorityOpportunities ?? []) {
      referenced.add(item.contactId);
      const brief = item.actionBrief as { primaryAction?: { contactId?: string }; secondaryAction?: { contactId?: string } } | undefined;
      if (brief?.primaryAction?.contactId) referenced.add(brief.primaryAction.contactId);
      if (brief?.secondaryAction?.contactId) referenced.add(brief.secondaryAction.contactId);
    }
    for (const item of result.data.opportunities?.dormantHighValueContacts ?? []) referenced.add(item.contactId);
    for (const item of result.data.aggregate.newContacts.contacts as { contactId: string }[]) referenced.add(item.contactId);
    for (const item of result.data.aggregate.dormantContacts.contacts as { contactId: string }[]) referenced.add(item.contactId);
    const returnedIds = result.data.contacts?.contacts.map((item) => item.id) ?? [];
    assert.ok(returnedIds.length > 0 && returnedIds.length < 10, `only referenced contacts, got ${returnedIds.length}`);
    assert.ok(returnedIds.every((id) => referenced.has(id)), "every returned contact is referenced by the page");
    const full = await contacts.listContacts({ actorId: OWNER });
    assert.ok(full.success);
    const fullIds = new Set(full.data.contacts.map((item) => item.id));
    assert.deepEqual(new Set(returnedIds), new Set([...referenced].filter((id) => fullIds.has(id))));
    assert.deepEqual(
      new Map((result.data.contacts as { roleCounts?: { role: string; count: number }[] }).roleCounts?.map((entry) => [entry.role, entry.count])),
      new Map((await dashboardProvider.readContactRoleCountsForAccount!(OWNER)).map((entry) => [entry.role, entry.count])),
    );
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});

// W0047 SC-03：新增的 relationshipTierDistribution 在 SQL 读模型路径与图路径对同一夹具输出相同（含 dormant），
// 四组人数之和 = 有缓存行的（有效）联系人数；缓存行不影响既有 relationshipStrengthDistribution。
function tierRow(actorId: string, contactId: string, tier: "new" | "active" | "core", dormant: boolean): Row {
  return record("relationship_strengths", `relationship-strength:${actorId}:${contactId}`, {
    contactId, tier, dormant, score: 0, peakScore: 0, lastSignalAt: null, signals: [], computedAt: "2026-09-20T00:00:00.000Z", rulesVersion: "rs-2026-10-v1",
  }, { userId: actorId });
}

test("W0047: relationshipTierDistribution is equal on the SQL read model and the graph path; the old strength distribution ignores the cache", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
  timeout: 120_000,
}, async () => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local equivalence test only");
  const schema = `w47_tiers_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    for (const row of fixtureRecords()) await store.upsertRecord(row);
    const fixedNow = () => "2026-09-27T00:00:00.000Z";
    const sqlProvider = createStorageDashboardAggregateProvider({ store, workspaceId: WORKSPACE, sqlClient: client, source: "test:d1", sourceLabel: "D1 storage" });
    const graphProvider: LiveDashboardAggregateProvider = {
      ...oracleProvider(sqlProvider),
      readRelationshipTiersForAccount: (accountId) => sqlProvider.readRelationshipTiersForAccount!(accountId),
    };
    const distributions = async (provider: LiveDashboardAggregateProvider, actorId: string) => {
      const result = await createLiveNetworkDistributionAnalyticsService({ now: fixedNow, provider: networkDistributionProviderForAccount(provider, actorId) }).getDistributions();
      assert.ok(result.success);
      return result.data;
    };
    const before = new Map<string, unknown>();
    for (const actorId of ACTORS) before.set(actorId, (await distributions(sqlProvider, actorId)).relationshipStrengthDistribution);
    for (const actorId of ACTORS) assert.deepEqual((await distributions(sqlProvider, actorId)).relationshipTierDistribution, [], `empty cache ${actorId}`);

    // 缓存行：c01（有重复记录）core、c02 active、c05 dormant、c04/c06/c08 new、c10 core+dormant；
    // 无效／已删除／他人／不存在的联系人行不计；OTHER 自己的 c01 active。
    for (const row of [
      tierRow(OWNER, "c01", "core", false), tierRow(OWNER, "c02", "active", false), tierRow(OWNER, "c05", "active", true),
      tierRow(OWNER, "c04", "new", false), tierRow(OWNER, "c06", "new", false), tierRow(OWNER, "c08", "new", false),
      tierRow(OWNER, "c09", "new", false), tierRow(OWNER, "c12", "new", false), tierRow(OWNER, "c13", "new", false),
      tierRow(OWNER, "c10", "core", true),
      tierRow(OWNER, "c-deleted", "core", false), tierRow(OWNER, "c-invalid-stage", "core", false), tierRow(OWNER, "contact:missing", "core", false),
      tierRow(OTHER, "c01", "active", false),
    ]) await store.upsertRecord(row);

    for (const actorId of ACTORS) {
      const sql = await distributions(sqlProvider, actorId);
      const graph = await distributions(graphProvider, actorId);
      assert.deepEqual(sql.relationshipTierDistribution, graph.relationshipTierDistribution, `tiers ${actorId}`);
      assert.deepEqual(sql.relationshipStrengthDistribution, before.get(actorId), `old strength distribution unchanged ${actorId}`);
      assert.deepEqual(graph.relationshipStrengthDistribution, before.get(actorId), `graph old strength distribution unchanged ${actorId}`);
    }
    const owner = await distributions(sqlProvider, OWNER);
    assert.deepEqual(owner.relationshipTierDistribution!.map((bucket) => [bucket.tier, bucket.relationshipCount]), [["new", 6], ["active", 1], ["core", 1], ["dormant", 2]]);
    assert.equal(owner.relationshipTierDistribution!.reduce((sum, bucket) => sum + bucket.relationshipCount, 0), 10);
    assert.deepEqual(owner.relationshipTierDistribution!.find((bucket) => bucket.tier === "new")!.contactIds.length, DASHBOARD_SHORT_LIST_LIMIT);
    const other = await distributions(sqlProvider, OTHER);
    assert.deepEqual(other.relationshipTierDistribution, [{ tier: "active", relationshipCount: 1, percentage: 100, contactIds: ["c01"] }]);
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});
