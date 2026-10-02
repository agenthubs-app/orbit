/**
 * W0046 SC-W0046-02：memo 单一写入。
 *
 * PATCH /api/contacts/:id 提交 `note: { body, occurredAt, eventId, kind: "memo" }` →
 * contact_detail_states 该行 notes 多一条带这三个字段的记录，其他存储 0 次写；
 * 同正文不同日是两条；随后只改标签的 PATCH 与 encounters 投影后新字段仍在；
 * lastInteraction 只在 memo 日期 ≥ 原值时推进；App 旧 body 形状照常可用；
 * 详情 payload（App 同步）里 notes 的字段与改前相同。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { createContactDetailPatchHandler } from "../../app/api/contacts/[id]/handler";
import { contactDetailPayloadFromGraph, createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import type { LiveContactDetailState } from "../../features/contacts/live-service";
import { contactDetailTagStatusServiceFactory } from "../../features/contacts/service-factory";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createPostgresHumanEncounterProjectionRepository } from "../../features/encounters/projection-repository";
import type { HumanEncounterRecord } from "../../features/encounters/service";
import type { MemoExtractionJobInput } from "../../features/contacts/memo-extraction/job";
import type { EventOperationsPostgresRuntime, EventOperationsSqlExecutor } from "../../features/events/event-operations/storage/postgres-client";
import type { ContactDTO } from "../../shared/domain/contracts";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";

const AT = "2026-09-25T00:00:00.000Z";
const NOW = "2026-10-02T03:00:00.000Z"; // 东京 2026-10-02 12:00
const base = { workspaceId: "w", sourceType: "manual", sourceId: "fixture", evidenceIds: ["e"], lifecycleState: "active" as const, createdAt: AT, updatedAt: AT };
const contactPayload = { id: "own", displayName: "Mine", stage: "active", source: { type: "manual", id: "fixture" }, evidenceIds: ["e"], createdAt: AT, updatedAt: AT };

function harness(t: { mock: { method: (...args: never[]) => unknown } }) {
  const store = createMemoryLiveRecordStore([
    { ...base, collectionName: "contacts", recordId: "own", userId: "a", payload: contactPayload },
  ] as LiveRecord[]);
  const writes: string[] = [];
  const counted = Object.assign(Object.create(store) as typeof store, {
    async upsertRecord(record: LiveRecord) { writes.push(record.collectionName); return store.upsertRecord(record); },
    async updateRecordIfCurrent(record: LiveRecord, expected: Parameters<NonNullable<typeof store.updateRecordIfCurrent>>[1]) { writes.push(record.collectionName); return store.updateRecordIfCurrent!(record, expected); },
    async insertRecordIfAbsent(record: LiveRecord) { writes.push(record.collectionName); return store.insertRecordIfAbsent!(record); },
    async deleteRecord(input: Parameters<typeof store.deleteRecord>[0]) { writes.push(input.collectionName); return store.deleteRecord(input); },
  });
  const provider = createStorageContactGraphProvider({ store: counted, workspaceId: "w" });
  const service = createLiveContactDetailTagStatusService({ now: () => NOW, provider });
  const resolution = contactDetailTagStatusServiceFactory.create("mock");
  (t.mock.method as (object: object, name: string, impl: () => unknown) => unknown)(contactDetailTagStatusServiceFactory, "create", () => ({ ...resolution, service }));
  const jobs: MemoExtractionJobInput[] = [];
  const patch = (body: unknown) => createContactDetailPatchHandler(async () => ({ id: "a" }), { onMemoSaved: (job) => jobs.push(job) })(
    new Request("https://orbit.test/api/contacts/own", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "own" }) },
  );
  const stored = async () => (await provider.readContactDetailState!("own", "a"))!;
  return { jobs, patch, provider, store, stored, writes };
}

const memo = (body: string, occurredAt: string, eventId?: string) => ({ note: { body, occurredAt, ...(eventId ? { eventId } : {}), kind: "memo" } });

test("memo PATCH 只写 contact_detail_states，新记录带 occurredAt／eventId／kind；详情 payload 的 notes 不带这些字段", async (t) => {
  const { jobs, patch, stored, writes } = harness(t);
  const response = await patch(memo("聊了 B 轮融资", "2026-10-02", "event:e1"));
  assert.equal(response.status, 200);
  assert.deepEqual(writes, ["contact_detail_states"]);
  // 提取作业在响应之外排队（一条 memo 一个作业），保存请求本身不写别的存储。
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].contactId, "own");
  assert.equal(jobs[0].body, "聊了 B 轮融资");
  assert.match(jobs[0].noteId, /^note:live-contact-detail-update:/);
  const state = await stored();
  const note = state.notes.find((item) => item.body === "聊了 B 轮融资");
  assert.ok(note);
  assert.match(note.noteId, /^note:live-contact-detail-update:/);
  assert.equal(note.occurredAt, "2026-10-02");
  assert.equal(note.eventId, "event:e1");
  assert.equal(note.kind, "memo");
  const body = await response.json() as { data: { contact: { notes: Record<string, unknown>[] } } };
  const publicNote = body.data.contact.notes.find((item) => item.body === "聊了 B 轮融资");
  assert.ok(publicNote);
  for (const key of ["occurredAt", "eventId", "kind"]) assert.equal(Object.hasOwn(publicNote, key), false, key);
});

test("同正文不同日期是两条，同正文同日期去重；之后只改标签的 PATCH 不丢 memo 字段", async (t) => {
  const { patch, stored, writes } = harness(t);
  assert.equal((await patch(memo("同一句话", "2026-09-28"))).status, 200);
  assert.equal((await patch(memo("同一句话", "2026-09-29"))).status, 200);
  assert.equal((await patch(memo("同一句话", "2026-09-29"))).status, 200);
  const notes = (await stored()).notes.filter((item) => item.body === "同一句话");
  assert.deepEqual(notes.map((item) => item.occurredAt).sort(), ["2026-09-28", "2026-09-29"]);
  assert.equal((await patch({ addTags: ["investor"] })).status, 200);
  assert.equal((await patch({ note: "App 的纯文本备注" })).status, 200);
  const after = await stored();
  assert.ok(after.tags.includes("investor"));
  assert.deepEqual(after.notes.filter((item) => item.body === "同一句话").map((item) => [item.occurredAt, item.kind]).sort(), [["2026-09-28", "memo"], ["2026-09-29", "memo"]]);
  assert.ok(writes.every((collection) => collection === "contact_detail_states"));
});

test("lastInteraction 只在 memo 日期 ≥ 原值时推进", async (t) => {
  const { patch, stored } = harness(t);
  // 原值：联系人 updatedAt 2026-09-25。补记更早的事不推进。
  await patch(memo("补记九月二十号的事", "2026-09-20"));
  assert.equal((await stored()).lastInteraction?.occurredAt, AT);
  // 更晚的日期推进到该日东京 00:00。
  await patch(memo("九月二十八号见面", "2026-09-28"));
  assert.equal((await stored()).lastInteraction?.occurredAt, "2026-09-27T15:00:00.000Z");
  assert.equal((await stored()).lastInteraction?.summary, "九月二十八号见面");
  // 今天的 memo 用写入时刻。
  await patch(memo("今天电话\n第二行", "2026-10-02"));
  assert.equal((await stored()).lastInteraction?.occurredAt, NOW);
  assert.equal((await stored()).lastInteraction?.summary, "今天电话");
  // 同一天再补一条更早日期的：不回退。
  await patch(memo("再补一条", "2026-09-30"));
  assert.equal((await stored()).lastInteraction?.occurredAt, NOW);
});

test("App 旧 body 形状照常可用；memo 形状不合法时整条 PATCH 拒绝", async (t) => {
  const { jobs, patch, stored, writes } = harness(t);
  assert.equal((await patch({ note: "纯文本" })).status, 200);
  assert.equal((await patch({ note: { body: "结构化", authorLabel: "我" } })).status, 200);
  const notes = (await stored()).notes;
  for (const body of ["纯文本", "结构化"]) {
    const note = notes.find((item) => item.body === body);
    assert.ok(note);
    assert.equal(note.kind, undefined);
    assert.equal(note.occurredAt, undefined);
  }
  const before = writes.length;
  for (const bad of [
    { note: { body: "x", kind: "followup", occurredAt: "2026-10-01" } },
    { note: { body: "x", kind: "memo" } },
    { note: { body: "x", kind: "memo", occurredAt: "2026-02-30" } },
    { note: { body: "x", kind: "memo", occurredAt: "2026-10-01T10:00:00Z" } },
    { note: { body: "x", kind: "memo", occurredAt: "2026-10-01", eventId: 42 } },
  ]) {
    assert.equal((await patch(bad)).status, 400, JSON.stringify(bad));
  }
  assert.equal(writes.length, before);
  // 旧写法不是 memo，不排提取作业。
  assert.equal(jobs.length, 0);
});

test("encounters 投影写同一行后 memo 字段仍在（Postgres 投影仓库，SQL 执行器桩）", async () => {
  const memoNote = { noteId: "note:live-contact-detail-update:m1", body: "memo", authorLabel: "我", createdAt: AT, privacy: "private", occurredAt: "2026-09-20", eventId: "event:e1", kind: "memo" };
  const encounter = {
    encounterId: "enc-1", actorId: "a", contactId: "own", observedAt: "2026-09-26T00:00:00.000Z", createdAt: AT, eventId: null, noteText: "", nextStep: "", commitments: [], tags: [],
    connectionId: null, privacy: "private", requestHash: "h", talked: "yes", voiceMemoReference: null,
    projection: { attempts: 1, availableAt: AT, lastError: null, leaseExpiresAt: "2026-09-26T01:00:00.000Z", leaseToken: "lease", status: "processing" },
  } as HumanEncounterRecord;
  let writtenPayload: LiveContactDetailState | null = null;
  const executor: EventOperationsSqlExecutor = {
    async query<TRow>(text: string, values?: readonly unknown[]) {
      if (/collection_name = 'human_encounters' and record_id = \$2\s+for update/.test(text)) return { rowCount: 1, rows: [{ payload: encounter }] as TRow[] };
      if (/collection_name = 'contact_detail_states' and record_id = \$2/.test(text)) {
        return { rowCount: 1, rows: [{ payload: { actorId: "a", contactId: "own", status: "active", tags: [], notes: [memoNote], updatedAt: AT }, created_at: AT }] as TRow[] };
      }
      if (/insert into orbit_records/.test(text)) {
        writtenPayload = JSON.parse(String(values?.[7])) as LiveContactDetailState;
        return { rowCount: 1, rows: [{ record_id: "x" }] as TRow[] };
      }
      return { rowCount: 1, rows: [] as TRow[] };
    },
  };
  const runtime = { workspaceId: "w", client: { ...executor, close: async () => undefined, transaction: async (run: (tx: EventOperationsSqlExecutor) => Promise<unknown>) => run(executor) } } as unknown as EventOperationsPostgresRuntime;
  const repository = createPostgresHumanEncounterProjectionRepository(runtime);
  const outcome = await repository.complete({
    claim: { encounter, leaseToken: "lease" },
    interaction: { channel: "event_note", occurredAt: encounter.observedAt, summary: "s" },
    note: { noteId: "note:enc-1", body: "谈过：是", authorLabel: "You", createdAt: encounter.observedAt },
    now: "2026-09-26T00:00:01.000Z",
  });
  assert.equal(outcome, "completed");
  assert.ok(writtenPayload);
  const kept = (writtenPayload as LiveContactDetailState).notes.find((note) => note.noteId === memoNote.noteId);
  assert.deepEqual(kept, memoNote);
});

test("contactDetailPayloadFromGraph 输出的 notes 与改前逐字段相同（App 同步）", () => {
  const contact = contactPayload as unknown as ContactDTO;
  const legacyNote = { noteId: "note:live-contact-detail-update:m1", body: "memo", authorLabel: "我", createdAt: AT, privacy: "private" as const, sourceLabel: "联系人备注" };
  const state = (notes: LiveContactDetailState["notes"]): LiveContactDetailState => ({ actorId: "a", contactId: "own", notes, status: "active", tags: [], updatedAt: AT });
  const read = (persistedState: LiveContactDetailState) => contactDetailPayloadFromGraph({
    collectedAt: NOW, contact, connections: [], evidence: [], persistedState, provider: { source: "s", sourceLabel: "S" },
  })!.contact!.notes;
  const before = read(state([legacyNote]));
  const after = read(state([{ ...legacyNote, occurredAt: "2026-09-20", eventId: "event:e1", kind: "memo" }]));
  assert.deepEqual(after, before);
});
