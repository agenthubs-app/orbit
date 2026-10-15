/**
 * R17（host/DESIGN.md §2.7「質問案を 3つ追加しますか？」、§3.3）：问题建议（规则，不调 AI）。Owner: 甲 (R17).
 * 从模板库里挑问题：同一主办方过去场次里回答最分散（最有区分度）的问题优先；没有过去数据时按模板顺序。
 */
import type { HostSetupQuestion } from "../contract/host-console";

export interface PastAnswerStats {
  /** 模板问题 id。 */
  questionId: string;
  /** 各选项的回答人数。 */
  counts: readonly number[];
}

/** 归一化熵（0–1）：越接近 1 回答越分散。 */
export function answerSpread(counts: readonly number[]): number {
  const total = counts.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || counts.length < 2) return 0;
  let entropy = 0;
  for (const value of counts) if (value > 0) { const p = value / total; entropy -= p * Math.log(p); }
  return entropy / Math.log(counts.length);
}

/** 从模板库挑 `limit` 个当前问题里没有的问题。 */
export function suggestQuestions(input: { library: readonly HostSetupQuestion[]; existing: readonly HostSetupQuestion[]; past: readonly PastAnswerStats[]; limit?: number }): HostSetupQuestion[] {
  const limit = input.limit ?? 3;
  const taken = new Set(input.existing.map((question) => question.prompt.trim()));
  const spread = new Map(input.past.map((stat) => [stat.questionId, answerSpread(stat.counts)]));
  return input.library
    .map((question, order) => ({ order, question, score: spread.get(question.id) ?? -1 }))
    .filter((item) => !taken.has(item.question.prompt.trim()))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map((item) => item.question);
}
