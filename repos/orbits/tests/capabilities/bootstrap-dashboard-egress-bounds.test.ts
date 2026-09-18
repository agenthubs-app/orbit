import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import test from "node:test";

import { createStorageAppBootstrapProvider } from "../../features/bootstrap/storage/bootstrap-live-record-provider";
import {
  createStorageDashboardAggregateProvider,
  withDashboardLiveReadScope,
} from "../../features/dashboard/storage/dashboard-live-record-provider";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import type {
  LiveRecordSqlClient,
  LiveRecordSqlResult,
} from "../../shared/storage/postgres-live-record-store";

const WORKSPACE_ID = "workspace:egress-bounds";
const ACTOR_ID = "account:egress-owner";
const NOW = "2026-09-17T00:00:00.000Z";
const LOCAL_DATABASE_URL = "postgresql://li@localhost:5432/orbit_lifecycle_r1_20260917";
const TEST_DATABASE_URL = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL ?? "";
const integrationEnabled = TEST_DATABASE_URL === LOCAL_DATABASE_URL;

interface SqlCall {
  text: string;
  values?: readonly unknown[];
}

function sqlRow(
  collectionName: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const recordId = typeof payload.id === "string" ? payload.id : `${collectionName}:row`;

  return {
    workspace_id: WORKSPACE_ID,
    collection_name: collectionName,
    record_id: recordId,
    user_id: ACTOR_ID,
    source_type: "system",
    source_id: `source:${recordId}`,
    source_label: `Source ${recordId}`,
    provider: "egress-bounds-test",
    provider_record_id: recordId,
    evidence_ids: Array.isArray(payload.evidenceIds)
      ? payload.evidenceIds
      : [`evidence:${recordId}`],
    target_type: null,
    target_id: null,
    occurred_at: NOW,
    lifecycle_state: "active",
    created_at: NOW,
    updated_at: NOW,
    payload,
  };
}

function fakeSqlClient(
  rows: readonly Record<string, unknown>[],
): LiveRecordSqlClient & { calls: SqlCall[] } {
  const calls: SqlCall[] = [];

  return {
    calls,
    async query<TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<LiveRecordSqlResult<TRow>> {
      calls.push({ text, values });
      return { rows: rows as readonly TRow[] };
    },
  };
}

function bootstrapRows(): readonly Record<string, unknown>[] {
  return [
    sqlRow("accounts", {
      id: ACTOR_ID,
      name: "Egress Owner Workspace",
      createdAt: NOW,
      updatedAt: NOW,
      ignoredLargeField: "x".repeat(8_000),
    }),
    sqlRow("profiles", {
      id: "profile:egress-owner",
      accountId: ACTOR_ID,
      displayName: "Egress Owner",
      role: "Operator",
      timezone: "Asia/Shanghai",
      createdAt: NOW,
      updatedAt: NOW,
    }),
    sqlRow("contacts", {
      id: "contact:egress-one",
      displayName: "Egress Contact",
      stage: "active",
      source: { type: "manual", id: "source:contact:egress" },
      evidenceIds: ["evidence:contact:egress"],
      createdAt: NOW,
      updatedAt: NOW,
      ignoredLargeField: "x".repeat(8_000),
    }),
    sqlRow("connections", {
      id: "connection:egress-one",
      accountId: ACTOR_ID,
      contactId: "contact:egress-one",
      stage: "active",
      valueTypes: ["commercial_opportunity"],
      summary: "A source-backed connection.",
      businessRelevanceScore: 88,
      source: { type: "manual", id: "source:connection:egress" },
      evidenceIds: ["evidence:connection:egress"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    sqlRow("events", {
      id: "event:egress-one",
      name: "Egress Review",
      startsAt: "2026-09-18T00:00:00.000Z",
      source: { type: "manual", id: "source:event:egress" },
      evidenceIds: ["evidence:event:egress"],
    }),
    sqlRow("tasks", {
      id: "task:egress-one",
      title: "Review the projected read",
      status: "open",
      contactId: "contact:egress-one",
      source: { type: "manual", id: "source:task:egress" },
      evidenceIds: ["evidence:task:egress"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    sqlRow("agentActions", {
      id: "action:egress-one",
      type: "draft_message",
      status: "awaiting_confirmation",
      confirmationRequired: true,
      source: { type: "agent_action", id: "source:action:egress" },
      evidenceIds: ["evidence:action:egress"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    sqlRow("permissions", {
      id: "permission:egress-one",
      capability: "relationship_local_remote_database",
      state: "requested",
      updatedAt: NOW,
      source: { type: "system", id: "source:permission:egress" },
      evidenceIds: ["evidence:permission:egress"],
    }),
    sqlRow("notifications", {
      id: "notification:egress-one",
      channel: "in_app",
      title: "Projected notification",
      body: "The projected read is ready.",
      status: "pending",
      source: { type: "system", id: "source:notification:egress" },
      evidenceIds: ["evidence:notification:egress"],
      createdAt: NOW,
    }),
    sqlRow("evidence", {
      id: "evidence:bootstrap:egress",
    }),
  ];
}

function dashboardRows(): readonly Record<string, unknown>[] {
  return [
    sqlRow("contacts", {
      id: "contact:dashboard-one",
      displayName: "Dashboard Contact",
      organization: "Orbit",
      stage: "nurture",
      primaryIndustryId: "technology",
      customTags: ["priority"],
      source: { type: "manual", id: "source:dashboard:contact" },
      evidenceIds: ["evidence:dashboard:contact"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    sqlRow("contact_detail_states", {
      id: "detail:dashboard-one",
      contactId: "contact:dashboard-one",
      tags: ["source-backed"],
    }),
    sqlRow("connections", {
      id: "connection:dashboard-one",
      accountId: ACTOR_ID,
      contactId: "contact:dashboard-one",
      stage: "active",
      valueTypes: ["commercial_opportunity"],
      summary: "A dashboard connection.",
      businessRelevanceScore: 91,
      source: { type: "manual", id: "source:dashboard:connection" },
      evidenceIds: ["evidence:dashboard:connection"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    sqlRow("events", {
      id: "event:dashboard-one",
      name: "Dashboard Event",
      startsAt: "2026-09-18T00:00:00.000Z",
      source: { type: "manual", id: "source:dashboard:event" },
      evidenceIds: ["evidence:dashboard:event"],
    }),
    sqlRow("tasks", {
      id: "task:dashboard-one",
      title: "Follow up",
      status: "open",
      contactId: "contact:dashboard-one",
      source: { type: "manual", id: "source:dashboard:task" },
      evidenceIds: ["evidence:dashboard:task"],
      createdAt: NOW,
      updatedAt: NOW,
    }),
    sqlRow("evidence", {
      id: "evidence:dashboard:one",
      sourceType: "manual",
      sourceId: "source:dashboard:evidence",
      summary: "Dashboard evidence.",
      occurredAt: NOW,
      confidence: 1,
      createdBy: ACTOR_ID,
    }),
  ];
}

test("bootstrap Postgres projection keeps complete rows while bounding payload egress", async () => {
  const client = fakeSqlClient(bootstrapRows());
  const provider = createStorageAppBootstrapProvider({
    sqlClient: client,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });

  const [first, second] = await Promise.all([
    provider.readBootstrapGraphForAccount!(ACTOR_ID),
    provider.readBootstrapGraphForAccount!(ACTOR_ID),
  ]);

  assert.deepEqual(first, second);
  assert.equal(client.calls.length, 1);
  assert.equal(first.accounts.length, 1);
  assert.equal(first.contacts.length, 1);
  assert.equal(first.connections.length, 1);
  assert.equal(first.events.length, 1);
  assert.equal(first.tasks.length, 1);
  assert.match(client.calls[0]?.text ?? "", /jsonb_build_object/i);
  assert.match(client.calls[0]?.text ?? "", /collection_name = any/i);
  assert.match(client.calls[0]?.text ?? "", /user_id = \$2/i);
  assert.match(client.calls[0]?.text ?? "", /lifecycle_state <> 'deleted'/i);
  assert.doesNotMatch(client.calls[0]?.text ?? "", /select \*/i);
  assert.doesNotMatch(client.calls[0]?.text ?? "", /\blimit\b/i);
  assert.equal(client.calls[0]?.values?.[1], ACTOR_ID);
});

test("dashboard Postgres projection preserves counts, detail tags, and concurrent graph reads", async () => {
  const client = fakeSqlClient(dashboardRows());
  const provider = createStorageDashboardAggregateProvider({
    sqlClient: client,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });

  const [first, second] = await withDashboardLiveReadScope(() => Promise.all([
    provider.readDashboardGraphForAccount!(ACTOR_ID),
    provider.readDashboardGraphForAccount!(ACTOR_ID),
  ]));

  assert.deepEqual(first, second);
  assert.equal(client.calls.length, 1);
  assert.equal(first.contacts.length, 1);
  assert.equal(first.contacts[0]?.customTags?.[0], "source-backed");
  assert.equal(first.connections.length, 1);
  assert.equal(first.events.length, 1);
  assert.equal(first.tasks.length, 1);
  assert.equal(first.evidence.length, 1);
  assert.match(client.calls[0]?.text ?? "", /jsonb_build_object/i);
  assert.match(client.calls[0]?.text ?? "", /collection_name = any/i);
  assert.match(client.calls[0]?.text ?? "", /user_id = \$2/i);
  assert.match(client.calls[0]?.text ?? "", /lifecycle_state <> 'deleted'/i);
  assert.doesNotMatch(client.calls[0]?.text ?? "", /select \*/i);
  assert.doesNotMatch(client.calls[0]?.text ?? "", /\blimit\b/i);
  assert.equal(client.calls[0]?.values?.[1], ACTOR_ID);
});

function rejectingOnceSqlClient(
  rows: readonly Record<string, unknown>[],
): LiveRecordSqlClient & { calls: SqlCall[] } {
  const client = fakeSqlClient(rows);
  let shouldReject = true;

  return {
    calls: client.calls,
    async query<TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<LiveRecordSqlResult<TRow>> {
      client.calls.push({ text, values });
      if (shouldReject) {
        shouldReject = false;
        throw new Error("synthetic projected read failure");
      }
      return { rows: rows as readonly TRow[] };
    },
  };
}

test("projected reads coalesce concurrent rejection and permit a retry", async () => {
  const bootstrapClient = rejectingOnceSqlClient(bootstrapRows());
  const bootstrap = createStorageAppBootstrapProvider({
    sqlClient: bootstrapClient,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });

  const rejected = await Promise.allSettled([
    bootstrap.readBootstrapGraphForAccount!(ACTOR_ID),
    bootstrap.readBootstrapGraphForAccount!(ACTOR_ID),
  ]);
  assert.deepEqual(
    rejected.map((result) => result.status),
    ["rejected", "rejected"],
  );
  assert.equal(bootstrapClient.calls.length, 1);

  const [retryFirst, retrySecond] = await Promise.all([
    bootstrap.readBootstrapGraphForAccount!(ACTOR_ID),
    bootstrap.readBootstrapGraphForAccount!(ACTOR_ID),
  ]);
  assert.deepEqual(retryFirst, retrySecond);
  assert.equal(bootstrapClient.calls.length, 2);

  const dashboardClient = rejectingOnceSqlClient(dashboardRows());
  const dashboard = createStorageDashboardAggregateProvider({
    sqlClient: dashboardClient,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });

  const dashboardRejected = await withDashboardLiveReadScope(() => Promise.allSettled([
    dashboard.readDashboardGraphForAccount!(ACTOR_ID),
    dashboard.readDashboardGraphForAccount!(ACTOR_ID),
  ]));
  assert.deepEqual(
    dashboardRejected.map((result) => result.status),
    ["rejected", "rejected"],
  );
  assert.equal(dashboardClient.calls.length, 1);

  const dashboardRetry = await dashboard.readDashboardGraphForAccount!(ACTOR_ID);
  assert.equal(dashboardRetry.contacts.length, 1);
  assert.equal(dashboardClient.calls.length, 2);
});

interface PendingSqlResult {
  resolve: () => void;
  reject: (error: Error) => void;
}

interface ControlledDashboardSqlClient extends LiveRecordSqlClient {
  calls: SqlCall[];
  graphPending: PendingSqlResult[];
  summaryPending: PendingSqlResult[];
  failNextGraph: boolean;
  resolveGraphAt: (index: number) => void;
  resolveNextGraph: () => void;
  resolveNextSummary: () => void;
}

function summaryReaderRow(): Record<string, unknown> {
  return {
    generated_at: NOW,
    contacts_count: 1,
    contacts_evidence_ids: ["e:dashboard:contact"],
    connections_evidence_ids: ["e:dashboard:connection"],
    events_evidence_ids: ["e:dashboard:event"],
    tasks_evidence_ids: ["e:dashboard:task"],
    high_value_count: 1,
    high_value_evidence_ids: ["e:dashboard:connection"],
    pending_followup_count: 1,
    pending_followup_evidence_ids: ["e:dashboard:task"],
    dormant_contact_count: 1,
    dormant_contact_evidence_ids: ["e:dashboard:contact"],
    recent_activity: [],
    activity_order_safe: true,
  };
}

function controlledDashboardSqlClient(): ControlledDashboardSqlClient {
  const calls: SqlCall[] = [];
  const graphPending: PendingSqlResult[] = [];
  const summaryPending: PendingSqlResult[] = [];
  const client: ControlledDashboardSqlClient = {
    calls,
    graphPending,
    summaryPending,
    failNextGraph: false,
    resolveGraphAt(index) {
      const [pending] = graphPending.splice(index, 1);
      assert.ok(pending, `graph read ${index} should be pending`);
      pending?.resolve();
    },
    async query<TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<LiveRecordSqlResult<TRow>> {
      calls.push({ text, values });
      const isSummary = /dashboard summary read model/i.test(text);
      if (!isSummary && client.failNextGraph) {
        client.failNextGraph = false;
        throw new Error("synthetic early graph rejection");
      }
      return new Promise<LiveRecordSqlResult<TRow>>((resolve, reject) => {
        const pending = {
          resolve: () => resolve({
            rows: (isSummary ? [summaryReaderRow()] : dashboardRows()) as readonly TRow[],
          }),
          reject,
        };
        (isSummary ? summaryPending : graphPending).push(pending);
      });
    },
    resolveNextGraph() {
      client.resolveGraphAt(0);
    },
    resolveNextSummary() {
      const pending = summaryPending.shift();
      assert.ok(pending, "a summary read should be pending");
      pending?.resolve();
    },
  };
  return client;
}

async function waitForCondition(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail("timed out waiting for a controlled SQL read");
}

test("dashboard graph coalescing is request-scoped and never reuses an unscoped promise", async () => {
  const client = controlledDashboardSqlClient();
  const provider = createStorageDashboardAggregateProvider({
    sqlClient: client,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
    source: "test:dashboard-scope",
    sourceLabel: "Dashboard scope test storage",
  });

  const aggregateFirst = await withDashboardLiveReadScope(async () => {
    const aggregate = provider.readDashboardGraphForAccount!(ACTOR_ID);
    await waitForCondition(() => client.calls.length === 1);
    const summary = provider.readDashboardSummaryForAccount!(ACTOR_ID);
    assert.equal(client.calls.length, 1, "same actor uses the in-flight graph");
    client.resolveNextGraph();
    return Promise.all([aggregate, summary]);
  });
  assert.equal(aggregateFirst[0].contacts.length, 1);
  assert.equal(aggregateFirst[1].success, true);

  const summaryOutsideScope = provider.readDashboardSummaryForAccount!(ACTOR_ID);
  await waitForCondition(() => client.calls.length === 2);
  assert.equal(client.summaryPending.length, 1);
  client.resolveNextSummary();
  await summaryOutsideScope;

  const nestedClient = controlledDashboardSqlClient();
  const nestedProvider = createStorageDashboardAggregateProvider({
    sqlClient: nestedClient,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });
  await withDashboardLiveReadScope(async () => {
    const outer = nestedProvider.readDashboardGraphForAccount!(ACTOR_ID);
    await waitForCondition(() => nestedClient.calls.length === 1);
    await withDashboardLiveReadScope(async () => {
      const inner = nestedProvider.readDashboardGraphForAccount!(ACTOR_ID);
      await waitForCondition(() => nestedClient.calls.length === 2);
      nestedClient.resolveGraphAt(1);
      await inner;
    });
    assert.equal(nestedClient.calls.length, 2, "inner scope owns an independent map");
    const outerDuplicate = nestedProvider.readDashboardGraphForAccount!(ACTOR_ID);
    assert.equal(nestedClient.calls.length, 2, "inner cleanup does not clear the outer scope");
    nestedClient.resolveGraphAt(0);
    await Promise.all([outer, outerDuplicate]);
  });

  const requestIsolationClient = controlledDashboardSqlClient();
  const requestIsolationProvider = createStorageDashboardAggregateProvider({
    sqlClient: requestIsolationClient,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });
  let releaseOldRequest: (() => void) | undefined;
  const oldRequest = withDashboardLiveReadScope(async () => {
    const oldRead = requestIsolationProvider.readDashboardGraphForAccount!(ACTOR_ID);
    await waitForCondition(() => requestIsolationClient.calls.length === 1);
    await new Promise<void>((resolve) => { releaseOldRequest = resolve; });
    return oldRead;
  });
  await waitForCondition(() => requestIsolationClient.calls.length === 1);
  const newRequest = await withDashboardLiveReadScope(async () => {
    const freshRead = requestIsolationProvider.readDashboardGraphForAccount!(ACTOR_ID);
    await waitForCondition(() => requestIsolationClient.calls.length === 2);
    requestIsolationClient.resolveGraphAt(1);
    return freshRead;
  });
  assert.equal(newRequest.contacts.length, 1);
  releaseOldRequest?.();
  requestIsolationClient.resolveGraphAt(0);
  await oldRequest;
  assert.equal(requestIsolationClient.calls.length, 2, "a pending read cannot cross request scopes");

  const summaryFirstClient = controlledDashboardSqlClient();
  const summaryFirstProvider = createStorageDashboardAggregateProvider({
    sqlClient: summaryFirstClient,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });
  await withDashboardLiveReadScope(async () => {
    const summary = summaryFirstProvider.readDashboardSummaryForAccount!(ACTOR_ID);
    await waitForCondition(() => summaryFirstClient.calls.length === 1);
    const aggregate = summaryFirstProvider.readDashboardGraphForAccount!(ACTOR_ID);
    assert.equal(summaryFirstClient.calls.length, 2, "summary-first cannot cancel its SQL read");
    summaryFirstClient.resolveNextSummary();
    summaryFirstClient.resolveNextGraph();
    await Promise.all([summary, aggregate]);
  });

  const differentActorClient = controlledDashboardSqlClient();
  const differentActorProvider = createStorageDashboardAggregateProvider({
    sqlClient: differentActorClient,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });
  await withDashboardLiveReadScope(async () => {
    const aggregate = differentActorProvider.readDashboardGraphForAccount!(ACTOR_ID);
    await waitForCondition(() => differentActorClient.calls.length === 1);
    const summary = differentActorProvider.readDashboardSummaryForAccount!("account:other");
    await waitForCondition(() => differentActorClient.calls.length === 2);
    assert.equal(differentActorClient.graphPending.length, 1);
    assert.equal(differentActorClient.summaryPending.length, 1);
    differentActorClient.resolveNextGraph();
    differentActorClient.resolveNextSummary();
    await Promise.all([aggregate, summary]);
  });

  const undefinedActorClient = controlledDashboardSqlClient();
  const undefinedActorProvider = createStorageDashboardAggregateProvider({
    sqlClient: undefinedActorClient,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });
  await withDashboardLiveReadScope(async () => {
    const unscoped = undefinedActorProvider.readDashboardGraph();
    const literalActor = undefinedActorProvider.readDashboardGraphForAccount!("\u0000unscoped");
    await waitForCondition(() => undefinedActorClient.calls.length === 2);
    undefinedActorClient.resolveNextGraph();
    undefinedActorClient.resolveNextGraph();
    await Promise.all([unscoped, literalActor]);
  });

  const earlyRejectClient = controlledDashboardSqlClient();
  earlyRejectClient.failNextGraph = true;
  const earlyRejectProvider = createStorageDashboardAggregateProvider({
    sqlClient: earlyRejectClient,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: WORKSPACE_ID,
  });
  await assert.rejects(
    withDashboardLiveReadScope(async () => {
      const rejected = earlyRejectProvider.readDashboardGraphForAccount!(ACTOR_ID);
      const remaining = earlyRejectProvider.readDashboardGraphForAccount!("account:remaining");
      await waitForCondition(() => earlyRejectClient.calls.length === 2);
      await assert.rejects(Promise.resolve(rejected));
      void remaining;
      throw new Error("close scope before remaining read settles");
    }),
    /close scope/,
  );
  earlyRejectClient.resolveNextGraph();
  const retry = earlyRejectProvider.readDashboardGraphForAccount!("account:remaining");
  await waitForCondition(() => earlyRejectClient.calls.length === 3);
  earlyRejectClient.resolveNextGraph();
  await retry;
  assert.equal(earlyRejectClient.calls.length, 3, "closed scope did not reinsert the remaining promise");
});

interface LocalRecordInput {
  collectionName: string;
  payload: Record<string, unknown>;
  recordId: string;
  evidenceIds?: readonly string[];
  occurredAt?: string;
}

async function insertLocalRecord(pool: Pool, input: LocalRecordInput): Promise<void> {
  const occurredAt = input.occurredAt ?? NOW;
  await pool.query(
    `
      insert into orbit_records (
        workspace_id, collection_name, record_id, user_id, source_type, source_id,
        source_label, provider, provider_record_id, evidence_ids, target_type,
        target_id, occurred_at, lifecycle_state, search_text, payload, created_at,
        updated_at
      ) values (
        $1, $2, $3, $4, 'manual', $5, $6, 'egress-test', $3, $7, null, null,
        $8, 'active', '', $9::jsonb, $10, $10
      )
    `,
    [
      WORKSPACE_ID,
      input.collectionName,
      input.recordId,
      ACTOR_ID,
      `source:${input.recordId}`,
      `Local ${input.recordId}`,
      [...(input.evidenceIds ?? [])],
      occurredAt,
      JSON.stringify(input.payload),
      NOW,
    ],
  );
}

test(
  "local PG projection reports lower returned bytes without truncating rows",
  { skip: integrationEnabled ? false : "set ORBIT_LIFECYCLE_TEST_DATABASE_URL to the approved local URL" },
  async () => {
    assert.equal(TEST_DATABASE_URL, LOCAL_DATABASE_URL);
    const databaseUrl = new URL(TEST_DATABASE_URL);
    assert.equal(databaseUrl.hostname, "localhost");
    assert.equal(databaseUrl.pathname, "/orbit_lifecycle_r1_20260917");

    const schema = `orbit_egress_${randomUUID().replaceAll("-", "").slice(0, 20)}`;
    const admin = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    let scoped: Pool | null = null;

    try {
      await admin.query(`create schema ${schema}`);
      scoped = new Pool({
        connectionString: TEST_DATABASE_URL,
        max: 2,
        options: `-c search_path=${schema},public`,
      });
      await scoped.query(ORBIT_RECORDS_SCHEMA_SQL);

      await insertLocalRecord(scoped, {
        collectionName: "accounts",
        payload: {
          id: ACTOR_ID,
          name: "Local Egress Owner",
          createdAt: NOW,
          updatedAt: NOW,
          ignoredLargeField: "x".repeat(40_000),
        },
        recordId: ACTOR_ID,
      });
      await insertLocalRecord(scoped, {
        collectionName: "profiles",
        payload: {
          id: "profile:local-egress",
          accountId: ACTOR_ID,
          displayName: "Local Egress Owner",
          timezone: "Asia/Shanghai",
          createdAt: NOW,
          updatedAt: NOW,
        },
        recordId: "profile:local-egress",
      });
      await insertLocalRecord(scoped, {
        collectionName: "contacts",
        payload: {
          id: "contact:local-egress",
          displayName: "Local Egress Contact",
          stage: "active",
          source: { type: "manual", id: "source:local-egress" },
          evidenceIds: ["evidence:local-egress"],
          createdAt: NOW,
          updatedAt: NOW,
          ignoredLargeField: "x".repeat(40_000),
        },
        recordId: "contact:local-egress",
        evidenceIds: ["evidence:local-egress"],
      });
      await insertLocalRecord(scoped, {
        collectionName: "connections",
        payload: {
          id: "connection:local-egress",
          accountId: ACTOR_ID,
          contactId: "contact:local-egress",
          stage: "active",
          valueTypes: ["commercial_opportunity"],
          summary: "Local egress connection.",
          source: { type: "manual", id: "source:local-connection" },
          evidenceIds: ["evidence:local-connection"],
          createdAt: NOW,
          updatedAt: NOW,
        },
        recordId: "connection:local-egress",
        evidenceIds: ["evidence:local-connection"],
      });
      await insertLocalRecord(scoped, {
        collectionName: "events",
        payload: {
          id: "event:local-egress",
          name: "Local Egress Event",
          startsAt: "2026-09-18T00:00:00.000Z",
          source: { type: "manual", id: "source:local-event" },
          evidenceIds: ["evidence:local-event"],
        },
        recordId: "event:local-egress",
        evidenceIds: ["evidence:local-event"],
      });
      await insertLocalRecord(scoped, {
        collectionName: "tasks",
        payload: {
          id: "task:local-egress",
          title: "Local egress follow-up",
          status: "open",
          contactId: "contact:local-egress",
          source: { type: "manual", id: "source:local-task" },
          evidenceIds: ["evidence:local-task"],
          createdAt: NOW,
          updatedAt: NOW,
        },
        recordId: "task:local-egress",
        evidenceIds: ["evidence:local-task"],
      });

      const fullResult = await scoped.query(
        "select * from orbit_records where workspace_id = $1 and user_id = $2",
        [WORKSPACE_ID, ACTOR_ID],
      );
      const fullBytes = Buffer.byteLength(JSON.stringify(fullResult.rows));
      let projectedBytes = 0;
      const sqlClient: LiveRecordSqlClient = {
        async query<TRow = Record<string, unknown>>(text, values) {
          const result = await scoped!.query<TRow>(text, values ? [...values] : undefined);
          projectedBytes += Buffer.byteLength(JSON.stringify(result.rows));
          return { rows: result.rows as readonly TRow[] };
        },
      };

      const store = createMemoryLiveRecordStore<Record<string, unknown>>();
      const bootstrap = createStorageAppBootstrapProvider({
        sqlClient,
        store,
        workspaceId: WORKSPACE_ID,
      });
      const dashboard = createStorageDashboardAggregateProvider({
        sqlClient,
        store,
        workspaceId: WORKSPACE_ID,
      });
      const [bootstrapGraph, dashboardGraph] = await Promise.all([
        bootstrap.readBootstrapGraphForAccount!(ACTOR_ID),
        dashboard.readDashboardGraphForAccount!(ACTOR_ID),
      ]);

      assert.equal(bootstrapGraph.contacts.length, 1);
      assert.equal(dashboardGraph.contacts.length, 1);
      assert.equal(bootstrapGraph.connections.length, 1);
      assert.equal(dashboardGraph.connections.length, 1);
      assert.equal(bootstrapGraph.tasks.length, 1);
      assert.equal(dashboardGraph.tasks.length, 1);
      assert.ok(projectedBytes > 0);
      assert.ok(projectedBytes < fullBytes);
      console.log(
        JSON.stringify({
          fullRows: fullResult.rows.length,
          fullBytes,
          projectedBytes,
          reductionPercent: Number(((1 - projectedBytes / fullBytes) * 100).toFixed(2)),
        }),
      );
    } finally {
      await scoped?.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    }
  },
);
