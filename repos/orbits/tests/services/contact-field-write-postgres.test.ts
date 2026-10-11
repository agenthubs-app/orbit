/** R12 `applyContactFieldValues`：真实 PostgreSQL 往返（随机 schema；只连本机回环库）。 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { applyContactFieldValues, ContactFieldWriteError } from "../../features/contacts/contact-field-write";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";

const WS = "workspace:field-write-pg";
const schema = `field_write_${randomUUID().replaceAll("-", "")}`;
let admin: Pool;
let pool: Pool;

before(async () => {
  if (!databaseUrl) return;
  assertLoopbackDatabaseUrl(databaseUrl);
  await migrateConfiguredTestDatabase();
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  pool = new Pool({ connectionString: databaseUrl, max: 2, options: `-c search_path=${schema}` });
  const client = await pool.connect();
  try {
    await runOrbitRecordsMigration(client);
  } finally {
    client.release();
  }
});

after(async () => {
  if (!databaseUrl) return;
  await pool?.end();
  await admin?.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
  await admin?.end();
});

test("field overwrite and history round-trip through PostgreSQL; a stale write retries; other owners are not found", databaseTest, async () => {
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client: pool });
  const at = "2026-10-11T00:00:00.000Z";
  await store.upsertRecord({
    collectionName: "contacts", createdAt: at, evidenceIds: ["evidence:x"], lifecycleState: "active",
    payload: { id: "c1", displayName: "山田 太郎", organization: "Acme", primaryEmail: "taro@acme.jp", createdAt: at, updatedAt: at },
    recordId: "c1", sourceId: "s", sourceType: "manual", updatedAt: at, userId: "actor:alice", workspaceId: WS,
  });
  // 另一个写入在两次之间改了备注：第一次条件更新失败，重读后成功，备注保留。
  let raced = false;
  const racing = {
    ...store,
    async updateRecordIfCurrent(record: Parameters<NonNullable<typeof store.updateRecordIfCurrent>>[0], expected: Parameters<NonNullable<typeof store.updateRecordIfCurrent>>[1]) {
      if (!raced) {
        raced = true;
        await pool.query(`update orbit_records set payload = payload || '{"notes":"他の端末"}'::jsonb, updated_at = '2026-10-11T00:00:30.000Z' where record_id = 'c1'`);
      }
      return store.updateRecordIfCurrent!(record, expected);
    },
  };
  const result = await applyContactFieldValues({
    actorId: "actor:alice", contactId: "c1", now: () => new Date("2026-10-11T01:00:00.000Z"), source: "manual", store: racing,
    values: { email: null, organization: "Beta" }, workspaceId: WS,
  });
  assert.deepEqual(result.changed, ["organization", "email"]);
  const row = (await pool.query(`select payload, updated_at, search_text from orbit_records where record_id = 'c1'`)).rows[0];
  assert.equal(row.payload.organization, "Beta");
  assert.equal(row.payload.primaryEmail, undefined);
  assert.equal(row.payload.notes, "他の端末");
  assert.equal(row.payload.fieldHistory.length, 2);
  assert.match(row.search_text, /Beta/);
  await assert.rejects(
    applyContactFieldValues({ actorId: "actor:bob", contactId: "c1", source: "manual", store, values: { role: "x" }, workspaceId: WS }),
    (error: unknown) => error instanceof ContactFieldWriteError && error.code === "NOT_FOUND",
  );
});
