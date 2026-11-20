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

export type RankDomain = "event" | "contact" | "todo";
export type BasisSource = "turn" | "session_goal" | "memory" | "history" | "natural";

/** A preference or constraint on when an event is: days of the week and the part of the day. */
export interface TimePreference {
  days?: "weekend" | "weekday";
  part?: "morning" | "afternoon" | "evening";
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
export const FOLLOW_UP_WORDS = /(跟进|该联系|要联系|联系谁|回访|催一下|follow[\s-]?up|reach out|get back to|フォロー|連絡すべき|連絡する人)/iu;
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

const WEEKEND = /(周末|週末|礼拜六日|土日|土曜|日曜|weekend|saturday|sunday)/iu;
const WEEKDAY = /(工作日|平日|weekday)/iu;
const MORNING = /(上午|早上|早晨|午前|朝|morning)/iu;
const AFTERNOON = /(下午|午後|afternoon)/iu;
const EVENING = /(晚上|夜里|夜间|夜晚|夕方|夜の(?:時間|イベント|部)|夜は|夜に|夜間|\bevenings?\b|\bnights?\b)/iu;
const EXCLUDE = /(不要|别|不想|除了|排除|避开|以外|は除いて|じゃない|ではない|\bnot\b|\bno\b|\bavoid\b|\bexcept\b|\bwithout\b)/iu;
const ONLY = /(只要|只看|只选|只挑|仅|限|だけ|のみ|限定|\bonly\b)/iu;

/** A time preference in some words ("优先周末上午", "不要晚上的活动", "weekend mornings only"); null when they name none. */
export function timePreferenceIn(said: string, source: "turn" | "memory"): TimePreference | null {
  // Record names chosen with @ ("@设计师之夜") are not time words.
  const words = said.replace(/@\S+/gu, " ");
  const days = WEEKEND.test(words) ? "weekend" : WEEKDAY.test(words) ? "weekday" : undefined;
  const part = MORNING.test(words) ? "morning" : AFTERNOON.test(words) ? "afternoon" : EVENING.test(words) ? "evening" : undefined;
  if (!days && !part) return null;
  const exclude = EXCLUDE.test(words);
  return { exclude, hard: exclude || ONLY.test(words), source, words: words.trim(), ...(days ? { days } : {}), ...(part ? { part } : {}) };
}

/** The clause of the words that holds the time preference (between punctuation), for the lead. */
export function timeClauseOf(words: string): string | null {
  for (const clause of words.split(/[，,。；;、]/u)) if (timePreferenceIn(clause, "turn")) return clause.trim();
  return null;
}

/** Whether an event at this instant (in the time zone) meets the preference's days and part of the day. */
export function meetsTime(preference: Pick<TimePreference, "days" | "part">, startsAt: string, timeZone: string): boolean {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hourCycle: "h23", timeZone, weekday: "short" }).formatToParts(new Date(startsAt)).map((part) => [part.type, part.value]));
  const weekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const hour = Number(parts.hour);
  if (preference.days === "weekend" && !weekend) return false;
  if (preference.days === "weekday" && weekend) return false;
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
const EVENT_LIST_WORDS = /(哪些|哪几|哪场|有什么|有没有|有啥|推荐|值得|适合|列出|列一下|都列|\bwhat\b|\bwhich\b|\bany\b|\brecommend|\bsuggest|\bworth\b|\blist\b|おすすめ|どんな|どの|ありますか|教えて)/iu;
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
