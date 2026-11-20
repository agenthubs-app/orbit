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

export function emptyKindsLine(language: ReplyLanguage, name: string, kinds: readonly EmptyKind[]): string {
  const words = kinds.map((kind) => KIND_WORDS[language][kind]);
  if (language === "en") return `There are no ${words.join(" or ")} about ${name || "this person"}; this is from their contact details.`;
  if (language === "ja") return `${name || "この方"}についての${words.join("や")}はありません。連絡先の情報からお答えしています。`;
  return `没有关于${name || "这位联系人"}的${words.join("或")}，以上按联系人资料回答。`;
}
