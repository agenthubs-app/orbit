/**
 * Hotfix 2026-11-20 (live site: 「…：在你的 Orbit 记录里没有找到相关的内容。」 while 20 open to-dos existed): a read narrowed
 * by a day, a status or words that finds nothing says what was looked for, and — when records of the same kind exist
 * outside that narrowing — says how many in one plain sentence and shows them as cards:
 * 「今天到期或计划在今天的待办：没有。另有 20 项还没完成的待办，其中 16 项已过期。」
 *
 * Code writes the whole answer (no model call): the lead, then the cards (answer/list-answer.ts cardsAnswer). To-dos and
 * schedule items only; a person's records have their own wider read in resolve.ts, notes are not widened.
 */
import type { AgentAnswerRecordContract } from "../../../../shared/contract/agent-v1";
import type { AnswerBlock } from "../../answer/blocks";
import { cardsAnswer, lateCount, windowWords } from "../../answer/list-answer";
import { readPages } from "../../domains/registry";
import type { DomainQuery, DomainReader, DomainScope, RecordView } from "../../domains/types";
import type { Language } from "../../functions/copy";

export interface AskedRead {
  kind: "todo" | "schedule";
  /** The query's instants (from inclusive, to exclusive), as the read used them. */
  from?: string;
  to?: string;
  /** The days the user's window covers (YYYY-MM-DD, inclusive), for the words. */
  fromDay?: string;
  toDay?: string;
  text?: string;
  status?: "open" | "completed";
  /** The status came from the user's words or the first layer (not code's default "open"). */
  statusSaid: boolean;
  /** The schedule read started "now" only because nothing else narrowed it (code's default). */
  defaultFrom: boolean;
}

export interface WiderInput {
  asked: readonly AskedRead[];
  language: Language;
  now: string;
  quote: string;
  reader: DomainReader;
  scope: DomainScope;
  maxPages: number;
  cardOf: (view: RecordView) => AgentAnswerRecordContract;
}

export interface Widened {
  text: string;
  blocks: AnswerBlock[];
  views: RecordView[];
  cards: AgentAnswerRecordContract[];
}

const STATUS_WORDS: Record<Language, Record<"open" | "completed", string>> = {
  en: { completed: "completed", open: "open" },
  ja: { completed: "完了した", open: "未完了の" },
  zh: { completed: "已完成的", open: "还没完成的" },
};

/** A word that names exactly one day: said alone, without code's date. */
const ONE_DAY_WORD = /^(今天|明天|昨天|后天|前天|今日|明日|昨日|today|tomorrow|yesterday)$/iu;

/**
 * The window in words: "今天" for a one-day word that says it all; otherwise the user's word with code's dates as the list
 * lead writes it ("下周（11月25日）", "11月16日至22日"); "" without a window.
 */
function periodWords(language: Language, quote: string, fromDay?: string, toDay?: string): string {
  if (!fromDay && !toDay) return "";
  const word = windowWords(language, quote);
  const single = (fromDay ?? toDay) === (toDay ?? fromDay);
  if (word && single && ONE_DAY_WORD.test(word)) return word;
  return windowWords(language, quote, fromDay ?? toDay, toDay ?? fromDay);
}

/** What a to-do read looked for, ending in "：没有。" / ": none." */
export function todoNothingLine(language: Language, quote: string, asked: Pick<AskedRead, "fromDay" | "toDay" | "text" | "status" | "statusSaid">): string {
  const when = periodWords(language, quote, asked.fromDay, asked.toDay);
  const both = Boolean(asked.fromDay && asked.toDay);
  const single = both && asked.fromDay === asked.toDay;
  const plain = ONE_DAY_WORD.test(when);
  const status = asked.statusSaid && asked.status ? STATUS_WORDS[language][asked.status] : "";
  if (language === "en") {
    const period = !when ? "" : both ? ` due or planned ${plain ? when : single ? `on ${when}` : `for ${when}`}` : asked.toDay ? ` due or planned by ${when}` : ` due or planned from ${when}`;
    const head = `${status ? `${status} ` : ""}to-dos${asked.text ? ` containing "${asked.text}"` : ""}${period}`;
    return `${head[0].toUpperCase()}${head.slice(1)}: none.`;
  }
  if (language === "ja") {
    const period = !when ? "" : both ? `${when}が期限または予定日の` : asked.toDay ? `${when}までが期限または予定日の` : `${when}以降が期限または予定日の`;
    return `${period}${asked.text ? `「${asked.text}」を含む` : ""}${status}タスク：ありません。`;
  }
  const period = !when ? "" : both ? (plain ? `${when}到期或计划在${when}的` : `${when}到期或计划在这${single ? "天" : "段时间"}的`) : asked.toDay ? `到${when}为止到期或计划的` : `${when}以后到期或计划的`;
  return `${period}${asked.text ? `含「${asked.text}」的` : ""}${status}待办：没有。`;
}

/** What exists outside the narrowing: how many, and of the open ones how many are past their day. */
export function todoOthersLine(language: Language, count: number, status: "open" | "completed", late: number | null): string {
  const lateWords = status === "open" && late ? late : 0;
  if (language === "en") return `You do have ${count} ${STATUS_WORDS.en[status]} ${count === 1 ? "to-do" : "to-dos"}${lateWords ? `, ${lateWords} of them overdue` : ""}.`;
  if (language === "ja") return `${STATUS_WORDS.ja[status]}タスクはほかに${count}件あります${lateWords ? `（うち${lateWords}件は期限切れ）` : ""}。`;
  return `另有 ${count} 项${STATUS_WORDS.zh[status]}待办${lateWords ? `，其中 ${lateWords} 项已过期` : ""}。`;
}

export function scheduleNothingLine(language: Language, quote: string, asked: Pick<AskedRead, "fromDay" | "toDay" | "text">): string {
  const when = periodWords(language, quote, asked.fromDay, asked.toDay);
  if (language === "en") return `Schedule items${asked.text ? ` containing "${asked.text}"` : ""}${when ? ` ${ONE_DAY_WORD.test(when) ? when : `for ${when}`}` : ""}: none.`;
  if (language === "ja") return `${when ? `${when}の` : ""}${asked.text ? `「${asked.text}」を含む` : ""}予定：ありません。`;
  return `${when ? `${when}的` : ""}${asked.text ? `含「${asked.text}」的` : ""}日程：没有。`;
}

export function scheduleOthersLine(language: Language, count: number): string {
  if (language === "en") return `You have ${count} coming up.`;
  if (language === "ja") return `これからの予定は${count}件あります。`;
  return `接下来还有 ${count} 个日程。`;
}

/**
 * The wider read and its answer, or null when nothing was narrowed or nothing exists outside the narrowing (the plain
 * "nothing found" sentence then stays). A failed read is thrown to the caller, which keeps the plain sentence too.
 */
export async function widerThanAsked(input: WiderInput): Promise<Widened | null> {
  const lines: string[] = [];
  const views: RecordView[] = [];
  for (const asked of input.asked) {
    let query: DomainQuery | null = null;
    let status: "open" | "completed" = "open";
    if (asked.kind === "todo") {
      // A window or words narrowed it: the open ones without them. Only a status narrowed it: the other status.
      status = asked.from || asked.to || asked.text ? "open" : asked.status === "open" ? "completed" : "open";
      query = { status };
    } else if ((asked.from || asked.to) && !asked.defaultFrom || asked.text) {
      query = { from: input.now };
    }
    if (!query) continue;
    const pages = await readPages(input.reader, asked.kind, input.scope, query, input.maxPages);
    const nothing = asked.kind === "todo" ? todoNothingLine(input.language, input.quote, asked) : scheduleNothingLine(input.language, input.quote, asked);
    if (!pages.items.length) {
      lines.push(nothing);
      continue;
    }
    const count = pages.total ?? pages.items.length;
    const cards = pages.items.map(input.cardOf);
    const others = asked.kind === "todo" ? todoOthersLine(input.language, count, status, pages.complete ? lateCount(cards, input.language) : null) : scheduleOthersLine(input.language, count);
    lines.push(`${nothing}${input.language === "en" ? " " : ""}${others}`);
    views.push(...pages.items);
  }
  if (!views.length) return null;
  const cards = views.map(input.cardOf);
  const written = cardsAnswer(lines.join(input.language === "en" ? " " : ""), cards, input.language);
  return { ...written, cards, views };
}
