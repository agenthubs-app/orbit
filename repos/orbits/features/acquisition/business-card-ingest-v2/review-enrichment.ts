/**
 * W0045 SC-02：确认时由服务端判定补全值的来源，不信客户端。
 * 提交值与该卡（正反面任一面）的识别结果相等 → `ai`（via card_ocr）；
 * 不等、或识别为空而提交有值 → `user`（via card_review）。提交 null／缺省 → 不写（旧客户端不传时行为不变）。
 */
import type { BusinessCardStructuredExtraction } from "../business-card-cloud-ocr";
import { sanitizeCardEnrichment } from "../business-card-enrichment-prompt";
import type { EnrichedValue } from "../../contacts/enrichment/apply-enrichment";
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../shared/contract/industries";
import { sanitizeIndustryPair } from "../../../shared/domain/industries";
import { normalizeRegion } from "../../../shared/domain/regions";
import { isSeniorityLevelValue } from "../../../shared/domain/seniority";

export interface ReviewedEnrichmentInput {
  primaryIndustryId?: IndustryIdCode | null;
  secondaryIndustryId?: SecondaryIndustryIdCode | null;
  seniorityLevel?: string | null;
  regionCountryCode?: string | null;
  regionCity?: string | null;
}

export type ReviewedEnrichmentResult =
  | { ok: true; values: EnrichedValue[] }
  | { ok: false; reason: "invalid_region" | "invalid_seniority" };

function origin(recognized: boolean) {
  return recognized
    ? { origin: "ai" as const, via: "card_ocr" as const }
    : { origin: "user" as const, via: "card_review" as const };
}

export function reviewedEnrichmentValues(
  input: ReviewedEnrichmentInput,
  extractions: readonly (BusinessCardStructuredExtraction | null | undefined)[],
): ReviewedEnrichmentResult {
  const sides = extractions.filter((entry): entry is BusinessCardStructuredExtraction => Boolean(entry));
  const values: EnrichedValue[] = [];

  const industry = sanitizeIndustryPair(input.primaryIndustryId, input.secondaryIndustryId);
  if (industry.primaryIndustryId) {
    const recognized = sides.some((side) => {
      const pair = sanitizeIndustryPair(side.primaryIndustryId, side.secondaryIndustryId);
      return pair.primaryIndustryId === industry.primaryIndustryId && pair.secondaryIndustryId === industry.secondaryIndustryId;
    });
    values.push({
      field: "industry",
      value: { primaryIndustryId: industry.primaryIndustryId, secondaryIndustryId: industry.secondaryIndustryId },
      ...origin(recognized),
    });
  }

  if (input.seniorityLevel !== undefined && input.seniorityLevel !== null) {
    if (!isSeniorityLevelValue(input.seniorityLevel)) return { ok: false, reason: "invalid_seniority" };
    const level = input.seniorityLevel;
    const recognized = sides.some((side) => sanitizeCardEnrichment(side.seniorityLevel, null, null).seniorityLevel === level);
    values.push({ field: "seniorityLevel", value: level, ...origin(recognized) });
  }

  if (input.regionCountryCode) {
    const region = normalizeRegion(input.regionCountryCode, input.regionCity ?? null);
    if (!region) return { ok: false, reason: "invalid_region" };
    const recognized = sides.some((side) => {
      const card = sanitizeCardEnrichment(null, side.regionCountryCode, side.regionCity);
      return card.regionCountryCode === region.countryCode && card.regionCity === region.city;
    });
    values.push({ field: "region", value: region, ...origin(recognized) });
  }

  return { ok: true, values };
}
