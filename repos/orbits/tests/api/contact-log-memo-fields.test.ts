/**
 * 「记一笔交流」（2026-11 设计稿 contact-log-2026-11）：memo 的 channel／topics。
 *
 * PATCH /api/contacts/:id 的 `note: { kind: "memo", occurredAt, channel?, topics? }`：
 * 校验（不合法整条拒绝、topics 去空去重）、存储、任何后续 PATCH 不丢、详情 payload 带出、
 * 旧写法 noteId 哈希不变；名片／系统记录的 origin。
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createContactDetailPatchHandler, readMemoTopics } from "../../app/api/contacts/[id]/handler";
import { contactDetailPayloadFromGraph, createLiveContactDetailTagStatusService, memoFieldsFor } from "../../features/contacts/live-detail-service";
import { contactDetailTagStatusServiceFactory } from "../../features/contacts/service-factory";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import type { ContactDTO } from "../../shared/domain/contracts";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";

const AT = "2026-09-25T00:00:00.000Z";
const NOW = "2026-10-02T03:00:00.000Z";
const base = { workspaceId: "w", sourceType: "manual", sourceId: "fixture", evidenceIds: ["e"], lifecycleState: "active" as const, createdAt: AT, updatedAt: AT };
const contactPayload = { id: "own", displayName: "Mine", stage: "active", source: { type: "manual", id: "fixture" }, evidenceIds: ["e"], createdAt: AT, updatedAt: AT };

function harness(t: { mock: { method: (...args: never[]) => unknown } }) {
  const store = createMemoryLiveRecordStore([{ ...base, collectionName: "contacts", recordId: "own", userId: "a", payload: contactPayload }] as LiveRecord[]);
  const writes: string[] = [];
  const counted = Object.assign(Object.create(store) as typeof store, {
    async upsertRecord(record: LiveRecord) { writes.push(record.collectionName); return store.upsertRecord(record); },
    async updateRecordIfCurrent(record: LiveRecord, expected: Parameters<NonNullable<typeof store.updateRecordIfCurrent>>[1]) { writes.push(record.collectionName); return store.updateRecordIfCurrent!(record, expected); },
    async insertRecordIfAbsent(record: LiveRecord) { writes.push(record.collectionName); return store.insertRecordIfAbsent!(record); },
  });
  const provider = createStorageContactGraphProvider({ store: counted, workspaceId: "w" });
  const service = createLiveContactDetailTagStatusService({ now: () => NOW, provider });
  const resolution = contactDetailTagStatusServiceFactory.create("mock");
  (t.mock.method as (object: object, name: string, impl: () => unknown) => unknown)(contactDetailTagStatusServiceFactory, "create", () => ({ ...resolution, service }));
  const patch = (body: unknown) => createContactDetailPatchHandler(async () => ({ id: "a" }), { markInsightsDirty: async () => undefined, onMemoSaved: () => undefined })(
    new Request("https://orbit.test/api/contacts/own", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: "own" }) },
  );
  const stored = async () => (await provider.readContactDetailState!("own", "a"))!;
  return { patch, stored, writes };
}

const log = (extra: Record<string, unknown>) => ({ note: { body: "聊到：渠道、招聘", authorLabel: "我", occurredAt: "2026-10-01", kind: "memo", ...extra } });

test("readMemoTopics：去空、trim、去重；超过 12 个或单个超过 80 字拒绝；非数组／非字符串拒绝", () => {
  assert.equal(readMemoTopics(undefined), undefined);
  assert.equal(readMemoTopics(null), undefined);
  assert.equal(readMemoTopics([" ", ""]), undefined);
  assert.deepEqual(readMemoTopics([" 渠道 ", "渠道", "", "招聘"]), ["渠道", "招聘"]);
  assert.equal(readMemoTopics("渠道"), "invalid");
  assert.equal(readMemoTopics(["渠道", 3]), "invalid");
  assert.equal(readMemoTopics(Array.from({ length: 13 }, (_, index) => `t${index}`)), "invalid");
  assert.deepEqual(readMemoTopics([...Array.from({ length: 12 }, (_, index) => `t${index}`), "t0", " t1 "]), Array.from({ length: 12 }, (_, index) => `t${index}`));
  assert.deepEqual(readMemoTopics(["字".repeat(80)]), ["字".repeat(80)]);
  assert.equal(readMemoTopics(["字".repeat(81)]), "invalid");
});

test("channel／topics 不合法时整条 PATCH 400、零写入；非 memo 带这两个字段也拒绝", async (t) => {
  const { patch, writes } = harness(t);
  for (const bad of [
    log({ channel: "email" }),
    log({ channel: 1 }),
    log({ topics: "渠道" }),
    log({ topics: ["x".repeat(81)] }),
    log({ topics: Array.from({ length: 13 }, (_, index) => `t${index}`) }),
    { note: { body: "旧写法", authorLabel: "我", channel: "call" } },
    { note: { body: "旧写法", authorLabel: "我", topics: ["渠道"] } },
  ]) {
    assert.equal((await patch(bad)).status, 400, JSON.stringify(bad));
  }
  assert.deepEqual(writes, []);
});

test("memo 带 channel／topics：存进 contact_detail_states，详情 payload 带 occurredAt／channel／topics／origin", async (t) => {
  const { patch, stored } = harness(t);
  const response = await patch(log({ channel: "meeting", topics: [" 渠道", "招聘", "渠道", ""] }));
  assert.equal(response.status, 200);
  const note = (await stored()).notes.find((item) => item.body === "聊到：渠道、招聘");
  assert.ok(note);
  assert.equal(note.kind, "memo");
  assert.equal(note.occurredAt, "2026-10-01");
  assert.equal(note.channel, "meeting");
  assert.deepEqual(note.topics, ["渠道", "招聘"]);
  const body = await response.json() as { data: { contact: { notes: Record<string, unknown>[] } } };
  const publicNote = body.data.contact.notes.find((item) => item.body === "聊到：渠道、招聘");
  assert.ok(publicNote);
  assert.equal(publicNote.origin, "user");
  assert.equal(publicNote.occurredAt, "2026-10-01");
  assert.equal(publicNote.channel, "meeting");
  assert.deepEqual(publicNote.topics, ["渠道", "招聘"]);
  assert.equal(Object.hasOwn(publicNote, "kind"), false);
});

test("之后的标签／状态／旧备注／另一条 memo PATCH 都不丢 channel／topics", async (t) => {
  const { patch, stored } = harness(t);
  assert.equal((await patch(log({ channel: "event", topics: ["渠道"], eventId: "event:e1" }))).status, 200);
  for (const next of [{ addTags: ["investor"] }, { status: "nurture" }, { note: "App 的纯文本备注" }, { note: { body: "另一条", occurredAt: "2026-09-30", kind: "memo" } }]) {
    assert.equal((await patch(next)).status, 200, JSON.stringify(next));
    const note = (await stored()).notes.find((item) => item.body === "聊到：渠道、招聘");
    assert.ok(note);
    assert.deepEqual([note.kind, note.occurredAt, note.eventId, note.channel, note.topics], ["memo", "2026-10-01", "event:e1", "event", ["渠道"]], JSON.stringify(next));
  }
  const other = (await stored()).notes.find((item) => item.body === "另一条");
  assert.ok(other);
  assert.equal(Object.hasOwn(other, "channel"), false);
  assert.equal(Object.hasOwn(other, "topics"), false);
});

test("noteId：不带 channel 的 memo 与旧写法哈希相同；同正文同日不同方式是两条", async (t) => {
  const { patch, stored } = harness(t);
  const legacyId = (body: string, day: string) => `note:live-contact-detail-update:${createHash("sha256").update(["a", "own", "我", body, `memo@${day}`].join("\u0000")).digest("hex").slice(0, 24)}`;
  assert.equal((await patch({ note: { body: "同一句话", authorLabel: "我", occurredAt: "2026-10-01", kind: "memo" } })).status, 200);
  assert.equal((await patch({ note: { body: "同一句话", authorLabel: "我", occurredAt: "2026-10-01", kind: "memo", topics: ["渠道"] } })).status, 200);
  assert.equal((await patch({ note: { body: "同一句话", authorLabel: "我", occurredAt: "2026-10-01", kind: "memo", channel: "call" } })).status, 200);
  const notes = (await stored()).notes.filter((item) => item.body === "同一句话");
  assert.equal(notes.length, 2);
  const plain = notes.find((item) => !item.channel);
  assert.equal(plain?.noteId, legacyId("同一句话", "2026-10-01"));
  // 同 id 的第二次写入去重命中第一条（不改写已存字段）。
  assert.equal(Object.hasOwn(plain ?? {}, "topics"), false);
  assert.ok(notes.some((item) => item.channel === "call" && item.noteId !== plain?.noteId));
});

test("memoFieldsFor：服务层再收一次（不合法的方式丢掉、topics 去空去重截到 12 个）；非 memo 返回 null", () => {
  assert.equal(memoFieldsFor({ body: "x" }), null);
  assert.deepEqual(memoFieldsFor({ body: "x", kind: "memo", occurredAt: "2026-10-01", channel: "fax" as never, topics: [" a", "a", "", ...Array.from({ length: 14 }, (_, index) => `t${index}`)] }), {
    kind: "memo", occurredAt: "2026-10-01", topics: ["a", ...Array.from({ length: 11 }, (_, index) => `t${index}`)],
  });
});

test("origin：名片备注 → card，生成的背景说明 → system，存储行 → user", () => {
  const contact = { ...contactPayload, notes: "出会い：交流会" } as unknown as ContactDTO;
  const notes = contactDetailPayloadFromGraph({
    collectedAt: NOW, contact, connections: [], evidence: [], provider: { source: "s", sourceLabel: "S" },
    persistedState: { actorId: "a", contactId: "own", status: "active", tags: [], updatedAt: AT, notes: [{ noteId: "note:live-contact-detail-update:m1", body: "memo", authorLabel: "我", createdAt: AT }] },
  })!.contact!.notes;
  assert.deepEqual(notes.map((note) => [note.noteId.split(":").slice(0, 2).join(":"), note.origin]), [["note:business-card-notes", "card"], ["note:live-contact-detail-update", "user"]]);
  const generated = contactDetailPayloadFromGraph({
    collectedAt: NOW, contact: contactPayload as unknown as ContactDTO, connections: [], evidence: [], provider: { source: "s", sourceLabel: "S" }, persistedState: null,
  })!.contact!.notes;
  assert.deepEqual(generated.map((note) => note.origin), ["system"]);
});

test("generatedInteraction：记了交流后仍带出系统背景说明；名片备注与说明的日期用登记时间，不随 updatedAt 推进", () => {
  const LATER = "2026-11-16T00:00:00.000Z";
  const contact = { ...contactPayload, notes: "出会い：交流会", updatedAt: LATER } as unknown as ContactDTO;
  const detail = contactDetailPayloadFromGraph({
    collectedAt: NOW, contact, connections: [], evidence: [], provider: { source: "s", sourceLabel: "S" },
    persistedState: {
      actorId: "a", contactId: "own", status: "active", tags: [], updatedAt: LATER,
      notes: [{ noteId: "note:live-contact-detail-update:m1", body: "聊到：A", authorLabel: "我", createdAt: LATER, occurredAt: "2026-11-16", kind: "memo" }],
      lastInteraction: { channel: "manual_note", occurredAt: LATER, summary: "聊到：A" },
    },
  })!.contact!;
  assert.equal(detail.lastInteraction.summary, "聊到：A");
  assert.ok(detail.generatedInteraction?.summary.trim());
  assert.notEqual(detail.generatedInteraction?.summary, "聊到：A");
  assert.equal(detail.generatedInteraction?.occurredAt, AT);
  assert.equal(detail.notes.find((note) => note.origin === "card")?.createdAt, AT);
});
