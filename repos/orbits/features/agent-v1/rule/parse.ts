/**
 * Reading a scheduled task out of the user's words, in code (agent-design AG15; 设计稿 §5.3, PLANNER 易错边界 1).
 *
 * The model only points at the words (rule/prompt.ts); what they mean for the rule is decided here: the schedule
 * (weekly or daily, the weekday, the hour), the last day it should run, whether a push was asked for, what it picks
 * from (which records, which window, which industry, how long without contact) and whether it re-plans overdue to-dos.
 * Words code cannot read give null — the caller then falls back to the model's structured value where one is allowed,
 * or asks. Chinese, English and Japanese.
 */
import type { AgentRuleScope } from "../../agent/automations/contract";
import type { RuleSchedule } from "../domains/rule/ops";

const CJK_NUMBER: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const CJK_DAY: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const EN_DAY: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const EN_MONTH = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

const pad = (value: number) => String(value).padStart(2, "0");

/** The recurrence the words name: weekly on some days, or daily. Null: none said. */
export function recurrenceSaidIn(words: string): { kind: "daily" } | { kind: "weekly"; daysOfWeek: number[] } | null {
  const text = words.toLowerCase();
  if (/(每个?工作日|平日は?毎日|every weekday|on weekdays|each weekday)/u.test(text)) return { daysOfWeek: [1, 2, 3, 4, 5], kind: "weekly" };
  const days = new Set<number>();
  for (const match of text.matchAll(/每(?:个)?(?:周|星期|礼拜)\s*([一二三四五六日天])((?:\s*[、,，和及]\s*(?:周|星期|礼拜)?[一二三四五六日天])*)/gu)) {
    days.add(CJK_DAY[match[1]]);
    for (const more of match[2].matchAll(/[一二三四五六日天]/gu)) days.add(CJK_DAY[more[0]]);
  }
  for (const match of text.matchAll(/毎週\s*の?\s*([月火水木金土日])(?:曜日?)?((?:\s*[・、と]\s*[月火水木金土日](?:曜日?)?)*)/gu)) {
    days.add(CJK_DAY[match[1]]);
    for (const more of match[2].matchAll(/[月火水木金土日](?=曜|[・、と]|$|\s|の)/gu)) days.add(CJK_DAY[more[0]]);
  }
  for (const match of text.matchAll(/\b(?:every|each|on)\s+((?:(?:sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)(?:day)?s?(?:\s*(?:,|and|&)\s*)?)+)/gu)) {
    for (const day of match[1].matchAll(/\b(sun|mon|tue|wed|thu|fri|sat)/gu)) days.add(EN_DAY[day[1]]);
  }
  for (const match of text.matchAll(/\b(sun|mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?)days\b/gu)) days.add(EN_DAY[match[1].slice(0, 3)]);
  if (days.size) return { daysOfWeek: [...days].sort((left, right) => left - right), kind: "weekly" };
  if (/(每天|每日|天天|每晚|每早|毎日|毎朝|毎晩|\bevery\s*day\b|\bdaily\b|\beach day\b|\bevery (?:morning|evening|night)\b)/u.test(text)) return { kind: "daily" };
  return null;
}

/** The time of day the words name, as HH:mm. Null: none said. */
export function timeSaidIn(words: string): string | null {
  const text = words.toLowerCase();
  const fix = (hour: number, minute: number, later: boolean, earlier: boolean): string | null => {
    let value = hour;
    if (later && value < 12) value += 12;
    if (earlier && value === 12) value = 0;
    return value >= 0 && value <= 23 && minute >= 0 && minute <= 59 ? `${pad(value)}:${pad(minute)}` : null;
  };
  // 上午九点半, 下午3点15分, 晚上8点, 9点, 朝9時, 午後3時半, 18時30分
  const cjk = text.match(/(上午|早上|早晨|清晨|中午|下午|傍晚|晚上|夜里|午前|午後|朝|夕方|夜)?\s*の?\s*(\d{1,2}|十[一二]?|[一二两三四五六七八九])\s*(?:点|點|时|時)\s*(半|(\d{1,2})\s*分?)?/u);
  if (cjk) {
    const hour = /^\d/u.test(cjk[2]) ? Number(cjk[2]) : CJK_NUMBER[cjk[2]];
    const minute = cjk[3] === "半" ? 30 : cjk[4] ? Number(cjk[4]) : 0;
    const later = /下午|傍晚|晚上|夜里|午後|夕方|夜/u.test(cjk[1] ?? "");
    return fix(hour, minute, later, false);
  }
  const colon = text.match(/(上午|早上|下午|晚上|午前|午後|朝|夜)?\s*(\d{1,2})\s*[:：]\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/u);
  if (colon) return fix(Number(colon[2]), Number(colon[3]), /下午|晚上|午後|夜|p/u.test(`${colon[1] ?? ""}${colon[4] ?? ""}`), /^a/u.test(colon[4] ?? "") );
  const meridiem = text.match(/\b(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/u);
  if (meridiem) return fix(Number(meridiem[1]), 0, meridiem[2].startsWith("p"), meridiem[2].startsWith("a"));
  const at = text.match(/\bat\s+(\d{1,2})\b(?!\s*(?:events?|items?|contacts?|people))(?:\s*(?:o'?clock))?(?:\s+in the\s+(morning|afternoon|evening))?/u);
  if (at) return fix(Number(at[1]), 0, at[2] === "afternoon" || at[2] === "evening", false);
  if (/\bnoon\b|正午|中午十二点/u.test(text)) return "12:00";
  return null;
}

/** Weekly or daily at a time, in the user's time zone. Null when the words name no recurrence. */
export function scheduleSaidIn(words: string, timeZone: string, defaultTime: string | null = null): RuleSchedule | null {
  const recurrence = recurrenceSaidIn(words);
  if (!recurrence) return null;
  const time = timeSaidIn(words) ?? defaultTime;
  if (!time) return null;
  return recurrence.kind === "daily" ? { kind: "daily", time, timeZone } : { daysOfWeek: recurrence.daysOfWeek, kind: "weekly", time, timeZone };
}

const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The last day the words say the task should run on ("先跑到 11 月底", "through the end of November", "11月末まで",
 * "到 12 月 15 日为止"), as YYYY-MM-DD. A month already past in this year means next year's. Null: no end said.
 */
export function untilSaidIn(words: string, today: string): string | null {
  const text = words.toLowerCase();
  const [year, month] = today.split("-").map(Number);
  const yearOf = (target: number) => (target < month ? year + 1 : year);
  const endOf = (target: number) => `${yearOf(target)}-${pad(target)}-${pad(lastDayOfMonth(yearOf(target), target))}`;
  const dayOf = (target: number, day: number) => `${yearOf(target)}-${pad(target)}-${pad(day)}`;
  let match = text.match(/(?:到|至|直到|截至|截止到?|跑到|持续到|做到|运行到|执行到)\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/u) ?? text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]\s*(?:为止|截止|结束|まで)/u);
  if (match) return dayOf(Number(match[1]), Number(match[2]));
  match = text.match(/(\d{1,2})\s*月\s*(?:底|末|いっぱい)/u);
  if (match) return endOf(Number(match[1]));
  if (/(这个月底|本月底|月底|今月末|今月いっぱい|end of (?:the|this) month)/u.test(text)) return endOf(month);
  if (/(年底|今年底|年末|end of (?:the|this) year)/u.test(text)) return `${year}-12-31`;
  // AG21c (decision D4): "for a week", "到下周", "1週間", "until next week" end at the end of the seventh calendar day after
  // today in the user's time zone (the last valid day, inclusive) — never at the same minute seven days later.
  // A week that names what is looked at ("未来一周的活动", "1週間以内", "events in the next 7 days") is the scope, not this.
  if (/((?<![未来接下这本每近])(?:一周|一个星期|一星期|一个礼拜|七天|7\s*天)(?![的内以之没]|\s*(?:以前|之前|前))|(?:到|至|直到|跑到)\s*下(?:周|个星期|星期|礼拜)(?:为止)?(?![的])|下(?:周|个星期)为止|(?:一週間|1\s*週間|7\s*日間)(?![のい以内])|来週まで|\bfor (?:a|one|1) week\b|\bfor (?:7|seven) days\b|\b(?:until|till|through) next week\b)/u.test(text)) {
    const [y, m, d] = today.split("-").map(Number);
    const end = new Date(Date.UTC(y, m - 1, d + 7));
    return `${end.getUTCFullYear()}-${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
  }
  match = text.match(/\b(?:through|until|till|thru|up to)\s+(?:the\s+)?(?:end of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?/u)
    ?? text.match(/\bend of\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/u);
  if (match) {
    const target = EN_MONTH.indexOf(match[1]) + 1;
    return match[2] ? dayOf(target, Number(match[2])) : endOf(target);
  }
  return null;
}

/** Whether a push was asked for: false ("不用推送", "inbox only", "受信箱だけ"), true, or null when nothing was said. */
export function pushSaidIn(words: string): boolean | null {
  const text = words.toLowerCase();
  if (/(不用推送|不要推送|别推送|不推送|无需推送|不必推送|不用提醒|不用通知|收件箱就行|收件箱就好|只放收件箱|no push|without (?:a )?push|don'?t push|not? push|inbox only|only (?:in|to) (?:the |my )?(?:in-app )?inbox|プッシュ(?:通知)?は?(?:不要|いら|なし)|受信箱だけ|受信箱のみ|通知は(?:不要|いら))/u.test(text)) return false;
  if (/(推送|\bpush\b|プッシュ)/u.test(text)) return true;
  return null;
}

const CONTACT_WORDS = /(联系人|候选人|人脉|客户|連絡先|候補者|\bcontacts?\b|\bcandidates?\b|\bpeople\b)/iu;
const EVENT_WORDS = /(活动|展|讲座|市集|工作坊|イベント|セミナー|展示|\bevents?\b|\bmeetups?\b|\bexhibitions?\b)/iu;
const TODO_WORDS = /(待办|任务|タスク|ToDo|\bto-?dos?\b|\btasks?\b)/iu;
/** Moving to-dos past their planned day to the day of the run. */
const REPLAN_WORDS = /(过了计划日|过期|逾期|没完成|未完成|予定日を過ぎ|期限切れ|overdue|past (?:their|its|the) planned)/iu;
const MOVE_WORDS = /(改到|挪到|移到|推到|调到|に変更|に移|move|reschedule|re-?plan)/iu;

export type RuleDomain = AgentRuleScope["domain"];

/** Which records the words pick from; null when they name none. */
export function domainSaidIn(words: string): RuleDomain | null {
  if (TODO_WORDS.test(words) && REPLAN_WORDS.test(words)) return "todo";
  if (CONTACT_WORDS.test(words)) return "contact";
  if (EVENT_WORDS.test(words)) return "event";
  if (TODO_WORDS.test(words)) return "todo";
  return null;
}

export const replanSaidIn = (words: string) => TODO_WORDS.test(words) && REPLAN_WORDS.test(words) && MOVE_WORDS.test(words);

const WEEKEND = /(周末|週末|周六.{0,3}周日|星期六.{0,3}星期日|土日|weekend|saturday (?:and|or|&) sunday)/iu;
const MONTH_WINDOW = /(本月|这个月|当月|月内|今月|this month)/iu;
const WEEK_WINDOW = /(本周|这周|这一周|下周|未来一周|今週|来週|this week|next week|coming week|next 7 days)/iu;
const SCOPE_FILLER = /(每(?:个)?(?:周|星期|礼拜)[一二三四五六日天]|每天|每日|本月|这个月|当月|本周|这周|周末|週末|留意|关注|看看|有什么|给我|帮我|挑|选|推荐|[一二两三四五六七八九十\d]+\s*(?:场|个|条)|的)/gu;

/**
 * The scope the words name, read by code. `dictionaries` are the industries and places the contact read knows.
 * Null when the domain cannot be told.
 */
export function scopeSaidIn(words: string, dictionaries: { industries: Readonly<Record<string, readonly string[]>>; places: Readonly<Record<string, readonly string[]>> }, domain: RuleDomain | null = domainSaidIn(words)): AgentRuleScope | null {
  if (!domain) return null;
  const text = words.toLowerCase();
  if (domain === "todo") return { domain: "todo", filter: "past_planned" };
  if (domain === "contact") {
    const said = (word: string) => (/^[a-z]+$/u.test(word) ? new RegExp(`\\b${word}\\b`, "u").test(text) : text.includes(word.toLowerCase()));
    const industries = Object.entries(dictionaries.industries).filter(([name, others]) => said(name) || others.some(said)).map(([name]) => name);
    const places = Object.entries(dictionaries.places).filter(([name, others]) => said(name) || others.some(said)).map(([name]) => name);
    const quiet = text.match(/(\d{1,3})\s*天\s*(?:以前|之前|以上|没|未|内没)/u) ?? text.match(/(?:more than|over|at least|in)\s+(\d{1,3})\s+days/u) ?? text.match(/(\d{1,3})\s*日\s*(?:以上|間)/u);
    return { domain: "contact", ...(industries.length ? { industries } : {}), ...(places.length ? { places } : {}), ...(quiet ? { quietDays: Number(quiet[1]) } : {}) };
  }
  const window = WEEKEND.test(words) ? "weekend" : MONTH_WINDOW.test(words) ? "month" : WEEK_WINDOW.test(words) ? "week" : "week";
  // "摄影主题的活动", "主题含摄影", "photography-themed events", "写真がテーマのイベント"
  const stripped = words.replace(SCOPE_FILLER, " ");
  const topic = stripped.match(/主题(?:含|是|为|包含)\s*([^\s，。、的]{1,12})/u)?.[1]
    ?? stripped.match(/([^\s，。、的]{1,12}?)\s*主题/u)?.[1]
    ?? words.match(/([^\s、。]{1,12}?)\s*(?:が|を)?テーマ/u)?.[1]
    ?? words.match(/\b([a-z][a-z-]{2,20})[- ]themed\b/iu)?.[1]
    ?? null;
  return { domain: "event", window, ...(topic?.trim() ? { topics: [topic.trim()] } : {}) };
}

/** Words that only name a window or the records in general: not something to pick by. */
export const SCOPE_ONLY_WORDS = /(周末|週末|weekend|本月|这个月|今月|this month|本周|这周|今週|this week|那个|その|\bthat\b|\bthose\b|\bhappening\b|开始的?|始まる)/giu;

/** The words that ask to pause, resume or remove a task (the verb decides which; the model names the task). */
export function stateVerbSaidIn(words: string): "pause" | "resume" | "cancel" | null {
  if (/(恢复|继续运行|重新开启|重新启用|再開|\bresume\b|\bturn (?:it )?back on\b|\bre-?enable\b|\bunpause\b)/iu.test(words)) return "resume";
  if (/(暂停|先停|停掉|停用|停一下|停止|一時停止|止めて|\bpause\b|\bstop\b|\bturn (?:it )?off\b|\bdisable\b)/iu.test(words)) return "pause";
  if (/(删掉|删除|取消|不要了|削除|やめる|キャンセル|\bdelete\b|\bremove\b|\bcancel\b)/iu.test(words)) return "cancel";
  return null;
}

/**
 * Words that only add to a scheduled task said in the same message — how it tells the user, until when it runs
 * ("结果放站内收件箱就行，不用推送，先跑到 11 月底", "In-app inbox only, no push.", "11月末まで続けて").
 */
export const RULE_QUALIFIER = /(收件箱|推送|跑到|运行到|持续到|为止|月底|年底|\binbox\b|\bpush\b|\bkeep it running\b|\bthrough the end\b|\buntil\b|受信箱|プッシュ|まで続けて|まで実行)/iu;

/** Words that name a scheduled task as such ("这条定时任务", "the scheduled task", "定期タスク"). */
export const RULE_NOUN = /(定时任务|定期任务|定时规则|自动任务|这条任务|这个任务|定期タスク|定期チェック|スケジュール(?:タスク|ルール)|\bscheduled (?:task|rule|check)s?\b|\brecurring (?:task|check)s?\b|\bautomations?\b)/iu;

/** Words that ask Orbit to tell or pick something for the user again and again (with a recurrence: a scheduled task). */
export const RECURRING_ASK = /(挑|选|推荐|告诉我|发给我|提醒我|通知我|留意|看看|汇总|整理|知らせ|教えて|選んで|送って|まとめて|\bsend me\b|\blet me know\b|\bpick\b|\btell me\b|\bcheck\b|\bremind me\b|\bshow me\b)/iu;

/**
 * AG21a (coordinator's decision 2): a message that asks to find something now and to keep looking ("先帮我找摄影活动，再一直
 * 帮我留意新的", "find photo events and keep watching for new ones", "まず探して、これからもチェックして") gets both — the
 * search answered now, and the ongoing part on the scheduled-task path (its card, or its question for when to run).
 * Returns where the ongoing words start (their clause, or the joiner before them), or null: no find-now, no ongoing words,
 * or the keep-looking is a condition on finding nothing ("没有合适的就一直找下去，找到我满意为止" stays AG03's offer of a
 * bounded alternative).
 */
const KEEP_LOOKING = /(一直(?:帮我|替我)?(?:找|留意|盯着|关注|看着|追踪)|持续(?:帮我|替我)?(?:找|留意|关注|盯着|追踪)|继续(?:帮我|替我)?(?:留意|关注|盯着)|以后也(?:帮我|替我)?(?:找|留意|关注|盯着)|长期(?:帮我|替我)?(?:留意|关注)|\bkeep (?:looking|watching|searching|checking|an eye (?:out|on))\b|\bkeep me posted\b|ずっと(?:探して|見て|チェックして|追って)|引き続き(?:探して|チェックして|見て)|これからも(?:探して|チェックして|見て|追って))/iu;
const FIND_NOW = /(找|查|看看|列|推荐|挑|\bfind\b|\blook (?:up|for)\b|\bsearch\b|\bshow\b|\blist\b|探して|調べて|見せて|教えて|挙げて)/iu;
const ONLY_IF_NONE = /(没有合适的?就|没合适的?就|找不到就|没找到就|如果没有|要是没有|直到|为止|满意|\bif (?:there(?:'s| is| are) )?(?:none|nothing)\b|\buntil I(?:'m| am)? ?(?:satisfied|happy)\b|見つからなければ|なかったら|なければ|満足するまで)/iu;
const ONGOING_JOINER = /(再|然后|并且|同时|之后|以后|\band then\b|\band\b|それから|その後|そして)\s*$/iu;

export function keepsLookingAt(quote: string): number | null {
  const match = KEEP_LOOKING.exec(quote);
  if (!match || ONLY_IF_NONE.test(quote)) return null;
  const before = quote.slice(0, match.index);
  if (!FIND_NOW.test(before)) return null;
  const clause = Math.max(...["，", ",", "。", "；", ";", "、"].map((mark) => before.lastIndexOf(mark)));
  const tail = before.slice(clause + 1);
  const joiner = ONGOING_JOINER.exec(tail);
  const start = joiner ? clause + 1 + joiner.index : clause >= 0 ? clause + 1 : match.index;
  return quote.slice(0, start).replace(/[\s，,。；;、]+$/u, "").trim() ? start : null;
}

/** AG21a (decision 2): the words ask to keep looking (not only on finding nothing): the scheduled-task path. */
export function keepsLookingIn(quote: string): boolean {
  return KEEP_LOOKING.test(quote) && !ONLY_IF_NONE.test(quote);
}
