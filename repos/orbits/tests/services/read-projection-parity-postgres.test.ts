import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createStorageAppBootstrapProvider } from "../../features/bootstrap/storage/bootstrap-live-record-provider";
import { createStorageDashboardAggregateProvider } from "../../features/dashboard/storage/dashboard-live-record-provider";
import { defaultMockFixtures } from "../../shared/mock/fixtures";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
test("Postgres projections preserve the full generated bootstrap/dashboard graph and actor boundary", {
  skip: databaseUrl ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "Local parity test only");
  const schema = `projection_parity_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema} -c statement_timeout=5000` });
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool });
  const workspaceId = "workspace:projection-parity";
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId, collectionNames: ["accounts", "agentActions", "connections", "contacts", "events", "evidence", "notifications", "permissions", "profiles", "tasks"] });
    const oldBootstrap = createStorageAppBootstrapProvider({ store, workspaceId });
    const newBootstrap = createStorageAppBootstrapProvider({ store, workspaceId, sqlClient: client });
    const oldDashboard = createStorageDashboardAggregateProvider({ store, workspaceId });
    const newDashboard = createStorageDashboardAggregateProvider({ store, workspaceId, sqlClient: client });
    // The old SQL has no tie-breaker for equal occurred_at/updated_at. Compare
    // complete contents first, without asserting an order it never guaranteed.
    const canonicalContents = (graph: object) => Object.fromEntries(Object.entries(graph).map(([key, value]) => [
      key, Array.isArray(value) ? [...value].sort((left, right) => String(left?.id ?? left).localeCompare(String(right?.id ?? right))) : value,
    ]));
    assert.deepEqual(canonicalContents(await newBootstrap.readBootstrapGraph()), canonicalContents(await oldBootstrap.readBootstrapGraph()));
    assert.deepEqual(canonicalContents(await newDashboard.readDashboardGraph()), canonicalContents(await oldDashboard.readDashboardGraph()));
    // Also compare exact result ordering with distinct SQL sort keys. Payload
    // fields remain the real generated fixtures, not simplified replacement DTOs.
    await client.query(`with ranked as (
      select workspace_id,collection_name,record_id,row_number() over (order by collection_name,record_id) as n
      from orbit_records where workspace_id=$1
    ) update orbit_records r set occurred_at=timestamptz '2026-09-17 02:00:00+00' - ranked.n * interval '1 second'
      from ranked where r.workspace_id=ranked.workspace_id and r.collection_name=ranked.collection_name and r.record_id=ranked.record_id`, [workspaceId]);
    assert.deepEqual(await newBootstrap.readBootstrapGraph(), await oldBootstrap.readBootstrapGraph());
    assert.deepEqual(await newDashboard.readDashboardGraph(), await oldDashboard.readDashboardGraph());
    for (const actor of [...defaultMockFixtures.accounts.map(account => account.id), "actor:unrelated", "__unscoped__"]) {
      assert.deepEqual(await newBootstrap.readBootstrapGraphForAccount!(actor), await oldBootstrap.readBootstrapGraphForAccount!(actor), `bootstrap ${actor}`);
      assert.deepEqual(await newDashboard.readDashboardGraphForAccount!(actor), await oldDashboard.readDashboardGraphForAccount!(actor), `dashboard ${actor}`);
    }
    const [unscoped, sentinel] = await Promise.all([newBootstrap.readBootstrapGraph(), newBootstrap.readBootstrapGraphForAccount!("__unscoped__")]);
    assert.ok(unscoped.contacts.length > 0);
    assert.equal(sentinel.contacts.length, 0, "A literal actor ID cannot collide with the unscoped coalescing key");
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});

// B3 keeps its expected summary independent from both the live summary rule
// and the SQL reader.  In particular, these helpers deliberately operate on
// persisted records and repeat the mapper predicates instead of calling a
// provider to manufacture the expected response.
import type {
  DashboardAggregateScenario,
  DashboardAggregateSummaryResult,
} from "../../features/dashboard/contract";
import { createLiveDashboardAggregateService } from "../../features/dashboard/live-service";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";
import type {
  LiveRecordSqlClient,
  LiveRecordSqlResult,
} from "../../shared/storage/postgres-live-record-store";

const SUMMARY_DATABASE_URL = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const SUMMARY_WORKSPACE = "workspace:b3-summary";
const SUMMARY_ACTOR = "account:b3-owner";
const SUMMARY_OTHER_ACTOR = "account:b3-other";
const SUMMARY_TASK_ONLY_ACTOR = "account:b3-task-only";
const SUMMARY_NOW = "2026-09-17T00:00:00.000Z";
const SUMMARY_COLLECTIONS = new Set([
  "connections",
  "contacts",
  "contact_detail_states",
  "events",
  "evidence",
  "tasks",
]);
const ORACLE_SOURCE_TYPES = new Set([
  "manual",
  "business_card_ocr",
  "qr_scan",
  "event_import",
  "external_contacts",
  "email_signal",
  "calendar_signal",
  "referral",
  "chat_summary",
  "agent_action",
  "system",
]);
const ORACLE_STAGES = new Set([
  "captured",
  "reviewing",
  "active",
  "needs_follow_up",
  "nurture",
  "archived",
]);
const ORACLE_VALUE_TYPES = new Set([
  "strategic_fit",
  "commercial_opportunity",
  "knowledge_exchange",
  "referral_path",
  "community_context",
]);
const ECMASCRIPT_TRIM_CHARACTERS = [
  "\u0009",
  "\u000a",
  "\u000b",
  "\u000c",
  "\u000d",
  "\u0020",
  "\u00a0",
  "\u1680",
  "\u2000",
  "\u2001",
  "\u2002",
  "\u2003",
  "\u2004",
  "\u2005",
  "\u2006",
  "\u2007",
  "\u2008",
  "\u2009",
  "\u200a",
  "\u2028",
  "\u2029",
  "\u202f",
  "\u205f",
  "\u3000",
  "\ufeff",
] as const;
const ECMASCRIPT_TRIM_STRING = ECMASCRIPT_TRIM_CHARACTERS.join("");

type SummaryRecord = LiveRecord<Record<string, unknown>>;

function oracleNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function oracleStrings(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => oracleNonEmpty(item))
    : [];
}

function oracleEvidence(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) return null;
  const ids = oracleStrings(value);
  return ids.length > 0 ? ids : null;
}

function oracleSource(value: unknown): { label?: string } | null {
  if (typeof value !== "object" || value === null) return null;
  const source = value as Record<string, unknown>;
  if (
    !oracleSourceTypes(source.type) ||
    !oracleNonEmpty(source.id)
  ) {
    return null;
  }
  return {
    label: oracleNonEmpty(source.label) ? source.label : undefined,
  };
}

function oracleSourceTypes(value: unknown): value is string {
  return typeof value === "string" && ORACLE_SOURCE_TYPES.has(value);
}

function scopedSummaryRecords(
  records: readonly SummaryRecord[],
  workspaceId: string,
  actorId: string,
): readonly SummaryRecord[] {
  return records
    .filter(
      (record) =>
        record.workspaceId === workspaceId &&
        record.userId === actorId &&
        record.lifecycleState !== "deleted" &&
        SUMMARY_COLLECTIONS.has(record.collectionName),
    )
    .sort((left, right) => {
      const leftOccurredAt = left.occurredAt ?? left.updatedAt;
      const rightOccurredAt = right.occurredAt ?? right.updatedAt;
      return (
        rightOccurredAt.localeCompare(leftOccurredAt) ||
        right.updatedAt.localeCompare(left.updatedAt)
      );
    });
}

function validSummaryContact(record: SummaryRecord): {
  id: string;
  displayName: string;
  stage: string;
  createdAt: string;
  sourceLabel?: string;
  evidenceIds: readonly string[];
} | null {
  const payload = record.payload;
  const source = oracleSource(payload.source);
  const evidenceIds = oracleEvidence(payload.evidenceIds);
  if (
    !oracleNonEmpty(payload.id) ||
    !oracleNonEmpty(payload.displayName) ||
    typeof payload.stage !== "string" ||
    !ORACLE_STAGES.has(payload.stage) ||
    !source ||
    !evidenceIds ||
    !oracleNonEmpty(payload.createdAt) ||
    !oracleNonEmpty(payload.updatedAt)
  ) {
    return null;
  }
  return {
    id: payload.id,
    displayName: payload.displayName,
    stage: payload.stage,
    createdAt: payload.createdAt,
    sourceLabel: source.label,
    evidenceIds,
  };
}

function validSummaryConnection(record: SummaryRecord): {
  evidenceIds: readonly string[];
  valueTypes: readonly string[];
  businessRelevanceScore?: number;
  relationshipStrength?: number;
} | null {
  const payload = record.payload;
  const source = oracleSource(payload.source);
  const evidenceIds = oracleEvidence(payload.evidenceIds);
  if (
    !oracleNonEmpty(payload.id) ||
    !oracleNonEmpty(payload.accountId) ||
    !oracleNonEmpty(payload.contactId) ||
    typeof payload.stage !== "string" ||
    !ORACLE_STAGES.has(payload.stage) ||
    !oracleNonEmpty(payload.summary) ||
    !source ||
    !evidenceIds ||
    !oracleNonEmpty(payload.createdAt) ||
    !oracleNonEmpty(payload.updatedAt)
  ) {
    return null;
  }
  return {
    evidenceIds,
    valueTypes: oracleStrings(payload.valueTypes).filter((value) =>
      ORACLE_VALUE_TYPES.has(value),
    ),
    businessRelevanceScore:
      typeof payload.businessRelevanceScore === "number"
        ? payload.businessRelevanceScore
        : undefined,
    relationshipStrength:
      typeof payload.relationshipStrength === "number"
        ? payload.relationshipStrength
        : undefined,
  };
}

function validSummaryEvent(record: SummaryRecord): {
  evidenceIds: readonly string[];
} | null {
  const payload = record.payload;
  const source = oracleSource(payload.source);
  const evidenceIds = oracleEvidence(payload.evidenceIds);
  return oracleNonEmpty(payload.id) &&
    oracleNonEmpty(payload.name) &&
    oracleNonEmpty(payload.startsAt) &&
    Boolean(source) &&
    Boolean(evidenceIds)
    ? { evidenceIds: evidenceIds as readonly string[] }
    : null;
}

function validSummaryTask(record: SummaryRecord): {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  sourceLabel?: string;
  evidenceIds: readonly string[];
} | null {
  const payload = record.payload;
  const source = oracleSource(payload.source);
  const evidenceIds = oracleEvidence(payload.evidenceIds);
  if (
    !oracleNonEmpty(payload.id) ||
    !oracleNonEmpty(payload.title) ||
    typeof payload.status !== "string" ||
    !new Set(["open", "scheduled", "completed", "dismissed"]).has(
      payload.status,
    ) ||
    !source ||
    !evidenceIds ||
    !oracleNonEmpty(payload.createdAt) ||
    !oracleNonEmpty(payload.updatedAt)
  ) {
    return null;
  }
  return {
    id: payload.id,
    title: payload.title,
    status: payload.status,
    updatedAt: payload.updatedAt,
    sourceLabel: source.label,
    evidenceIds,
  };
}

function oraclePriority(connection: {
  businessRelevanceScore?: number;
  relationshipStrength?: number;
  valueTypes: readonly string[];
}): number {
  return Math.round(
    connection.businessRelevanceScore ??
      connection.relationshipStrength ??
      Math.min(95, 60 + connection.valueTypes.length * 10),
  );
}

function oracleGeneratedAt(records: readonly SummaryRecord[]): string {
  return records.map((record) => record.updatedAt).sort().at(-1) ?? new Date(0).toISOString();
}

function oracleProvenance(
  records: readonly SummaryRecord[],
  workspaceId: string,
  actorId: string,
  source: string,
  sourceLabel: string,
): {
  source: string;
  sourceLabel: string;
  evidenceIds: readonly string[];
  collectedAt: string;
  privacy: "live-dashboard-aggregate";
  generationMethod: "live-store-query" | "rule-based-summary";
  liveAnalyticsQueryExecuted: false;
  productionAggregateReadExecuted: false;
  externalNetworkRequested: false;
  databaseReadExecuted: true;
  databaseWriteExecuted: false;
  aiProviderRequested: false;
  calendarProviderRequested: false;
  emailProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
} {
  const scoped = scopedSummaryRecords(records, workspaceId, actorId);
  const validContacts = scoped
    .filter((record) => record.collectionName === "contacts")
    .map(validSummaryContact)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const validConnections = scoped
    .filter((record) => record.collectionName === "connections")
    .map(validSummaryConnection)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const validEvents = scoped
    .filter((record) => record.collectionName === "events")
    .map(validSummaryEvent)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const validTasks = scoped
    .filter((record) => record.collectionName === "tasks")
    .map(validSummaryTask)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const allEvidence = [
    ...validContacts.flatMap((value) => value.evidenceIds),
    ...validConnections.flatMap((value) => value.evidenceIds),
    ...validEvents.flatMap((value) => value.evidenceIds),
    ...validTasks.flatMap((value) => value.evidenceIds),
  ];
  return {
    source,
    sourceLabel,
    evidenceIds:
      allEvidence.length > 0
        ? [...new Set(allEvidence)]
        : ["evidence:dashboard-live-store-empty"],
    collectedAt: oracleGeneratedAt(scoped),
    privacy: "live-dashboard-aggregate",
    generationMethod: "live-store-query",
    liveAnalyticsQueryExecuted: false,
    productionAggregateReadExecuted: false,
    externalNetworkRequested: false,
    databaseReadExecuted: true,
    databaseWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

function literalSummaryOracle(
  records: readonly SummaryRecord[],
  workspaceId: string,
  actorId: string,
  source = "test:dashboard-summary",
  sourceLabel = "B3 dashboard summary test storage",
  scenario: DashboardAggregateScenario = "success",
): DashboardAggregateSummaryResult {
  const scoped = scopedSummaryRecords(records, workspaceId, actorId);
  const generatedAt = oracleGeneratedAt(scoped);
  const provenance = oracleProvenance(
    records,
    workspaceId,
    actorId,
    source,
    `${sourceLabel} summary`,
  );
  if (scenario === "failure") {
    return {
      success: false,
      error: {
        code: "DASHBOARD_AGGREGATE_LIVE_FAILED",
        appCode: "SERVICE_UNAVAILABLE",
        message:
          "The dashboard aggregate live service returned a controlled failure state.",
        recovery:
          "Render the dashboard aggregate live failure state, keep downstream actions off, and inspect the source-backed relationship graph before retrying.",
        state: "failure",
        provenance: {
          ...provenance,
          sourceLabel: "Live dashboard controlled failure",
          generationMethod: "live-store-query",
        },
        evidenceIds: provenance.evidenceIds,
      },
    };
  }
  const contacts = scoped
    .filter((record) => record.collectionName === "contacts")
    .map(validSummaryContact)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const connections = scoped
    .filter((record) => record.collectionName === "connections")
    .map(validSummaryConnection)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const events = scoped
    .filter((record) => record.collectionName === "events")
    .map(validSummaryEvent)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const tasks = scoped
    .filter((record) => record.collectionName === "tasks")
    .map(validSummaryTask)
    .filter((value): value is NonNullable<typeof value> => value !== null);
  const activities = [
    ...contacts.map((contact) => ({
      activityId: `activity:dashboard:contact:${contact.id}`,
      type: "new_contact" as const,
      label: `${contact.displayName} added to the live relationship database`,
      occurredAt: contact.createdAt,
      sourceLabel: contact.sourceLabel ?? "Live contact source",
      evidenceIds: contact.evidenceIds,
    })),
    ...tasks.map((task) => ({
      activityId: `activity:dashboard:task:${task.id}`,
      type: "followup_due" as const,
      label: task.title,
      occurredAt: task.updatedAt,
      sourceLabel: task.sourceLabel ?? "Live task source",
      evidenceIds: task.evidenceIds,
    })),
  ]
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, 3);
  if (scenario === "empty" || scenario === "pending") {
    const state = scenario;
    return {
      success: true,
      data: {
        state,
        metrics: [
          {
            id: "relationship-assets",
            label: "Relationship assets",
            value: 0,
            evidenceIds: ["evidence:dashboard-live-store-empty"],
          },
          { id: "new-contacts", label: "New contacts", value: 0, evidenceIds: [] },
          { id: "high-value", label: "High-value relationships", value: 0, evidenceIds: [] },
          { id: "pending-followups", label: "Pending followups", value: 0, evidenceIds: [] },
          { id: "dormant-contacts", label: "Dormant contacts", value: 0, evidenceIds: [] },
        ],
        recentActivity: [],
        summary:
          state === "pending"
            ? "The live dashboard aggregate is waiting for relationship record review."
            : "The live dashboard aggregate returned no relationship rows.",
        provenance: {
          ...provenance,
          evidenceIds: ["evidence:dashboard-live-store-empty"],
          collectedAt: generatedAt,
          generationMethod: "rule-based-summary",
        },
        nextAction:
          "Use the source-backed live dashboard aggregate for agent workflow testing.",
      },
    };
  }
  const highValue = connections.filter((connection) => oraclePriority(connection) >= 70);
  const pending = tasks.filter(
    (task) => task.status === "open" || task.status === "scheduled",
  );
  const dormant = contacts.filter((contact) => contact.stage === "nurture");
  const state = contacts.length > 0 ? "success" : "empty";
  return {
    success: true,
    data: {
      state,
      metrics: [
        {
          id: "relationship-assets",
          label: "Relationship assets",
          value: contacts.length,
          evidenceIds: provenance.evidenceIds,
        },
        {
          id: "new-contacts",
          label: "New contacts",
          value: contacts.length,
          evidenceIds: contacts.flatMap((contact) => contact.evidenceIds),
        },
        {
          id: "high-value",
          label: "High-value relationships",
          value: highValue.length,
          evidenceIds: highValue.flatMap((connection) => connection.evidenceIds),
        },
        {
          id: "pending-followups",
          label: "Pending followups",
          value: pending.length,
          evidenceIds: pending.flatMap((task) => task.evidenceIds),
        },
        {
          id: "dormant-contacts",
          label: "Dormant contacts",
          value: dormant.length,
          evidenceIds: dormant.flatMap((contact) => contact.evidenceIds),
        },
      ],
      recentActivity: activities,
      summary:
        state === "success"
          ? "Rule-based summary of the live dashboard aggregate."
          : "Live dashboard aggregate was computed from shared remote relationship records.",
      provenance: {
        ...provenance,
        generationMethod: "rule-based-summary",
      },
      nextAction:
        "Use the source-backed live dashboard aggregate for agent workflow testing.",
    },
  };
}

function summaryRecord(
  collectionName: string,
  recordId: string,
  payload: Record<string, unknown>,
  options: Partial<SummaryRecord> = {},
): SummaryRecord {
  const updatedAt = options.updatedAt ??
    (oracleNonEmpty(payload.updatedAt) ? payload.updatedAt : SUMMARY_NOW);
  return {
    workspaceId: options.workspaceId ?? SUMMARY_WORKSPACE,
    collectionName,
    recordId,
    userId: options.userId ?? SUMMARY_ACTOR,
    sourceType: "system",
    sourceId: `record-source:${recordId}`,
    sourceLabel: null,
    provider: "b3-summary-test",
    providerRecordId: recordId,
    evidenceIds: [],
    targetType: null,
    targetId: null,
    occurredAt: options.occurredAt !== undefined ? options.occurredAt : updatedAt,
    createdAt: options.createdAt ?? updatedAt,
    updatedAt,
    deletedAt: null,
    lifecycleState: options.lifecycleState ?? "active",
    searchText: "",
    payload,
  };
}

function summaryFixtureRecords(): readonly SummaryRecord[] {
  const source = (type: unknown, id: unknown, label?: unknown) => ({ type, id, label });
  const whitespaceSourceRecords = ECMASCRIPT_TRIM_CHARACTERS.map((character, index) =>
    summaryRecord("events", `event:whitespace-source:${index}`, {
      id: `event:whitespace-source:${index}`,
      name: "v",
      startsAt: "v",
      source: source("manual", character, "v"),
      evidenceIds: ["v"],
    }, { updatedAt: `2026-09-16T14:${String(index).padStart(2, "0")}:00.000Z` }),
  );
  const whitespaceEvidenceRecords = ECMASCRIPT_TRIM_CHARACTERS.map((character, index) =>
    summaryRecord("events", `event:whitespace-evidence:${index}`, {
      id: `event:whitespace-evidence:${index}`,
      name: "v",
      startsAt: "v",
      source: source("manual", `source:whitespace-evidence:${index}`, "v"),
      evidenceIds: [character],
    }, { updatedAt: `2026-09-16T15:${String(index).padStart(2, "0")}:00.000Z` }),
  );
  return [
    summaryRecord("contacts", "contact:alpha", {
      id: "contact:alpha", displayName: "Alpha", stage: "nurture",
      source: source("manual", "source:alpha"),
      evidenceIds: ["e:alpha", "", 7, "e:alpha", "e:shared"],
      createdAt: "2026-09-16T10:00:00.000Z", updatedAt: "2026-09-17T01:00:00.000Z",
      notes: "x".repeat(30_000),
    }, { updatedAt: "2026-09-17T01:00:00.000Z" }),
    summaryRecord("contacts", "contact:beta", {
      id: "contact:beta", displayName: "Beta", stage: "active",
      source: source("event_import", "source:beta", " Beta source "),
      evidenceIds: ["e:beta", "e:shared"],
      createdAt: "2026-09-19T12:00:00.000Z", updatedAt: "2026-09-17T02:00:00.000Z",
    }, { updatedAt: "2026-09-17T02:00:00.000Z" }),
    summaryRecord("contacts", "contact:captured", {
      id: "contact:captured", displayName: "Captured", stage: "captured",
      source: source("chat_summary", "source:captured", ""),
      evidenceIds: ["e:captured"],
      createdAt: "2026-09-19T12:00:00.000Z", updatedAt: "2026-09-17T03:00:00.000Z",
    }, { updatedAt: "2026-09-17T03:00:00.000Z" }),
    summaryRecord("contacts", "contact:bad-display", {
      id: "contact:bad-display", displayName: 42, stage: "active",
      source: source("manual", "source:bad-display"), evidenceIds: ["e:bad"],
      createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z",
    }, { updatedAt: "2026-12-31T00:00:00.000Z" }),
    summaryRecord("contacts", "contact:bad-source", {
      id: "contact:bad-source", displayName: "Bad source", stage: "active",
      source: source(7, "source:bad-source"), evidenceIds: ["e:bad-source"],
      createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z",
    }, { updatedAt: "2026-11-30T00:00:00.000Z" }),
    summaryRecord("contacts", "contact:whitespace-source", {
      id: "contact:whitespace-source", displayName: "Whitespace source", stage: "active",
      source: source("manual", "\t\n\u00a0\ufeff"), evidenceIds: ["e:whitespace-source"],
      createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z",
    }, { updatedAt: "2026-11-29T00:00:00.000Z" }),
    summaryRecord("contacts", "contact:whitespace-evidence", {
      id: "contact:whitespace-evidence", displayName: "Whitespace evidence", stage: "active",
      source: source("manual", "source:whitespace-evidence"), evidenceIds: ["\t\n\u00a0\ufeff"],
      createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z",
    }, { updatedAt: "2026-11-28T00:00:00.000Z" }),
    summaryRecord("contacts", "contact:deleted", {
      id: "contact:deleted", displayName: "Deleted", stage: "active",
      source: source("manual", "source:deleted"), evidenceIds: ["e:deleted"],
      createdAt: "2026-09-17T00:00:00.000Z", updatedAt: "2026-09-17T00:00:00.000Z",
    }, { updatedAt: "2027-01-01T00:00:00.000Z", lifecycleState: "deleted" }),
    summaryRecord("connections", "connection:zero", {
      id: "connection:zero", accountId: SUMMARY_ACTOR, contactId: "contact:alpha", stage: "active",
      valueTypes: ["strategic_fit", "bad-value", "strategic_fit", 5], summary: "Zero score",
      businessRelevanceScore: 0, relationshipStrength: 95,
      source: source("manual", "source:zero"), evidenceIds: ["e:zero", "e:zero"],
      createdAt: SUMMARY_NOW, updatedAt: SUMMARY_NOW,
    }, { updatedAt: "2026-09-17T04:00:00.000Z" }),
    summaryRecord("connections", "connection:seventy", {
      id: "connection:seventy", accountId: SUMMARY_ACTOR, contactId: "contact:beta", stage: "active",
      valueTypes: ["commercial_opportunity", "knowledge_exchange", "referral_path"], summary: "Seventy score",
      businessRelevanceScore: 70, source: source("manual", "source:seventy"),
      evidenceIds: ["e:seventy", "", "e:seventy"], createdAt: SUMMARY_NOW, updatedAt: SUMMARY_NOW,
    }, { updatedAt: "2026-09-17T05:00:00.000Z" }),
    summaryRecord("connections", "connection:sixty-nine-five", {
      id: "connection:sixty-nine-five", accountId: SUMMARY_ACTOR, contactId: "contact:beta", stage: "active",
      valueTypes: ["community_context"], summary: "Rounding boundary",
      businessRelevanceScore: 69.5, source: source("manual", "source:69.5"),
      evidenceIds: ["e:69.5"], createdAt: SUMMARY_NOW, updatedAt: SUMMARY_NOW,
    }, { updatedAt: "2026-09-17T06:00:00.000Z" }),
    summaryRecord("connections", "connection:fallback", {
      id: "connection:fallback", accountId: SUMMARY_ACTOR, contactId: "contact:captured", stage: "reviewing",
      valueTypes: ["strategic_fit", "strategic_fit", "not-legal"], summary: "Fallback score",
      source: source("referral", "source:fallback"), evidenceIds: ["e:fallback"],
      createdAt: SUMMARY_NOW, updatedAt: SUMMARY_NOW,
    }, { updatedAt: "2026-09-17T07:00:00.000Z" }),
    summaryRecord("connections", "connection:malformed", {
      id: "connection:malformed", accountId: SUMMARY_ACTOR, contactId: "contact:alpha", stage: "active",
      source: source("manual", "source:malformed"), evidenceIds: ["e:malformed"],
      createdAt: SUMMARY_NOW, updatedAt: SUMMARY_NOW,
    }, { updatedAt: "2026-12-30T00:00:00.000Z" }),
    summaryRecord("events", "event:valid", {
      id: "event:valid", name: "Valid event", startsAt: "2026-09-20T00:00:00.000Z",
      source: source("calendar_signal", "source:event"), evidenceIds: ["e:event", "e:shared"],
    }, { updatedAt: "2026-09-17T13:00:00.000Z", occurredAt: "2026-09-18T13:00:00.000Z" }),
    summaryRecord("events", "event:v", {
      id: "v", name: "v", startsAt: "v",
      source: source("manual", "v", "v"), evidenceIds: ["v"],
    }, { updatedAt: "2026-09-16T13:00:00.000Z" }),
    summaryRecord("events", "event:null-occurred", {
      id: "event:null-occurred", name: "Null occurred event", startsAt: "v",
      source: source("manual", "source:event:null-occurred"), evidenceIds: ["e:event-null"],
    }, { updatedAt: "2026-09-17T14:00:00.000Z", occurredAt: null }),
    summaryRecord("events", "event:malformed", {
      id: "event:malformed", name: "Malformed event", startsAt: "2026-09-20T00:00:00.000Z",
      source: source("manual", "source:event-bad"), evidenceIds: [""],
    }, { updatedAt: "2026-12-28T00:00:00.000Z" }),
    summaryRecord("events", "event:all-whitespace", {
      id: "event:all-whitespace", name: "v", startsAt: "v",
      source: source("manual", ECMASCRIPT_TRIM_STRING, "v"), evidenceIds: ["v"],
    }, { updatedAt: "2026-09-16T12:00:00.000Z" }),
    summaryRecord("events", "event:all-whitespace-evidence", {
      id: "event:all-whitespace-evidence", name: "v", startsAt: "v",
      source: source("manual", "source:event:all-whitespace-evidence", "v"),
      evidenceIds: [ECMASCRIPT_TRIM_STRING],
    }, { updatedAt: "2026-09-16T11:00:00.000Z" }),
    ...whitespaceSourceRecords,
    ...whitespaceEvidenceRecords,
    ...[
      ["task:open", "Open task", "open", "2026-09-19T12:00:00.000Z"],
      ["task:scheduled", "Scheduled task", "scheduled", "2026-09-19T12:00:00.000Z"],
      ["task:completed", "Completed task", "completed", "2026-09-19T10:00:00.000Z"],
      ["task:dismissed", "Dismissed task", "dismissed", "2026-09-19T09:00:00.000Z"],
      ["task:tied", "Tied activity", "completed", "2026-09-18T10:00:00.000Z"],
    ].map(([id, title, status, updatedAt], index) => summaryRecord("tasks", id, {
      id, title, status, contactId: "contact:alpha",
      source: source("system", `source:${id}`, index === 0 ? "Task source" : ""),
      evidenceIds: [`e:${id}`, "e:shared"], createdAt: SUMMARY_NOW, updatedAt,
    }, { updatedAt, occurredAt: `2026-09-17T${String(8 + index).padStart(2, "0")}:00:00.000Z` })),
    summaryRecord("tasks", "task:malformed", {
      id: "task:malformed", title: "Bad status", status: 9, source: source("manual", "source:bad-task"),
      evidenceIds: ["e:bad-task"], createdAt: SUMMARY_NOW, updatedAt: SUMMARY_NOW,
    }, { updatedAt: "2026-12-27T00:00:00.000Z" }),
    summaryRecord("contact_detail_states", "detail:future", {
      id: "detail:future", contactId: "contact:alpha", tags: ["detail"],
    }, { updatedAt: "2026-12-26T00:00:00.000Z" }),
    summaryRecord("evidence", "evidence:future", {
      id: "evidence:future", sourceType: "manual", sourceId: "source:future",
      summary: "Future evidence", occurredAt: SUMMARY_NOW, confidence: 1, createdBy: SUMMARY_ACTOR,
    }, { updatedAt: "2026-12-25T00:00:00.000Z" }),
    summaryRecord("contacts", "contact:other-actor", {
      id: "contact:other-actor", displayName: "Other actor", stage: "active",
      source: source("manual", "source:other"), evidenceIds: ["e:other"],
      createdAt: SUMMARY_NOW, updatedAt: SUMMARY_NOW, notes: "y".repeat(20_000),
    }, { userId: SUMMARY_OTHER_ACTOR, updatedAt: "2026-09-17T20:00:00.000Z" }),
    summaryRecord("tasks", "task:task-only", {
      id: "task:task-only", title: "Task without a contact", status: "open",
      source: source("manual", "source:task-only"), evidenceIds: ["e:task-only"],
      createdAt: SUMMARY_NOW, updatedAt: "2026-09-18T12:00:00.000Z",
    }, { userId: SUMMARY_TASK_ONLY_ACTOR, updatedAt: "2026-09-18T12:00:00.000Z" }),
    summaryRecord("contacts", "contact:other-workspace", {
      id: "contact:other-workspace", displayName: "Other workspace", stage: "active",
      source: source("manual", "source:other-workspace"), evidenceIds: ["e:other-workspace"],
      createdAt: SUMMARY_NOW, updatedAt: SUMMARY_NOW,
    }, { workspaceId: "workspace:other", userId: SUMMARY_ACTOR }),
  ].sort((left, right) => {
    const leftOccurredAt = left.occurredAt ?? left.updatedAt;
    const rightOccurredAt = right.occurredAt ?? right.updatedAt;
    return rightOccurredAt.localeCompare(leftOccurredAt) || right.updatedAt.localeCompare(left.updatedAt);
  });
}

function unrelatedSummaryRecords(count: number, start = 0): readonly SummaryRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = start + index;
    const updatedAt = new Date(Date.UTC(2026, 8, 18, 0, 0, sequence)).toISOString();
    return summaryRecord("contacts", `contact:unrelated:${sequence}`, {
    id: `contact:unrelated:${sequence}`, displayName: `Unrelated ${sequence}`, stage: "active",
    source: { type: "manual", id: `source:unrelated:${sequence}` },
      evidenceIds: [`e:unrelated:${sequence}`], createdAt: SUMMARY_NOW, updatedAt: SUMMARY_NOW,
    rawNotes: "z".repeat(50_000),
    }, { userId: SUMMARY_OTHER_ACTOR, updatedAt });
  });
}

function sameActorGrowthRecords(count: number, start = 0): readonly SummaryRecord[] {
  return Array.from({ length: count }, (_, index) => {
    const sequence = start + index;
    const updatedAt = new Date(Date.UTC(2026, 9, 1, 0, 0, sequence)).toISOString();
    return summaryRecord("contacts", `contact:growth:${sequence}`, {
      id: `contact:growth:${sequence}`, displayName: `Growth ${sequence}`, stage: "active",
      source: { type: "manual", id: `source:growth:${sequence}` },
      evidenceIds: [`e:growth:${sequence}`], createdAt: updatedAt, updatedAt,
      rawNotes: "g".repeat(50_000),
    }, { userId: SUMMARY_ACTOR, updatedAt });
  });
}

interface MeasuredSummaryClient extends LiveRecordSqlClient {
  calls: Array<{ text: string; values?: readonly unknown[]; returnedBytes: number }>;
}

function measuredSummaryClient(client: LiveRecordSqlClient): MeasuredSummaryClient {
  const calls: MeasuredSummaryClient["calls"] = [];
  return {
    calls,
    async query<TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<LiveRecordSqlResult<TRow>> {
      const result = await client.query<TRow>(text, values);
      calls.push({
        text,
        values,
        returnedBytes: Buffer.byteLength(JSON.stringify(result.rows)),
      });
      return result;
    },
  };
}

function measuredCalls(
  client: MeasuredSummaryClient,
  summary: boolean,
): MeasuredSummaryClient["calls"] {
  return client.calls.filter((call) => /dashboard summary read model/i.test(call.text) === summary);
}

function latestMeasuredCall(
  client: MeasuredSummaryClient,
  summary: boolean,
): MeasuredSummaryClient["calls"][number] {
  const call = measuredCalls(client, summary).at(-1);
  assert.ok(
    call,
    summary ? "a summary SQL read should have completed" : "a graph SQL read should have completed",
  );
  return call;
}

test("B3 summary reader matches an independent full-response oracle", {
  skip: SUMMARY_DATABASE_URL ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  assert.ok(SUMMARY_DATABASE_URL);
  const databaseUrl = new URL(SUMMARY_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "Local parity test only");
  assert.equal(databaseUrl.pathname, "/orbit_cutover_test_20260917");
  const schema = `b3_summary_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: SUMMARY_DATABASE_URL,
    max: 1,
    options: "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000",
    idleTimeoutMillis: 5000,
  });
  const pool = new Pool({
    connectionString: SUMMARY_DATABASE_URL,
    max: 2,
    options: `-c search_path=${schema},public -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000`,
    idleTimeoutMillis: 5000,
  });
  const client = createTransactionalPostgresClient({
    connectionString: SUMMARY_DATABASE_URL,
    max: 2,
    pool,
  });
  const records = [...summaryFixtureRecords()];
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const postgresStore = createPostgresLiveRecordStore({ client });
    for (const record of records) await postgresStore.upsertRecord(record);
    const memoryStore = createMemoryLiveRecordStore(records);
    const measured = measuredSummaryClient(client);
    const provider = createStorageDashboardAggregateProvider({
      sqlClient: measured,
      store: memoryStore,
      workspaceId: SUMMARY_WORKSPACE,
      source: "test:dashboard-summary",
      sourceLabel: "B3 dashboard summary test storage",
    });
    const oldProvider = createStorageDashboardAggregateProvider({
      store: memoryStore,
      workspaceId: SUMMARY_WORKSPACE,
      source: "test:dashboard-summary",
      sourceLabel: "B3 dashboard summary test storage",
    });
    const service = createLiveDashboardAggregateService({ provider });
    const oldService = createLiveDashboardAggregateService({ provider: oldProvider });
    const expected = literalSummaryOracle(records, SUMMARY_WORKSPACE, SUMMARY_ACTOR);
    const oldActual = await oldService.getDashboardSummary({ actorId: SUMMARY_ACTOR });
    const sqlActual = await service.getDashboardSummary({ actorId: SUMMARY_ACTOR });
    assert.deepEqual(oldActual, expected);
    assert.deepEqual(sqlActual, expected);
    assert.equal(measured.calls.length, 1, "an independent summary is one SQL read");
    assert.equal(measured.calls[0]?.values?.[0], SUMMARY_WORKSPACE);
    assert.equal(measured.calls[0]?.values?.[1], SUMMARY_ACTOR);
    assert.equal((await service.getDashboardSummary({ actorId: SUMMARY_ACTOR, scenario: "empty" })).success, true);
    assert.deepEqual(await service.getDashboardSummary({ actorId: SUMMARY_ACTOR, scenario: "pending" }), literalSummaryOracle(records, SUMMARY_WORKSPACE, SUMMARY_ACTOR, "test:dashboard-summary", "B3 dashboard summary test storage", "pending"));
    assert.deepEqual(await service.getDashboardSummary({ actorId: SUMMARY_ACTOR, scenario: "failure" }), literalSummaryOracle(records, SUMMARY_WORKSPACE, SUMMARY_ACTOR, "test:dashboard-summary", "B3 dashboard summary test storage", "failure"));
    const taskOnlyExpected = literalSummaryOracle(records, SUMMARY_WORKSPACE, SUMMARY_TASK_ONLY_ACTOR);
    const taskOnlyActual = await service.getDashboardSummary({ actorId: SUMMARY_TASK_ONLY_ACTOR });
    assert.deepEqual(taskOnlyActual, taskOnlyExpected);
    assert.equal(taskOnlyActual.success && taskOnlyActual.data.state, "empty");
    assert.equal(taskOnlyActual.success && taskOnlyActual.data.recentActivity.length, 1);
    const otherActorExpected = literalSummaryOracle(records, SUMMARY_WORKSPACE, SUMMARY_OTHER_ACTOR);
    assert.deepEqual(await service.getDashboardSummary({ actorId: SUMMARY_OTHER_ACTOR }), otherActorExpected);
    assert.deepEqual(await service.getDashboardSummary({ actorId: "account:missing" }), literalSummaryOracle(records, SUMMARY_WORKSPACE, "account:missing"));
    assert.equal(expected.success && expected.data.provenance.collectedAt, "2026-12-31T00:00:00.000Z");
    assert.equal(expected.success && expected.data.recentActivity.length, 3);
    if (!oldActual.success || !sqlActual.success || !expected.success) {
      assert.fail("success oracle and both live summary reads must be successful");
    }
    assert.deepEqual(
      sqlActual.data.recentActivity.map((activity) => activity.occurredAt),
      expected.data.recentActivity.map((activity) => activity.occurredAt),
      "distinct activity timestamps retain their complete order",
    );
    assert.deepEqual(
      sqlActual.data.recentActivity.map((activity) => activity.activityId),
      [
        "activity:dashboard:contact:contact:captured",
        "activity:dashboard:contact:contact:beta",
        "activity:dashboard:task:task:scheduled",
      ],
      "contacts keep their envelope order before tasks, and scheduled wins the task tie before the cutoff",
    );
    assert.deepEqual(expected.success && expected.data.metrics[2]?.evidenceIds, ["e:fallback", "e:69.5", "e:seventy", "e:seventy"]);
    assert.deepEqual(expected.success && expected.data.metrics[1]?.evidenceIds, ["e:captured", "e:beta", "e:shared", "e:alpha", "e:alpha", "e:shared"]);
    assert.equal(ECMASCRIPT_TRIM_CHARACTERS.length, 25);
    assert.ok(ECMASCRIPT_TRIM_CHARACTERS.every((character) => character.trim() === ""));
    assert.ok(expected.success && expected.data.provenance.evidenceIds.includes("v"));
    assert.ok(expected.success && !expected.data.provenance.evidenceIds.includes(ECMASCRIPT_TRIM_STRING));
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});

test("B3 cost baseline measures the real graph projection against summary SQL", {
  skip: SUMMARY_DATABASE_URL ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  assert.ok(SUMMARY_DATABASE_URL);
  const databaseUrl = new URL(SUMMARY_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "Local cost test only");
  assert.equal(databaseUrl.pathname, "/orbit_cutover_test_20260917");
  const schema = `b3_cost_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: SUMMARY_DATABASE_URL,
    max: 1,
    options: "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000",
    idleTimeoutMillis: 5000,
  });
  const pool = new Pool({
    connectionString: SUMMARY_DATABASE_URL,
    max: 2,
    options: `-c search_path=${schema},public -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000`,
    idleTimeoutMillis: 5000,
  });
  const client = createTransactionalPostgresClient({
    connectionString: SUMMARY_DATABASE_URL,
    max: 2,
    pool,
  });
  const records = [...summaryFixtureRecords()];
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const postgresStore = createPostgresLiveRecordStore({ client });
    for (const record of records) await postgresStore.upsertRecord(record);

    const rawReference = await client.query(
      `select collection_name, record_id, evidence_ids, occurred_at, updated_at, payload
       from orbit_records
       where workspace_id = $1 and user_id = $2 and lifecycle_state <> 'deleted'
       order by collection_name, coalesce(occurred_at, updated_at) desc, updated_at desc`,
      [SUMMARY_WORKSPACE, SUMMARY_ACTOR],
    );
    const measured = measuredSummaryClient(client);
    const provider = createStorageDashboardAggregateProvider({
      sqlClient: measured,
      store: createMemoryLiveRecordStore(records),
      workspaceId: SUMMARY_WORKSPACE,
      source: "test:dashboard-summary-cost",
      sourceLabel: "B3 dashboard summary cost test storage",
    });
    const service = createLiveDashboardAggregateService({ provider });

    const graphBaseline = await provider.readDashboardGraphForAccount!(SUMMARY_ACTOR);
    const summaryBaseline = await service.getDashboardSummary({ actorId: SUMMARY_ACTOR });
    const baselineExpected = literalSummaryOracle(
      records,
      SUMMARY_WORKSPACE,
      SUMMARY_ACTOR,
      "test:dashboard-summary-cost",
      "B3 dashboard summary cost test storage",
    );
    assert.deepEqual(
      summaryBaseline,
      baselineExpected,
    );
    assert.ok(graphBaseline.contacts.length > 0);
    const graphBaselineCall = latestMeasuredCall(measured, false);
    const summaryBaselineCall = latestMeasuredCall(measured, true);
    assert.equal(measuredCalls(measured, false).length, 1, "graph baseline is one SQL statement");
    assert.equal(measuredCalls(measured, true).length, 1, "summary baseline is one SQL statement");
    assert.ok(
      summaryBaselineCall.returnedBytes < graphBaselineCall.returnedBytes,
      "summary SQL is smaller than the real dashboard graph projection",
    );

    const growth: Array<Record<string, number>> = [];
    let sameActorInserted = 0;
    let unrelatedActorInserted = 0;
    for (const size of [10, 100, 1000]) {
      const sameActorAdds = sameActorGrowthRecords(size - sameActorInserted, sameActorInserted);
      for (const record of sameActorAdds) {
        await postgresStore.upsertRecord(record);
        records.push(record);
      }
      sameActorInserted = size;

      const graphCountBefore = measuredCalls(measured, false).length;
      const summaryCountBefore = measuredCalls(measured, true).length;
      const graphBeforeUnrelated = await provider.readDashboardGraphForAccount!(SUMMARY_ACTOR);
      const summaryBeforeUnrelated = await service.getDashboardSummary({ actorId: SUMMARY_ACTOR });
      const graphBeforeCall = latestMeasuredCall(measured, false);
      const summaryBeforeCall = latestMeasuredCall(measured, true);
      assert.equal(measuredCalls(measured, false).length, graphCountBefore + 1);
      assert.equal(measuredCalls(measured, true).length, summaryCountBefore + 1);
      assert.deepEqual(
        summaryBeforeUnrelated,
        literalSummaryOracle(
          records,
          SUMMARY_WORKSPACE,
          SUMMARY_ACTOR,
          "test:dashboard-summary-cost",
          "B3 dashboard summary cost test storage",
        ),
      );

      const unrelatedAdds = unrelatedSummaryRecords(size - unrelatedActorInserted, unrelatedActorInserted);
      for (const record of unrelatedAdds) {
        await postgresStore.upsertRecord(record);
        records.push(record);
      }
      unrelatedActorInserted = size;

      const graphAfterUnrelatedCount = measuredCalls(measured, false).length;
      const summaryAfterUnrelatedCount = measuredCalls(measured, true).length;
      const graphAfterUnrelated = await provider.readDashboardGraphForAccount!(SUMMARY_ACTOR);
      const summaryAfterUnrelated = await service.getDashboardSummary({ actorId: SUMMARY_ACTOR });
      const graphAfterCall = latestMeasuredCall(measured, false);
      const summaryAfterCall = latestMeasuredCall(measured, true);
      assert.equal(measuredCalls(measured, false).length, graphAfterUnrelatedCount + 1);
      assert.equal(measuredCalls(measured, true).length, summaryAfterUnrelatedCount + 1);
      assert.deepEqual(graphAfterUnrelated, graphBeforeUnrelated, "unrelated actor rows do not enter graph output");
      assert.deepEqual(
        summaryAfterUnrelated,
        summaryBeforeUnrelated,
        "unrelated actor rows do not enter summary output",
      );
      assert.equal(graphAfterCall.returnedBytes, graphBeforeCall.returnedBytes);
      assert.equal(summaryAfterCall.returnedBytes, summaryBeforeCall.returnedBytes);
      assert.ok(graphBeforeCall.returnedBytes > summaryBeforeCall.returnedBytes);
      assert.ok(summaryBeforeUnrelated.success);
      assert.ok(summaryBeforeUnrelated.data.provenance.evidenceIds.length >= size);

      growth.push({
        sameActorRecords: size,
        unrelatedActorRecords: size,
        graphBytes: graphBeforeCall.returnedBytes,
        summaryBytes: summaryBeforeCall.returnedBytes,
        graphStatements: 1,
        summaryStatements: 1,
        graphBytesAfterUnrelated: graphAfterCall.returnedBytes,
        summaryBytesAfterUnrelated: summaryAfterCall.returnedBytes,
        graphStatementsAfterUnrelated: 1,
        summaryStatementsAfterUnrelated: 1,
        cumulativeGraphStatements: measuredCalls(measured, false).length,
        cumulativeSummaryStatements: measuredCalls(measured, true).length,
      });
    }

    assert.ok((growth[0]?.summaryBytes ?? 0) < (growth[1]?.summaryBytes ?? 0));
    assert.ok((growth[1]?.summaryBytes ?? 0) < (growth[2]?.summaryBytes ?? 0));
    assert.ok((growth[0]?.graphBytes ?? 0) < (growth[2]?.graphBytes ?? 0));
    assert.ok((growth[2]?.summaryBytes ?? 0) < (growth[2]?.graphBytes ?? 0));
    console.log(`B3_COST_JSON ${JSON.stringify({
      measuredAs: "UTF-8 byte length of JSON.stringify(actual SQL result rows)",
      rawReferenceBytes: Buffer.byteLength(JSON.stringify(rawReference.rows)),
      baseline: {
        graphBytes: graphBaselineCall.returnedBytes,
        summaryBytes: summaryBaselineCall.returnedBytes,
        graphStatements: 1,
        summaryStatements: 1,
      },
      growth,
    })}`);
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});

test("B3 falls back for a noncanonical activity timestamp without casting the payload", {
  skip: SUMMARY_DATABASE_URL ? false : "Explicit isolated PostgreSQL URL required",
}, async () => {
  assert.ok(SUMMARY_DATABASE_URL);
  const databaseUrl = new URL(SUMMARY_DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "Local fallback test only");
  assert.equal(databaseUrl.pathname, "/orbit_cutover_test_20260917");
  const schema = `b3_fallback_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({
    connectionString: SUMMARY_DATABASE_URL,
    max: 1,
    options: "-c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000",
    idleTimeoutMillis: 5000,
  });
  const pool = new Pool({
    connectionString: SUMMARY_DATABASE_URL,
    max: 2,
    options: `-c search_path=${schema},public -c statement_timeout=5000 -c lock_timeout=1000 -c idle_in_transaction_session_timeout=5000`,
    idleTimeoutMillis: 5000,
  });
  const client = createTransactionalPostgresClient({
    connectionString: SUMMARY_DATABASE_URL,
    max: 2,
    pool,
  });
  const records = [summaryRecord("tasks", "task:noncanonical", {
    id: "task:noncanonical",
    title: "Keep the mapper's noncanonical activity value",
    status: "open",
    source: { type: "manual", id: "source:noncanonical", label: "Fallback source" },
    evidenceIds: ["e:noncanonical"],
    createdAt: "2026/09/17 09:00:00",
    updatedAt: "not-an-ISO-activity",
  }, {
    updatedAt: "2026-09-17T09:00:00.000Z",
    occurredAt: "2026-09-17T08:00:00.000Z",
  })];
  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const postgresStore = createPostgresLiveRecordStore({ client });
    for (const record of records) await postgresStore.upsertRecord(record);
    const measured = measuredSummaryClient(client);
    const provider = createStorageDashboardAggregateProvider({
      sqlClient: measured,
      store: createMemoryLiveRecordStore(records),
      workspaceId: SUMMARY_WORKSPACE,
      source: "test:dashboard-summary-fallback",
      sourceLabel: "B3 dashboard fallback test storage",
    });
    const actual = await createLiveDashboardAggregateService({ provider }).getDashboardSummary({
      actorId: SUMMARY_ACTOR,
    });
    const expected = literalSummaryOracle(
      records,
      SUMMARY_WORKSPACE,
      SUMMARY_ACTOR,
      "test:dashboard-summary-fallback",
      "B3 dashboard fallback test storage",
    );
    assert.deepEqual(actual, expected);
    assert.equal(measuredCalls(measured, true).length, 1, "the summary SQL is attempted once");
    assert.equal(measuredCalls(measured, false).length, 1, "noncanonical ordering honestly adds one graph query");
    assert.match(measuredCalls(measured, true)[0]?.text ?? "", /dashboard summary read model/i);
    assert.match(measuredCalls(measured, false)[0]?.text ?? "", /jsonb_build_object/i);
    assert.equal(actual.success && actual.data.recentActivity[0]?.occurredAt, "not-an-ISO-activity");
  } finally {
    await client.close();
    try { await admin.query(`drop schema if exists ${schema} cascade`); } finally { await admin.end(); }
  }
});

test("B3 summary SQL shape is a projected aggregate rather than an entity-payload read", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  const client: LiveRecordSqlClient = {
    async query<TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ): Promise<LiveRecordSqlResult<TRow>> {
      calls.push({ text, values });
      return {
        rows: [{
          generated_at: new Date(0),
          contacts_count: 0,
          contacts_evidence_ids: [],
          connections_evidence_ids: [],
          events_evidence_ids: [],
          tasks_evidence_ids: [],
          high_value_count: 0,
          high_value_evidence_ids: [],
          pending_followup_count: 0,
          pending_followup_evidence_ids: [],
          dormant_contact_count: 0,
          dormant_contact_evidence_ids: [],
          recent_activity: [],
          activity_order_safe: true,
        }] as unknown as readonly TRow[],
      };
    },
  };
  const provider = createStorageDashboardAggregateProvider({
    sqlClient: client,
    store: createMemoryLiveRecordStore<Record<string, unknown>>(),
    workspaceId: SUMMARY_WORKSPACE,
  });
  await createLiveDashboardAggregateService({ provider }).getDashboardSummary({ actorId: SUMMARY_ACTOR });
  assert.equal(calls.length, 1);
  const sql = calls[0]?.text ?? "";
  assert.match(sql, /max\s*\(updated_at\)/i);
  assert.match(sql, /jsonb_agg/i);
  assert.match(sql, /jsonb_typeof/i);
  assert.match(sql, /jsonb_typeof\(payload -> 'source' -> 'id'\)/i);
  assert.match(sql, /chr\(11\)/i);
  assert.match(sql, /activity_group_rank/i);
  assert.doesNotMatch(sql, /select\s+\*/i);
  assert.doesNotMatch(sql, /\\v/i);
  assert.doesNotMatch(sql, /jsonb_agg\s*\(\s*payload/i);
  assert.doesNotMatch(sql, /payload\s*::jsonb/i);
});
