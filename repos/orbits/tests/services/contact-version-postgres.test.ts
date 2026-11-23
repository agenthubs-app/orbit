/**
 * agent-design AG12-2: the contact's version marker goes up by one on every write, through PostgreSQL (random schema,
 * loopback database only). A field write may carry the version it expects: a different stored version is a conflict
 * (not retried, nothing written); without it the write behaves as before (re-read and retry on a race).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { applyContactFieldValues, ContactFieldWriteError } from "../../features/contacts/contact-field-write";
import { contactNextVersionSql, contactVersionOf, nextContactVersion, withNextContactVersion } from "../../features/contacts/contact-version";
import { createContactDeleteService } from "../../features/contacts/delete/service";
import { mergeCardIntoContact } from "../../features/contacts/business-card-contact-match";
import { createStorageBusinessCardContactWriteProvider } from "../../features/contacts/storage/contact-write-live-record-provider";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { writeInviteFields } from "../../features/invite-codes/invite-fields";
import { createStorageContactArchiveActionWriter } from "../../features/contacts/action-writer";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore, type LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import type { ContactDTO } from "../../shared/domain/contracts";
import { STRICT_SYNC_REVISION_SQL } from "../support/sync-revision-fixture";
import { SYNC_COMMIT_ORDER_LOCK_CTE } from "../../features/sync/commit-order-lock";

const databaseUrl = process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL ?? process.env.ORBIT_EVENT_DATABASE_URL;
const skip = databaseUrl ? false : "no local test database";
const WS = "workspace:contact-version";
const T = "2026-11-01T00:00:00.000Z";
const schema = `contact_version_${randomUUID().replaceAll("-", "")}`;
let pool: Pool;
let client: LiveRecordSqlClient;

before(async () => {
  if (!databaseUrl) return;
  assert.ok(/^(localhost|127\.0\.0\.1|\[::1\])$/u.test(new URL(databaseUrl).hostname), "loopback database only");
  pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  await pool.query(`create schema ${schema}`);
  await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
  await pool.query(STRICT_SYNC_REVISION_SQL);
  client = { async query<R>(sql: string, values?: readonly unknown[]) { return { rows: (await pool.query(sql, values ? [...values] : undefined)).rows as R[] }; } };
});

after(async () => {
  if (!databaseUrl) return;
  await pool.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
  await pool.end();
});

async function seed(id: string, payload: Record<string, unknown> = {}, user = "actor:a") {
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  await store.upsertRecord({
    collectionName: "contacts", createdAt: T, evidenceIds: ["e"], lifecycleState: "active",
    payload: { id, displayName: `n ${id}`, organization: "青叶设计", role: "设计总监", primaryEmail: `${id}@x.example.test`, stage: "active", source: { type: "manual", id: "s" }, evidenceIds: ["e"], createdAt: T, updatedAt: T, ...payload },
    recordId: id, sourceId: "s", sourceType: "manual", updatedAt: T, userId: user, workspaceId: WS,
  });
  return store;
}

/** Another writer, outside the code under test (holding the commit-order lock, as every contacts write must). */
const otherWrite = (set: string, id: string, extra = "") => pool.query(`with ${SYNC_COMMIT_ORDER_LOCK_CTE} update orbit_records set ${set} from sync_write_lock where orbit_records.record_id = $1 and orbit_records.collection_name = 'contacts' ${extra}`, [id]);

const stored = async (id: string) => (await pool.query("select payload, lifecycle_state from orbit_records where record_id = $1 and collection_name = 'contacts'", [id])).rows[0] as { payload: Record<string, unknown>; lifecycle_state: string };

test("the marker: no version (or not a positive integer) reads 0; the next write stores 1; written values are positive integers", () => {
  assert.equal(contactVersionOf({}), 0);
  assert.equal(contactVersionOf({ version: 0 }), 0);
  assert.equal(contactVersionOf({ version: "3" }), 0);
  assert.equal(contactVersionOf({ version: 2.5 }), 0);
  assert.equal(contactVersionOf({ version: 4 }), 4);
  assert.equal(nextContactVersion(undefined), 1);
  assert.equal(nextContactVersion({ version: 4 }), 5);
  assert.equal(withNextContactVersion(null, { displayName: "x" }).version, 1, "a new contact");
  assert.equal(withNextContactVersion(null, { displayName: "x", version: 1 }).version, 1, "an acquisition's version 1 is kept");
  assert.equal(withNextContactVersion({ version: 7 }, { displayName: "x", version: 1 }).version, 8, "a write over a stored contact goes past it");
});

test("SQL writers share one fragment: the stored marker + 1, an old record reads 0", { skip }, async () => {
  await seed("sql0");
  await seed("sql3", { version: 3 });
  await seed("sqlbad", { version: "x" });
  for (const id of ["sql0", "sql3", "sqlbad"]) await otherWrite(`payload = orbit_records.payload || ${contactNextVersionSql()}`, id);
  assert.equal((await stored("sql0")).payload.version, 1);
  assert.equal((await stored("sql3")).payload.version, 4);
  assert.equal((await stored("sqlbad")).payload.version, 1);
});

test("field write: every write goes up by one; the old value stays in fieldHistory", { skip }, async () => {
  const store = await seed("f1");
  await applyContactFieldValues({ actorId: "actor:a", contactId: "f1", source: "manual", store, values: { role: "采购部长" }, workspaceId: WS });
  assert.equal((await stored("f1")).payload.version, 1, "an old record without a version: first write is 1");
  const result = await applyContactFieldValues({ actorId: "actor:a", contactId: "f1", source: "manual", store, values: { organization: "东和商事" }, workspaceId: WS });
  const row = await stored("f1");
  assert.equal(row.payload.version, 2);
  assert.equal(result.version, 2, "the result says the new version");
  assert.deepEqual((row.payload.fieldHistory as { field: string; previous: string; next: string }[]).map((entry) => [entry.field, entry.previous, entry.next]), [["role", "设计总监", "采购部长"], ["organization", "青叶设计", "东和商事"]]);
});

test("expected version: a different stored version is a conflict — not retried, nothing written; the right one writes and goes up by one", { skip }, async () => {
  const base = await seed("f2", { version: 4 });
  let conditional = 0;
  const counting = { ...base, async updateRecordIfCurrent(...args: Parameters<NonNullable<typeof base.updateRecordIfCurrent>>) { conditional += 1; return base.updateRecordIfCurrent!(...args); } };
  await assert.rejects(
    applyContactFieldValues({ actorId: "actor:a", contactId: "f2", expectedVersion: 3, source: "manual", store: counting, values: { role: "x" }, workspaceId: WS }),
    (error: unknown) => error instanceof ContactFieldWriteError && error.code === "CONFLICT",
  );
  assert.equal(conditional, 0, "no write was tried");
  assert.equal((await stored("f2")).payload.role, "设计总监");
  assert.equal((await stored("f2")).payload.version, 4);
  // Another write lands between the read and the conditional update: with an expected version there is no retry.
  let raced = false;
  const racing = { ...base, async updateRecordIfCurrent(...args: Parameters<NonNullable<typeof base.updateRecordIfCurrent>>) {
    conditional += 1;
    if (!raced) {
      raced = true;
      await otherWrite(`payload = orbit_records.payload || '{"notes":"别处","version":5}'::jsonb, updated_at = '2026-11-01T00:00:30.000Z'`, "f2");
    }
    return base.updateRecordIfCurrent!(...args);
  } };
  conditional = 0;
  await assert.rejects(
    applyContactFieldValues({ actorId: "actor:a", contactId: "f2", expectedVersion: 4, source: "manual", store: racing, values: { role: "y" }, workspaceId: WS }),
    (error: unknown) => error instanceof ContactFieldWriteError && error.code === "CONFLICT",
  );
  assert.equal(conditional, 1, "one attempt, no retry");
  assert.equal((await stored("f2")).payload.role, "设计总监");
  const ok = await applyContactFieldValues({ actorId: "actor:a", contactId: "f2", expectedVersion: 5, source: "manual", store: base, values: { role: "采购部长" }, workspaceId: WS });
  assert.equal(ok.version, 6);
  assert.equal((await stored("f2")).payload.version, 6);
});

test("an old client without an expected version: as before — a race is re-read and retried, the version still goes up", { skip }, async () => {
  const base = await seed("f3", { version: 2 });
  let raced = false;
  const racing = { ...base, async updateRecordIfCurrent(...args: Parameters<NonNullable<typeof base.updateRecordIfCurrent>>) {
    if (!raced) {
      raced = true;
      await otherWrite(`payload = orbit_records.payload || '{"notes":"别处","version":3}'::jsonb, updated_at = '2026-11-01T00:00:30.000Z'`, "f3");
    }
    return base.updateRecordIfCurrent!(...args);
  } };
  await applyContactFieldValues({ actorId: "actor:a", contactId: "f3", source: "manual", store: racing, values: { role: "部长" }, workspaceId: WS });
  const row = await stored("f3");
  assert.equal(row.payload.role, "部长");
  assert.equal(row.payload.notes, "别处");
  assert.equal(row.payload.version, 4);
});

test("soft delete and restore go up by one each; nothing else of the row's payload changes", { skip }, async () => {
  await seed("d1", { version: 1 });
  const service = createContactDeleteService({ client, now: () => new Date("2026-11-02T00:00:00.000Z"), workspaceId: WS });
  await service.remove("actor:a", "d1");
  assert.equal((await stored("d1")).payload.version, 2);
  assert.equal((await stored("d1")).lifecycle_state, "deleted");
  await service.remove("actor:a", "d1");
  assert.equal((await stored("d1")).payload.version, 2, "a replayed delete writes nothing");
  await service.restore("actor:a", "d1");
  assert.equal((await stored("d1")).payload.version, 3);
  assert.equal((await stored("d1")).payload.organization, "青叶设计");
});

test("the other store writers go up by one: card merge, contact save (new 1, over a stored one +1), graph provider edits, invite fields, archive", { skip }, async () => {
  const store = await seed("m1", { version: 2 });
  await mergeCardIntoContact({ actorId: "actor:a", card: { address: "", displayName: "n m1", email: "", organization: "青叶设计", phone: "", role: "" }, cardNotes: "", contactId: "m1", evidenceIds: ["e2"], store, workspaceId: WS });
  assert.equal((await stored("m1")).payload.version, 3);

  const writer = createStorageBusinessCardContactWriteProvider({ store, workspaceId: WS });
  const contact: ContactDTO = { createdAt: T, displayName: "新的人", evidenceIds: ["e"], id: "s1", source: { id: "s", label: "x", type: "manual" }, stage: "captured", updatedAt: T };
  await writer.saveContact(contact, "actor:a");
  assert.equal((await stored("s1")).payload.version, 1, "a new contact");
  await writer.saveContact({ ...contact, role: "顾问", updatedAt: "2026-11-01T00:01:00.000Z" }, "actor:a");
  assert.equal((await stored("s1")).payload.version, 2, "saved over a stored one");

  const graph = createStorageContactGraphProvider({ store, workspaceId: WS });
  await graph.updateContactPrimaryIndustry!("m1", "actor:a", null);
  assert.equal((await stored("m1")).payload.version, 4);
  await graph.updateContactEnrichment!("m1", "actor:a", { seniorityLevel: null });
  assert.equal((await stored("m1")).payload.version, 5);

  await writeInviteFields({ actorId: "actor:a", contactId: "m1", now: () => new Date("2026-11-03T00:00:00.000Z"), source: "invite", store, values: { offering: "设计" } as never, workspaceId: WS });
  assert.equal((await stored("m1")).payload.version, 6);

  const archive = createStorageContactArchiveActionWriter({ store, workspaceId: WS });
  await archive.archiveContacts({ batchId: "b1", contacts: [{ displayName: "归档的人", id: "a1" }], evidenceIds: ["e"], now: T });
  assert.equal((await stored("a1")).payload.version, 1);
});
