/**
 * R23 业界现状库（D-06，DESIGN §6）的条目形状。内容即代码：条目在 `entries.ts`，唯一读入口在 `store.ts`。
 */
import type { PlanTriText } from "../../../shared/compute/plan-template-copy";
import type { IndustryIdCode } from "../../../shared/contract/industries";
import type { PlanGoalKind } from "../../../shared/contract/plan-v2";

export type LandscapeStatus = "draft" | "published" | "retired";

export interface LandscapeEntry {
  /** `L-101` 形式；同一 id 的多个版本并存（已引用的计划显示当时那一版）。 */
  id: string;
  version: number;
  goalKinds: readonly PlanGoalKind[];
  /** 空 = 通用；有值时只在目标涉及这些行业时优先给出。 */
  industries: readonly IndustryIdCode[];
  title: PlanTriText;
  /** 两行以内。 */
  summary: PlanTriText;
  source: { label: string; url: string; publishedOn: string };
  /** 编辑部最后核对这条的日期（12 个月规则看它）。 */
  updatedOn: string;
  status: LandscapeStatus;
  /** 独立审核记录（`features/plans/landscape/REVIEW.md` 的条目号）；没审过为 null。 */
  reviewedBy: string | null;
  /** 内容哈希（`landscapeChecksum`），测试核对，防止改了内容却没升版本。 */
  checksum: string;
}
