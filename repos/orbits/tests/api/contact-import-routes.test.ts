/**
 * W0053 SC-W0053-01（隔离、上限、坏行）／SC-W0053-02（去重与确认、幂等、合并规则）——路由 + 仓储，真实 PostgreSQL。
 * 只连 `ORBIT_EVENT_DATABASE_URL` 指向的本机测试库，每个用例在随机 schema 里建表、用完即删；地址不是本机回环时直接失败。
 * 三层更新入口在这里是记录调用的桩（入口本身的行为见 tests/services/contact-import-layers-postgres.test.ts）。
 * 夹具全部为虚构数据。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { Pool } from "pg";

import { createContactImportHandlers } from "../../app/api/contacts/import/handlers";
import { CONTACT_IMPORT_MAX_BYTES } from "../../features/contacts/import/limits";
import { createContactImportMaintenanceTask } from "../../features/contacts/import/maintenance-task";
import { runContactImportMigrations } from "../../features/contacts/import/migrations";
import { createContactImportService, importContactId, type RunImportLayers } from "../../features/contacts/import/service";
import type { RunNewContactLayersInput } from "../../features/network-analysis/new-contact-layers";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient } from "../../shared/storage/transactional-postgres";

const databaseUrl = process.env.ORBIT_EVENT_DATABASE_URL;
const databaseTest = { skip: databaseUrl ? false : "ORBIT_EVENT_DATABASE_URL is not configured" };
const WORKSPACE = "workspace:contact-import-routes-test";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const ALICE = "actor:alice";
const BOB = "actor:bob";
const NOW = new Date("2026-10-03T03:00:00.000Z");

const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`../fixtures/contact-import/${name}`, import.meta.url)));
const utf8 = (text: string) => new TextEncoder().encode(text);

function assertLoopbackDatabaseUrl(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    assert.fail("ORBIT_EVENT_DATABASE_URL is not a valid URL.");
  }
  assert.ok(LOOPBACK_HOSTS.has(hostname), "ORBIT_EVENT_DATABASE_URL must point at a loopback PostgreSQL.");
}

interface Harness {
  pool: Pool;
  service: ReturnType<typeof createContactImportService>;
  client: ReturnType<typeof createTransactionalPostgresClient>;
  clock: { now: Date };
  /** 同一个库上另起一个服务实例（模拟另一个进程；可包一层会「崩溃」的连接）。 */
  serviceWith(wrap: (client: ReturnType<typeof createTransactionalPostgresClient>) => ReturnType<typeof createTransactionalPostgresClient>): ReturnType<typeof createContactImportService>;
  as(actorId: string): ReturnType<typeof createContactImportHandlers>;
  settle(): Promise<void>;
}

const DONE: Awaited<ReturnType<RunImportLayers>> = { deferredContactIds: [], enrichment: "done", operations: 0, planMatch: "enqueued", snapshot: "fresh", writtenContacts: 0 };

async function withDatabase(run: (harness: Harness) => Promise<void>, runLayers: RunImportLayers = async () => DONE): Promise<void> {
  assert.ok(databaseUrl);
  assertLoopbackDatabaseUrl(databaseUrl);
  const schema = `contact_import_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2000, max: 8, options: `-c search_path=${schema} -c statement_timeout=10000` });
  try {
    await admin.query(`create schema ${schema}`);
    await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    await runContactImportMigrations(pool);
    await runContactImportMigrations(pool); // 重复执行是空操作（checksum 守卫）
    const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as never });
    const scheduled: Promise<void>[] = [];
    const clock = { now: NOW };
    const serviceWith = (wrap: (base: typeof client) => typeof client) => createContactImportService({
      client: wrap(client), log: () => undefined, now: () => clock.now, runLayers, schedule: () => undefined, workspaceId: WORKSPACE,
    });
    const service = createContactImportService({
      client,
      log: () => undefined,
      now: () => clock.now,
      runLayers,
      schedule: (task) => {
        scheduled.push(task());
      },
      workspaceId: WORKSPACE,
    });
    const as = (actorId: string) => createContactImportHandlers({ resolveActor: async () => ({ id: actorId }) as never, schedule: () => undefined, service: () => service });
    await run({ as, client, clock, pool, service, serviceWith, settle: async () => void (await Promise.all(scheduled.splice(0))) });
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
}

function uploadRequest(bytes: Uint8Array, options: { kind?: string; key?: string; fileName?: string } = {}): Request {
  return new Request("http://localhost/api/contacts/import", {
    body: bytes,
    headers: {
      "content-type": "application/octet-stream",
      "idempotency-key": options.key ?? randomUUID(),
      "x-orbit-import-file-name": encodeURIComponent(options.fileName ?? "Connections.csv"),
      "x-orbit-import-kind": options.kind ?? "csv",
    },
    method: "POST",
  });
}

const params = (id: string) => ({ params: Promise.resolve({ id: encodeURIComponent(id) }) });
const jsonRequest = (method: string, payload: unknown) => new Request("http://localhost/x", { body: JSON.stringify(payload), headers: { "content-type": "application/json" }, method });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function body(response: Response): Promise<any> {
  return response.json();
}

async function upload(h: Harness, actor: string, bytes: Uint8Array, options: Parameters<typeof uploadRequest>[1] = {}) {
  const response = await h.as(actor).upload(uploadRequest(bytes, options));
  const parsed = await body(response);
  return { batch: parsed.data?.batch, error: parsed.error, replayed: parsed.data?.replayed, status: response.status };
}

async function commit(h: Harness, actor: string, batchId: string, mergeConfirmations: unknown[], intent: string = randomUUID()) {
  const response = await h.as(actor).commit(jsonRequest("POST", { confirmationIntentId: intent, mergeConfirmations }), params(batchId));
  return { body: await body(response), status: response.status };
}

async function rows(h: Harness, actor: string, batchId: string, query = "") {
  return (await body(await h.as(actor).rows(new Request(`http://localhost/x${query}`), params(batchId)))).data.rows;
}

async function contactCount(pool: Pool, actor: string): Promise<number> {
  const result = await pool.query("select count(*)::int as n from orbit_records where collection_name = 'contacts' and user_id = $1 and lifecycle_state = 'active'", [actor]);
  return result.rows[0].n;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function contactPayload(pool: Pool, id: string): Promise<Record<string, any>> {
  return (await pool.query("select payload from orbit_records where collection_name = 'contacts' and record_id = $1", [id])).rows[0]?.payload;
}

async function seedContact(pool: Pool, actor: string, id: string, payload: Record<string, unknown>): Promise<void> {
  await pool.query(
    `insert into orbit_records (workspace_id, collection_name, record_id, user_id, source_type, source_id, lifecycle_state, payload, evidence_ids, created_at, updated_at)
     values ($1, 'contacts', $2, $3, 'manual', 'import-test', 'active', $4::jsonb, array['evidence:seed'], '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z')`,
    [WORKSPACE, id, actor, JSON.stringify({ createdAt: "2026-09-01T00:00:00.000Z", evidenceIds: ["evidence:seed"], id, source: { id: "seed", type: "manual" }, stage: "captured", updatedAt: "2026-09-01T00:00:00.000Z", ...payload })],
  );
}

test("SC-01 upload: LinkedIn file becomes an actor-scoped batch with normalized rows; replay returns the same batch; another actor gets 404 on every batch route", databaseTest, async () => {
  await withDatabase(async (h) => {
    const key = randomUUID();
    const first = await upload(h, ALICE, fixture("linkedin-connections.csv"), { key });
    assert.equal(first.status, 201);
    assert.equal(first.batch.kind, "csv");
    assert.equal(first.batch.format, "linkedin");
    assert.equal(first.batch.fileName, "Connections.csv");
    assert.equal(first.batch.status, "reviewing");
    assert.equal(first.batch.rowCount, 4);
    const review = first.batch.review;
    assert.deepEqual(
      { blocked: review.blocked, create: review.create, merge: review.merge, skip: review.skip, undecided: review.undecided },
      { blocked: 1, create: 3, merge: 0, skip: 1, undecided: 0 },
    );
    const replay = await upload(h, ALICE, fixture("linkedin-connections.csv"), { key });
    assert.equal(replay.status, 200);
    assert.equal(replay.replayed, true);
    assert.equal(replay.batch.id, first.batch.id);

    const listed = await rows(h, ALICE, first.batch.id, "?filter=all");
    assert.equal(listed.length, 4);
    assert.equal(listed[0].fields.displayName, "Avery Lin");
    assert.equal(listed[0].decision, "create");
    assert.deepEqual(listed[3].issues, ["missing_name"]);
    assert.equal(listed[3].decision, "skip");

    const bob = h.as(BOB);
    for (const response of [
      await bob.get(new Request("http://localhost/x"), params(first.batch.id)),
      await bob.rows(new Request("http://localhost/x"), params(first.batch.id)),
      await bob.decide(jsonRequest("PATCH", { decisions: [{ decision: "skip", seq: 1 }] }), params(first.batch.id)),
      await bob.remap(jsonRequest("PATCH", { mapping: { name: 0 } }), params(first.batch.id)),
      await bob.commit(jsonRequest("POST", { confirmationIntentId: "x", mergeConfirmations: [] }), params(first.batch.id)),
      await bob.cancel(new Request("http://localhost/x", { method: "POST" }), params(first.batch.id)),
    ]) {
      assert.equal(response.status, 404);
    }
    assert.deepEqual((await body(await bob.list())).data.batches, []);
    assert.equal((await body(await h.as(ALICE).list())).data.batches.length, 1);
  });
});

test("SC-01 limits: an oversize body is refused with 413 before it is read to the end; too many rows 413; bad rows carry reasons and do not block the rest", databaseTest, async () => {
  await withDatabase(async (h) => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 100) return controller.close();
        controller.enqueue(new Uint8Array(1024 * 1024));
      },
    });
    const streamed = await h.as(ALICE).upload(new Request("http://localhost/api/contacts/import", {
      body: stream, duplex: "half", headers: { "idempotency-key": "big", "x-orbit-import-kind": "csv" }, method: "POST",
    } as RequestInit));
    assert.equal(streamed.status, 413);
    assert.equal((await body(streamed)).error.context.reason, "too_large");
    assert.ok(pulled <= 8, `reader stopped early (pulled ${pulled} MiB chunks)`);
    const declared = await h.as(ALICE).upload(new Request("http://localhost/api/contacts/import", {
      body: utf8("Name\nA"), headers: { "content-length": String(CONTACT_IMPORT_MAX_BYTES + 1), "idempotency-key": "declared", "x-orbit-import-kind": "csv" }, method: "POST",
    }));
    assert.equal(declared.status, 413);

    // review P2-1：2,001 行之后对方还在持续传输（总量远小于 5 MB）——服务端数到上限就停止读取并拒绝。
    let rowPulls = 0;
    const header = utf8(`Name,Email\n${Array.from({ length: 2001 }, (_, i) => `P${i},p${i}@example.com`).join("\n")}\n`);
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        rowPulls += 1;
        if (rowPulls === 1) return controller.enqueue(header);
        if (rowPulls > 400) return controller.close();
        controller.enqueue(utf8(`More ${rowPulls},m${rowPulls}@example.com\n`));
      },
    });
    const streamedRows = await h.as(ALICE).upload(new Request("http://localhost/api/contacts/import", {
      body: endless, duplex: "half", headers: { "idempotency-key": "rows", "x-orbit-import-kind": "csv" }, method: "POST",
    } as RequestInit));
    assert.equal(streamedRows.status, 413);
    assert.equal((await body(streamedRows)).error.context.reason, "too_many_rows");
    assert.ok(rowPulls < 10, `stopped reading early (pulled ${rowPulls} chunks)`);

    const tooMany = await upload(h, ALICE, utf8(`Name\n${Array.from({ length: 2001 }, (_, i) => `P${i}`).join("\n")}`));
    assert.equal(tooMany.status, 413);
    assert.equal(tooMany.error.context.reason, "too_many_rows");

    const mixed = await upload(h, ALICE, utf8("Name,Email\nGood One,good@example.com\n,orphan@example.com\nBad Mail,not-an-email\n"));
    assert.equal(mixed.status, 201);
    assert.equal(mixed.batch.review.blocked, 1);
    assert.equal(mixed.batch.review.issues, 2);
    const issues = await rows(h, ALICE, mixed.batch.id, "?filter=issues");
    assert.deepEqual(issues.map((row: { seq: number; issues: string[] }) => [row.seq, row.issues]), [[2, ["missing_name"]], [3, ["invalid_email"]]]);
    const done = await commit(h, ALICE, mixed.batch.id, []);
    assert.equal(done.status, 200);
    assert.deepEqual(done.body.data.batch.counts, { created: 2, failed: 1, merged: 0, skipped: 0 });
    assert.equal(await contactCount(h.pool, ALICE), 2);
    assert.equal(await contactCount(h.pool, BOB), 0);
  });
});

test("SC-02 same file twice: second batch pre-selects merge for every row (identical), refuses a commit whose merges are not confirmed, then merges with 0 new contacts", databaseTest, async () => {
  await withDatabase(async (h) => {
    const first = await upload(h, ALICE, fixture("linkedin-connections.csv"));
    const created = await commit(h, ALICE, first.batch.id, []);
    assert.equal(created.status, 200);
    assert.deepEqual(created.body.data.batch.counts, { created: 3, failed: 1, merged: 0, skipped: 0 });
    assert.equal(await contactCount(h.pool, ALICE), 3);
    const avery = await contactPayload(h.pool, importContactId(ALICE, first.batch.id, 1));
    assert.equal(avery.displayName, "Avery Lin");
    assert.deepEqual(avery.source, { id: first.batch.id, label: "CSV 导入", type: "external_contacts" });
    assert.match(avery.notes, /LinkedIn: https:\/\/www\.linkedin\.com\/in\/avery-lin-example/);

    const second = await upload(h, ALICE, fixture("linkedin-connections.csv"));
    assert.equal(second.batch.review.merge, 3);
    assert.equal(second.batch.review.create, 0);
    assert.equal(second.batch.review.undecided, 0);
    const duplicates = await rows(h, ALICE, second.batch.id, "?filter=duplicates");
    assert.equal(duplicates.length, 3);
    for (const row of duplicates) {
      assert.equal(row.decision, "merge");
      assert.equal(row.candidate.identical, true);
      assert.ok(row.candidate.matchedOn.length >= 1, "match reason is shown");
    }
    assert.deepEqual(duplicates[0].candidate.matchedOn, ["email", "name_organization"]);

    const unconfirmed = await commit(h, ALICE, second.batch.id, []);
    assert.equal(unconfirmed.status, 409);
    assert.equal(unconfirmed.body.error.context.reason, "MERGE_NOT_CONFIRMED");
    const confirmations = second.batch.review.mergeConfirmations as { seq: number; contactId: string }[];
    const wrongTarget = await commit(h, ALICE, second.batch.id, confirmations.map((entry, index) => (index === 0 ? { ...entry, contactId: "contact:someone-else" } : entry)));
    assert.equal(wrongTarget.status, 409);
    const merged = await commit(h, ALICE, second.batch.id, confirmations);
    assert.equal(merged.status, 200);
    assert.deepEqual(merged.body.data.batch.counts, { created: 0, failed: 1, merged: 3, skipped: 0 });
    assert.equal(await contactCount(h.pool, ALICE), 3, "0 new contacts");
  });
});

test("SC-02 idempotent commit: replaying the same intent writes nothing and returns the same batch; another intent is refused; stable ids per (actor, batch, seq)", databaseTest, async () => {
  await withDatabase(async (h) => {
    const batch = (await upload(h, ALICE, fixture("contacts-mixed.vcf"), { fileName: "iCloud.vcf", kind: "vcard" })).batch;
    assert.equal(batch.kind, "vcard");
    const intent = randomUUID();
    const first = await commit(h, ALICE, batch.id, [], intent);
    assert.equal(first.status, 200);
    assert.equal(first.body.data.replayed, false);
    const replay = await commit(h, ALICE, batch.id, [], intent);
    assert.equal(replay.status, 200);
    assert.equal(replay.body.data.replayed, true);
    assert.deepEqual(replay.body.data.batch.counts, first.body.data.batch.counts);
    assert.equal(await contactCount(h.pool, ALICE), 3);
    const other = await commit(h, ALICE, batch.id, [], randomUUID());
    assert.equal(other.status, 409);
    assert.equal(other.body.error.context.reason, "INTENT_CONFLICT");
    const tanaka = await contactPayload(h.pool, importContactId(ALICE, batch.id, 1));
    assert.equal(tanaka.displayName, "田中 一郎");
    assert.deepEqual(tanaka.source, { id: batch.id, label: "vCard 导入", type: "external_contacts" });
    assert.deepEqual(tanaka.region, { city: "Tokyo", countryCode: "JP" });
    assert.equal(tanaka.enrichment.fields.region.origin, "card");
    assert.notEqual(importContactId(ALICE, batch.id, 1), importContactId(BOB, batch.id, 1));
  });
});

test("SC-02 in-file duplicates create one contact; a non-identical candidate must be decided before commit; merge fills blanks, conflicts go to an 「导入补充」 note, user-sourced region is kept", databaseTest, async () => {
  await withDatabase(async (h) => {
    await seedContact(h.pool, ALICE, "contact:existing-kim", {
      displayName: "Kim Park",
      enrichment: { fields: { region: { origin: "user", updatedAt: "2026-09-01T00:00:00.000Z", via: "contact_edit" } }, version: 1 },
      organization: "Old Corp",
      primaryEmail: "kim@example.com",
      region: { city: "Seoul", countryCode: "KR" },
    });
    const csv = "Name,Company,Title,Email,Phone,Country\nKim Park,New Corp,Director,kim@example.com,+82 10 0000 0000,Japan\nDana Wu,Initech,PM,dana@example.com,,\nDana Wu (dup),Initech,PM,DANA@example.com,,\n";
    const batch = (await upload(h, ALICE, utf8(csv))).batch;
    assert.equal(batch.review.undecided, 1);
    assert.equal(batch.review.inFileDuplicates, 1);
    const listed = await rows(h, ALICE, batch.id);
    assert.equal(listed[0].decision, null, "non-identical candidate must be chosen");
    assert.equal(listed[0].candidate.contactId, "contact:existing-kim");
    assert.deepEqual(listed[0].candidate.matchedOn, ["email"]);
    assert.equal(listed[2].inFileDuplicateOf, 2);
    assert.equal(listed[2].decision, "skip");

    const blocked = await commit(h, ALICE, batch.id, []);
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.context.reason, "UNDECIDED_ROWS");
    const decided = await body(await h.as(ALICE).decide(jsonRequest("PATCH", { decisions: [{ decision: "merge", seq: 1 }, { decision: "merge", seq: 2 }] }), params(batch.id)));
    assert.deepEqual(decided.data.updated, [1], "a row without a candidate cannot be merged");
    const done = await commit(h, ALICE, batch.id, decided.data.batch.review.mergeConfirmations);
    assert.equal(done.status, 200);
    assert.deepEqual(done.body.data.batch.counts, { created: 1, failed: 0, merged: 1, skipped: 1 });
    assert.equal(await contactCount(h.pool, ALICE), 2);
    const kim = await contactPayload(h.pool, "contact:existing-kim");
    assert.equal(kim.organization, "Old Corp", "existing value is not overwritten");
    assert.equal(kim.role, "Director", "blank filled");
    assert.equal(kim.primaryPhone, "+82 10 0000 0000");
    assert.match(kim.notes, /^导入补充 · 2026-10-03\n公司: New Corp/);
    assert.deepEqual(kim.region, { city: "Seoul", countryCode: "KR" }, "user region kept");
    assert.ok(kim.evidenceIds.includes(`evidence:contact-import:${batch.id}:1`));
  });
});

test("SC-02 remap and cancel: unknown headers map nothing until the user maps columns; cancelled batches cannot be committed", databaseTest, async () => {
  await withDatabase(async (h) => {
    const batch = (await upload(h, ALICE, utf8("Col A,Col B,Col C\nLee Min,Globex,lee@example.com\n"))).batch;
    assert.equal(batch.review.blocked, 1);
    const invalid = await h.as(ALICE).remap(jsonRequest("PATCH", { mapping: { name: 9 } }), params(batch.id));
    assert.equal(invalid.status, 400);
    const remapped = (await body(await h.as(ALICE).remap(jsonRequest("PATCH", { mapping: { email: 2, name: 0, organization: 1 } }), params(batch.id)))).data.batch;
    assert.equal(remapped.review.blocked, 0);
    assert.equal(remapped.review.create, 1);
    assert.equal(remapped.mapping.email, 2);
    assert.equal((await rows(h, ALICE, batch.id))[0].fields.organization, "Globex");
    const cancelled = (await body(await h.as(ALICE).cancel(new Request("http://localhost/x", { method: "POST" }), params(batch.id)))).data.batch;
    assert.equal(cancelled.status, "cancelled");
    const late = await commit(h, ALICE, batch.id, []);
    assert.equal(late.status, 409);
    assert.equal(await contactCount(h.pool, ALICE), 0);
  });
});

test("SC-03 wiring: one layers call per write transaction (≤200 rows) with a per-transaction source key; an entry failure keeps contacts and marks the batch for retry; retry re-runs only the entry; deferral is surfaced", databaseTest, async () => {
  let fail = true;
  const calls: RunNewContactLayersInput[] = [];
  await withDatabase(async (h) => {
    const csv = `Name,Email\n${Array.from({ length: 450 }, (_, i) => `Person ${i},p${i}@example.com`).join("\n")}\n`;
    const batch = (await upload(h, ALICE, utf8(csv))).batch;
    const done = await commit(h, ALICE, batch.id, []);
    assert.equal(done.status, 200);
    await h.settle();
    assert.equal(await contactCount(h.pool, ALICE), 450, "contacts stay written although the entry failed");
    assert.equal(calls.length, 1, "stopped at the first failing transaction");
    const afterFailure = (await body(await h.as(ALICE).get(new Request("http://localhost/x"), params(batch.id)))).data.batch;
    assert.equal(afterFailure.followUp.state, "retry");

    fail = false;
    // 重试：同一个提交意图重放（维护任务走同一个 runPendingLayers）只重跑入口，不再写联系人。
    const updatedBefore = (await h.pool.query("select max(updated_at) as t from orbit_records where collection_name = 'contacts'")).rows[0].t;
    const intent = (await h.pool.query("select commit_intent_id from contact_import_batches where id = $1", [batch.id])).rows[0].commit_intent_id;
    const replay = await commit(h, ALICE, batch.id, [], intent);
    assert.equal(replay.status, 200);
    await h.settle();
    assert.deepEqual(calls.map((call) => [call.sourceKey, call.contactIds.length]), [
      [`contact-import:${batch.id}:0`, 200],
      [`contact-import:${batch.id}:0`, 200],
      [`contact-import:${batch.id}:1`, 200],
      [`contact-import:${batch.id}:2`, 50],
    ]);
    assert.ok(calls.every((call) => call.actorId === ALICE));
    assert.equal(new Set(calls.slice(1).flatMap((call) => call.contactIds)).size, 450);
    const updatedAfter = (await h.pool.query("select max(updated_at) as t from orbit_records where collection_name = 'contacts'")).rows[0].t;
    assert.deepEqual(updatedAfter, updatedBefore, "retry did not rewrite contacts");
    const final = (await body(await h.as(ALICE).get(new Request("http://localhost/x"), params(batch.id)))).data.batch;
    assert.equal(final.followUp.state, "done");
    assert.equal(final.followUp.enrichmentDeferredUntil, "2026-10-03T15:00:00.000Z", "entry deferral surfaces as 「补全明天继续」");
    assert.equal(await contactCount(h.pool, ALICE), 450);
  }, async (input) => {
    calls.push(input);
    if (fail) throw new Error("entry down");
    return { ...DONE, enrichment: input.sourceKey.endsWith(":2") ? "deferred" : "done", retryOn: "2026-10-03T15:00:00.000Z" };
  });
});

test("W53-6 maintenance: parsed rows are deleted 7 days after the batch ends (summary kept, unfinished batches expire); a failed follow-up is retried from its own task row", databaseTest, async () => {
  let calls = 0;
  await withDatabase(async (h) => {
    const done = (await upload(h, ALICE, fixture("linkedin-connections.csv"))).batch;
    await commit(h, ALICE, done.id, []);
    const open = (await upload(h, ALICE, utf8("Name\nSolo Person\n"))).batch;
    // 请求结束后的 after() 调入口失败：批次挂 retry；把时间拨到 8 天后跑维护任务。
    await h.settle();
    assert.equal((await h.pool.query("select layers_status from contact_import_batches where id = $1", [done.id])).rows[0].layers_status, "retry");
    const task = createContactImportMaintenanceTask({ resolve: () => ({ client: h.client, service: h.service }) });
    h.clock.now = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const summary = await task.run({ deadline: Date.now() + 30_000, now: () => h.clock.now });
    assert.deepEqual(summary, { done: 1, purged: 2, resumed: 0, retry: 0 });
    assert.equal(calls, 2, "one failed after() call + one maintenance retry");
    assert.equal((await h.pool.query("select count(*)::int as n from contact_import_rows")).rows[0].n, 0);
    const batches = (await h.pool.query("select id, status, rows_purged_at is not null as purged, counts from contact_import_batches order by status")).rows;
    assert.deepEqual(batches.map((row) => [row.id, row.status, row.purged]), [[done.id, "completed", true], [open.id, "expired", true]]);
    assert.equal(batches[0].counts.created, 3, "summary kept for the import log");
    assert.equal(await contactCount(h.pool, ALICE), 3, "contacts are not affected");
    const view = (await body(await h.as(ALICE).get(new Request("http://localhost/x"), params(done.id)))).data.batch;
    assert.equal(view.review, null);
    assert.equal(view.followUp.state, "done");
  }, async () => {
    calls += 1;
    if (calls === 1) throw new Error("entry down");
    return DONE;
  });
});

test("review P1-2: more than 10 expired batches waiting for a follow-up retry lose no update — rows are purged first, every task row still runs with its own contact ids", databaseTest, async () => {
  let failing = true;
  const seen = new Map<string, string[]>();
  await withDatabase(async (h) => {
    const batches: string[] = [];
    for (let index = 0; index < 12; index += 1) {
      const batch = (await upload(h, ALICE, utf8(`Name,Email\nPerson ${index},p${index}@example.com\n`))).batch;
      await commit(h, ALICE, batch.id, []);
      batches.push(batch.id);
    }
    await h.settle();
    assert.equal((await h.pool.query("select count(*)::int as n from contact_import_batches where layers_status = 'retry'")).rows[0].n, 12);
    failing = false;
    h.clock.now = new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000);
    const task = createContactImportMaintenanceTask({ resolve: () => ({ client: h.client, service: h.service }) });
    // 先只清理（模拟上一轮额度只够清理）：解析行全部删掉。
    assert.equal(await h.service.repository.purgeExpiredRows(h.client, h.clock.now, 50), 12);
    assert.equal((await h.pool.query("select count(*)::int as n from contact_import_rows")).rows[0].n, 0);
    const first = await task.run({ deadline: Date.now() + 30_000, now: () => h.clock.now });
    const second = await task.run({ deadline: Date.now() + 30_000, now: () => h.clock.now });
    assert.equal((first as Record<string, number>).done + (second as Record<string, number>).done, 12);
    assert.equal(seen.size, 12);
    for (const id of batches) {
      assert.deepEqual(seen.get(`contact-import:${id}:0`), [importContactId(ALICE, id, 1)], "the update ran with the right contact");
    }
    assert.equal((await h.pool.query("select count(*)::int as n from contact_import_batches where layers_status = 'done'")).rows[0].n, 12);
  }, async (input) => {
    if (failing) throw new Error("entry down");
    seen.set(input.sourceKey, [...input.contactIds]);
    return DONE;
  });
});

test("review P2-3: follow-up leases are per task row with a token — a stale worker cannot settle or release a task another worker re-claimed", databaseTest, async () => {
  await withDatabase(async (h) => {
    const batch = (await upload(h, ALICE, utf8("Name\nSolo Person\n"))).batch;
    // 用不调度 after() 的实例提交：任务留在 pending。
    await h.serviceWith((client) => client).commit(ALICE, batch.id, { confirmationIntentId: "i", mergeConfirmations: [] });
    const repo = h.service.repository;
    const first = await repo.claimFollowup(h.client, { leaseMs: 60_000, now: NOW, token: "token-old" });
    assert.equal(first?.chunk, 0);
    assert.equal(await repo.claimFollowup(h.client, { leaseMs: 60_000, now: NOW, token: "token-other" }), null, "a live lease is not re-claimed");
    const later = new Date(NOW.getTime() + 120_000);
    const second = await repo.claimFollowup(h.client, { leaseMs: 60_000, now: later, token: "token-new" });
    assert.equal(second?.chunk, 0, "expired lease can be re-claimed");
    assert.equal(await repo.settleFollowup(h.client, { batchId: batch.id, chunk: 0, now: later, outcome: { done: true, retryOn: null }, token: "token-old" }), false);
    assert.equal(await repo.settleFollowup(h.client, { batchId: batch.id, chunk: 0, now: later, outcome: { done: false, error: "late" }, token: "token-old" }), false);
    const row = (await h.pool.query("select status, lease_token from contact_import_followups where batch_id = $1", [batch.id])).rows[0];
    assert.deepEqual(row, { lease_token: "token-new", status: "running" }, "the old worker changed nothing");
    assert.equal(await repo.settleFollowup(h.client, { batchId: batch.id, chunk: 0, now: later, outcome: { done: true, retryOn: null }, token: "token-new" }), true);
    assert.equal((await h.pool.query("select status from contact_import_followups where batch_id = $1", [batch.id])).rows[0].status, "done");
  }, async () => DONE);
});

test("review P1-1: a commit interrupted mid-way stays visible as 「导入中」 and the maintenance task resumes it from the persisted decisions — no duplicate contacts; unrecoverable ones end as failed", databaseTest, async () => {
  const calls: string[] = [];
  await withDatabase(async (h) => {
    const csv = `Name,Email\n${Array.from({ length: 450 }, (_, i) => `Person ${i},p${i}@example.com`).join("\n")}\n`;
    const batch = (await upload(h, ALICE, utf8(csv))).batch;
    // 第二个写入事务时「进程崩溃」：第 1 个事务（200 人）已提交，其余没写。
    let transactions = 0;
    const crashing = h.serviceWith((base) => ({
      ...base,
      transaction: (operation, options) => {
        transactions += 1;
        if (transactions === 3) return Promise.reject(new Error("process crashed"));
        return base.transaction(operation, options);
      },
    }));
    await assert.rejects(crashing.commit(ALICE, batch.id, { confirmationIntentId: "intent-1", mergeConfirmations: [] }), /process crashed/);
    assert.equal(await contactCount(h.pool, ALICE), 200);
    const stuck = (await body(await h.as(ALICE).list())).data.batches[0];
    assert.equal(stuck.status, "committing");
    assert.deepEqual(stuck.counts, { created: 200, failed: 0, merged: 0, skipped: 0 });

    const task = createContactImportMaintenanceTask({ resolve: () => ({ client: h.client, service: h.service }) });
    const tooEarly = await task.run({ deadline: Date.now() + 30_000, now: () => h.clock.now });
    assert.equal((tooEarly as Record<string, number>).resumed, 0, "a commit still in progress is not taken over");
    h.clock.now = new Date(NOW.getTime() + 10 * 60 * 1000);
    await h.pool.query("update contact_import_batches set updated_at = $2 where id = $1", [batch.id, NOW.toISOString()]);
    const resumed = await task.run({ deadline: Date.now() + 30_000, now: () => h.clock.now });
    assert.equal((resumed as Record<string, number>).resumed, 1);
    assert.equal(await contactCount(h.pool, ALICE), 450, "the rest is written once");
    const view = (await body(await h.as(ALICE).get(new Request("http://localhost/x"), params(batch.id)))).data.batch;
    assert.equal(view.status, "completed");
    assert.deepEqual(view.counts, { created: 450, failed: 0, merged: 0, skipped: 0 });
    assert.equal(view.followUp.state, "done");
    assert.deepEqual([...new Set(calls)].sort(), [0, 1, 2].map((chunk) => `contact-import:${batch.id}:${chunk}`));
    // 用户回到页面用原来的意图重放：不重复写。
    const replay = await commit(h, ALICE, batch.id, [], "intent-1");
    assert.equal(replay.body.data.replayed, true);
    assert.equal(await contactCount(h.pool, ALICE), 450);

    // 无法续写（7 天后解析行已到期）的 committing 批次转终态 failed。
    const other = (await upload(h, ALICE, utf8("Name\nLate Person\n"))).batch;
    await h.pool.query("update contact_import_batches set status = 'committing', commit_intent_id = 'x', expires_at = $2 where id = $1", [other.id, NOW.toISOString()]);
    await h.service.repository.purgeExpiredRows(h.client, new Date(NOW.getTime() + 60_000), 50);
    const failed = (await body(await h.as(ALICE).get(new Request("http://localhost/x"), params(other.id)))).data.batch;
    assert.equal(failed.status, "failed");
    assert.equal(failed.failureReason, "interrupted_expired");
  }, async (input) => {
    calls.push(input.sourceKey);
    return DONE;
  });
});
