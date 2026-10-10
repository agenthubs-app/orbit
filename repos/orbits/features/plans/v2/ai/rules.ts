/**
 * R23 规则（不调 AI）：各 AI 步骤的失败降级（DESIGN §5.2「失败降级」列），mock 也复用其中的选题规则。
 */
import { createHash } from "node:crypto";

import { PLAN_GOAL_TEMPLATES, PLAN_QUESTION_LIMIT } from "../../../../shared/compute/plan-templates";
import type { PlanGoalKind } from "../../../../shared/contract/plan-v2";
import type { LadderOutput, QuestionsInput, QuestionsOutput } from "./types";

/** 和能力空白相关的题（有空き时前移）：足りない力・使える時間・体制・出せるもの・強み。 */
const GAP_QUESTIONS = new Set(["R7", "R6", "F7", "S6", "H6", "P3", "K4"]);

/** 规则选题：模板默认顺序，空白相关题前移，取前 5（DESIGN §5.2 C5 的降级）。 */
export function ruleQuestions(input: Pick<QuestionsInput, "goalKind" | "gaps">, why: (id: string) => string): QuestionsOutput {
  const bank = PLAN_GOAL_TEMPLATES[input.goalKind].questions.map((question) => question.id);
  const ordered = input.gaps.length > 0 ? [...bank.filter((id) => GAP_QUESTIONS.has(id)), ...bank.filter((id) => !GAP_QUESTIONS.has(id))] : bank;
  const chosen = ordered.slice(0, PLAN_QUESTION_LIMIT);
  return {
    questions: chosen.map((id) => ({ guess: null, id, why: why(id) })),
    skipped: bank.filter((id) => !chosen.includes(id)).map((id) => ({ id, reason: "" })),
  };
}

/** 背景下书失败时的阶梯：只放原文在第 2 级，不给建议。 */
export function ruleLadder(goalText: string): LadderOutput {
  return { reason: null, rungs: [{ level: 2, text: goalText }], suggestedLevel: null };
}

/** 选题缓存键里的「背景规范化摘要」：去空白、统一大小写后取哈希（同类同背景 → 同题同序）。 */
export function backgroundCacheKey(goalKind: PlanGoalKind, background: string): string {
  const normalized = background.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
  return `questions:${goalKind}:${createHash("sha256").update(normalized).digest("hex").slice(0, 32)}`;
}

/** 确定性的小哈希（mock 用）。 */
export function stableNumber(seed: string): number {
  return createHash("sha256").update(seed).digest().readUInt32BE(0);
}
