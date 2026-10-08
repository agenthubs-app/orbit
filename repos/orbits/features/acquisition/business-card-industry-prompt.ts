/**
 * 名片识别文本整理步骤里的行业分类说明（D5：放进现有调用，不另发请求）。
 *
 * 分类块从 shared/domain/industries.ts 生成，禁止手抄；形如
 * `food_hospitality: restaurants|cafes_beverages|…; technology_internet: …`，
 * 二级完整 id = 一级 id + "." + 后缀；每个一级都有的 "other" 后缀不逐条列出，由说明统一交代。
 * 模型输出仍由 sanitizeIndustryPair 按分类校验，提示词只负责引导。
 */
import { INDUSTRY_CATALOG, listSecondaryIndustries } from "../../shared/domain/industries";

function bySortOrder<T extends { sortOrder: number }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => left.sortOrder - right.sortOrder);
}

export function businessCardIndustryTaxonomyBlock(): string {
  return bySortOrder(INDUSTRY_CATALOG)
    .map((primary) => {
      const suffixes = bySortOrder(listSecondaryIndustries(primary.id))
        .map((secondary) => secondary.id.slice(primary.id.length + 1))
        .filter((suffix) => suffix !== "other");
      return suffixes.length ? `${primary.id}: ${suffixes.join("|")}` : primary.id;
    })
    .join("; ");
}

export function businessCardIndustryInstruction(): string {
  return [
    "Also classify the organization on the card into one industry.",
    "Base it on the organization name, title, departments, and any printed products or services.",
    "Set primaryIndustryId to a primary id and secondaryIndustryId to \"<primary id>.<suffix>\" using one of that primary's suffixes; every primary also has the suffix \"other\" for when none fits.",
    "If the text gives no reasonable basis for an industry, set both to null.",
    `Industry taxonomy (primary id: suffixes): ${businessCardIndustryTaxonomyBlock()}.`,
  ].join(" ");
}
