import assert from "node:assert/strict";
import test from "node:test";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { createMockContactDetailTagStatusService } from "../../features/contacts/mock-detail-service";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";

const actorId = "actor:legacy-tags";
const workspaceId = "workspace:legacy-tags";
const contactId = "contact_078";
const legacyTags = ["旧标签".repeat(12), ...Array.from({ length: 25 }, (_, index) => `legacy-${index}`)];

async function fixture() {
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ store, workspaceId });
  for (const collectionName of ["contacts", "connections", "evidence"]) {
    for (const record of await store.listRecords({ collectionName, workspaceId })) {
      await store.upsertRecord({ ...record, userId: actorId, payload: {
        ...record.payload, accountId: actorId,
      } });
    }
  }
  await createStorageContactGraphProvider({ store, workspaceId }).upsertContactDetailState!({
    actorId, contactId, tags: legacyTags, status: "active", notes: [], updatedAt: "2026-09-08T00:00:00Z",
  });
  const service = () => createLiveContactDetailTagStatusService({ provider: createStorageContactGraphProvider({ store, workspaceId }) });
  return { store, service };
}

test("legacy tags longer than the new-tag limit remain removable without losing other tags", async () => {
  const { service } = await fixture();
  const before = await service().getContactDetail({ actorId, contactId });
  assert.equal(before.success, true);
  if (!before.success) throw new Error("Missing legacy fixture");
  assert.ok(before.data.contact?.tags.some((tag) => tag === legacyTags[0]));
  const result = await service().updateContactDetail({ actorId, contactId, removeTags: [legacyTags[0]] });
  assert.equal(result.success, true);
  const after = await service().getContactDetail({ actorId, contactId });
  assert.equal(after.success, true);
  if (!after.success) throw new Error("Missing updated fixture");
  assert.deepEqual(after.data.contact?.tags, before.data.contact?.tags.filter((tag) => tag !== legacyTags[0]));
});

test("removing more than twenty existing tags is not treated as adding too many new tags", async () => {
  const { service } = await fixture();
  const result = await service().updateContactDetail({ actorId, contactId, removeTags: legacyTags.slice(1, 23) });
  assert.equal(result.success, true);
  const after = await service().getContactDetail({ actorId, contactId });
  assert.equal(after.success, true);
  if (!after.success) throw new Error("Missing updated fixture");
  assert.ok(after.data.contact?.tags.some((tag) => tag === legacyTags[0]));
  assert.ok(legacyTags.slice(1, 23).every((tag) => !after.data.contact?.tags.some((saved) => saved === tag)));
});

test("new-tag length and count limits still reject invalid writes without changing storage", async () => {
  const { service, store } = await fixture();
  const before = await store.listRecords({ workspaceId });
  for (const addTags of [[legacyTags[0]], Array.from({ length: 21 }, (_, index) => `new-${index}`)]) {
    const result = await service().updateContactDetail({ actorId, contactId, addTags });
    assert.equal(result.success, false);
    if (!result.success) assert.equal(result.error.code, "CONTACT_DETAIL_TAG_NOT_SUPPORTED");
  }
  assert.deepEqual(await store.listRecords({ workspaceId }), before);
});

test("mock preview uses the same removal policy without relaxing new-tag validation", async () => {
  const service = createMockContactDetailTagStatusService();
  const removed = await service.updateContactDetail({ contactId: "demo-contact-1", removeTags: legacyTags });
  assert.equal(removed.success, true);
  const invalid = await service.updateContactDetail({ contactId: "demo-contact-1", addTags: [legacyTags[0]] });
  assert.equal(invalid.success, false);
});
