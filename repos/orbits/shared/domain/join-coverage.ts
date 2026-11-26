/**
 * 参加登録の「完整度」：参加者の確認画面と主催者の参加者一覧で同じ計算（2026-11-26 統一）。
 * 会社・役職 44 + 参加目的 / 話題 / 会いたい人 / 提供できること 各 14。各項目は「訪談の回答」か「その項目を埋める主催者の質問への回答」
 * （HOST_QUESTION_PROFILE_ITEM、質問集の id で決める）のどちらかがあれば埋まっている。主催者側の SQL は `joinCoverageSqlParams` を使う。
 */
import { HOST_QUESTION_PROFILE_ITEM } from "./host-question-library";

export type JoinCoverageItem = "company" | "purpose" | "topics" | "target" | "offer";
export const JOIN_COVERAGE_ITEMS: readonly JoinCoverageItem[] = ["company", "purpose", "topics", "target", "offer"];
export const JOIN_COVERAGE_WEIGHT: Readonly<Record<JoinCoverageItem, number>> = { company: 44, offer: 14, purpose: 14, target: 14, topics: 14 };
/** 訪談の字段 → 項目。 */
export const JOIN_ITEM_OF_FIELD: Readonly<Record<string, Exclude<JoinCoverageItem, "company">>> = { desiredOutcome: "purpose", experienceHighlight: "topics", targetAttendees: "target", valueOffered: "offer" };

/** 回答のあった訪談字段と主催者質問 id → 埋まった項目（会社・役職は常に埋まっている：資料から入る）。 */
export function joinFilledItems(input: { fields: Iterable<string>; hostQuestionIds?: Iterable<string> }): Set<JoinCoverageItem> {
  const filled = new Set<JoinCoverageItem>(["company"]);
  for (const field of input.fields) { const item = JOIN_ITEM_OF_FIELD[field]; if (item) filled.add(item); }
  for (const id of input.hostQuestionIds ?? []) { const item = HOST_QUESTION_PROFILE_ITEM[id]; if (item) filled.add(item); }
  return filled;
}

export function joinCoverage(filled: ReadonlySet<JoinCoverageItem>): number {
  return JOIN_COVERAGE_ITEMS.reduce((sum, item) => sum + (filled.has(item) ? JOIN_COVERAGE_WEIGHT[item] : 0), 0);
}

/** 主催者側 SQL 用：字段 → 重み・質問 id → 項目・項目 → 重み（同じ表から作る）。 */
export function joinCoverageSqlParams(): { fieldItems: Record<string, string>; hostItems: Record<string, string>; weights: Record<string, number> } {
  return { fieldItems: { ...JOIN_ITEM_OF_FIELD }, hostItems: { ...HOST_QUESTION_PROFILE_ITEM }, weights: { ...JOIN_COVERAGE_WEIGHT } };
}
