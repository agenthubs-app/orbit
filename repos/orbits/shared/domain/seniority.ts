/**
 * W0045：职级展示标签。映射本体在 shared/compute/seniority-group.ts（唯一来源），这里只再导出并附中英标签。
 */
import type { OrbitLanguage } from "../contract/language";
import {
  SENIORITY_GROUPS,
  SENIORITY_LEVELS,
  SENIORITY_LEVEL_LABELS,
  isSeniorityLevelValue,
  seniorityGroup,
  type SeniorityGroup,
  type SeniorityLevelValue,
} from "../compute/seniority-group";

export { SENIORITY_GROUPS, SENIORITY_LEVELS, SENIORITY_LEVEL_LABELS, isSeniorityLevelValue, seniorityGroup };
export type { SeniorityGroup, SeniorityLevelValue };

/** 顧問・顾问・advisor：职称看不出层级（可能是高管，也可能是外聘）。 */
const ADVISOR_TITLE = /顧問|顾问|相談役|\badvis[eo]r\b/iu;

/** 推断出的职级与名片职称核对：只凭「顾问」类职称落到「一般职员」没有依据 → 留空让本人选。 */
export function seniorityFromTitle(level: SeniorityLevelValue | null, title: unknown): SeniorityLevelValue | null {
  return level === "individual_contributor" && typeof title === "string" && ADVISOR_TITLE.test(title) ? null : level;
}

export const SENIORITY_GROUP_LABELS: Readonly<Record<SeniorityGroup, Record<OrbitLanguage, string>>> = {
  decision: { zh: "决策层", en: "Decision maker", ja: "意思決定層" },
  manager: { zh: "管理层", en: "Management", ja: "管理職" },
  staff: { zh: "执行层", en: "Individual contributor", ja: "実務担当" },
  other: { zh: "其他", en: "Other", ja: "その他" },
};

export function seniorityLevelLabel(level: SeniorityLevelValue, language: OrbitLanguage): string {
  return SENIORITY_LEVEL_LABELS[level][language] ?? SENIORITY_LEVEL_LABELS[level].zh;
}

export function seniorityGroupLabel(group: SeniorityGroup, language: OrbitLanguage): string {
  return SENIORITY_GROUP_LABELS[group][language] ?? SENIORITY_GROUP_LABELS[group].zh;
}
