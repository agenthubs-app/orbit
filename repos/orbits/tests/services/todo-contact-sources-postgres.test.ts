import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { createTodoContactReaders, createTodoContactReadStore } from "../../features/todo/contact-sources";
import { createLiveContactAcquisitionDraftService } from "../../features/acquisition/live-service";
import { createStorageContactAcquisitionDraftProvider } from "../../features/acquisition/storage/contact-draft-live-record-provider";
import { createContactCompletionService } from "../../features/contacts/completion/service";
import { completionQuestionRecordId } from "../../features/contacts/completion/repository";
import { createPostgresLiveRecordStore } from "../../shared/storage/postgres-live-record-store";
import { ORBIT_RECORDS_SCHEMA_SQL } from "../../shared/storage/migrations";

const at = "2026-10-18T00:00:00.000Z";
test("To-do contact sources match event-import drafts and current question visibility without generating absent questions; a large network stays readable (LF14)", { skip: !process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL }, async () => {
  const url = new URL(process.env.ORBIT_LIFECYCLE_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.search, "");
  const schema = `todo_contacts_${randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({ connectionString: url.toString(), max: 1, options: `-c search_path=${schema} -c statement_timeout=30000` });
  try {
    await pool.query(`create schema ${schema}`); await pool.query(ORBIT_RECORDS_SCHEMA_SQL);
    const store = createPostgresLiveRecordStore({ client: pool });
    const insert = (collectionName: string, id: string, payload: Record<string, unknown>) => store.upsertRecord({ workspaceId: "w", collectionName, recordId: id, userId: "a",
      lifecycleState: "active", sourceType: "manual", sourceId: "s", evidenceIds: ["e"], createdAt: at, updatedAt: at,
      payload: { id, createdAt: at, updatedAt: at, source: { type: "event_import", id: "s" }, evidenceIds: ["e"], ...payload } });
    await insert("events", "event", { name: "Event", startsAt: at, location: "Tokyo" });
    await insert("attendees", "attendee", { eventId: "event", displayName: "Imported attendee", organization: "Org", role: "Founder", status: "imported" });
    const nativeDrafts = createLiveContactAcquisitionDraftService({ provider: createStorageContactAcquisitionDraftProvider({ store, workspaceId: "w", actorId: "a" }) });
    const expected = await nativeDrafts.listContactDrafts(); assert.equal(expected.success, true); if (!expected.success) return;
    assert.equal(expected.data.drafts.length, 1); assert.equal(expected.data.drafts[0]!.source.type, "event_import");
    const checked = new Set<string>();
    const readStore = createTodoContactReadStore({ client: pool, workspaceId: "w", actorId: "a", assertAllowed: collection => { checked.add(collection); } });
    const readers = createTodoContactReaders({ store: readStore, workspaceId: "w" });
    const input = { actorId: "a", date: "2026-10-18", timeZone: "Asia/Tokyo", cursor: null, limit: 5 };
    const drafts = await readers.contact_draft(input);
    assert.equal(drafts.total, 1); assert.equal(drafts.entries[0]?.item.sourceId, expected.data.drafts[0]?.id);
    assert.equal(drafts.entries[0]?.item.titlePreview, expected.data.drafts[0]?.displayName);
    assert.ok(checked.has("attendees")); assert.ok(checked.has("events")); assert.ok(checked.has("contactDrafts"));
    await insert("contacts", "c", { accountId: "a", displayName: "Contact", organization: "Org", primaryEmail: "contact@example.test", source: { type: "manual", id: "s" } });
    const questionId = completionQuestionRecordId("a", input.date);
    await insert("contactCompletionQuestions", questionId, { actorId: "a", askedOn: input.date, status: "open", contactId: "c", kind: "met_where", question: "Where did you meet?", options: [] });
    let nativeWrites = 0;
    const native = createContactCompletionService({ now: () => new Date(at), storage: { workspaceId: "w", read: fn => fn(store), write: async (_actor, fn) => { nativeWrites++; return fn(store); } } });
    assert.ok(await native.today("a"));
    assert.equal((await readers.completion_question(input)).total, 1);
    await pool.query(`update orbit_records set payload=payload||'{"metEventId":"event"}'::jsonb where collection_name='contacts'`);
    assert.equal(await native.today("a"), null);
    assert.equal((await readers.completion_question(input)).total, 0);
    await pool.query("delete from orbit_records where collection_name='contactCompletionQuestions'");
    await pool.query(`update orbit_records set payload=payload-'metEventId' where collection_name='contacts'`);
    const absent = await readers.completion_question(input);
    assert.equal(absent.notImplemented, true, "absent question cannot be initialized by this read-only endpoint");
    assert.equal((await pool.query("select count(*)::int as n from orbit_records where collection_name='contactCompletionQuestions'")).rows[0].n, 0);
    assert.ok(await native.today("a")); assert.equal(nativeWrites, 1, "native reader requires a source write to initialize the question");
    const contact = await store.getRecord({ workspaceId: "w", collectionName: "contacts", recordId: "c" }); assert.ok(contact);
    await assert.rejects(async () => readStore.upsertRecord(contact), /TODO_SOURCE_WRITE_FORBIDDEN/);
    await assert.rejects(async () => readStore.getRecord({ workspaceId: "foreign-workspace", collectionName: "contacts", recordId: "c" }), /TODO_SOURCE_READ_SCOPE_INVALID/);
    // LF14: an account with thousands of source records (the qa account has 4,483) still lists its drafts — the draft
    // graph reads only what the latest attendees and saved drafts cite, never a whole table.
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','evidence','unrelated:'||n,'a','manual','test',jsonb_build_object('id','unrelated:'||n),now(),now() from generate_series(1,300) n`);
    const many = await createTodoContactReaders({ store: createTodoContactReadStore({ client: pool, workspaceId: "w", actorId: "a", assertAllowed: () => undefined }), workspaceId: "w" }).contact_draft(input);
    assert.equal(many.total, 1);
    assert.equal(many.entries[0]?.item.sourceId, expected.data.drafts[0]?.id);
    // More attendees than the limit: the latest 100 are listed (the to-do total is capped at 100) instead of failing.
    await pool.query(`insert into orbit_records(workspace_id,collection_name,record_id,user_id,source_type,source_id,payload,created_at,updated_at)
      select 'w','attendees','growth:'||n,'a','manual','test',jsonb_build_object('id','growth:'||n,'eventId','event','displayName','Attendee '||n,'status','imported',
        'source',jsonb_build_object('type','event_import','id','s'),'evidenceIds',jsonb_build_array('e'),'createdAt',now(),'updatedAt',now()),now(),now() from generate_series(1,110) n`);
    const capped = await createTodoContactReaders({ store: createTodoContactReadStore({ client: pool, workspaceId: "w", actorId: "a", assertAllowed: () => undefined }), workspaceId: "w" }).contact_draft(input);
    assert.equal(capped.total, 100);
    assert.equal(capped.entries.length, 5);
  } finally { await pool.query(`drop schema if exists ${schema} cascade`); await pool.end(); }
});
