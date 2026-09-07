import assert from "node:assert/strict";
import test from "node:test";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

test("metadata updates preserve all persisted note kinds, privacy and source without storing derived evidence notes", async () => {
  const actorId = "actor:note-preservation";
  const contactId = "contact_078";
  const workspaceId = "workspace:note-preservation";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of await store.listRecords({ collectionName, workspaceId })) {
      await store.upsertRecord({ ...record, userId: actorId, payload: { ...record.payload, accountId: actorId } });
    }
  }
  const provider = createStorageContactGraphProvider({ store, workspaceId });
  const notes = [
    { noteId: "note:encounter:one", body: "只给自己看的交流记录", authorLabel: "You", createdAt: "2026-09-07T01:00:00Z", privacy: "private" as const, sourceLabel: "Human encounter" },
    { noteId: "note:shared:one", body: "双方确认的会后纪要", authorLabel: "Participants", createdAt: "2026-09-07T02:00:00Z", privacy: "relationship_shared" as const, sourceLabel: "Confirmed recap" },
    { noteId: "note:live-contact-detail-update:legacy", body: "以前的私人记录", authorLabel: "You", createdAt: "2026-09-07T03:00:00Z", privacy: "private" as const, sourceLabel: "Manual note" },
  ];
  await provider.upsertContactDetailState!({ actorId, contactId, tags: ["keep"], status: "active", notes, updatedAt: "2026-09-07T03:00:00Z" });
  const service = () => createLiveContactDetailTagStatusService({ provider: createStorageContactGraphProvider({ store, workspaceId }) });
  for (const update of [
    { addTags: ["new"] },
    { lastInteraction: { channel: "email_signal", summary: "Discussed next meeting", occurredAt: "2026-09-08T01:00:00Z" } },
    { status: "archived" },
    { note: { body: "一条新记录", authorLabel: "You" } },
    { note: { body: "一条新记录", authorLabel: "You" } },
  ]) {
    const result = await service().updateContactDetail({ actorId, contactId, ...update });
    assert.equal(result.success, true);
    const stored = await provider.readContactDetailState!(contactId, actorId);
    assert.ok(stored);
    for (const note of notes) assert.deepEqual(stored.notes.find((item) => item.noteId === note.noteId), note);
    assert.equal(stored.notes.filter((note) => note.body === "一条新记录").length, "note" in update ? 1 : 0);
    assert.ok(stored.notes.every((note) => !note.noteId.startsWith("note:relationship-evidence:") && !note.noteId.startsWith("note:live-contact-detail:")));
    const fresh = await service().getContactDetail({ actorId, contactId });
    assert.equal(fresh.success, true);
    if (!fresh.success || !fresh.data.contact) throw new Error("Missing contact");
    assert.equal(Object.hasOwn(fresh, "persistedState"), false, "internal storage state must not leak into the public service result");
    for (const note of notes) {
      const found = fresh.data.contact.notes.find((item) => item.noteId === note.noteId);
      assert.equal(found?.body, note.body);
      assert.equal(found?.privacy, note.privacy);
      assert.equal(found?.sourceLabel, note.sourceLabel);
    }
  }
});
