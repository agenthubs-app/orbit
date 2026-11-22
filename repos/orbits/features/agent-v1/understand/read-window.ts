/**
 * Hotfix 2026-11-20 (live site, 「今天先处理哪些事？」 / 「所有代办都是空吗？」): two rules about a read's time window,
 * decided by code from the user's own words, never left to the first layer.
 *
 * 1. "What is on my plate today" (今天先处理哪些事、现在该做什么、今日やること、what should I do today) is not a question
 *    about records dated exactly today: it reads the to-dos not done that are due or planned today or earlier (overdue
 *    ones included) and today's schedule items. Code turns the part's window into "open, up to today" here; the read step
 *    (graph/nodes/resolve.ts) keeps today's day for schedule items.
 * 2. A time window comes from the current message. The first layer sees earlier turns and sometimes carries their window
 *    ("today") into a message that sets no time of its own; that window is dropped unless the message plainly goes on
 *    from the result before (这些、其中、那几条、还有吗 …) and does not name the whole set (所有、全部、一共、all …).
 */
import type { ReadFilter } from "./schema";

/** Words of the message that set a time or a deadline of its own (zh, ja, en). */
const OWN_TIME = new RegExp([
  "今天|明天|昨天|后天|前天|今早|今晚|明早|明晚|昨晚|今儿|明儿|本周|这周|这星期|这个星期|下周|下星期|下个星期|上周|上星期|上个星期",
  "周[一二三四五六日天末]|星期[一二三四五六日天]|礼拜[一二三四五六日天]?|本月|这个月|下个月|下月|上个月|上月|月底|月初|月中|年底|年初|今年|明年|去年",
  "季度|上半年|下半年|这阵子|最近|近期|这几天|这两天|前几天|过几天|接下来|未来|以前|之前|以后|之后|早上|上午|中午|下午|晚上|凌晨",
  "过期|逾期|超期|到期|截止|期限|[0-9０-９]+\\s*[月日号號]|[0-9]{1,2}[/.-][0-9]{1,2}|[一二三四五六七八九十两几半\\d]+\\s*个?\\s*(?:天|日|周|星期|礼拜|月|年|小时)",
  "今日|明日|昨日|明後日|今朝|今夜|今週|来週|先週|今月|来月|先月|今年|来年|週末|曜日|午前|午後|期日|締め切り|締切|このところ|[0-9]+\\s*(?:日間|週間|ヶ月|か月)",
  "\\b(?:today|tonight|tomorrow|yesterday|weekend|morning|afternoon|evening|overdue|due|deadline|before|after|until|since|recent|recently|lately)\\b",
  "\\b(?:this|next|last|past|coming)\\s+(?:week|weekend|month|year|quarter|few days|\\d+ days)\\b",
  "\\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\\b|\\b(?:jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?\\s+\\d",
  "\\b\\d+\\s*(?:days?|weeks?|months?|years?|hours?)\\b",
].join("|"), "iu");

/** Words that point at the result shown before (这些、其中、那几条、还有吗 …). */
const POINTS_AT_RESULT = /(这些|那些|这几|那几|其中|里面|里头|当中|这里面|上面|刚才|刚刚|还有吗|还有呢|还有没有|还有别的|别的呢|剩下|其余|それら|その中|そのうち|このうち|ほかに|他に|残り|\b(?:these|those|of them|among them|the rest|any more|anything else|what else)\b)/iu;

/** Words that name the whole set of a kind (所有、全部、一共、all …). */
const WHOLE_SET = /(所有|全部|一共|总共|全都|统统|全体|整体|すべて|全て|全件|\b(?:all|every|everything|in total|altogether|overall)\b)/iu;

/**
 * AG21a (R32a): the words with every stretch that sets a time window taken out ("这两周", "这几天", "接下来一周", "next
 * week") — they are the read's window (the first layer turned them into dates), never a ranking topic. Each stretch the
 * time pattern matches is blanked where it stands, with a 这/那/近 just before it.
 */
// Also the spelled-out spans the pattern leaves for setsOwnTime as they were ("the next two weeks", "ここ数日", "この2週間").
const SPELLED_WINDOW = "\\b(?:the\\s+)?(?:next|last|past|coming|these|those)\\s+(?:(?:two|three|four|few|couple of|several)\\s+)?(?:days|weeks|months)\\b|(?:ここ|この)?(?:数日|[二三2-3]週間|数週間)";
const WINDOW_STRETCH = new RegExp(`(?:这|那|近|头)?(?:${OWN_TIME.source}|${SPELLED_WINDOW})`, "giu");
export function withoutWindowWords(words: string): string {
  return words.replace(WINDOW_STRETCH, " ").replace(/\s+/gu, " ").trim();
}

/** True when the message sets a time window of its own. */
export function setsOwnTime(message: string): boolean {
  return OWN_TIME.test(message);
}

/**
 * Rule 2: the part's window when the message does not set one — kept only for a plain continuation of the result before.
 * Returns the filter to use and whether a window was dropped.
 */
type Windowed = { from?: string; to?: string; status?: ReadFilter["status"] };

export function ownWindow<F extends Windowed>(filter: F, message: string): { filter: F; dropped: boolean } {
  if (!filter.from && !filter.to) return { dropped: false, filter };
  if (setsOwnTime(message)) return { dropped: false, filter };
  if (POINTS_AT_RESULT.test(message) && !WHOLE_SET.test(message)) return { dropped: false, filter };
  const { from: _from, to: _to, ...rest } = filter;
  return { dropped: true, filter: rest as F };
}

/** Words of a date, a time of day, a kind of record, or glue — none of them a title or a topic. */
const DATE_WORD = /(?:\d{4}\s*年\s*)?\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?\b|\d{4}-\d{2}-\d{2}/giu;
const DAY_PART = /(早上|上午|中午|下午|傍晚|晚上|凌晨|夜里|午前|午後|お昼|昼|夕方|朝|夜|\b(?:morning|afternoon|evening|noon|night|lunchtime)\b)/giu;
const KIND_OR_GLUE = /(日程|安排|行程|会议|待办|代办|笔记|活动|计划|予定|スケジュール|タスク|メモ|イベント|我的|我|的|の|に|は|有什么|什么|哪些|\b(?:my|the|on|at|in|of|for|schedule|meetings?|events?|to-?dos?|notes?|plans?|what|do i have)\b|[\s\p{P}\p{S}]+)/giu;

/**
 * Hotfix 1c (AE-ENT-005: the clue 「11 月 19 日中午」 was searched as a schedule item's title, found nothing, and the answer said
 * "none containing 「11月19日中午」" above the very lunch asked about): words made only of dates, times of day and kinds of
 * record are a window, never a title, search words or a ranking topic. Used for readFilter.text (graphPartsOf), a record clue
 * (resolveNode) and rank.basis (rankPart).
 */
export function onlyWindowWords(words: string | undefined): boolean {
  if (!words?.trim()) return false;
  const timed = new RegExp(DATE_WORD.source, "iu").test(words) || new RegExp(DAY_PART.source, "iu").test(words) || OWN_TIME.test(words);
  if (!timed) return false;
  const rest = words.replace(DATE_WORD, " ").replace(DAY_PART, " ").replace(new RegExp(OWN_TIME.source, "giu"), " ").replace(KIND_OR_GLUE, " ");
  return !/[\p{L}\p{N}]/u.test(rest);
}

/** The day such words name ("11 月 19 日中午" → "2026-11-19"), the year nearest to today; null without a month and day. */
export function dayOfWords(words: string, today: string): string | null {
  const cjk = words.match(/(?:(\d{4})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]?/u);
  const en = cjk ? null : words.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b/iu);
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = cjk ? Number(cjk[2]) : en ? months.indexOf(en[1].toLowerCase().slice(0, 3)) + 1 : 0;
  const day = cjk ? Number(cjk[3]) : en ? Number(en[2]) : 0;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const base = Number(today.slice(0, 4));
  const years = cjk?.[1] ? [Number(cjk[1])] : [base - 1, base, base + 1];
  const target = Date.parse(`${today}T00:00:00Z`);
  const year = years.sort((left, right) => Math.abs(Date.UTC(left, month - 1, day) - target) - Math.abs(Date.UTC(right, month - 1, day) - target))[0];
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const SWAP_LEAD = /^(?:那么说|那么|那|还有|それなら|じゃあ|では|なら|and|what about|how about)\s*/iu;
const SWAP_TAIL = /(?:呢|吗|の|は|\?|？|。|\.|\s)+$/u;

/**
 * Hotfix 1c (live: 「那这周呢？」 after 「今天先处理哪些事？」 opened with 「我按「看摘要」来理解。」): a short follow-up that only swaps
 * the period ("那这周呢", "来週は？", "what about next week?") is the question just answered, with the new window.
 */
export function swapsPeriod(message: string): boolean {
  const core = message.trim().replace(SWAP_LEAD, "").replace(SWAP_TAIL, "").trim();
  return Boolean(core) && [...core].length <= 14 && setsOwnTime(core) && onlyWindowWords(core);
}

/** "Today", "now" or "first" in the sense of what to take up (zh, ja, en). */
const PLATE_WHEN = /(今天|今日|今儿|现在|眼下|当下|这会儿|先(?![生週月日])|首先|优先|最要紧|最紧急|当务之急|きょう|今すぐ|いま|今(?![週月年度回朝晩夜後])|まず|最初に|先に|\b(?:today|now|right now|first|this morning|tonight)\b)/iu;
/** Doing, handling, taking up (zh, ja, en). */
const PLATE_DO = /(处理|做|干|(?<![待代])办|忙|搞定|跟进|着手|解决|弄|やる|やるべき|やること|すること|すべき|片付け|対応|手を付け|取りかか|取り掛か|優先|こなす|処理|進め|何から|\b(?:(?:should|must|can|could|shall) i (?:do|handle|tackle|work on|focus on|start with)|to do|do (?:first|now|today|next)|handle|tackle|work on|focus on|start with|prioriti[sz]e|deal with|get done|on my plate)\b)/iu;
/** What was already done ("今天做了什么", "what did I do today"): a question about the past, not the plate. */
const PLATE_PAST = /(做了|处理了|干了|办了|完成了|做过|处理过|做完了|忙了|やった|済ませた|片付けた|\bdid\b|\bhave i done\b|\bi(?:'ve| have)? done\b|\bfinished\b)/iu;

/** Rule 1: the words ask what to do or handle today / now / first. */
export function asksTodaysPlate(words: string): boolean {
  return PLATE_WHEN.test(words) && PLATE_DO.test(words) && !PLATE_PAST.test(words);
}

/** Rule 1: the window of a "today's plate" read — open to-dos due or planned up to today (no lower end). */
export function plateFilter<F extends Windowed>(filter: F | undefined, until: string): F {
  const { from: _from, ...rest } = (filter ?? {}) as F;
  return { ...rest, status: "open", to: until } as F;
}

/** Rule 1, read step: the filter is the one plateFilter() made — for today, or (a swapped period) up to that window's end. */
export function isPlateFilter(filter: Windowed | undefined, today: string, swapped = false): boolean {
  return Boolean(filter && !filter.from && filter.status === "open" && filter.to && (filter.to === today || (swapped && filter.to >= today)));
}
