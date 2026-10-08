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
  setDraftIndustry,
  setDraftRegion,
  setDraftSeniority,
  type IngestV2CardViewModel,
} from "../../app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model";

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

test("the first printed address fills the address field, leaves notes, and reaches the payload", () => {
  const extraction = {
    ...EMPTY_EXTRACTION,
    addresses: [
      { label: "office", value: "〒171-0002 Minami-ikebukuro 2-23-4 Toshima-City Tokyo Japan" },
      { label: "工場", value: "埼玉県テスト市5-6-7" },
    ],
    fullName: "富沢 弘治",
    nativeFullName: "富沢 弘治",
  };
  const current = card([item({ extraction })]);
  const draft = initialCardDraft(current);
  assert.equal(draft.fields.address, "〒171-0002 Minami-ikebukuro 2-23-4 Toshima-City Tokyo Japan");
  assert.equal(draft.fieldSources.address, "item-front");
  assert.ok(!draft.fields.notes.includes("Minami-ikebukuro"), "the chosen address is not duplicated into notes");
  assert.ok(draft.fields.notes.includes("埼玉県テスト市5-6-7"), "other printed addresses stay in notes");
  const result = buildConfirmationPayload(current, draft, "intent:address");
  assert.equal(result.payload?.address, draft.fields.address);
  assert.equal(result.payload?.fieldSources.address, "item-front");
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

// W0013：审阅页「行业」一行。
function withIndustry(base: IngestItemDTO, primaryIndustryId: string | null, secondaryIndustryId: string | null): IngestItemDTO {
  return {
    ...base,
    extraction: { ...base.extraction!, primaryIndustryId, secondaryIndustryId } as IngestItemDTO["extraction"],
    extractionSchemaVersion: 2,
  };
}

test("the industry row starts from the recognized pair and reaches the confirmation payload; two different sides are a conflict", () => {
  const front = withIndustry(item(), "technology_internet", "technology_internet.ai_data");
  const back = withIndustry(item({ id: "item-back", side: "back", seq: 2, extraction: { ...EMPTY_EXTRACTION, fullName: "秋 太郎", organization: "Orbit" } }), "finance_investment", "finance_investment.fintech");
  const conflicted = initialCardDraft(card([front, back]));
  assert.deepEqual(conflicted.industry, { primaryIndustryId: null, secondaryIndustryId: null, edited: false, conflicted: true });

  const backOnly = card([withIndustry(item(), null, null), back]);
  assert.deepEqual(initialCardDraft(backOnly).industry, { primaryIndustryId: "finance_investment", secondaryIndustryId: "finance_investment.fintech", edited: false, conflicted: false });

  const sameWithOneSecondary = card([withIndustry(item(), "technology_internet", null), withIndustry(back, "technology_internet", "technology_internet.ai_data")]);
  assert.equal(initialCardDraft(sameWithOneSecondary).industry.secondaryIndustryId, "technology_internet.ai_data");
  assert.equal(initialCardDraft(sameWithOneSecondary).industry.conflicted, false);

  const single = card([front]);
  const payload = buildConfirmationPayload(single, initialCardDraft(single), "intent:industry").payload!;
  assert.equal(payload.primaryIndustryId, "technology_internet");
  assert.equal(payload.secondaryIndustryId, "technology_internet.ai_data");
});

test("a v1 extraction without industry keys opens with an empty industry row and still confirms", () => {
  const legacy = card([item()]);
  const draft = initialCardDraft(legacy);
  assert.deepEqual(draft.industry, { primaryIndustryId: null, secondaryIndustryId: null, edited: false, conflicted: false });
  const prepared = buildConfirmationPayload(legacy, draft, "intent:legacy");
  assert.equal(prepared.blockedReason, null);
  assert.equal(prepared.payload?.primaryIndustryId, null);
  assert.equal(prepared.payload?.secondaryIndustryId, null);
});

test("the reviewer can change or clear the industry and a poll keeps the choice", () => {
  const current = card([withIndustry(item(), "technology_internet", "technology_internet.ai_data")]);
  const draft = initialCardDraft(current);
  const changed = setDraftIndustry(draft, { primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" });
  assert.deepEqual(changed.industry, { primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal", edited: true, conflicted: false });
  assert.equal(reconcileCardDraft(changed, current).industry.primaryIndustryId, "professional_services");
  assert.equal(buildConfirmationPayload(current, changed, "intent:changed").payload?.secondaryIndustryId, "professional_services.legal");

  const cleared = setDraftIndustry(changed, { primaryIndustryId: null, secondaryIndustryId: null });
  assert.deepEqual(reconcileCardDraft(cleared, current).industry, { primaryIndustryId: null, secondaryIndustryId: null, edited: true, conflicted: false });
  assert.equal(buildConfirmationPayload(current, cleared, "intent:cleared").payload?.primaryIndustryId, null);

  const mismatched = setDraftIndustry(draft, { primaryIndustryId: "professional_services", secondaryIndustryId: "finance_investment.banking" });
  assert.equal(mismatched.industry.primaryIndustryId, null, "a mismatched pair is never submitted");

  // 未改过的行业跟随最新识别结果（例如重新识别后）。
  const rerun = card([withIndustry(item({ version: 2 }), "media_creative", null)]);
  assert.equal(reconcileCardDraft(draft, rerun).industry.primaryIndustryId, "media_creative");
});

// W0045：「职级」「地区」两行——初值来自识别结果，正反面冲突不预选，改过的行轮询刷新不覆盖，最终值随确认提交。
function withEnrichment(entry: IngestItemDTO, seniorityLevel: string | null, regionCountryCode: string | null, regionCity: string | null): IngestItemDTO {
  return { ...entry, extraction: { ...entry.extraction!, seniorityLevel, regionCountryCode, regionCity } as IngestItemDTO["extraction"], extractionSchemaVersion: 3 };
}

test("W0045 seniority and region rows start from recognition; disagreeing sides are conflicts, a missing city on one side is not", () => {
  const front = withEnrichment(item(), "director", "JP", "Tokyo");
  const back = withEnrichment(item({ id: "item-back", side: "back", seq: 2 }), "vp", "JP", null);
  const draft = initialCardDraft(card([front, back]));
  assert.deepEqual(draft.seniority, { value: null, edited: false, conflicted: true });
  assert.deepEqual(draft.region, { countryCode: "JP", city: "Tokyo", edited: false, conflicted: false });
  const otherCountry = initialCardDraft(card([front, withEnrichment(back, "director", "CN", "Shanghai")]));
  assert.deepEqual(otherCountry.seniority, { value: "director", edited: false, conflicted: false });
  assert.deepEqual(otherCountry.region, { countryCode: null, city: null, edited: false, conflicted: true });
  const legacy = initialCardDraft(card([item()]));
  assert.deepEqual([legacy.seniority, legacy.region], [{ value: null, edited: false, conflicted: false }, { countryCode: null, city: null, edited: false, conflicted: false }]);
  const single = card([front]);
  const payload = buildConfirmationPayload(single, initialCardDraft(single), "intent:enrichment").payload!;
  assert.deepEqual([payload.seniorityLevel, payload.regionCountryCode, payload.regionCity], ["director", "JP", "Tokyo"]);
  assert.equal("enrichment" in payload, false, "the client never sends provenance");
});

test("W0045 an edited seniority or region survives polling, and clearing is submitted as null", () => {
  const current = card([withEnrichment(item(), "director", "JP", "Tokyo")]);
  const edited = setDraftRegion(setDraftSeniority(initialCardDraft(current), "manager"), { countryCode: "JP", city: "New Osaka " });
  assert.deepEqual(edited.seniority, { value: "manager", edited: true, conflicted: false });
  assert.equal(edited.region.city, "New Osaka ", "the city keeps typed spaces while editing");
  const rerun = card([withEnrichment(item({ version: 2 }), "c_level", "SG", "Singapore")]);
  const polled = reconcileCardDraft(edited, rerun);
  assert.equal(polled.seniority.value, "manager");
  assert.deepEqual([polled.region.countryCode, polled.region.city], ["JP", "New Osaka "]);
  const payload = buildConfirmationPayload(current, edited, "intent:edited").payload!;
  assert.deepEqual([payload.seniorityLevel, payload.regionCountryCode, payload.regionCity], ["manager", "JP", "New Osaka"]);
  // 未改过的行跟随最新识别结果。
  assert.equal(reconcileCardDraft(initialCardDraft(current), rerun).seniority.value, "c_level");

  const cleared = setDraftRegion(setDraftSeniority(edited, null), { countryCode: null, city: "Tokyo" });
  const clearedPayload = buildConfirmationPayload(current, cleared, "intent:cleared").payload!;
  assert.deepEqual([clearedPayload.seniorityLevel, clearedPayload.regionCountryCode, clearedPayload.regionCity], [null, null, null]);
  assert.equal(setDraftSeniority(edited, "boss").seniority.value, null, "an unknown level is never submitted");
  assert.equal(setDraftRegion(edited, { countryCode: "XX", city: "Tokyo" }).region.countryCode, null);
});
