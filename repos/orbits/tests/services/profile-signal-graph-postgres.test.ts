/**
 * W0042 SC-02 / SC-04：资料「更新建议」图按本人收窄。
 *
 * 旧路径：PG `listRecords` 整 workspace 五个集合 + JS 过滤（`createStorageProfileSignalProvider`，不注入读取器）。
 * 新路径：`createPostgresProfileSignalGraphRecordReader` 三轮按本人／按 id 读（注入同一 provider），
 * 以及 `createTransactionalStorageProfileSignalProvider`（生产接法）。
 * 同一份数据两条路径读图：非平局组整图 deep-equal（含顺序与 generatedAt）；平局组按多重集；
 * 坏数据逐例 oracle（旧路径的成败即判据）。每次随机 schema，只删自己的。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Pool } from "pg";

import { createPostgresProfileSignalGraphRecordReader } from "../../features/profile/storage/profile-signal-graph-postgres-reader";
import {
  createStorageProfileSignalProvider,
  createTransactionalStorageProfileSignalProvider,
  PROFILE_SIGNAL_PAYLOAD_FIELDS,
  selectActorSignalRecords,
  type LiveProfileSignalGraph,
  type ProfileSignalRawRecords,
} from "../../features/profile/storage/profile-signal-live-record-provider";
import { createLiveProfileSignalReviewQueueService } from "../../features/profile/live-signal-service";
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import type { PostgresReadMetric } from "../../shared/storage/postgres-read-metrics";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const pgSkip = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const NOW = "2026-09-20T00:00:00.000Z";
const SIGNAL = ["profiles", "contacts", "connections", "interactionMemories", "evidence"] as const;
type Collection = (typeof SIGNAL)[number];
const READER_MARK = "w0042-profile-signal-graph";

if (databaseUrl) {
  // RULES §6: only the local test database
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname), "PG tests must target localhost");
}

interface Harness {
  schema: string;
  pool: Pool;
  client: LiveRecordSqlClient;
  statements: Array<{ text: string; values: readonly unknown[] }>;
  close(): Promise<void>;
}

async function harness(prefix: string): Promise<Harness> {
  assert.ok(databaseUrl);
  const schema = `${prefix}_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  const pool = new Pool({ connectionString: databaseUrl, max: 3, options: `-c search_path=${schema}` });
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  const statements: Harness["statements"] = [];
  const client: LiveRecordSqlClient = {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      statements.push({ text, values: values ?? [] });
      const result = await pool.query(text, values as unknown[]);
      return { rows: result.rows as TRow[] };
    },
  };
  return {
    schema, pool, client, statements,
    async close() {
      await pool.end();
      try {
        await admin.query(`drop schema if exists ${schema} cascade`);
      } finally {
        await admin.end();
      }
    },
  };
}

interface Row {
  workspace: string;
  collection: string;
  recordId: string;
  userId: string | null;
  payload: unknown;
  evidenceIds?: string[];
  lifecycle?: "active" | "archived" | "deleted";
  /** distinct by default; equal stamps build a tie */
  stamp?: string;
}

let sequence = 0;
function nextStamp(): string {
  sequence += 1;
  return new Date(Date.parse(NOW) + sequence * 1000).toISOString();
}

async function insertRows(pool: Pool, rows: readonly Row[]): Promise<void> {
  for (const row of rows) {
    const stamp = row.stamp ?? nextStamp();
    await pool.query(
      `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, evidence_ids, search_text, payload, created_at, updated_at, occurred_at, lifecycle_state)
       values ($1, $2, $3, $4, 'manual', 'w0042', $5, $6, $7::jsonb, $8, $8, $8, $9)`,
      [row.workspace, row.collection, row.recordId, row.userId, row.evidenceIds ?? [], `search ${row.recordId} ${"s".repeat(64)}`, JSON.stringify(row.payload), stamp, row.lifecycle ?? "active"],
    );
  }
}

const source = { type: "manual", id: "source:w0042", label: "W0042" };
const EXTRA = { unusedBlob: "x".repeat(300), unusedNested: { deep: [1, 2, 3] } };
const profile = (id: string, accountId: unknown, extra: Record<string, unknown> = {}) => ({
  id, accountId, displayName: `Profile ${id}`, headline: "Head", organization: "Org", role: "Founder", timezone: "Asia/Tokyo",
  homeMarket: "JP", publicProfile: { bio: "bio" }, preferredFollowUpWindow: "week", preferredIntroChannels: ["email"],
  relationshipGoal: "grow", targetRelationshipTypes: ["investor"], createdAt: NOW, updatedAt: NOW, ...EXTRA, ...extra,
});
const contact = (id: unknown, accountId: unknown, extra: Record<string, unknown> = {}) => ({
  id, accountId, displayName: `Contact ${String(id)}`, stage: "active", source, organization: "Org", role: "CTO", location: "Tokyo",
  primaryEmail: "c@example.test", primaryPhone: "+81", profileSnippet: "snippet", personId: "person:1", evidenceIds: [`evidence:payload-${String(id)}`],
  createdAt: NOW, updatedAt: NOW, ...EXTRA, ...extra,
});
const connection = (id: string, accountId: unknown, contactId: unknown, extra: Record<string, unknown> = {}) => ({
  id, accountId, contactId, stage: "active", summary: `Relationship ${id}`, source, valueTypes: ["introductions"], relationshipStrength: 3,
  trustLevel: "high", businessRelevanceScore: 70, sharedTopics: ["ai"], suggestedActions: ["call"], evidenceIds: [`evidence:payload-${id}`],
  createdAt: NOW, updatedAt: NOW, ...EXTRA, ...extra,
});
const memory = (id: string, contactId: unknown, extra: Record<string, unknown> = {}) => ({
  id, contactId, memoryType: "follow_up_request", summary: `Memory ${id}`, occurredAt: NOW, createdAt: NOW, confidence: 0.8, source,
  conversationId: "conversation:1", messageId: "message:1", evidenceIds: [`evidence:payload-${id}`], ...EXTRA, ...extra,
});
const evidence = (id: unknown, extra: Record<string, unknown> = {}) => ({
  id, sourceType: "manual", sourceId: "source:w0042", summary: `Evidence ${String(id)}`, occurredAt: NOW, createdBy: "system", confidence: 0.9,
  ...EXTRA, ...extra,
});

function oldProvider(client: LiveRecordSqlClient, workspaceId: string) {
  return createStorageProfileSignalProvider({ store: createPostgresLiveRecordStore({ client }), workspaceId });
}
function newProvider(client: LiveRecordSqlClient, workspaceId: string) {
  return createStorageProfileSignalProvider({
    graphRecordReader: createPostgresProfileSignalGraphRecordReader({ client, workspaceId }),
    store: createPostgresLiveRecordStore({ client }),
    workspaceId,
  });
}
async function fullLists(client: LiveRecordSqlClient, workspaceId: string): Promise<ProfileSignalRawRecords> {
  const store = createPostgresLiveRecordStore({ client });
  const list = (collectionName: string) => store.listRecords({ workspaceId, collectionName, limit: 100_000 });
  return {
    profiles: await list("profiles"), contacts: await list("contacts"), connections: await list("connections"),
    interactionMemories: await list("interactionMemories"), evidence: await list("evidence"),
  };
}
const ids = (selected: ProfileSignalRawRecords) =>
  Object.fromEntries(SIGNAL.map((c) => [c, selected[c].map((r) => r.recordId)]));

/** Distinct sort keys for every row of a workspace (same relative layout, 1 ms apart). */
async function detie(pool: Pool, workspaceId: string): Promise<void> {
  await pool.query(
    `update orbit_records o
        set occurred_at = coalesce(o.occurred_at, o.updated_at) + r.n * interval '1 millisecond',
            updated_at = o.updated_at + r.n * interval '1 millisecond'
       from (select collection_name, record_id, row_number() over (order by collection_name, record_id) n
               from orbit_records where workspace_id = $1) r
      where o.workspace_id = $1 and o.collection_name = r.collection_name and o.record_id = r.record_id`,
    [workspaceId],
  );
}

const multiset = (graph: LiveProfileSignalGraph) => Object.fromEntries(
  SIGNAL.map((c) => [c, graph[c].map((item) => JSON.stringify(item)).sort()]),
);
const suggestionsOf = (graph: LiveProfileSignalGraph, actorId: string) => createLiveProfileSignalReviewQueueService({
  now: () => "2026-09-22T00:00:00.000Z",
  provider: { source: "s", sourceLabel: "l", readSignalGraph: () => graph, saveSuggestionDecision: (d) => d },
}).listUpdateSuggestions({ actorId });

// ---------------------------------------------------------------- matrix (non-tie)
const W = "workspace:w0042-matrix";
const A = "account:a";
const B = "account:b";
const X = "account:x";
const N = "123";
function matrixRows(): Row[] {
  const r = (collection: Collection, recordId: string, userId: string | null, payload: unknown, more: Partial<Row> = {}): Row =>
    ({ workspace: W, collection, recordId, userId, payload, ...more });
  return [
    // (i) ownership — profiles
    r("profiles", "p:user", A, profile("profile:a", A), { evidenceIds: ["evidence:col-p"] }),
    r("profiles", "p:account-string", B, profile("profile:a2", A)),
    r("profiles", "p:account-number", B, profile("profile:n", 123)),
    r("profiles", "p:account-array", B, profile("profile:arr", [A])),
    r("profiles", "p:account-object", B, profile("profile:obj", { id: A })),
    r("profiles", "p:account-null", B, profile("profile:null", null)),
    r("profiles", "p:account-padded", B, profile("profile:pad", ` ${A} `)),
    r("profiles", "p:user-null", null, profile("profile:nouser", X)),
    r("profiles", "p:n-user", N, profile("profile:n-user", N)),
    { workspace: "workspace:w0042-elsewhere", collection: "profiles", recordId: "p:other-workspace", userId: A, payload: profile("profile:elsewhere", A) },
    r("profiles", "p:deleted", A, profile("profile:deleted", A), { lifecycle: "deleted" }),
    r("profiles", "p:archived", A, profile("profile:archived", A), { lifecycle: "archived" }),
    // (ii) indirect — connections
    r("connections", "n:to-foreign", A, connection("connection:a1", A, "contact:foreign"), { evidenceIds: ["evidence:col-n"] }),
    r("connections", "n:contact-number", A, connection("connection:a2", A, 5)),
    r("connections", "n:contact-empty", A, connection("connection:a3", A, "")),
    r("connections", "n:contact-blank", A, connection("connection:a4", A, "   ")),
    r("connections", "n:invalid", A, connection("connection:a5", A, "contact:dup", { summary: undefined }), { evidenceIds: ["evidence:from-invalid"] }),
    r("connections", "n:own", A, connection("connection:a6", A, "contact:a-own")),
    r("connections", "n:account-only", B, connection("connection:a7", A, "contact:via-account")),
    r("connections", "n:b", B, connection("connection:b1", B, "contact:b-only")),
    r("connections", "n:n-number", B, connection("connection:n1", 123, "contact:n-number")),
    // contacts
    r("contacts", "c:foreign", B, contact("contact:foreign", B)),
    r("contacts", "c:dup-b", B, contact("contact:dup", B)),
    r("contacts", "c:dup-x", X, contact("contact:dup", X)),
    r("contacts", "c:a-own", A, contact("contact:a-own", A, { evidenceIds: ["evidence:payload-ref"] })),
    r("contacts", "c:a-unref", A, contact("contact:a-unref", A), { evidenceIds: ["evidence:col-c", ""] }),
    r("contacts", "c:via-account", X, contact("contact:via-account", X)),
    r("contacts", "c:id-number", B, contact(5, B)),
    r("contacts", "c:blank-id", B, contact("   ", B)),
    r("contacts", "c:b-only", B, contact("contact:b-only", B)),
    r("contacts", "c:n-number", B, contact("contact:n-number", B)),
    // memories
    r("interactionMemories", "m:via-contact", B, memory("memory:1", "contact:foreign")),
    r("interactionMemories", "m:via-connection", B, memory("memory:2", "contact:zzz", { connectionId: "connection:a1" })),
    r("interactionMemories", "m:unreferenced-own-contact", B, memory("memory:3", "contact:a-unref")),
    r("interactionMemories", "m:own", A, memory("memory:4", "contact:none"), { evidenceIds: ["77"] }),
    r("interactionMemories", "m:own-account", B, memory("memory:5", "contact:none", { accountId: A })),
    r("interactionMemories", "m:b", B, memory("memory:6", "contact:b-only")),
    r("interactionMemories", "m:connection-number", B, memory("memory:7", "contact:zzz", { connectionId: 5 })),
    // (iii) evidence
    r("evidence", "e:own", A, evidence("evidence:own")),
    r("evidence", "e:own-account", B, evidence("evidence:own-account", { accountId: A })),
    r("evidence", "e:col-p", B, evidence("evidence:col-p")),
    r("evidence", "e:col-n", B, evidence("evidence:col-n")),
    r("evidence", "e:col-c", B, evidence("evidence:col-c")),
    r("evidence", "e:payload-ref", B, evidence("evidence:payload-ref")),
    r("evidence", "e:ignored-payload", B, evidence("evidence:payload-contact:a-unref")),
    r("evidence", "e:from-invalid", B, evidence("evidence:from-invalid")),
    r("evidence", "e:payload-connection", X, evidence("evidence:payload-connection:a6")),
    r("evidence", "e:id-number", B, evidence(77)),
    r("evidence", "e:b-only", B, evidence("evidence:b-only")),
    r("evidence", "e:invalid-shape", A, evidence("evidence:bad-shape", { confidence: "high" })),
    // generatedAt from an invalid row (actor account:g): the latest row is invalid
    r("profiles", "p:g-valid", "account:g", profile("profile:g", "account:g")),
    r("evidence", "e:g-invalid-latest", "account:g", evidence("evidence:g", { summary: "" })),
    // generatedAt from an archived row (actor account:h): the latest row is archived
    r("profiles", "p:h-valid", "account:h", profile("profile:h", "account:h")),
    r("evidence", "e:h-archived-latest", "account:h", evidence("evidence:h"), { lifecycle: "archived" }),
    r("evidence", "e:h-deleted-later", "account:h", evidence("evidence:h2"), { lifecycle: "deleted" }),
  ];
}
const MATRIX_EXPECTED_A = {
  profiles: ["p:archived", "p:account-string", "p:user"],
  contacts: ["c:via-account", "c:a-unref", "c:a-own", "c:dup-x", "c:dup-b", "c:foreign"],
  connections: ["n:account-only", "n:own", "n:invalid", "n:contact-blank", "n:contact-empty", "n:contact-number", "n:to-foreign"],
  interactionMemories: ["m:own-account", "m:own", "m:via-connection", "m:via-contact"],
  evidence: ["e:invalid-shape", "e:payload-connection", "e:from-invalid", "e:payload-ref", "e:col-c", "e:col-n", "e:col-p", "e:own-account", "e:own"],
};

test("W0042 SC-02 ① PG matrix: the actor-scoped reader yields the same graph (order, generatedAt) and the same selected rows", pgSkip, async () => {
  const h = await harness("w0042_matrix");
  try {
    await insertRows(h.pool, matrixRows());
    const fixtureWorkspace = "workspace:w0042-fixtures";
    await seedGeneratedRelationshipFixturesIntoLiveStore({ now: () => NOW, store: createPostgresLiveRecordStore({ client: h.client }), workspaceId: fixtureWorkspace });
    const all = await fullLists(h.client, W);
    const reader = createPostgresProfileSignalGraphRecordReader({ client: h.client, workspaceId: W });
    for (const actor of [A, B, X, N, "account:g", "account:h", "account:nobody"]) {
      const before = await oldProvider(h.client, W).readSignalGraph(actor);
      const after = await newProvider(h.client, W).readSignalGraph(actor);
      assert.deepStrictEqual(after, before, `graph for ${actor}`);
      assert.deepEqual(ids(selectActorSignalRecords(await reader(actor), actor)), ids(selectActorSignalRecords(all, actor)), `selected rows for ${actor}`);
    }
    assert.deepEqual(ids(selectActorSignalRecords(all, A)), MATRIX_EXPECTED_A, "the oracle itself: archived read, deleted not, strict jsonb ownership, indirect sharing, evidence references");
    const stampOf = async (recordId: string) => ((await h.pool.query("select updated_at m from orbit_records where record_id = $1", [recordId])).rows[0].m as Date).toISOString();
    const graphH = await newProvider(h.client, W).readSignalGraph("account:h");
    assert.equal(graphH.evidence.length, 1, "the archived evidence is read and valid");
    assert.equal(graphH.generatedAt, await stampOf("e:h-archived-latest"), "generatedAt comes from the archived row, never from the later deleted one");
    const graphG = await newProvider(h.client, W).readSignalGraph("account:g");
    assert.equal(graphG.evidence.length, 0, "the latest row of account:g is invalid");
    assert.equal(graphG.generatedAt, await stampOf("e:g-invalid-latest"), "generatedAt comes from the invalid row");
    assert.equal((await newProvider(h.client, W).readSignalGraph("account:nobody")).generatedAt, "1970-01-01T00:00:00.000Z", "empty graph → epoch");
    assert.deepEqual(ids(selectActorSignalRecords(all, N)).profiles, ["p:n-user"], "accountId 123 (number) is not the actor \"123\"");
    // seeded fixtures, made tie-free (the generated rows share timestamps; ties are ②)
    await detie(h.pool, fixtureWorkspace);
    const fixtureAll = await fullLists(h.client, fixtureWorkspace);
    const fixtureReader = createPostgresProfileSignalGraphRecordReader({ client: h.client, workspaceId: fixtureWorkspace });
    for (const actor of ["account_orbit_generated", "account:nobody"]) {
      const before = await oldProvider(h.client, fixtureWorkspace).readSignalGraph(actor);
      const after = await newProvider(h.client, fixtureWorkspace).readSignalGraph(actor);
      assert.deepStrictEqual(after, before, `fixture graph for ${actor}`);
      assert.deepEqual(ids(selectActorSignalRecords(await fixtureReader(actor), actor)), ids(selectActorSignalRecords(fixtureAll, actor)), `fixture rows for ${actor}`);
    }
    const fixtureGraph = await newProvider(h.client, fixtureWorkspace).readSignalGraph("account_orbit_generated");
    assert.ok(fixtureGraph.connections.length > 0 && fixtureGraph.evidence.length > 0, "the fixture graph is not trivially empty");
  } finally {
    await h.close();
  }
});

test("W0042 SC-02 ② PG ties: rows with identical sort keys compare as multisets; generatedAt and suggestions equal", pgSkip, async () => {
  const h = await harness("w0042_ties");
  const T = "workspace:w0042-ties";
  try {
    const stamp = "2026-09-21T00:00:00.000Z";
    const rows: Row[] = [];
    for (let i = 0; i < 4; i += 1) {
      rows.push({ workspace: T, collection: "connections", recordId: `n:tie-${i}`, userId: A, payload: connection(`connection:tie-${i}`, A, "contact:tie", { businessRelevanceScore: 50 }), stamp });
      rows.push({ workspace: T, collection: "contacts", recordId: `c:tie-${i}`, userId: A, payload: contact("contact:tie", A), stamp });
      rows.push({ workspace: T, collection: "interactionMemories", recordId: `m:tie-${i}`, userId: A, payload: memory(`memory:tie-${i}`, "contact:tie"), stamp });
      rows.push({ workspace: T, collection: "evidence", recordId: `e:tie-${i}`, userId: A, payload: evidence(`evidence:payload-connection:tie-${i}`), stamp });
    }
    rows.push({ workspace: T, collection: "profiles", recordId: "p:tie", userId: A, payload: profile("profile:tie", A), stamp });
    await insertRows(h.pool, rows);
    const before = await oldProvider(h.client, T).readSignalGraph(A);
    const after = await newProvider(h.client, T).readSignalGraph(A);
    assert.deepEqual(multiset(after), multiset(before));
    assert.equal(after.generatedAt, before.generatedAt);
    assert.deepEqual(await suggestionsOf(after, A), await suggestionsOf(before, A), "these ties do not reach the suggestion choice");
    // the seeded fixtures as written (shared timestamps): same multisets and generatedAt; a tie at the
    // top business relevance score may pick another equally ranked connection — the accepted difference
    const F = "workspace:w0042-ties-fixtures";
    await seedGeneratedRelationshipFixturesIntoLiveStore({ now: () => NOW, store: createPostgresLiveRecordStore({ client: h.client }), workspaceId: F });
    const fixtureBefore = await oldProvider(h.client, F).readSignalGraph("account_orbit_generated");
    const fixtureAfter = await newProvider(h.client, F).readSignalGraph("account_orbit_generated");
    assert.deepEqual(multiset(fixtureAfter), multiset(fixtureBefore));
    assert.equal(fixtureAfter.generatedAt, fixtureBefore.generatedAt);
    const shape = async (graph: LiveProfileSignalGraph) => {
      const result = await suggestionsOf(graph, "account_orbit_generated");
      assert.equal(result.success, true);
      return result.success ? result.data.suggestions.map((item) => [item.sourceKind, item.targetProfileField, item.confidence, item.status]) : [];
    };
    assert.deepEqual(await shape(fixtureAfter), await shape(fixtureBefore));
  } finally {
    await h.close();
  }
});

// ---------------------------------------------------------------- bad data oracle
const SHAPES: Array<[string, unknown]> = [
  ["jsonb null", null],
  ["array", [1, "account:a"]],
  ["number", 42],
  ["json string of an owned object", JSON.stringify({ id: "doubly:encoded", accountId: A, contactId: "contact:base", connectionId: "connection:base", displayName: "Doubly", createdAt: NOW, updatedAt: NOW })],
  ["json string of an array", JSON.stringify([A])],
  ["json string of null", "null"],
  ["invalid json string", "{not json"],
];

function baseGraphRows(workspace: string): Row[] {
  return [
    { workspace, collection: "profiles", recordId: "p:base", userId: A, payload: profile("profile:base", A) },
    { workspace, collection: "connections", recordId: "n:base", userId: A, payload: connection("connection:base", A, "contact:base") },
    { workspace, collection: "contacts", recordId: "c:base", userId: B, payload: contact("contact:base", B) },
    { workspace, collection: "interactionMemories", recordId: "m:base", userId: A, payload: memory("memory:base", "contact:base") },
    { workspace, collection: "evidence", recordId: "e:base", userId: B, payload: evidence("evidence:payload-connection:base") },
  ];
}

type Settled<T> = { ok: true; value: T; name?: undefined; message?: undefined } | { ok: false; name: string; message: string };
async function settle<T>(read: () => T | Promise<T>): Promise<Settled<T>> {
  try {
    return { ok: true, value: await read() };
  } catch (error) {
    return { ok: false, name: (error as Error).constructor.name, message: (error as Error).message };
  }
}

test("W0042 SC-02 ③ PG bad data: every non-object payload (self/other × 7 shapes × 5 collections) gives the old verdict", pgSkip, async (t) => {
  const h = await harness("w0042_bad");
  try {
    const cases: Array<{ workspace: string; label: string }> = [];
    let n = 0;
    for (const collection of SIGNAL) {
      for (const owner of [A, B]) {
        for (const [shape, payload] of SHAPES) {
          n += 1;
          const workspace = `workspace:w0042-bad-${n}`;
          cases.push({ workspace, label: `${collection} / ${owner === A ? "self" : "other"} / ${shape}` });
          await insertRows(h.pool, [...baseGraphRows(workspace), { workspace, collection, recordId: `bad:${n}`, userId: owner, payload, evidenceIds: owner === A ? [] : ["evidence:payload-connection:base"] }]);
        }
      }
    }
    const verdicts: Record<string, number> = {};
    for (const { workspace, label } of cases) {
      const before = await settle(() => oldProvider(h.client, workspace).readSignalGraph(A));
      const after = await settle(() => newProvider(h.client, workspace).readSignalGraph(A));
      const verdict = before.ok ? "ok" : `${before.name}`;
      verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;
      assert.equal(after.ok, before.ok, `${label}: same verdict (old ${before.ok ? "ok" : before.message})`);
      if (before.ok && after.ok) assert.deepStrictEqual(after.value, before.value, `${label}: same graph`);
      if (!before.ok && !after.ok) {
        assert.equal(after.name, before.name, `${label}: same error class`);
        assert.equal(after.message, before.message, `${label}: same error`);
      }
    }
    // the oracle really covers the three outcomes (success, TypeError from a null payload, SyntaxError from an invalid string)
    assert.ok(verdicts.ok! > 0 && verdicts.TypeError! > 0 && verdicts.SyntaxError! > 0, JSON.stringify(verdicts));
    assert.equal(cases.length, 70);
    t.diagnostic(`old-path verdicts over 70 cases: ${JSON.stringify(verdicts)}`);
  } finally {
    await h.close();
  }
});

test("W0042 SC-02 ③ a SQL failure in the reader rejects the read", async () => {
  const failing: LiveRecordSqlClient = { async query() { throw new Error("w0042 sql failed"); } };
  await assert.rejects(createPostgresProfileSignalGraphRecordReader({ client: failing, workspaceId: W })(A), /w0042 sql failed/u);
  const provider = createStorageProfileSignalProvider({
    graphRecordReader: createPostgresProfileSignalGraphRecordReader({ client: failing, workspaceId: W }),
    store: createMemoryLiveRecordStore(),
    workspaceId: W,
  });
  await assert.rejects(Promise.resolve(provider.readSignalGraph(A)), /w0042 sql failed/u);
});

// ---------------------------------------------------------------- reader unit test
test("W0042 SC-02 ④ PG reader: raw records keep both field columns, the evidence_ids column, timestamps; non-object payloads verbatim", pgSkip, async () => {
  const h = await harness("w0042_raw");
  const R = "workspace:w0042-raw";
  try {
    const full = Object.fromEntries(SIGNAL.map((c) => {
      const fields = [...PROFILE_SIGNAL_PAYLOAD_FIELDS[c].derivation, ...PROFILE_SIGNAL_PAYLOAD_FIELDS[c].parser];
      return [c, { ...Object.fromEntries(fields.map((f) => [f, `${c}.${f}`])), accountId: A, notRead: "drop me", alsoNotRead: { big: "y".repeat(100) } }];
    })) as unknown as Record<Collection, Record<string, unknown>>;
    const rows: Row[] = SIGNAL.map((c) => ({ workspace: R, collection: c, recordId: `full:${c}`, userId: A, payload: full[c], evidenceIds: [`evidence:column-${c}`] }));
    rows.push({ workspace: R, collection: "evidence", recordId: "raw:null", userId: B, payload: null });
    rows.push({ workspace: R, collection: "evidence", recordId: "raw:array", userId: B, payload: [1, { a: 2 }] });
    rows.push({ workspace: R, collection: "evidence", recordId: "raw:number", userId: B, payload: 7 });
    rows.push({ workspace: R, collection: "evidence", recordId: "raw:string", userId: B, payload: JSON.stringify({ keep: "everything", notRead: 1 }) });
    await insertRows(h.pool, rows);
    h.statements.length = 0;
    const raw = await createPostgresProfileSignalGraphRecordReader({ client: h.client, workspaceId: R })(A);
    for (const c of SIGNAL) {
      const record = raw[c].find((r) => r.recordId === `full:${c}`);
      assert.ok(record, `${c} owned row is read`);
      const expected = Object.fromEntries([...new Set([...PROFILE_SIGNAL_PAYLOAD_FIELDS[c].derivation, ...PROFILE_SIGNAL_PAYLOAD_FIELDS[c].parser])].map((f) => [f, full[c][f]]));
      assert.deepEqual(record.payload, expected, `${c}: exactly the two field columns`);
      assert.deepEqual(record.evidenceIds, [`evidence:column-${c}`]);
      assert.equal(record.userId, A);
      assert.equal(record.lifecycleState, "active");
      assert.match(record.updatedAt, /^2026-/u);
      assert.equal(record.occurredAt, record.updatedAt);
      assert.equal(record.searchText, null, "search_text is not read");
    }
    const byId = Object.fromEntries(raw.evidence.map((r) => [r.recordId, r.payload]));
    assert.equal(byId["raw:null"], null);
    assert.deepEqual(byId["raw:array"], [1, { a: 2 }]);
    assert.equal(byId["raw:number"], 7);
    assert.deepEqual(byId["raw:string"], { keep: "everything", notRead: 1 }, "a double-encoded string is parsed by rowToRecord, unprojected");
    // SC-01 (a): three statements, every one bound to the workspace and the actor
    assert.equal(h.statements.length, 3);
    for (const statement of h.statements) {
      assert.match(statement.text, new RegExp(READER_MARK, "u"));
      assert.equal(statement.values[0], R);
      assert.ok(statement.values.includes(A), "every statement carries the actor");
      assert.doesNotMatch(statement.text, /\blimit\b/iu);
      assert.match(statement.text, /order by coalesce\(occurred_at, updated_at\) desc, updated_at desc/u);
    }
  } finally {
    await h.close();
  }
});

// ---------------------------------------------------------------- SC-04
test("W0042 SC-04 (a) PG isolation: A never sees B's rows except through A's own references, on both paths; noise from others never changes A's read", pgSkip, async () => {
  const h = await harness("w0042_iso");
  try {
    await insertRows(h.pool, matrixRows());
    const reader = createPostgresProfileSignalGraphRecordReader({ client: h.client, workspaceId: W });
    const read = async () => {
      h.statements.length = 0;
      const raw = await reader(A);
      const rows = SIGNAL.reduce((n, c) => n + raw[c].length, 0);
      return { rows, bytes: Buffer.byteLength(JSON.stringify(raw)), statements: h.statements.length, selected: ids(selectActorSignalRecords(raw, A)) };
    };
    const quiet = await read();
    assert.deepEqual(quiet.selected, MATRIX_EXPECTED_A);
    const bRaw = selectActorSignalRecords(await reader(B), B);
    const bIds = new Set(SIGNAL.flatMap((c) => bRaw[c].map((r) => r.recordId)));
    for (const recordId of ["c:foreign", "c:dup-b", "e:col-p"]) assert.ok(bIds.has(recordId), `${recordId} is B's own row`);
    for (const recordId of ["p:user", "n:own", "c:a-own", "e:own", "m:own"]) assert.ok(!bIds.has(recordId), `${recordId} (A's) is not in B's graph`);
    // ≥100 object rows per collection from 10 other accounts, no reference to A
    const noise: Row[] = [];
    for (const c of SIGNAL) {
      for (let i = 0; i < 100; i += 1) {
        const other = `account:noise-${i % 10}`;
        noise.push({ workspace: W, collection: c, recordId: `noise:${c}:${i}`, userId: other, payload: { id: `noise:${c}:${i}`, accountId: other, contactId: `noise:contact:${i}`, connectionId: `noise:connection:${i}`, blob: "z".repeat(200) }, evidenceIds: [`noise:evidence:${i}`] });
      }
    }
    await insertRows(h.pool, noise);
    const loud = await read();
    assert.deepEqual(loud, quiet, "bytes, rows and statements of A's read are unchanged by other accounts' rows");
    const oldAll = await fullLists(h.client, W);
    assert.ok(SIGNAL.reduce((n, c) => n + oldAll[c].length, 0) >= quiet.rows + 500, "the old whole-workspace read grows with the noise");
  } finally {
    await h.close();
  }
});

function countingStore(inner: LiveRecordStoreLike<Record<string, unknown>>) {
  const listed: string[] = [];
  const store: LiveRecordStoreLike<Record<string, unknown>> = new Proxy(inner, {
    get(target, key, receiver) {
      if (key === "listRecords") {
        return (query: { collectionName?: string }) => {
          listed.push(query.collectionName ?? "?");
          return target.listRecords(query as never);
        };
      }
      return Reflect.get(target, key, receiver);
    },
  });
  return { listed, store };
}

test("W0042 SC-04 (b) memory and injected stores without a reader keep the whole-collection path", async () => {
  const { listed, store } = countingStore(createMemoryLiveRecordStore<Record<string, unknown>>());
  const graph = await createStorageProfileSignalProvider({ store, workspaceId: W }).readSignalGraph(A);
  assert.equal(graph.generatedAt, "1970-01-01T00:00:00.000Z");
  assert.deepEqual(listed.sort(), ["connections", "contacts", "evidence", "interactionMemories", "profileSuggestionDecisions", "profiles"]);
  let readerCalls = 0;
  const withReader = countingStore(createMemoryLiveRecordStore<Record<string, unknown>>());
  await createStorageProfileSignalProvider({
    graphRecordReader: async () => {
      readerCalls += 1;
      return { profiles: [], contacts: [], connections: [], interactionMemories: [], evidence: [] };
    },
    store: withReader.store,
    workspaceId: W,
  }).readSignalGraph(A);
  assert.equal(readerCalls, 1);
  assert.deepEqual(withReader.listed, ["profileSuggestionDecisions"], "with a reader only the decisions are listed from the store");
});

test("W0042 SC-04 (c)(e) PG transactional provider: every new SELECT goes through the passed client and its read observer; no cache", pgSkip, async () => {
  const h = await harness("w0042_meter");
  try {
    await insertRows(h.pool, matrixRows());
    const observed: PostgresReadMetric[] = [];
    const queried: string[] = [];
    const pool = {
      query: async (text: string, values?: unknown[]) => {
        queried.push(text);
        return h.pool.query(text, values);
      },
      connect: () => h.pool.connect(),
      end: async () => undefined,
    };
    const client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool, readMetrics: { observer: (metric) => { observed.push(metric); } } });
    const provider = createTransactionalStorageProfileSignalProvider({ client, workspaceId: W });
    const graph = await provider.readSignalGraph(A);
    assert.deepStrictEqual(graph, await oldProvider(h.client, W).readSignalGraph(A));
    const readerStatements = queried.filter((text) => text.includes(READER_MARK));
    assert.equal(readerStatements.length, 3, "three reader rounds");
    assert.equal(queried.length, 4, "three reader rounds + the decisions read; nothing else");
    assert.equal(observed.length, queried.length, "the observer saw every statement");
    assert.ok(observed.every((metric) => metric.queryKind === "select" && !metric.failed));
    await provider.readSignalGraph(A);
    assert.equal(queried.length, 8, "a second read issues every statement again (no cache)");
    assert.equal(observed.length, 8);
  } finally {
    await h.close();
  }
});
