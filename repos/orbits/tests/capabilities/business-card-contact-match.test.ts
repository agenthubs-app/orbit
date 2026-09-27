import assert from "node:assert/strict";
import test from "node:test";

import {
  ContactMergeRejected,
  findContactCandidate,
  mergeCardIntoContact,
  type CardContactFields,
} from "../../features/contacts/business-card-contact-match";
import type { LiveRecord, LiveRecordWritePrecondition } from "../../shared/storage/live-record-store";

const ACTOR = "actor:me";
const NOW = "2026-09-27T00:00:00.000Z";

function contactRecord(id: string, payload: Record<string, unknown>, overrides: Partial<LiveRecord> = {}): LiveRecord {
  return {
    collectionName: "contacts",
    createdAt: NOW,
    evidenceIds: ["evidence:old"],
    lifecycleState: "active",
    occurredAt: NOW,
    payload: { id, stage: "captured", ...payload },
    provider: "test",
    providerRecordId: id,
    recordId: id,
    searchText: "",
    sourceId: "src",
    sourceLabel: "src",
    sourceType: "business_card_ocr",
    targetId: id,
    targetType: "contact",
    updatedAt: NOW,
    userId: ACTOR,
    workspaceId: "ws",
    ...overrides,
  } as LiveRecord;
}

const CARD: CardContactFields = {
  address: "113-0033 東京都文京区本郷4丁目2-2 北信ビル3階",
  displayName: "佐々木 芳邦",
  email: "",
  organization: "TEN法律事務所",
  phone: "090-1838-1818",
  role: "顧問",
};

test("a contact with every field equal is an identical candidate", () => {
  const records = [contactRecord("c1", {
    displayName: "佐々木芳邦",
    location: "113-0033 東京都文京区本郷4丁目2-2 北信ビル3階",
    organization: "TEN法律事務所",
    primaryPhone: "09018381818",
    role: "顧問",
  })];
  const candidate = findContactCandidate(records, ACTOR, CARD);
  assert.equal(candidate?.contactId, "c1");
  assert.equal(candidate?.identical, true);
  assert.deepEqual(candidate?.matchedOn, ["phone", "name_organization"]);
});

test("same name and phone but a different company is a candidate, not identical", () => {
  const records = [contactRecord("c1", { displayName: "佐々木 芳邦", organization: "旧事務所", primaryPhone: "090 1838 1818" })];
  const candidate = findContactCandidate(records, ACTOR, CARD);
  assert.equal(candidate?.identical, false);
  assert.deepEqual(candidate?.matchedOn, ["phone"]);
  assert.equal(candidate?.organization, "旧事務所");
});

test("other people's, deleted or unrelated contacts are never candidates", () => {
  const records = [
    contactRecord("other", { displayName: "佐々木 芳邦", primaryPhone: "090-1838-1818" }, { userId: "actor:someone-else" }),
    contactRecord("archived", { displayName: "佐々木 芳邦", primaryPhone: "090-1838-1818" }, { lifecycleState: "deleted" as LiveRecord["lifecycleState"] }),
    contactRecord("namesake", { displayName: "佐々木 芳邦", organization: "別の会社" }),
  ];
  assert.equal(findContactCandidate(records, ACTOR, CARD), null);
});

function memoryStore(initial: LiveRecord) {
  let current = initial;
  return {
    get current() { return current; },
    async getRecord() { return current; },
    async updateRecordIfCurrent(record: LiveRecord, expected: LiveRecordWritePrecondition) {
      if (expected.updatedAt !== current.updatedAt) return null;
      current = record;
      return record;
    },
  };
}

test("merging fills empty fields, keeps existing values and appends the rest to notes", async () => {
  const store = memoryStore(contactRecord("c1", {
    displayName: "佐々木 芳邦",
    notes: "既存メモ\nFAX: 03-6800-3712",
    organization: "旧事務所",
    primaryPhone: "090-1838-1818",
    primaryIndustryId: "legal",
  }));
  const id = await mergeCardIntoContact({
    actorId: ACTOR,
    card: CARD,
    cardNotes: "正面 · card.png\n传真(Fax): 03 6800 3712\n原文姓名: 佐々木 芳邦\n微信(Wechat): yoshikuni26",
    contactId: "c1",
    evidenceIds: ["evidence:new"],
    now: () => new Date(NOW),
    store,
    workspaceId: "ws",
  });
  const payload = store.current.payload;
  assert.equal(id, "c1");
  assert.equal(payload.organization, "旧事務所", "an existing value is never overwritten");
  assert.equal(payload.role, "顧問");
  assert.equal(payload.location, CARD.address);
  assert.equal(payload.primaryIndustryId, "legal", "fields the card does not know about survive");
  assert.equal(
    payload.notes,
    "既存メモ\nFAX: 03-6800-3712\n\n名片补充 · 2026-09-27\n公司: TEN法律事務所\n微信(Wechat): yoshikuni26",
  );
  assert.deepEqual(store.current.evidenceIds, ["evidence:old", "evidence:new"]);
});

test("merging refuses someone else's contact and a contact that changed underneath", async () => {
  const foreign = memoryStore(contactRecord("c1", { displayName: "x" }, { userId: "actor:someone-else" }));
  await assert.rejects(
    mergeCardIntoContact({ actorId: ACTOR, card: CARD, cardNotes: "", contactId: "c1", evidenceIds: [], store: foreign, workspaceId: "ws" }),
    ContactMergeRejected,
  );
  const racing = memoryStore(contactRecord("c1", { displayName: "x" }));
  const store = { ...racing, getRecord: racing.getRecord, async updateRecordIfCurrent() { return null; } };
  await assert.rejects(
    mergeCardIntoContact({ actorId: ACTOR, card: CARD, cardNotes: "", contactId: "c1", evidenceIds: [], store, workspaceId: "ws" }),
    ContactMergeRejected,
  );
});
