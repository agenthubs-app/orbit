import assert from "node:assert/strict";
import test from "node:test";

import { createNoteCollectionHandlers } from "../../app/api/notes/collection-handler";
import { createNoteDetailHandlers } from "../../app/api/notes/[id]/handler";
import { createNoteContactDeleteHandler } from "../../app/api/notes/[id]/contacts/[contactId]/handler";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";

const actorId = "account:notes";
const workspaceId = "workspace:notes";
const now = "2026-09-15T00:00:00.000Z";

function dependencies(actor: string | null = actorId) {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  return {
    now: () => now,
    resolveActor: async () => actor ? { id: actor, workspaceId } : null,
    service: createNoteService({ repository: createNoteRepository({ store, workspaceId }) }),
  };
}

async function json(response: Response): Promise<any> {
  return response.json();
}

test("notes authenticate before reading a mutation body", async () => {
  const handlers = createNoteCollectionHandlers(dependencies(null));
  const response = await handlers.POST(new Request("https://orbit.local/api/notes", {
    body: "{broken",
    method: "POST",
  }));
  assert.equal(response.status, 401);
  assert.equal((await json(response)).error.code, "UNAUTHORIZED");
});

test("creates, filters and reads one actor-owned note through HTTP", async () => {
  const deps = dependencies();
  const collection = createNoteCollectionHandlers(deps);
  const createdResponse = await collection.POST(new Request("https://orbit.local/api/notes", {
    body: JSON.stringify({
      body: "同一份会议记录",
      contactIds: ["contact:a", "contact:b"],
      idempotencyKey: "api:create:one",
    }),
    method: "POST",
  }));
  assert.equal(createdResponse.status, 201);
  const created = (await json(createdResponse)).data.note;
  assert.equal(created.ownerUserId, actorId);
  assert.equal(created.version, 1);

  const filtered = await collection.GET(new Request("https://orbit.local/api/notes?contactId=contact%3Ab"));
  assert.deepEqual((await json(filtered)).data.notes.map((note: { id: string }) => note.id), [created.id]);
  const detail = createNoteDetailHandlers(deps);
  const response = await detail.GET(new Request(`https://orbit.local/api/notes/${created.id}`), { params: Promise.resolve({ id: created.id }) });
  assert.equal(response.status, 200);
  assert.equal((await json(response)).data.note.body, "同一份会议记录");
});

test("validates exact fields, protects versions and unlinks only one contact", async () => {
  const deps = dependencies();
  const collection = createNoteCollectionHandlers(deps);
  const bad = await collection.POST(new Request("https://orbit.local/api/notes", {
    body: JSON.stringify({ actorId: "account:other", body: "越权字段", idempotencyKey: "bad" }),
    method: "POST",
  }));
  assert.equal(bad.status, 400);
  assert.equal((await json(bad)).error.code, "VALIDATION_ERROR");

  const created = (await json(await collection.POST(new Request("https://orbit.local/api/notes", {
    body: JSON.stringify({ body: "原文", contactIds: ["contact:a", "contact:b"], idempotencyKey: "create" }),
    method: "POST",
  })))).data.note;
  const detail = createNoteDetailHandlers(deps);
  const context = { params: Promise.resolve({ id: created.id }) };
  const updated = await detail.PATCH(new Request(`https://orbit.local/api/notes/${created.id}`, {
    body: JSON.stringify({ body: "新原文", expectedVersion: 1, idempotencyKey: "update" }),
    method: "PATCH",
  }), context);
  assert.equal(updated.status, 200);
  assert.equal((await json(updated)).data.note.version, 2);

  const stale = await detail.PATCH(new Request(`https://orbit.local/api/notes/${created.id}`, {
    body: JSON.stringify({ body: "旧草稿", expectedVersion: 1, idempotencyKey: "stale" }),
    method: "PATCH",
  }), context);
  assert.equal(stale.status, 409);
  assert.equal((await json(stale)).error.code, "CONFLICT");

  const unlink = createNoteContactDeleteHandler(deps);
  const unlinked = await unlink(new Request(`https://orbit.local/api/notes/${created.id}/contacts/contact%3Ab`, {
    body: JSON.stringify({ expectedVersion: 2, idempotencyKey: "unlink:b" }),
    method: "DELETE",
  }), { params: Promise.resolve({ id: created.id, contactId: "contact:b" }) });
  assert.equal(unlinked.status, 200);
  assert.equal((await json(unlinked)).data.note.body, "新原文");
  assert.deepEqual((await json(await detail.GET(new Request(`https://orbit.local/api/notes/${created.id}`), context))).data.note.contactIds, ["contact:a"]);
});

test("another actor receives not-found and cannot infer a private note", async () => {
  const owner = dependencies();
  const created = (await json(await createNoteCollectionHandlers(owner).POST(new Request("https://orbit.local/api/notes", {
    body: JSON.stringify({ body: "私密", idempotencyKey: "private" }),
    method: "POST",
  })))).data.note;
  const other = { ...owner, resolveActor: async () => ({ id: "account:other", workspaceId }) };
  const response = await createNoteDetailHandlers(other).GET(
    new Request(`https://orbit.local/api/notes/${created.id}`),
    { params: Promise.resolve({ id: created.id }) },
  );
  assert.equal(response.status, 404);
  assert.equal((await json(response)).error.code, "NOT_FOUND");
});

test("HTTP accepts v2 note fields while legacy PATCH preserves omitted associations", async () => {
  const deps = dependencies();
  const collection = createNoteCollectionHandlers(deps);
  const body = "和 Ada 确认发布会";
  const createdResponse = await collection.POST(new Request("https://orbit.local/api/notes", {
    body: JSON.stringify({
      title: "发布会",
      body,
      manualContactIds: ["contact:lin"],
      mentions: [{ contactId: "contact:ada", start: 2, end: 5, displayText: "Ada" }],
      eventIds: ["event:launch"],
      idempotencyKey: "api:create:v2",
    }),
    method: "POST",
  }));
  assert.equal(createdResponse.status, 201);
  const created = (await json(createdResponse)).data.note;
  assert.deepEqual(created.contactIds, ["contact:ada", "contact:lin"]);

  const detail = createNoteDetailHandlers(deps);
  const updatedResponse = await detail.PATCH(new Request(`https://orbit.local/api/notes/${created.id}`, {
    body: JSON.stringify({ body: "和 Ada 确认新日期", expectedVersion: 1, idempotencyKey: "api:update:legacy" }),
    method: "PATCH",
  }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(updatedResponse.status, 200);
  const updated = (await json(updatedResponse)).data.note;
  assert.deepEqual(updated.manualContactIds, ["contact:lin"]);
  assert.deepEqual(updated.eventIds, ["event:launch"]);
});

test("HTTP persists event mentions and memo flags while keeping old omitted fields absent", async () => {
  const deps = { ...dependencies(), scheduleMemoExtraction: () => {} };
  const collection = createNoteCollectionHandlers(deps);
  const createdResponse = await collection.POST(new Request("https://orbit.local/api/notes", {
    body: JSON.stringify({
      body: "Meet @Launch", noteKind: "meeting", usedForPlan: true, manualContactIds: ["contact:a"],
      mentions: [{ entityType: "event", eventId: "event:launch", start: 5, end: 12, displayText: "@Launch" }],
      idempotencyKey: "api:create:event",
    }), method: "POST",
  }));
  assert.equal(createdResponse.status, 201);
  const created = (await json(createdResponse)).data.note;
  assert.deepEqual(created.contactIds, ["contact:a"]);
  assert.deepEqual(created.eventIds, ["event:launch"]);
  assert.equal(created.noteKind, "meeting");
  assert.equal(created.usedForPlan, true);
  const detail = createNoteDetailHandlers(deps);
  const updatedResponse = await detail.PATCH(new Request(`https://orbit.local/api/notes/${created.id}`, {
    body: JSON.stringify({ noteKind: "free", usedForPlan: false, expectedVersion: 1, idempotencyKey: "api:update:event" }),
    method: "PATCH",
  }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(updatedResponse.status, 200);
  const updated = (await json(updatedResponse)).data.note;
  assert.equal(updated.noteKind, "free");
  assert.equal(updated.usedForPlan, false);
  assert.deepEqual(updated.mentions, created.mentions);

  const oldResponse = await collection.POST(new Request("https://orbit.local/api/notes", {
    body: JSON.stringify({ body: "Old client", idempotencyKey: "api:create:old" }), method: "POST",
  }));
  assert.equal(oldResponse.status, 201);
  const old = (await json(oldResponse)).data.note;
  assert.equal(Object.hasOwn(old, "noteKind"), false);
  assert.equal(Object.hasOwn(old, "usedForPlan"), false);
  const meetingPage = await collection.GET(new Request("https://orbit.local/api/notes?noteKind=meeting"));
  assert.equal(meetingPage.status, 200);
  assert.deepEqual((await json(meetingPage)).data.notes.map((item: { id: string }) => item.id), []);
  const freePage = await collection.GET(new Request("https://orbit.local/api/notes?noteKind=free"));
  assert.equal(freePage.status, 200);
  assert.equal((await json(freePage)).data.total, 2);
  const invalidKind = await collection.GET(new Request("https://orbit.local/api/notes?noteKind=other"));
  assert.equal(invalidKind.status, 400);
});

test("HTTP rejects plan-use without a single contact or meeting kind", async () => {
  const deps = { ...dependencies(), scheduleMemoExtraction: () => {} };
  const collection = createNoteCollectionHandlers(deps);
  const invalidCreate = await collection.POST(new Request("https://orbit.local/api/notes", {
    method: "POST", body: JSON.stringify({ body: "Plan memo", noteKind: "meeting", usedForPlan: true, idempotencyKey: "plan:no-contact" }),
  }));
  assert.equal(invalidCreate.status, 400);
  const createdResponse = await collection.POST(new Request("https://orbit.local/api/notes", {
    method: "POST", body: JSON.stringify({ body: "Plan memo", noteKind: "meeting", usedForPlan: true,
      contactIds: ["contact:a"], idempotencyKey: "plan:valid" }),
  }));
  assert.equal(createdResponse.status, 201);
  const created = (await json(createdResponse)).data.note;
  const detail = createNoteDetailHandlers(deps);
  const invalidUpdate = await detail.PATCH(new Request(`https://orbit.local/api/notes/${created.id}`, {
    method: "PATCH", body: JSON.stringify({ noteKind: "free", expectedVersion: 1, idempotencyKey: "plan:invalid-update" }),
  }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(invalidUpdate.status, 400);
});

test("HTTP schedules C11 only after a new eligible save", async () => {
  const jobs: Array<{ actorId: string; contactId: string; noteId: string; body: string; usedForPlan: boolean }> = [];
  const deps = { ...dependencies(), scheduleMemoExtraction: (job: typeof jobs[number]) => { jobs.push(job); } };
  const collection = createNoteCollectionHandlers(deps);
  const createBody = { body: "Met Ada", noteKind: "meeting", usedForPlan: true,
    contactIds: ["contact:a"], idempotencyKey: "c11:create" };
  const createdResponse = await collection.POST(new Request("https://orbit.local/api/notes", {
    method: "POST", body: JSON.stringify(createBody),
  }));
  assert.equal(createdResponse.status, 201);
  const created = (await json(createdResponse)).data.note;
  await collection.POST(new Request("https://orbit.local/api/notes", { method: "POST", body: JSON.stringify(createBody) }));
  assert.deepEqual(jobs.map((job) => [job.actorId, job.contactId, job.noteId, job.body, job.usedForPlan]),
    [[actorId, "contact:a", created.id, "Met Ada", true]]);
  const detail = createNoteDetailHandlers(deps);
  const context = { params: Promise.resolve({ id: created.id }) };
  const updateBody = { body: "Met Ada again", expectedVersion: 1, idempotencyKey: "c11:update" };
  assert.equal((await detail.PATCH(new Request(`https://orbit.local/api/notes/${created.id}`, {
    method: "PATCH", body: JSON.stringify(updateBody),
  }), context)).status, 200);
  await detail.PATCH(new Request(`https://orbit.local/api/notes/${created.id}`, {
    method: "PATCH", body: JSON.stringify(updateBody),
  }), context);
  assert.equal(jobs.length, 2);
  assert.equal(jobs[1]?.body, "Met Ada again");
  assert.equal((await detail.PATCH(new Request(`https://orbit.local/api/notes/${created.id}`, {
    method: "PATCH", body: JSON.stringify({ usedForPlan: false, expectedVersion: 2, idempotencyKey: "c11:disable" }),
  }), context)).status, 200);
  assert.equal(jobs.length, 2);
});

test("HTTP PATCH echoes a stored future token unchanged but rejects a rewritten token", async () => {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  const repository = createNoteRepository({ store, workspaceId });
  const noteId = "note:future";
  const future = { entityType: "future", futureId: "future:1", start: 0, end: 4, displayText: "Note" };
  await repository.saveIfAbsent({
    schemaVersion: 2,
    note: {
      id: noteId, accountId: actorId, ownerUserId: actorId, title: "Future", body: "Note for later",
      manualContactIds: [], mentions: [future as never], contactIds: [], eventIds: [], version: 1,
      createdAt: now, updatedAt: now,
    }, operations: [],
  });
  const detail = createNoteDetailHandlers({ ...dependencies(), service: createNoteService({ repository }) });
  const context = { params: Promise.resolve({ id: noteId }) };
  const kept = await detail.PATCH(new Request(`https://orbit.local/api/notes/${noteId}`, {
    method: "PATCH", body: JSON.stringify({ mentions: [future], noteKind: "meeting", expectedVersion: 1, idempotencyKey: "future:keep" }),
  }), context);
  assert.equal(kept.status, 200);
  assert.deepEqual((await json(kept)).data.note.mentions, [future]);
  const forged = await detail.PATCH(new Request(`https://orbit.local/api/notes/${noteId}`, {
    method: "PATCH", body: JSON.stringify({ mentions: [{ ...future, futureId: "future:fake" }], expectedVersion: 2, idempotencyKey: "future:fake" }),
  }), context);
  assert.equal(forged.status, 400);
  const newUnknown = await createNoteCollectionHandlers({ ...dependencies(), service: createNoteService({ repository }) }).POST(
    new Request("https://orbit.local/api/notes", {
      method: "POST", body: JSON.stringify({ body: "Note for later", mentions: [future], idempotencyKey: "future:new" }),
    }),
  );
  assert.equal(newUnknown.status, 400);
});

test("QA-D: deletes a note, guards a stale version, and hides it afterwards", async () => {
  const deps = dependencies();
  const collection = createNoteCollectionHandlers(deps);
  const created = (await json(await collection.POST(new Request("https://orbit.local/api/notes", {
    body: JSON.stringify({ body: "削除するメモ", idempotencyKey: "api:create:delete" }),
    method: "POST",
  })))).data.note;
  const detail = createNoteDetailHandlers(deps);
  const params = { params: Promise.resolve({ id: created.id }) };
  const stale = await detail.DELETE(new Request(`https://orbit.local/api/notes/${created.id}?expectedVersion=2`, { method: "DELETE" }), params);
  assert.equal(stale.status, 409);
  const deleted = await detail.DELETE(new Request(`https://orbit.local/api/notes/${created.id}?expectedVersion=1`, { method: "DELETE" }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(deleted.status, 200);
  assert.equal((await json(deleted)).data.deleted, true);
  const after = await detail.GET(new Request(`https://orbit.local/api/notes/${created.id}`), { params: Promise.resolve({ id: created.id }) });
  assert.equal(after.status, 404);
  const list = await collection.GET(new Request("https://orbit.local/api/notes"));
  assert.deepEqual((await json(list)).data.notes, []);
  const again = await detail.DELETE(new Request(`https://orbit.local/api/notes/${created.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(again.status, 404);
  const strangers = createNoteDetailHandlers({ ...deps, resolveActor: async () => ({ id: "account:other", workspaceId }) });
  const other = await strangers.DELETE(new Request(`https://orbit.local/api/notes/${created.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: created.id }) });
  assert.equal(other.status, 404);
});
