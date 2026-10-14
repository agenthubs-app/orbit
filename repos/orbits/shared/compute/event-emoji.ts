/**
 * R26 活动 emoji（events DESIGN §3.5）：主办方设了就用主办方的；否则按标题 / 类别里的关键词查表；兜底 🎟️。
 * 列表、参加予定、计划页的会える活動、評価結果都用这一个函数，同一场活动处处同一个 emoji。
 */
import { lowerText } from "./compute-text";

export const EVENT_EMOJI_FALLBACK = "🎟️";

/** 按顺序匹配，先命中先用（更具体的放前面）。 */
const EMOJI_RULES: readonly (readonly [string, readonly string[]])[] = [
  ["🏭", ["製造", "工場", "ものづくり", "manufactur", "factory", "制造"]],
  ["☕", ["朝会", "モーニング", "朝活", "breakfast", "morning", "早餐"]],
  ["🔧", ["ピッチ", "pitch", "デモデイ", "demo day", "路演"]],
  ["📚", ["勉強会", "読書会", "ハンズオン", "ワークショップ", "study", "workshop", "hands-on", "学习会"]],
  ["🥂", ["交流会", "ナイト", "懇親会", "パーティ", "night", "party", "mixer", "networking", "交流"]],
  ["🎤", ["登壇", "カンファレンス", "サミット", "フォーラム", "シンポジウム", "conference", "summit", "forum", "symposium", "峰会", "大会"]],
  ["🤝", ["ミートアップ", "meetup", "meet up", "聚会"]],
];

export function eventEmoji(input: { emoji?: string | null; title?: string | null; category?: string | null }): string {
  const own = input.emoji?.trim();
  if (own) return own;
  const text = lowerText(`${input.title ?? ""} ${input.category ?? ""}`);
  for (const [emoji, keywords] of EMOJI_RULES) {
    if (keywords.some((keyword) => text.includes(lowerText(keyword)))) return emoji;
  }
  return EVENT_EMOJI_FALLBACK;
}
