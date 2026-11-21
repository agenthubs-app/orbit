/**
 * The sentences code writes for write parts (agent-design AG06): what was not found, what cannot be
 * done in the conversation yet, the questions before a card, and the card line itself (from the frozen
 * payload). No model writes any of them; they never mention a card unless the turn shows one.
 */
import { confirmButtonLabel } from "../../../shared/compute/agent-card-view";
import type { AgentActionPreviewContract } from "../../../shared/contract/agent-v1";
import { en } from "../../../shared/copy/en";
import { ja } from "../../../shared/copy/ja";
import { zh } from "../../../shared/copy/zh";
import type { ReplyLanguage } from "../route/handoff-copy";

const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

const or = (language: ReplyLanguage, labels: readonly string[]) => (language === "zh" ? labels.join("，还是") : language === "ja" ? labels.join("、それとも") : labels.join(", or "));

export const WRITE_WORDS = {
  /** words: what the user called it (without "那条待办"); null when they only said "the to-do" — then the person names it. */
  notFoundTodo(language: ReplyLanguage, quote: string, words: string | null, person: string | null): string {
    if (language === "zh") return `「${quote}」：没有找到${person && !words ? `${person}的` : ""}${words ? `「${words}」这样的` : ""}待办，所以这次没有改，也没有新建。`;
    if (language === "ja") return `「${quote}」：${words ? `「${words}」に当たる` : person ? `${person}さんの` : ""}ToDoが見つからなかったため、今回は変更も追加もしていません。`;
    return `"${quote}": I found no ${words ? `to-do like "${words}"` : person ? `to-do of ${person}` : "such to-do"}, so nothing was changed or added.`;
  },
  notFoundPerson(language: ReplyLanguage, quote: string): string {
    if (language === "zh") return `「${quote}」：我不确定你说的是哪一位联系人，所以这次没有改。可以告诉我全名，或者用 @ 选一下。`;
    if (language === "ja") return `「${quote}」：どの連絡先の方のことか分からなかったため、今回は何も変更していません。フルネームか、@で連絡先を添えてください。`;
    return `"${quote}": I couldn't tell which of your contacts you mean, so nothing was changed. Give the full name, or attach the contact with @.`;
  },
  notWho(language: ReplyLanguage, quote: string): string {
    if (language === "zh") return `「${quote}」我不确定说的是哪一位，所以这次没有改。`;
    if (language === "ja") return `「${quote}」がどなたのことか分からなかったため、今回は何も変更していません。`;
    return `I'm not sure who "${quote}" is about, so nothing was changed.`;
  },
  dateUnclear(language: ReplyLanguage, quote: string): string {
    if (language === "zh") return `「${quote}」我没看出是哪一天，所以这次没有改。`;
    if (language === "ja") return `「${quote}」の日付が分からなかったため、今回は何も変更していません。`;
    return `I couldn't tell which day "${quote}" means, so nothing was changed.`;
  },
  noTitle(language: ReplyLanguage, quote: string): string {
    if (language === "zh") return `「${quote}」我没看出这条待办叫什么，所以这次没有建。`;
    if (language === "ja") return `「${quote}」のToDoの名前が分からなかったため、今回は追加していません。`;
    return `I couldn't tell what to call the to-do in "${quote}", so nothing was added.`;
  },
  /** AG20a R23: the change could not be prepared (no operation came back, also after the repair); how to ask again. */
  notPrepared(language: ReplyLanguage, quote: string): string {
    if (language === "zh") return `「${quote}」这次没能准备好要改的内容，所以什么都没有改。可以再发一次，说清是哪一条、改成什么，比如「把这条待办改到周五」。`;
    if (language === "ja") return `「${quote}」は今回、変更内容を用意できなかったため、何も変更していません。どの記録を何に変えるかを添えて、もう一度送ってください（例：「このToDoを金曜日に変更して」）。`;
    return `"${quote}": the change could not be prepared this time, so nothing was changed. Please send it again, saying which record and what to change it to (for example, "move this to-do to Friday").`;
  },
  gone(language: ReplyLanguage, quote: string): string {
    if (language === "zh") return `「${quote}」：要改的那条记录现在找不到了，所以这次没有改。`;
    if (language === "ja") return `「${quote}」：変更するはずの記録が見つからなくなったため、今回は何も変更していません。`;
    return `"${quote}": the record to change can no longer be found, so nothing was changed.`;
  },
  /** A write this version does not do in the conversation (contacts, events, schedule, rules, memories …). */
  unsupported(language: ReplyLanguage, quote: string, names: string): string {
    if (language === "zh") return `「${quote}」${names}：现在还不能在对话里改这类记录，所以这次什么都没有改。`;
    if (language === "ja") return `「${quote}」${names}：この種類の記録は、今はまだ会話から変更できないため、今回は何も変更していません。`;
    return `"${quote}"${names}: this kind of record can't be changed from the conversation yet, so nothing was changed.`;
  },
  askPerson(language: ReplyLanguage, quote: string, clue: string, labels: readonly string[]): string {
    if (language === "zh") return `「${quote}」里的「${clue}」有几位同名的联系人，是${or(language, labels)}？`;
    if (language === "ja") return `「${quote}」の「${clue}」に当たる連絡先が複数あります。${or(language, labels)}ですか？`;
    return `More than one contact matches "${clue}" in "${quote}": ${or(language, labels)}?`;
  },
  askTodo(language: ReplyLanguage, quote: string, labels: readonly string[]): string {
    if (language === "zh") return `「${quote}」对得上的待办不止一条，要改哪一条：${or(language, labels)}？`;
    if (language === "ja") return `「${quote}」に当たるToDoが複数あります。どれを変更しますか：${or(language, labels)}？`;
    return `More than one to-do fits "${quote}". Which one should I change: ${or(language, labels)}?`;
  },
  /** AG06 repair 1: the words matched no to-do; the person's to-dos are offered ("可以问是不是指这一条"). */
  askTodoNotFound(language: ReplyLanguage, quote: string, words: string, labels: readonly string[]): string {
    if (language === "zh") return `「${quote}」：没有找到${words ? `「${words}」这样的` : "对得上的"}待办，所以还没有改。是指${or(language, labels)}吗？`;
    if (language === "ja") return `「${quote}」：${words ? `「${words}」に当たる` : "当てはまる"}ToDoが見つからなかったため、まだ変更していません。${or(language, labels)}のことですか？`;
    return `"${quote}": I found no to-do${words ? ` like "${words}"` : ""}, so nothing is changed yet. Did you mean ${or(language, labels)}?`;
  },
  askField(language: ReplyLanguage, quote: string, labels: readonly string[]): string {
    if (language === "zh") return `「${quote}」：这条待办既有计划日期也有截止时间，要改哪一个：${or(language, labels)}？`;
    if (language === "ja") return `「${quote}」：このToDoには予定日と期限の両方があります。どちらを変更しますか：${or(language, labels)}？`;
    return `"${quote}": this to-do has both a planned date and a due time. Which one should change: ${or(language, labels)}?`;
  },
  fieldLabel(language: ReplyLanguage, field: "plannedDate" | "dueAt", current: string): string {
    if (field === "plannedDate") return language === "zh" ? `改计划日期（现在是${current}）` : language === "ja" ? `予定日を変更（現在は ${current}）` : `Change the planned date (now ${current})`;
    return language === "zh" ? `改截止时间（现在是${current}）` : language === "ja" ? `期限を変更（現在は ${current}）` : `Change the due time (now ${current})`;
  },
  todoLabel(language: ReplyLanguage, title: string, when: string | null): string {
    if (language === "en") return `"${title}"${when ? ` (${when})` : ""}`;
    return `「${title}」${when ? `（${when}）` : ""}`;
  },
};

/** The card line of a turn, from the frozen preview only: the count sentence, each item, how it runs. */
export function cardLineOf(preview: AgentActionPreviewContract, language: ReplyLanguage): string {
  const items = preview.operations.map((op, index) => `${CIRCLED[index] ?? `${index + 1}.`} ${op.text}`);
  const label = cardConfirmLabelFor(language, preview.operations);
  // AG15 (approved draft 15-1): a card that makes scheduled tasks says nothing *runs* before the click.
  const runs = makesTasksOnly(preview.operations);
  if (language === "en") return `Confirmation card — ${preview.title}:\n${items.join("\n")}\n${runs ? "Nothing runs" : "Nothing is changed"} until you press "${label}" on the card.`;
  if (language === "ja") return `確認カード（${preview.title}）：\n${items.join("\n")}\nカードの「${label}」を押すまで何も${runs ? "実行されません" : "変更しません"}。`;
  return `确认卡（${preview.title}）：\n${items.join("\n")}\n点卡上的「${label}」之前，什么都不会${runs ? "运行" : "改"}。`;
}

/** AG15: a card whose every item makes a scheduled task (its buttons are 「确认，开始运行」「不建了」, D15-2). */
export function makesTasksOnly(operations: readonly { capability: string }[]): boolean {
  return operations.length > 0 && operations.every((op) => op.capability === "rule.create");
}

/** The confirm button's label as both clients show it for these items (the new-task card has its own, D15-2). */
export function cardConfirmLabelFor(language: ReplyLanguage, operations: readonly { capability: string }[]): string {
  return makesTasksOnly(operations) ? (language === "en" ? en : language === "ja" ? ja : zh).aiCard.confirmRule : cardConfirmLabel(language, operations.length);
}

/** The confirm button's label exactly as both clients show it (shared copy `aiCard`), for any code text that names the button. */
export function cardConfirmLabel(language: ReplyLanguage, count: number): string {
  return confirmButtonLabel((language === "en" ? en : language === "ja" ? ja : zh).aiCard, Math.max(1, count));
}
