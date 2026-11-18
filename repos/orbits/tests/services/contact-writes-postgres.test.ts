/**
 * agent-design AG12 `applyApproved` for contacts through PostgreSQL (random schema, loopback only): what each executor
 * writes after the click is exactly the card's item, through the existing contact services, and a replay of the same
 * operation key writes nothing more.
 *
 * - AG12-1: create adds one contact (version 1); the existing one of the same name is untouched; no merge.
 * - AG12-2: update writes the field at the expected version; a different version writes nothing (permanent failure).
 * - AG12-3: delete changes only the contact's own row — its note and to-do stay as they are; restore brings back the
 *   same id; past 30 days it is refused.
 * - AG12-4: the import's commit creates exactly the rows the in-memory preview said, and merges none.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { createStoreContactAccess } from "../../features/agent-v1/domains/contact/access";
import { contactWriteExecutors, type ContactWriteDeps } from "../../features/agent-v1/domains/contact/apply";
import { importTableOf, previewImport } from "../../features/agent-v1/domains/contact/import-preview";
import { AgentExecutionPermanentError } from "../../features/agent/runtime/service";
import { createContactDeleteService } from "../../features/contacts/delete/service";
import { runContactImportMigrations } from "../../features/contacts/import/migrations";
import { createContactImportService } from "../../features/contacts/import/service";
import { createPostgresManualContactV2Storage } from "../../features/contacts/manual-contact-v2/configured";
import { createManualContactV2Service } from "../../features/contacts/manual-contact-v2/service";
import { runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { SYNC_COMMIT_ORDER_LOCK_CTE } from "../../features/sync/commit-order-lock";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { createTransactionalPostgresClient, type TransactionalPostgresPool } from "../../shared/storage/transactional-postgres";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL ?? process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "no local test database";
const WS = "workspace:contact-writes";
const ACTOR = "actor:a";
const T = "2026-11-01T00:00:00.000Z";
const schema = `contact_writes_${randomUUID().replaceAll("-", "")}`;
let pool: Pool;
let deps: ContactWriteDeps;
let clock = new Date("2026-11-15T01:00:00.000Z");

before(async () => {
  if (!databaseUrl) return;
  assert.ok(/^(localhost|127\.0\.0\.1|\[::1\])$/u.test(new URL(databaseUrl).hostname), "loopback database only");
  pool = new Pool({ connectionString: databaseUrl, max: 6, options: `-c search_path=${schema}` });
  await pool.query(`create schema ${schema}`);
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  await pool.query(STRICT_SYNC_REVISION_SQL);
  await runPlanMatchingMigrations(pool);
  await runContactImportMigrations(pool);
  const transactional = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as unknown as TransactionalPostgresPool });
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client: transactional });
  const seed = async (collection: string, id: string, payload: Record<string, unknown>) => store.upsertRecord({ collectionName: collection, createdAt: T, evidenceIds: ["e"], lifecycleState: "active", payload: { id, ...payload }, recordId: id, sourceId: "s", sourceType: "manual", updatedAt: T, userId: ACTOR, workspaceId: WS });
  await seed("contacts", "c30", { createdAt: T, displayName: "田中浩", evidenceIds: ["e"], organization: "东和商事", primaryEmail: "tanaka@towa.example.test", role: "采购主管", source: { id: "s", type: "manual" }, stage: "active", updatedAt: T });
  await seed("contacts", "c31", { createdAt: T, displayName: "李薇", evidenceIds: ["e"], organization: "自由职业", role: "摄影师", source: { id: "s", type: "manual" }, stage: "active", updatedAt: T });
  await seed("contacts", "c46", { createdAt: T, displayName: "王强", evidenceIds: ["e"], organization: "远帆物流", primaryEmail: "wang@yuanfan.example.test", role: "运营经理", source: { id: "s", type: "manual" }, stage: "active", updatedAt: T });
  await seed("notes", "m40", { note: { body: "和李薇确认了样片的拍摄日期。", contactIds: ["c31"], id: "m40", title: "李薇样片沟通" } });
  await seed("tasks", "t45", { task: { id: "t45", relatedContactId: "c31", status: "open", title: "给李薇寄样片" } });
  deps = {
    access: createStoreContactAccess({ now: () => clock, store, workspaceId: WS }),
    actorId: ACTOR,
    deletes: createContactDeleteService({ client: transactional, now: () => clock, workspaceId: WS }),
    imports: createContactImportService({ client: transactional, log: () => undefined, now: () => clock, runLayers: async () => ({ deferredContactIds: [], enrichment: "done", operations: 0, planMatch: "enqueued", snapshot: "fresh", writtenContacts: 0 }) as never, schedule: () => undefined, workspaceId: WS }),
    manual: createManualContactV2Service({ now: () => clock, storage: createPostgresManualContactV2Storage({ client: transactional, workspaceId: WS }) }),
    store,
    workspaceId: WS,
  };
});

after(async () => {
  if (!databaseUrl) return;
  await pool.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
  await pool.end();
});

const executor = (key: string) => contactWriteExecutors(deps).find((item) => item.key === key)!;
const context = (key: string) => ({ actionId: "card:x", idempotencyKey: key, now: clock.toISOString(), operationId: "card:x:op1", runId: "run:x" });
const rows = async () => (await pool.query("select collection_name, record_id, lifecycle_state, payload from orbit_records where workspace_id = $1 and collection_name in ('contacts', 'notes', 'tasks') order by collection_name, record_id", [WS])).rows as { collection_name: string; record_id: string; lifecycle_state: string; payload: Record<string, unknown> }[];
const contactRow = async (id: string) => (await rows()).find((row) => row.collection_name === "contacts" && row.record_id === id)!;

test("create: one new contact, version 1; the existing 王强 untouched; a replay of the key adds nothing", { skip }, async () => {
  const before = await rows();
  const payload = { allowDuplicate: true, displayName: "王强", organization: "远帆物流", role: "仓储主管" };
  const done = await executor("contact.create").execute(payload, context("card:create:r1:op1"));
  const id = String(done.resultRef).replace(/^contacts:/u, "");
  await executor("contact.create").execute(payload, context("card:create:r1:op1"));
  const after = await rows();
  const added = after.filter((row) => !before.some((item) => item.record_id === row.record_id));
  assert.deepEqual(added.map((row) => row.record_id), [id], "exactly one new record of the business collections");
  assert.equal(added[0].payload.version, 1);
  assert.equal(added[0].payload.role, "仓储主管");
  assert.deepEqual((await contactRow("c46")).payload, before.find((row) => row.record_id === "c46")!.payload, "C46 is not merged into");
});

test("update: at the expected version only the field changes (old value in fieldHistory); another version writes nothing", { skip }, async () => {
  const stale = { before: { role: "采购主管" }, contactId: "c30", expectedVersion: 7, values: { role: "采购部长" } };
  await assert.rejects(executor("contact.update").execute(stale, context("card:u:r1:op1")), (error: unknown) => error instanceof AgentExecutionPermanentError && /CARD_CONTENT_CHANGED/u.test(error.message));
  assert.equal((await contactRow("c30")).payload.role, "采购主管");
  await executor("contact.update").execute({ ...stale, expectedVersion: 0 }, context("card:u:r1:op1"));
  const row = await contactRow("c30");
  assert.equal(row.payload.role, "采购部长");
  assert.equal(row.payload.organization, "东和商事");
  assert.equal(row.payload.primaryEmail, "tanaka@towa.example.test");
  assert.equal(row.payload.version, 1);
  assert.deepEqual((row.payload.fieldHistory as { field: string; previous: string; next: string }[]).map((entry) => [entry.field, entry.previous, entry.next]), [["role", "采购主管", "采购部长"]]);
  await executor("contact.update").execute({ ...stale, expectedVersion: 0 }, context("card:u:r1:op1"));
  assert.equal((await contactRow("c30")).payload.version, 1, "a replay writes nothing more");
});

test("delete changes only the contact's own row; the note and to-do stay; restore brings back the same id; past 30 days it is refused", { skip }, async () => {
  const before = await rows();
  await executor("contact.delete").execute({ contactId: "c31", expectedVersion: 0 }, context("card:d:r1:op1"));
  const after = await rows();
  const changed = after.filter((row) => JSON.stringify(row) !== JSON.stringify(before.find((item) => item.collection_name === row.collection_name && item.record_id === row.record_id)));
  assert.deepEqual(changed.map((row) => `${row.collection_name}:${row.record_id}:${row.lifecycle_state}`), ["contacts:c31:deleted"]);
  clock = new Date("2026-11-18T01:00:00.000Z");
  await executor("contact.restore").execute({ contactId: "c31" }, context("card:r:r1:op1"));
  const back = await contactRow("c31");
  assert.equal(back.lifecycle_state, "active");
  assert.equal(back.payload.displayName, "李薇");
  assert.equal(back.payload.version, 2, "delete and restore are one write each");
  assert.ok((await rows()).some((row) => row.record_id === "m40" && row.lifecycle_state === "active"));
  // Deleted 31 days ago: no restore.
  await executor("contact.delete").execute({ contactId: "c31" }, context("card:d2:r1:op1"));
  await pool.query(`with ${SYNC_COMMIT_ORDER_LOCK_CTE} update orbit_records set deleted_at = '2026-10-17T00:00:00.000Z' from sync_write_lock where orbit_records.record_id = 'c31' and orbit_records.collection_name = 'contacts'`);
  await assert.rejects(executor("contact.restore").execute({ contactId: "c31" }, context("card:r2:r1:op1")), (error: unknown) => error instanceof AgentExecutionPermanentError);
  assert.equal((await contactRow("c31")).lifecycle_state, "deleted");
});

test("import: the commit creates exactly the rows the in-memory preview said; the possible duplicate is never merged; a replay adds nothing", { skip }, async () => {
  clock = new Date("2026-11-19T01:00:00.000Z");
  const table = importTableOf("把下面这几位导入联系人：\n姓名,公司,职位\n王强,远帆物流,运营经理\n高桥凉,山手出版,营业\n,青叶设计,实习生\n森田葵,东和商事,采购")!;
  const preview = previewImport(table, await deps.access.listActive(ACTOR), ACTOR, { 1: "create" });
  assert.deepEqual(preview.counts, { create: 3, duplicate: 0, skip: 1 });
  const before = await rows();
  const c46 = before.find((row) => row.record_id === "c46")!;
  const outcomes = Object.fromEntries(preview.rows.map((row) => [String(row.row), row.outcome]));
  await executor("contact.import").execute({ outcomes, text: table }, context("card:imp:r2:op1"));
  await executor("contact.import").execute({ outcomes, text: table }, context("card:imp:r2:op1"));
  const after = await rows();
  const added = after.filter((row) => row.collection_name === "contacts" && !before.some((item) => item.record_id === row.record_id)).map((row) => String(row.payload.displayName)).sort();
  assert.deepEqual(added, ["王强", "森田葵", "高桥凉"].sort());
  assert.deepEqual(after.find((row) => row.record_id === "c46")!.payload, c46.payload, "C46 unchanged: no merge");
});
