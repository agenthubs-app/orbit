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
