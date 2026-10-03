import assert from "node:assert/strict";
import test from "node:test";

import { createConversationMessagesPostHandler } from "../../app/api/relationship-communication/handler";
import { createInboxProjectionWorkRepository, INBOX_PROJECTION_WORK_SCHEMA_SQL } from "../../features/notifications/storage/inbox-projection-work";
import { createNoteRepository } from "../../features/notes/repository";
import { createNoteService } from "../../features/notes/service";
import { createPersonalScheduleAssociationReader } from "../../features/personal-schedule/association-reader";
import { createPersonalScheduleService } from "../../features/personal-schedule/service";
import { RECORD_SYNC_DOMAINS } from "../../features/sync/domain-registry";
import { createDomainReadService } from "../../features/sync/domain-read-service";
import { SYNC_REVISION_MIGRATION_SQL } from "../../features/sync/migrations";
import { createTaskRepository } from "../../features/tasks/repository";
import { createTaskService } from "../../features/tasks/service";
import { connect, createRelationshipHarness, relationshipPostgresSkip as skip, type HarnessActor } from "../support/relationship-message-harness";

/**
 * Sprint 0136 — the offline-write acceptance matrix, server side (design step 11
 * checklist items 1, 5, 7). One PostgreSQL schema holds two accounts and all four
 * offline-write kinds under the strict sync-revision trigger. Account A's phone
 * replays a whole queue (notes, personal tasks, personal schedule, messages) the
 * way the outbox does after lost receipts, a killed app or a reconnect: every
 * request again, then again in reverse order. Each write must change data once,
 * keep one receipt, and leave account B's rows and sync pages exactly as they were.
 */
const A: HarnessActor = { accountId: "account:matrix-a", displayName: "Matrix A", email: "matrix-a@example.test" };
const B: HarnessActor = { accountId: "account:matrix-b", displayName: "Matrix B", email: "matrix-b@example.test" };
const SECRET = "offline-write-acceptance-cursor-secret-0123456789";
const T = (minute: number) => new Date(Date.parse("2026-10-03T09:00:00.000Z") + minute * 60_000).toISOString();

/** The record a write result is about: a note, task, schedule item or delivered message (with its server time). */
function identity(result: unknown): string {
  const value = result as { id?: string; task?: { id: string }; scheduleItem?: { id: string }; message?: { messageId: string; sentAt: string } };
  return value.message ? `${value.message.messageId}@${value.message.sentAt}` : value.scheduleItem?.id ?? value.task?.id ?? value.id ?? JSON.stringify(result);
}

async function world(prefix: string) {
  const h = await createRelationshipHarness({ prefix, poolSize: 6 });
  await h.client.query(SYNC_REVISION_MIGRATION_SQL);
  await h.client.query(INBOX_PROJECTION_WORK_SCHEMA_SQL);
  let clock = T(0);
  const now = () => clock;
  const W = h.workspaceId;
  const notes = createNoteService({ repository: createNoteRepository({ store: h.store, workspaceId: W }) });
  const tasks = createTaskService({ repository: createTaskRepository({ store: h.store, workspaceId: W, transactionClient: h.client }) });
  const schedule = createPersonalScheduleService({
    store: h.store, client: h.client, workspaceId: W, now,
    inboxProjection: createInboxProjectionWorkRepository({ client: h.client, workspaceId: W, now }),
    associationReaderForStore: store => createPersonalScheduleAssociationReader({ store, workspaceId: W }),
  });
  const reader = createDomainReadService({ client: h.client, cursorSecret: SECRET, now, domains: RECORD_SYNC_DOMAINS });
  for (const who of [A, B]) await h.store.upsertRecord({ workspaceId: W, collectionName: "accounts", recordId: who.accountId, userId: who.accountId, sourceType: "manual", sourceId: who.accountId, evidenceIds: [], lifecycleState: "active", createdAt: T(0), updatedAt: T(0), payload: { id: who.accountId } });
  const send = async (who: HarnessActor, conversationId: string, body: Record<string, unknown>, requestId: string) => {
    const handler = createConversationMessagesPostHandler({
      resolveActor: async () => ({ id: who.accountId, accountId: who.accountId, name: who.displayName, email: who.email, workspaceId: W }),
      createService: () => h.service(who, { now }),
    });
    const response = await handler(new Request(`https://orbit.example/api/relationship-communication/conversations/${encodeURIComponent(conversationId)}/messages`, {
      method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "idempotency-key": requestId },
    }), { params: Promise.resolve({ id: conversationId }) });
    return { status: response.status, body: await response.json() as { data?: { message: { messageId: string; seq?: number; sentAt: string } }; error?: { code: string } } };
  };
  /** Every row an account owns in the record store, with its sync revision: a change anywhere shows. */
  const owned = async (who: HarnessActor) => (await h.pool.query<{ collection_name: string; record_id: string; sync_revision: string | null; payload: string; lifecycle_state: string }>(
    "select collection_name, record_id, sync_revision::text as sync_revision, payload::text as payload, lifecycle_state from orbit_records where user_id = $1 order by collection_name, record_id", [who.accountId])).rows;
  const count = async (sql: string, values: unknown[]) => (await h.pool.query<{ n: number }>(sql, values)).rows[0]!.n;
  const pageIds = async (who: HarnessActor, domainId: string) => {
    const ids: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 20; page += 1) {
      const data = await reader.readDomainPage({ actorId: who.accountId, workspaceId: W, domainId, limit: 50, ...(cursor ? { cursor } : {}) });
      ids.push(...data.changes.map(change => change.id));
      cursor = data.nextCursor;
      if (!data.hasMore) return ids.sort();
    }
    throw new Error("pagination did not terminate");
  };
  return { h, W, notes, tasks, schedule, send, owned, count, pageIds, tick(minute: number) { clock = T(minute); } };
}

test("a whole offline queue in four kinds, replayed after lost receipts and again in reverse, lands once per write; B's rows and pages stay identical; B's ids are refused", { skip, timeout: 120_000 }, async () => {
  const w = await world("owa_matrix");
  try {
    const { conversationId, qualificationVersion } = await connect(w.h, A, B, "contact:matrix-b");
    // Account B's own data, written online.
    const bNote = await w.notes.create({ actorId: B.accountId, title: "B note", body: "private to B", idempotencyKey: "b-note", now: T(1) });
    const bTask = await w.tasks.create({ actorId: B.accountId, title: "B task", category: "personal", idempotencyKey: "b-task", now: T(1) });
    const bItem = await w.schedule.create(B.accountId, { title: "B dentist", startsAt: "2026-10-09T01:00:00.000Z", idempotencyKey: "b-schedule" });
    // Account A's data that existed before going offline.
    const aTask = await w.tasks.create({ actorId: A.accountId, title: "Renew passport", category: "personal", idempotencyKey: "a-seed-task", now: T(2) });
    const aItem = await w.schedule.create(A.accountId, { title: "Dentist", startsAt: "2026-10-06T01:00:00.000Z", idempotencyKey: "a-seed-schedule" });
    const bBefore = await w.owned(B);
    const bPagesBefore = { notes: await w.pageIds(B, "notes"), tasks: await w.pageIds(B, "tasks"), schedule: await w.pageIds(B, "personal-schedule") };

    // The phone's queue, frozen at write time. The note create comes first so the schedule can link its formal id
    // (the device rewrites the temporary id on the note's acknowledgement, before the schedule's first attempt).
    let noteId = "";
    const queue: Array<{ key: string; run: () => Promise<unknown> }> = [
      { key: "q-note-create", run: () => w.notes.create({ actorId: A.accountId, title: "Three things", body: "quote, intro, revisit", idempotencyKey: "q-note-create", now: T(10) }).then(note => { noteId = note.id; return note; }) },
      { key: "q-note-edit", run: () => w.notes.update({ actorId: A.accountId, noteId, body: "quote, intro, revisit in December", expectedVersion: 1, idempotencyKey: "q-note-edit", now: T(11) }) },
      { key: "q-task-create", run: () => w.tasks.create({ actorId: A.accountId, title: "Book Osaka hotel", category: "personal", idempotencyKey: "q-task-create", now: T(12) }) },
      { key: "q-task-complete", run: () => w.tasks.complete({ actorId: A.accountId, taskId: aTask.task.id, completedBy: A.accountId, completionSource: "user", idempotencyKey: "q-task-complete", now: T(13) }) },
      { key: "q-schedule-create", run: () => w.schedule.create(A.accountId, { title: "Call Chen", startsAt: "2026-10-07T01:00:00.000Z", noteIds: [noteId], idempotencyKey: "q-schedule-create" }) },
      { key: "q-schedule-edit", run: () => w.schedule.update(A.accountId, aItem.scheduleItem.id, { expectedUpdatedAt: aItem.scheduleItem.updatedAt, patch: { title: "Dentist (moved)" }, idempotencyKey: "q-schedule-edit" }) },
      { key: "q-message-1", run: () => w.send(A, conversationId, { body: "on my way", qualificationVersion, retireDraftThrough: null }, "q-message-1").then(result => { assert.equal(result.status, 201, JSON.stringify(result.body.error)); return result.body.data; }) },
      { key: "q-message-2", run: () => w.send(A, conversationId, { body: "ten minutes", qualificationVersion, retireDraftThrough: null }, "q-message-2").then(result => { assert.equal(result.status, 201, JSON.stringify(result.body.error)); return result.body.data; }) },
    ];
    const first = new Map<string, unknown>();
    for (const [index, item] of queue.entries()) { w.tick(20 + index); first.set(item.key, await item.run()); }
    const aAfterFirst = await w.owned(A);
    // Every receipt was "lost": the outbox replays the whole queue, then a reconnect replays it again in reverse.
    // A replay answers with the same record (a note replay reports the note as it is now, 0132); it never writes.
    for (const item of queue) { w.tick(40); assert.equal(identity(await item.run()), identity(first.get(item.key)), `${item.key}: a replay answers for the same record`); }
    for (const item of [...queue].reverse()) { w.tick(50); assert.equal(identity(await item.run()), identity(first.get(item.key)), `${item.key}: an out-of-order replay answers for the same record`); }
    assert.deepEqual(await w.owned(A), aAfterFirst, "replays changed none of A's rows or sync revisions");

    // Exactly once, on A's side.
    const note = await w.notes.get({ actorId: A.accountId, noteId });
    assert.equal(note?.body, "quote, intro, revisit in December");
    assert.equal(note?.version, 2);
    assert.equal(await w.count("select count(*)::int as n from orbit_records where collection_name = 'notes' and user_id = $1", [A.accountId]), 1);
    assert.equal(await w.count("select count(*)::int as n from orbit_records where collection_name = 'tasks' and user_id = $1 and payload->'task'->>'title' = 'Book Osaka hotel'", [A.accountId]), 1);
    assert.equal((await w.tasks.get({ actorId: A.accountId, taskId: aTask.task.id }))?.status, "completed");
    assert.equal(await w.count("select count(*)::int as n from orbit_records where collection_name = 'task_mutations' and user_id = $1", [A.accountId]), 3, "seed, create and complete: one receipt each");
    assert.equal(await w.count("select count(*)::int as n from orbit_records where collection_name = 'personal_schedule_mutations' and user_id = $1", [A.accountId]), 3, "seed, create and edit: one receipt each");
    const call = (first.get("q-schedule-create") as { scheduleItem: { id: string; noteIds?: string[] } }).scheduleItem;
    assert.deepEqual(call.noteIds, [noteId], "the schedule links the note's formal id");
    const messages = (await w.h.client.query<{ seq: string; body: string; sender_account_id: string }>("select seq::text as seq, body, sender_account_id from relationship_messages where conversation_id = $1 order by seq", [conversationId])).rows;
    assert.deepEqual(messages.map(row => [row.seq, row.body, row.sender_account_id]), [["1", "on my way", A.accountId], ["2", "ten minutes", A.accountId]], "two messages, in order, once each");
    assert.equal(JSON.stringify(aAfterFirst).includes("local:"), false, "no temporary id reached the server");

    // Another account's ids are refused and change nothing.
    await assert.rejects(w.notes.update({ actorId: A.accountId, noteId: bNote.id, body: "A was here", expectedVersion: 1, idempotencyKey: "x-note", now: T(60) }), /NOT_FOUND|not found/i);
    await assert.rejects(w.tasks.complete({ actorId: A.accountId, taskId: bTask.task.id, completedBy: A.accountId, completionSource: "user", idempotencyKey: "x-task", now: T(60) }), /NOT_FOUND|not found/i);
    await assert.rejects(w.schedule.update(A.accountId, bItem.scheduleItem.id, { expectedUpdatedAt: bItem.scheduleItem.updatedAt, patch: { title: "A was here" }, idempotencyKey: "x-schedule" }), /NOT_FOUND|not found/i);
    assert.deepEqual(await w.owned(B), bBefore, "B's rows and sync revisions are identical");
    assert.deepEqual({ notes: await w.pageIds(B, "notes"), tasks: await w.pageIds(B, "tasks"), schedule: await w.pageIds(B, "personal-schedule") }, bPagesBefore, "B's sync pages are identical");
    const aPages = [...await w.pageIds(A, "notes"), ...await w.pageIds(A, "tasks"), ...await w.pageIds(A, "personal-schedule")];
    for (const id of [bNote.id, bTask.task.id, bItem.scheduleItem.id]) assert.equal(aPages.includes(id), false, `${id} is never on A's pages`);
  } finally { await w.h.close(); }
});

test("a conflict in each kind keeps the server version untouched; the phone's version applies once only after the user chooses", { skip, timeout: 120_000 }, async () => {
  const w = await world("owa_conflict");
  try {
    const { conversationId, qualificationVersion } = await connect(w.h, A, B, "contact:conflict-b");
    const note = await w.notes.create({ actorId: A.accountId, title: "Seed", body: "v1", idempotencyKey: "c-seed-note", now: T(1) });
    const task = await w.tasks.create({ actorId: A.accountId, title: "Seed task", category: "personal", idempotencyKey: "c-seed-task", now: T(1) });
    const item = await w.schedule.create(A.accountId, { title: "Seed item", startsAt: "2026-10-06T01:00:00.000Z", idempotencyKey: "c-seed-item" });
    // The web changes all three while the phone is offline; the phone queued edits on the old versions.
    const webNote = await w.notes.update({ actorId: A.accountId, noteId: note.id, body: "web", expectedVersion: 1, idempotencyKey: "web-note", now: T(5) });
    const webTask = await w.tasks.update({ actorId: A.accountId, taskId: task.task.id, expectedUpdatedAt: task.task.updatedAt, patch: { title: "web title" }, idempotencyKey: "web-task", now: T(5) });
    w.tick(5);
    const webItem = await w.schedule.update(A.accountId, item.scheduleItem.id, { expectedUpdatedAt: item.scheduleItem.updatedAt, patch: { location: "web room" }, idempotencyKey: "web-item" });
    await w.h.service(A).revokeContactBinding("contact:conflict-b");
    const before = await w.owned(A);

    await assert.rejects(w.notes.update({ actorId: A.accountId, noteId: note.id, body: "phone", expectedVersion: 1, idempotencyKey: "p-note", now: T(10) }), /CONFLICT|changed|version/i);
    await assert.rejects(w.tasks.update({ actorId: A.accountId, taskId: task.task.id, expectedUpdatedAt: task.task.updatedAt, patch: { title: "phone title" }, idempotencyKey: "p-task", now: T(10) }), /CONFLICT|changed/i);
    w.tick(10);
    await assert.rejects(w.schedule.update(A.accountId, item.scheduleItem.id, { expectedUpdatedAt: item.scheduleItem.updatedAt, patch: { title: "phone title" }, idempotencyKey: "p-item" }), /CONFLICT|changed/i);
    const late = await w.send(A, conversationId, { body: "still there?", qualificationVersion, retireDraftThrough: null }, "p-message");
    assert.equal(late.status, 409, "a message is not delivered into a revoked conversation");
    assert.deepEqual(await w.owned(A), before, "no conflict overwrote anything or left a receipt");

    // The user keeps the phone's versions: new requests on the server versions, each applied once even when replayed.
    const keep = [
      () => w.notes.update({ actorId: A.accountId, noteId: note.id, body: "phone", expectedVersion: webNote.version, idempotencyKey: "k-note", now: T(20) }),
      () => w.tasks.update({ actorId: A.accountId, taskId: task.task.id, expectedUpdatedAt: webTask.task.updatedAt, patch: { title: "phone title" }, idempotencyKey: "k-task", now: T(20) }),
      () => w.schedule.update(A.accountId, item.scheduleItem.id, { expectedUpdatedAt: webItem.scheduleItem.updatedAt, patch: { title: "phone title" }, idempotencyKey: "k-item" }),
    ];
    w.tick(20);
    const results = [];
    for (const run of keep) results.push(await run());
    for (const [index, run] of keep.entries()) assert.deepEqual(await run(), results[index]);
    assert.equal((await w.notes.get({ actorId: A.accountId, noteId: note.id }))?.body, "phone");
    assert.equal((await w.tasks.get({ actorId: A.accountId, taskId: task.task.id }))?.title, "phone title");
    const saved = (await w.h.pool.query<{ payload: { title: string; location: string } }>("select payload from orbit_records where collection_name = 'personal_schedule_items' and record_id = $1", [item.scheduleItem.id])).rows[0]!.payload;
    assert.deepEqual([saved.title, saved.location], ["phone title", "web room"], "the web's field survives the phone's choice");
    assert.equal(await w.count("select count(*)::int as n from relationship_messages where conversation_id = $1", [conversationId]), 0);
  } finally { await w.h.close(); }
});
