/**
 * W0045：把补全值按来源规则写进联系人 payload（`orbit_records.payload`，即整份 ContactDTO）。
 * 名片确认（新建与合并）、联系人编辑、回填、按文字补全的调用方都经过这里，规则只有
 * shared/domain/enrichment.ts 的 canWriteEnrichedValue 一处。
 *
 * 值的位置：行业 → primaryIndustryId／secondaryIndustryId；职级 → publicProfile.seniorityLevel；
 * 地区 → region；专长／需求／话题（W0046）→ publicProfile.offering／seeking／topics。来源 → enrichment.fields[field]。
 */
import type { IndustryIdCode, SecondaryIndustryIdCode } from "../../../shared/contract/industries";
import type { ContactRegionDTO, EnrichmentField, EnrichmentOrigin, EnrichmentVia } from "../../../shared/domain/contracts";
import {
  canWriteEnrichedValue,
  readStoredEnrichment,
  withEnrichmentProvenance,
} from "../../../shared/domain/enrichment";
import { isIndustryIdCode, sanitizeIndustryPair } from "../../../shared/domain/industries";
import { readStoredRegion } from "../../../shared/domain/regions";
import { isSeniorityLevelValue, type SeniorityLevelValue } from "../../../shared/domain/seniority";

export type CardEnrichmentField = Extract<EnrichmentField, "industry" | "seniorityLevel" | "region">;
/** W0046：memo 提取写回的三个列表字段（值在 publicProfile.offering／seeking／topics）。 */
export type ProfileListEnrichmentField = Extract<EnrichmentField, "offering" | "seeking" | "topics">;
export type AppliedEnrichmentField = CardEnrichmentField | ProfileListEnrichmentField;
export const PROFILE_LIST_ENRICHMENT_FIELDS: readonly ProfileListEnrichmentField[] = ["offering", "seeking", "topics"];

export type EnrichedValue =
  | { field: "industry"; value: { primaryIndustryId: IndustryIdCode; secondaryIndustryId: SecondaryIndustryIdCode | null }; origin: EnrichmentOrigin; via: EnrichmentVia }
  | { field: "seniorityLevel"; value: SeniorityLevelValue; origin: EnrichmentOrigin; via: EnrichmentVia }
  | { field: "region"; value: ContactRegionDTO; origin: EnrichmentOrigin; via: EnrichmentVia }
  | { field: ProfileListEnrichmentField; value: readonly string[]; origin: EnrichmentOrigin; via: EnrichmentVia };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && !value.trim());
}

/** payload 当前是否已有该字段的值（存量判断与写入规则用同一口径）。 */
export function enrichedFieldHasValue(payload: Record<string, unknown>, field: AppliedEnrichmentField): boolean {
  switch (field) {
    case "industry":
      return !emptyValue(payload.primaryIndustryId) || !emptyValue(payload.secondaryIndustryId);
    case "seniorityLevel":
      return isRecord(payload.publicProfile) && !emptyValue(payload.publicProfile.seniorityLevel);
    case "region":
      return isRecord(payload.region) && !emptyValue(payload.region.countryCode);
    case "offering":
    case "seeking":
    case "topics": {
      const list = isRecord(payload.publicProfile) ? payload.publicProfile[field] : undefined;
      return Array.isArray(list) && list.some((item) => typeof item === "string" && item.trim().length > 0);
    }
  }
}

/** 这个值能否按来源规则写进 payload（不写入）。 */
export function canApplyEnrichedValue(payload: Record<string, unknown>, field: AppliedEnrichmentField, origin: EnrichmentOrigin): boolean {
  const enrichment = readStoredEnrichment(payload.enrichment);
  return canWriteEnrichedValue(
    { hasValue: enrichedFieldHasValue(payload, field), provenance: enrichment?.fields[field] ?? null },
    origin,
  );
}

function validValue(entry: EnrichedValue): boolean {
  switch (entry.field) {
    case "industry": {
      const pair = sanitizeIndustryPair(entry.value.primaryIndustryId, entry.value.secondaryIndustryId);
      return isIndustryIdCode(pair.primaryIndustryId);
    }
    case "seniorityLevel":
      return isSeniorityLevelValue(entry.value);
    case "region":
      return readStoredRegion(entry.value) !== null;
    case "offering":
    case "seeking":
    case "topics":
      return Array.isArray(entry.value) && entry.value.some((item) => typeof item === "string" && item.trim().length > 0);
  }
}

export interface ApplyEnrichedValuesOptions {
  /**
   * 名片并入已有联系人：审阅页上改过的值（`user`）描述的是这张名片，不是对这个联系人的直接编辑，
   * 所以写入资格按推断值算（只补空、只替换 `ai`），写入后来源仍记 `user`。对标 HubSpot 合并记录：
   * 主记录已有的值保留。联系人编辑（PATCH）不设此项，`user` 永远可写。
   */
  mergeIntoExisting?: boolean;
}

/**
 * 逐项按来源规则写入（就地修改 payload），返回实际写入的字段。不能写的项原样跳过、不报错。
 * 值不合法的项也跳过（调用方应已清洗）。
 */
export function applyEnrichedValues(
  payload: Record<string, unknown>,
  values: readonly EnrichedValue[],
  at: string,
  options: ApplyEnrichedValuesOptions = {},
): AppliedEnrichmentField[] {
  const written: AppliedEnrichmentField[] = [];
  for (const entry of values) {
    const gate = options.mergeIntoExisting && entry.origin === "user" ? "ai" : entry.origin;
    if (!validValue(entry) || !canApplyEnrichedValue(payload, entry.field, gate)) continue;
    switch (entry.field) {
      case "industry": {
        const pair = sanitizeIndustryPair(entry.value.primaryIndustryId, entry.value.secondaryIndustryId);
        payload.primaryIndustryId = pair.primaryIndustryId;
        if (pair.secondaryIndustryId) payload.secondaryIndustryId = pair.secondaryIndustryId;
        else delete payload.secondaryIndustryId;
        break;
      }
      case "seniorityLevel":
        payload.publicProfile = { ...(isRecord(payload.publicProfile) ? payload.publicProfile : {}), seniorityLevel: entry.value };
        break;
      case "region":
        payload.region = { countryCode: entry.value.countryCode, city: entry.value.city ?? null };
        break;
      case "offering":
      case "seeking":
      case "topics":
        payload.publicProfile = {
          ...(isRecord(payload.publicProfile) ? payload.publicProfile : {}),
          [entry.field]: [...new Set(entry.value.map((item) => item.trim()).filter(Boolean))],
        };
        break;
    }
    payload.enrichment = withEnrichmentProvenance(readStoredEnrichment(payload.enrichment), entry.field, {
      origin: entry.origin,
      updatedAt: at,
      via: entry.via,
    });
    written.push(entry.field);
  }
  return written;
}
