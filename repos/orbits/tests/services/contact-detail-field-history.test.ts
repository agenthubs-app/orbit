import assert from "node:assert/strict";
import test from "node:test";

import { contactDetailFieldHistory } from "../../features/contacts/live-detail-service";

// R11a SC-09（以前の値，R11-08）：详情带上 fieldHistory（含 offering / seeking），坏条目跳过，最多 20 条。
test("the detail carries the field history the writers left on the contact", () => {
  const contact = { id: "c1", fieldHistory: [
    { field: "role", previous: "取締役 COO", next: "代表取締役", source: "invite_sync", at: "2026-10-12T00:00:00.000Z" },
    { field: "offering", previous: "製造業の現場ネットワーク", next: "製造業の現場ネットワーク、PoC 先の紹介", source: "invite_sync", at: "2026-10-12T00:00:00.000Z" },
    { field: 3, previous: "x" },
    "junk",
  ] } as never;
  assert.deepEqual(contactDetailFieldHistory(contact).fieldHistory?.map((entry) => entry.field), ["role", "offering"]);
  assert.deepEqual(contactDetailFieldHistory({ id: "c2" } as never), {});
  const many = { id: "c3", fieldHistory: Array.from({ length: 30 }, (_, n) => ({ field: "role", previous: String(n), next: String(n + 1), source: "manual", at: "2026-10-01T00:00:00.000Z" })) } as never;
  const history = contactDetailFieldHistory(many).fieldHistory!;
  assert.equal(history.length, 20);
  assert.equal(history.at(-1)!.previous, "29");
});

// QA-C2: the stored contact reader kept a whitelist without `fieldHistory`, so the detail read (and the synced
// device copy built from it) never had 以前の値 after an edit.
test("the stored contact read keeps fieldHistory so the detail (and the device copy) shows earlier values", async () => {
  const { readOwnedContactDetailInputs } = await import("../../features/contacts/storage/contact-live-record-provider");
  const { contactDetailPayloadFromGraph } = await import("../../features/contacts/live-detail-service");
  const { createMemoryLiveRecordStore } = await import("../../shared/storage/live-record-store");
  const now = "2026-10-26T00:00:00.000Z";
  const workspaceId = "workspace:qa-c2";
  const actorId = "actor:qa-c2";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>([{
    workspaceId, collectionName: "contacts", recordId: "contact:1", userId: actorId, sourceType: "manual", sourceId: "s", sourceLabel: "s",
    provider: "test", providerRecordId: "contact:1", evidenceIds: ["e1"], targetType: null, targetId: null, occurredAt: now, createdAt: now, updatedAt: now,
    lifecycleState: "active", searchText: "",
    payload: { id: "contact:1", accountId: actorId, displayName: "林玫", role: "Senior Tester", stage: "captured", source: { type: "manual", id: "s" }, evidenceIds: ["e1"], createdAt: now, updatedAt: now,
      fieldHistory: [{ field: "role", previous: "Tester", next: "Senior Tester", source: "manual", at: now }] },
  }]);
  const inputs = await readOwnedContactDetailInputs({
    actorId, contactRecordIds: ["contact:1"], workspaceId, store,
    scopeReader: async () => ({ contactIds: ["contact:1"], connectionIds: [], detailStateIds: [], evidenceRecordIds: [] }),
  });
  const contact = inputs.graph.contacts[0]!;
  const detail = contactDetailPayloadFromGraph({ collectedAt: now, contact, connections: [], evidence: [], persistedState: null, provider: { source: "test", sourceLabel: "test" } });
  const raw = detail as unknown as { contact?: { fieldHistory?: { field: string; previous: string }[] } };
  assert.deepEqual(raw.contact?.fieldHistory?.map((entry) => [entry.field, entry.previous]), [["role", "Tester"]]);
});
