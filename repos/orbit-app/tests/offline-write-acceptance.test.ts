import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { buildOfflineMessageMutation } from "../src/data/sync/message-outbox-mutation";
import { buildOfflineNoteMutation } from "../src/data/sync/note-outbox-mutation";
import { buildOfflineScheduleMutation } from "../src/data/sync/schedule-outbox-mutation";
import { buildOfflineTaskMutation } from "../src/data/sync/task-outbox-mutation";
import { createDevice, createHost, launchApp, openSession, settle, type Device, type Host } from "./helpers/offline-write-host";

// Sprint 0136 — the offline-write acceptance matrix (design step 11, D14).
// Four kinds pending at once (notes, personal tasks, personal schedule,
// messages), then each accident: a killed process, a cold start while the
// server is unreachable, reconnect, server rejection, a runtime 401, logout
// through the vault, switching account with the confirm, reinstall, and a
// conflict in each kind. Every cell asserts: nothing lost, nothing applied
// twice on the server, nothing crosses into another account.
const A = "account-a";
const B = "account-b";
const CONVERSATION = "relationship-conversation:ab";
const uuid = (n: number) => `local:${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const at = (offset: number) => new Date(Date.parse("2026-10-03T09:00:00.000Z") + offset).toISOString();

interface World { host: Host; device: Device; seeded: { task: Record<string, unknown>; item: Record<string, unknown>; note: Record<string, unknown> }; bBefore: string }

function world(t: TestContext): World {
  const host = createHost([A, B]);
  const device = createDevice();
  t.after(() => device.close());
  const task = host.webTask(A, { id: "task:a:seed", title: "Renew passport" });
  const item = host.webSchedule(A, { id: "personal:a:seed", title: "Dentist", startsAt: "2026-10-06T01:00:00.000Z" });
  const note = host.webNote(A, { id: "note:a:seed", title: "Seed", body: "web" });
  host.conversation(A, CONVERSATION, [A, B]);
  host.webTask(B, { id: "task:b:own", title: "B's own task" });
  host.webNote(B, { id: "note:b:own", title: "B's note", body: "private" });
  return { host, device, seeded: { task, item, note }, bBefore: host.snapshot(B) };
}

/** Queue one write in each kind (plus a dependent pair in notes→schedule and two messages) while the host is unreachable. */
async function queueFourKinds(session: ReturnType<ReturnType<typeof launchApp>["open"]>["session"], seeded: World["seeded"], tag = "w") {
  const noteId = uuid(1);
  await session.enqueueOfflineNoteMutation(buildOfflineNoteMutation({ mutationId: `${tag}-note-create`, entityId: noteId, operation: "create", baseRevision: null,
    requestBody: { title: "Three things", body: "quote, intro, revisit", manualContactIds: [], mentions: [], eventIds: [], idempotencyKey: `${tag}-note-create` }, createdAt: at(1) }));
  await session.enqueueOfflineNoteMutation(buildOfflineNoteMutation({ mutationId: `${tag}-note-edit`, entityId: seeded.note.id as string, operation: "update", baseRevision: "r1",
    requestBody: { body: "edited offline", expectedVersion: seeded.note.version, idempotencyKey: `${tag}-note-edit` }, createdAt: at(2) }));
  await session.enqueueOfflineTaskMutation(buildOfflineTaskMutation({ mutationId: `${tag}-task-create`, entityId: uuid(2), operation: "create", baseRevision: null,
    requestBody: { title: "Book Osaka hotel", category: "personal", idempotencyKey: `${tag}-task-create` }, createdAt: at(3) }));
  await session.enqueueOfflineTaskMutation(buildOfflineTaskMutation({ mutationId: `${tag}-task-complete`, entityId: seeded.task.id as string, operation: "complete", baseRevision: "r1",
    requestBody: { action: "complete", idempotencyKey: `${tag}-task-complete` }, createdAt: at(4) }));
  await session.enqueueOfflineScheduleMutation(buildOfflineScheduleMutation({ mutationId: `${tag}-schedule-create`, entityId: uuid(3), operation: "create", baseRevision: null,
    requestBody: { title: "Call Chen", startsAt: "2026-10-07T01:00:00.000Z", noteIds: [noteId], idempotencyKey: `${tag}-schedule-create` }, createdAt: at(5) }));
  await session.enqueueOfflineScheduleMutation(buildOfflineScheduleMutation({ mutationId: `${tag}-schedule-edit`, entityId: seeded.item.id as string, operation: "update", baseRevision: "r1",
    requestBody: { expectedUpdatedAt: seeded.item.updatedAt, patch: { title: "Dentist (moved)" }, idempotencyKey: `${tag}-schedule-edit` }, createdAt: at(6) }));
  await session.enqueueOfflineMessageMutation(buildOfflineMessageMutation({ requestId: `${tag}-message-1`, conversationId: CONVERSATION, body: "on my way", qualificationVersion: "qv_1", retireDraftThrough: null, createdAt: at(7) }));
  await session.enqueueOfflineMessageMutation(buildOfflineMessageMutation({ requestId: `${tag}-message-2`, conversationId: CONVERSATION, body: "ten minutes", qualificationVersion: "qv_1", retireDraftThrough: null, createdAt: at(8) }));
  return [`${tag}-note-create`, `${tag}-note-edit`, `${tag}-task-create`, `${tag}-task-complete`, `${tag}-schedule-create`, `${tag}-schedule-edit`, `${tag}-message-1`, `${tag}-message-2`];
}

/** Each key changed server data exactly once (a replay is answered from its receipt), and only for its own account. */
function assertExactlyOnce(host: Host, account: string, keys: readonly string[]) {
  for (const key of keys) {
    assert.equal(host.applied.get(`${account}:${key}`), 1, `${key} applied exactly once`);
    for (const other of host.state.keys()) if (other !== account) assert.equal(host.applied.get(`${other}:${key}`), undefined, `${key} never reached ${other}`);
  }
}

/** The server-side result of the eight writes, read back the way the web page reads it. */
function assertServerHasAllWrites(host: Host) {
  const a = host.account(A);
  const created = [...a.notes.values()].find(note => note.title === "Three things");
  assert.ok(created, "the offline note exists on the server");
  assert.equal(a.notes.get("note:a:seed")?.body, "edited offline");
  assert.ok([...a.tasks.values()].some(task => task.title === "Book Osaka hotel"));
  assert.equal(a.tasks.get("task:a:seed")?.status, "completed");
  const call = [...a.items.values()].find(item => item.title === "Call Chen");
  assert.deepEqual(call?.noteIds, [created!.id], "the schedule links the note's formal id, never local:");
  assert.equal(a.items.get("personal:a:seed")?.title, "Dentist (moved)");
  assert.deepEqual(a.messages.map(message => [message.seq, message.body]), [[1, "on my way"], [2, "ten minutes"]], "messages in order, once each");
  assert.equal(JSON.stringify([...a.notes.values(), ...a.items.values(), ...a.tasks.values()]).includes("local:"), false);
}

async function onlineApp(w: World, account = A) {
  const app = launchApp(w.device, w.host, account);
  assert.equal(await app.lifecycle.setScope({ baseUrl: "https://host.example", actorId: account }), true);
  const client = app.open();
  return { ...app, client };
}

test("one sync round after reconnect drains every queued write in all four kinds, in order, and the mirror updates after each acknowledgement", async t => {
  const w = world(t);
  const { client } = await onlineApp(w);
  assert.equal((await client.sync())?.error, null, "first online sync holds the lease and mirror");
  w.host.offline = true;
  const keys = await queueFourKinds(client.session, w.seeded);
  assert.equal((await client.queue()).length, 8);
  await client.sync();
  assert.equal(w.host.requests.length, 0, "nothing leaves the device while the host is unreachable");

  w.host.offline = false;
  const before = client.changes.length;
  const result = await client.sync();
  await settle();
  assert.equal(result?.error, null);
  assert.deepEqual(await client.queue(), [], "one round leaves nothing queued");
  assertExactlyOnce(w.host, A, keys);
  assertServerHasAllWrites(w.host);
  assert.ok(client.changes.slice(before).filter(type => type === "outbox").length >= keys.length, "every acknowledgement is announced to the screens");
  assert.equal(w.host.snapshot(B), w.bBefore, "account B is untouched");
});

/** Online app A, first sync, then the host goes away and eight writes in four kinds are queued. */
async function pendingInFourKinds(t: TestContext) {
  const w = world(t);
  const app = await onlineApp(w);
  assert.equal((await app.client.sync())?.error, null);
  w.host.offline = true;
  const keys = await queueFourKinds(app.client.session, w.seeded);
  await app.client.sync();
  assert.equal(w.host.requests.length, 0);
  return { w, app, keys };
}

async function reopen(w: World, account = A, options: { offlineMode?: boolean } = {}) {
  const app = launchApp(w.device, w.host, account);
  const opened = await app.lifecycle.setScope({ baseUrl: "https://host.example", actorId: account });
  const client = openSession(app.lifecycle, w.host, account, options);
  return { ...app, opened, client };
}

test("matrix · kill process mid-upload → cold start while unreachable → reconnect: the request the server already applied is replayed from its receipt, nothing twice", async t => {
  const { w, app, keys } = await pendingInFourKinds(t);
  w.host.offline = false;
  w.host.hangAfterApply.add("w-note-create");
  void app.client.sync(); // the process dies while the first note POST is in flight; this promise never settles
  for (let i = 0; i < 50 && !w.host.applied.get(`${A}:w-note-create`); i += 1) await settle();
  assert.equal(w.host.applied.get(`${A}:w-note-create`), 1, "the server applied the note before the app died");

  // Cold start while the host is unreachable: the last validated identity enters offline and must not upload.
  w.host.offline = true;
  const cold = await reopen(w, A, { offlineMode: true });
  assert.equal(cold.opened, true);
  await cold.client.sync();
  const survived = await cold.client.queue();
  assert.ok(survived.some(row => row.mutationId === "w-note-create"), "the interrupted write is still on the device");
  for (const key of keys) assert.ok(survived.some(row => row.mutationId === key) || w.host.applied.get(`${A}:${key}`) === 1, `${key} is either confirmed or still queued: nothing lost`);
  assert.ok((await cold.client.queue()).every(row => row.state === "queued"), "the interrupted attempt is queued again, not stuck as sending");
  cold.client.close();

  // Network back: the identity is confirmed online, one round uploads everything.
  w.host.offline = false;
  const online = openSession(cold.lifecycle, w.host, A);
  assert.equal((await online.sync())?.error, null);
  assert.deepEqual(await online.queue(), []);
  assertExactlyOnce(w.host, A, keys);
  assertServerHasAllWrites(w.host);
  assert.equal(w.host.snapshot(B), w.bBefore);
});

test("matrix · server rejection: a refused note create keeps its content and fails its linked schedule; every other write lands once", async t => {
  const { w, app, keys } = await pendingInFourKinds(t);
  w.host.offline = false;
  w.host.rejectKeys.set("w-note-create", 422); // the note create is refused for good (400/422: 未能保存)
  assert.equal((await app.client.sync())?.error, null);
  const queue = await app.client.queue();
  assert.deepEqual(queue.map(row => [row.mutationId, row.state, row.errorCode]).sort(), [
    ["w-note-create", "failed", "INVALID_REQUEST"],
    ["w-schedule-create", "failed", "NOTE_DEPENDENCY_FAILED"],
  ], "the refused note and the schedule that links it stay on the device, marked 未能保存");
  assertExactlyOnce(w.host, A, keys.filter(key => key !== "w-note-create" && key !== "w-schedule-create"));
  assert.equal([...w.host.account(A).notes.values()].some(note => note.title === "Three things"), false);
  assert.equal(w.host.snapshot(B), w.bBefore);
});

test("matrix · 5xx and timeouts are retried inside the round; nothing is dropped or doubled", async t => {
  const { w, app, keys } = await pendingInFourKinds(t);
  w.host.offline = false;
  w.host.rejectWrites.set(A, 503);
  assert.equal((await app.client.sync())?.error, null);
  for (let round = 0; round < 3 && (await app.client.queue()).length; round += 1) await app.client.sync();
  assert.deepEqual(await app.client.queue(), []);
  assertExactlyOnce(w.host, A, keys);
});

test("matrix · runtime 401: the round stops, the rejection path vaults the queue before erasing the mirror, and the same account's next sign-in uploads it once", async t => {
  const { w, app, keys } = await pendingInFourKinds(t);
  w.host.offline = false;
  w.host.unauthorized.add(A);
  const result = await app.client.sync();
  assert.notEqual(result?.error, null);
  assert.equal(w.host.applied.size, 0, "nothing applied under a revoked session");
  // The provider's rejection path (eraseRejectedIdentity → purgeSyncScope): archive, then purge.
  app.client.close();
  await settle();
  const { purgeSyncScope } = await import("../src/api/offline-identity");
  assert.equal(await purgeSyncScope(app.lifecycle, { baseUrl: "https://host.example", actorId: A }), true);
  assert.deepEqual(await app.lifecycle.pendingWriteSummary({ baseUrl: "https://host.example", actorId: A }), { currentAccount: 8, otherAccounts: 0 }, "the login page shows 8 pending changes");
  assert.equal([...w.device.files.keys()].some(name => name.startsWith("orbit-sync-")), false, "the mirror database is gone");

  w.host.unauthorized.delete(A);
  const again = await reopen(w, A);
  assert.equal((await again.client.sync())?.error, null);
  assert.deepEqual(await again.client.queue(), []);
  assertExactlyOnce(w.host, A, keys);
  assertServerHasAllWrites(w.host);
});

test("matrix · logout keeps the queue in the vault; the same account signing in again uploads it once; 「放弃修改并退出」 uploads nothing", async t => {
  const { w, app, keys } = await pendingInFourKinds(t);
  app.client.close();
  await settle();
  assert.equal(await app.lifecycle.setScope(null), true, "logout (加密保存并注销)");
  assert.deepEqual(await app.lifecycle.pendingWriteSummary(), { currentAccount: 0, otherAccounts: 8 });
  w.host.offline = false;
  const again = await reopen(w, A);
  assert.equal((await again.client.sync())?.error, null);
  assertExactlyOnce(w.host, A, keys);

  // The discard choice: the provider deletes the queue first, then logs out.
  const second = await pendingInFourKinds(t);
  second.app.client.close();
  await settle();
  await second.app.lifecycle.withDatabase({ baseUrl: "https://host.example", actorId: A }, database => database.transaction(async () => {
    await database.run("DELETE FROM sync_outbox"); await database.run("DELETE FROM sync_aliases");
  }));
  assert.equal(await second.app.lifecycle.setScope(null), true);
  assert.deepEqual(await second.app.lifecycle.pendingWriteSummary(), { currentAccount: 0, otherAccounts: 0 });
  second.w.host.offline = false;
  const fresh = await reopen(second.w, A);
  assert.equal((await fresh.client.sync())?.error, null);
  assert.equal(second.w.host.applied.size, 0, "discarded writes never reach the server");
});

test("matrix · switching account: 返回登录 keeps A's queue for A; 继续此账号 opens B without A's writes, A's vault waits and A uploads once later; B's data is unchanged", async t => {
  const { w, app, keys } = await pendingInFourKinds(t);
  app.client.close();
  await settle();
  assert.equal(await app.lifecycle.setScope(null), true);
  w.host.offline = false;
  // B signs in on the same phone: the login page asks first (pendingWriteSummary.otherAccounts > 0).
  assert.deepEqual(await app.lifecycle.pendingWriteSummary({ baseUrl: "https://host.example", actorId: B }), { currentAccount: 0, otherAccounts: 8 });
  // Cancel: nothing is opened for B; A signs back in and uploads.
  const backToA = await reopen(w, A);
  assert.equal((await backToA.client.sync())?.error, null);
  assertExactlyOnce(w.host, A, keys);
  backToA.client.close();
  await settle();

  // Second phone state: A queues again, logs out, and B chooses 「继续此账号」 (the 0124 dialog: A's changes stay encrypted on the phone).
  const second = await pendingInFourKinds(t);
  second.app.client.close();
  await settle();
  assert.equal(await second.app.lifecycle.setScope(null), true);
  second.w.host.offline = false;
  const asB = await reopen(second.w, B);
  assert.equal(asB.opened, true, "opening B erases A's mirror database");
  assert.equal([...second.w.device.files.keys()].filter(name => name.startsWith("orbit-sync-")).length, 1, "one identity's mirror on the phone");
  assert.equal((await asB.client.sync())?.error, null);
  assert.deepEqual(await asB.client.queue(), [], "B's queue never holds A's writes");
  assert.equal(second.w.host.applied.size, 0, "A's writes were not uploaded under B");
  assert.equal(second.w.host.snapshot(B), second.w.bBefore, "B's server data is unchanged");
  assert.deepEqual(await asB.lifecycle.pendingWriteSummary({ baseUrl: "https://host.example", actorId: A }), { currentAccount: 8, otherAccounts: 0 }, "A's eight writes wait in A's vault");
  asB.client.close();
  await settle();
  assert.equal(await asB.lifecycle.setScope(null), true);
  const aAgain = await reopen(second.w, A);
  assert.equal((await aAgain.client.sync())?.error, null);
  assert.deepEqual(await aAgain.client.queue(), []);
  assertExactlyOnce(second.w.host, A, second.keys);
  assert.equal(second.w.host.snapshot(B), second.w.bBefore);
});

test("matrix · reinstall: iOS deletes the app container; the kept Keychain entries do not break a fresh start, nothing stale is uploaded, the server is untouched", async t => {
  const { w, app } = await pendingInFourKinds(t);
  app.client.close();
  await settle();
  const keychainBefore = w.device.keys.size;
  assert.ok(keychainBefore > 0);
  w.device.uninstall();
  w.host.offline = false;
  const fresh = await reopen(w, A);
  assert.equal(fresh.opened, true);
  assert.equal((await fresh.client.sync())?.error, null);
  assert.deepEqual(await fresh.client.queue(), [], "unsent writes lived only in the deleted container (documented OS limit)");
  assert.equal(w.host.applied.size, 0);
  assert.ok((await fresh.client.records("task")).some(record => record.id === "task:a:seed"), "the server state is pulled again");
});

test("matrix · offline-read lease expired: writes are refused at save time (the page shows 需要联网), nothing is queued", async t => {
  const w = world(t);
  const app = await onlineApp(w);
  assert.equal((await app.client.sync())?.error, null);
  // The stored lease is older than its offline-read window: overwrite it as the device would hold it after 7 days.
  await app.lifecycle.withDatabase({ baseUrl: "https://host.example", actorId: A }, async database => {
    const row = await database.get<{ value: string }>("SELECT value FROM sync_meta WHERE key = 'offline_read_lease'");
    assert.ok(row, "the lease is stored");
    const lease = JSON.parse(row.value);
    lease.offlineReadExpiresAt = Date.now() - 1000;
    await database.run("UPDATE sync_meta SET value = ? WHERE key = 'offline_read_lease'", [JSON.stringify(lease)]);
  });
  w.host.offline = true;
  const cold = await reopen(w, A, { offlineMode: true });
  await assert.rejects(cold.client.session.enqueueOfflineTaskMutation(buildOfflineTaskMutation({ mutationId: "late", entityId: uuid(9), operation: "create", baseRevision: null,
    requestBody: { title: "late", category: "personal", idempotencyKey: "late" }, createdAt: at(1) })));
  assert.deepEqual(await cold.client.queue(), []);
});

test("matrix · authorization epoch rotation while writes are pending: the mirror is rebuilt under the new epoch and every write lands once", async t => {
  const { w, app, keys } = await pendingInFourKinds(t);
  w.host.offline = false;
  w.host.account(A).epoch = "e2";
  assert.equal((await app.client.sync())?.error, null);
  for (let round = 0; round < 2 && (await app.client.queue()).length; round += 1) await app.client.sync();
  assert.deepEqual(await app.client.queue(), []);
  assertExactlyOnce(w.host, A, keys);
  assertServerHasAllWrites(w.host);
});

test("matrix · a vault older than 30 days is expired at the next start: nothing is restored or uploaded", async t => {
  const { w, app } = await pendingInFourKinds(t);
  app.client.close();
  await settle();
  assert.equal(await app.lifecycle.setScope(null), true);
  const vault = [...w.device.files.entries()].find(([name]) => name.startsWith("orbit-pending-vault-"))?.[1];
  assert.ok(vault, "the logout made a vault");
  vault.prepare("UPDATE pending_write_vault SET created_at = ?, expires_at = ?").run(new Date(Date.now() - 31 * 86_400_000).toISOString(), new Date(Date.now() - 86_400_000).toISOString());
  w.host.offline = false;
  const next = await reopen(w, A);
  assert.equal((await next.client.sync())?.error, null);
  assert.deepEqual(await next.client.queue(), []);
  assert.equal(w.host.applied.size, 0);
});

test("matrix · a conflict in each kind: both versions are kept, nothing is overwritten on the server, and each choice lands once", async t => {
  const w = world(t);
  const app = await onlineApp(w);
  assert.equal((await app.client.sync())?.error, null);
  w.host.offline = true;
  const s = app.client.session;
  await s.enqueueOfflineNoteMutation(buildOfflineNoteMutation({ mutationId: "c-note", entityId: "note:a:seed", operation: "update", baseRevision: "r1",
    requestBody: { body: "phone version", expectedVersion: 1, idempotencyKey: "c-note" }, createdAt: at(1) }));
  await s.enqueueOfflineTaskMutation(buildOfflineTaskMutation({ mutationId: "c-task", entityId: "task:a:seed", operation: "update", baseRevision: "r1",
    requestBody: { action: "update", expectedUpdatedAt: w.seeded.task.updatedAt, idempotencyKey: "c-task", patch: { title: "phone title" } }, createdAt: at(2) }));
  await s.enqueueOfflineScheduleMutation(buildOfflineScheduleMutation({ mutationId: "c-schedule", entityId: "personal:a:seed", operation: "update", baseRevision: "r1",
    requestBody: { expectedUpdatedAt: w.seeded.item.updatedAt, patch: { title: "phone title" }, idempotencyKey: "c-schedule" }, createdAt: at(3) }));
  await s.enqueueOfflineMessageMutation(buildOfflineMessageMutation({ requestId: "c-message", conversationId: CONVERSATION, body: "still there?", qualificationVersion: "qv_1", retireDraftThrough: null, createdAt: at(4) }));

  // Meanwhile on the web: the same account edits the note, the task and the schedule; the other side ends the conversation.
  w.host.webNote(A, { id: "note:a:seed", body: "web version" });
  w.host.webTask(A, { id: "task:a:seed", title: "web title" });
  w.host.webSchedule(A, { id: "personal:a:seed", location: "web room" });
  w.host.publish(A, "relationship-conversations", CONVERSATION, null);
  const serverBefore = w.host.snapshot(A);

  w.host.offline = false;
  assert.equal((await app.client.sync())?.error, null);
  const queue = await app.client.queue();
  assert.deepEqual(queue.map(row => [row.mutationId, row.state, row.errorCode]).sort(), [
    ["c-message", "conflict", "CONFLICT"],
    ["c-note", "conflict", "CONFLICT"],
    ["c-schedule", "conflict", "CONFLICT"],
    ["c-task", "conflict", "CONFLICT"],
  ]);
  assert.equal(w.host.snapshot(A), serverBefore, "a conflict overwrites nothing on the server");
  const overlay = await s.readOutboxOverlay("note");
  assert.equal((overlay?.queuedMutations.find(row => row.mutationId === "c-note")?.serverSnapshot as Record<string, unknown> | null)?.body, "web version", "the phone holds the server version next to its own");

  const revisionOf = async (kind: "note" | "personal_schedule", id: string) => (await app.client.records(kind)).find(record => record.id === id)?.revision ?? null;
  // Choices: keep my note (a new request on the server version), use the server task, keep my schedule title, discard the message.
  await s.resolveNoteConflict!({ mutationId: "c-note", resolution: "replace", replacement: buildOfflineNoteMutation({ mutationId: "c-note-2", entityId: "note:a:seed", operation: "update", baseRevision: await revisionOf("note", "note:a:seed"),
    requestBody: { body: "phone version", expectedVersion: 2, idempotencyKey: "c-note-2" }, createdAt: at(10) }) });
  await s.resolveTaskConflict!({ mutationId: "c-task", resolution: "server" });
  const currentItem = w.host.account(A).items.get("personal:a:seed")!;
  await s.resolveScheduleConflict!({ mutationId: "c-schedule", resolution: "replace", replacement: buildOfflineScheduleMutation({ mutationId: "c-schedule-2", entityId: "personal:a:seed", operation: "update", baseRevision: await revisionOf("personal_schedule", "personal:a:seed"),
    requestBody: { expectedUpdatedAt: currentItem.updatedAt, patch: { title: "phone title" }, idempotencyKey: "c-schedule-2" }, createdAt: at(11) }) });
  assert.equal(await s.discardOfflineMessages(["c-message"]), 1);
  assert.equal((await app.client.sync())?.error, null);
  assert.deepEqual(await app.client.queue(), []);
  const a = w.host.account(A);
  assert.equal(a.notes.get("note:a:seed")?.body, "phone version");
  assert.equal(a.tasks.get("task:a:seed")?.title, "web title");
  assert.deepEqual([a.items.get("personal:a:seed")?.title, a.items.get("personal:a:seed")?.location], ["phone title", "web room"], "both sides' fields survive");
  assert.equal(a.messages.length, 0, "nothing is sent into an ended conversation");
  assertExactlyOnce(w.host, A, ["c-note-2", "c-schedule-2"]);
  for (const key of ["c-note", "c-task", "c-schedule", "c-message"]) assert.equal(w.host.applied.get(`${A}:${key}`), undefined, `${key} never applied`);
  assert.equal(w.host.snapshot(B), w.bBefore);
});

/** Online check (lease) first, then every write, then the pull of every domain after the last write. */
function assertUploadOrder(host: Host, keys: readonly string[]) {
  const calls = host.calls;
  const lease = calls.indexOf("lease");
  const writes = calls.map((call, index) => call.startsWith("write:") ? index : -1).filter(index => index >= 0);
  assert.ok(lease >= 0 && writes.length >= keys.length && lease < writes[0]!, `lease before the first write: ${calls.join(" ")}`);
  const lastWrite = writes.at(-1)!;
  for (const domain of ["notes", "tasks", "personal-schedule", "relationship-conversations", "relationship-messages"]) {
    assert.ok(calls.slice(lastWrite + 1).includes(`page:${domain}`), `${domain} is pulled after the upload`);
  }
}

test("SC-02 · four upload entry points — cold start, foreground, network restored, notification tap — each run 在线确认 → 上传 → 拉取 in that order", async t => {
  const { startOutboxUploadTriggers, syncThenNavigate } = await import("../src/data/sync/outbox-upload-triggers");
  const entries = ["cold start", "foreground", "network restored", "notification tap"] as const;
  for (const entry of entries) {
    const { w, app, keys } = await pendingInFourKinds(t);
    const listeners: Array<(state: string) => void> = [];
    const reachabilityListeners: Array<(url: string, state: "reachable" | "unreachable" | "unknown", previous: "reachable" | "unreachable" | "unknown") => void> = [];
    const flights: Promise<unknown>[] = [];
    const syncOutbox = () => { flights.push(app.client.session.synchronize("note", { reason: "explicit" }).promise); };
    if (entry !== "cold start") w.host.offline = true; // the immediate cold-start attempt fails; the entry under test does the work
    else w.host.offline = false;
    w.host.calls.length = 0;
    const stop = startOutboxUploadTriggers({
      syncOutbox, baseUrl: "https://host.example/",
      appState: { currentState: "active", addEventListener: (_event, listener) => { listeners.push(listener); return { remove() {} }; } },
      reachability: { subscribe: listener => { reachabilityListeners.push(listener); return () => undefined; } },
      timers: { setInterval: () => 0, clearInterval: () => undefined },
    });
    await Promise.all(flights.splice(0));
    if (entry !== "cold start") {
      assert.equal(w.host.applied.size, 0, `${entry}: nothing uploaded while unreachable`);
      w.host.offline = false;
      w.host.calls.length = 0;
      if (entry === "foreground") { listeners.forEach(listener => listener("background")); listeners.forEach(listener => listener("active")); }
      if (entry === "network restored") reachabilityListeners.forEach(listener => listener("https://host.example", "reachable", "unreachable"));
      if (entry === "notification tap") {
        let navigatedAfter = -1;
        await syncThenNavigate(app.client.session, () => { navigatedAfter = w.host.applied.size; });
        assert.equal(navigatedAfter, keys.length, "the page opens only after this device's writes reached the server");
      }
      await Promise.all(flights.splice(0));
    }
    stop();
    assert.deepEqual(await app.client.queue(), [], `${entry}: the queue is drained`);
    assertExactlyOnce(w.host, A, keys);
    assertUploadOrder(w.host, keys);
  }
});
