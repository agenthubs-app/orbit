/**
 * R12 手入力：真实 PostgreSQL 往返（随机 schema，用完即删；只连本机回环库）。
 * 新建 → 计划候补入队（当天任务 + 来源表）→ 幂等重放 → 统合（字段历史）→ 撤销（墓碑 + 撤掉待处理任务与候补）。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { createPostgresManualContactV2Storage } from "../../features/contacts/manual-contact-v2/configured";
import { createManualContactV2Service, ManualContactV2Error } from "../../features/contacts/manual-contact-v2/service";
import { runPlanMatchingMigrations } from "../../features/plans/matching-migrations";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresPool } from "../../shared/storage/transactional-postgres";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";

const WS = "workspace:manual-v2-pg";
const ALICE = "actor:alice";
const schema = `manual_v2_${randomUUID().replaceAll("-", "")}`;
let admin: Pool;
let pool: Pool;

before(async () => {
  if (!databaseUrl) return;
  assertLoopbackDatabaseUrl(databaseUrl);
  await migrateConfiguredTestDatabase();
  admin = new Pool({ connectionString: databaseUrl, max: 1 });
  await admin.query(`create schema ${schema}`);
  pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema} -c statement_timeout=10000` });
  const client = await pool.connect();
  try {
    await runOrbitRecordsMigration(client);
  } finally {
    client.release();
  }
  await runPlanMatchingMigrations(pool);
});

after(async () => {
  if (!databaseUrl) return;
  await pool?.end();
  await admin?.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
  await admin?.end();
});

test("create → plan-match job → replay → merge with history → undo tombstones and cancels pending work", databaseTest, async () => {
  let now = new Date();
  const client = createTransactionalPostgresClient({ connectionString: databaseUrl!, pool: pool as unknown as TransactionalPostgresPool });
  const service = createManualContactV2Service({ now: () => now, storage: createPostgresManualContactV2Storage({ client, workspaceId: WS }) });

  const created = await service.create(ALICE, { displayName: "高橋 花子", idempotencyKey: "pg-1", organization: "Tokyo Trading" });
  assert.equal(created.outcome, "created");
  const contactId = created.contactId!;
  const row = (await pool.query(`select user_id, lifecycle_state, source_type, payload from orbit_records where collection_name = 'contacts' and record_id = $1`, [contactId])).rows[0];
  assert.equal(row.user_id, ALICE);
  assert.equal(row.source_type, "manual");
  assert.equal(row.payload.createdVia, "manual_v2");

  const job = (await pool.query(`select id, source_kind, contact_ids, batch_ids, status from plan_match_jobs where workspace_id = $1 and actor_id = $2`, [WS, ALICE])).rows;
  assert.equal(job.length, 1);
  assert.equal(job[0].source_kind, "day");
  assert.deepEqual(job[0].contact_ids, [contactId]);
  assert.deepEqual(job[0].batch_ids, [`manual-contact:${contactId}`]);
  const sources = (await pool.query(`select contact_id from plan_match_job_contacts where job_id = $1`, [job[0].id])).rows;
  assert.deepEqual(sources.map((r) => r.contact_id), [contactId]);

  assert.deepEqual(await service.create(ALICE, { displayName: "高橋 花子", idempotencyKey: "pg-1", organization: "Tokyo Trading" }), created);
  await assert.rejects(service.create(ALICE, { displayName: "別人", idempotencyKey: "pg-1" }), (error: unknown) => error instanceof ManualContactV2Error && error.code === "IDEMPOTENCY_CONFLICT");

  // 同名提示（只填名字）→ 统合进一个已有的人（另一个联系人，统合不影响撤销对象）。
  const second = await service.create(ALICE, { allowDuplicate: true, displayName: "鈴木 一郎", idempotencyKey: "pg-2" });
  const review = await service.create(ALICE, { displayName: "鈴木一郎", idempotencyKey: "pg-3", organization: "Sakura" });
  assert.equal(review.outcome, "duplicate_review");
  assert.deepEqual(review.candidates?.map((c) => [c.contactId, c.matchedOn]), [[second.contactId, ["name"]]]);
  const merged = await service.create(ALICE, { displayName: "鈴木一郎", fieldChoices: { displayName: "existing" }, idempotencyKey: "pg-3", mergeIntoContactId: second.contactId!, organization: "Sakura" });
  assert.equal(merged.outcome, "merged");
  const mergedPayload = (await pool.query(`select payload from orbit_records where record_id = $1`, [second.contactId])).rows[0].payload;
  assert.equal(mergedPayload.organization, "Sakura");
  assert.equal(mergedPayload.displayName, "鈴木 一郎");
  assert.deepEqual(mergedPayload.fieldHistory.map((e: { field: string; previous: string | null }) => [e.field, e.previous]), [["organization", null]]);

  // 撤销之前，这个人已经有一条待确认的候补（例如同一天的任务提前跑过）。
  await pool.query(
    `insert into plan_match_candidates (workspace_id, id, actor_id, job_id, plan_id, need_item_id, contact_id, tier, strength)
     values ($1, 'cand-1', $2, $3, 'plan-1', 'need-1', $4, 'rule', 'candidate')`,
    [WS, ALICE, job[0].id, contactId],
  );
  now = new Date(now.getTime() + 60_000);
  assert.deepEqual(await service.undo(ALICE, contactId), { outcome: "undone" });
  const tombstone = (await pool.query(`select lifecycle_state, deleted_at from orbit_records where record_id = $1`, [contactId])).rows[0];
  assert.equal(tombstone.lifecycle_state, "deleted");
  assert.ok(tombstone.deleted_at);
  const remaining = (await pool.query(`select contact_ids, batch_ids from plan_match_jobs where id = $1`, [job[0].id])).rows[0];
  assert.ok(!remaining.contact_ids.includes(contactId), "the undone contact left the pending job");
  assert.ok(!remaining.batch_ids.includes(`manual-contact:${contactId}`));
  assert.ok(remaining.contact_ids.includes(second.contactId), "other contacts of the same day stay queued");
  assert.equal((await pool.query(`select count(*)::int as n from plan_match_job_contacts where contact_id = $1`, [contactId])).rows[0].n, 0);
  assert.equal((await pool.query(`select count(*)::int as n from plan_match_candidates where contact_id = $1`, [contactId])).rows[0].n, 0);

  // 当天任务里只有被撤销的这个人时，任务本身也删掉。
  const lone = await service.create("actor:carol", { displayName: "Lone", idempotencyKey: "pg-4" });
  await service.undo("actor:carol", lone.contactId!);
  assert.equal((await pool.query(`select count(*)::int as n from plan_match_jobs where actor_id = 'actor:carol'`)).rows[0].n, 0);
});
