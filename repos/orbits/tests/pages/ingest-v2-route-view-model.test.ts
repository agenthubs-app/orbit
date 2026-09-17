import assert from "node:assert/strict";
import test from "node:test";

import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import {
  buildConfirmationPayload,
  collectingProgressForItems,
  completionCountsForItems,
  groupIngestItemsByCardId,
  fieldCandidates,
  initialCardDraft,
  progressForItems,
  readConfirmationReceipt,
  reconcileCardDraft,
  setManualDraftField,
  setManualDraftNotes,
  setDraftFieldSource,
  type IngestV2CardViewModel,
} from "../../app/(app)/app/contacts/new/batch2/ingest-v2-route-view-model";

const NOW = "2026-09-17T00:00:00.000Z";
const EMPTY_EXTRACTION = {
  addresses: [],
  certifications: [],
  contactPoints: [],
  departments: [],
  detectedLanguages: [],
  emails: [],
  fullName: null,
  nativeFullName: null,
  organization: null,
  romanizedFullName: null,
  title: null,
  website: null,
} as const;

function item(overrides: Partial<IngestItemDTO> = {}): IngestItemDTO {
  const side = overrides.side ?? "front";
  const id = overrides.id ?? `item-${side}`;
  return {
    attemptCount: 1,
    batchId: "batch-1",
    cardId: "card-1",
    side,
    clientDigest: `sha256:${"c".repeat(64)}`,
    confirmedContactId: null,
    createdAt: NOW,
    derivativeObjectKey: "derivatives/card.jpg",
    derivativeSize: 100,
    errorCode: null,
    errorStage: null,
    extraction: {
      ...EMPTY_EXTRACTION,
      emails: [{ label: null, value: "aki@example.test" }],
      fullName: "秋 太郎",
      nativeFullName: "秋 太郎",
      organization: side === "front" ? "Orbit" : "Orbit Labs",
      title: "Engineer",
    },
    extractionSchemaVersion: 1,
    id,
    imageDigest: `sha256:${side === "front" ? "a" : "b"}`.padEnd(71, "0"),
    leaseExpiresAt: null,
    nextRetryAt: null,
    rawMimeType: "image/jpeg",
    rawSize: 100,
    reviewIssues: [],
    seq: side === "front" ? 1 : 2,
    sourceFileName: `${side}.jpg`,
    status: "extracted",
    updatedAt: NOW,
    usage: null,
    version: 1,
    ...overrides,
  };
}

function card(items: readonly IngestItemDTO[]): IngestV2CardViewModel {
  return groupIngestItemsByCardId(items)[0]!;
}

test("groups server items by cardId and keeps front/back source identity", () => {
  const front = item();
  const back = item({ id: "item-back", side: "back", seq: 2 });
  const other = item({ id: "item-other", cardId: "card-2", seq: 3, side: "front" });
  const cards = groupIngestItemsByCardId([other, back, front]);
  assert.deepEqual(cards.map((entry) => ({ id: entry.cardId, front: entry.front?.id, back: entry.back?.id })), [
    { id: "card-1", front: "item-front", back: "item-back" },
    { id: "card-2", front: "item-other", back: undefined },
  ]);
  assert.equal(cards[0]!.isTwoSided, true);
  assert.equal(cards[1]!.isTwoSided, false);
});

test("conflicting values are never silently selected and each candidate keeps its item source", () => {
  const current = card([item(), item({ id: "item-back", side: "back", seq: 2 })]);
  const draft = initialCardDraft(current);
  assert.equal(draft.fields.organization, "");
  assert.equal(draft.fieldSources.organization, null);
  assert.deepEqual(draft.conflictedFields, ["organization"]);
  assert.equal(draft.fields.displayName, "秋 太郎");
  assert.equal(draft.fieldSources.displayName, "item-front");
  assert.equal(buildConfirmationPayload(current, draft, "intent:conflict").blockedReason, "conflicting_fields");
  const resolved = setManualDraftField(draft, "organization", "手工公司");
  assert.equal(buildConfirmationPayload(current, resolved, "intent:resolved").blockedReason, null);
  const selected = setDraftFieldSource(draft, "organization", fieldCandidates(current.front!)[1]!);
  assert.equal(buildConfirmationPayload(current, selected, "intent:selected").blockedReason, null);
});

test("a changed source version invalidates only that source field and preserves manual fields", () => {
  const current = card([item(), item({ id: "item-back", side: "back", seq: 2 })]);
  const previous = initialCardDraft(current);
  previous.fields.organization = "手工公司";
  previous.fieldSources.organization = null;
  previous.fields.relationshipContext = "在东京活动认识";
  previous.fields.notes = "我写的备注";
  const refreshed = card([item({ version: 2 }), item({ id: "item-back", side: "back", seq: 2 })]);
  const next = reconcileCardDraft(previous, refreshed);
  assert.equal(next.fields.organization, "手工公司");
  assert.equal(next.fields.relationshipContext, "在东京活动认识");
  assert.equal(next.fields.notes, "我写的备注");
  assert.equal(next.fields.displayName, "");
  assert.deepEqual(next.staleFields, ["displayName", "role", "email"]);
  assert.equal(next.fieldSources.displayName, null);
  const polledAgain = reconcileCardDraft(next, refreshed);
  assert.deepEqual(polledAgain.staleFields, ["displayName", "role", "email"]);
  assert.equal(polledAgain.fields.displayName, "");
  assert.deepEqual(setManualDraftField(polledAgain, "displayName", "手工姓名").staleFields, ["role", "email"]);
});

test("confirmation rejects an unreconciled draft when a source item changes or its snapshot is missing", () => {
  const current = card([item()]);
  const oldDraft = initialCardDraft(current);
  const refreshed = card([item({ version: 2 })]);

  assert.deepEqual(oldDraft.staleFields, []);
  assert.equal(
    buildConfirmationPayload(refreshed, oldDraft, "intent:unreconciled").blockedReason,
    "source_expired",
  );

  const missingSnapshot = {
    ...oldDraft,
    sourceSnapshots: { ...oldDraft.sourceSnapshots, displayName: null },
  };
  assert.equal(
    buildConfirmationPayload(current, missingSnapshot, "intent:missing-snapshot").blockedReason,
    "source_expired",
  );
});

test("a selected conflicting source remains resolved across an unchanged poll", () => {
  const current = card([item(), item({ id: "item-back", side: "back", seq: 2 })]);
  const initial = initialCardDraft(current);
  const selected = setDraftFieldSource(initial, "organization", fieldCandidates(current.back!)[1]!);
  const polled = reconcileCardDraft(selected, current);
  assert.deepEqual(polled.conflictedFields, []);
  assert.equal(buildConfirmationPayload(current, polled, "intent:selected-poll").blockedReason, null);
});

test("automatic notes follow a changed source while a hand-edited note stays visible", () => {
  const current = card([item(), item({ id: "item-back", side: "back", seq: 2 })]);
  const initial = initialCardDraft(current);
  const refreshed = card([item({ version: 2 }), item({ id: "item-back", side: "back", seq: 2 })]);
  const auto = reconcileCardDraft(initial, refreshed);
  assert.equal(auto.notesDirty, false);
  assert.equal(auto.notesSourceUpdated, true);

  const manual = setManualDraftNotes(initial, "我的备注");
  const preserved = reconcileCardDraft(manual, refreshed);
  assert.equal(preserved.fields.notes, "我的备注");
  assert.equal(preserved.notesDirty, true);
  assert.equal(preserved.notesSourceUpdated, true);
  assert.equal(setManualDraftNotes(preserved, "新的备注").notesSourceUpdated, false);
});

test("confirmation payload freezes both sides, source IDs and intent without fabricating imageDigest", () => {
  const current = card([item(), item({ id: "item-back", side: "back", seq: 2 })]);
  const draft = initialCardDraft(current);
  const resolvedDraft = setManualDraftField(draft, "organization", "Orbit");
  const result = buildConfirmationPayload(current, resolvedDraft, "intent:1");
  assert.equal(result.blockedReason, null);
  assert.deepEqual(result.payload?.expectedCardItems, [
    { itemId: "item-front", version: 1, imageDigest: item().imageDigest },
    { itemId: "item-back", version: 1, imageDigest: item({ id: "item-back", side: "back" }).imageDigest },
  ]);
  assert.equal(result.payload?.confirmationIntentId, "intent:1");

  const missing = card([item({ imageDigest: null }), item({ id: "item-back", side: "back", seq: 2 })]);
  const missingResult = buildConfirmationPayload(missing, initialCardDraft(missing), "intent:2");
  assert.equal(missingResult.payload, null);
  assert.equal(missingResult.blockedReason, "missing_image_digest");
});

test("manual entry may submit a failed side, but normal confirm waits for both extracted", () => {
  const failed = card([
    item(),
    item({ id: "item-back", side: "back", seq: 2, status: "terminal_failed", extraction: null }),
  ]);
  const draft = initialCardDraft(failed);
  assert.equal(buildConfirmationPayload(failed, draft, "intent:3").blockedReason, "card_not_ready");
  assert.equal(buildConfirmationPayload(failed, draft, "intent:3", false, true).blockedReason, null);
  const waiting = card([item({ status: "processing" }), item({ id: "item-back", side: "back", seq: 2, status: "extracted" })]);
  assert.equal(buildConfirmationPayload(waiting, initialCardDraft(waiting), "intent:4", false, true).blockedReason, "card_not_ready");
});

test("duplicate sides remain invalid instead of being collapsed into a single-sided card", () => {
  const duplicateFront = item({ id: "item-front-2", seq: 2, side: "front" });
  const invalid = groupIngestItemsByCardId([item(), duplicateFront])[0]!;
  assert.equal(invalid.invalidStructure, true);
  assert.equal(invalid.items.length, 2);
  assert.equal(invalid.front, null);
  assert.equal(buildConfirmationPayload(invalid, initialCardDraft(invalid), "intent:invalid").blockedReason, "card_not_ready");
});

test("confirmation receipt requires every explicit side to be confirmed by one contact", () => {
  const current = card([item(), item({ id: "item-back", side: "back", seq: 2 })]);
  const responseItems = current.items.map((entry) => ({ ...entry, status: "confirmed" as const, confirmedContactId: "contact:1" }));
  const receipt = readConfirmationReceipt({ state: "created", contactId: "contact:1", items: responseItems }, current);
  assert.equal(receipt.ok, true);
  assert.equal(receipt.contactId, "contact:1");
  assert.equal(readConfirmationReceipt({ state: "created", contactId: "contact:1", items: [responseItems[0]!] }, current).reason, "wrong_card");
  assert.equal(readConfirmationReceipt({ state: "created", contactId: "contact:1", items: [responseItems[0]!, responseItems[0]!] }, current).reason, "wrong_card");
  const wrong = responseItems.map((entry, index) => ({ ...entry, confirmedContactId: index ? "contact:2" : "contact:1" }));
  assert.equal(readConfirmationReceipt({ state: "created", contactId: "contact:1", items: wrong }, current).reason, "wrong_contact");
});

test("a partial or split-contact confirmation is not a completed card", () => {
  const partial = groupIngestItemsByCardId([
    item({ status: "confirmed", confirmedContactId: "contact:1" }),
    item({ id: "item-back", side: "back", seq: 2, status: "extracted" }),
  ])[0]!;
  assert.equal(partial.allConfirmed, false);
  const split = groupIngestItemsByCardId([
    item({ status: "confirmed", confirmedContactId: "contact:1" }),
    item({ id: "item-back", side: "back", seq: 2, status: "confirmed", confirmedContactId: "contact:2" }),
  ])[0]!;
  assert.equal(split.allConfirmed, false);
  assert.equal(progressForItems(split.items).cardConfirmed, 0);
});

test("progress counts photos separately from card confirmations", () => {
  const values = [
    item({ status: "confirmed", confirmedContactId: "contact:1" }),
    item({ id: "item-back", side: "back", seq: 2, status: "confirmed", confirmedContactId: "contact:1" }),
    item({ id: "item-2", cardId: "card-2", seq: 3, status: "extracted" }),
  ];
  assert.deepEqual(progressForItems(values), { photoCount: 3, photoSettled: 3, cardCount: 2, cardSettled: 2, cardConfirmed: 1 });
});

test("collecting progress counts uploaded and excluded photos as ready", () => {
  const values = [
    item({ status: "uploaded" }),
    item({ id: "item-back", side: "back", seq: 2, status: "uploaded" }),
    item({ id: "item-2", cardId: "card-2", seq: 3, status: "excluded", imageDigest: null }),
  ];
  assert.deepEqual(collectingProgressForItems(values), { photoCount: 3, photoSettled: 3, cardCount: 2, cardSettled: 2, cardConfirmed: 0 });
});

test("completion counts are card-level for two-sided cards", () => {
  const values = [
    item({ status: "confirmed", confirmedContactId: "contact:1" }),
    item({ id: "item-back", side: "back", seq: 2, status: "confirmed", confirmedContactId: "contact:1" }),
    item({ id: "item-skipped", cardId: "card-2", seq: 3, status: "skipped" }),
  ];
  assert.deepEqual(completionCountsForItems(values), { confirmed: 1, skipped: 1 });
});
