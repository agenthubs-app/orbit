/**
 * R16（DESIGN add-and-invite §4.3）：`shared/contract/contact-import.ts` 只描述现有 `/api/contacts/import/**`（W0053）的 HTTP 形状。
 * 这里用真实 handler + 真实 PostgreSQL（本机测试库，随机 schema，用完即删）跑出每种 kind / format 的响应，逐个过新 schema：
 *   - 解析成功；
 *   - 解析结果与原响应逐字段相同（zod 对象会丢掉没声明的键：相同 = 契约没有漏掉任何一个现有字段，也没有改写值）；
 *   - 测试里发出的请求体都通过严格的请求 schema，常量头名就是 handler 读的头。
 * 活动导入（kind = event）的来源是现场交换表；这里只建 `listActorEventExchanges` 读到的三张表的最小替身（只为得到真实响应形状，
 * 活动交换本身的行为见 tests/services/contact-import-events-postgres.test.ts）。夹具全部为虚构数据。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Pool } from "pg";
import type { z } from "zod";

import { createContactImportHandlers } from "../../app/api/contacts/import/handlers";
import { runContactImportMigrations } from "../../features/contacts/import/migrations";
import { createContactImportService } from "../../features/contacts/import/service";
import {
  CONTACT_IMPORT_MAPPABLE_FIELD_KEYS,
  CONTACT_IMPORT_PARSE_ISSUES,
  CONTACT_IMPORT_UPLOAD_HEADERS,
  contactImportBatchListResponseObject,
  contactImportBatchResponseObject,
  contactImportBatchResultObject,
  contactImportCommitInputObject,
  contactImportDecisionsResultObject,
  contactImportEventInputObject,
  contactImportEventListResponseObject,
  contactImportMappingInputObject,
  contactImportRowDecisionInputObject,
  contactImportRowsPageObject,
} from "../../shared/api-schema/contact-import";
import { CONTACT_IMPORT_MAPPABLE_FIELDS } from "../../features/contacts/import/types";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const databaseTest = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured", timeout: 60_000 };
const WORKSPACE = "workspace:contact-import-parity";
const ALICE = "actor:alice";
const EVENT_ID = "event:parity-night";
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/contact-import/${name}`, import.meta.url)));
const utf8 = (text: string) => new TextEncoder().encode(text);

type Handlers = ReturnType<typeof createContactImportHandlers>;

async function withDatabase(run: (input: { pool: Pool; alice: Handlers }) => Promise<void>): Promise<void> {
  assert.ok(databaseUrl);
  assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(databaseUrl).hostname), "local Postgres only");
  const schema = `contact_import_parity_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema} -c statement_timeout=10000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runContactImportMigrations(pool);
    // listActorEventExchanges 读的三张表的最小替身（只含它读到的列）。
    await pool.query(`
      create table event_ops_events (workspace_id text, event_id text, title text, starts_at timestamptz);
      create table event_ops_relationship_pairs (workspace_id text, relationship_pair_id text, event_id text, accepted_at timestamptz);
      create table event_ops_relationship_sides (workspace_id text, relationship_pair_id text, owner_actor_id text, contact_id text);
    `);
    const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never });
    const service = createContactImportService({
      client,
      log: () => undefined,
      runLayers: async () => ({ deferredContactIds: [], enrichment: "done", operations: 0, planMatch: "enqueued", snapshot: "fresh", writtenContacts: 0 }),
      schedule: () => undefined,
      workspaceId: WORKSPACE,
    });
    const alice = createContactImportHandlers({ resolveActor: async () => ({ id: ALICE }) as never, schedule: () => undefined, service: () => service });
    await run({ alice, pool });
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

async function seedContact(pool: Pool, id: string, payload: Record<string, unknown>): Promise<void> {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, evidence_ids, created_at, updated_at)
     values ($1, 'contacts', $2, $3, 'manual', 'parity', 'active', $4::jsonb, array['evidence:seed'], '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
    [WORKSPACE, id, ALICE, JSON.stringify({ createdAt: "2026-09-01T00:00:00.000Z", evidenceIds: ["evidence:seed"], id, source: { id: "seed", type: "manual" }, stage: "captured", updatedAt: "2026-09-01T00:00:00.000Z", ...payload })],
  );
}

function uploadRequest(bytes: Uint8Array, kind: "csv" | "vcard", fileName: string): Request {
  return new Request("http://localhost/api/contacts/import", {
    body: bytes,
    headers: {
      "content-type": "application/octet-stream",
      [CONTACT_IMPORT_UPLOAD_HEADERS.idempotencyKey]: randomUUID(),
      [CONTACT_IMPORT_UPLOAD_HEADERS.fileName]: encodeURIComponent(fileName),
      [CONTACT_IMPORT_UPLOAD_HEADERS.kind]: kind,
    },
    method: "POST",
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id: encodeURIComponent(id) }) });

/** 请求体先过严格 schema（契约里的请求形状就是 handler 收的形状）。 */
function jsonRequest(method: string, schema: z.ZodTypeAny, payload: unknown): Request {
  schema.parse(payload);
  return new Request("http://localhost/x", { body: JSON.stringify(payload), headers: { "content-type": "application/json" }, method });
}

/** 成功信封的 data 过 schema；解析结果必须与原样相同（没有漏掉的字段、没有被改写的值）。 */
async function expectShape<T extends z.ZodTypeAny>(response: Response, schema: T, label: string, status = 200): Promise<z.infer<T>> {
  const body = await response.json();
  assert.equal(response.status, status, `${label}: ${JSON.stringify(body).slice(0, 400)}`);
  assert.equal(body.success, true, label);
  const parsed = schema.safeParse(body.data);
  assert.ok(parsed.success, `${label}: ${JSON.stringify(parsed.success ? null : parsed.error.issues.slice(0, 3))}`);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.data)), body.data, `${label}: the contract must describe every field the handler sends`);
  return parsed.data;
}

test("contract constants match the server: mappable fields, parse issues", () => {
  assert.deepEqual([...CONTACT_IMPORT_MAPPABLE_FIELD_KEYS], [...CONTACT_IMPORT_MAPPABLE_FIELDS]);
  assert.deepEqual([...CONTACT_IMPORT_PARSE_ISSUES].sort(), ["decode_failed", "field_truncated", "invalid_email", "malformed_row", "missing_name", "unknown_country"]);
});

test("csv · linkedin: upload, rows (each filter), list, get, decide, commit — every response matches the contract", databaseTest, async () => {
  await withDatabase(async ({ alice, pool }) => {
    await seedContact(pool, "contact:existing-avery", { displayName: "Avery Lin", organization: "Old Labs", primaryEmail: "avery.lin@example.com" });
    const uploaded = await expectShape(await alice.upload(uploadRequest(fixture("linkedin-connections.csv"), "csv", "Connections.csv")), contactImportBatchResultObject, "upload linkedin", 201);
    assert.equal(uploaded.batch.kind, "csv");
    assert.equal(uploaded.batch.format, "linkedin");
    assert.ok(uploaded.batch.headers.length > 0 && uploaded.batch.mapping, "CSV carries headers and the mapping");
    const id = uploaded.batch.id;
    for (const filter of ["", "?filter=new", "?filter=duplicates", "?filter=issues"]) {
      await expectShape(await alice.rows(new Request(`http://localhost/x${filter}`), params(id)), contactImportRowsPageObject, `rows ${filter || "all"}`);
    }
    const page = await expectShape(await alice.rows(new Request("http://localhost/x"), params(id)), contactImportRowsPageObject, "rows");
    assert.ok(page.rows.some((row) => row.candidate), "a duplicate candidate row is in the fixture run");
    assert.ok(page.rows.some((row) => row.issues.length > 0), "a row with a parse issue is in the fixture run");
    await expectShape(await alice.list(), contactImportBatchListResponseObject, "list");
    await expectShape(await alice.get(new Request("http://localhost/x"), params(id)), contactImportBatchResponseObject, "get");

    const undecided = page.rows.filter((row) => row.decision === null).map((row) => ({ decision: "merge" as const, seq: row.seq }));
    const decided = await expectShape(
      await alice.decide(jsonRequest("PATCH", contactImportRowDecisionInputObject, { decisions: undecided }), params(id)),
      contactImportDecisionsResultObject,
      "decide",
    );
    const confirmations = decided.batch.review?.mergeConfirmations ?? [];
    assert.ok(confirmations.length >= 1, "the merge needs a per-row confirmation");
    const committed = await expectShape(
      await alice.commit(jsonRequest("POST", contactImportCommitInputObject, { confirmationIntentId: randomUUID(), mergeConfirmations: confirmations }), params(id)),
      contactImportBatchResultObject,
      "commit",
    );
    assert.equal(committed.batch.status, "completed");
    await expectShape(await alice.rows(new Request("http://localhost/x"), params(id)), contactImportRowsPageObject, "rows after commit");
  });
});

test("csv · generic: upload, remap (mapping input), cancel", databaseTest, async () => {
  await withDatabase(async ({ alice }) => {
    const uploaded = await expectShape(await alice.upload(uploadRequest(fixture("generic-ja-sjis.csv"), "csv", "名刺.csv")), contactImportBatchResultObject, "upload generic", 201);
    assert.equal(uploaded.batch.format, "generic");
    const unknown = await expectShape(await alice.upload(uploadRequest(utf8("Col A,Col B,Col C\nLee Min,Globex,lee@example.com\n"), "csv", "eight.csv")), contactImportBatchResultObject, "upload unknown headers", 201);
    const remapped = await expectShape(
      await alice.remap(jsonRequest("PATCH", contactImportMappingInputObject, { mapping: { email: 2, name: 0, organization: 1 } }), params(unknown.batch.id)),
      contactImportBatchResponseObject,
      "remap",
    );
    assert.equal(remapped.batch.mapping?.organization, 1);
    const cancelled = await expectShape(await alice.cancel(new Request("http://localhost/x", { method: "POST" }), params(uploaded.batch.id)), contactImportBatchResponseObject, "cancel");
    assert.equal(cancelled.batch.status, "cancelled");
  });
});

test("vcard: upload (no headers, no mapping), rows, commit", databaseTest, async () => {
  await withDatabase(async ({ alice }) => {
    const uploaded = await expectShape(await alice.upload(uploadRequest(fixture("contacts-mixed.vcf"), "vcard", "contacts.vcf")), contactImportBatchResultObject, "upload vcard", 201);
    assert.equal(uploaded.batch.kind, "vcard");
    assert.equal(uploaded.batch.format, "vcard");
    assert.deepEqual(uploaded.batch.headers, []);
    assert.equal(uploaded.batch.mapping, null);
    const page = await expectShape(await alice.rows(new Request("http://localhost/x"), params(uploaded.batch.id)), contactImportRowsPageObject, "vcard rows");
    assert.ok(page.rows.some((row) => row.fields.countryCode), "region fields come through");
    const committed = await expectShape(
      await alice.commit(jsonRequest("POST", contactImportCommitInputObject, { confirmationIntentId: randomUUID(), mergeConfirmations: [] }), params(uploaded.batch.id)),
      contactImportBatchResultObject,
      "vcard commit",
    );
    assert.ok(committed.batch.counts.created >= 1);
  });
});

test("event: list importable events, import one (metEventId / metEventTitle on the rows)", databaseTest, async () => {
  await withDatabase(async ({ alice, pool }) => {
    await seedContact(pool, "contact:event-exchange-1", { displayName: "Morgan Ito", organization: "Example KK" });
    await pool.query("insert into event_ops_events values ($1, $2, '架空 Parity Night', '2026-10-01T09:00:00Z')", [WORKSPACE, EVENT_ID]);
    await pool.query("insert into event_ops_relationship_pairs values ($1, 'pair:1', $2, '2026-10-01T10:00:00Z')", [WORKSPACE, EVENT_ID]);
    await pool.query("insert into event_ops_relationship_sides values ($1, 'pair:1', $2, 'contact:event-exchange-1')", [WORKSPACE, ALICE]);
    const events = await expectShape(await alice.events(), contactImportEventListResponseObject, "events");
    assert.equal(events.events[0]?.eventId, EVENT_ID);
    const imported = await expectShape(
      await alice.importEvent(jsonRequest("POST", contactImportEventInputObject, { eventId: EVENT_ID, idempotencyKey: randomUUID() })),
      contactImportBatchResultObject,
      "import event",
      201,
    );
    assert.equal(imported.batch.kind, "event");
    assert.equal(imported.batch.format, "event");
    assert.equal(imported.batch.sourceEventId, EVENT_ID);
    const page = await expectShape(await alice.rows(new Request("http://localhost/x"), params(imported.batch.id)), contactImportRowsPageObject, "event rows");
    assert.equal(page.rows[0]?.fields.metEventId, EVENT_ID);
  });
});

test("tolerant reading: unknown enum values fall back safely; request bodies stay strict", () => {
  const row = {
    candidate: null, contactId: null, decision: "auto_merge", fields: { connectedOn: "", displayName: "A", email: "", linkedinUrl: "", location: "", notes: "", organization: "", phone: "", role: "" },
    inFileDuplicateOf: null, issues: ["missing_name", "new_issue"], mergeIntoContactId: null, seq: 1, status: "archived",
  };
  const page = contactImportRowsPageObject.parse({ nextCursor: null, rows: [row] });
  assert.equal(page.rows[0]!.decision, "skip", "an unknown decision is never read as create / merge");
  assert.equal(page.rows[0]!.status, "pending");
  assert.deepEqual(page.rows[0]!.issues, ["missing_name"]);
  assert.equal(contactImportRowDecisionInputObject.safeParse({ decisions: [{ decision: "create", extra: 1, seq: 1 }] }).success, false);
  assert.equal(contactImportCommitInputObject.safeParse({ confirmationIntentId: " ", mergeConfirmations: [] }).success, false);
  assert.equal(contactImportMappingInputObject.safeParse({ mapping: { nickname: 1 } }).success, false);
});
