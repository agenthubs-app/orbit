/**
 * agent-design AG12: what code says about contact writes in the conversation (never a model's words): why nothing was
 * prepared, the duplicate question, "the existing one, nothing added", and the reply to an import row changed in words.
 * R03: no space between Chinese and a number.
 */
import type { ReplyLanguage } from "../../route/handoff-copy";
import type { ImportPreview } from "./import-preview";

type Lines = Record<ReplyLanguage, string>;

/** "新增2行、疑似重复1行、跳过1行" (R03: no space between Chinese and a number). */
function countWords(language: ReplyLanguage, counts: ImportPreview["counts"]): string {
  if (language === "en") return `${counts.create} new, ${counts.duplicate} possible duplicate${counts.duplicate === 1 ? "" : "s"}, ${counts.skip} skipped`;
  if (language === "ja") return `新規 ${counts.create} 行、重複の可能性 ${counts.duplicate} 行、スキップ ${counts.skip} 行`;
  return `新增${counts.create}行、疑似重复${counts.duplicate}行、跳过${counts.skip}行`;
}
const pick = (language: ReplyLanguage, lines: Lines) => lines[language];
const detailOf = (language: ReplyLanguage, organization: string | null, role: string | null) => [organization, role].filter(Boolean).join(" · ") || (language === "en" ? "no company" : language === "ja" ? "会社なし" : "没写公司");

export const CONTACT_WORDS = {
  noName: (language: ReplyLanguage, quote: string) => pick(language, { en: `I couldn't tell the new contact's name in "${quote}", so nothing was added.`, ja: `「${quote}」から新しい連絡先の名前が分からなかったため、追加していません。`, zh: `「${quote}」里没看出新联系人叫什么，所以没有新增。` }),
  noChange: (language: ReplyLanguage, name: string) => pick(language, { en: `"${name}" already has those values, so there is nothing to change.`, ja: `連絡先「${name}」はすでにその内容なので、変更はありません。`, zh: `联系人「${name}」已经是这样了，没有要改的。` }),
  noFields: (language: ReplyLanguage, quote: string) => pick(language, { en: `In "${quote}" I couldn't tell which field to change; here I can change the name, company, title, email and phone.`, ja: `「${quote}」はどの項目を変えるのか分かりませんでした。今は氏名・会社・役職・メール・電話を変更できます。`, zh: `「${quote}」没看出要改哪一项；现在能改的是姓名、公司、职位、邮箱和电话。` }),
  noDeleted: (language: ReplyLanguage, words: string) => pick(language, { en: `No contact called "${words}" was deleted in the last 30 days, so nothing was restored.`, ja: `この30日以内に削除した連絡先に「${words}」はいないため、元に戻していません。`, zh: `30天内删掉的联系人里没有「${words}」，所以没有恢复。` }),
  stillThere: (language: ReplyLanguage, name: string) => pick(language, { en: `"${name}" is still in your contacts, so there is nothing to restore.`, ja: `「${name}」は今も連絡先にあるため、元に戻す必要はありません。`, zh: `「${name}」现在还在联系人里，不用恢复。` }),
  // AG20b (R12): a list with no header row is read as name, company, title per line; anything else is refused with this.
  noTable: (language: ReplyLanguage) => pick(language, { en: "I couldn't read a list to import (one person per line, separated by commas: name, company, title — or with a header row such as Name, Company, Title), so nothing was imported.", ja: "取り込める一覧が読み取れませんでした（1行に1人、カンマ区切りで「氏名,会社,役職」の順。先頭行に「氏名,会社,役職」などの見出しがあっても構いません）。何も取り込んでいません。", zh: "没能读出要导入的名单（每行一位，按“姓名,公司,职位”的顺序用逗号分开；第一行也可以写“姓名,公司,职位”这样的表头），所以没有导入。" }),
  askDuplicate: (language: ReplyLanguage, name: string, shown: readonly string[]) => pick(language, {
    en: `You already have ${shown.length === 1 ? "a contact" : "contacts"} like "${name}": ${shown.join("; ")}. Is the new one one of them? If not, pick "None of these — add a new contact".`,
    ja: `「${name}」に似た連絡先がすでにあります：${shown.join("、")}。新しく追加する方はこの中の方ですか？違う場合は「どれでもない、新しく追加する」を選んでください。`,
    zh: `联系人里已经有和「${name}」相似的：${shown.join("；")}。要新增的是其中一位吗？都不是的话，选「都不是，另建一位」。`,
  }),
  createNew: (language: ReplyLanguage) => pick(language, { en: "None of these — add a new contact", ja: "どれでもない、新しく追加する", zh: "都不是，另建一位" }),
  candidateLabel: (language: ReplyLanguage, name: string, organization: string | null, role: string | null) => (language === "en" ? `${name} (${detailOf(language, organization, role)})` : `${name}（${detailOf(language, organization, role)}）`),
  sameAsExisting: (language: ReplyLanguage, name: string, organization: string | null, role: string | null, differs: string | null) => pick(language, {
    en: `OK — it's the ${name} already in your contacts (${detailOf(language, organization, role)}). No new contact was added.${differs ? ` If ${differs}, tell me and I'll prepare that change.` : ""}`,
    ja: `承知しました。すでに連絡先にある${name}さん（${detailOf(language, organization, role)}）ですね。新しい連絡先は追加していません。${differs ? `${differs}場合は、お知らせいただければ変更を用意します。` : ""}`,
    zh: `好的，就是联系人里已有的${name}（${detailOf(language, organization, role)}），没有新建联系人。${differs ? `如果${differs}，告诉我就帮你准备修改。` : ""}`,
  }),
  differs: (language: ReplyLanguage, fields: { label: string; value: string }[]) => (fields.length ? pick(language, { en: fields.map((field) => `the ${field.label} should be "${field.value}"`).join(" and "), ja: fields.map((field) => `${field.label}を「${field.value}」に変える`).join("、"), zh: fields.map((field) => `要把${field.label}改成「${field.value}」`).join("、") }) : null),
  importRevised: (language: ReplyLanguage, rows: readonly number[], before: ImportPreview["counts"], counts: ImportPreview["counts"]) => pick(language, {
    en: `OK — row ${rows.join(" and ")} is now a new contact. The card is updated from ${countWords("en", before)} to ${countWords("en", counts)}. Nothing is imported until you confirm.`,
    ja: `承知しました。${rows.join("・")}行目を新規にしました。カードを「${countWords("ja", before)}」から「${countWords("ja", counts)}」に更新しました。確定するまで取り込みません。`,
    zh: `好的，第${rows.join("、")}行改为新建。卡片已从「${countWords("zh", before)}」更新为「${countWords("zh", counts)}」，点确认之前不会导入。`,
  }),
  importRevisedSkip: (language: ReplyLanguage, rows: readonly number[], before: ImportPreview["counts"], counts: ImportPreview["counts"]) => pick(language, {
    en: `OK — row ${rows.join(" and ")} is left out. The card is updated from ${countWords("en", before)} to ${countWords("en", counts)}. Nothing is imported until you confirm.`,
    ja: `承知しました。${rows.join("・")}行目は取り込みません。カードを「${countWords("ja", before)}」から「${countWords("ja", counts)}」に更新しました。確定するまで取り込みません。`,
    zh: `好的，第${rows.join("、")}行不导入。卡片已从「${countWords("zh", before)}」更新为「${countWords("zh", counts)}」，点确认之前不会导入。`,
  }),
  /** AG20b (R12): rows the words named that the card could not change. */
  importRowsUnchanged: (language: ReplyLanguage, rows: readonly number[]) => pick(language, {
    en: `Row ${rows.join(" and ")} could not be changed (there is no such row, or it has no name), so it stays as the card shows. Nothing is imported until you confirm.`,
    ja: `${rows.join("・")}行目は変更できませんでした（その行がないか、名前がありません）。カードの表示のままです。確定するまで取り込みません。`,
    zh: `第${rows.join("、")}行没法改（没有这一行，或者这一行没有姓名），卡片上保持原样。点确认之前不会导入。`,
  }),
  /** AG21b (R27): rows the words named that already had the decision asked for: nothing changed. */
  importRowsAlready: (language: ReplyLanguage, rows: readonly number[], decision: "create" | "skip") => pick(language, decision === "create" ? {
    en: `Row ${rows.join(" and ")} is already a new contact on the card, so nothing changed.`,
    ja: `${rows.join("・")}行目はもともと新規です。カードは変わっていません。`,
    zh: `第${rows.join("、")}行本来就是新增，卡片没有变。`,
  } : {
    en: `Row ${rows.join(" and ")} is already left out on the card, so nothing changed.`,
    ja: `${rows.join("・")}行目はもともと取り込まない行です。カードは変わっていません。`,
    zh: `第${rows.join("、")}行本来就不导入，卡片没有变。`,
  }),
  label: (language: ReplyLanguage, field: "organization" | "role") => pick(language, field === "organization" ? { en: "company", ja: "会社", zh: "公司" } : { en: "title", ja: "役職", zh: "职位" }),
};
