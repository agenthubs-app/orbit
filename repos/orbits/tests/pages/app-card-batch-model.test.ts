import assert from "node:assert/strict";
import test from "node:test";

import type { IngestItemDTO } from "../../features/acquisition/business-card-ingest-v2/contract";
import { groupIngestItemsByCardId, initialCardDraft, setDraftIndustry, setDraftRegion, setDraftSeniority, setManualDraftField } from "../../app/(app)/app/contacts/ingest-v2/ingest-v2-route-view-model";
import {
  cardReason,
  enrichmentNeedsReview,
  fieldTag,
  flaggedFields,
  industryNeedsReview,
  isAutoImportEligible,
  isAutoMergeEligible,
  needsReview,
  parseStage,
} from "../../app/(app)/app/contacts/card-batch-0918/card-batch-model";

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

test("a second-read disagreement names the field in plain words instead of pipeline jargon", () => {
  const reason = (field: string) => {
    const { card, draft } = cardOf({ reviewIssues: [{ code: "VERIFICATION_MISMATCH", field, message: "" }] as IngestItemDTO["reviewIssues"] });
    return cardReason(card, draft, false).zh;
  };
  assert.equal(reason("emails"), "邮箱可能有字读错");
  assert.equal(reason("contactPoints"), "电话可能有字读错");
  assert.equal(reason("organization"), "公司名可能有字读错");
});

// W0013：正反面给出不同行业的卡不自动导入、也不自动并入，直到用户选定或清空。
function twoSided(front: [string | null, string | null], back: [string | null, string | null]) {
  const side = (which: "front" | "back", [primaryIndustryId, secondaryIndustryId]: [string | null, string | null]) => {
    const base = item({ id: `item-${which}`, side: which, seq: which === "front" ? 1 : 2 });
    return { ...base, extraction: { ...base.extraction!, primaryIndustryId, secondaryIndustryId } as IngestItemDTO["extraction"] };
  };
  const card = groupIngestItemsByCardId([side("front", front), side("back", back)])[0]!;
  return { card, draft: initialCardDraft(card) };
}

test("different industries on two sides are not auto-imported or auto-merged until the reviewer resolves them", () => {
  for (const [front, back] of [
    [["technology_internet", "technology_internet.ai_data"], ["finance_investment", "finance_investment.fintech"]],
    [["technology_internet", "technology_internet.ai_data"], ["technology_internet", "technology_internet.cybersecurity"]],
  ] as const) {
    const { card, draft } = twoSided([...front], [...back]);
    assert.equal(industryNeedsReview(draft), true);
    assert.equal(draft.industry.primaryIndustryId, null, "no side is silently preferred");
    assert.equal(isAutoImportEligible(card, draft), false);
    assert.equal(isAutoMergeEligible(card, draft), false);
    assert.deepEqual(cardReason(card, draft, false), { zh: "正反面行业不一致", en: "Sides disagree on industry" });
    assert.equal(needsReview(card, new Set()), true);

    const picked = setDraftIndustry(draft, { primaryIndustryId: back[0], secondaryIndustryId: back[1] });
    assert.equal(isAutoImportEligible(card, picked), true);
    assert.equal(isAutoMergeEligible(card, picked), true);
    const cleared = setDraftIndustry(draft, { primaryIndustryId: null, secondaryIndustryId: null });
    assert.equal(industryNeedsReview(cleared), false, "clearing also resolves the conflict");
  }
});

test("matching industries, or one side missing the secondary, are not a conflict", () => {
  const same = twoSided(["technology_internet", "technology_internet.ai_data"], ["technology_internet", null]);
  assert.equal(industryNeedsReview(same.draft), false);
  assert.equal(same.draft.industry.secondaryIndustryId, "technology_internet.ai_data", "the non-null secondary is used");
  assert.equal(isAutoImportEligible(same.card, same.draft), true);
  const oneSide = twoSided([null, null], ["finance_investment", "finance_investment.fintech"]);
  assert.equal(oneSide.draft.industry.primaryIndustryId, "finance_investment");
  assert.equal(isAutoMergeEligible(oneSide.card, oneSide.draft), true);
});

// W0045：职级／地区正反面冲突同行业做法——不预选、挡自动导入与自动并入，选定或清空后放行。
function twoSidedEnrichment(front: Record<string, unknown>, back: Record<string, unknown>) {
  const side = (which: "front" | "back", values: Record<string, unknown>) => {
    const base = item({ id: `item-${which}`, side: which, seq: which === "front" ? 1 : 2 });
    return { ...base, extraction: { ...base.extraction!, ...values } as IngestItemDTO["extraction"] };
  };
  const card = groupIngestItemsByCardId([side("front", front), side("back", back)])[0]!;
  return { card, draft: initialCardDraft(card) };
}

test("W0045 disagreeing seniority or region blocks auto import and auto merge until resolved", () => {
  const seniority = twoSidedEnrichment({ seniorityLevel: "director" }, { seniorityLevel: "manager" });
  assert.equal(enrichmentNeedsReview(seniority.draft), true);
  assert.equal(seniority.draft.seniority.value, null, "no side is silently preferred");
  assert.equal(isAutoImportEligible(seniority.card, seniority.draft), false);
  assert.equal(isAutoMergeEligible(seniority.card, seniority.draft), false);
  assert.deepEqual(cardReason(seniority.card, seniority.draft, false), { zh: "正反面职级不一致", en: "Sides disagree on seniority" });
  const picked = setDraftSeniority(seniority.draft, "manager");
  assert.equal(isAutoImportEligible(seniority.card, picked), true);
  assert.equal(isAutoMergeEligible(seniority.card, picked), true);

  const region = twoSidedEnrichment({ regionCountryCode: "JP", regionCity: "Tokyo" }, { regionCountryCode: "JP", regionCity: "Osaka" });
  assert.equal(isAutoImportEligible(region.card, region.draft), false);
  assert.deepEqual(cardReason(region.card, region.draft, false), { zh: "正反面地区不一致", en: "Sides disagree on region" });
  const cleared = setDraftRegion(region.draft, { countryCode: null, city: null });
  assert.equal(enrichmentNeedsReview(cleared), false, "clearing also resolves the conflict");
  assert.equal(isAutoMergeEligible(region.card, cleared), true);

  const agreeing = twoSidedEnrichment({ seniorityLevel: "vp", regionCountryCode: "JP", regionCity: "Tokyo" }, { seniorityLevel: "vp", regionCountryCode: "JP", regionCity: null });
  assert.equal(enrichmentNeedsReview(agreeing.draft), false);
  assert.equal(isAutoImportEligible(agreeing.card, agreeing.draft), true);
});
