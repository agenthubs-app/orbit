/**
 * W0045（W45-1）：职级的唯一存储是联系人 `publicProfile.seniorityLevel`（六档）。
 * 「决策层／管理层／执行层／其他」四档只是派生分组，由这里的纯函数计算、不落库；
 * 分布统计（W0049）与 App 端都从这里取映射（npm run sync:contract 逐字拷到 App）。
 *
 * 本文件受 tests/support/shared-compute-audit.ts 约束：不 import shared/domain，
 * 六档字面量在这里自带一份，与 shared/domain/source-types.ts 的 SENIORITY_LEVEL_VALUES
 * 由 tests/domain/contact-enrichment-domain.test.ts 断言一致。
 */
export const SENIORITY_LEVELS = [
  "individual_contributor",
  "manager",
  "director",
  "vp",
  "c_level",
  "founder",
] as const;

export type SeniorityLevelValue = (typeof SENIORITY_LEVELS)[number];

export type SeniorityGroup = "decision" | "manager" | "staff" | "other";

export const SENIORITY_GROUPS: readonly SeniorityGroup[] = ["decision", "manager", "staff", "other"];

export function isSeniorityLevelValue(value: unknown): value is SeniorityLevelValue {
  return typeof value === "string" && (SENIORITY_LEVELS as readonly string[]).includes(value);
}

/** 六档 → 四组：c_level／vp／founder／director 为决策层，manager 为管理层，individual_contributor 为执行层，其余（空、未知）为其他。 */
export function seniorityGroup(level?: string | null): SeniorityGroup {
  switch (level) {
    case "c_level":
    case "vp":
    case "founder":
    case "director":
      return "decision";
    case "manager":
      return "manager";
    case "individual_contributor":
      return "staff";
    default:
      return "other";
  }
}
