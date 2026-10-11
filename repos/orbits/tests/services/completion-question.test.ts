/**
 * R16 SC-R16-05「あとで補完 · 每天一问」（DESIGN add-and-invite §2.8）：同一组场景在内存存储与真实 PostgreSQL
 * （本机测试库，随机 schema，用完即删）上各跑一遍。
 *   每人每东京日最多 1 题、同天重放同题、东京日切换；四种回答各写到正确位置；densityAfter 按 D-10 重算；
 *   覚えていない算答；skip 计数跨天累计、连续 3 次停止；选项只来自真实活动 / 公司 / 固定项；他人隔离；幂等。
 * 夹具全部为虚构数据。
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { Pool } from "pg";

import { createMemoryContactCompletionStorage, createPostgresContactCompletionStorage } from "../../features/contacts/completion/configured";
import { COMPLETION_QUESTION_COLLECTION } from "../../features/contacts/completion/repository";
import { ContactCompletionError, createContactCompletionService, type ContactCompletionStorage } from "../../features/contacts/completion/service";
import { contactCompletionQuestionSchema, contactCompletionResultSchema } from "../../shared/api-schema/contact-completion";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import { createTransactionalPostgresClient, type TransactionalPostgresPool } from "../../shared/storage/transactional-postgres";
import { migrateConfiguredTestDatabase } from "../support/migrated-configured-database";
import { assertLoopbackDatabaseUrl, databaseTest, databaseUrl } from "../support/plan-matching-harness";

const WS = "workspace:completion-test";
const ALICE = "actor:alice";
const BOB = "actor:bob";

type Store = LiveRecordStoreLike<Record<string, unknown>>;

interface Backend {
  name: string;
  storage(): Promise<{ storage: ContactCompletionStorage; store: Store }>;
}

const schema = `completion_${randomUUID().replaceAll("-", "")}`;
let admin: Pool | undefined;
let pool: Pool | undefined;

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
});

after(async () => {
  if (!databaseUrl) return;
  await pool?.end();
  await admin?.query(`drop schema if exists ${schema} cascade`).catch(() => undefined);
  await admin?.end();
});

const BACKENDS: Backend[] = [
  {
    name: "memory",
    async storage() {
      const storage = createMemoryContactCompletionStorage({ workspaceId: WS });
      return { storage, store: storage.store };
    },
  },
  {
    name: "postgres",
    async storage() {
      assert.ok(pool && databaseUrl);
      // 每个用例换一个 workspace，互不干扰。
      const workspaceId = `${WS}:${randomUUID()}`;
      const client = createTransactionalPostgresClient({ connectionString: databaseUrl, pool: pool as unknown as TransactionalPostgresPool });
      return { storage: createPostgresContactCompletionStorage({ client, workspaceId }), store: createPostgresLiveRecordStore<Record<string, unknown>>({ client }) };
    },
  },
];

async function seedContact(store: Store, workspaceId: string, actorId: string, id: string, payload: Record<string, unknown>): Promise<void> {
  const createdAt = (payload.createdAt as string | undefined) ?? "2026-10-10T03:00:00.000Z";
  await store.upsertRecord({
    collectionName: "contacts",
    createdAt,
    evidenceIds: ["evidence:seed"],
    lifecycleState: "active",
    payload: { createdAt, evidenceIds: ["evidence:seed"], id, source: { id: "seed", type: "manual" }, stage: "captured", updatedAt: createdAt, ...payload },
    recordId: id,
    sourceId: "seed",
    sourceType: "manual",
    updatedAt: createdAt,
    userId: actorId,
    workspaceId,
  });
}

async function contact(store: Store, workspaceId: string, id: string): Promise<Record<string, unknown>> {
  return (await store.getRecord({ collectionName: "contacts", recordId: id, workspaceId }))!.payload;
}

function clockAt(iso: string) {
  const clock = { now: new Date(iso) };
  return { clock, now: () => clock.now };
}

for (const backend of BACKENDS) {
  const run = backend.name === "postgres" ? databaseTest : {};

  test(`[${backend.name}] one question per Tokyo day: replay returns the same question; answered → null for the rest of the day; the next Tokyo day asks again`, run, async () => {
    const { storage, store } = await backend.storage();
    const ws = storage.workspaceId;
    await seedContact(store, ws, ALICE, "c:okada", { createdAt: "2026-10-08T03:00:00.000Z", displayName: "岡田 紗希", organization: "Sakura Growth Partners", role: "アナリスト" });
    await seedContact(store, ws, ALICE, "c:ito", { createdAt: "2026-10-09T03:00:00.000Z", displayName: "伊藤 直子" });
    const { clock, now } = clockAt("2026-10-12T14:59:00.000Z"); // 東京 10/12 23:59
    const service = createContactCompletionService({ log: () => undefined, now, storage });
    const first = await service.today(ALICE);
    assert.ok(first);
    contactCompletionQuestionSchema.parse(first);
    assert.equal(first.askedOn, "2026-10-12");
    assert.equal(first.contactId, "c:ito", "the newest ●○○ person");
    assert.equal(first.kind, "organization", "missing company is asked first");
    assert.equal(first.question, "伊藤 直子さんの会社は？");
    assert.equal(first.contactName, "伊藤 直子");
    assert.equal(first.sourceChip, "manual");
    assert.deepEqual(await service.today(ALICE), first, "same day → same question");
    const [a, b] = await Promise.all([service.today(ALICE), service.today(ALICE)]);
    assert.deepEqual([a, b], [first, first], "concurrent requests still make one question");
    const records = await store.listRecords({ collectionName: COMPLETION_QUESTION_COLLECTION, limit: 10, userId: ALICE, workspaceId: ws });
    assert.equal(records.length, 1);

    const answered = await service.answer(ALICE, first.id, { answer: "Harmonia KK", idempotencyKey: "k1" });
    contactCompletionResultSchema.parse(answered);
    assert.deepEqual({ ...answered, densityAfter: undefined }, { densityAfter: undefined, next: null, questionId: first.id, status: "answered" });
    assert.equal(await service.today(ALICE), null, "answered → nothing more today (the other device sees it gone)");

    clock.now = new Date("2026-10-12T15:00:00.000Z"); // 東京 10/13 00:00
    const next = await service.today(ALICE);
    assert.ok(next);
    assert.equal(next.askedOn, "2026-10-13");
    assert.notEqual(next.id, first.id);
    assert.equal(next.contactId, "c:ito");
    assert.equal(next.kind, "met_where", "company answered → where we met");
  });

  test(`[${backend.name}] answers are written where they belong: event → metEventId, 紹介 → 「出会い：紹介」 line, company → organization with history, 覚えていない → only on the question`, run, async () => {
    const { storage, store } = await backend.storage();
    const ws = storage.workspaceId;
    // 我参加过的活动：我的联系人里记着 metEventId 的那场。
    await seedContact(store, ws, ALICE, "c:met-1", { createdAt: "2026-10-09T11:00:00.000Z", displayName: "小林 誠", metEventId: "event:cfo-night", metEventTitle: "CFO Night Tokyo vol.18", primaryEmail: "k@example.jp" });
    await seedContact(store, ws, ALICE, "c:old-event", { createdAt: "2026-08-01T11:00:00.000Z", displayName: "古い 人", metEventId: "event:summer", metEventTitle: "Summer Party", primaryEmail: "o@example.jp" });
    await seedContact(store, ws, ALICE, "c:target", { createdAt: "2026-10-10T03:00:00.000Z", displayName: "山本 彩", organization: "東都キャピタル", primaryEmail: "aya@toto.example" });
    const { clock, now } = clockAt("2026-10-12T01:00:00.000Z");
    const service = createContactCompletionService({ log: () => undefined, now, storage });

    const q1 = (await service.today(ALICE))!;
    assert.equal(q1.contactId, "c:target");
    assert.equal(q1.kind, "met_where");
    assert.deepEqual(q1.options, ["CFO Night Tokyo vol.18", "紹介", "覚えていない"], "only the event I attended near that day; no invented events");
    const r1 = await service.answer(ALICE, q1.id, { answer: "CFO Night Tokyo vol.18", idempotencyKey: "a1" });
    assert.equal(r1.densityAfter, 2, "email + met context → ●●○");
    const after1 = await contact(store, ws, "c:target");
    assert.equal(after1.metEventId, "event:cfo-night");
    assert.equal(after1.metEventTitle, "CFO Night Tokyo vol.18");

    // 紹介：没有邮箱的人答了「どこで」仍是 ●○○（D-10）。
    await seedContact(store, ws, ALICE, "c:linkedin", { createdAt: "2026-10-11T03:00:00.000Z", displayName: "佐々木 遼", notes: "LinkedIn: https://www.linkedin.com/in/example", organization: "湾岸グロース", source: { id: "batch", label: "CSV 导入", type: "external_contacts" } });
    clock.now = new Date("2026-10-13T01:00:00.000Z");
    const q2 = (await service.today(ALICE))!;
    assert.equal(q2.contactId, "c:linkedin");
    assert.equal(q2.sourceChip, "linkedin");
    const r2 = await service.answer(ALICE, q2.id, { answer: "紹介", idempotencyKey: "a2" });
    assert.equal(r2.densityAfter, 1, "no email or phone → stays ●○○ even with a meeting note");
    assert.match(String((await contact(store, ws, "c:linkedin")).notes), /\n出会い：紹介$/u);

    // 公司：写进 organization，旧值（空）进 fieldHistory，来源 completion。
    await seedContact(store, ws, ALICE, "c:peer", { createdAt: "2026-09-01T03:00:00.000Z", displayName: "同僚 一", organization: "Kanade AI", primaryEmail: "one@kanade.example", metEventId: "event:x", metEventTitle: "X" });
    await seedContact(store, ws, ALICE, "c:nocompany", { createdAt: "2026-10-12T03:00:00.000Z", displayName: "青木 里奈", primaryEmail: "rina@kanade.example" });
    clock.now = new Date("2026-10-14T01:00:00.000Z");
    const q3 = (await service.today(ALICE))!;
    assert.equal(q3.contactId, "c:nocompany");
    assert.deepEqual(q3.options, ["Kanade AI", "自分で入力", "覚えていない"], "the company comes from my contact on the same email domain");
    await assert.rejects(service.answer(ALICE, q3.id, { answer: "自分で入力", idempotencyKey: "bad" }), (error: unknown) => error instanceof ContactCompletionError && error.code === "INVALID");
    const r3 = await service.answer(ALICE, q3.id, { answer: "Kanade AI", idempotencyKey: "a3" });
    assert.equal(r3.status, "answered");
    const after3 = await contact(store, ws, "c:nocompany");
    assert.equal(after3.organization, "Kanade AI");
    assert.deepEqual((after3.fieldHistory as { field: string; previous: unknown; next: string; source: string }[]).map(({ field, next, previous, source }) => ({ field, next, previous, source })), [
      { field: "organization", next: "Kanade AI", previous: null, source: "completion" },
    ]);

    // 覚えていない：联系人不变，只记在问题上；这一题型不再问。
    clock.now = new Date("2026-10-15T01:00:00.000Z");
    const q4 = (await service.today(ALICE))!;
    assert.equal(q4.contactId, "c:nocompany");
    assert.equal(q4.kind, "met_where");
    const before4 = await contact(store, ws, "c:nocompany");
    const r4 = await service.answer(ALICE, q4.id, { answer: "覚えていない", idempotencyKey: "a4" });
    assert.equal(r4.status, "answered");
    assert.deepEqual(await contact(store, ws, "c:nocompany"), before4, "覚えていない writes nothing to the person");
    const record = (await store.getRecord({ collectionName: COMPLETION_QUESTION_COLLECTION, recordId: q4.id, workspaceId: ws }))!.payload;
    assert.equal(record.answer, "覚えていない");
    assert.equal(record.answerEffect, "forgot");
    clock.now = new Date("2026-10-16T01:00:00.000Z");
    assert.equal(await service.today(ALICE), null, "everyone is either answered or no longer ●○○");
  });

  test(`[${backend.name}] 「明日」(skip): skipCount + 1, nothing more today; the count carries across days; 3 skips in a row and the person is not asked again`, run, async () => {
    const { storage, store } = await backend.storage();
    const ws = storage.workspaceId;
    await seedContact(store, ws, ALICE, "c:only", { createdAt: "2026-10-10T03:00:00.000Z", displayName: "鈴木 大輔" });
    const { clock, now } = clockAt("2026-10-12T01:00:00.000Z");
    const service = createContactCompletionService({ log: () => undefined, now, storage });
    for (let day = 0; day < 3; day += 1) {
      clock.now = new Date(Date.parse("2026-10-12T01:00:00.000Z") + day * 86_400_000);
      const question = (await service.today(ALICE))!;
      assert.equal(question.contactId, "c:only");
      assert.equal(question.skipCount, day, "the count carries across days");
      const skipped = await service.skip(ALICE, question.id, { idempotencyKey: `s${day}` });
      assert.deepEqual(skipped, { next: null, questionId: question.id, status: "skipped" });
      assert.deepEqual(await service.skip(ALICE, question.id, { idempotencyKey: `s${day}` }), skipped, "replay");
      await assert.rejects(service.answer(ALICE, question.id, { answer: "Example", idempotencyKey: "late" }), (error: unknown) => error instanceof ContactCompletionError && error.code === "CONFLICT");
      assert.equal(await service.today(ALICE), null, "skipped → no second question today");
    }
    clock.now = new Date("2026-10-15T01:00:00.000Z");
    assert.equal(await service.today(ALICE), null, "3 skips in a row → not asked again");
  });

  test(`[${backend.name}] isolation and idempotency: someone else cannot see or answer my question; the same key replays, another key conflicts`, run, async () => {
    const { storage, store } = await backend.storage();
    const ws = storage.workspaceId;
    await seedContact(store, ws, ALICE, "c:alice-1", { createdAt: "2026-10-10T03:00:00.000Z", displayName: "高橋 美咲", organization: "青葉ベンチャーズ", primaryPhone: "090-0000-0000" });
    await seedContact(store, ws, BOB, "c:bob-1", { createdAt: "2026-10-10T03:00:00.000Z", displayName: "Bob の知人" });
    const { now } = clockAt("2026-10-12T01:00:00.000Z");
    const service = createContactCompletionService({ log: () => undefined, now, storage });
    const mine = (await service.today(ALICE))!;
    const bobs = (await service.today(BOB))!;
    assert.equal(bobs.contactId, "c:bob-1");
    assert.notEqual(bobs.id, mine.id);
    await assert.rejects(service.answer(BOB, mine.id, { answer: "紹介", idempotencyKey: "x" }), (error: unknown) => error instanceof ContactCompletionError && error.code === "NOT_FOUND");
    await assert.rejects(service.skip(BOB, mine.id, { idempotencyKey: "x" }), (error: unknown) => error instanceof ContactCompletionError && error.code === "NOT_FOUND");
    const first = await service.answer(ALICE, mine.id, { answer: "紹介", idempotencyKey: "same" });
    assert.equal(first.densityAfter, 2, "phone + meeting note → ●●○");
    assert.deepEqual(await service.answer(ALICE, mine.id, { answer: "紹介", idempotencyKey: "same" }), first);
    await assert.rejects(service.answer(ALICE, mine.id, { answer: "覚えていない", idempotencyKey: "other" }), (error: unknown) => error instanceof ContactCompletionError && error.code === "CONFLICT");
    assert.equal((String((await contact(store, ws, "c:alice-1")).notes ?? "").match(/出会い：紹介/gu) ?? []).length, 1, "the note line is written once");
  });

  test(`[${backend.name}] nobody to ask: a marker for the day, no second read; a deleted person's question disappears`, run, async () => {
    const { storage, store } = await backend.storage();
    const ws = storage.workspaceId;
    await seedContact(store, ws, ALICE, "c:old", { createdAt: "2026-08-01T03:00:00.000Z", displayName: "古い 知人" });
    await seedContact(store, ws, ALICE, "c:full", { createdAt: "2026-10-11T03:00:00.000Z", displayName: "全部 ある", metEventId: "e", metEventTitle: "E", organization: "X", primaryEmail: "a@x.example" });
    const { clock, now } = clockAt("2026-10-12T01:00:00.000Z");
    let reads = 0;
    const counted: ContactCompletionStorage = { ...storage, read: (fn) => storage.read(fn), write: (actorId, fn) => storage.write(actorId, (s) => { reads += 1; return fn(s); }) };
    const service = createContactCompletionService({ log: () => undefined, now, storage: counted });
    assert.equal(await service.today(ALICE), null);
    assert.equal(await service.today(ALICE), null);
    assert.equal(reads, 1, "the network is read once per day");

    await seedContact(store, ws, ALICE, "c:gone", { createdAt: "2026-10-12T00:00:00.000Z", displayName: "消える 人" });
    clock.now = new Date("2026-10-13T01:00:00.000Z");
    const question = (await service.today(ALICE))!;
    assert.equal(question.contactId, "c:gone");
    await store.deleteRecord({ collectionName: "contacts", deletedAt: "2026-10-13T02:00:00.000Z", recordId: "c:gone", workspaceId: ws });
    assert.equal(await service.today(ALICE), null);
    await assert.rejects(service.answer(ALICE, question.id, { answer: "覚えていない", idempotencyKey: "z" }), (error: unknown) => error instanceof ContactCompletionError && error.code === "NOT_FOUND");
  });
}
