import assert from "node:assert/strict";
import test from "node:test";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { createMockContactDetailTagStatusService } from "../../features/contacts/mock-detail-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

async function contactNotesFixture() {
  const actorId = "actor:contact-notes";
  const contactId = "contact_078";
  const workspaceId = "workspace:contact-notes";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of await store.listRecords({ collectionName, workspaceId })) {
      await store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  const sharedNote = { noteId: "note:shared:recap", body: "双方确认的纪要", authorLabel: "Participants", createdAt: "2026-09-07T01:00:00.000Z", privacy: "relationship_shared" as const, sourceLabel: "Confirmed recap" };
  const legacyNote = { noteId: "note:live-contact-detail-update:legacy", body: "旧版手动备注", authorLabel: "我", createdAt: "2026-09-07T02:00:00.000Z" };
  await provider.upsertContactDetailState!({ actorId, contactId, status: "active", tags: ["原有标签"], notes: [sharedNote, legacyNote], updatedAt: legacyNote.createdAt });
  const service = (time = "2026-09-08T03:00:00.000Z") => createLiveContactDetailTagStatusService({ provider: createStorageContactGraphProvider({ store, workspaceId }), now: () => time });
  return { actorId, contactId, workspaceId, store, provider, service, sharedNote, legacyNote };
}

test("manual contact notes persist privately and never borrow the contact's evidence", async () => {
  const { actorId, contactId, provider, service, sharedNote } = await contactNotesFixture();
  const result = await service().updateContactDetail({ actorId, contactId, note: { body: "  strategic_fit：记得询问 CRM 项目\n下次带资料。  ", authorLabel: "我" } });
  assert.equal(result.success, true);
  if (!result.success || !result.data.contact) throw new Error("Missing contact");
  const note = result.data.contact.notes.find((item) => item.body.startsWith("strategic_fit"));
  assert.ok(note);
  assert.equal(note.body, "strategic_fit：记得询问 CRM 项目\n下次带资料。");
  assert.equal(note.privacy, "private");
  assert.equal(note.source.type, "manual");
  assert.equal(note.source.evidenceId, "");
  assert.deepEqual(note.evidenceIds, []);
  assert.equal(result.data.provenance.aiProviderRequested, false);
  assert.equal(result.data.provenance.externalNetworkRequested, false);
  const stored = await provider.readContactDetailState!(contactId, actorId);
  assert.equal(stored?.notes.find((item) => item.noteId === note.noteId)?.privacy, "private");
  assert.deepEqual(stored?.notes.find((item) => item.noteId === sharedNote.noteId), sharedNote);
  assert.deepEqual(stored?.tags, ["原有标签"]);
  assert.equal(stored?.status, "active");
  const cold = await service().getContactDetail({ actorId, contactId });
  if (!cold.success || !cold.data.contact) throw new Error("Missing cold contact");
  assert.deepEqual(cold.data.contact.notes.find((item) => item.noteId === note.noteId)?.evidenceIds, []);
  assert.equal(cold.data.contact.notes.find((item) => item.noteId === note.noteId)?.body, note.body);
});

test("retrying the same saved note retains its original identity and creation time", async () => {
  const { actorId, contactId, provider, service } = await contactNotesFixture();
  const input = { actorId, contactId, note: { body: "同一条备注", authorLabel: "我" } };
  await service().updateContactDetail(input);
  const before = await provider.readContactDetailState!(contactId, actorId);
  await service("2026-09-08T04:00:00.000Z").updateContactDetail(input);
  const after = await provider.readContactDetailState!(contactId, actorId);
  assert.deepEqual(after?.notes, before?.notes);
  assert.equal(after?.notes.filter((note) => note.body === "同一条备注").length, 1);
});

test("resubmitting a legacy manual note retains the old note ID and creation time", async () => {
  const { actorId, contactId, provider, service, legacyNote } = await contactNotesFixture();
  await service().updateContactDetail({ actorId, contactId, note: { body: legacyNote.body, authorLabel: legacyNote.authorLabel } });
  const stored = await provider.readContactDetailState!(contactId, actorId);
  const matching = stored?.notes.filter((note) => note.body === legacyNote.body);
  assert.equal(matching?.length, 1);
  assert.equal(matching?.[0].noteId, legacyNote.noteId);
  assert.equal(matching?.[0].createdAt, legacyNote.createdAt);
});

test("private notes remain isolated even when another actor has a connection to the same contact", async () => {
  const { actorId, contactId, workspaceId, store, provider, service } = await contactNotesFixture();
  await service().updateContactDetail({ actorId, contactId, note: { body: "A 的联系人备注", authorLabel: "我" } });
  const records = await store.listRecords({ workspaceId, collectionName: "connections" });
  const connection = records.find((record) => record.payload.contactId === contactId);
  assert.ok(connection);
  const otherActor = "actor:other-contact-notes";
  await store.upsertRecord({ ...connection, recordId: "connection:other", userId: otherActor, payload: { ...connection.payload, id: "connection:other", accountId: otherActor } });
  const other = await service().getContactDetail({ actorId: otherActor, contactId });
  assert.equal(other.success, true);
  assert.doesNotMatch(JSON.stringify(other), /A 的联系人备注|旧版手动备注|双方确认的纪要/u);
  await service().updateContactDetail({ actorId: otherActor, contactId, note: { body: "B 的联系人备注", authorLabel: "我" } });
  assert.doesNotMatch(JSON.stringify(await provider.readContactDetailState!(contactId, actorId)), /B 的联系人备注/u);
  assert.doesNotMatch(JSON.stringify(await service().getContactDetail({ actorId: "actor:no-access", contactId })), /A 的联系人备注|B 的联系人备注/u);
  const missingActor = await service().updateContactDetail({ contactId, note: "无账号写入" });
  assert.equal(missingActor.success, false);
  assert.equal(await provider.readContactDetailState!(contactId, "actor:no-access"), null);
});

test("legacy manual notes get private read metadata without relabeling shared recaps", async () => {
  const { actorId, contactId, provider, service, sharedNote, legacyNote } = await contactNotesFixture();
  const before = await provider.readContactDetailState!(contactId, actorId);
  const result = await service().getContactDetail({ actorId, contactId });
  if (!result.success || !result.data.contact) throw new Error("Missing contact");
  const legacy = result.data.contact.notes.find((note) => note.noteId === legacyNote.noteId);
  assert.equal(legacy?.privacy, "private");
  assert.deepEqual(legacy?.evidenceIds, []);
  const shared = result.data.contact.notes.find((note) => note.noteId === sharedNote.noteId);
  assert.equal(shared?.privacy, "relationship_shared");
  assert.equal(shared?.sourceLabel, "Confirmed recap");
  assert.deepEqual(await provider.readContactDetailState!(contactId, actorId), before);
});

test("mock note updates use the same private-note response shape without claiming persistence", async () => {
  const result = await createMockContactDetailTagStatusService().updateContactDetail({ contactId: "demo-contact-1", note: { body: "备注", authorLabel: "我" } });
  if (!result.success || !result.data.contact) throw new Error("Missing mock contact");
  const note = result.data.contact.notes.find((item) => item.body === "备注");
  assert.equal(note?.privacy, "private");
  assert.equal(note?.source.type, "manual");
  assert.deepEqual(note?.evidenceIds, []);
  assert.equal(result.data.provenance.databaseWriteExecuted, false);
});
