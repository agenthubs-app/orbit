/**
 * agent-design AG19 repair round 1 (coordinator's decision 1; the user's D1 "每一项就是一张卡片，不再另写一遍文字"):
 * a list-type read — "我有哪些还没完成的待办", "下周我有哪些日程" — is written by code from the records the answer step
 * picked. The lead says what code knows: how many, of what kind, for which time window, and for to-dos how many are
 * past their deadline or planned day. It never names a listed record: each one is its card. `answer.text` stays complete
 * for older clients — the lead, then one line per record with the same facts as its card.
 *
 * The model still decides which of the records read answer the question (its citations) and in what order it would say
 * them; no sentence of it is delivered for such a part.
 */
import type { AgentAnswerRecordContract, AgentAnswerRecordKind } from "../../../shared/contract/agent-v1";
import type { Language } from "../functions/copy";
import { PLANNED_PASSED, recordsBlock, type AnswerBlock } from "./blocks";

export interface ListAnswerInput {
  language: Language;
  /** The records the answer lists, in the order to show them. */
  cards: readonly AgentAnswerRecordContract[];
  /** The user's words of this part (for the time word they used: 下周, this week …). */
  quote: string;
  /** The dates the read was narrowed to (YYYY-MM-DD, inclusive), when it was. */
  from?: string | undefined;
  to?: string | undefined;
  /** To-dos: the status the read was narrowed to. */
  status?: "open" | "completed" | undefined;
  /**
   * Hotfix 2026-11-20 (AE-SCL-008: 「未完了のタスクは3件」 beside a total of 64 — it counted the overdue ones without saying so):
   * the user asked for the overdue ones; and how many match in all when the cards are only some of them.
   */
  overdue?: boolean;
  total?: number | null;
}

const TIME_WORD = /(今天|明天|后天|昨天|前天|这周|本周|这星期|这个星期|下周|下星期|下个星期|上周|上星期|上个星期|这个月|本月|下个月|下月|上个月|上月|今年|明年|去年|周末|today|tomorrow|yesterday|this week|next week|last week|this month|next month|last month|this weekend|今日|明日|昨日|今週|来週|先週|今月|来月|先月|週末)/iu;
/** Hotfix 2026-11-20: the words asking for the overdue ones (as resolve.ts reads them). */
const OVERDUE_ASKED = /(期限を過ぎ|期限切れ|期限超過|过期|逾期|超期|过了计划日|\boverdue\b|\bpast due\b)/iu;
const EN_MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const short = (day: string, language: Language, withMonth = true) => {
  const [, month, date] = day.split("-").map(Number);
  if (language === "en") return withMonth ? `${EN_MONTH[month - 1]} ${date}` : `${date}`;
  return withMonth ? `${month}月${date}日` : `${date}日`;
};

/** "下周（11月16日至22日）", "11月16日至22日", "下周" or "" — the time window in the user's word and code's dates. */
export function windowWords(language: Language, quote: string, from?: string, to?: string): string {
  const word = quote.match(TIME_WORD)?.[0] ?? "";
  const sameMonth = Boolean(from && to && from.slice(0, 7) === to.slice(0, 7));
  const dates = from && to
    ? (from === to ? short(from, language) : language === "en" ? `${short(from, language)}–${short(to, language, !sameMonth)}` : language === "ja" ? `${short(from, language)}〜${short(to, language, !sameMonth)}` : `${short(from, language)}至${short(to, language, !sameMonth)}`)
    : "";
  if (word && dates) return language === "en" ? `${word} (${dates})` : `${word}（${dates}）`;
  return word || dates;
}

const NOUN: Record<Language, Record<AgentAnswerRecordKind | "mixed", { unit: string; noun: string }>> = {
  en: { attendance: { noun: "events you went to", unit: "" }, contact: { noun: "contacts", unit: "" }, event: { noun: "events", unit: "" }, memo: { noun: "notes", unit: "" }, mixed: { noun: "records", unit: "" }, schedule: { noun: "schedule items", unit: "" }, todo: { noun: "to-dos", unit: "" } },
  ja: { attendance: { noun: "「行った」記録", unit: "件" }, contact: { noun: "連絡先", unit: "人" }, event: { noun: "イベント", unit: "件" }, memo: { noun: "メモ", unit: "件" }, mixed: { noun: "記録", unit: "件" }, schedule: { noun: "予定", unit: "件" }, todo: { noun: "タスク", unit: "件" } },
  zh: { attendance: { noun: "「我去过」的记录", unit: "条" }, contact: { noun: "联系人", unit: "位" }, event: { noun: "活动", unit: "场" }, memo: { noun: "笔记", unit: "篇" }, mixed: { noun: "相关记录", unit: "条" }, schedule: { noun: "日程", unit: "个" }, todo: { noun: "待办", unit: "项" } },
};

/** How many of these to-do cards are past their deadline or their planned day. */
export function lateCount(cards: readonly AgentAnswerRecordContract[], language: Language): number {
  return cards.filter((card) => card.kind === "todo" && (card.subTone === "late" || card.sub === PLANNED_PASSED[language])).length;
}

/** The lead above the cards: how many, of what kind, for which window; never a listed record's name. */
export function listLead(input: ListAnswerInput): string {
  const { cards, language } = input;
  const n = cards.length;
  const kinds = new Set(cards.map((card) => card.kind));
  const kind: AgentAnswerRecordKind | "mixed" = kinds.size === 1 ? [...kinds][0] : "mixed";
  const { noun, unit } = NOUN[language][kind];
  const window = windowWords(language, input.quote, input.from, input.to);
  if (kind === "todo") {
    const late = lateCount(cards, language);
    const status = input.status === "open" ? { en: "open ", ja: "未完了の", zh: "还没完成的" }[language] : input.status === "completed" ? { en: "completed ", ja: "完了した", zh: "已完成的" }[language] : "";
    // Hotfix 2026-11-20: a lead always says what it counts — the overdue ones, or some of a larger total.
    if ((input.overdue ?? OVERDUE_ASKED.test(input.quote)) && late === n) {
      if (language === "en") return `${window ? `${window[0].toUpperCase()}${window.slice(1)}: ` : ""}${n} ${status}${n === 1 ? "to-do is" : "to-dos are"} past ${n === 1 ? "its" : "their"} deadline or planned day:`;
      if (language === "ja") return `${window ? `${window}の` : ""}期限または予定日を過ぎた${status}タスクは${n}件です：`;
      return `${window}已过期或过了计划日的${status}待办有 ${n} 项：`;
    }
    const total = input.total ?? null;
    if (total !== null && total > n) {
      if (language === "en") return `You have ${total} ${status}to-dos${window ? ` for ${window}` : ""}; here are ${n}${late ? `, ${late} of them past ${late === 1 ? "its" : "their"} deadline or planned day` : ""}:`;
      if (language === "ja") return `${window ? `${window}の` : ""}${status}タスクは全部で${total}件、ここでは${n}件${late ? `（うち${late}件は期限または予定日を過ぎています）` : ""}：`;
      return `${window}你有 ${total} 项${status}待办，这里列出 ${n} 项${late ? `，其中 ${late} 项已过期或过了计划日` : ""}：`;
    }
    if (language === "en") return `You have ${n} ${status}${n === 1 ? "to-do" : "to-dos"}${window ? ` for ${window}` : ""}${late ? `, ${late} of them past ${late === 1 ? "its" : "their"} deadline or planned day` : ""}:`;
    if (language === "ja") return `${window ? `${window}の` : ""}${status}タスクは${n}件${late ? `、うち${late}件は期限または予定日を過ぎています` : "です"}：`;
    return `${window ? `${window}` : ""}你有 ${n} 项${status}待办${late ? `，其中 ${late} 项已过期或过了计划日` : ""}：`;
  }
  if (language === "en") {
    const one = n === 1 ? noun.replace(/s$/u, "").replace(/s you went to$/u, " you went to") : noun;
    return `${window ? `${window[0].toUpperCase()}${window.slice(1)}: ` : ""}${n} ${one}:`;
  }
  if (language === "ja") return `${window ? `${window}の` : ""}${noun}は${n}${unit}です：`;
  return window ? `${window}有 ${n} ${unit}${noun}：` : kind === "contact" || kind === "memo" || kind === "mixed" ? `找到 ${n} ${unit}${noun}：` : `有 ${n} ${unit}${noun}：`;
}

/** One record as a line of the text version: the same facts as its card (name, upper line, lower line, the reason). */
export function recordLine(card: AgentAnswerRecordContract, language: Language): string {
  const facts = [card.top, card.sub, card.why].filter((item): item is string => Boolean(item?.trim()));
  if (!facts.length) return card.title;
  return language === "en" ? `${card.title} (${facts.join(", ")})` : `${card.title}（${facts.join("，")}）`;
}

/** The whole list answer: the text version and its blocks (the lead, then the cards — five shown first). */
export function listAnswer(input: ListAnswerInput): { text: string; blocks: AnswerBlock[] } {
  return cardsAnswer(listLead(input), input.cards, input.language);
}

/** A lead written by code, then the records as cards; the text version has one line per card (hotfix 2026-11-20 too). */
export function cardsAnswer(lead: string, records: readonly AgentAnswerRecordContract[], language: Language): { text: string; blocks: AnswerBlock[] } {
  const cards = recordsBlock(records, language);
  const shown = cards && cards.type === "records" ? cards.items : records;
  return {
    blocks: [{ text: lead, type: "paragraph" }, ...(cards ? [cards] : [])],
    text: [lead, ...shown.map((card, index) => `${index + 1}. ${recordLine(card, language)}`)].join("\n"),
  };
}
