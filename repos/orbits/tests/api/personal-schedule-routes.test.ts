import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createPersonalScheduleHandlers } from "../../app/api/schedule-items/personal-handler";

function fixture() {
  let actorId = "c0010-owner";
  let now = "2026-09-14T00:00:00Z";
  const service = createPersonalScheduleService({ store: createMemoryLiveRecordStore(), workspaceId: "c0010", now: () => now });
  const handlers = createPersonalScheduleHandlers({ service, resolveActor: async () => actorId ? { id: actorId } : null });
  const request = (method: string, body?: object) => new Request("https://orbit.test/api/schedule-items", { method, ...(body ? { body: JSON.stringify(body) } : {}) });
  const create = () => handlers.POST(request("POST", { title: "Personal review", startsAt: "2026-09-14T15:30:00Z", endsAt: "2026-09-14T16:00:00Z", location: "Kyoto", idempotencyKey: "create" }));
  return { service, handlers, request, create, setActor: (value: string) => actorId = value, setNow: (value: string) => now = value };
}

test("personal schedule create, replay, null clearing, version conflict and delete round trip", async () => {
  const f = fixture(); const first = await f.create(); assert.equal(first.status, 201);
  const item = (await first.json()).data.scheduleItem;
  assert.equal(item.kind, "personal"); assert.equal(item.ownerUserId, "c0010-owner"); assert.equal(item.sourceId, item.id);
  assert.equal((await (await f.create()).json()).data.scheduleItem.id, item.id);
  assert.equal((await f.service.list({ actorId: "c0010-owner" })).length, 1);
  const context = { params: Promise.resolve({ id: item.id }) };
  const body = { expectedUpdatedAt: item.updatedAt, idempotencyKey: "edit", patch: { startsAt: "2026-09-15T00:30:00Z", endsAt: null, location: null } };
  const updated = await f.handlers.PATCH(f.request("PATCH", body), context); assert.equal(updated.status, 200);
  const record = (await (await f.handlers.GET(f.request("GET"), context)).json()).data.scheduleItem;
  assert.equal(record.startsAt, body.patch.startsAt); assert.equal(Object.hasOwn(record, "location"), false); assert.equal(Object.hasOwn(record, "endsAt"), false);
  assert.equal((await f.handlers.PATCH(f.request("PATCH", { ...body, idempotencyKey: "stale" }), context)).status, 409);
  assert.equal((await f.handlers.PATCH(f.request("PATCH", { ...body, patch: { title: "Reused" } }), context)).status, 409);
  assert.equal((await f.handlers.DELETE(f.request("DELETE", { expectedUpdatedAt: record.updatedAt, idempotencyKey: "delete" }), context)).status, 200);
  assert.equal((await f.handlers.GET(f.request("GET"), context)).status, 404);
  assert.equal((await f.service.list({ actorId: "c0010-owner" })).length, 0);
});

test("personal schedules reject unauthenticated, cross-actor, malformed and unknown mutations", async () => {
  const f = fixture(); const item = (await (await f.create()).json()).data.scheduleItem; const context = { params: Promise.resolve({ id: item.id }) };
  f.setActor("other"); assert.equal((await f.handlers.GET(f.request("GET"), context)).status, 404);
  assert.equal((await f.handlers.DELETE(f.request("DELETE", { expectedUpdatedAt: item.updatedAt, idempotencyKey: "foreign" }), context)).status, 404);
  f.setActor(""); assert.equal((await f.handlers.POST(f.request("POST", {}))).status, 401);
  f.setActor("c0010-owner");
  for (const patch of [{ startsAt: "2026-09-15" }, { startsAt: null }, { location: "" }, { ownerUserId: "other" }, { endsAt: "2026-09-01T00:00:00Z" }]) {
    assert.equal((await f.handlers.PATCH(f.request("PATCH", { expectedUpdatedAt: item.updatedAt, patch, idempotencyKey: JSON.stringify(patch) }), context)).status, 400);
  }
  assert.equal((await f.service.list({ actorId: "c0010-owner" }))[0].title, item.title);
});

test("web personal client uses real handlers and retains a lost-response retry key", async () => {
  const { createPersonalScheduleClient } = await import("../../app/(app)/app/tasks/personal-schedule-client");
  const f = fixture(); const writes: any[] = []; let lose = true;
  const client = createPersonalScheduleClient("c0010-owner", async (url: any, init: any = {}) => {
    const req = new Request(new URL(url, "https://orbit.test"), init); const method = init.method ?? "GET";
    const id = decodeURIComponent(req.url.split("/").at(-1)!); const context = { params: Promise.resolve({ id }) };
    if (method !== "GET") writes.push(JSON.parse(init.body));
    const result = method === "POST" ? await f.handlers.POST(req) : method === "PATCH" ? await f.handlers.PATCH(req, context) : method === "DELETE" ? await f.handlers.DELETE(req, context) : await f.handlers.GET(req, context);
    if (lose) { lose = false; throw new Error("lost response after commit"); } return result;
  });
  const fields = { title: "Web personal", startsAt: "2026-09-17T00:30:00Z", location: "Web location" };
  await assert.rejects(client.save(null, fields)); const item = await client.save(null, fields);
  assert.equal(writes[0].idempotencyKey, writes[1].idempotencyKey); assert.equal((await f.service.list({ actorId: "c0010-owner" })).length, 1);
  const updated = await client.save(item, { location: null }); assert.equal((await client.get(item.id)).location, undefined);
  await client.remove(updated); await assert.rejects(client.get(item.id));
});
