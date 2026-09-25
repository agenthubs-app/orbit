import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import {
  createContactIntrosSummaryReader,
  type ContactIntrosSummaryReader,
} from "../../features/contacts/contact-intros-summary-reader";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL;
const actorId = "actor:intros-owner";
const workspaceId = "workspace:intros";
const at = "2026-09-25T00:00:00.000Z";

function localTestDatabase(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    const hostname = url.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
    const database = decodeURIComponent(url.pathname.slice(1)).toLowerCase();
    return ["localhost", "127.0.0.1", "::1"].includes(hostname) && !url.search && database.includes("test");
  } catch {
    return false;
  }
}

const postgresTest = {
  skip: localTestDatabase(databaseUrl) ? false : "Requires an explicit localhost database whose name includes test",
  timeout: 30_000,
};

function contactRecord(input: {
  id: string;
  recordId?: string;
  owner?: string;
  accountId?: string | null;
  pending?: boolean;
  occurredAt?: string;
  updatedAt?: string;
}) {
  const updatedAt = input.updatedAt ?? at;
  return {
    workspaceId,
    collectionName: "contacts",
    recordId: input.recordId ?? input.id,
    userId: input.owner ?? actorId,
    sourceType: "manual",
    sourceId: "source:contact",
    evidenceIds: ["evidence:contact"],
    occurredAt: input.occurredAt ?? at,
    createdAt: at,
    updatedAt,
    lifecycleState: "active" as const,
    payload: {
      id: input.id,
      ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
      displayName: `联系人 ${input.id}`,
      organization: "Orbit",
      role: "Partner",
      stage: "active",
      ...(input.pending ? { lifecycleInitialization: "pending" } : {}),
      source: { type: "manual", id: "source:contact" },
      evidenceIds: ["evidence:contact"],
      createdAt: at,
      updatedAt,
      notes: "PRIVATE_CONTACT_HISTORY_".repeat(100),
    },
  };
}

function connectionRecord(input: {
  id: string;
  contactId: string;
  owner?: string;
  sourceType?: string;
  sourceLabel?: string;
  valueTypes?: string[];
  strength?: number;
  businessScore?: number;
  evidenceIds?: string[];
  pending?: boolean;
}) {
  return {
    workspaceId,
    collectionName: "connections",
    recordId: input.id,
    userId: input.owner ?? actorId,
    sourceType: "manual",
    sourceId: "source:connection",
    evidenceIds: input.evidenceIds ?? ["evidence:connection"],
    occurredAt: at,
    createdAt: at,
    updatedAt: at,
    lifecycleState: "active" as const,
    payload: {
      id: input.id,
      accountId: input.owner ?? actorId,
      contactId: input.contactId,
      stage: "active",
      ...(input.valueTypes === undefined ? {} : { valueTypes: input.valueTypes }),
      summary: "PRIVATE_RELATIONSHIP_HISTORY_".repeat(100),
      ...(input.strength === undefined ? {} : { relationshipStrength: input.strength }),
      ...(input.businessScore === undefined ? {} : { businessRelevanceScore: input.businessScore }),
      ...(input.pending ? { lifecycleInitialization: "pending" } : {}),
      source: { type: input.sourceType ?? "manual", id: "source:connection", ...(input.sourceLabel === undefined ? {} : { label: input.sourceLabel }) },
      evidenceIds: input.evidenceIds ?? ["evidence:connection"],
      createdAt: at,
      updatedAt: at,
    },
  };
}

function evidenceRecord(input: { id: string; sourceType: string; sourceId: string }) {
  return {
    workspaceId,
    collectionName: "evidence",
    recordId: input.id,
    userId: "actor:evidence-owner",
    sourceType: "manual",
    sourceId: input.sourceId,
    evidenceIds: [],
    occurredAt: at,
    createdAt: at,
    updatedAt: at,
    lifecycleState: "active" as const,
    payload: {
      id: input.id,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      summary: "Source-backed relation",
      occurredAt: at,
      confidence: 0.9,
      createdBy: "test",
    },
  };
}

test("ContactIntros summary is exact, private, ambiguity-closed, and bounded to one small SQL result", postgresTest, async () => {
  assert.ok(databaseUrl);
  const schema = `contact_intros_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000, max: 1 });
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 2_000,
    max: 2,
    options: `-c search_path=${schema} -c statement_timeout=15000`,
  });
  const observed: Array<{ sql: string; rows: number; bytes: number }> = [];
  let observe = false;
  const client: LiveRecordSqlClient = {
    async query<Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) {
      const result = await pool.query(sql, values ? [...values] : undefined);
      if (observe) observed.push({ sql, rows: result.rows.length, bytes: Buffer.byteLength(JSON.stringify(result.rows)) });
      return { rows: result.rows as Row[] };
    },
  };

  try {
    await admin.query(`create schema ${schema}`);
    await client.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client });
    const contacts = [
      contactRecord({ id: "path-old", updatedAt: "2026-09-01T00:00:00Z" }),
      contactRecord({ id: "source-direct" }),
      contactRecord({ id: "source-first-evidence" }),
      contactRecord({ id: "source-second-evidence-only" }),
      contactRecord({ id: "duplicate-rel" }),
      contactRecord({ id: "pending-contact", pending: true }),
      contactRecord({ id: "path-tie-break" }),
      contactRecord({ id: "path-new", updatedAt: "2026-09-10T00:00:00Z" }),
      contactRecord({ id: "path-low" }),
      contactRecord({ id: "pending-relationship" }),
      contactRecord({ id: "no-relationship" }),
      contactRecord({ id: "duplicate-contact-id", recordId: "duplicate-contact-record:1" }),
      contactRecord({ id: "duplicate-contact-id", recordId: "duplicate-contact-record:2" }),
      contactRecord({ id: "wrong-account", accountId: "actor:other" }),
      contactRecord({ id: "foreign-contact", owner: "actor:other" }),
    ];
    for (const record of contacts) await store.upsertRecord(record);
    const relations = [
      connectionRecord({ id: "rel-path-old", contactId: "path-old", valueTypes: ["referral_path"], strength: 70, sourceLabel: "Hand noted" }),
      connectionRecord({ id: "rel-source-direct", contactId: "source-direct", sourceType: "referral", strength: 90 }),
      connectionRecord({ id: "rel-source-first", contactId: "source-first-evidence", evidenceIds: ["evidence:first-referral"], businessScore: 80 }),
      connectionRecord({ id: "rel-source-second", contactId: "source-second-evidence-only", evidenceIds: ["evidence:first-manual", "evidence:second-referral"] }),
      connectionRecord({ id: "rel-duplicate-referral", contactId: "duplicate-rel", sourceType: "referral", valueTypes: ["referral_path"], strength: 100 }),
      connectionRecord({ id: "rel-duplicate-manual", contactId: "duplicate-rel" }),
      connectionRecord({ id: "rel-pending-contact", contactId: "pending-contact", sourceType: "referral", valueTypes: ["referral_path"], strength: 99 }),
      connectionRecord({ id: "rel-path-tie", contactId: "path-tie-break", valueTypes: ["referral_path"], strength: 60 }),
      connectionRecord({ id: "rel-path-new", contactId: "path-new", valueTypes: ["referral_path"], strength: 70 }),
      connectionRecord({ id: "rel-path-low", contactId: "path-low", valueTypes: ["referral_path"], strength: 50 }),
      connectionRecord({ id: "rel-pending-connection", contactId: "pending-relationship", valueTypes: ["referral_path"], strength: 98, pending: true }),
      connectionRecord({ id: "rel-duplicate-contact", contactId: "duplicate-contact-id", sourceType: "referral", strength: 97 }),
      connectionRecord({ id: "rel-foreign", contactId: "foreign-contact", owner: "actor:other", sourceType: "referral" }),
    ];
    for (const record of relations) await store.upsertRecord(record);
    await store.upsertRecord(evidenceRecord({ id: "evidence:first-referral", sourceType: "referral", sourceId: "referral:friend" }));
    await store.upsertRecord(evidenceRecord({ id: "evidence:first-manual", sourceType: "manual", sourceId: "manual:note" }));
    await store.upsertRecord(evidenceRecord({ id: "evidence:second-referral", sourceType: "referral", sourceId: "referral:later" }));

    await pool.query(`
      insert into orbit_records (
        workspace_id,collection_name,record_id,user_id,source_type,source_id,
        evidence_ids,lifecycle_state,search_text,payload,created_at,updated_at
      )
      select $1,'contacts','noise-contact:' || n,'actor:intros-owner','manual','source:noise',
        array['evidence:noise'],'active','private-noise',
        jsonb_build_object(
          'id','noise-contact:' || n,'displayName','Noise contact ' || n,
          'organization','Noise','role','Irrelevant','stage','active',
          'source',jsonb_build_object('type','manual','id','source:noise'),
          'evidenceIds',jsonb_build_array('evidence:noise'),
          'createdAt',$2::text,'updatedAt',$2::text,'notes',repeat('PRIVATE_NOISE_',100)
        ),$2::timestamptz,$2::timestamptz
      from generate_series(1,10000) n
    `, [workspaceId, at]);

    const reader: ContactIntrosSummaryReader = createContactIntrosSummaryReader({ client, workspaceId });
    observe = true;
    const summary = await reader.read(actorId, workspaceId);
    observe = false;

    assert.equal(summary.totalContacts, 10_013);
    assert.equal(summary.referralCandidateCount, 6);
    assert.deepEqual(summary.candidates.map((candidate) => candidate.id), [
      "source-direct",
      "source-first-evidence",
      "path-new",
      "path-old",
      "path-tie-break",
    ]);
    assert.deepEqual(summary.candidates.map((candidate) => candidate.strengthScore), [90, 80, 70, 70, 60]);
    assert.equal(summary.candidates[0]?.sourceLabel, "朋友介绍");
    assert.equal(summary.candidates[0]?.hasReferralPath, false);
    assert.equal(summary.candidates[1]?.sourceLabel, "朋友介绍");
    assert.equal(summary.candidates[2]?.sourceLabel, "关系证据");
    assert.equal(summary.candidates[2]?.hasReferralPath, true);
    assert.doesNotMatch(JSON.stringify(summary), /PRIVATE_CONTACT_HISTORY|PRIVATE_RELATIONSHIP_HISTORY|PRIVATE_NOISE/u);
    assert.equal(observed.length, 1);
    assert.equal(observed[0]?.rows, 1);
    assert.ok(observed[0]!.bytes < 5_000, `one SQL response returned ${observed[0]!.bytes} bytes`);
    assert.match(observed[0]!.sql, /user_id=\$2/u);
    assert.match(observed[0]!.sql, /relationship_count=1/u);

    observed.length = 0;
    observe = true;
    const foreign = await reader.read("actor:other", workspaceId);
    observe = false;
    assert.equal(foreign.totalContacts, 1);
    assert.equal(foreign.referralCandidateCount, 1);
    assert.deepEqual(foreign.candidates.map((candidate) => candidate.id), ["foreign-contact"]);
    await assert.rejects(reader.read(actorId, "workspace:other"), /CONTACT_INTROS_WORKSPACE_MISMATCH/u);
    assert.equal(observed.length, 1, "workspace mismatch is rejected before SQL");
  } finally {
    await admin.query(`drop schema ${schema} cascade`);
    await pool.end();
    await admin.end();
  }
});
