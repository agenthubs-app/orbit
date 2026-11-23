/**
 * agent-design AG20b (R25, AE-REF-004 turn 2): a part that resolved its person and read their contact profile, while the
 * related kinds it also asked for (notes, to-dos, schedule items) came back empty. Code says what was empty — the kinds and
 * the person — never "nothing found" for the whole part; the profile is answered from.
 */
import type { ReplyLanguage } from "../route/handoff-copy";

type EmptyKind = "memo" | "todo" | "schedule";

const KIND_WORDS: Record<ReplyLanguage, Record<EmptyKind, string>> = {
  en: { memo: "notes", schedule: "schedule items", todo: "to-dos" },
  ja: { memo: "メモ", schedule: "予定", todo: "ToDo" },
  zh: { memo: "笔记", schedule: "日程", todo: "待办" },
};

/**
 * AG21c (R53): a day asked about with nothing in it says what kind of record is empty and for which day ("今天没有待办或日程"),
 * never the generic "nothing related found".
 */
export function emptyDayLine(language: ReplyLanguage, day: string, today: string, kinds: readonly EmptyKind[]): string {
  const words = kinds.map((kind) => KIND_WORDS[language][kind]);
  const [, month, date] = day.split("-").map(Number);
  const isToday = day === today;
  if (language === "en") return `${isToday ? "Today" : `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${date}`} has no ${words.join(" or ")} in your Orbit records.`;
  if (language === "ja") return `${isToday ? "今日" : `${month}月${date}日`}の${words.join("や")}はありません。`;
  return `${isToday ? "今天" : `${month}月${date}日`}没有${words.join("或")}。`;
}

export function emptyKindsLine(language: ReplyLanguage, name: string, kinds: readonly EmptyKind[]): string {
  const words = kinds.map((kind) => KIND_WORDS[language][kind]);
  if (language === "en") return `There are no ${words.join(" or ")} about ${name || "this person"}; this is from their contact details.`;
  if (language === "ja") return `${name || "この方"}についての${words.join("や")}はありません。連絡先の情報からお答えしています。`;
  return `没有关于${name || "这位联系人"}的${words.join("或")}，以上按联系人资料回答。`;
}
