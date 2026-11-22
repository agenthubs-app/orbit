/**
 * Where a ranking's basis comes from (设计稿 §3.5 "用户没给排序标准时"; agent-design AG10-1, PLANNER 易错边界 1/2).
 *
 * Only listing records is not ranking: it is delivered in the domain's natural order (events and schedule by start time,
 * to-dos by due date then planned date, memos and interactions newest first). Picking the top few needs a basis, looked
 * for in this order and combined when several are found:
 *   1. now — this turn's words, the @ references, a goal the user said earlier in this session;
 *   2. memory — saved preferences and constraints that point at this domain (read only; AG14's recallFor() replaces it);
 *   3. history — signals the domain registers, computed by code from the user's own records (contacts: overdue formal
 *      follow-ups, to-dos past their planned day, days since the last real interaction; to-dos: overdue first).
 * With none of them, the agent asks once (clarify) and offers the orderings available now; "随便" gets the natural order.
 * "最好的", "最重要的", "best" are not a basis. A field the model names to order by counts only when the user's words say it.
 */
import type { RankField } from "../understand/schema";
import { polarityOf } from "./negation";

export type RankDomain = "event" | "contact" | "todo";
export type BasisSource = "turn" | "session_goal" | "memory" | "history" | "natural";

/** A preference or constraint on when an event is: days of the week and the part of the day. */
export interface TimePreference {
  days?: "weekend" | "weekday";
  part?: "morning" | "afternoon" | "evening";
  /**
   * AG21b (R33): a clock boundary on the start ("八点以后开始的", "before 8 am", "20時以降"), in minutes after midnight:
   * "from" includes that minute (以后/以降/after), "before" leaves it out (以前/前/before). With a clock the part of the day
   * is not used — "晚上八点以后" is 20:00 on, never the whole evening.
   */
  clock?: { minutes: number; side: "from" | "before" };
  /** AG21c (R33): days of the week named one by one ("周日", "日曜", "Sunday"), 0 = Sunday … 6 = Saturday. */
  weekdays?: number[];
  /** AG21c (R33): the words name a time but whether they leave it out or ask for it only cannot be read: never applied. */
  unclear?: boolean;
  /** A constraint (只…, 不要…, only, not): candidates that miss it are removed; otherwise it only ranks. */
  hard: boolean;
  /** The opposite: "不要晚上的" excludes evenings. */
  exclude: boolean;
  source: "turn" | "memory";
  /** The words it was read from (shown in the lead). */
  words: string;
}

export type BasisCriterion =
  | { kind: "time"; preference: TimePreference }
  | { kind: "topic"; text: string; memo?: { ref: string; title: string }; source: "turn" | "session_goal" | "memory" }
  | { kind: "field"; field: RankField; direction: "asc" | "desc"; source: "turn" | "natural" }
  | { kind: "signals"; source: "history" };

export interface Basis {
  criteria: BasisCriterion[];
  /** The layers the basis came from, in order (the lead names them). */
  sources: BasisSource[];
}

/* ── words ─────────────────────────────────────────────────────────── */

/** Asking for the top few (vs. only listing). */
export const PICK_WORDS = /(挑|选出|选几|选个|选一|推荐|值得|最好|最适合|最合适|最重要|哪[一两几三四五]?[场个位条件项]|top\s*\d|\bpick\b|\bchoose\b|\brecommend\b|\bbest\b|\bworth\b|\bwhich\b.*\bshould\b|選んで|選ぶ|おすすめ|一番|ベスト|どれが)/iu;
/** Words that only ask for "the best" — not a basis by themselves. */
const QUALITY_WORDS = /(最好的?|最值得(?:去|看|参加)?的?|值得(?:去|看|参加)的?|最重要的?|最合适的?|最适合的?|最推荐的?|最棒的?|最有意思的?|好的|最佳|\bthe best\b|\bbest\b|\bmost worth\b|\bworth (?:going|attending)\b|\bmost important\b|\btop\b|\bgood\b|\bgreat\b|おすすめの?|一番いい|一番良い|ベストな?|良い|いい)/giu;
/** Words that name the set, the count or the act — not a basis. */
const FILLER = /(帮我|请|给我|我想|从|在|这个月|本月|这周|本周|下周|今天|明天|剩下的?|里面?|中的?|之中|当中|的|挑|选出?|选择|推荐|排(?:个序|一下|序)?|一下|哪|几|[一二两三四五六七八九十\d]+\s*(?:场|个|位|条|件|项|人|つ|名)|活动|活動|イベント|联系人|連絡先|待办|代办|跟进|谁|人|吗|呢|吧|呀|呗|？|\?|。|，|,|、|！|!|\s|\bpick\b|\bchoose\b|\brecommend\b|\bshow\b|\blist\b|\bme\b|\bthe\b|\bof\b|\bmy\b|\bin\b|\bthis\b|\bweek\b|\bmonth\b|\bevents?\b|\bcontacts?\b|\bwhich\b|\bones?\b|\bshould\b|\bi\b|\bgo\b|\bto\b|\battend\b|\bfor\b|\band\b|\ba\b|\bthree\b|\btwo\b|\bfive\b|を|が|は|に|の|で|か|から|選んで|ください|教えて|今月|今週|来週)/giu;
/** Words of following up on people (the history signals answer them). */
export const FOLLOW_UP_WORDS = /(跟进|该联系|要联系|联系谁|先联系|优先联系|回访|催一下|follow[\s-]?up|reach out|get back to|\bshould I (?:contact|call|email|message)\b|\bcontact (?:first|now|next)\b|フォロー|連絡すべき|連絡する人)/iu;

/** Hotfix 2026-11-20 part 2: asking who (哪些人、谁、誰、who). */
const WHO_ASKED = /(谁|哪位|哪些人|哪几位|\bwho\b|\bwhom\b|誰|どなた|どの人)/iu;

/**
 * Hotfix 2026-11-20 part 2 (the App's suggested question todayVm.questionFollowup: 「哪些人值得先跟进？」, 「誰を優先してフォローしますか？」,
 * "Who should I follow up with first?"): asking who to follow up with is the follow-up ranking of 「这周该跟进谁」 — due follow-ups,
 * to-dos past their planned day — never a topic ranking over the sentence.
 */
export function asksWhoToFollowUp(words: string): boolean {
  return WHO_ASKED.test(words) && FOLLOW_UP_WORDS.test(words);
}

/**
 * Hotfix 2026-11-20 part 2, rule 3: words that are never a ranking topic on their own — question words, "first / worth / should",
 * and words for a kind of record, a time or the act of preparing ("哪些人值得先跟进" leaves 「值得先」, "接下来的会面或活动，该准备什么"
 * leaves 「接下来 会面 准备什么」: neither is a topic).
 */
// AG21a (R32b, coordinator's decision 1): vague words of fit or of being worth it ("适合我", "可以去", "for me", "私に合う",
// "行ける", "おすすめ") ask for a recommendation; they are never its topic. Lifting a saved rule this once ("这次…也算上") names
// no topic either.
const NOT_A_TOPIC = /(适合我的?|合适我的?|适合自己的?|对我来说|适合|合适|可以去的?|可以看的?|可以参加的?|能去的?|值得去的?|值得看的?|值得一去|也算上|也算进来|也算进去|也包括|这次|这回|本次|私に合う|自分に合う|私に向いている|向いている|合いそう|行ける|行けそう|おすすめ|オススメ|今回|ありますか|あります|ある|\b(?:suits? me|suitable|worth going|worth it|this time|any|anything|there|some)\b|タスク|メモ|ノート|連絡先|スケジュール|公開されている|公開中の?|公開済み|公開|まだ終わっていない|終わっていない|未完了の?|已发布的?|发布的|公开的|公开|进行中的?|还没完成的?|没完成的?|未完成的?|还没开始的?|\b(?:published|public|open|pending|not done|unfinished|not started|ongoing|to-?dos?|tasks?)\b|告诉我|告诉|原因|理由|为什么|下一步|现在|目前|当前|并说明|说明|解释|值得参加|参加する|参加|連絡すべき|連絡|教えて|理由|次の一歩|とともに|ともに|価値がある|価値|今|\b(?:now|currently|reason|reasons|why|next step|tell me|suggest|explain|worth|attending|attend|recommend|recent|recently|good fit|fit|for me|me|are|is)\b|值得|首先|最先|优先|先|应该|应当|该|需要|要|可以|能|哪些|哪个|哪位|哪几|哪|谁|什么|怎么|如何|是否|吗|呢|吧|或者|或|和|与|还有|接下来|下一个|下次|之后|以后|最近|近期|会面|见面|会议|开会|活动|日程|安排|准备|事情|事|东西|跟进|联系|優先|して|します|しますか|ますか|ますか|すべき|べき|誰|何から|何|どれ|次の|面会|イベント|予定|準備|フォロー|進め|今日|は|を|に|の|\b(?:first|should|need|needs|to|what|which|who|whom|how|do|i|for|with|up|follow|prepare|upcoming|next|meetings?|events?|or|and|the|my|a)\b|[\s。.，,、？?！!：:]+)/giu;

/**
 * AG21c (R45): a time-anchor clause — an occasion or a deadline the request must happen before ("展会前", "月底之前",
 * "展示会の前に", "月末までに", "before the trade fair", "by the end of the month") — says when, never by what. The occasion
 * noun and the anchor go; a subject of the occasion stays ("陶艺展前" leaves 陶艺, "before the ceramics fair" leaves ceramics).
 */
const OCCASION_ZH = "(?:展销会|展览会|博览会|交易会|发布会|交流会|研讨会|分享会|见面会|年会|大会|会议|开会|会展|展会|展览|展|活动|出差|旅行|出发|见面|开幕|月底|月末|年底|年末|周末|节前|假期|放假|截止|deadline)";
const OCCASION_JA = "(?:展示会|見本市|展覧会|発表会|交流会|説明会|イベント|会議|出張|旅行|月末|年末|週末|締め切り|締切)";
const OCCASION_EN = "(?:trade\\s+fair|trade\\s+show|fair|expo|exhibition|conference|summit|show|trip|event|launch|meeting|deadline|weekend|holidays?)";
const ANCHOR_ZH = new RegExp(`(?<![发进扩伸施开])(?:在)?${OCCASION_ZH}(?:开始)?(?:之前|以前|前)`, "giu");
const ANCHOR_JA = new RegExp(`${OCCASION_JA}(?:の)?(?:前に|前まで|前|までに|まで)`, "gu");
const ANCHOR_EN = new RegExp(`\\b(?:before|ahead of|prior to|in time for)\\s+(?:(?:the|my|our|this|next|that)\\s+)?((?:[\\p{L}-]+\\s+){0,2}?)${OCCASION_EN}s?\\b`, "giu");
const BY_END_EN = /\b(?:by|before)\s+(?:the\s+)?end\s+of\s+(?:the\s+|this\s+|next\s+)?(?:month|week|year)\b/giu;
/**
 * AG21c (R45): the request's own verb — meeting or getting in touch, the same act as the pick words — names no topic
 * ("想见", "想联系", "会っておきたい", "to meet").
 */
const REQUEST_VERB = /(想要见|想见|要见|去见|见见|想联系|要联系|想认识|想约|约见|想拜访|拜访|值得见|值得联系|会っておきたい|会いたい|会うべき|会う価値|会える|会う|連絡したい|話したい|\b(?:want(?:s)? to |would like to |should |to )?(?:meet(?:ing)?|see|contact(?:ing)?|connect(?:ing)? with|talk(?:ing)? to|reach out to)\b)/giu;
export function withoutOccasionWords(words: string): string {
  return words.replace(/(下个?月|下星期|下礼拜|来月|来週|\bnext (?:month|week)\b)/giu, " ").replace(ANCHOR_ZH, " ").replace(ANCHOR_JA, " ").replace(ANCHOR_EN, " $1 ").replace(BY_END_EN, " ").replace(REQUEST_VERB, " ").replace(/\s+/gu, " ").trim();
}

/** Rule 3: the real topic in some words ("" when nothing but question, kind, time or preparing words is left). */
export function realTopicOf(words: string): string {
  const left = topicWordsOf(withoutOccasionWords(words).replace(NOT_A_TOPIC, " ")).replace(NOT_A_TOPIC, " ");
  // A single character left over (a particle, half of a word taken apart: 「次 や」, 「现」) is no topic.
  return left.split(/\s+/u).filter((token) => [...token.replace(/[^\p{L}\p{N}]/gu, "")].length > 1 && !/^'s$/iu.test(token)).join(" ").trim();
}

/** Rule 3: the basis words are the whole part (the model copied the question as its topic). */
export function isWholeQuote(basis: string, quote: string): boolean {
  const flat = (text: string) => text.replace(/[\s。.，,、？?！!：:]+/gu, "");
  return Boolean(flat(basis)) && flat(basis) === flat(quote);
}
const NATURAL_REPLY = /^(?:随便|都行|都可以|无所谓|你定|你看着办|随你|没要求|没有要求|任意|any(?:thing|one)?|whatever|doesn'?t matter|no preference|up to you|どれでも|何でも|お任せ|おまかせ|特にない|特になし)/iu;

/** A reply to "按什么来挑" that leaves it to the agent ("随便", "都行", "whatever"). */
export function leavesItToAgent(words: string): boolean {
  return NATURAL_REPLY.test(words.trim().replace(/^[，,。\s]+/u, ""));
}

/** What remains of the words once the act, the set, the count and "the best" are taken out; empty: no basis. */
/**
 * AG13 rerun of AG08 (AE-JDG-002): "at least one recorded interaction (with)" is a hard condition code already holds
 * (ordered by the last interaction, a contact without one is left out), not a topic for the judgment.
 */
const HAS_INTERACTION = /((?:of the contacts |contacts )?(?:I have |I've |with )?at least one (?:recorded )?(?:interaction|contact|conversation)s?(?: with)?|(?:至少)?有过?(?:至少)?一次(?:以上)?(?:记录的)?往来(?:的)?|有往来记录(?:的)?|やり取りが(?:1|一)回以上(?:ある)?|やり取りの記録がある)/giu;

export function topicWordsOf(words: string): string {
  return words
    .replace(HAS_INTERACTION, " ")
    .replace(/@\S+/gu, " ")
    .replace(/\d{4}\s*年|\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\d{1,2}\s*[日号]|\d{4}-\d{2}-\d{2}/gu, " ")
    .replace(QUALITY_WORDS, " ")
    .replace(/(按|依照|根据|\bby\b|順|顺序|先后|开始时间|開始時間|时间|時間|截止时间|截止|计划日|予定日|期限|日期|日付|start time|due date|planned date|\bdate\b|\boldest\b|\bnewest\b|\bearliest\b|\blatest\b|\bfirst\b|过期最久|最久|最早|最近)/giu, " ")
    .replace(/(优先|尽量|最好|偏好|prefer(?:ably)?|ideally|できれば|なるべく|周末|週末|工作日|平日|上午|下午|晚上|午前|午後|夕方|weekends?|weekdays?|mornings?|afternoons?|evenings?|nights?)/giu, " ")
    .replace(FILLER, " ")
    .replace(/(该|应该|需要|要|有|些|和|跟|与|或|及|吧|呢|\bor\b)/gu, " ")
    .replace(/[.!?,;:]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Words of asking, counting and repeating that name no topic ("几场", "再……一次", "有什么", "would you", "もの"). */
const ASK_WORDS = /(几\s*(?:场|个|位|条|件|项|人)|[场个位条件项]|这一次|这次|这回|本次|今回は?|(?:周|星期|礼拜)[一二三四五六日天]|[月火水木金土日]曜日?|\b(?:mon|tues|wednes|thurs|fri|satur|sun)days?\b|\b(?:this|time|once|just|show|see|look|at|only)\b|見せて|見たい|夜|看|先|这个|那个|这些|那些|就|再|一次|一遍|一回|什么|哪些|有没有|看看|想去|可以|能不能|到|至|[（(][月火水木金土日一二三四五六天][）)]|[（()）~～—\-–「」『』"“”'’]|\b(?:would|you|can|could|do|does|did|next|some|any|are|is|was|there|what|what's|whats|please|have|has|on|again|few|worth|going|about|happening|coming|up|it|them|these|those|that|that's|will|be)\b|もう一度|もう一回|何か|ありますか|あります|ある|どんな|行く価値(?:が|の)?(?:ありそうな|ある|高い)?|価値|行く|ありそう|もの|こと|と|も|な|ら|\d+)/giu;

/**
 * AG14: what is left of a whole sentence as a topic when the first layer gave no basis words. A sentence that only
 * asks ("给我推荐几场下周的活动", "Which events would you recommend for next week?", "来週のおすすめイベントを教えて") names
 * no topic: it is ranked by what is saved, or — with nothing saved — asked about once (设计稿 §3.5), never matched
 * against its own words.
 */
export function sentenceTopicOf(words: string): string {
  return topicWordsOf(words).replace(ASK_WORDS, " ").replace(/\s+/gu, " ").trim();
}

const WEEKEND = /(周末|週末|礼拜六日|土日|weekend)/iu;
const WEEKDAY = /(工作日|平日|weekday)/iu;
const ZH_DAY: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const JA_DAY: Record<string, number> = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 0 };
const EN_DAY: Record<string, number> = { mon: 1, tues: 2, wednes: 3, thurs: 4, fri: 5, satur: 6, sun: 0 };
const DAY_NAME = /(?:周|星期|礼拜)([一二三四五六日天])|([月火水木金土日])曜(?:日)?|\b(mon|tues|wednes|thurs|fri|satur|sun)days?\b/giu;
const DAY_RANGE = /^\s*(?:到|至|~|～|-|–|—|から|\bto\b|\bthrough\b|\bthru\b)\s*$/iu;

/**
 * AG21c (R33): the days of the week the words name one by one ("周日", "周一到周三", "日曜", "Sundays"), 0 = Sunday; a range
 * between two days covers the days between. Empty when they name none.
 */
export function weekdaysNamedIn(words: string): number[] {
  const found: { day: number; start: number; end: number }[] = [];
  for (const match of words.matchAll(DAY_NAME)) {
    const day = match[1] ? ZH_DAY[match[1]] : match[2] ? JA_DAY[match[2]] : EN_DAY[match[3]!.toLowerCase()];
    if (day !== undefined) found.push({ day, end: match.index! + match[0].length, start: match.index! });
  }
  const days = new Set<number>();
  found.forEach((item, index) => {
    days.add(item.day);
    const next = found[index + 1];
    if (next && DAY_RANGE.test(words.slice(item.end, next.start))) for (let day = item.day; day !== next.day; day = (day + 1) % 7) days.add(day);
  });
  return [...days].sort((left, right) => left - right);
}

/** The days a time preference names: weekend / weekday words, else the days named one by one. */
function daysIn(words: string): Pick<TimePreference, "days" | "weekdays"> {
  if (WEEKEND.test(words)) return { days: "weekend" };
  if (WEEKDAY.test(words)) return { days: "weekday" };
  const named = weekdaysNamedIn(words);
  if (!named.length) return {};
  if (named.length === 2 && named[0] === 0 && named[1] === 6) return { days: "weekend" };
  if (named.length === 5 && named.every((day) => day >= 1 && day <= 5)) return { days: "weekday" };
  return { weekdays: named };
}
const MORNING = /(上午|早上|早晨|午前|朝|morning)/iu;
const AFTERNOON = /(下午|午後|afternoon)/iu;
const EVENING = /(晚上|夜里|夜间|夜晚|夕方|夜の(?:時間|イベント|部)|夜は|夜に|夜間|\bevenings?\b|\bnights?\b)/iu;

/** A time preference in some words ("优先周末上午", "不要晚上的活动", "weekend mornings only"); null when they name none. */
export function timePreferenceIn(said: string, source: "turn" | "memory"): TimePreference | null {
  // Record names chosen with @ ("@设计师之夜") are not time words.
  const words = said.replace(/@\S+/gu, " ");
  const { days, weekdays } = daysIn(words);
  const clock = clockBoundIn(words);
  const part = clock ? undefined : MORNING.test(words) ? "morning" : AFTERNOON.test(words) ? "afternoon" : EVENING.test(words) ? "evening" : undefined;
  if (!days && !weekdays && !part && !clock) return null;
  // AG21c (R33): one negation reader for the turn and saved entries (verb negations too); unclear words are never a condition.
  const polarity = polarityOf(words);
  const exclude = polarity === "exclude";
  return { exclude, hard: exclude || polarity === "only", source, words: words.trim(), ...(polarity === "unclear" ? { unclear: true } : {}), ...(days ? { days } : {}), ...(weekdays ? { weekdays } : {}), ...(part ? { part } : {}), ...(clock ? { clock } : {}) };
}

const CJK_NUMBER: Record<string, number> = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const PM_WORDS = /(下午|晚上|傍晚|夜里|夜间|夜|午後|夕方|pm|p\.m\.)/iu;
const AM_WORDS = /(早上|上午|早晨|凌晨|午前|朝|am|a\.m\.)/iu;
const ZH_JA_CLOCK = /(早上|上午|早晨|凌晨|中午|下午|傍晚|晚上|夜里|夜间|午前|午後|夕方|夜|朝)?\s*(\d{1,2}|十[一二]?|[零一二两三四五六七八九])\s*(?:[点點時时])\s*(半|\d{1,2}\s*分?)?\s*(以后|之后|以後|过后|后|後|以降|から|起|以前|之前|前|より前|まで)/u;
const COLON_CLOCK = /(早上|上午|早晨|凌晨|中午|下午|傍晚|晚上|夜里|夜间|午前|午後|夕方|夜|朝)?\s*(\d{1,2})[:：](\d{2})\s*(?:[点點時时])?\s*(?:开始|開始|スタート)?(?:的)?\s*(以后|之后|以後|过后|后|後|以降|から|起|以前|之前|前|より前|まで)/u;
const EN_CLOCK = /\b(after|from|at or after|before|earlier than|later than)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?|\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s+or\s+(later|after|earlier|before)\b/iu;

/** AG21b (R33): the clock boundary the words put on a start time; null when they name none. */
export function clockBoundIn(words: string): TimePreference["clock"] | null {
  // Integration (coordinator, 2026-11-21): 「推荐晚上的活动，只要七点以后开始的」 — the evening said elsewhere in the words makes a
  // bare 七点 seven in the evening (only when nothing in them says morning).
  const pmElsewhere = /(下午|晚上|傍晚|夜里|夜间|夜|午後|夕方|\bpm\b|p\.m\.|\bevenings?\b|\bnights?\b|\bafternoons?\b)/iu.test(words) && !/(早上|上午|早晨|凌晨|午前|朝|\bam\b|a\.m\.|\bmornings?\b)/iu.test(words);
  const hourOf = (raw: string, qualifier: string): number | null => {
    let hour = /^\d+$/u.test(raw) ? Number(raw) : CJK_NUMBER[raw] ?? NaN;
    if (!Number.isFinite(hour) || hour > 24) return null;
    if ((PM_WORDS.test(qualifier) || (!qualifier && pmElsewhere)) && hour < 12) hour += 12;
    else if (AM_WORDS.test(qualifier) && hour === 12) hour = 0;
    return hour % 24;
  };
  // Integration (coordinator, 2026-11-21): a clock written with a colon ("19:00 以后开始的", "19:00以降") is the same bound.
  const colon = COLON_CLOCK.exec(words);
  if (colon) {
    const hour = hourOf(colon[2], colon[1] ?? "");
    if (hour === null) return null;
    const side = /(以前|之前|前|より前|まで)/u.test(colon[4]) ? "before" : "from";
    return { minutes: hour * 60 + Math.min(Number(colon[3]), 59), side };
  }
  const zh = ZH_JA_CLOCK.exec(words);
  if (zh) {
    const hour = hourOf(zh[2], zh[1] ?? "");
    if (hour === null) return null;
    const minute = zh[3] === "半" ? 30 : zh[3] ? Number(zh[3].replace(/\D/gu, "")) : 0;
    const side = /(以前|之前|前|より前|まで)/u.test(zh[4]) ? "before" : "from";
    return { minutes: hour * 60 + Math.min(minute, 59), side };
  }
  const en = EN_CLOCK.exec(words);
  if (en) {
    const [word, raw, mm, meridiem] = en[1] ? [en[1], en[2], en[3], en[4] ?? ""] : [en[8], en[5], en[6], en[7] ?? ""];
    const hour = hourOf(raw, meridiem);
    if (hour === null) return null;
    const side = /(before|earlier)/iu.test(word) ? "before" : "from";
    return { minutes: hour * 60 + (mm ? Math.min(Number(mm), 59) : 0), side };
  }
  return null;
}

/** The clause of the words that holds the time preference (between punctuation), for the lead. */
export function timeClauseOf(words: string): string | null {
  for (const clause of words.split(/[，,。；;、]/u)) if (timePreferenceIn(clause, "turn")) return clause.trim();
  return null;
}

/** Whether an event at this instant (in the time zone) meets the preference's days and part of the day. */
export function meetsTime(preference: Pick<TimePreference, "days" | "part" | "clock" | "weekdays">, startsAt: string, timeZone: string): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone, weekday: "short" }).formatToParts(new Date(startsAt)).map((part) => [part.type, part.value]));
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const hour = Number(parts.hour);
  if (preference.days === "weekend" && !weekend) return false;
  if (preference.days === "weekday" && weekend) return false;
  if (preference.weekdays?.length && !preference.weekdays.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday))) return false;
  // AG21b (R33): a clock boundary, with its own inclusiveness ("以后" includes the minute, "以前" does not).
  if (preference.clock) {
    const minutes = hour * 60 + Number(parts.minute);
    if (preference.clock.side === "from" ? minutes < preference.clock.minutes : minutes >= preference.clock.minutes) return false;
  }
  if (preference.part === "morning" && hour >= 12) return false;
  if (preference.part === "afternoon" && (hour < 12 || hour >= 17)) return false;
  if (preference.part === "evening" && hour < 17) return false;
  return true;
}

const FIELD_WORDS: Record<RankField, RegExp> = {
  dueAt: /(截止|到期|过期|逾期|期限|期日|締め切り|deadline|\bdue\b|overdue)/iu,
  lastInteraction: /(最久没|很久没|多久没|最近一次往来|最后一次联系|上次联系|しばらく連絡|連絡していない|最後に(?:連絡|話)|longest without|haven'?t talked|last (?:recorded )?interaction|gone the longest)/iu,
  plannedDate: /(计划日|计划在|予定日|planned (?:date|for))/iu,
  startsAt: /(开始时间|按时间|时间先后|时间顺序|先后顺序|開始時間|開始時刻|日付順|時間順|日時順|start time|starting time|by date|by time|soonest|earliest first|chronolog)/iu,
};

/** A field the model names to order by, kept only when the user's own words say it (AE-FN-005: "最值得去" is not "start time"). */
export function groundedField(field: RankField | undefined, words: string): RankField | null {
  if (!field) return null;
  return FIELD_WORDS[field].test(words) ? field : null;
}

/** A field the user's words name, with no help from the model. */
export function fieldSaidIn(words: string, domain: RankDomain): RankField | null {
  const order: RankField[] = domain === "contact" ? ["lastInteraction"] : domain === "event" ? ["startsAt"] : ["dueAt", "plannedDate"];
  return order.find((field) => FIELD_WORDS[field].test(words)) ?? null;
}

/** The direction the words ask for ("过期最久的排前面" / "oldest first" → asc; "最新" / "latest first" → desc). */
export function directionSaidIn(words: string, fallback: "asc" | "desc"): "asc" | "desc" {
  if (/(最久|最早|最远|从早到晚|由早到晚|从远到近|oldest|earliest|longest|古い順|早い順)/iu.test(words)) return "asc";
  if (/(最新|最近的?(?!一次往来)|从晚到早|由近到远|latest|newest|most recent|新しい順|遅い順)/iu.test(words)) return "desc";
  return fallback;
}

/** The natural order of a domain (列出时的顺序): events by start, to-dos by due then planned, contacts by the last interaction. */
export function naturalField(domain: RankDomain): { field: RankField; direction: "asc" | "desc" } {
  if (domain === "todo") return { direction: "asc", field: "dueAt" };
  if (domain === "contact") return { direction: "desc", field: "lastInteraction" };
  return { direction: "asc", field: "startsAt" };
}

/** Whether the domain registers history signals the code can compute from the user's own records. */
export function hasHistorySignals(domain: RankDomain): boolean {
  return domain === "contact" || domain === "todo";
}

/* ── memory (read only until AG14) ─────────────────────────────────── */

export interface SavedMemory {
  id: string;
  category: string;
  content: string;
}

const DOMAIN_WORDS: Record<RankDomain, RegExp> = {
  contact: /(联系人|人脉|跟进|連絡先|contacts?|people|follow[\s-]?up)/iu,
  event: /(活动|活動|イベント|展|讲座|研讨会|events?|meetups?)/iu,
  todo: /(待办|代办|任务|タスク|ToDo|to-?dos?|tasks?)/iu,
};

/**
 * The saved preferences and constraints that point at this domain (PLANNER 易错边界 2): only `preference` and
 * `constraint`, chosen by code from whether the content names the domain ("推荐活动时优先周末上午"). A constraint is a hard
 * condition; a preference only ranks.
 */
export function memoriesFor(domain: RankDomain, memories: readonly SavedMemory[]): { memory: SavedMemory; time: TimePreference | null; topic: string | null }[] {
  return memories
    .filter((memory) => (memory.category === "preference" || memory.category === "constraint") && DOMAIN_WORDS[domain].test(memory.content))
    .map((memory) => {
      const time = timePreferenceIn(memory.content, "memory");
      const constrained = time && memory.category === "constraint" ? { ...time, hard: true } : time;
      return { memory, time: constrained, topic: constrained ? null : topicWordsOf(memory.content.replace(DOMAIN_WORDS[domain], " ")) || null };
    });
}

/* ── AG19-6: "最近有哪些活动" ───────────────────────────────────────── */

const UPCOMING_WORDS = /(最近|近期|近来|接下来|这段时间|这阵子|这几天|今后|未来|之后|upcoming|coming up|these days|\bsoon\b|\bnext few\b|\bnext\b|近いうち|今後|これから|この先|直近|最近)/iu;
const PAST_WORDS = /(上周|上个星期|上个月|上月|去年|昨天|前天|前几天|过去|之前|以前|去过|参加过|办过|已经结束|结束了|last (?:week|month|year)|yesterday|\bpast\b|\bago\b|\bwent\b|\battended\b|\bbeen to\b|先週|先月|去年|昨日|過去|以前|行った|参加した|終わった)/iu;

/**
 * AG19-6 (the user, 2026-11-19: "最近有哪些活动适合我" listed three events that had already taken place): "最近", "近期",
 * "接下来" about events, with no past period said, ask for the ones that have not started yet — the nearest first. A past
 * period in the words ("上个月", "去过", "last month") keeps the question about the past. Code's rule; no model decides it.
 */
export function asksUpcomingEvents(words: string): boolean {
  return UPCOMING_WORDS.test(words) && !PAST_WORDS.test(words);
}

/** Words of "最近有哪些活动适合我" that name no topic: when, which ones, and "for me". */
const NO_TOPIC_WORDS = /(最近|近期|近来|接下来|这段时间|这阵子|这几天|今后|未来|之后|哪些|哪几|什么|有没有|有啥|适合我|合适我|对我来说|对我|值得去|值得参加|可以参加|能参加|可以去|能去|推荐|活动|活動|イベント|upcoming|coming up|these days|\bsoon\b|\bnext few\b|\bnext\b|\bany\b|\bwhat\b|\bwhich\b|\bare there\b|\bthat\b|\bsuits?\b|\bsuitable\b|\bfor me\b|\bme\b|\bevents?\b|近いうち|今後|これから|この先|直近|どんな|どの|私に合う|私に向いている|おすすめ|ありますか)/giu;

/**
 * AG19-6: what is left of "最近有哪些…活动…" as a topic once the words for when, which and "for me" are taken out
 * ("最近有哪些摄影活动" → 摄影; "最近有哪些活动适合我" → nothing: a plain list of what is coming up, not a topic ranking).
 */
export function upcomingTopicOf(words: string): string {
  return topicWordsOf(words).replace(NO_TOPIC_WORDS, " ").replace(/[的吗嘛啊呀呢吧はでがをにのか\s?？。、，,]+/gu, " ").trim();
}

/* ── AG19 repair round 1 (coordinator's decision 3) ─────────────────── */

/** Asking which events there are, or to have some recommended or listed. */
// AG21a (decision 2): 「帮我找…活动」, "find events", 「イベントを探して」 ask for events to go to as well.
const EVENT_LIST_WORDS = /(哪些|哪几|哪场|有什么|有没有|有啥|推荐|值得|适合|列出|列一下|都列|帮我找|找找|\bfind\b|探して|\bwhat\b|\bwhich\b|\bany\b|\brecommend|\bsuggest|\bworth\b|\blist\b|おすすめ|どんな|どの|ありますか|教えて)/iu;
/** A calendar date written out ("11月10日", "2026-11-10", "Nov 10"). */
const WRITTEN_DATE = /(\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|\d{4}-\d{2}-\d{2}|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}\b)/iu;

/** The words point at the past ("去过", "之前", "上个月", "last month"). */
export function pointsAtPast(words: string): boolean {
  return PAST_WORDS.test(words);
}

/** The words write out a calendar date (a range the first layer gives is then the user's own, also when it has passed). */
export function writesADate(words: string): boolean {
  return WRITTEN_DATE.test(words);
}

/**
 * Coordinator's decision 3 (2026-11-20): any request to recommend or list events to go to, with no expression pointing
 * at the past, reads only events that have not started, the nearest first — with or without "最近". Past events appear
 * only when the user points at the past (去过、之前、上个月、a past date). Code's rule.
 */
export function asksEventsToGoTo(words: string): boolean {
  return (UPCOMING_WORDS.test(words) || EVENT_LIST_WORDS.test(words)) && !PAST_WORDS.test(words);
}

/* ── AG21a (R32, coordinator's decision 1) ─────────────────────────── */

/**
 * AG21a (coordinator's decision 1, R32): wording that asks what is worth going to or suits the user — a recommendation, so
 * saved preferences apply when the user gives no standard of their own. Decided from the user's words, whatever the first
 * layer tagged.
 */
const RECOMMEND_WORDS = /(推荐|值得|适合我|合适我|适合自己|对我来说|可以去|可以看|可以参加|能去|去哪|おすすめ|オススメ|私に合う|自分に合う|私に向いている|行ける|行けそう|行く価値|\bfor me\b|\bsuits? me\b|\bworth (?:going|attending|it|seeing)\b|\brecommend|\bshould I (?:go|attend)\b)/iu;
export function asksForRecommendation(words: string): boolean {
  return RECOMMEND_WORDS.test(words);
}

/**
 * AG21a (R32c): 「这次晚上的也算上」, 「今回は夜のも含めて」, "include evening ones this time" lift a saved rule for this turn only;
 * they state no new preference and no topic. Returns the clause and the words lifted ("晚上的"), or null.
 */
const LIFT = /(也加上|也加进来|也算上|也算进来|也算进去|也包括进来|也包括|也放进来|也列进来|也列上|也可以|也行|也没关系|も含めて|も入れて|もOK|もいい|\binclude\b.{0,40}\b(?:too|as well|this time)\b|\b(?:are|is) (?:fine|ok|okay) (?:too|this time)\b)/iu;
const LIFT_WORDS = /(也加上|也加进来|也算上|也算进来|也算进去|也包括进来|也包括|也放进来|也列进来|也列上|也可以|也行|也没关系|这次|这回|本次|今回は?|も含めて|も入れて|もOK|もいい|\binclude\b|\btoo\b|\bas well\b|\bthis time\b|\b(?:are|is) (?:fine|ok|okay)\b)/giu;
export function liftedIn(words: string): { clause: string; words: string } | null {
  for (const clause of words.split(/[，,。；;！!？?]/u)) {
    if (!LIFT.test(clause)) continue;
    const lifted = clause.replace(LIFT_WORDS, " ").replace(/\s+/gu, " ").trim();
    return { clause: clause.trim(), words: lifted };
  }
  return null;
}
