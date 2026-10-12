/**
 * 「人脈から選ぶ」候补的本地规则（R23「空き」近似，计划页像素返工从 Web 界面 `orbit-2026/plan/plan-api.ts` 的
 * `rankCandidates` 搬到这里，服务端默认候补与两端界面共用一套）。纯函数，不调 AI、不读存储。
 *
 * - 「できること」近似：本目标类型的能力（`plan-templates` 该类 8 项）里，名称（三语任一）出现在这个人的职位 / 关系说明 / 标签 /
 *   面谈摘要里的那些（大小写不敏感的子串匹配）；
 * - `fills`：其中正好是团队「空き」（`planCapabilityGaps`）的；
 * - 共同創業者：职位或说明里写着共同創業者 / 联合创始人 / 共同创始人 / co-founder（三语任一）；
 * - 顺序：共同創業者在前，其次补得上空き的，其余保持原顺序。
 */
import type { PlanGoalKind } from "../contract/plan-v2";
import { PLAN_CAPABILITY_COPY } from "./plan-template-copy";
import { PLAN_GOAL_TEMPLATES } from "./plan-templates";

const COFOUNDER_PATTERN = /共同創業者|共同创始人|联合创始人|co-?founder/iu;

export interface PlanMemberCandidateText {
  /** 职位。 */
  role: string | null;
  /** 其余可匹配的文字（关系说明、标签、面谈摘要等），没有为空串。 */
  context: string;
}

export function looksLikeCofounder(candidate: PlanMemberCandidateText): boolean {
  return COFOUNDER_PATTERN.test(`${candidate.role ?? ""} ${candidate.context}`);
}

/** 这段文字里出现了哪些能力（按给定 id 的顺序；名称三语任一，大小写不敏感）。 */
export function planCapabilitiesInText(text: string, capabilityIds: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  if (!haystack.trim()) return [];
  return capabilityIds.filter((id) => {
    const copy = PLAN_CAPABILITY_COPY[id];
    const labels = copy ? [copy.ja, copy.zh, copy.en] : [id];
    return labels.some((label) => label.trim() !== "" && haystack.includes(label.toLowerCase()));
  });
}

export type RankedPlanMemberCandidate<T> = T & { cofounder: boolean; capabilities: string[]; fills: string[] };

/** 给候补打上 共同創業者 / できること / 空きを埋める 并排序（见文件头）。`gaps` = 当前团队的空き（能力 id）。 */
export function rankPlanMemberCandidates<T extends PlanMemberCandidateText>(candidates: readonly T[], goalKind: PlanGoalKind, gaps: readonly string[]): RankedPlanMemberCandidate<T>[] {
  const capabilityIds = PLAN_GOAL_TEMPLATES[goalKind].capabilities;
  const gapSet = new Set(gaps);
  return candidates
    .map((candidate, index) => {
      const capabilities = planCapabilitiesInText(`${candidate.role ?? ""} ${candidate.context}`, capabilityIds);
      return { ...candidate, capabilities, cofounder: looksLikeCofounder(candidate), fills: capabilities.filter((id) => gapSet.has(id)), index };
    })
    .sort((left, right) => Number(right.cofounder) - Number(left.cofounder) || Number(right.fills.length > 0) - Number(left.fills.length > 0) || left.index - right.index)
    .map(({ index: _index, ...candidate }) => candidate as unknown as RankedPlanMemberCandidate<T>);
}
