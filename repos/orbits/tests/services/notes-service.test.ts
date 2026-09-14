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
