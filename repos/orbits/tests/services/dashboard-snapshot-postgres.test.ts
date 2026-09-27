import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { createLiveDashboardAggregateService, type LiveDashboardAggregateProvider } from "../../features/dashboard/live-service";
import { createLiveNetworkDistributionAnalyticsService } from "../../features/dashboard/live-distribution-service";
import { createLiveOpportunityReminderAnalyticsService } from "../../features/dashboard/live-opportunity-service";
import {
  networkDistributionProviderForAccount,
  opportunityProviderForAccount,
} from "../../features/dashboard/service-factory";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { createMobileContactsDashboardServiceFromSources } from "../../features/mobile/contacts-dashboard-service";
import {
  contactsAnalysisGraphSourceDataVersion,
  createContactsAnalysisSourceDataVersion,
} from "../../features/mobile/contacts-analysis-report-provider";
import { createLiveContactsListSearchAndFilterService } from "../../features/contacts/live-service";
import {
  createPostgresContactRecordPageReader,
  createStorageContactGraphProvider,
} from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresContactScopeRecordReader } from "../../features/contacts/storage/contact-scope-postgres-reader";
import { createMockProfileService } from "../../features/profile/mock-service";
import { createLiveProfileService } from "../../features/profile/live-service";
import { createStorageProfileProvider } from "../../features/profile/storage/profile-live-record-provider";
import { createContactsAnalysisReportProvider } from "../../features/mobile/contacts-analysis-report-provider";
import { createStorageOrbitAgentChatSessionProvider } from "../../features/orbit-ai/storage/orbit-agent-chat-session-live-record-provider";
import type { ProfileService } from "../../features/profile/service";
import type { LiveRecord } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresClient } from "../../shared/storage/transactional-postgres";
import { SYNC_REVISION_ASSIGN_ONLY_SQL } from "../support/sync-revision-fixture";

// Sprint 0102 (dashboard D2). Gaps and opportunities are served from a
// per-user snapshot keyed by the relationship-graph version. The oracle is the
// unchanged JS computation over a fresh full-graph read: a provider that only
// exposes the graph reads, so the services take their original path.

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const skip = databaseUrl ? false : "Explicit isolated PostgreSQL URL required";
const WORKSPACE = "workspace:d2-snapshots";
const A = "account:d2-a";
const B = "account:d2-b";
const EMPTY = "account:d2-empty";
const GRAPH_READ = "when 'contact_detail_states' then jsonb_build_object";
// One statement returns the graph version together with the stored snapshot.
const VERSION_READ = "/* dashboard:graph-version */";
const SNAPSHOT_WRITE = "/* dashboard:snapshot:write */";

type Row = LiveRecord<Record<string, unknown>>;

let clock = Date.parse("2026-09-26T00:00:00.000Z");
const tick = () => new Date((clock += 1000)).toISOString();
const source = (id: string) => ({ type: "manual", id: `src:${id}`, label: `Label ${id}` });

function row(collectionName: string, recordId: string, payload: Record<string, unknown>, userId: string | null = A): Row {
  const at = tick();
  return {
    workspaceId: WORKSPACE, collectionName, recordId, userId,
    sourceType: "system", sourceId: `source:${recordId}`, evidenceIds: [],
    occurredAt: at, createdAt: at, updatedAt: at, deletedAt: null, lifecycleState: "active", payload,
  };
}
const contact = (id: string, fields: Record<string, unknown> = {}, userId = A, recordId = id) => row("contacts", recordId, {
  id, displayName: `Name ${id}@${userId}`, stage: "active", source: source(id), evidenceIds: [`e:${id}`],
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...fields,
}, userId);
const connection = (id: string, contactId: string, fields: Record<string, unknown> = {}, userId = A) => row("connections", id, {
  id, accountId: userId, contactId, stage: "active", valueTypes: [], summary: `Summary ${id}`, source: source(id),
  evidenceIds: [`e:${id}`], suggestedActions: [`act ${id}`], createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...fields,
}, userId);
const task = (id: string, fields: Record<string, unknown> = {}, userId = A) => row("tasks", id, {
  id, title: `Task ${id}`, status: "open", source: source(id), evidenceIds: [`e:${id}`],
  createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z", ...fields,
}, userId);
const event = (id: string, userId = A) => row("events", id, { id, name: `Event ${id}`, startsAt: "2026-10-01T00:00:00.000Z", source: source(id), evidenceIds: [`e:${id}`] }, userId);
const evidence = (id: string, userId = A) => row("evidence", id, { id, sourceType: "manual", sourceId: "s", summary: `Evidence ${id}`, occurredAt: "2026-09-01", confidence: 0.8, createdBy: "t" }, userId);
const detailState = (contactId: string, tags: string[], userId = A) => row("contact_detail_states", `state:${contactId}`, { contactId, tags }, userId);

function fixture(): Row[] {
  return [
    contact("c1", { primaryIndustryId: "technology_internet", role: "CEO" }),
    contact("c2", { primaryIndustryId: "finance_investment", stage: "nurture" }),
    contact("c3", { primaryIndustryId: "technology_internet" }),
    contact("c4", { primaryIndustryId: "retail_consumer", stage: "nurture" }),
    contact("c5", { primaryIndustryId: "technology_internet" }),
    contact("c6", { stage: "nurture" }),
    connection("k1", "c1", { businessRelevanceScore: 90, relationshipStrength: 80, valueTypes: ["commercial_opportunity"] }),
    connection("k2", "c2", { businessRelevanceScore: 85, stage: "nurture", valueTypes: ["referral_path"] }),
    connection("k3", "c3", { businessRelevanceScore: 60, relationshipStrength: 30 }),
    connection("k4", "c4", { businessRelevanceScore: 82, stage: "nurture", valueTypes: ["strategic_fit"] }),
    connection("k5", "c5", { businessRelevanceScore: 95, valueTypes: ["investor_access"], relationshipStrength: 90 }),
    connection("k6", "c6", { relationshipStrength: 88, stage: "nurture" }),
    task("t1", { contactId: "c1", connectionId: "k1", dueAt: "2026-09-27T12:00:00.000Z" }),
    task("t2", { contactId: "c3", connectionId: "k3", dueAt: "2026-10-03T00:00:00.000Z" }),
    task("t3", { contactId: "c5", connectionId: "k5", status: "scheduled", dueAt: "2026-09-30T00:00:00.000Z" }),
    task("t4", { contactId: "c1", connectionId: "k1" }),
    task("t5", { contactId: "c2", connectionId: "k2", status: "completed" }),
    event("ev1"),
    evidence("evd1"),
    detailState("c1", ["vip"]),
    // B shares domain ids with A; nothing may cross.
    contact("c1", { primaryIndustryId: "finance_investment", stage: "nurture" }, B, "c1-b"),
    connection("k1-b", "c1", { businessRelevanceScore: 91, stage: "nurture" }, B),
    task("t1-b", { contactId: "c1", connectionId: "k1-b", dueAt: "2026-09-28T00:00:00.000Z" }, B),
    // Unowned rows are in nobody's graph or version.
    contact("c-unowned", {}, null as unknown as string),
  ];
}

function oracleProvider(provider: LiveDashboardAggregateProvider): LiveDashboardAggregateProvider {
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

interface Harness {
  client: TransactionalPostgresClient;
  store: ReturnType<typeof createPostgresLiveRecordStore>;
  newProvider: (client?: LiveRecordSqlClient) => LiveDashboardAggregateProvider;
  oracle: LiveDashboardAggregateProvider;
}

async function withSchema(options: { syncRevision: boolean }, run: (harness: Harness) => Promise<void>): Promise<void> {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local test only");
  const schema = `d2_snap_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 8, options: `-c search_path=${schema} -c statement_timeout=20000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    if (options.syncRevision) await client.query(SYNC_REVISION_ASSIGN_ONLY_SQL);
    const store = createPostgresLiveRecordStore({ client });
    for (const record of fixture()) await store.upsertRecord(record);
    const newProvider = (sqlClient: LiveRecordSqlClient = client) =>
      createStorageDashboardAggregateProvider({ sqlClient, workspaceId: WORKSPACE, source: "test:d2", sourceLabel: "D2 storage" });
    await run({ client, store, newProvider, oracle: oracleProvider(newProvider()) });
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
}

async function analytics(provider: LiveDashboardAggregateProvider, actorId: string, now: string) {
  const clockNow = () => now;
  const distribution = createLiveNetworkDistributionAnalyticsService({ now: clockNow, provider: networkDistributionProviderForAccount(provider, actorId) });
  const opportunity = createLiveOpportunityReminderAnalyticsService({ now: clockNow, provider: opportunityProviderForAccount(provider, actorId) });
  return {
    gaps: await distribution.getNetworkGaps(),
    opportunities: await opportunity.getOpportunityReminderAnalytics(),
    recompute: await opportunity.recomputeOpportunityReminderAnalytics(),
  };
}

const NOW = "2026-09-27T00:00:00.000Z";

test("snapshot output equals the JS oracle and an unchanged graph is served without the full-graph read", { skip, timeout: 120_000 }, async () => {
  await withSchema({ syncRevision: true }, async ({ client, newProvider, oracle }) => {
    for (const actorId of [A, B, EMPTY]) {
      const measured = recordingClient(client);
      const provider = newProvider(measured);
      const first = await analytics(provider, actorId, NOW);
      assert.deepEqual(first, await analytics(oracle, actorId, NOW), `first read equals oracle ${actorId}`);
      assert.ok(measured.texts.some((text) => text.includes(GRAPH_READ)), `${actorId}: a missing snapshot is computed from the graph`);
      assert.ok(measured.texts.some((text) => text.includes(SNAPSHOT_WRITE)), `${actorId}: and stored`);

      measured.texts.length = 0;
      const again = await analytics(newProvider(measured), actorId, NOW);
      assert.deepEqual(again, first, `${actorId}: stored snapshot equals the computed one`);
      assert.equal(measured.texts.some((text) => text.includes(GRAPH_READ)), false, `${actorId}: unchanged graph, no full-graph read`);
      assert.equal(measured.texts.some((text) => text.includes(SNAPSHOT_WRITE)), false, `${actorId}: unchanged graph, no write`);

      // Due labels and action briefs depend on the request time, not on the snapshot time.
      for (const later of ["2026-09-29T08:00:00.000Z", "2026-10-05T00:00:00.000Z"]) {
        measured.texts.length = 0;
        assert.deepEqual(await analytics(newProvider(measured), actorId, later), await analytics(oracle, actorId, later), `${actorId} at ${later}`);
        assert.equal(measured.texts.some((text) => text.includes(GRAPH_READ)), false);
      }
    }
    const a = await analytics(newProvider(), A, NOW);
    assert.ok(a.opportunities.success && a.gaps.success);
    assert.deepEqual(a.opportunities.data.highPriorityOpportunities.map((item) => item.opportunityId), ["opportunity:t3", "opportunity:t4", "opportunity:t2"], "t4 (no due date) wins the tie with t1 for c1");
    assert.ok(a.opportunities.data.dormantHighValueContacts.length > 0);
    assert.ok(a.gaps.data.gaps.length > 0);
  });
});

test("any insert, update or soft delete in each of the six collections makes the next read recompute and include it", { skip, timeout: 180_000 }, async () => {
  await withSchema({ syncRevision: true }, async ({ client, store, newProvider, oracle }) => {
    const graphVersion = () => newProvider().readDashboardGraphVersionForAccount!(A);
    const changes: Record<string, { insert: Row; update: Row; remove: { collectionName: string; recordId: string } }> = {
      contacts: { insert: contact("c7", { primaryIndustryId: "retail_consumer" }), update: contact("c2", { primaryIndustryId: "retail_consumer", stage: "active" }), remove: { collectionName: "contacts", recordId: "c4" } },
      connections: { insert: connection("k7", "c7", { businessRelevanceScore: 99, stage: "nurture" }), update: connection("k3", "c3", { businessRelevanceScore: 97 }), remove: { collectionName: "connections", recordId: "k5" } },
      contact_detail_states: { insert: detailState("c3", ["new"]), update: detailState("c1", ["vip", "board"]), remove: { collectionName: "contact_detail_states", recordId: "state:c1" } },
      events: { insert: event("ev2"), update: { ...event("ev1"), payload: { ...event("ev1").payload, name: "Renamed" } }, remove: { collectionName: "events", recordId: "ev1" } },
      evidence: { insert: evidence("evd2"), update: { ...evidence("evd1"), payload: { ...evidence("evd1").payload, summary: "Edited" } }, remove: { collectionName: "evidence", recordId: "evd1" } },
      tasks: { insert: task("t6", { contactId: "c6", connectionId: "k6", dueAt: "2026-09-28T00:00:00.000Z" }), update: task("t2", { contactId: "c3", connectionId: "k3", status: "completed" }), remove: { collectionName: "tasks", recordId: "t4" } },
    };
    await analytics(newProvider(), A, NOW); // store the first snapshot
    for (const [collection, change] of Object.entries(changes)) {
      for (const op of ["insert", "update", "soft-delete"] as const) {
        const before = await graphVersion();
        const previous = await analytics(newProvider(), A, NOW);
        if (op === "insert") await store.upsertRecord(change.insert);
        else if (op === "update") await store.upsertRecord({ ...change.update, updatedAt: tick() });
        else {
          const deleted = await store.deleteRecord({ workspaceId: WORKSPACE, ...change.remove, deletedAt: tick(), userId: A });
          assert.ok(deleted, `${collection} ${op}: the row exists`);
        }
        assert.notEqual(await graphVersion(), before, `${collection} ${op}: graph version moves`);
        const measured = recordingClient(client);
        const actual = await analytics(newProvider(measured), A, NOW);
        assert.ok(measured.texts.some((text) => text.includes(GRAPH_READ)), `${collection} ${op}: recomputed from the graph`);
        const expected = await analytics(oracle, A, NOW);
        assert.deepEqual(actual, expected, `${collection} ${op}: snapshot equals the fresh computation`);
        if (["contacts", "connections", "tasks"].includes(collection)) {
          assert.notDeepEqual(actual, previous, `${collection} ${op}: the change is visible in gaps or opportunities`);
        }
      }
    }
  });
});

test("one account's snapshot and version never affect or reach another account", { skip, timeout: 120_000 }, async () => {
  await withSchema({ syncRevision: true }, async ({ client, store, newProvider, oracle }) => {
    // A forged row under A's snapshot id but owned by B, claiming A's current version.
    const versionA = await newProvider().readDashboardGraphVersionForAccount!(A);
    const forged = row("dashboard_snapshots", `dashboard-snapshot:${A}`, {
      schemaVersion: 1, graphVersion: versionA, computedAt: NOW,
      gaps: { state: "success", coverageScore: 1, gaps: [], collectedAt: NOW },
      opportunities: { generatedAt: NOW, evaluatedContacts: 0, taskCandidates: [], dormantCandidates: [] },
    }, B);
    await store.upsertRecord(forged);
    assert.deepEqual(await analytics(newProvider(), A, NOW), await analytics(oracle, A, NOW), "a row owned by B is never served to A");
    const stored = await client.query<{ user_id: string; payload: { gaps: { coverageScore: number } } }>(
      "select user_id, payload from orbit_records where workspace_id = $1 and collection_name = 'dashboard_snapshots' and record_id = $2",
      [WORKSPACE, `dashboard-snapshot:${A}`],
    );
    assert.deepEqual(stored.rows.map((item) => [item.user_id, item.payload.gaps.coverageScore]), [[B, 1]], "A's write cannot take over B's row");
    await client.query("delete from orbit_records where workspace_id = $1 and collection_name = 'dashboard_snapshots'", [WORKSPACE]);

    const snapshotA = await analytics(newProvider(), A, NOW);
    const snapshotB = await analytics(newProvider(), B, NOW);
    assert.notDeepEqual(snapshotA, snapshotB);
    assert.deepEqual(snapshotB, await analytics(oracle, B, NOW));
    const owners = await client.query<{ record_id: string; user_id: string }>(
      "select record_id, user_id from orbit_records where workspace_id = $1 and collection_name = 'dashboard_snapshots' order by record_id",
      [WORKSPACE],
    );
    assert.deepEqual(owners.rows.map((item) => [item.record_id, item.user_id]), [[`dashboard-snapshot:${A}`, A], [`dashboard-snapshot:${B}`, B]]);

    // B writes: A's version and snapshot are untouched and A is not recomputed.
    const beforeA = await newProvider().readDashboardGraphVersionForAccount!(A);
    const beforeB = await newProvider().readDashboardGraphVersionForAccount!(B);
    await store.upsertRecord(task("t9-b", { contactId: "c1", connectionId: "k1-b", dueAt: "2026-09-27T00:00:00.000Z" }, B));
    await store.upsertRecord(contact("c1", { stage: "active", role: "Changed" }, B, "c1-b"));
    assert.equal(await newProvider().readDashboardGraphVersionForAccount!(A), beforeA);
    assert.notEqual(await newProvider().readDashboardGraphVersionForAccount!(B), beforeB);
    const measured = recordingClient(client);
    assert.deepEqual(await analytics(newProvider(measured), A, NOW), snapshotA);
    assert.equal(measured.texts.some((text) => text.includes(GRAPH_READ)), false, "B's writes do not invalidate A");
    const afterB = await analytics(newProvider(), B, NOW);
    assert.deepEqual(afterB, await analytics(oracle, B, NOW));
    assert.notDeepEqual(afterB, snapshotB);
  });
});

test("concurrent recomputes after a change are harmless: equal results and one current row", { skip, timeout: 120_000 }, async () => {
  await withSchema({ syncRevision: true }, async ({ client, store, newProvider, oracle }) => {
    await analytics(newProvider(), A, NOW);
    await store.upsertRecord(task("t8", { contactId: "c4", connectionId: "k4", dueAt: "2026-09-29T00:00:00.000Z" }));
    const results = await Promise.all(Array.from({ length: 6 }, () => analytics(newProvider(), A, NOW)));
    const expected = await analytics(oracle, A, NOW);
    for (const result of results) assert.deepEqual(result, expected);
    const current = await newProvider().readDashboardGraphVersionForAccount!(A);
    const stored = await client.query<{ graph_version: string }>(
      "select payload->>'graphVersion' as graph_version from orbit_records where workspace_id = $1 and collection_name = 'dashboard_snapshots' and user_id = $2",
      [WORKSPACE, A],
    );
    assert.deepEqual(stored.rows.map((item) => item.graph_version), [current]);
    const measured = recordingClient(client);
    assert.deepEqual(await analytics(newProvider(measured), A, NOW), expected);
    assert.equal(measured.texts.some((text) => text.includes(GRAPH_READ)), false);
  });
});

test("without a sync_revision column the services keep computing from the graph and say so once", { skip, timeout: 120_000 }, async () => {
  await withSchema({ syncRevision: false }, async ({ client, newProvider, oracle }) => {
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (message: string) => { warnings.push(String(message)); };
    try {
      const measured = recordingClient(client);
      assert.equal(await newProvider(measured).readDashboardGraphVersionForAccount!(A), null);
      assert.deepEqual(await analytics(newProvider(measured), A, NOW), await analytics(oracle, A, NOW));
      assert.equal(measured.texts.some((text) => text.includes(SNAPSHOT_WRITE)), false);
    } finally {
      console.warn = originalWarn;
    }
    // Logged at most once per process; an earlier test in this file may have been first.
    assert.ok(warnings.length <= 1);
  });
});

function contactsDashboard(harness: Harness, measured: LiveRecordSqlClient, options: { profile?: ProfileService; withAnalysis?: boolean } = {}) {
  const store = harness.store;
  const dashboardProvider = harness.newProvider(measured);
  const contactProvider = createStorageContactGraphProvider({
    store,
    workspaceId: WORKSPACE,
    contactScopeRecordReader: createPostgresContactScopeRecordReader({ client: measured, workspaceId: WORKSPACE }),
    contactRecordPageReader: createPostgresContactRecordPageReader({ client: measured, workspaceId: WORKSPACE }),
  });
  return createMobileContactsDashboardServiceFromSources({
    dashboard: createLiveDashboardAggregateService({ provider: dashboardProvider }),
    distribution: (id) => createLiveNetworkDistributionAnalyticsService({ now: () => NOW, provider: networkDistributionProviderForAccount(dashboardProvider, id) }),
    opportunity: (id) => createLiveOpportunityReminderAnalyticsService({ now: () => NOW, provider: opportunityProviderForAccount(dashboardProvider, id) }),
    profile: options.profile ?? createMockProfileService(),
    contacts: createLiveContactsListSearchAndFilterService({ provider: contactProvider }),
    contactRoleCounts: (id) => dashboardProvider.readContactRoleCountsForAccount!(id),
    graphVersion: (id) => dashboardProvider.readDashboardGraphVersionForAccount!(id),
    ...(options.withAnalysis ? {
      loadAnalysis: (actorId: string, analysisSource: Parameters<ReturnType<typeof createContactsAnalysisReportProvider>["getAnalysis"]>[0]["source"]) =>
        createContactsAnalysisReportProvider({ sessionProvider: analysisSessions(harness, actorId) }).getAnalysis({ source: analysisSource }),
    } : {}),
  });
}

function analysisSessions(harness: Harness, actorId: string) {
  return createStorageOrbitAgentChatSessionProvider({ actorId, store: harness.store, workspaceId: WORKSPACE });
}

const REPORT_BODY = "**关系结构**：六位联系人，依据 c1。\n**目标覆盖**：投资人目标缺少引荐人。\n**下一步建议**：先复核 c5 的会面记录。\n**判断依据**：c1 与 c5，未执行任何写入。";

/** Persists a verified contacts.analysis report for `sourceDataVersion` through the real session provider. */
async function persistAnalysisReport(harness: Harness, actorId: string, sourceDataVersion: string) {
  const sessions = analysisSessions(harness, actorId);
  const at = "2026-09-27T01:00:00.000Z";
  const origin = {
    entryClient: "app" as const, entryPointId: "contacts.analysis" as const, firstSentText: "分析人脉",
    firstUserMessageId: "message:user:analysis", initialGroupId: null, kind: "structured" as const, recordedAt: at,
    references: [], schemaVersion: 1 as const, sourceDataVersion, template: { id: "contacts.analysis", version: 1 },
  };
  const session = {
    createdAt: at, updatedAt: "2026-09-27T01:00:01.000Z", id: `session:analysis:${sourceDataVersion.slice(0, 8)}`, title: "人脉分析",
    messages: [
      { createdAt: at, id: "message:user:analysis", role: "user" as const, text: "分析人脉" },
      { createdAt: "2026-09-27T01:00:01.000Z", id: "message:assistant:analysis", role: "assistant" as const, text: REPORT_BODY },
    ],
    origin,
  };
  await sessions.upsertSession(session);
  await sessions.upsertVerifiedAnalysisSession(session, { analysisVersion: "contacts.analysis@1", kind: "contacts_analysis_execution", sourceDataVersion });
}

test("0121 changing the relationship goal makes the AI report stale and refuses the old version, while the graph version and snapshot stay", { skip, timeout: 120_000 }, async () => {
  await withSchema({ syncRevision: true }, async (harness) => {
    const measured = recordingClient(harness.client);
    const profile = createLiveProfileService({ provider: createStorageProfileProvider({ store: harness.store, workspaceId: WORKSPACE }), now: () => NOW });
    const saved = await profile.updateProfile({ displayName: "Owner A", relationshipGoal: "寻找投资人", birthDate: "1990-01-01" }, { actorId: A });
    assert.ok(saved.success, JSON.stringify(saved));
    const dashboard = () => contactsDashboard(harness, measured, { profile, withAnalysis: true });

    const first = await dashboard().getDashboard({ actorId: A });
    assert.ok(first.success);
    const v1 = first.data.analysis!.current.sourceDataVersion;
    await persistAnalysisReport(harness, A, v1);
    const fresh = await dashboard().getDashboard({ actorId: A });
    assert.ok(fresh.success);
    assert.ok(fresh.data.analysis!.report, "the persisted report is found");
    assert.equal(fresh.data.analysis!.stale, false);
    const graphVersion = await harness.newProvider().readDashboardGraphVersionForAccount!(A);

    // A field outside the analysis input (birth date) changes nothing.
    assert.ok((await profile.updateProfile({ birthDate: "1991-02-02" }, { actorId: A })).success);
    const unchanged = await dashboard().getDashboard({ actorId: A });
    assert.ok(unchanged.success);
    assert.equal(unchanged.data.analysis!.current.sourceDataVersion, v1, "birth date is not part of the analysis version");
    assert.equal(unchanged.data.analysis!.stale, false);

    // The goal the model reads changes: the report is stale and the old version is refused.
    assert.ok((await profile.updateProfile({ relationshipGoal: "寻找客户" }, { actorId: A })).success);
    measured.texts.length = 0;
    const changed = await dashboard().getDashboard({ actorId: A });
    assert.ok(changed.success);
    assert.equal(measured.texts.some((text) => text.includes(GRAPH_READ)), false, "profile edits do not invalidate the graph snapshot");
    assert.equal(await harness.newProvider().readDashboardGraphVersionForAccount!(A), graphVersion, "the relationship-graph version is unchanged");
    const v2 = changed.data.analysis!.current.sourceDataVersion;
    assert.notEqual(v2, v1);
    assert.equal(changed.data.analysis!.stale, true, "the report written for the old goal is stale");
    assert.deepEqual(await dashboard().getAnalysisSource!({ actorId: A, claimedSourceDataVersion: v1 }), { success: false, error: "conflict" });
    const verified = await dashboard().getAnalysisSource!({ actorId: A, claimedSourceDataVersion: v2 });
    assert.ok(verified.success);
    assert.equal(createContactsAnalysisSourceDataVersion(verified.source), v2, "the precheck and the route verification use the same composite version");
    assert.equal((verified.source.profile as { profile: { relationshipGoal: string } }).profile.relationshipGoal, "寻找客户");

    // A graph change alone still invalidates the snapshot and the version as before.
    await harness.store.upsertRecord(contact("c9", { primaryIndustryId: "finance_investment" }));
    measured.texts.length = 0;
    const graphChanged = await dashboard().getDashboard({ actorId: A });
    assert.ok(graphChanged.success);
    assert.equal(measured.texts.filter((text) => text.includes(GRAPH_READ)).length, 1, "the snapshot is recomputed after a graph change");
    assert.notEqual(graphChanged.data.analysis!.current.sourceDataVersion, v2);
  });
});

test("contacts analysis page and its AI entry: current version reads no graph, a stale version is refused after one query", { skip, timeout: 120_000 }, async () => {
  await withSchema({ syncRevision: true }, async (harness) => {
    const { client, store } = harness;
    const measured = recordingClient(client);
    const cold = await contactsDashboard(harness, measured).getDashboard({ actorId: A });
    assert.ok(cold.success);
    assert.equal(measured.texts.filter((text) => text.includes(GRAPH_READ)).length, 1, "the first page load computes the snapshot with one graph read");
    assert.equal(measured.texts.filter((text) => text.includes(VERSION_READ)).length, 1, "one version query per request");

    measured.texts.length = 0;
    const page = await contactsDashboard(harness, measured).getDashboard({ actorId: A });
    assert.ok(page.success);
    assert.equal(measured.texts.some((text) => text.includes(GRAPH_READ)), false, "unchanged data: no full-graph read on the page");
    assert.equal(measured.texts.filter((text) => text.includes(VERSION_READ)).length, 1, "version, gaps and opportunities share one snapshot query");
    assert.deepEqual({ ...page.data, generatedAt: null }, { ...cold.data, generatedAt: null }, "same page content as the computing load");

    const version = await harness.newProvider().readDashboardGraphVersionForAccount!(A);
    assert.ok(version);
    const claimed = contactsAnalysisGraphSourceDataVersion(version, page.data.profile);
    assert.match(claimed, /^[a-f0-9]{64}$/, "the page contract keeps its 64-hex format");

    measured.texts.length = 0;
    const verified = await contactsDashboard(harness, measured).getAnalysisSource!({ actorId: A, claimedSourceDataVersion: claimed });
    assert.ok(verified.success);
    assert.equal(measured.texts.some((text) => text.includes(GRAPH_READ)), false, "matching version: no full-graph read");
    assert.equal(createContactsAnalysisSourceDataVersion(verified.source), claimed);
    assert.deepEqual(verified.source.gaps, page.data.gaps);
    assert.deepEqual(verified.source.opportunities, page.data.opportunities);

    measured.texts.length = 0;
    const stale = await contactsDashboard(harness, measured).getAnalysisSource!({ actorId: A, claimedSourceDataVersion: "f".repeat(64) });
    assert.deepEqual(stale, { success: false, error: "conflict" });
    assert.deepEqual(measured.texts.map((text) => text.includes(VERSION_READ)), [true], "a stale version costs exactly the version query (the profile read goes through the profile service)");

    // After a data change the page's old version is refused: the user must refresh.
    await store.upsertRecord(contact("c8", { primaryIndustryId: "finance_investment" }));
    measured.texts.length = 0;
    assert.deepEqual(await contactsDashboard(harness, measured).getAnalysisSource!({ actorId: A, claimedSourceDataVersion: claimed }), { success: false, error: "conflict" });
    assert.equal(measured.texts.length, 1);
    // B cannot use A's version.
    assert.deepEqual(await contactsDashboard(harness, measured).getAnalysisSource!({ actorId: B, claimedSourceDataVersion: claimed }), { success: false, error: "conflict" });
  });
});

test("an update that commits after a later revision is visible still invalidates the snapshot", { skip, timeout: 120_000 }, async () => {
  await withSchema({ syncRevision: true }, async ({ client, store, newProvider, oracle }) => {
    assert.ok(databaseUrl);
    const schema = (await client.query<{ schema: string }>("select current_schema() as schema")).rows[0]!.schema;
    const slow = new Pool({ connectionString: databaseUrl, max: 1, options: `-c search_path=${schema}` });
    const connectionClient = await slow.connect();
    try {
      await analytics(newProvider(), A, NOW);
      // T1 takes its revision first but commits last.
      await connectionClient.query("begin");
      await connectionClient.query(
        `update orbit_records set payload = jsonb_set(payload, '{businessRelevanceScore}', '98'::jsonb), updated_at = updated_at
         where workspace_id = $1 and collection_name = 'connections' and record_id = 'k3'`,
        [WORKSPACE],
      );
      // T2 commits a later revision; a read now stores a snapshot without T1.
      await store.upsertRecord(evidence("evd-late"));
      const withoutT1 = await analytics(newProvider(), A, NOW);
      assert.deepEqual(withoutT1, await analytics(oracle, A, NOW));
      await connectionClient.query("commit");
      const measured = recordingClient(client);
      const afterT1 = await analytics(newProvider(measured), A, NOW);
      assert.ok(measured.texts.some((text) => text.includes(GRAPH_READ)), "T1's commit changes the version although max(sync_revision) did not move");
      assert.deepEqual(afterT1, await analytics(oracle, A, NOW));
      assert.notDeepEqual(afterT1, withoutT1);
    } finally {
      connectionClient.release();
      await slow.end();
    }
  });
});
