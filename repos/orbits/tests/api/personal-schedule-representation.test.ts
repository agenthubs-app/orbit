import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { createPersonalScheduleHandlers } from "../../app/api/schedule-items/personal-handler";
import { createScheduleItemsGetHandler } from "../../app/api/schedule-items/handler";

const owner = "schedule-0053-owner";
function fixture(associationReader?: { accessibleIds(input: { actorId: string; kind: "contact" | "note"; ids: readonly string[] }): Promise<readonly string[]> }) {
  const service = createPersonalScheduleService({ store: createMemoryLiveRecordStore(), workspaceId: "schedule-0053", now: () => "2026-09-17T00:00:00Z", ...(associationReader ? { associationReader } : {}) });
  const handlers = createPersonalScheduleHandlers({ service, resolveActor: async () => ({ id: owner }) });
  const request = (method: string, body?: object, version = "2") => new Request("https://orbit.test/api/schedule-items", {
    method, headers: version ? { "x-orbit-personal-schedule-version": version } : {}, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { service, handlers, request };
}

test("opt-in metadata survives independent reads and legacy title patches without leaking into v1", async () => {
  const f = fixture();
  const response = await f.handlers.POST(f.request("POST", {
    title: "Private schedule", startsAt: "2026-09-17T15:00:00Z", endsAt: "2026-09-18T15:00:00Z",
    allDay: true, timeZone: "Asia/Tokyo", meetingMethod: "video", meetingUrl: "https://meet.example.test/room", idempotencyKey: "metadata",
  }));
  assert.equal(response.status, 201);
  const item = (await response.json()).data.scheduleItem;
  assert.equal(item.allDay, true);
  assert.equal(item.timeZone, "Asia/Tokyo");
  assert.equal(item.meetingUrl, "https://meet.example.test/room");
  const context = { params: Promise.resolve({ id: item.id }) };
  const read = (await (await f.handlers.GET(f.request("GET"), context)).json()).data.scheduleItem;
  assert.equal(read.meetingUrl, item.meetingUrl);
  const legacy = (await (await f.handlers.GET(f.request("GET", undefined, ""), context)).json()).data.scheduleItem;
  assert.deepEqual(Object.keys(legacy).sort(), ["accountId", "category", "createdAt", "endsAt", "id", "kind", "ownerUserId", "sourceId", "startsAt", "state", "title", "updatedAt"].sort());
  const patched = await f.handlers.PATCH(f.request("PATCH", { expectedUpdatedAt: item.updatedAt, idempotencyKey: "legacy-title", patch: { title: "Changed" } }, ""), context);
  assert.equal(patched.status, 200);
  assert.equal(Object.hasOwn((await patched.json()).data.scheduleItem, "meetingUrl"), false);
  const latest = (await (await f.handlers.GET(f.request("GET"), context)).json()).data.scheduleItem;
  assert.equal(latest.title, "Changed");
  assert.equal(latest.allDay, true);
  assert.equal(latest.meetingUrl, item.meetingUrl);
  const cleared = await f.handlers.PATCH(f.request("PATCH", { expectedUpdatedAt: latest.updatedAt, idempotencyKey: "clear", patch: { allDay: false, meetingUrl: null, timeZone: null } }), context);
  assert.equal(cleared.status, 200);
  const final = (await cleared.json()).data.scheduleItem;
  assert.equal(final.allDay, false);
  assert.equal(Object.hasOwn(final, "meetingUrl"), false);
  assert.equal(Object.hasOwn(final, "timeZone"), false);
});

test("private associations validate current access on writes and survive legacy edits without external mutations", async () => {
  const permitted = { contact: new Set(["contact:owned"]), note: new Set(["note:owned"]) };
  const f = fixture({ async accessibleIds({ actorId, kind, ids }) { assert.equal(actorId, owner); return ids.filter(id => permitted[kind].has(id)); } });
  const created = await f.handlers.POST(f.request("POST", { title: "Associated", startsAt: "2026-09-18T09:00:00Z", contactIds: ["contact:owned"], noteIds: ["note:owned"], idempotencyKey: "relations" }));
  assert.equal(created.status, 201);
  const item = (await created.json()).data.scheduleItem;
  assert.deepEqual(item.contactIds, ["contact:owned"]);
  assert.deepEqual(item.noteIds, ["note:owned"]);
  const context = { params: Promise.resolve({ id: item.id }) };
  const invalid = await f.handlers.PATCH(f.request("PATCH", { expectedUpdatedAt: item.updatedAt, idempotencyKey: "foreign", patch: { noteIds: ["note:foreign"] } }), context);
  assert.equal(invalid.status, 400);
  permitted.note.clear();
  const forbidden = await f.handlers.PATCH(f.request("PATCH", { expectedUpdatedAt: item.updatedAt, idempotencyKey: "revoked", patch: { title: "Unsafe retained relation" } }), context);
  assert.equal(forbidden.status, 400);
  const cleared = await f.handlers.PATCH(f.request("PATCH", { expectedUpdatedAt: item.updatedAt, idempotencyKey: "remove-revoked", patch: { noteIds: [], contactIds: [] } }), context);
  assert.equal(cleared.status, 200);
  assert.deepEqual((await cleared.json()).data.scheduleItem.noteIds, []);
});

test("metadata validation rejects unsafe URLs, unknown zones and fake all-day ranges without persisting", async () => {
  const f = fixture();
  for (const fields of [
    { meetingUrl: "javascript:alert(1)" }, { meetingUrl: "https://user:secret@meet.example.test/" },
    { timeZone: "Invalid/Zone" }, { allDay: true, timeZone: "Asia/Tokyo" },
    { contactIds: ["foreign-contact"] }, { noteIds: ["foreign-note"] },
  ]) {
    const response = await f.handlers.POST(f.request("POST", { title: "Invalid", startsAt: "2026-09-17T09:30:00Z", endsAt: "2026-09-17T10:00:00Z", ...fields, idempotencyKey: JSON.stringify(fields) }));
    assert.equal(response.status, 400);
  }
  assert.equal((await f.service.list({ actorId: owner })).length, 0);
});

test("personal collection uses the same opt-in projection as detail and mutation responses", async () => {
  const f = fixture();
  await f.handlers.POST(f.request("POST", { title: "Collection", startsAt: "2026-09-18T09:00:00Z", timeZone: "Asia/Tokyo", meetingMethod: "video", meetingUrl: "https://meet.example.test/room", idempotencyKey: "collection" }));
  const get = createScheduleItemsGetHandler({ resolveActor: async () => ({ id: owner }), personalService: f.service });
  const url = "https://orbit.test/api/schedule-items?scope=personal";
  const v2 = (await (await get(new Request(url, { headers: { "x-orbit-personal-schedule-version": "2" } }))).json()).data.scheduleItems;
  assert.equal(v2[0].meetingUrl, "https://meet.example.test/room");
  const v1 = (await (await get(new Request(url))).json()).data.scheduleItems;
  assert.equal(Object.hasOwn(v1[0], "meetingUrl"), false);
  assert.equal(Object.hasOwn(v1[0], "timeZone"), false);
});

test("DST all-day intervals use local day boundaries rather than a fixed 24 hours", async () => {
  for (const [startsAt, endsAt, hours] of [
    ["2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z", 23],
    ["2026-11-01T04:00:00Z", "2026-11-02T05:00:00Z", 25],
    ["2018-11-04T03:00:00Z", "2018-11-05T02:00:00Z", 23],
  ] as const) {
    const f = fixture();
    const response = await f.handlers.POST(f.request("POST", { title: "DST", startsAt, endsAt, allDay: true, timeZone: startsAt.startsWith("2018") ? "America/Sao_Paulo" : "America/New_York", idempotencyKey: "dst" }));
    assert.equal(response.status, 201);
    const item = (await response.json()).data.scheduleItem;
    assert.equal((Date.parse(item.endsAt) - Date.parse(item.startsAt)) / 3_600_000, hours);
  }
});

test("aggregate boundary retains calendar truth but excludes private association and meeting-link metadata", async () => {
  const f = fixture({ async accessibleIds({ ids }) { return ids; } });
  await f.handlers.POST(f.request("POST", { title: "Aggregate", startsAt: "2026-09-17T15:00:00Z", endsAt: "2026-09-18T15:00:00Z", allDay: true, timeZone: "Asia/Tokyo", meetingMethod: "video", meetingUrl: "https://meet.example.test/private", noteIds: ["note:private"], contactIds: ["contact:private"], idempotencyKey: "aggregate" }));
  const get = createScheduleItemsGetHandler({ resolveActor: async () => ({ id: owner }), scheduleProvider: f.service });
  const items = (await (await get(new Request("https://orbit.test/api/schedule-items"))).json()).data.scheduleItems;
  assert.equal(items[0].allDay, true); assert.equal(items[0].timeZone, "Asia/Tokyo");
  assert.deepEqual(Object.keys(items[0]).sort(), ["id", "sourceId", "kind", "category", "state", "title", "startsAt", "endsAt", "allDay", "timeZone", "accountId", "ownerUserId", "createdAt", "updatedAt"].sort());
});

test("web v2 save verifies array receipt and independent GET and retains retry key after readback failure", async () => {
  const { createPersonalScheduleClient } = await import("../../app/(app)/app/tasks/personal-schedule-client");
  const f = fixture({ async accessibleIds({ ids }) { return ids; } }); const requests: { method: string; body: any; version: string | null }[] = []; let failRead = true;
  const client = createPersonalScheduleClient(owner, async (url, init) => {
    const request = new Request(new URL(String(url), "https://orbit.test"), init);
    const method = request.method; requests.push({ method, body: init?.body ? JSON.parse(String(init.body)) : null, version: request.headers.get("x-orbit-personal-schedule-version") });
    const context = { params: Promise.resolve({ id: decodeURIComponent(new URL(request.url).pathname.split("/").at(-1)!) }) };
    if (method === "GET" && failRead) return new Response(JSON.stringify({ success: false, error: { message: "Read unavailable" } }), { status: 503 });
    return method === "POST" ? f.handlers.POST(request) : f.handlers.GET(request, context);
  });
  const fields = { title: "Web v2", startsAt: "2026-09-18T09:00:00Z", noteIds: ["note:owned"], timeZone: "Asia/Tokyo", allDay: false };
  await assert.rejects(client.save(null, fields), /Read unavailable/);
  failRead = false; const saved = await client.save(null, fields);
  assert.deepEqual(saved.noteIds, ["note:owned"]);
  assert.deepEqual(requests.map(request => [request.method, request.version]), [["POST", "2"], ["GET", "2"], ["POST", "2"], ["GET", "2"]]);
  assert.equal(requests[0].body.idempotencyKey, requests[2].body.idempotencyKey);
});

test("web personal editor preserves metadata and converts DST all-day boundaries and duration shortcuts", async () => {
  const model = await import("../../app/(app)/app/tasks/personal-schedule-editor-model");
  const draft = { ...model.personalScheduleDraft(null, "America/New_York"), title: "DST", startDate: "2026-03-08", startTime: "09:00", allDay: true };
  const change = model.buildPersonalScheduleChange(null, draft, "America/New_York");
  assert.equal(change.kind, "ready"); if (change.kind !== "ready") return;
  assert.equal(change.fields.startsAt, "2026-03-08T05:00:00.000Z"); assert.equal(change.fields.endsAt, "2026-03-09T04:00:00.000Z"); assert.equal(change.fields.allDay, true);
  const duration = (model as any).applyPersonalScheduleDuration({ ...draft, allDay: false, startDate: "2026-09-17", startTime: "23:45" }, "Asia/Tokyo", 30);
  assert.deepEqual([duration.draft.endDate, duration.draft.endTime], ["2026-09-18", "00:15"]);
  assert.equal(model.buildPersonalScheduleChange(null, { ...draft, startDate: "2011-12-30" }, "Pacific/Apia").kind, "invalid");
});

test("production association reader uses current notes ownership and workspace and rejects deleted records", async () => {
  const { createPersonalScheduleAssociationReader } = await import("../../features/personal-schedule/association-reader");
  const { createNoteRepository } = await import("../../features/notes/repository");
  const { createNoteService } = await import("../../features/notes/service");
  const store = createMemoryLiveRecordStore<Record<string, unknown>>(); const workspaceId = "reader-0053";
  const notes = createNoteService({ repository: createNoteRepository({ store, workspaceId }) });
  const note = await notes.create({ actorId: owner, body: "Private source note", title: "Source title", now: "2026-09-17T00:00:00Z", idempotencyKey: "reader-note" });
  const reader = createPersonalScheduleAssociationReader({ store, workspaceId });
  const contactRecord = { workspaceId, collectionName: "contacts", recordId: "contact:owned", sourceType: "manual", sourceId: "contact:owned", userId: owner, evidenceIds: ["evidence:owned"], createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z", lifecycleState: "active" as const, payload: { id: "contact:owned", displayName: "Owned", stage: "active", source: { type: "manual", id: "source:owned" }, evidenceIds: ["evidence:owned"], createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" } };
  await store.upsertRecord(contactRecord);
  assert.deepEqual(await reader.accessibleIds({ actorId: owner, kind: "contact", ids: ["contact:owned"] }), ["contact:owned"]);
  assert.deepEqual(await reader.accessibleIds({ actorId: "other", kind: "contact", ids: ["contact:owned"] }), []);
  await store.upsertRecord({ ...contactRecord, userId: "other" });
  assert.deepEqual(await reader.accessibleIds({ actorId: owner, kind: "contact", ids: ["contact:owned"] }), []);
  assert.deepEqual(await reader.accessibleIds({ actorId: owner, kind: "note", ids: [note.id, "missing"] }), [note.id]);
  assert.deepEqual(await reader.accessibleIds({ actorId: "other", kind: "note", ids: [note.id] }), []);
  assert.deepEqual(await createPersonalScheduleAssociationReader({ store, workspaceId: "other-workspace" }).accessibleIds({ actorId: owner, kind: "note", ids: [note.id] }), []);
  await store.deleteRecord({ workspaceId, collectionName: "notes", recordId: note.id, deletedAt: "2026-09-18T00:00:00Z" });
  assert.deepEqual(await reader.accessibleIds({ actorId: owner, kind: "note", ids: [note.id] }), []);
});

test("actual schedule.query reads extended canonical record without exporting private relations or meeting URL", async () => {
  const { executeActorScopedQuery } = await import("../../features/orbit-ai/data-query/query-service");
  const store = createMemoryLiveRecordStore<Record<string, unknown>>(); const workspaceId = "query-0053";
  const service = createPersonalScheduleService({ store, workspaceId, now: () => "2026-09-17T00:00:00Z", associationReader: { async accessibleIds({ ids }) { return ids; } } });
  const item = await service.create(owner, { title: "Query personal", startsAt: "2026-09-17T15:00:00Z", endsAt: "2026-09-18T15:00:00Z", allDay: true, timeZone: "Asia/Tokyo", meetingUrl: "https://meet.example.test/private", noteIds: ["note:private"], contactIds: ["contact:private"], idempotencyKey: "query-record" });
  const result = await executeActorScopedQuery({ actorId: owner, toolName: "schedule.query", input: { operation: "list", query: "My schedule" }, store, workspaceId });
  assert.equal(result.items.length, 1); assert.equal(result.items[0]?.id, item.scheduleItem.id); assert.equal(result.items[0]?.allDay, true); assert.equal(result.items[0]?.timeZone, "Asia/Tokyo");
  for (const field of ["meetingUrl", "noteIds", "contactIds"]) assert.equal(Object.hasOwn(result.items[0]!, field), false);
});

test("canonical metadata validation does not accept unsafe URLs or duplicate association IDs", async () => {
  const { canonicalScheduleItemSchema } = await import("../../features/personal-schedule/authority-contract");
  const item = { id: "personal:strict", sourceId: "personal:strict", accountId: owner, ownerUserId: owner, kind: "personal", category: "personal", state: "upcoming", title: "Strict", startsAt: "2026-09-17T00:00:00Z", createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" };
  assert.equal(canonicalScheduleItemSchema.safeParse({ ...item, meetingUrl: "https://meet.example.test/room", noteIds: ["note:owned"] }).success, true);
  for (const metadata of [{ meetingUrl: "javascript:alert(1)" }, { meetingUrl: "https://user:secret@meet.example.test" }, { noteIds: ["note:owned", "note:owned"] }, { contactIds: ["x".repeat(301)] }]) assert.equal(canonicalScheduleItemSchema.safeParse({ ...item, ...metadata }).success, false);
});

test("web personal decoder rejects negative durations in an otherwise well-shaped read", async () => {
  const { createPersonalScheduleClient } = await import("../../app/(app)/app/tasks/personal-schedule-client");
  const item = { id: "personal:invalid", sourceId: "personal:invalid", accountId: owner, ownerUserId: owner, kind: "personal", category: "personal", state: "upcoming", title: "Invalid", startsAt: "2026-09-17T00:00:00Z", endsAt: "2026-09-16T00:00:00Z", createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" };
  const client = createPersonalScheduleClient(owner, async () => Response.json({ success: true, data: { scheduleItem: item } }));
  await assert.rejects(client.get(item.id), /时间/);
});
