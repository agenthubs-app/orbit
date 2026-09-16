import assert from "node:assert/strict";
import test from "node:test";

import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService, NoteServiceError } from "../../features/notes/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

function fixture() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createNoteRepository({ store, workspaceId: "workspace:test" });
  return { repository, service: createNoteService({ repository }), store };
}

test("53 saved notes traverse completely and a source edit invalidates an old offset cursor", async () => {
  const { service } = fixture();
  const saved = [];
  for (let i = 0; i < 53; i++) saved.push(await service.create({ actorId: "account:one", body: `历史 ${i}`, idempotencyKey: `history:${i}`, now: "2026-09-15T00:00:00.000Z" }));
  const ids: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await service.search({ actorId: "account:one", limit: 20, ...(cursor ? { cursor } : {}) });
    assert.equal(page.total, 53);
    ids.push(...page.notes.map(note => note.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 53);
  assert.deepEqual([...ids].sort(), saved.map(note => note.id).sort());
  const first = await service.search({ actorId: "account:one", limit: 20 });
  await service.update({ actorId: "account:one", noteId: saved[52]!.id, body: "更新后的历史", expectedVersion: 1, idempotencyKey: "history:edit", now: "2026-09-15T00:01:00.000Z" });
  await assert.rejects(service.search({ actorId: "account:one", limit: 20, cursor: first.nextCursor }), error => error instanceof NoteServiceError && error.code === "NOTE_INVALID_INPUT");
});

test("one private note is shared by multiple contact views and updates as one version", async () => {
  const { service } = fixture();
  const created = await service.create({
    actorId: "account:one",
    body: "会后确认预算\n下周再聊",
    contactIds: ["contact:a", "contact:b", "contact:a"],
    idempotencyKey: "create:one",
    now: "2026-09-15T00:00:00.000Z",
  });

  assert.equal(created.id.startsWith("note:"), true);
  assert.equal(created.ownerUserId, "account:one");
  assert.deepEqual(created.contactIds, ["contact:a", "contact:b"]);
  assert.equal(created.version, 1);
  assert.equal((await service.list({ actorId: "account:one", contactId: "contact:a" }))[0]?.id, created.id);
  assert.equal((await service.list({ actorId: "account:one", contactId: "contact:b" }))[0]?.id, created.id);

  const updated = await service.update({
    actorId: "account:one",
    noteId: created.id,
    body: "预算已确认",
    contactIds: ["contact:a", "contact:b"],
    expectedVersion: 1,
    idempotencyKey: "update:one",
    now: "2026-09-15T00:01:00.000Z",
  });
  assert.equal(updated.version, 2);
  assert.equal((await service.get({ actorId: "account:one", noteId: created.id }))?.body, "预算已确认");
  assert.equal((await service.list({ actorId: "account:one", contactId: "contact:b" }))[0]?.version, 2);
});

test("create and update retries are idempotent while reused keys with different input conflict", async () => {
  const { service } = fixture();
  const input = {
    actorId: "account:one",
    body: "只创建一次",
    contactIds: ["contact:a"],
    idempotencyKey: "create:retry",
    now: "2026-09-15T00:00:00.000Z",
  } as const;
  const first = await service.create(input);
  assert.deepEqual(await service.create({ ...input, now: "2026-09-15T00:02:00.000Z" }), first);
  await assert.rejects(
    service.create({ ...input, body: "不同正文" }),
    (error: unknown) => error instanceof NoteServiceError && error.code === "NOTE_IDEMPOTENCY_CONFLICT",
  );

  const update = {
    actorId: "account:one",
    noteId: first.id,
    body: "修改一次",
    contactIds: ["contact:a"],
    expectedVersion: 1,
    idempotencyKey: "update:retry",
    now: "2026-09-15T00:03:00.000Z",
  } as const;
  const updated = await service.update(update);
  assert.deepEqual(await service.update({ ...update, now: "2026-09-15T00:04:00.000Z" }), updated);
  assert.equal((await service.get({ actorId: "account:one", noteId: first.id }))?.version, 2);
});

test("stale edits and another account cannot overwrite a note", async () => {
  const { service } = fixture();
  const created = await service.create({
    actorId: "account:one",
    body: "原文",
    contactIds: ["contact:a"],
    idempotencyKey: "create:private",
    now: "2026-09-15T00:00:00.000Z",
  });
  await service.update({
    actorId: "account:one",
    noteId: created.id,
    body: "新版本",
    expectedVersion: 1,
    idempotencyKey: "update:fresh",
    now: "2026-09-15T00:01:00.000Z",
  });

  await assert.rejects(
    service.update({
      actorId: "account:one",
      noteId: created.id,
      body: "旧草稿",
      expectedVersion: 1,
      idempotencyKey: "update:stale",
      now: "2026-09-15T00:02:00.000Z",
    }),
    (error: unknown) => error instanceof NoteServiceError && error.code === "NOTE_VERSION_CONFLICT",
  );
  assert.equal((await service.get({ actorId: "account:one", noteId: created.id }))?.body, "新版本");
  assert.equal(await service.get({ actorId: "account:two", noteId: created.id }), null);
  await assert.rejects(
    service.update({
      actorId: "account:two",
      noteId: created.id,
      body: "越权",
      expectedVersion: 2,
      idempotencyKey: "update:other",
      now: "2026-09-15T00:03:00.000Z",
    }),
    (error: unknown) => error instanceof NoteServiceError && error.code === "NOTE_NOT_FOUND",
  );
});

test("unlinking one contact preserves the body and every other relation", async () => {
  const { service } = fixture();
  const created = await service.create({
    actorId: "account:one",
    body: "共同会议记录",
    contactIds: ["contact:a", "contact:b", "contact:c"],
    idempotencyKey: "create:relations",
    now: "2026-09-15T00:00:00.000Z",
  });
  const unlinked = await service.unlinkContact({
    actorId: "account:one",
    noteId: created.id,
    contactId: "contact:b",
    expectedVersion: 1,
    idempotencyKey: "unlink:b",
    now: "2026-09-15T00:01:00.000Z",
  });
  assert.equal(unlinked.body, "共同会议记录");
  assert.deepEqual(unlinked.contactIds, ["contact:a", "contact:c"]);
  assert.equal(unlinked.version, 2);
  assert.equal((await service.list({ actorId: "account:one", contactId: "contact:b" })).length, 0);
  assert.equal((await service.list({ actorId: "account:one", contactId: "contact:c" }))[0]?.id, created.id);
  assert.deepEqual(await service.unlinkContact({
    actorId: "account:one",
    noteId: created.id,
    contactId: "contact:b",
    expectedVersion: 1,
    idempotencyKey: "unlink:b",
    now: "2026-09-15T00:02:00.000Z",
  }), unlinked);
});

test("concurrent edits from one loaded version allow exactly one winner", async () => {
  const { service } = fixture();
  const created = await service.create({
    actorId: "account:one",
    body: "并发前",
    idempotencyKey: "create:race",
    now: "2026-09-15T00:00:00.000Z",
  });
  const results = await Promise.allSettled([
    service.update({ actorId: "account:one", noteId: created.id, body: "版本 A", expectedVersion: 1, idempotencyKey: "race:a", now: "2026-09-15T00:01:00.000Z" }),
    service.update({ actorId: "account:one", noteId: created.id, body: "版本 B", expectedVersion: 1, idempotencyKey: "race:b", now: "2026-09-15T00:01:01.000Z" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  const rejected = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  assert.ok(rejected?.reason instanceof NoteServiceError);
  assert.equal(rejected.reason.code, "NOTE_VERSION_CONFLICT");
  const final = await service.get({ actorId: "account:one", noteId: created.id });
  assert.equal(final?.version, 2);
  assert.ok(final?.body === "版本 A" || final?.body === "版本 B");
});

test("v2 notes derive canonical contacts from manual links and checked UTF-16 mentions", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createNoteRepository({ store, workspaceId: "workspace:test" });
  const service = createNoteService({
    repository,
    associationReader: {
      async accessibleContactIds({ actorId, ids }) {
        assert.equal(actorId, "account:one");
        return ids.filter((id) => ["contact:ada", "contact:lin"].includes(id));
      },
      async accessibleEventIds({ ids }) {
        return ids.filter((id) => id === "event:launch");
      },
      async searchContactIds() { return []; },
    },
  });
  const body = "和 Ada 讨论发布计划";
  const created = await service.create({
    actorId: "account:one",
    title: "发布会准备",
    body,
    manualContactIds: ["contact:lin"],
    mentions: [{ contactId: "contact:ada", start: 2, end: 5, displayText: "Ada" }],
    eventIds: ["event:launch"],
    idempotencyKey: "create:v2",
    now: "2026-09-15T00:00:00.000Z",
  });

  assert.equal(created.title, "发布会准备");
  assert.deepEqual(created.manualContactIds, ["contact:lin"]);
  assert.deepEqual(created.contactIds, ["contact:ada", "contact:lin"]);
  assert.deepEqual(created.eventIds, ["event:launch"]);
  assert.equal(created.mentions[0]?.displayText, "Ada");

  await assert.rejects(
    service.update({
      actorId: "account:one",
      noteId: created.id,
      mentions: [{ contactId: "contact:ada", start: 2, end: 6, displayText: "Ada" }],
      expectedVersion: 1,
      idempotencyKey: "update:bad-range",
      now: "2026-09-15T00:01:00.000Z",
    }),
    (error: unknown) => error instanceof NoteServiceError && error.code === "NOTE_INVALID_INPUT",
  );
});

test("legacy contactIds remain manual links and omitted v2 fields survive old-client patches", async () => {
  const { service } = fixture();
  const created = await service.create({
    actorId: "account:one",
    body: "第一行标题\n第二行正文",
    contactIds: ["contact:legacy"],
    idempotencyKey: "create:legacy-shape",
    now: "2026-09-15T00:00:00.000Z",
  });
  assert.equal(created.title, "第一行标题");
  assert.deepEqual(created.manualContactIds, ["contact:legacy"]);
  assert.deepEqual(created.mentions, []);
  assert.deepEqual(created.eventIds, []);

  const updated = await service.update({
    actorId: "account:one",
    noteId: created.id,
    body: "旧客户端只改正文",
    expectedVersion: 1,
    idempotencyKey: "update:legacy-shape",
    now: "2026-09-15T00:01:00.000Z",
  });
  assert.equal(updated.title, "第一行标题");
  assert.deepEqual(updated.manualContactIds, ["contact:legacy"]);
});

test("an old client cannot leave stale mention ranges when replacing the body", async () => {
  const { service } = fixture();
  const body = "联系 Ada 确认时间";
  const created = await service.create({
    actorId: "account:one",
    title: "确认安排",
    body,
    mentions: [{ contactId: "contact:ada", start: 3, end: 6, displayText: "Ada" }],
    idempotencyKey: "create:mention-compat",
    now: "2026-09-15T00:00:00.000Z",
  });

  await assert.rejects(
    service.update({
      actorId: "account:one",
      noteId: created.id,
      body: "旧客户端替换了整段正文",
      expectedVersion: 1,
      idempotencyKey: "update:mention-compat",
      now: "2026-09-15T00:01:00.000Z",
    }),
    (error: unknown) => error instanceof NoteServiceError && error.code === "NOTE_INVALID_INPUT",
  );
  assert.deepEqual(await service.get({ actorId: "account:one", noteId: created.id }), created);
});

test("note list searches title, body and actor-scoped contact matches with stable pagination", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createNoteRepository({ store, workspaceId: "workspace:test" });
  const service = createNoteService({
    repository,
    associationReader: {
      async accessibleContactIds({ ids }) { return ids; },
      async accessibleEventIds({ ids }) { return ids; },
      async searchContactIds({ actorId, query }) {
        assert.equal(actorId, "account:one");
        return query === "Ada" ? ["contact:ada"] : [];
      },
    },
  });
  for (const [index, title, contactIds] of [
    [0, "发布会", ["contact:ada"]],
    [1, "预算", []],
    [2, "回访", ["contact:ada"]],
  ] as const) {
    await service.create({
      actorId: "account:one",
      title,
      body: `${title} 正文`,
      contactIds,
      idempotencyKey: `create:list:${index}`,
      now: `2026-09-15T00:0${index}:00.000Z`,
    });
  }
  const first = await service.search({ actorId: "account:one", q: "Ada", limit: 1 });
  assert.equal(first.notes.length, 1);
  assert.equal(first.total, 2);
  assert.ok(first.nextCursor);
  const second = await service.search({ actorId: "account:one", q: "Ada", limit: 1, cursor: first.nextCursor });
  assert.equal(second.notes.length, 1);
  assert.notEqual(second.notes[0]?.id, first.notes[0]?.id);
  assert.equal(second.nextCursor, undefined);
});
