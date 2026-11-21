/**
 * agent-design AG13 (设计稿 §4 活动, 附录 B, 附录 E; PLANNER 易错边界 1–5): the second layer's event, «我去过», schedule
 * and to-do-link intents → card items, by code only. Events are found among those the account may see (platform events
 * that are published, and its own private events), schedule items and to-dos among its own; nothing the model wrote
 * widens the scope. Dates and times are worked out from the words with asOf and the time zone.
 *
 * - A platform event and the organizer's check-ins and registrations are never changed: a request for that is code's
 *   sentence, no card (AE-EVT-004). «我去过» is the user's own note, never a check-in.
 * - «我去过» on a private event the same card creates points at it (`localCreateRef`), and waits for it.
 * - A repeating schedule item: "只改这一次" changes this time only; "整个系列" the series. Without either word, a day
 *   named means this time, none means the series. Repetitions the product cannot store ("隔周", "每月第二个周二", "共
 *   几次") are said so, with a few one-off dates offered instead; no card until the user accepts (AE-EVT-007).
 * - Deleting a private event that something links to: the links are listed and the user picks what to do (D7), in this
 *   message's words or with a click; then one card — unlink or delete each, the event last (AE-EVT-008).
 */
import { emitTrace } from "../observability/trace";
import { dayText } from "../../agent/runtime/todo-operations";
import type { CardOperationIntent } from "../../agent/runtime/card-operations";
import type { DomainScope, RecordView } from "../domains/types";
import { occurrenceIn } from "../domains/schedule/read";
import type { GraphPart } from "../graph/state";
import { isPronounClue } from "../route/decide";
import { EVENT_WORDS } from "./events-copy";
import { instantOf, localDayOf, localTimeOf, resolveSaidDate } from "./dates";
import { dayPartsOf, durationPhraseOf, onlyStartSaid, resolveSaidTimes, timeZonePhraseOf, titleWithoutWhen } from "./times";
import type { PartWrite, ResolveContext, WriteOutcome } from "./resolve";
import type { StoredIntent } from "./schema";
import { askedPerson } from "./asked";
import { todosByMeaning } from "./meaning";
import { findRecord, finderMode, finderSessionOf, type Found } from "../finder/session";
import { ACCOUNT, labIdOf, type AgentKind } from "../finder/world";
import type { Verb, World } from "../finder/types";
import { findEvents as findLabEvents } from "../finder/impl/finders";
import { decide as decideEvents } from "../finder/impl/decide";

export const EVENT_INTENT_CAPABILITIES = new Set(["privateEvent.create", "privateEvent.update", "privateEvent.delete", "attendance.create", "attendance.delete", "schedule.create", "schedule.update", "schedule.delete", "todo.complete", "todo.reopen", "todo.delete", "memo.update"]);

/** The extra the propose node gives the AG13 resolver (all in this request). */
export interface EventResolveExtras {
  /** run.names: names of records this request bound (so the next turn's "这场活动" finds it). */
  names?: Map<string, string>;
  /** Private events created by this request's items, by the model's localId. */
  createdEvents?: { localId: string; title: string; day: string; time?: string }[];
  /** A private event is being deleted in this request: its attendance, memo and to-do unlinks are part of that plan. */
  deleting?: boolean;
  /** The to-do this message named last, and its link item (a later sentence of the message adds to the same item). */
  lastTodo?: { id: string };
  linkOps?: Map<string, { set: Record<string, unknown>; before: Record<string, unknown>; shown: Record<string, unknown> }>;
  /** AG14 (AG11 交接): ids of the events the user picked with @ in this turn that can be opened now. */
  pickedEvents?: readonly string[];
}

type Ctx = ResolveContext & EventResolveExtras;

const words = (message: string, span: [number, number] | null | undefined) => (span ? message.slice(span[0], span[1]).trim() : "");

/** The clause of the message a span sits in (between sentence or clause marks), for a day said next to a name. */
export function clauseAround(message: string, span: [number, number]): string {
  const marks = /[，,。；;！!？?\n]/u;
  let start = span[0];
  while (start > 0 && !marks.test(message[start - 1])) start -= 1;
  let end = span[1];
  while (end < message.length && !marks.test(message[end])) end += 1;
  return message.slice(start, end);
}

/** True for an intent this module resolves: the AG13 verbs, and a to-do update that links people or events. */
export function isEventIntent(intent: StoredIntent, quote: string): boolean {
  if (EVENT_INTENT_CAPABILITIES.has(intent.capability)) return true;
  if (intent.capability !== "todo.update") return false;
  if (intent.events?.length) return true;
  return !intent.title && !intent.date && LINK_WORDS.test(quote);
}

const LINK_WORDS = /(关联|關聯|紐づけ|紐付け|ひも付け|\blink\b|\blinked\b|\battach\b)/iu;
const UNLINK_WORDS = /(解除|取消关联|不再关联|去掉关联|只解除|留着|保留|外す|外して|\bunlink\b|\bkeep\b|\bdetach\b)/iu;
export const CHECKIN = /(签到|簽到|补签|扫码|打卡|チェックイン|\bcheck[- ]?in\b|\bchecked in\b)/iu;
const THIS_TIME = /(只改这一次|只改这次|仅本次|只这一次|就这一次|这一次|今回だけ|この回だけ|今回のみ|\bonly this (?:time|once|one)\b|\bjust this (?:time|once|one)\b|\bthis occurrence\b)/iu;
const SERIES = /(整个系列|整個系列|全部都|以后都|以后的都|从此|往后都|每次都|每周都|ずっと|シリーズ全体|全ての回|毎回|\bwhole series\b|\ball of them\b|\bfrom now on\b|\bgoing forward\b|\bevery week\b)/iu;
/** AG20a R1: the same words, for a message that switches a waiting card between this time and the series. */
export const THIS_TIME_WORDS = THIS_TIME;
export const SERIES_WORDS = SERIES;
/** "今回だけじゃなくて", "不是只改这一次", "not just this time": the series, said in the negative. */
const NOT_ONLY_THIS = /(今回だけ(?:じゃなく|ではなく)|不是只改这一?次|不只这一?次|\bnot (?:just|only) this (?:time|once|one)\b)/iu;
export const NOT_ONLY_THIS_WORDS = NOT_ONLY_THIS;
/** Words of when ("明天的", "11 月 19 日那场", "next Monday's") are not part of a record's name. */
const WHEN_WORDS = /(今天|明天|后天|昨天|前天|今晚|昨晚|明晚|今日|明日|昨日|明後日|下周[一二三四五六日天]?|这周[一二三四五六日天]?|本周[一二三四五六日天]?|周[一二三四五六日天]|星期[一二三四五六日天]|\d{1,2}\s*月\s*\d{1,2}\s*[日号]?|[月火水木金土日]曜日?|\btoday'?s?\b|\btomorrow'?s?\b|\byesterday'?s?\b|\bnext (?:mon|tues|wednes|thurs|fri|satur|sun)day'?s?\b)(?:的|那场|那一场|の)?/giu;
export function withoutWhenWords(text: string): string {
  return text.replace(WHEN_WORDS, "").trim();
}

export const UNSUPPORTED_REPEAT = /(隔周|隔週|每两周|每隔一周|双周|隔一周|2週間ごと|隔週ごと|每月第\s*[一二三四五1-5]\s*个?\s*(?:周|星期|礼拜)[一二三四五六日天]|毎月第\s*[1-5一二三四五]\s*[月火水木金土日]曜|\bbi-?weekly\b|\bevery other week\b|\bevery two weeks\b|\b(?:first|second|third|fourth|last) (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday) of (?:each|every|the) month\b|共\s*\d+\s*次|\d+\s*回(?:まで|だけ)|\bfor \d+ (?:weeks|times|sessions)\b)/iu;
const REPEAT_WORDS = /(每天|每日|每周|每星期|每月|毎日|毎週|毎月|\bevery (?:day|week|month)\b|\bdaily\b|\bweekly\b|\bmonthly\b)/iu;
const ATTEND_DELETE = /(一起删|也删|一并删|删掉|删了|删除|一緒に削除|削除して|\bdelete\b|\bremove\b)/iu;
const ATTEND_MOVE = /(转到|移到|改到另一场|挪到|別のイベントに移|\bmove (?:it )?to\b)/iu;
const ATTEND_WORD = /(自述|我去过|去过|参会|参加记录|参加了的记录|行った|参加記録|\battendance\b|\bi went\b)/iu;

const NOISE = /[\s「」『』"“”'’()（）,，。.、!！?？:：·•@]|这场|那场|这次|那次|这个|那个|私人活动|私人|活动|日程|待办|代办|的|イベント|予定|タスク|\bthe\b|\bevent\b|\bmy\b/giu;
const squash = (text: string) => text.toLowerCase().replace(NOISE, "");

interface EventCandidate { ref: { kind: "platform" | "private"; id: string }; title: string; startsAt: string | null; endsAt?: string | null; /** AG20a: a private event said with a day only. */ allDay?: boolean }

async function eventCandidates(ctx: Ctx, hint?: { clues: readonly string[]; quote: string }): Promise<EventCandidate[]> {
  const out: EventCandidate[] = [];
  // AG14 (AG11 交接, AE-REF-005): the events the user picked with @ in this turn are looked at first. When the words
  // name one of them, only those are read — the whole directory is not listed to find an event already chosen.
  const picked = (ctx.pickedEvents ?? []).filter((id) => !id.startsWith("private_event:") && !id.startsWith("attendance:"));
  if (hint && picked.length && ctx.records?.eventsByIds) {
    const chosen: EventCandidate[] = [];
    for (const event of await ctx.records.eventsByIds(picked).catch(() => [])) {
      if (event.archivedAt || (event.lifecycleState !== "published" && event.organizerActorId !== ctx.scope?.accountId) || !event.title) continue;
      chosen.push({ ref: { id: event.eventId, kind: "platform" }, startsAt: event.startsAt ?? null, title: event.title });
    }
    if (matchEvents(chosen, hint.clues, hint.quote, null, ctx.timeZone).length) {
      emitTrace({ picked: chosen.length, type: "propose.picked_events_first" });
      return chosen;
    }
  }
  if (ctx.records?.listEvents) {
    for (const event of await ctx.records.listEvents().catch(() => [])) {
      if (event.archivedAt || (event.lifecycleState !== "published" && event.organizerActorId !== ctx.scope?.accountId) || !event.title) continue;
      out.push({ endsAt: event.endsAt ?? null, ref: { id: event.eventId, kind: "platform" }, startsAt: event.startsAt ?? null, title: event.title });
    }
  }
  if (ctx.records?.privateEvents && ctx.scope) {
    for (const event of await ctx.records.privateEvents.list(ctx.scope.accountId).catch(() => [])) out.push({ endsAt: event.endsAt ?? null, ref: { id: event.id, kind: "private" }, startsAt: event.startsAt, title: event.title, ...(event.allDay ? { allDay: true } : {}) });
  }
  return out;
}

/** AG20a R5/R14: words of having gone ("我去了", "去过", "行った", "I went"): the event is not in the future. */
export const WENT_WORDS = /(去了|去过|去過|参加了|参加过|参加過|到场了|行った|行きました|参加した|参加しました|\bi went\b|\bwent to\b|\battended\b|\bi was at\b)/iu;

const CJK_MONTH: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 十一: 11, 十二: 12 };
const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** AG20a R14: a month said without a day ("一月那场", "1月の", "the January one"); null when none, or a full date is said. */
export function monthSaid(text: string): number | null {
  if (/\d{1,2}\s*月\s*\d{1,2}\s*[日号]/u.test(text)) return null;
  const cjk = /(十[一二]?|[一二三四五六七八九]|1[0-2]|0?[1-9])\s*月(?:份)?(?![\d一二三四五六七八九十])/u.exec(text);
  if (cjk) return /^\d+$/u.test(cjk[1]) ? Number(cjk[1]) : CJK_MONTH[cjk[1]] ?? null;
  const lower = text.toLowerCase();
  const index = EN_MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b(?!\\s+\\d)`, "u").test(lower));
  return index >= 0 ? index + 1 : null;
}

/**
 * AG20a R14 (TP-EVT-002): between events that share a name, the month the user said and "我去了" (never an event still to
 * come) decide before any question. Each narrows only when something is left; with nothing left the question stays.
 */
function narrowByWhen(found: EventCandidate[], quote: string, ctx: { asOf: string; timeZone: string }): EventCandidate[] {
  if (found.length < 2) return found;
  let out = found;
  const month = monthSaid(quote);
  if (month !== null) {
    const inMonth = out.filter((event) => event.startsAt && Number(localDayOf(event.startsAt, ctx.timeZone).slice(5, 7)) === month);
    if (inMonth.length) out = inMonth;
  }
  if (out.length > 1 && WENT_WORDS.test(quote)) {
    const past = out.filter((event) => event.startsAt && Date.parse(event.startsAt) <= Date.parse(ctx.asOf));
    if (past.length) out = past;
  }
  return out;
}

/**
 * AG20a R5: "周六我去了…" said on a Wednesday is the Saturday that has passed, not the coming one. Only a bare weekday moves
 * (a week back); "下周六", "这周六", "next Saturday" and full dates stay as said.
 */
function pastDayIfWent(day: string, dateWords: string, quote: string, ctx: { asOf: string; timeZone: string }): string {
  if (!WENT_WORDS.test(quote) || day <= localDayOf(ctx.asOf, ctx.timeZone)) return day;
  const bareWeekday = /(?:周|星期|礼拜)[一二三四五六日天]|[月火水木金土日]曜|\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/iu.test(dateWords) && !/(下|这|本|来週|今週|再来週|next|this|coming)/iu.test(dateWords);
  return bareWeekday ? new Date(Date.parse(`${day}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10) : day;
}

/** The events the words name: a title inside the words or the words inside a title; a day said narrows them. */
function matchEvents(candidates: readonly EventCandidate[], clues: readonly string[], quote: string, day: string | null, timeZone: string): EventCandidate[] {
  const keys = clues.map(squash).filter((key) => key.length >= 2);
  const wholeQuote = squash(quote);
  let found = candidates.filter((event) => {
    const title = squash(event.title);
    if (title.length < 2) return false;
    return keys.some((key) => title.includes(key) || key.includes(title)) || (!keys.length && wholeQuote.includes(title));
  });
  if (!found.length) found = candidates.filter((event) => squash(event.title).length >= 2 && wholeQuote.includes(squash(event.title)));
  if (day && found.length > 1) {
    const onDay = found.filter((event) => event.startsAt && localDayOf(event.startsAt, timeZone) === day);
    if (onDay.length) found = onDay;
  }
  // The longest title that fits is the one meant ("东京摄影展·冬季场" over "东京摄影展" only when said).
  if (found.length > 1) {
    const exact = found.filter((event) => keys.includes(squash(event.title)));
    if (exact.length) found = exact;
  }
  return found;
}

/**
 * The events the words name, by the record finder (finder/session.ts findEvents): one → [it], a question → its options
 * (in the finder's order), none → []; `legacy` (the old matchEvents call) when ORBIT_AGENT_FINDER=legacy. The events the
 * user picked with @ in this turn come first (AG14): when the finder's records include some of them, only those stay.
 * A read that failed is [] as before (eventCandidates never failed a lookup), and traced.
 */
async function eventsNamed(ctx: Ctx, request: { clues: readonly string[]; quote: string; verb: Verb; timeText?: string; timeDrop?: readonly ("went" | "time" | "endTime" | "shiftMinutes" | "partOfDay")[]; partId: string }, legacy: () => EventCandidate[] | Promise<EventCandidate[]>): Promise<EventCandidate[]> {
  if (finderMode() === "legacy") return legacy();
  const session = finderSessionOf(ctx);
  if (!session) return [];
  const said = request.clues.filter(Boolean).join(" ") || request.quote;
  const clue = request.timeDrop?.includes("went") ? said.replace(new RegExp(WENT_WORDS.source, "giu"), " ").trim() || said : said;
  // AG14 (AG11 交接, AE-REF-005): the platform events picked with @ are looked at first, by the same finder over just them;
  // when the words name one of them, the whole directory is not listed to find an event already chosen.
  const pickedIds = (ctx.pickedEvents ?? []).filter((id) => !id.startsWith("private_event:") && !id.startsWith("attendance:"));
  if (pickedIds.length && ctx.records?.eventsByIds) {
    const chosen: EventCandidate[] = [];
    for (const event of await ctx.records.eventsByIds(pickedIds).catch(() => [])) {
      if (event.archivedAt || (event.lifecycleState !== "published" && event.organizerActorId !== ctx.scope?.accountId) || !event.title || !event.startsAt) continue;
      chosen.push({ endsAt: event.endsAt ?? null, ref: { id: event.eventId, kind: "platform" }, startsAt: event.startsAt, title: event.title });
    }
    const named = pickedFinder(ctx, chosen, clue, request.verb);
    if (named.length) {
      emitTrace({ picked: named.length, type: "propose.picked_events_first" });
      return named;
    }
  }
  const found: Found = await findRecord(session, { accept: ["platform", "private"], clue, fn: "findEvents", partId: request.partId, sentence: ctx.message, verb: request.verb, ...(request.timeText?.trim() ? { timeText: request.timeText } : {}), ...(request.timeDrop ? { timeDrop: request.timeDrop } : {}) });
  if (found.kind === "failed") emitTrace({ partId: request.partId, type: "read.error", where: "finder.events" });
  const refs: { id: string; agentKind: AgentKind }[] = found.kind === "one" ? [{ agentKind: found.agentKind, id: found.id }] : found.kind === "ask" ? found.ids : [];
  let out = refs.flatMap(({ agentKind, id }) => {
    const fields = session.loader.loaded.get(labIdOf(agentKind, id));
    if (!fields || (agentKind !== "platform" && agentKind !== "private")) return [];
    return [{ endsAt: typeof fields.endsAt === "string" ? fields.endsAt : null, ref: { id, kind: agentKind }, startsAt: typeof fields.startsAt === "string" ? fields.startsAt : null, title: String(fields.title ?? ""), ...(fields.allDay === true ? { allDay: true } : {}) } as EventCandidate];
  });
  const picked = new Set(ctx.pickedEvents ?? []);
  if (picked.size && out.some((event) => picked.has(event.ref.id))) {
    out = out.filter((event) => picked.has(event.ref.id));
    emitTrace({ picked: out.length, type: "propose.picked_events_first" });
  }
  return out;
}

/** The finder's rules (no model) over the picked events only: the ones the words name, in its order; [] when none. */
function pickedFinder(ctx: Ctx, chosen: readonly EventCandidate[], clue: string, verb: Verb): EventCandidate[] {
  if (!chosen.length) return [];
  const world: World = { aliases: [], attendance: [], contacts: [], memos: [], now: ctx.asOf, platformEvents: chosen.map((event) => ({ endsAt: event.endsAt ?? event.startsAt!, id: labIdOf("platform", event.ref.id), startsAt: event.startsAt!, title: event.title })), privateEvents: [], schedule: [], timeZone: ctx.timeZone, todos: [] };
  const input = { account: ACCOUNT, clue, sentence: ctx.message, verb };
  const decision = decideEvents(findLabEvents(input, world), null, input, world);
  return decision.ids.flatMap((id) => chosen.filter((event) => labIdOf("platform", event.ref.id) === id));
}

function eventLabelOf(event: { title: string; startsAt: string | null }, language: ResolveContext["language"], timeZone: string): string {
  return event.startsAt ? `${event.title} · ${dayText(localDayOf(event.startsAt, timeZone), language)}` : event.title;
}

const refKey = (ref: { kind: string; id: string }) => `${ref.kind}:${ref.id}`;
const refsFrom = (value: unknown): { kind: "platform" | "private"; id: string }[] => (Array.isArray(value) ? value.flatMap((item) => {
  const text = String(item);
  const at = text.indexOf(":");
  const kind = text.slice(0, at);
  return at > 0 && (kind === "platform" || kind === "private") ? [{ id: text.slice(at + 1), kind: kind as "platform" | "private" }] : [];
}) : []);

/**
 * AG13 gate run-03 (AE-EVT-007): code's sentence for a repetition the schedule cannot store, with a few one-off dates
 * offered instead; null when the words name no such repetition.
 */
export function unsupportedRepeatLine(quote: string, ctx: { asOf: string; language: ResolveContext["language"]; timeZone: string }): string | null {
  const unsupported = UNSUPPORTED_REPEAT.exec(quote);
  return unsupported ? EVENT_WORDS.repeatUnsupported(ctx.language, unsupported[0].trim(), alternativeDates(quote, ctx)) : null;
}

/** The next few one-off dates for a repetition the product cannot store (offered instead, never made without a yes). */
function alternativeDates(said: string, ctx: Pick<Ctx, "asOf" | "language" | "timeZone">): string[] {
  const today = localDayOf(ctx.asOf, ctx.timeZone);
  const weekdays: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 0 };
  const weekday = /(?:周|星期|礼拜)([一二三四五六日天])/u.exec(said)?.[1] ?? /([月火水木金土日])曜/u.exec(said)?.[1] ?? /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/iu.exec(said)?.[1]?.toLowerCase();
  const target = weekday !== undefined ? weekdays[weekday] : undefined;
  const add = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const wd = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();
  if (target === undefined) return [add(today, 7), add(today, 21), add(today, 35)].map((day) => dayText(day, ctx.language));
  const nth = /第\s*([一二三四五1-5])/u.exec(said)?.[1] ?? /\b(first|second|third|fourth)\b/iu.exec(said)?.[1]?.toLowerCase();
  if (nth) {
    const n = ({ "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, first: 1, fourth: 4, second: 2, third: 3, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5 } as Record<string, number>)[nth] ?? 2;
    const out: string[] = [];
    let year = Number(today.slice(0, 4));
    let month = Number(today.slice(5, 7));
    for (let guard = 0; out.length < 3 && guard < 6; guard += 1) {
      const first = `${year}-${String(month).padStart(2, "0")}-01`;
      const day = add(first, ((target - wd(first) + 7) % 7) + (n - 1) * 7);
      if (day > today) out.push(day);
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return out.map((day) => dayText(day, ctx.language));
  }
  let next = add(today, ((target - wd(today) + 7) % 7) || 7);
  const out: string[] = [];
  for (let index = 0; index < 4; index += 1) { out.push(next); next = add(next, 14); }
  return out.map((day) => dayText(day, ctx.language));
}

/** One AG13 intent → its card items, a question, or code's sentence. */
export async function resolveEventIntent(ctx: Ctx, part: GraphPart, write: PartWrite & { picks: PartWrite["picks"] & { event?: string; eventPlan?: string } }, intent: StoredIntent): Promise<WriteOutcome> {
  const language = ctx.language;
  const zone = ctx.timeZone;
  const quote = words(ctx.message, part.quote);
  const stop = (reason: string, line: string): WriteOutcome => ({ kind: "stop", line, reason });
  const base = { localId: intent.localId, partId: part.localId };
  const clueTexts = [...(intent.events ?? []), ...intent.selector].map((span) => words(ctx.message, span)).filter((text) => text && !isPronounClue(text));
  const dateWords = words(ctx.message, intent.date);
  const timeWords = words(ctx.message, intent.time);
  const said = resolveSaidDate(dateWords || quote, ctx.asOf, zone);
  const times = resolveSaidTimes(timeWords || quote);
  const failedLine = language === "zh" ? `「${quote}」这次没能读到你的记录，所以没有改。可以稍后再试。` : language === "ja" ? `「${quote}」は今回記録を読めなかったため、変更していません。少し後でもう一度お試しください。` : `"${quote}": your records could not be read this time, so nothing was changed. Please try again later.`;
  if (!ctx.records || !ctx.scope) return stop("read_failed", failedLine);
  const scope: DomainScope = ctx.scope;

  // The organizer's records are never written: a check-in asked for is code's sentence (one entry, no card).
  if (CHECKIN.test(quote) && (intent.capability.startsWith("attendance.") || intent.capability.startsWith("privateEvent."))) {
    const event = matchEvents(await eventCandidates(ctx, { clues: clueTexts, quote }), clueTexts, quote, said?.day ?? null, zone)[0] ?? null;
    emitTrace({ partId: part.localId, type: "propose.organizer_record" });
    return stop("organizer_record", EVENT_WORDS.checkIn(language, event?.title ?? null));
  }

  switch (intent.capability) {
    case "privateEvent.create": {
      const title = words(ctx.message, intent.title);
      if (!title) return stop("title_missing", EVENT_WORDS.needTitle(language, quote));
      if (!said) return stop("date_unclear", EVENT_WORDS.needDay(language, quote));
      const day = pastDayIfWent(said.day, dateWords || quote, quote, ctx);
      const venue = words(ctx.message, intent.venue);
      // AG20a R5 (设计稿 §4 "可选的时间／地点", 附录 E `allDay?`): a day without a clock time is an all-day event of that day.
      if (!times) {
        ctx.createdEvents?.push({ day, localId: intent.localId, title });
        emitTrace({ partId: part.localId, type: "propose.private_event_all_day" });
        return { kind: "ready", ops: [{ ...base, capability: "privateEvent.create", set: { allDay: true, startsAt: instantOf(day, "00:00", zone), title, ...(venue ? { venue } : {}) } } as CardOperationIntent & { localId: string }] };
      }
      const startsAt = instantOf(day, times.start, zone);
      ctx.createdEvents?.push({ day, localId: intent.localId, time: times.start, title });
      return { kind: "ready", ops: [{ ...base, capability: "privateEvent.create", set: { startsAt, title, ...(times.end ? { endsAt: instantOf(day, times.end, zone) } : {}), ...(venue ? { venue } : {}) } } as CardOperationIntent & { localId: string }] };
    }
    case "attendance.create": {
      // On the private event this request creates: when the model said so, or the words name no other event.
      const created = ctx.createdEvents ?? [];
      const all = await eventCandidates(ctx);
      // Recording «我去过» is not a lookup of an event already attended: the finder gets the day said, not "went"; an event
      // still to come is never the one gone to (narrowByWhen, as before).
      const matched = narrowByWhen(await eventsNamed(ctx, { clues: clueTexts, partId: part.localId, quote, timeDrop: ["went"], timeText: dateWords || quote, verb: "link" }, () => matchEvents(all, clueTexts, quote, said?.day ?? null, zone)), quote, ctx);
      const fresh = created.find((item) => item.localId === intent.after) ?? (created.length && (!matched.length || clueTexts.some((clue) => created.some((item) => squash(item.title) === squash(clue)))) ? created[created.length - 1] : undefined);
      if (fresh) {
        const day = said && intent.date ? said.day : fresh.day;
        // The part of the day the user said here, or the one the new event starts in ("晚上七点" → evening).
        const said_parts = dayPartsOf(`${timeWords} ${dateWords} ${quote}`);
        const parts = said_parts.length ? said_parts : fresh.time ? dayPartsOf(fresh.time) : [];
        return { kind: "ready", ops: [{ ...base, capability: "attendance.create", set: { attendedOn: day, eventRef: { kind: "private", localCreateRef: fresh.localId as unknown as number }, ...(parts.length ? { dayParts: parts } : {}) }, shown: { event: { kind: "private", startsAt: null, title: fresh.title } } } as unknown as CardOperationIntent & { localId: string }] };
      }
      const picked = write.picks.event ? all.find((event) => refKey(event.ref) === write.picks.event) : undefined;
      const options = picked ? [picked] : matched;
      if (!options.length) return stop("event_not_found", EVENT_WORDS.eventNotFound(language, clueTexts[0] ?? quote));
      if (options.length > 1) return { kind: "ask", question: { candidates: options.slice(0, 3).map((event) => ({ detail: event.startsAt ? dayText(localDayOf(event.startsAt, zone), language) : undefined, id: refKey(event.ref), name: event.title, type: "event" })), clue: clueTexts[0] ?? quote, type: "event" } } as unknown as WriteOutcome;
      const event = options[0];
      const existing = (await ctx.records.attendance?.list(scope.accountId).catch(() => []) ?? []).find((note) => note.eventRef.kind === event.ref.kind && note.eventRef.id === event.ref.id);
      if (existing) return stop("already_recorded", EVENT_WORDS.alreadyAttended(language, event.title, dayText(existing.attendedOn, language)));
      const day = (said ? pastDayIfWent(said.day, dateWords || quote, quote, ctx) : null) ?? (event.startsAt ? localDayOf(event.startsAt, zone) : null);
      if (!day) return stop("date_unclear", EVENT_WORDS.needDay(language, quote));
      const parts = dayPartsOf(`${timeWords} ${dateWords} ${quote}`);
      const fromEvent = !parts.length && event.startsAt ? dayPartsOf(localTimeOf(event.startsAt, zone)) : [];
      const note = words(ctx.message, intent.note);
      return { kind: "ready", ops: [{ ...base, capability: "attendance.create", set: { attendedOn: day, eventRef: { ...event.ref }, ...(parts.length || fromEvent.length ? { dayParts: parts.length ? parts : fromEvent } : {}), ...(note ? { selfNote: note } : {}) }, shown: { event: { kind: event.ref.kind, startsAt: event.startsAt, title: event.title } } } as CardOperationIntent & { localId: string }] };
    }
    case "privateEvent.update": {
      const matched = await eventsNamed(ctx, { clues: clueTexts, partId: part.localId, quote, verb: "update" }, async () => matchEvents(await eventCandidates(ctx, { clues: clueTexts, quote }), clueTexts, quote, said?.day ?? null, zone));
      // The record finder asks between private events it cannot tell apart (never the first one by a guess); a click picks.
      const pickedEvent = write.picks.event ? matched.find((event) => refKey(event.ref) === write.picks.event) : undefined;
      const privates = matched.filter((event) => event.ref.kind === "private");
      if (finderMode() === "new" && !pickedEvent && privates.length > 1) return { kind: "ask", question: { candidates: privates.slice(0, 3).map((event) => ({ detail: event.startsAt ? dayText(localDayOf(event.startsAt, zone), language) : undefined, id: refKey(event.ref), name: event.title, type: "event" })), clue: clueTexts[0] ?? quote, type: "event" } } as unknown as WriteOutcome;
      const target = pickedEvent?.ref.kind === "private" ? pickedEvent : matched.find((event) => event.ref.kind === "private") ?? null;
      if (!target && matched[0]?.ref.kind === "platform") return stop("platform_event", EVENT_WORDS.platformLocked(language, matched[0].title));
      if (!target) return stop("event_not_found", EVENT_WORDS.privateNotFound(language, clueTexts[0] ?? quote));
      const current = await ctx.records.privateEvents?.get(scope.accountId, target.ref.id).catch(() => null);
      if (!current) return stop("read_failed", failedLine);
      const set: Record<string, string | null> = {};
      const title = words(ctx.message, intent.title);
      const venue = words(ctx.message, intent.venue);
      if (title && title !== current.title) set.title = title;
      if (venue && venue !== current.venue) set.venue = venue;
      if (times || said) {
        const day = said?.day ?? localDayOf(current.startsAt, zone);
        const start = times?.start ?? localTimeOf(current.startsAt, zone);
        set.startsAt = instantOf(day, start, zone);
        if (times?.end) set.endsAt = instantOf(day, times.end, zone);
        // AG20a: an all-day event given a clock time is no longer all day; a new day alone keeps it all day (00:00 of that day).
        if (current.allDay && times) set.allDay = null;
      }
      if (!Object.keys(set).length) return stop("no_change", EVENT_WORDS.needTime(language, quote));
      return { kind: "ready", ops: [{ ...base, capability: "privateEvent.update", expectedVersion: current.version, set, shown: { before: Object.fromEntries(Object.keys(set).map((key) => [key, (current as unknown as Record<string, string | undefined>)[key] ?? null])), title: current.title, ...(current.allDay ? { allDay: true } : {}) }, targetId: current.id } as CardOperationIntent & { localId: string }] };
    }
    case "privateEvent.delete":
      return resolveDeletePlan(ctx, part, write, intent, clueTexts, quote, failedLine);
    case "attendance.delete":
    case "memo.update": {
      // Part of deleting a private event in this message: the plan makes these items (and keeps their order).
      if (ctx.deleting) return { kind: "covered" } as unknown as WriteOutcome;
      // AG21b (R28): words that ask to unlink a note from an event are the unlink operation. When the same message deletes
      // the event ("把茶会删了，笔记只解除关联"), its delete plan makes the unlink (covered above: a schedule-tagged delete of a
      // private event becomes that plan); otherwise the note linked to the event named is unlinked on its own.
      if (intent.capability === "memo.update" && UNLINK_WORDS.test(quote)) {
        const unlink = await memoUnlink(ctx, part, intent, clueTexts, quote, said?.day ?? null);
        if (unlink) return unlink;
      }
      if (intent.capability === "memo.update") return stop("not_in_this_version", language === "zh" ? `「${quote}」这次在对话里只能解除笔记和活动的关联，改笔记内容请到笔记页。这次没有改。` : language === "ja" ? `「${quote}」：会話からはメモとイベントの紐づけを外すことだけができます。本文の変更はメモの画面でお願いします。今回は変更していません。` : `"${quote}": in the chat a memo can only be unlinked from an event; edit its text on the note's page. Nothing was changed.`);
      const all = await eventCandidates(ctx, { clues: clueTexts, quote });
      const matched = await eventsNamed(ctx, { clues: clueTexts, partId: part.localId, quote, timeText: dateWords, verb: "delete" }, () => matchEvents(all, clueTexts, quote, said?.day ?? null, zone));
      const notes = await ctx.records.attendance?.list(scope.accountId).catch(() => null);
      if (!notes) return stop("read_failed", failedLine);
      const note = notes.find((item) => matched.some((event) => event.ref.kind === item.eventRef.kind && event.ref.id === item.eventRef.id));
      if (!note) return stop("event_not_found", EVENT_WORDS.eventNotFound(language, clueTexts[0] ?? quote));
      const event = matched.find((item) => item.ref.id === note.eventRef.id)!;
      return { kind: "ready", ops: [{ ...base, capability: "attendance.delete", expectedVersion: note.version, shown: { attendedOn: note.attendedOn, event: { kind: event.ref.kind, startsAt: event.startsAt, title: event.title } }, targetId: note.id } as CardOperationIntent & { localId: string }] };
    }
    case "schedule.create":
    case "schedule.update":
    case "schedule.delete":
      return resolveSchedule(ctx, part, write, intent, clueTexts, quote, failedLine);
    case "todo.complete":
    case "todo.reopen":
    case "todo.delete":
    case "todo.update":
      return resolveTodoVerb(ctx, part, write, intent, clueTexts, quote, failedLine);
    default:
      return stop("not_in_this_version", failedLine);
  }
}

async function readTodos(ctx: Ctx, text: string | undefined, status?: "open" | "completed"): Promise<RecordView[]> {
  const result = await ctx.records!.reader.read("todo", ctx.scope!, { limit: 10, ...(status ? { status } : {}), ...(text ? { text } : {}) });
  return result.items;
}

/** The record finder's action for a to-do verb (reopen is a change of a done to-do: "update" over the done ones). */
function verbOf(capability: string): Verb {
  return capability === "todo.complete" ? "complete" : capability === "todo.delete" ? "delete" : capability === "todo.update" ? "link" : "update";
}

/**
 * The record finder's to-do lookup for complete / reopen / delete / link: one → that to-do, a question → its options
 * (read again by id for the card), none → not found. Between several, a part answering a question about a person goes
 * on with that person's to-dos (AG20b R13), as before. A read that failed throws (the caller says so).
 */
async function todoVerbByFinder(ctx: Ctx, part: GraphPart, clues: readonly string[], quote: string, statuses: ("open" | "completed")[], verb: Verb): Promise<{ kind: "found"; view: RecordView } | { kind: "ask"; views: RecordView[] } | { kind: "none" }> {
  const session = finderSessionOf(ctx);
  if (!session) throw new Error("SOURCE_UNAVAILABLE");
  const status = statuses.length === 1 ? (statuses[0] === "completed" ? "done" : "open") : "any";
  const found = await findRecord(session, { accept: ["todo"], clue: clues.join(" ") || quote, fn: "findTodosMemos", kinds: ["todo"], partId: part.localId, sentence: ctx.message, status, verb, ...(ctx.context && !ctx.context.idle ? { shown: ctx.context.shownList.filter((item) => item.type === "todo").map((item) => ({ id: item.id, kind: "todo" as const })) } : {}) });
  if (found.kind === "failed") throw new Error("SOURCE_UNAVAILABLE");
  if (found.kind === "none") return { kind: "none" };
  const readOne = async (id: string) => (await ctx.records!.reader.read("todo", ctx.scope!, { id })).items[0] ?? null;
  if (found.kind === "one") {
    const view = await readOne(found.id);
    return view ? { kind: "found", view } : { kind: "none" };
  }
  let ids = found.ids.map((item) => item.id);
  const person = await askedPerson(ctx, part);
  if (person) {
    const theirs = ids.filter((id) => {
      const fields = session.loader.loaded.get(labIdOf("todo", id)) ?? {};
      return (Array.isArray(fields.contactIds) ? (fields.contactIds as string[]) : [String(fields.contactId ?? "")]).includes(person);
    });
    if (theirs.length) ids = theirs;
  }
  const views = (await Promise.all(ids.slice(0, 3).map(readOne))).filter((view): view is RecordView => Boolean(view));
  if (!views.length) return { kind: "none" };
  // Narrowed to the asked person's one to-do: that one (as before); otherwise the question.
  if (views.length === 1 && ids.length === 1) return { kind: "found", view: views[0] };
  return { kind: "ask", views };
}

/** The to-do the words name, among those of the given status (a title inside the words, or the words inside a title). */
async function findTodo(ctx: Ctx, part: GraphPart, write: PartWrite, clues: readonly string[], quote: string, statuses: ("open" | "completed")[], verb: Verb = "update"): Promise<{ kind: "found"; view: RecordView } | { kind: "ask"; views: RecordView[] } | { kind: "none" }> {
  // "另外把…也关联上": a sentence that names no to-do goes on with the one this message named before.
  const bound = write.picks.todo ?? part.refs.find((ref) => ref.entity === "todo" && ref.recordId)?.recordId ?? (!clues.length ? (ctx as Ctx).lastTodo?.id : undefined);
  if (bound) {
    const view = (await ctx.records!.reader.read("todo", ctx.scope!, { id: bound })).items[0];
    return view ? { kind: "found", view } : { kind: "none" };
  }
  if (finderMode() === "new") return todoVerbByFinder(ctx, part, clues, quote, statuses, verb);
  const keys = clues.map(squash).filter((key) => key.length >= 2);
  const seen = new Map<string, RecordView>();
  for (const status of statuses) {
    for (const clue of clues.length ? clues : [undefined]) for (const view of await readTodos(ctx, clue, status)) seen.set(view.id, view);
    if (!clues.length) continue;
    // A title inside the user's words ("把「给李薇寄样片」标成完成").
    for (const view of await readTodos(ctx, undefined, status)) if (squash(quote).includes(squash(String(view.fields.title ?? ""))) && squash(String(view.fields.title ?? "")).length >= 3) seen.set(view.id, view);
  }
  let found = [...seen.values()].filter((view) => {
    const title = squash(String(view.fields.title ?? ""));
    return keys.some((key) => title.includes(key) || key.includes(title)) || (title.length >= 3 && squash(quote).includes(title));
  });
  const exact = found.filter((view) => keys.includes(squash(String(view.fields.title ?? ""))));
  if (exact.length) found = exact;
  if (found.length > 1) {
    const inQuote = found.filter((view) => squash(quote).includes(squash(String(view.fields.title ?? ""))));
    if (inQuote.length) found = inQuote.sort((left, right) => String(right.fields.title ?? "").length - String(left.fields.title ?? "").length).slice(0, 1);
  }
  // AG20b (TRIAGE R13): a part answering a question about a person goes on with that person's to-dos ("フォローを完了にして"
  // after "白山さんの件…"), so it does not ask again over everyone's follow-ups.
  if (found.length > 1) {
    const person = await askedPerson(ctx, part);
    const theirs = person ? found.filter((view) => (Array.isArray(view.fields.contactIds) ? (view.fields.contactIds as string[]) : [String(view.fields.contactId ?? "")]).includes(person)) : [];
    if (theirs.length) found = theirs;
  }
  if (!found.length) return { kind: "none" };
  if (found.length === 1) return { kind: "found", view: found[0] };
  return { kind: "ask", views: found.slice(0, 3) };
}

async function resolveTodoVerb(ctx: Ctx, part: GraphPart, write: PartWrite, intent: StoredIntent, clueTexts: string[], quote: string, failedLine: string): Promise<WriteOutcome> {
  const language = ctx.language;
  const zone = ctx.timeZone;
  const stop = (reason: string, line: string): WriteOutcome => ({ kind: "stop", line, reason });
  const base = { localId: intent.localId, partId: part.localId };
  const todoClues = intent.selector.map((span) => words(ctx.message, span)).filter((text) => text && !isPronounClue(text));
  const statuses: ("open" | "completed")[] = intent.capability === "todo.reopen" ? ["completed"] : intent.capability === "todo.complete" ? ["open"] : ["open", "completed"];
  // Unlinking a to-do from the private event this message deletes: the deletion's plan makes that item.
  if (intent.capability === "todo.update" && ctx.deleting && !intent.relations.length && (!intent.events?.length || UNLINK_WORDS.test(quote)) && !intent.title && !intent.date) return { kind: "covered" } as unknown as WriteOutcome;
  let found;
  try {
    found = await findTodo(ctx, part, write, todoClues, quote, statuses, verbOf(intent.capability));
    if (found.kind === "none" && intent.capability !== "todo.delete") found = await findTodo(ctx, part, write, todoClues, quote, ["open", "completed"], verbOf(intent.capability));
  } catch {
    return stop("read_failed", failedLine);
  }
  if (found.kind === "ask") return { kind: "ask", question: { candidates: found.views.map((view) => ({ id: view.id, name: String(view.fields.title ?? ""), type: "todo" })), clue: todoClues[0] ?? quote, type: "todo" } };
  if (found.kind === "none" && todoClues.length && finderMode() === "legacy") {
    // (Legacy lookup only: the record finder's reformulate round stands in for this.)
    // AG20b (owner decision 6): "nda" against 「保密协议」 — the to-dos whose meaning matches are offered to click, never taken.
    const meant = await todosByMeaning(ctx, todoClues[0], intent.capability === "todo.delete" ? statuses : ["open", "completed"], part.localId).catch(() => []);
    if (meant.length) return { kind: "ask", question: { candidates: meant, clue: todoClues[0], notFound: todoClues[0], type: "todo" } };
  }
  if (found.kind === "none") return stop("object_not_found", EVENT_WORDS.todoNotFound(language, todoClues[0] ?? quote));
  const view = found.view;
  const title = String(view.fields.title ?? "");
  const status = String(view.fields.status ?? "open");
  ctx.lastTodo = { id: view.id };
  if (intent.capability === "todo.complete" || intent.capability === "todo.reopen") {
    const want = intent.capability === "todo.complete" ? "completed" : "open";
    if (status === want) return stop("no_change", EVENT_WORDS.todoAlready(language, title, want));
    return { kind: "ready", ops: [{ ...base, capability: intent.capability, shown: { status, title }, targetId: view.id } as CardOperationIntent & { localId: string }] };
  }
  if (intent.capability === "todo.delete") return { kind: "ready", ops: [{ ...base, capability: "todo.delete", shown: { status, title }, targetId: view.id } as CardOperationIntent & { localId: string }] };
  // todo.update: link people and events (added to what the to-do already has).
  if (ctx.deleting && UNLINK_WORDS.test(quote) && !intent.relations.length && !intent.events?.length) return { kind: "covered" } as unknown as WriteOutcome;
  // The lists as stored, and what an earlier sentence of this message already added to them (one item per to-do).
  const storedPeople = Array.isArray(view.fields.contactIds) ? (view.fields.contactIds as string[]) : typeof view.fields.contactId === "string" ? [view.fields.contactId] : [];
  const storedEvents = refsFrom(view.fields.eventRefs);
  const earlier = ctx.linkOps?.get(view.id);
  const currentPeople = (earlier?.set.relatedContactIds as string[] | undefined) ?? storedPeople;
  const currentEvents = (earlier?.set.relatedEventRefs as { kind: "platform" | "private"; id: string }[] | undefined) ?? storedEvents;
  const nameOfContact = async (id: string) => ctx.nameOf(id) || String((await ctx.records!.reader.read("contact", ctx.scope!, { id }).catch(() => null))?.items[0]?.fields.displayName ?? "");
  const addedPeople: { id: string; name: string }[] = [];
  const { resolvePerson } = await import("./resolve");
  for (const relation of intent.relations) {
    const text = words(ctx.message, relation.quote);
    const person = await resolvePerson(ctx, part, write, { quote: relation.quote, text });
    if (person.kind === "found") {
      if (!addedPeople.some((item) => item.id === person.id)) addedPeople.push({ id: person.id, name: person.name || await nameOfContact(person.id) });
      continue;
    }
    if (person.kind === "ask") return { kind: "ask", question: { candidates: person.candidates, clue: person.clue, type: "contact" } };
    if (person.kind === "shares") return { kind: "shares", with: person.with };
    if (person.kind === "failed") return stop("read_failed", failedLine);
    return stop("person_not_found", language === "zh" ? `联系人里没找到「${text}」，所以这次没有关联。` : language === "ja" ? `連絡先に「${text}」が見つからなかったため、今回は紐づけていません。` : `I could not find "${text}" in your contacts, so nothing was linked.`);
  }
  const eventSpans = (intent.events ?? []).filter((span) => words(ctx.message, span));
  const eventClues = eventSpans.map((span) => words(ctx.message, span));
  const addedEvents: { ref: { kind: "platform" | "private"; id: string }; label: string }[] = [];
  if (eventClues.length) {
    const all = await eventCandidates(ctx);
    for (const [index, clue] of eventClues.entries()) {
      // A day said with the event ("11 月 19 日那场「…」") narrows same-named events even when the clue is the title alone.
      const day = resolveSaidDate(clue, ctx.asOf, zone)?.day ?? resolveSaidDate(clauseAround(ctx.message, eventSpans[index]), ctx.asOf, zone)?.day ?? null;
      const dayWords = resolveSaidDate(clue, ctx.asOf, zone) ? clue : clauseAround(ctx.message, eventSpans[index]);
      const matched = await eventsNamed(ctx, { clues: [clue], partId: part.localId, quote: clue, timeText: dayWords, verb: "link" }, () => matchEvents(all, [clue.replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日号]?\s*(?:那场|那一场|的)?/u, "")], clue, day, zone));
      const picked = (write.picks as { event?: string }).event ? matched.find((event) => refKey(event.ref) === (write.picks as { event?: string }).event) : undefined;
      if (!matched.length) return stop("event_not_found", EVENT_WORDS.eventNotFound(language, clue));
      if (matched.length > 1 && !picked) return { kind: "ask", question: { candidates: matched.slice(0, 3).map((event) => ({ detail: event.startsAt ? dayText(localDayOf(event.startsAt, zone), language) : undefined, id: refKey(event.ref), name: event.title, type: "event" })), clue, type: "event" } } as unknown as WriteOutcome;
      const event = picked ?? matched[0];
      if (!addedEvents.some((item) => refKey(item.ref) === refKey(event.ref))) addedEvents.push({ label: eventLabelOf(event, language, zone), ref: event.ref });
    }
  }
  const people = [...currentPeople, ...addedPeople.map((item) => item.id).filter((id) => !currentPeople.includes(id))];
  const eventRefs = [...currentEvents, ...addedEvents.map((item) => item.ref).filter((ref) => !currentEvents.some((old) => refKey(old) === refKey(ref)))];
  const peopleChanged = people.length !== storedPeople.length;
  const eventsChanged = eventRefs.length !== storedEvents.length;
  if (people.length === currentPeople.length && eventRefs.length === currentEvents.length) return earlier ? { kind: "covered" } as unknown as WriteOutcome : stop("no_change", EVENT_WORDS.linksAlready(language, title));
  const all = eventsChanged || storedEvents.length ? await eventCandidates(ctx) : [];
  const labelOf = (ref: { kind: string; id: string }) => addedEvents.find((item) => refKey(item.ref) === refKey(ref))?.label ?? (() => { const event = all.find((item) => refKey(item.ref) === refKey(ref)); return event ? eventLabelOf(event, language, zone) : ref.id; })();
  const names = new Map<string, string>();
  for (const id of new Set([...storedPeople, ...people])) names.set(id, addedPeople.find((item) => item.id === id)?.name ?? (earlier?.shown as { people?: { after: string[] } } | undefined)?.people?.after[people.indexOf(id)] ?? (await nameOfContact(id)));
  const shown = {
    title,
    ...(peopleChanged ? { people: { after: people.map((id) => names.get(id) ?? id), before: storedPeople.map((id) => names.get(id) ?? id) } } : {}),
    ...(eventsChanged ? { events: { after: eventRefs.map(labelOf), before: storedEvents.map(labelOf) } } : {}),
  };
  const set = { ...(peopleChanged ? { relatedContactIds: people } : {}), ...(eventsChanged ? { relatedEventRefs: eventRefs } : {}) };
  const before = { ...(peopleChanged ? { relatedContactIds: storedPeople } : {}), ...(eventsChanged ? { relatedEventRefs: storedEvents } : {}) };
  ctx.people.push(...addedPeople.filter((item) => !ctx.people.some((known) => known.id === item.id)).map((item) => ({ at: part.quote[0], id: item.id, name: item.name })));
  if (earlier) {
    // One item per to-do: the earlier sentence's item now carries this one's links too.
    earlier.set = set;
    earlier.before = before;
    earlier.shown = shown;
    emitTrace({ partId: part.localId, targetId: view.id, type: "propose.links_merged" });
    return { kind: "covered" } as unknown as WriteOutcome;
  }
  const op = { ...base, before, capability: "todo.update", links: true, set, shown, targetId: view.id } as CardOperationIntent & { localId: string };
  if (!ctx.linkOps) ctx.linkOps = new Map();
  ctx.linkOps.set(view.id, op as unknown as { set: Record<string, unknown>; before: Record<string, unknown>; shown: Record<string, unknown> });
  return { kind: "ready", ops: [op] };
}

async function resolveSchedule(ctx: Ctx, part: GraphPart, write: PartWrite, intent: StoredIntent, clueTexts: string[], quote: string, failedLine: string): Promise<WriteOutcome> {
  const language = ctx.language;
  const zone = ctx.timeZone;
  const stop = (reason: string, line: string): WriteOutcome => ({ kind: "stop", line, reason });
  const base = { localId: intent.localId, partId: part.localId };
  const unsupported = UNSUPPORTED_REPEAT.exec(quote);
  if (unsupported && intent.capability !== "schedule.delete") {
    emitTrace({ partId: part.localId, said: unsupported[0], type: "propose.repeat_unsupported" });
    return stop("repeat_unsupported", EVENT_WORDS.repeatUnsupported(language, unsupported[0].trim(), alternativeDates(quote, ctx)));
  }
  const dateWords = words(ctx.message, intent.date);
  const timeWords = words(ctx.message, intent.time);
  const said = resolveSaidDate(dateWords || quote, ctx.asOf, zone);
  const times = resolveSaidTimes(timeWords || quote);
  if (intent.capability === "schedule.create") {
    if (REPEAT_WORDS.test(quote)) return stop("not_in_this_version", EVENT_WORDS.repeatCreateLater(language));
    const all = await eventCandidates(ctx);
    const eventClues = (intent.events ?? []).map((span) => words(ctx.message, span)).filter(Boolean);
    const named = words(ctx.message, intent.title);
    const events = matchEvents(all, [...eventClues, ...(named ? [named] : [])].map(withoutWhenWords), quote, said?.day ?? null, zone).filter((event) => !said || !event.startsAt || localDayOf(event.startsAt, zone) === said.day || eventClues.length > 0).slice(0, 1);
    // AG20a R6 (附录 B 个人日程 "起止、时区……关联的人"): the zone the user named ("伦敦时间"), the length said ("45 分钟"),
    // the people; the title is the user's words without the words of when.
    const zoneSaid = timeZonePhraseOf(words(ctx.message, intent.zone) || timeWords || quote);
    const itemZone = zoneSaid?.zone ?? zone;
    const lengthSaid = durationPhraseOf(words(ctx.message, intent.duration) || quote);
    const title = titleWithoutWhen(named, [dateWords, timeWords, zoneSaid?.words ?? "", lengthSaid?.words ?? "", words(ctx.message, intent.zone), words(ctx.message, intent.duration)]) || events[0]?.title || "";
    if (!title) return stop("title_missing", EVENT_WORDS.needTitle(language, quote));
    const event = events[0];
    // AG20a R5 (设计稿 §4): an item made from an event with no time said takes the event's own start (and end).
    const fromEvent = !times && event?.startsAt && (!said || localDayOf(event.startsAt, zone) === said.day) ? event : null;
    if (!said && !fromEvent) return stop("date_unclear", EVENT_WORDS.needDay(language, quote));
    if (!times && !fromEvent) return stop("time_unclear", EVENT_WORDS.needTime(language, quote));
    const startsAt = fromEvent ? fromEvent.startsAt! : instantOf(said!.day, times!.start, itemZone);
    // AG20a: from an all-day event the item is the whole day (local midnight to the next one) — never 00:00–00:00.
    const allDayItem = Boolean(fromEvent?.allDay);
    const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const endsAt = allDayItem ? instantOf(nextDay(localDayOf(startsAt, zone)), "00:00", zone) : fromEvent ? fromEvent.endsAt ?? (lengthSaid ? new Date(Date.parse(startsAt) + lengthSaid.minutes * 60_000).toISOString() : undefined)
      : times!.end ? instantOf(said!.day, times!.end, itemZone) : lengthSaid ? new Date(Date.parse(startsAt) + lengthSaid.minutes * 60_000).toISOString() : undefined;
    if (fromEvent) emitTrace({ partId: part.localId, type: "propose.schedule_time_from_event" });
    const people: { id: string; name: string }[] = [];
    if (intent.relations.length) {
      const { resolvePerson } = await import("./resolve");
      for (const relation of intent.relations) {
        const person = await resolvePerson(ctx, part, write, { quote: relation.quote, text: words(ctx.message, relation.quote) });
        if (person.kind === "found") {
          if (!people.some((item) => item.id === person.id)) people.push({ id: person.id, name: person.name || ctx.nameOf(person.id) || String((await ctx.records!.reader.read("contact", ctx.scope!, { id: person.id }).catch(() => null))?.items[0]?.fields.displayName ?? "") });
          continue;
        }
        if (person.kind === "ask") return { kind: "ask", question: { candidates: person.candidates, clue: person.clue, type: "contact" } };
        if (person.kind === "shares") return { kind: "shares", with: person.with };
        if (person.kind === "failed") return stop("read_failed", failedLine);
        // Not among the contacts: the item is made without a person (the card then shows no one), never with a guess.
      }
      ctx.people.push(...people.filter((item) => !ctx.people.some((known) => known.id === item.id)).map((item) => ({ at: part.quote[0], id: item.id, name: item.name })));
    }
    if (zoneSaid || lengthSaid || people.length) emitTrace({ length: lengthSaid?.minutes ?? null, partId: part.localId, people: people.map((item) => item.id), type: "propose.schedule_said", zone: zoneSaid?.zone ?? null });
    return { kind: "ready", ops: [{ ...base, capability: "schedule.create", set: { startsAt, timeZone: allDayItem ? zone : itemZone, title, ...(endsAt ? { endsAt } : {}), ...(allDayItem ? { allDay: true } : {}), ...(events.length ? { eventRefs: events.map((item) => ({ ...item.ref })) } : {}), ...(people.length ? { contactIds: people.map((item) => item.id) } : {}) }, shown: { events: events.map((item) => ({ kind: item.ref.kind, startsAt: item.startsAt, title: item.title })), ...(people.length ? { names: Object.fromEntries(people.map((item) => [item.id, item.name])) } : {}), ...(zoneSaid && zoneSaid.zone !== zone ? { zoneLabel: zoneSaid.words } : {}) } } as CardOperationIntent & { localId: string }] };
  }
  // update / delete: the user's own schedule item the words name (its name without the words of when: "明天的选品周会").
  const clues = clueTexts.map(withoutWhenWords).filter((clue) => squash(clue).length >= 2);
  const keys = clues.map(squash).filter((key) => key.length >= 2);
  let found: RecordView[];
  const byFinder = finderMode() === "new";
  if (byFinder) {
    // The record finder: the item the words name, the day said narrowing its occurrences; a new time of an update is a
    // value of the change, never a filter. One → that item; several → which one (the sentence below); none → []
    // (then the events of those words, below).
    const session = finderSessionOf(ctx);
    if (!session) return stop("read_failed", failedLine);
    const result = await findRecord(session, {
      accept: ["schedule"], clue: clueTexts.join(" ") || quote, fn: "findSchedule", partId: part.localId, sentence: ctx.message, timeText: dateWords || quote,
      verb: intent.capability === "schedule.delete" ? "delete" : "update", ...(intent.capability === "schedule.update" ? { timeDrop: ["time", "endTime", "shiftMinutes", "partOfDay"] as const } : {}),
    });
    if (result.kind === "failed") return stop("read_failed", failedLine);
    const ids = result.kind === "one" ? [result.id] : result.kind === "ask" ? result.ids.map((item) => item.id) : [];
    try {
      found = (await Promise.all(ids.slice(0, 3).map(async (id) => (await ctx.records!.reader.read("schedule", ctx.scope!, { id })).items[0] ?? null))).filter((view): view is RecordView => Boolean(view));
    } catch {
      return stop("read_failed", failedLine);
    }
  } else {
    let items: RecordView[];
    try {
      const seen = new Map<string, RecordView>();
      for (const clue of clues.length ? clues : [undefined]) for (const view of (await ctx.records!.reader.read("schedule", ctx.scope!, { limit: 10, ...(clue ? { text: clue } : {}) })).items) seen.set(view.id, view);
      items = [...seen.values()];
    } catch {
      return stop("read_failed", failedLine);
    }
    found = items.filter((view) => {
      const title = squash(String(view.fields.title ?? ""));
      return keys.some((key) => title.includes(key) || key.includes(title)) || (!keys.length && squash(quote).includes(title));
    });
  }
  const day =intent.date ? said?.day ?? null : said && /(今天|明天|后天|昨天|今日|明日|tomorrow|today|\d{1,2}\s*月\s*\d{1,2}|\b(?:mon|tue|wed|thu|fri|sat|sun))/iu.test(quote) ? said.day : null;
  const occursOn = (view: RecordView, on: string) => {
    const from = instantOf(on, "00:00", zone);
    const to = new Date(Date.parse(from) + 86_400_000).toISOString();
    return Boolean(occurrenceIn(String(view.fields.startsAt), typeof view.fields.recurrence === "string" ? view.fields.recurrence : undefined, from, to));
  };
  if (!byFinder && day && found.length > 1) found = found.filter((view) => occursOn(view, day));
  if (!byFinder && found.length > 1) {
    const exact = found.filter((view) => keys.includes(squash(String(view.fields.title ?? ""))));
    if (exact.length) found = exact;
  }
  if (!found.length) {
    const named = await eventsNamed(ctx, { clues, partId: part.localId, quote, timeText: dateWords, verb: intent.capability === "schedule.delete" ? "delete" : "update" }, async () => matchEvents(await eventCandidates(ctx, { clues, quote }), clues, quote, day, zone));
    // AG21b (R28): the first layer often calls a named event a schedule item. With no schedule item of those words, the
    // user's own private event of the same words is the one meant: its change, or its delete plan (links listed first).
    if (named.some((item) => item.ref.kind === "private")) {
      emitTrace({ capability: intent.capability, partId: part.localId, type: "propose.schedule_as_private_event" });
      if (intent.capability === "schedule.delete") {
        ctx.deleting = true;
        return resolveDeletePlan(ctx, part, write, { ...intent, capability: "privateEvent.delete" }, clueTexts, quote, failedLine);
      }
      return resolveEventIntent(ctx, part, write, { ...intent, capability: "privateEvent.update" });
    }
    // A platform event's time is the organizer's, never the user's to change.
    const event = named.find((item) => item.ref.kind === "platform");
    if (event) return stop("platform_event", EVENT_WORDS.platformLocked(language, event.title));
    return stop("object_not_found", EVENT_WORDS.scheduleNotFound(language, clues[0] ?? quote));
  }
  if (found.length > 1) return stop("object_ambiguous", EVENT_WORDS.whichEvent(language, quote, found.slice(0, 3).map((view) => String(view.fields.title ?? ""))));
  const item = found[0];
  const title = String(item.fields.title ?? "");
  const startsAt = String(item.fields.startsAt);
  const endsAt = typeof item.fields.endsAt === "string" ? item.fields.endsAt : null;
  const itemZone = typeof item.fields.timeZone === "string" ? item.fields.timeZone : zone;
  const repeats = typeof item.fields.recurrence === "string" ? (item.fields.recurrence as "daily" | "weekly" | "monthly") : null;
  const scope: "this_occurrence" | "whole_series" | "single" = !repeats ? "single" : SERIES.test(quote) || NOT_ONLY_THIS.test(quote) ? "whole_series" : THIS_TIME.test(quote) ? "this_occurrence" : day ? "this_occurrence" : "whole_series";
  if (scope === "this_occurrence" && (!day || !occursOn(item, day))) return stop("object_not_found", EVENT_WORDS.noOccurrence(language, title, day ? dayText(day, language) : quote));
  const anchorDay = scope === "this_occurrence" ? day! : localDayOf(startsAt, itemZone);
  const beforeStart = instantOf(anchorDay, localTimeOf(startsAt, itemZone), itemZone);
  const beforeEnd = endsAt ? new Date(Date.parse(beforeStart) + Date.parse(endsAt) - Date.parse(startsAt)).toISOString() : null;
  const shown = { before: { endsAt: beforeEnd, startsAt: beforeStart }, repeats, timeZone: itemZone, title };
  if (intent.capability === "schedule.delete") {
    return { kind: "ready", ops: [{ ...base, capability: "schedule.delete", set: { scope, ...(scope === "this_occurrence" ? { occurrenceDate: anchorDay } : {}) }, shown: { repeats, startsAt: beforeStart, timeZone: itemZone, title }, targetId: item.id } as CardOperationIntent & { localId: string }] };
  }
  if (!times) return stop("time_unclear", EVENT_WORDS.needTime(language, quote));
  const newStart = instantOf(anchorDay, times.start, itemZone);
  const newEnd = times.end ? instantOf(anchorDay, times.end, itemZone) : beforeEnd ? new Date(Date.parse(newStart) + Date.parse(beforeEnd) - Date.parse(beforeStart)).toISOString() : undefined;
  if (onlyStartSaid(timeWords || quote)) emitTrace({ partId: part.localId, type: "propose.schedule_length_kept" });
  ctx.names?.set(item.id, title);
  return { kind: "ready", ops: [{ ...base, capability: "schedule.update", set: { scope: scope === "single" ? "whole_series" : scope, ...(scope === "this_occurrence" ? { occurrenceDate: anchorDay } : {}), startsAt: newStart, ...(newEnd ? { endsAt: newEnd } : {}) }, shown, targetId: item.id } as CardOperationIntent & { localId: string }] };
}

/**
 * AG21b (R28): "把茶会纪要和校友茶会的关联解除" outside a delete plan — the note linked to the private event the words name
 * loses that link (one memo.update with links, as in the delete plan). The note is the one the other words name, or the
 * only note linked to the event. Null when that cannot be told (the caller says what it says without an unlink).
 */
async function memoUnlink(ctx: Ctx, part: GraphPart, intent: StoredIntent, clueTexts: string[], quote: string, day: string | null): Promise<WriteOutcome | null> {
  const access = ctx.records?.privateEvents;
  if (!access || !ctx.scope) return null;
  const all = await eventCandidates(ctx, { clues: clueTexts, quote });
  const events = matchEvents(all, clueTexts, quote, day, ctx.timeZone).filter((event) => event.ref.kind === "private");
  if (events.length !== 1) return null;
  const event = events[0];
  const references = (await access.references(ctx.scope.accountId, event.ref.id).catch(() => null))?.filter((ref) => ref.kind === "memo") ?? [];
  const eventKey = squash(event.title);
  const memoClues = clueTexts.map(squash).filter((key) => key.length >= 2 && !eventKey.includes(key) && !key.includes(eventKey));
  const named = memoClues.length ? references.filter((ref) => memoClues.some((key) => squash(ref.label).includes(key) || key.includes(squash(ref.label)))) : references;
  if (named.length !== 1) return null;
  const view = (await ctx.records!.reader.read("memo", ctx.scope, { id: named[0].id }).catch(() => null))?.items[0];
  if (!view) return null;
  const current = refsFrom(view.fields.eventRefs);
  const rest = current.filter((item) => !(item.kind === "private" && item.id === event.ref.id));
  if (rest.length === current.length) return null;
  const labels = (list: typeof current) => list.map((item) => all.find((candidate) => refKey(candidate.ref) === refKey(item))?.title ?? item.id);
  emitTrace({ memo: view.id, partId: part.localId, type: "propose.memo_unlinked" });
  return { kind: "ready", ops: [{ before: { eventRefs: current }, capability: "memo.update", expectedVersion: Number(view.fields.version ?? 1), links: true, localId: intent.localId, partId: part.localId, set: { eventRefs: rest }, shown: { events: { after: labels(rest), before: labels(current) }, title: named[0].label }, targetId: view.id } as CardOperationIntent & { localId: string }] };
}

/**
 * Deleting a private event (D7): what links to it is listed and the user picks (in these words, or with a click), then one
 * card — the «我去过» deleted or moved, each memo, to-do and schedule item unlinked, the event deleted last.
 */
async function resolveDeletePlan(ctx: Ctx, part: GraphPart, write: PartWrite & { picks: PartWrite["picks"] & { eventPlan?: string } }, intent: StoredIntent, clueTexts: string[], quote: string, failedLine: string): Promise<WriteOutcome> {
  const language = ctx.language;
  const zone = ctx.timeZone;
  const stop = (reason: string, line: string): WriteOutcome => ({ kind: "stop", line, reason });
  const base = { partId: part.localId };
  const access = ctx.records?.privateEvents;
  if (!access || !ctx.scope) return stop("read_failed", failedLine);
  const all = await eventCandidates(ctx);
  const bound = part.refs.find((ref) => ref.recordId?.startsWith("private_event:"))?.recordId ?? null;
  let target = bound ? all.find((event) => event.ref.id === bound) ?? null : null;
  if (!target) {
    const named = clueTexts.filter((clue) => squash(clue).length >= 2);
    const matched = await eventsNamed(ctx, { clues: named, partId: part.localId, quote: named.length ? quote : ctx.message, verb: "delete" }, () => (named.length ? matchEvents(all, named, quote, null, zone) : matchEvents(all, [], ctx.message, null, zone)));
    target = matched.find((event) => event.ref.kind === "private") ?? null;
    if (!target && matched[0]?.ref.kind === "platform") return stop("platform_event", EVENT_WORDS.platformLocked(language, matched[0].title));
  }
  if (!target && ctx.context && !ctx.context.idle) {
    // "然后把活动删了": the private event this conversation mentioned last.
    const last = ctx.context.lastMentioned.find((item) => item.id.startsWith("private_event:"));
    if (last) target = all.find((event) => event.ref.id === last.id) ?? null;
  }
  if (!target) return stop("event_not_found", EVENT_WORDS.privateNotFound(language, clueTexts[0] ?? quote));
  const event = await access.get(ctx.scope.accountId, target.ref.id).catch(() => null);
  if (!event) return stop("read_failed", failedLine);
  // The next message's "这场活动" finds this one.
  ctx.names?.set(event.id, event.title);
  if (!part.refs.some((ref) => ref.recordId === event.id)) part.refs.push({ entity: "event", quote: null, recordId: event.id });
  const references = await access.references(ctx.scope.accountId, event.id).catch(() => null);
  if (!references) return stop("read_failed", failedLine);
  const deleteOp = { ...base, capability: "privateEvent.delete", expectedVersion: event.version, localId: `${intent.localId}:delete`, shown: { references: references.length, startsAt: event.startsAt, title: event.title, ...(event.allDay ? { allDay: true } : {}) }, targetId: event.id } as CardOperationIntent & { localId: string };
  if (!references.length) return { kind: "ready", ops: [deleteOp] };
  const hasAttendance = references.some((ref) => ref.kind === "attendance");
  const message = ctx.message;
  const pick = write.picks.eventPlan
    ?? (hasAttendance
      ? (ATTEND_MOVE.test(message) && ATTEND_WORD.test(message) ? "move_attendance" : ATTEND_WORD.test(message) && ATTEND_DELETE.test(message.replace(quote, "")) || (ATTEND_WORD.test(quote) && ATTEND_DELETE.test(quote) && UNLINK_WORDS.test(message)) ? "delete_attendance" : null)
      : UNLINK_WORDS.test(message) ? "unlink" : null);
  const unlinkSaid = UNLINK_WORDS.test(message) || pick === "delete_attendance" || pick === "unlink";
  if (pick === "keep") return stop("kept", EVENT_WORDS.deleteKeep(language));
  if (pick === "move_attendance") return stop("move_where", EVENT_WORDS.moveWhere(language));
  if (!pick || (references.some((ref) => ref.kind !== "attendance") && !unlinkSaid)) {
    const lines = references.map((ref) => EVENT_WORDS.refLine(language, ref.kind, ref.label, ref.kind === "attendance" ? dayText(ref.label, language) : undefined));
    emitTrace({ partId: part.localId, references: references.map((ref) => ({ id: ref.id, kind: ref.kind })), type: "propose.event_delete_plan_asked" });
    return { kind: "ask", question: { hasAttendance, line: EVENT_WORDS.askDeletePlan(language, event.title, lines, hasAttendance, [...new Set(references.map((ref) => ref.kind as string))].filter((kind): kind is "memo" | "todo" | "schedule" => kind === "memo" || kind === "todo" || kind === "schedule")), options: EVENT_WORDS.planOptions(language, hasAttendance), type: "event_plan" } } as unknown as WriteOutcome;
  }
  const ops: (CardOperationIntent & { localId: string })[] = [];
  const eventShown = { kind: "private" as const, startsAt: event.startsAt, title: event.title };
  const notes = hasAttendance ? await ctx.records!.attendance?.list(ctx.scope.accountId).catch(() => null) : [];
  if (notes === null || notes === undefined) return stop("read_failed", failedLine);
  for (const ref of references) {
    const localId = `${intent.localId}:${ref.kind}:${ref.id}`;
    if (ref.kind === "attendance") {
      const note = notes.find((item) => item.id === ref.id);
      if (!note) return stop("read_failed", failedLine);
      ops.push({ ...base, capability: "attendance.delete", expectedVersion: note.version, localId, shown: { attendedOn: note.attendedOn, event: eventShown }, targetId: note.id } as CardOperationIntent & { localId: string });
      continue;
    }
    const kind = ref.kind === "memo" ? "memo" : ref.kind === "todo" ? "todo" : "schedule";
    const view = (await ctx.records!.reader.read(kind, ctx.scope, { id: ref.id }).catch(() => null))?.items[0];
    if (!view) return stop("read_failed", failedLine);
    const current = refsFrom(view.fields.eventRefs);
    const rest = current.filter((item) => !(item.kind === "private" && item.id === event.id));
    const labels = (list: typeof current) => list.map((item) => (item.kind === "private" && item.id === event.id ? event.title : all.find((candidate) => refKey(candidate.ref) === refKey(item))?.title ?? item.id));
    if (ref.kind === "memo") {
      ops.push({ ...base, before: { eventRefs: current }, capability: "memo.update", expectedVersion: Number(view.fields.version ?? 1), links: true, localId, set: { eventRefs: rest }, shown: { events: { after: labels(rest), before: labels(current) }, title: ref.label }, targetId: view.id } as CardOperationIntent & { localId: string });
    } else if (ref.kind === "todo") {
      ops.push({ ...base, before: { relatedEventRefs: current }, capability: "todo.update", links: true, localId, set: { relatedEventRefs: rest }, shown: { events: { after: labels(rest), before: labels(current) }, title: ref.label }, targetId: view.id } as CardOperationIntent & { localId: string });
    } else {
      const repeats = typeof view.fields.recurrence === "string" ? (view.fields.recurrence as "daily" | "weekly" | "monthly") : null;
      const itemZone = typeof view.fields.timeZone === "string" ? view.fields.timeZone : zone;
      ops.push({ ...base, capability: "schedule.update", localId, set: { eventRefs: rest, scope: repeats ? "whole_series" : "whole_series" }, shown: { before: { endsAt: typeof view.fields.endsAt === "string" ? view.fields.endsAt : null, startsAt: String(view.fields.startsAt) }, eventTitles: { after: labels(rest), before: labels(current) }, repeats, timeZone: itemZone, title: ref.label }, targetId: view.id } as CardOperationIntent & { localId: string });
    }
  }
  ops.push(deleteOp);
  emitTrace({ partId: part.localId, plan: pick, references: references.length, type: "propose.event_delete_plan" });
  return { kind: "ready", ops };
}
