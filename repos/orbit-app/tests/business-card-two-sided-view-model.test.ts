import assert from "node:assert/strict";
import test from "node:test";

import type { PreparedBatchImage } from "../src/api/batch-images";
import type { IngestBatchDetailContract, IngestItemContract } from "../src/api/contract/business-card-batch";
import * as ingest from "../src/view-models/business-card-ingest";
import * as review from "../src/view-models/business-card-batch";

const digest = (value: string) => `sha256:${value.repeat(64)}`;
const file: PreparedBatchImage = { uri: "file:///front.png", fileName: "front.png", mimeType: "image/png", rawSize: 10, clientDigest: digest("a") };
const stamp = "2026-09-14T00:00:00Z";

function extraction(fullName: string | null, organization: string | null, email: string) {
  return { fullName, nativeFullName: fullName, romanizedFullName: null, organization, departments: [], title: null,
    emails: email ? [{ label: null, value: email }] : [], contactPoints: [], website: null, addresses: [], certifications: [], detectedLanguages: ["ja"] };
}

function item(id: string, side: "front" | "back", value: ReturnType<typeof extraction>): IngestItemContract {
  return { id, batchId: "batch:one", cardId: "card:one", side, seq: side === "front" ? 1 : 2,
    status: "extracted", version: side === "front" ? 3 : 4, sourceFileName: `${side}.png`, rawSize: 10,
    rawMimeType: "image/png", clientDigest: digest(side === "front" ? "a" : "b"), imageDigest: digest(side === "front" ? "a" : "b"),
    derivativeObjectKey: `private/${side}`, derivativeSize: 10, extraction: value, extractionSchemaVersion: 1,
    reviewIssues: [], usage: null, confirmedContactId: null, attemptCount: 1, nextRetryAt: null,
    leaseExpiresAt: null, errorStage: null, errorCode: null, createdAt: stamp, updatedAt: stamp };
}

test("creation emits explicit front and optional back without inferring adjacent cards", () => {
  const front = { ...file, cardId: "card:one", side: "front" as const };
  const back = { ...file, uri: "file:///back.png", fileName: "back.png", clientDigest: digest("b"), cardId: "card:one", side: "back" as const };
  const attempt = ingest.creationAttempt([front, back], null, () => "key:one");
  assert.deepEqual(attempt.manifest.map(({ cardId, side, seq }) => ({ cardId, side, seq })), [
    { cardId: "card:one", side: "front", seq: 1 },
    { cardId: "card:one", side: "back", seq: 2 },
  ]);
  assert.throws(() => ingest.creationAttempt([{ ...back }], null, () => "key"), /正面/);
  assert.throws(() => ingest.creationAttempt([front, { ...back, side: "front" }], null, () => "key"), /正面/);
});

test("two-sided review merges missing values and exposes conflicts with exact source items", () => {
  const front = item("item:front", "front", extraction("山田 太郎", "Orbit", ""));
  const back = item("item:back", "back", extraction("Taro Yamada", "Orbit Japan", "taro@example.test"));
  const merger = (review as unknown as { reconcileBusinessCardReviewCard?: (items: readonly IngestItemContract[], previous?: unknown) => unknown }).reconcileBusinessCardReviewCard;
  assert.equal(typeof merger, "function", "reconcileBusinessCardReviewCard must exist");
  const draft = merger!([front, back]) as {
    fields: { displayName: string; organization: string; email: string };
    sources: Record<string, string | null>;
    conflicts: Record<string, readonly { value: string; itemId: string; side: string }[]>;
    unresolvedConflicts: readonly string[];
  };
  assert.equal(draft.fields.displayName, "山田 太郎");
  assert.equal(draft.fields.organization, "Orbit");
  assert.equal(draft.fields.email, "taro@example.test");
  assert.equal(draft.sources.displayName, null);
  assert.equal(draft.sources.email, "item:back");
  assert.deepEqual([...draft.unresolvedConflicts].sort(), ["displayName", "organization"]);
  assert.deepEqual(draft.conflicts.organization!.map(value => [value.value, value.itemId, value.side]), [["Orbit", "item:front", "front"], ["Orbit Japan", "item:back", "back"]]);
});

test("re-OCR invalidates side-derived choices while preserving explicit manual edits", () => {
  const front = item("item:front", "front", extraction("山田 太郎", "Orbit", ""));
  const back = item("item:back", "back", extraction(null, "Orbit Japan", "taro@example.test"));
  const initial = review.reconcileBusinessCardReviewCard([front, back]);
  const edited = {
    ...initial,
    fields: { ...initial.fields, displayName: "手動入力", organization: "Orbit Japan" },
    sources: { ...initial.sources, displayName: null, organization: back.id },
    unresolvedConflicts: [] as const,
    manualFields: ["displayName"] as const,
    dirty: true,
  };
  const refreshedBack = { ...back, version: back.version + 1, imageDigest: digest("c"), extraction: extraction(null, "新会社", "new@example.test") };
  const reconciled = review.reconcileBusinessCardReviewCard([front, refreshedBack], edited);
  assert.equal(reconciled.fields.displayName, "手動入力", "manual text survives a side refresh");
  assert.equal(reconciled.sources.displayName, null);
  assert.equal(reconciled.fields.organization, "Orbit", "stale selected source is discarded");
  assert.equal(reconciled.sources.organization, null);
  assert.ok(reconciled.unresolvedConflicts.includes("organization"));
  assert.equal(reconciled.fields.email, "new@example.test");
  assert.equal(reconciled.sources.email, back.id);
});

test("card helpers select one review anchor and bind confirmation to both exact versions", () => {
  const front = item("item:front", "front", extraction("山田 太郎", "Orbit", ""));
  const back = item("item:back", "back", extraction(null, null, "taro@example.test"));
  const detail: IngestBatchDetailContract = { batch: { id: "batch:one", actorId: "actor:one", status: "ready_for_review", expectedItems: 2, version: 3, reviewGeneration: 1, idempotencyKey: "key", manifestFingerprint: "a".repeat(64), statusReason: null, createdAt: stamp, updatedAt: stamp, finalizedAt: stamp, expiresAt: "2099-01-01T00:00:00Z" }, items: [front, back] };
  const cards = (ingest as unknown as { ingestCards?: (detail: IngestBatchDetailContract) => readonly { cardId: string; front: IngestItemContract; back: IngestItemContract | null }[] }).ingestCards;
  assert.equal(typeof cards, "function", "ingestCards must exist");
  assert.deepEqual(cards!(detail).map(card => [card.cardId, card.front.id, card.back?.id]), [["card:one", "item:front", "item:back"]]);
  const binder = (ingest as unknown as { cardConfirmationSnapshot?: (items: readonly IngestItemContract[], intentId: string, sources: Record<string, string | null>) => unknown }).cardConfirmationSnapshot;
  assert.equal(typeof binder, "function", "cardConfirmationSnapshot must exist");
  assert.deepEqual(binder!([front, back], "confirm:one", { displayName: front.id, organization: front.id, role: null, email: back.id, phone: null }), {
    confirmationIntentId: "confirm:one",
    expectedCardItems: [
      { itemId: "item:front", version: 3, imageDigest: digest("a") },
      { itemId: "item:back", version: 4, imageDigest: digest("b") },
    ],
    fieldSources: { displayName: front.id, organization: front.id, role: null, email: back.id, phone: null },
  });
});

test("mixed extracted and failed card accepts a whole-card manual-entry response", () => {
  const front = item("item:front", "front", extraction("山田 太郎", "Orbit", ""));
  const back = { ...item("item:back", "back", extraction(null, null, "")), status: "terminal_failed" as const, extraction: null, errorStage: "ocr" as const, errorCode: "OCR_PROVIDER_FAILED" as const };
  const detail: IngestBatchDetailContract = { batch: { id: "batch:one", actorId: "actor:one", status: "ready_for_review", expectedItems: 2, version: 3, reviewGeneration: 1, idempotencyKey: "key", manifestFingerprint: "a".repeat(64), statusReason: null, createdAt: stamp, updatedAt: stamp, finalizedAt: stamp, expiresAt: "2099-01-01T00:00:00Z" }, items: [front, back] };
  const confirmed = [front, back].map(value => ({ ...value, status: "confirmed" as const, version: value.version + 1, confirmedContactId: "contact:one", derivativeObjectKey: null, derivativeSize: null }));
  const response = { success: true as const, status: 200, data: { state: "created", contactId: "contact:one", item: confirmed[0], items: confirmed, replayed: false }, meta: { featureMode: null, privacy: null, runtimeBoundary: null } };
  const accepted = ingest.acceptedIngestReview(response, detail, front, "manual-entry");
  assert.equal(accepted?.state, "accepted");
  if (accepted?.state === "accepted") assert.equal(accepted.items.length, 2);
});

test("detail acceptance rejects orphan or duplicate sides instead of hiding malformed cards", () => {
  const front = item("item:front", "front", extraction("山田 太郎", "Orbit", ""));
  const back = item("item:back", "back", extraction("山田 太郎", "Orbit", ""));
  const batch = { id: "batch:one", actorId: "actor:one", status: "ready_for_review" as const, expectedItems: 2, version: 1, reviewGeneration: 0,
    idempotencyKey: "key:one", manifestFingerprint: "a".repeat(64), statusReason: null, createdAt: stamp, updatedAt: stamp, finalizedAt: stamp, expiresAt: "2099-01-01T00:00:00Z" };
  const ok = (items: IngestItemContract[]) => ({ success: true as const, status: 200, data: { batch, items }, meta: { featureMode: null, privacy: null, runtimeBoundary: null } });
  assert.ok(ingest.acceptedIngestDetail(ok([front, back]), batch.id, null));
  assert.equal(ingest.acceptedIngestDetail(ok([{ ...front, side: "back" }, back]), batch.id, null), null);
  assert.equal(ingest.acceptedIngestDetail(ok([front, { ...back, side: "front" }]), batch.id, null), null);
});
