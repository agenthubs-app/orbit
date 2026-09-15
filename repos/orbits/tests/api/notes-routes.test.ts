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

test("DELETE requires authentication before parsing the note mutation body", async () => {
  const response = await createNoteDetailHandlers(dependencies(null)).DELETE(
    new Request("https://orbit.local/api/notes/note:private", {
      body: "{broken",
      method: "DELETE",
    }),
    { params: Promise.resolve({ id: "note:private" }) },
  );
  assert.equal(response.status, 401);
  assert.equal((await json(response)).error.code, "UNAUTHORIZED");
});

test("DELETE requires expectedVersion and idempotencyKey through the shared envelope", async () => {
  const detail = createNoteDetailHandlers(dependencies());
  for (const body of [
    { idempotencyKey: "delete:missing-version" },
    { expectedVersion: 1 },
    { expectedVersion: 1, idempotencyKey: "delete:extra", actorId: "account:other" },
  ]) {
    const response = await detail.DELETE(new Request("https://orbit.local/api/notes/note:missing", {
      body: JSON.stringify(body),
      method: "DELETE",
    }), { params: Promise.resolve({ id: "note:missing" }) });
    assert.equal(response.status, 400);
    assert.equal((await json(response)).error.code, "VALIDATION_ERROR");
  }
});

test("DELETE is actor scoped, idempotent and hides the deleted note from GET and list", async () => {
  const owner = dependencies();
  const collection = createNoteCollectionHandlers(owner);
  const created = (await json(await collection.POST(new Request("https://orbit.local/api/notes", {
    body: JSON.stringify({ body: "删除 API", idempotencyKey: "api:create:delete" }),
    method: "POST",
  })))).data.note;
  const context = { params: Promise.resolve({ id: created.id }) };
  const attacker = { ...owner, resolveActor: async () => ({ id: "account:other", workspaceId }) };
  const denied = await createNoteDetailHandlers(attacker).DELETE(new Request(`https://orbit.local/api/notes/${created.id}`, {
    body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "api:delete:attacker" }),
    method: "DELETE",
  }), context);
  assert.equal(denied.status, 404);
  assert.equal((await json(denied)).error.code, "NOT_FOUND");

  const detail = createNoteDetailHandlers(owner);
  const request = () => new Request(`https://orbit.local/api/notes/${created.id}`, {
    body: JSON.stringify({ expectedVersion: 1, idempotencyKey: "api:delete:owner" }),
    method: "DELETE",
  });
  const deleted = await detail.DELETE(request(), context);
  assert.equal(deleted.status, 200);
  assert.equal((await json(deleted)).data.note.version, 2);
  assert.equal((await detail.DELETE(request(), context)).status, 200);
  assert.equal((await detail.GET(new Request(`https://orbit.local/api/notes/${created.id}`), context)).status, 404);
  assert.deepEqual((await json(await collection.GET(new Request("https://orbit.local/api/notes")))).data.notes, []);
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
