/**
 * W0045：名片识别在现有文本整理（DeepSeek 第二次）与 Gemini 单次请求里顺带推断职级与规范地区，
 * 不另发请求（D5；SC-W0045-01）。模型输出一律经 sanitizeCardEnrichment 清洗：
 * 不合法的值清成 null，绝不让整张名片失败。
 */
import { normalizeRegion } from "../../shared/domain/regions";
import { SENIORITY_LEVELS, isSeniorityLevelValue, type SeniorityLevelValue } from "../../shared/domain/seniority";

export function businessCardEnrichmentInstruction(): string {
  return [
    `Also infer seniorityLevel from the printed title and department: one of ${SENIORITY_LEVELS.join(", ")}.`,
    "Use founder for a founder or co-founder; c_level for CEO, president, chairman, managing director of the company, CxO, 代表取締役, 社長, 会長, 董事长, 总经理; vp for vice president, executive officer, board director, 副社長, 専務, 常務, 執行役員, 取締役, 副总裁; director for director, head of a function, 部長, 本部長, 总监; manager for manager, team lead, 課長, 室長, 经理, 主管; individual_contributor for other staff titles.",
    "Set seniorityLevel to null when there is no title.",
    "Also set regionCountryCode to the uppercase ISO 3166-1 alpha-2 code of the country of the card's main office address (or, without an address, the printed phone country code), and regionCity to the English name of that city (for example Tokyo, Osaka, Shanghai, Singapore).",
    "Use null for regionCountryCode and regionCity when the card gives no basis, and null for regionCity alone when only the country is clear.",
  ].join(" ");
}

export interface BusinessCardEnrichmentFields {
  seniorityLevel: SeniorityLevelValue | null;
  regionCountryCode: string | null;
  regionCity: string | null;
}

/** 职级不在六档内 → null；国家码不合法 → 国家与城市一起 null；城市按别名表归一。 */
export function sanitizeCardEnrichment(seniorityLevel: unknown, regionCountryCode: unknown, regionCity: unknown): BusinessCardEnrichmentFields {
  const region = normalizeRegion(regionCountryCode, regionCity);
  return {
    seniorityLevel: isSeniorityLevelValue(seniorityLevel) ? seniorityLevel : null,
    regionCountryCode: region?.countryCode ?? null,
    regionCity: region?.city ?? null,
  };
}
