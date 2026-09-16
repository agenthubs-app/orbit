import assert from "node:assert/strict";
import test from "node:test";
import { buildContactInitialization, readContactInitialization, contactInitializationReceipt } from "../src/api/relationship-initialization";
import { createContactInitializationController } from "../src/view-models/relationship-initialization";
import type { OrbitApiClient } from "../src/api/client";
import { createOrbitApiClient } from "../src/api/client";
import { contactDetailEditorFrom, buildContactDetailEditRequest } from "../src/view-models/contact-detail-editor";
import { contactsPipelineToView } from "../src/view-models/contact-pipeline";

const revision = "a".repeat(64), actorId = "owner", contactId = "contact:/one", connectionId = "connection:one";
const pending = { state: "pending" as const, revision, connectionId };
const draft = { stage: "" as const, goal: "", title: "", date: "", time: "", archiveConfirmed: false };
const identity = { actorId, contactId, connectionId, version: 1, createdAt: "2026-09-17T00:00:00Z", updatedAt: "2026-09-17T00:00:00Z" };
const snapshot = { connection: { ...identity, stage: "active" as const, activeGoal: "A real goal" }, tasks: [] };
const ok = (data: unknown) => ({ success: true as const, status: 200, data, meta: {} });
const error = (status: number, code: string) => ({ success: false as const, status, error: { code, message: code }, meta: {} });
const body = () => buildContactInitialization(pending, { ...draft, stage: "active", goal: "A real goal" }, "Asia/Shanghai", "key:one", "task:one");

test("no default choice, goal, date or rolled-over local time; archive is explicit", () => {
  assert.throws(() => buildContactInitialization(pending, draft, "Asia/Shanghai", "key", "task"));
  assert.throws(() => buildContactInitialization(pending, { ...draft, stage: "active" }, "Asia/Shanghai", "key", "task"));
  assert.throws(() => buildContactInitialization(pending, { ...draft, stage: "nurture", title: "Follow up", date: "2026-02-30", time: "12:00" }, "Asia/Shanghai", "key", "task"));
  assert.throws(() => buildContactInitialization(pending, { ...draft, stage: "archived" }, "Asia/Shanghai", "key", "task"));
  const request = buildContactInitialization(pending, { ...draft, stage: "nurture", title: "Follow up", date: "2026-10-01", time: "15:00" }, "Asia/Shanghai", "key", "task");
  assert.deepEqual(request.choice, { stage: "nurture", nextTask: { taskId: "task", title: "Follow up", dueAt: "2026-10-01T07:00:00.000Z" } });
});

test("read and receipt verify contact, actor, connection and exact requested goal", () => {
  assert.ok(readContactInitialization({ state: "initialized", snapshot }, actorId, contactId));
  assert.equal(readContactInitialization({ state: "initialized", snapshot }, "other", contactId), null);
  assert.ok(contactInitializationReceipt({ snapshot, replayed: true }, actorId, contactId, connectionId, body()));
  for (const changed of [{ actorId: "other" }, { contactId: "other" }, { connectionId: "other" }, { activeGoal: "wrong" }]) {
    assert.equal(contactInitializationReceipt({ snapshot: { ...snapshot, connection: { ...snapshot.connection, ...changed } }, replayed: false }, actorId, contactId, connectionId, body()), null);
  }
});

function controller(client: object, onConfirmed = () => {}, isCurrent = () => true) {
  let sequence = 0;
  return createContactInitializationController({ actorId, contactId, client: client as OrbitApiClient, isCurrent, onConfirmed, createId: () => `id:${++sequence}` });
}
test("lost ACK locks intent; retries identical body/key/task, duplicate submits coalesce, refresh confirms ready", async () => {
  const bodies: unknown[] = []; let confirmed = 0;
  const c = controller({ get: async () => bodies.length > 1 ? ok({ state: "initialized", snapshot }) : ok(pending), post: async (_path: string, options: { body: unknown }) => {
    bodies.push(options.body); return bodies.length === 1 ? error(503, "ACK_LOST") : ok({ snapshot, replayed: true });
  } }, () => confirmed++);
  await c.start();
  assert.deepEqual(c.getSnapshot().draft, draft);
  c.change({ stage: "active", goal: "A real goal" });
  await Promise.all([c.save("Asia/Shanghai", true), c.save("Asia/Shanghai", true)]);
  assert.equal(bodies.length, 1); assert.match(c.getSnapshot().error, /ACK_LOST/);
  c.change({ goal: "Must not change a pending intent" });
  await c.save("Asia/Shanghai", true);
  assert.deepEqual(bodies[0], bodies[1]); assert.equal(confirmed, 1);
  assert.equal(c.getSnapshot().notice, "replayed");
  await c.refresh(); assert.equal(c.getSnapshot().view.kind, "initialized");
});
test("GET 404 hides only ordinary contacts; other errors remain visible; POST 404 does not hide", async () => {
  for (const status of [404, 403, 500]) {
    const c = controller({ get: async () => error(status, "READ_ERROR") }); await c.start();
    assert.equal(c.getSnapshot().view.kind, status === 404 ? "hidden" : "error");
  }
  const c = controller({ get: async () => ok(pending), post: async () => error(404, "WRITE_NOT_FOUND") });
  await c.start(); c.change({ stage: "active", goal: "A real goal" }); await c.save("Asia/Shanghai", true);
  assert.equal(c.getSnapshot().view.kind, "pending"); assert.match(c.getSnapshot().error, /WRITE_NOT_FOUND/);
});
test("409 refresh new revision clears old intent and requires a new explicit choice", async () => {
  let rev = revision;
  const c = controller({ get: async () => ok({ ...pending, revision: rev }), post: async () => { rev = "b".repeat(64); return error(409, "REVISION_CONFLICT"); } });
  await c.start(); c.change({ stage: "active", goal: "A real goal" }); await c.save("Asia/Shanghai", true);
  await c.refresh(); assert.deepEqual(c.getSnapshot().draft, draft); assert.equal(c.getSnapshot().locked, false);
});
test("leaving actor/cookie/baseURL scope aborts and late ACK never calls previous owner refresh", async () => {
  let finish!: (v: unknown) => void; let confirmed = 0; let current = true; let signal: AbortSignal | undefined;
  const c = controller({ get: async () => ok(pending), post: async (_path: string, options: { signal: AbortSignal }) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); } }, () => confirmed++, () => current);
  await c.start(); c.change({ stage: "active", goal: "A real goal" });
  const saving = c.save("Asia/Shanghai", true); current = false; c.dispose();
  assert.equal(signal?.aborted, true); finish(ok({ snapshot, replayed: false })); await saving;
  assert.equal(confirmed, 0); assert.notEqual(c.getSnapshot().view.kind, "initialized");
});
test("ready retains private edit but rejects legacy stage mutation; pending never enters canonical pipeline", () => {
  const contact = { id: contactId, displayName: "QA", role: "", organization: "", location: "", relationshipContext: "", nextAction: "", status: "active", lifecycleInitialization: "ready", source: { type: "event_import", label: "QA" }, tags: [], evidence: [], notes: [], publicProfile: { bio: "", offering: [], seeking: [], topics: [], conversationPrompts: [] }, lastInteraction: { channel: "event_note", occurredAt: "2026-09-17", summary: "" } };
  const editor = contactDetailEditorFrom({ state: "success", contact, editableStatusOptions: ["active", "archived"] }, contactId);
  assert.ok(editor); assert.deepEqual(editor.statusOptions, []);
  assert.equal(buildContactDetailEditRequest(editor, { ...editor.draft, status: "archived" }).success, false);
  assert.deepEqual(buildContactDetailEditRequest(editor, { ...editor.draft, tags: ["private"] }), { success: true, body: { tags: ["private"] } });
  const view = contactsPipelineToView({ contactsPayload: { contacts: [{ ...contact, lifecycleInitialization: "pending" }] }, connectionsPayload: { connections: [] } });
  assert.equal(view.stages.flatMap(stage => stage.contacts).length, 0);
  const readyView = contactsPipelineToView({ contactsPayload: { contacts: [contact] }, connectionsPayload: { connections: [{ id: connectionId, contactId, relationshipStage: "active" }] } });
  assert.deepEqual(readyView.stages.flatMap(stage => stage.contacts)[0]?.stageActions, []);
});

test("real API client sends scoped cookie/base URL and encoded contact, without actor in the write body", async () => {
  const calls: Array<{ url: string; cookie: string; method: string | undefined; credentials: RequestCredentials | undefined; body?: string }> = [];
  for (const [origin, cookie] of [["https://one.invalid", "session=one"], ["https://two.invalid", "session=two"]] as const) {
    const client = createOrbitApiClient({ baseUrl: origin, authCookieHeader: cookie, fetchImpl: async (url, init) => {
      calls.push({ url: String(url), cookie: new Headers(init?.headers).get("cookie") ?? "", method: init?.method, credentials: init?.credentials, ...(typeof init?.body === "string" ? { body: init.body } : {}) });
      return Response.json({ success: true, data: init?.method === "POST" ? { snapshot, replayed: false } : pending });
    } });
    const c = controller(client); await c.start(); c.change({ stage: "active", goal: "A real goal" }); await c.save("Asia/Shanghai", true); c.dispose();
  }
  assert.equal(calls.length, 4);
  for (const [index, call] of calls.entries()) {
    assert.equal(call.url, `${index < 2 ? "https://one.invalid" : "https://two.invalid"}/api/contacts/contact%3A%2Fone/relationship-initialization`);
    assert.equal(call.cookie, index < 2 ? "session=one" : "session=two");
    assert.equal(call.credentials, "omit");
    if (call.body) assert.equal("actorId" in JSON.parse(call.body), false);
  }
});

test("same revision refresh after uncertain write preserves exact intent even if device time zone changes", async () => {
  const bodies: unknown[] = [];
  const c = controller({ get: async () => ok(pending), post: async (_path: string, options: { body: unknown }) => { bodies.push(options.body); return error(503, "LOST"); } });
  await c.start(); c.change({ stage: "needs_follow_up", title: "Meet", date: "2026-10-01", time: "15:00" });
  await c.save("Asia/Shanghai", true); await c.refresh(); await c.save("America/New_York", false);
  assert.deepEqual(bodies[0], bodies[1]); assert.equal(c.getSnapshot().locked, true);
});

test("invalid receipt, late GET and cold initialized read do not manufacture a pending/ready result", async () => {
  const c = controller({ get: async () => ok(pending), post: async () => ok({ snapshot: { ...snapshot, connection: { ...snapshot.connection, actorId: "other" } }, replayed: false }) });
  await c.start(); c.change({ stage: "active", goal: "A real goal" }); await c.save("Asia/Shanghai", true);
  assert.equal(c.getSnapshot().view.kind, "pending"); assert.match(c.getSnapshot().error, /INVALID_RESPONSE/);
  let finish!: (value: unknown) => void;
  const late = controller({ get: () => new Promise(resolve => { finish = resolve; }) });
  const loading = late.start(); late.dispose(); finish(ok(pending)); await loading;
  assert.equal(late.getSnapshot().view.kind, "loading");
  const cold = controller({ get: async () => ok({ state: "initialized", snapshot }) });
  await cold.start(); assert.equal(cold.getSnapshot().view.kind, "initialized"); assert.equal(cold.getSnapshot().draft.stage, "");
});
