import assert from "node:assert/strict";
import test from "node:test";

import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import { groupIngestItemsByCardId, initialCardDraft, setManualDraftField } from "../../app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model";
import {
  cardReason,
  fieldTag,
  flaggedFields,
  isAutoImportEligible,
  needsReview,
  parseStage,
} from "../../app/(app)/app/profile/onboarding-0918/onboarding-card-model";

function item(overrides: Partial<IngestItemDTO> = {}): IngestItemDTO {
  return {
    id: "item-1", batchId: "b1", cardId: "card-1", side: "front", seq: 1, status: "extracted", version: 1,
    sourceFileName: "IMG_1.png", rawSize: 1, rawMimeType: "image/png", clientDigest: "sha256:x", imageDigest: "sha256:y",
    derivativeObjectKey: "k", derivativeSize: 1,
    extraction: {
      fullName: "山本 健一", nativeFullName: "山本 健一", romanizedFullName: null, organization: "株式会社ソニック", title: "部長",
      departments: [], emails: [{ value: "k@example.jp" }], contactPoints: [], addresses: [], website: null, certifications: [], detectedLanguages: ["ja"],
    } as unknown as IngestItemDTO["extraction"],
    extractionSchemaVersion: 1, reviewIssues: [], usage: null, confirmedContactId: null, attemptCount: 1, nextRetryAt: null,
    leaseExpiresAt: null, errorStage: null, errorCode: null, createdAt: "", updatedAt: "",
    ...overrides,
  } as IngestItemDTO;
}

function cardOf(overrides: Partial<IngestItemDTO> = {}) {
  const card = groupIngestItemsByCardId([item(overrides)])[0]!;
  return { card, draft: initialCardDraft(card) };
}

test("a clean, fully extracted card with a name is auto-imported; any review issue sends it to the user", () => {
  const clean = cardOf();
  assert.equal(isAutoImportEligible(clean.card, clean.draft), true);
  const flagged = cardOf({ reviewIssues: [{ code: "NATIVE_ROMANIZED_NAME_CONFLICT", field: "romanizedFullName", message: "" }] });
  assert.equal(isAutoImportEligible(flagged.card, flagged.draft), false);
  assert.deepEqual([...flaggedFields(flagged.card, flagged.draft)], ["displayName"]);
  assert.equal(cardReason(flagged.card, flagged.draft, false).zh, "姓名写法不一");
  assert.equal(cardReason(flagged.card, flagged.draft, true).zh, "可能重复");
});

test("cards still being recognized are neither auto-imported nor queued; failed ones are queued for manual entry", () => {
  const processing = cardOf({ status: "processing", extraction: null });
  assert.equal(isAutoImportEligible(processing.card, processing.draft), false);
  assert.equal(needsReview(processing.card, new Set()), false);
  const failed = cardOf({ status: "terminal_failed", extraction: null });
  assert.equal(needsReview(failed.card, new Set()), true);
  const clean = cardOf();
  assert.equal(needsReview(clean.card, new Set(["card-1"])), false, "auto-imported cards leave the queue");
});

test("field tags follow real signals only: edited > needs check > not found > recognized", () => {
  assert.equal(fieldTag({ edited: true, flagged: true, value: "x" }).kind, "edited");
  assert.equal(fieldTag({ edited: false, flagged: true, value: "x" }).kind, "check");
  assert.equal(fieldTag({ edited: false, flagged: false, value: " " }).kind, "empty");
  assert.equal(fieldTag({ edited: false, flagged: false, value: "x" }).kind, "ok");
  const noName = cardOf({ extraction: null, status: "extracted" });
  const draft = setManualDraftField(noName.draft, "organization", "Acme");
  assert.ok(flaggedFields(noName.card, draft).has("displayName"), "a missing name is always flagged");
});

test("batch status maps to the three parsing stages", () => {
  assert.equal(parseStage("collecting"), "upload");
  assert.equal(parseStage("processing"), "recognize");
  assert.equal(parseStage("ready_for_review"), "review");
  assert.equal(parseStage(undefined), "upload", "no detail yet must never count as review (would mark the reminder as seen)");
});
