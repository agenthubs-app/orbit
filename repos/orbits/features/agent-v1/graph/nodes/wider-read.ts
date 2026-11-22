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
import { occurrenceIn } from "../../domains/schedule/read";
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
  /** Part 1b item 4 (AE-RD-004): the read was of one person's records. */
  person?: { id: string; name: string };
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
export function todoNothingLine(language: Language, quote: string, asked: Pick<AskedRead, "fromDay" | "toDay" | "text" | "status" | "statusSaid" | "person">): string {
  const line = todoNothingWords(language, quote, asked);
  const who = asked.person?.name;
  if (!who) return line;
  // Integration seam (2026-11-20): the person goes after the head's "to-dos" whatever its case ("To-dos containing …" had no
  // person at all), never inside the quoted words, and a name is never read as a replacement pattern.
  if (language === "en") return line.replace(/^([^:"]*?to-dos)/iu, (head) => `${head} for ${who}`);
  if (language === "ja") return `${who}さんの${line}`;
  return `${who}名下${line}`;
}

function todoNothingWords(language: Language, quote: string, asked: Pick<AskedRead, "fromDay" | "toDay" | "text" | "status" | "statusSaid">): string {
  const when = periodWords(language, quote, asked.fromDay, asked.toDay);
  const both = Boolean(asked.fromDay && asked.toDay);
  const single = both && asked.fromDay === asked.toDay;
  const plain = ONE_DAY_WORD.test(when);
  // "open" beside a day or words says nothing more ("今天到期的还没完成的待办"); it is said when it is the only narrowing.
  const status = asked.statusSaid && asked.status && (asked.status === "completed" || (!when && !asked.text)) ? STATUS_WORDS[language][asked.status] : "";
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
export function todoOthersLine(language: Language, count: number, status: "open" | "completed", late: number | null, person?: string): string {
  const lateWords = status === "open" && late ? late : 0;
  // Hotfix 1c (AE-RD-013): the count is of those past their deadline or their planned day, as the cards mark them — said so.
  if (language === "en") return `You do have ${count} ${STATUS_WORDS.en[status]} ${count === 1 ? "to-do" : "to-dos"}${person ? ` for ${person}` : ""}${lateWords ? `, ${lateWords} of them past their deadline or planned day` : ""}.`;
  if (language === "ja") return `${person ? `${person}さんの` : ""}${STATUS_WORDS.ja[status]}タスクはほかに${count}件あります${lateWords ? `（うち${lateWords}件は期限または予定日を過ぎています）` : ""}。`;
  return `${person ? `${person}名下` : ""}另有 ${count} 项${STATUS_WORDS.zh[status]}待办${lateWords ? `，其中 ${lateWords} 项已过期或过了计划日` : ""}。`;
}

export function scheduleNothingLine(language: Language, quote: string, asked: Pick<AskedRead, "fromDay" | "toDay" | "text">): string {
  const when = periodWords(language, quote, asked.fromDay, asked.toDay);
  if (language === "en") return `Schedule items${asked.text ? ` containing "${asked.text}"` : ""}${when ? ` ${ONE_DAY_WORD.test(when) ? when : `for ${when}`}` : ""}: none.`;
  if (language === "ja") return `${when ? `${when}の` : ""}${asked.text ? `「${asked.text}」を含む` : ""}予定：ありません。`;
  return `${when ? `${when}的` : ""}${asked.text ? `含「${asked.text}」的` : ""}日程：没有。`;
}

/** Hotfix 1c (AE-ENT-005): words found nothing in the window, but the window has items — said without "none" above them. */
export function scheduleInWindowLine(language: Language, quote: string, asked: Pick<AskedRead, "fromDay" | "toDay" | "text">, count: number): string {
  const when = periodWords(language, quote, asked.fromDay, asked.toDay);
  if (language === "en") return `Nothing ${when ? `${ONE_DAY_WORD.test(when) ? when : `for ${when}`} ` : ""}contains "${asked.text}"; here ${count === 1 ? "is what is" : `are the ${count} items`} on then:`;
  if (language === "ja") return `${when ? `${when}に` : ""}「${asked.text}」を含む予定はありません。この期間の予定は${count}件です：`;
  return `${when ? `${when}` : ""}没有含「${asked.text}」的日程；这段时间里有 ${count} 个日程：`;
}

export function scheduleOthersLine(language: Language, count: number): string {
  if (language === "en") return `You have ${count} coming up.`;
  if (language === "ja") return `これからの予定は${count}件あります。`;
  return `接下来还有 ${count} 个日程。`;
}

interface Piece {
  kind: "todo" | "schedule";
  nothing: string;
  count: number;
  status: "open" | "completed";
  late: number | null;
}

/** Hotfix 1c: one sentence for several kinds that had nothing under the narrowing, and what is shown below instead. */
export function combinedLead(language: Language, pieces: readonly Piece[]): string {
  const subject = (piece: Piece) => piece.nothing.replace(/(?:：没有。|：ありません。|: none\.)$/u, "");
  if (language === "en") {
    const shown = pieces.map((piece) => (piece.kind === "todo" ? `${piece.count} ${STATUS_WORDS.en[piece.status]} ${piece.count === 1 ? "to-do" : "to-dos"}${piece.status === "open" && piece.late ? ` (${piece.late} past their deadline or planned day)` : ""}` : `the ${piece.count} coming up`));
    return `No ${pieces.map((piece) => subject(piece).replace(/^./u, (first) => first.toLowerCase())).join(" and no ")}; below are ${shown.join(" and ")}.`;
  }
  if (language === "ja") {
    const shown = pieces.map((piece) => (piece.kind === "todo" ? `${STATUS_WORDS.ja[piece.status]}タスク${piece.count}件${piece.status === "open" && piece.late ? `（うち${piece.late}件は期限または予定日を過ぎています）` : ""}` : `これからの予定${piece.count}件`));
    return `${pieces.map(subject).join("も")}もありません。下は${shown.join("と")}です。`;
  }
  const shown = pieces.map((piece) => (piece.kind === "todo" ? `${piece.count} 项${STATUS_WORDS.zh[piece.status]}待办${piece.status === "open" && piece.late ? `（其中 ${piece.late} 项已过期或过了计划日）` : ""}` : `接下来的 ${piece.count} 个日程`));
  return `${pieces.map(subject).join("和")}都没有；下面是另外的${shown.join("和")}。`;
}

/**
 * The wider read and its answer, or null when nothing was narrowed or nothing exists outside the narrowing (the plain
 * "nothing found" sentence then stays). A failed read is thrown to the caller, which keeps the plain sentence too.
 */
export async function widerThanAsked(input: WiderInput): Promise<Widened | null> {
  const lines: string[] = [];
  const views: RecordView[] = [];
  const pieces: Piece[] = [];
  for (const asked of input.asked) {
    let query: DomainQuery | null = null;
    let status: "open" | "completed" = "open";
    if (asked.kind === "todo") {
      // A window or words narrowed it: the open ones without them. Only a status narrowed it: the other status.
      status = asked.from || asked.to || asked.text ? "open" : asked.status === "open" ? "completed" : "open";
      query = { status, ...(asked.person ? { contactId: asked.person.id } : {}) };
    } else if ((asked.from || asked.to) && !asked.defaultFrom || asked.text) {
      query = { from: input.now, ...(asked.person ? { contactId: asked.person.id } : {}) };
    }
    // Hotfix 1c (AE-ENT-005): schedule words that found nothing in a window — the window's own items first, never "none" above
    // a record that falls inside it.
    if (asked.kind === "schedule" && asked.text && (asked.from || asked.to)) {
      const inWindow = await readPages(input.reader, "schedule", input.scope, { ...(asked.from ? { from: asked.from } : {}), ...(asked.to ? { to: asked.to } : {}), ...(asked.person ? { contactId: asked.person.id } : {}) }, input.maxPages);
      const kept = inWindow.items.filter((view) => occurrenceIn(String(view.fields.startsAt), typeof view.fields.recurrence === "string" ? view.fields.recurrence : undefined, asked.from, asked.to));
      if (kept.length) {
        lines.push(scheduleInWindowLine(input.language, input.quote, asked, kept.length));
        views.push(...kept);
        continue;
      }
    }
    if (!query) {
      // Part 1b item 4: a person's read still says who and what was looked for.
      if (asked.person && asked.kind === "todo") lines.push(todoNothingLine(input.language, input.quote, asked));
      continue;
    }
    const pages = await readPages(input.reader, asked.kind, input.scope, query, input.maxPages);
    const nothing = asked.kind === "todo" ? todoNothingLine(input.language, input.quote, asked) : scheduleNothingLine(input.language, input.quote, asked);
    if (!pages.items.length) {
      lines.push(nothing);
      continue;
    }
    const count = pages.total ?? pages.items.length;
    const cards = pages.items.map(input.cardOf);
    const late = asked.kind === "todo" && pages.complete ? lateCount(cards, input.language) : null;
    const others = asked.kind === "todo" ? todoOthersLine(input.language, count, status, late, asked.person?.name) : scheduleOthersLine(input.language, count);
    lines.push(`${nothing}${input.language === "en" ? " " : ""}${others}`);
    pieces.push({ count, kind: asked.kind, late, nothing, status });
    views.push(...pages.items);
  }
  // Hotfix 1c (live, 「那这周呢？」: 「…：没有。另有 20 项…这周的日程：没有。接下来还有 1 个日程。」 — four statements): two kinds with
  // nothing in the window are said in one sentence — what was looked for, then what is shown below.
  if (pieces.length >= 2 && pieces.length === lines.length) {
    lines.splice(0, lines.length, combinedLead(input.language, pieces));
  }
  // Part 1b item 4 (AE-RD-004): a person's read with nothing outside the narrowing still says who and what was looked for.
  if (!views.length && lines.length && input.asked.some((asked) => asked.person)) {
    const text = lines.join(input.language === "en" ? " " : "");
    return { blocks: [{ text, type: "paragraph" }], cards: [], text, views: [] };
  }
  if (!views.length) return null;
  const cards = views.map(input.cardOf);
  const written = cardsAnswer(lines.join(input.language === "en" ? " " : ""), cards, input.language);
  return { ...written, cards, views };
}
