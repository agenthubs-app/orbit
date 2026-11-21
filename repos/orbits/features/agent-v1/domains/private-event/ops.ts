/**
 * agent-design AG13 (设计稿 §4 活动, 附录 B, 附录 E; approved visual draft 2026-11-18): the card items of private events,
 * «我去过» (attendance notes the user records), personal schedule items, the rest of the to-do verbs and the event links
 * of to-dos and memos. Everything a user reads on such an item is written here in the card's language, frozen into the
 * payload and covered by the card hash; no model writes any of it.
 *
 * - An attendance note may point at the private event a card item before it creates: `eventRef: { kind: "private",
 *   localCreateRef: n }` (n counts the card's items from 1). It waits for that item; the runtime puts the new event's id
 *   in at execution (resolveLocalCreateRefs); if the event was not created it is skipped and nothing is left behind.
 * - A repeating schedule item says which it changes: only this time, or the whole series (D6: no toggle on the card).
 * - Deleting a private event is the card's last item; at execution it is looked up again and kept while anything still
 *   links to it, saying which record (outcomeOf).
 */
import type { AgentCardOperationDisplayContract } from "../../../../shared/contract/agent-v1";
import type { AgentActionOperationPayload } from "../../../agent/runtime/contract";
import { dayText, type CardLocale } from "../../../agent/runtime/todo-operations";
import { ATTENDANCE_COLLECTION, PRIVATE_EVENT_COLLECTION } from "../../../events/private-events/records";

export const PRIVATE_EVENT_CREATE = "privateEvent.create";
export const PRIVATE_EVENT_UPDATE = "privateEvent.update";
export const PRIVATE_EVENT_DELETE = "privateEvent.delete";
export const ATTENDANCE_CREATE = "attendance.create";
export const ATTENDANCE_UPDATE = "attendance.update";
export const ATTENDANCE_DELETE = "attendance.delete";
export const SCHEDULE_CREATE = "schedule.create";
export const SCHEDULE_UPDATE = "schedule.update";
export const SCHEDULE_DELETE = "schedule.delete";
export const TODO_COMPLETE = "todo.complete";
export const TODO_REOPEN = "todo.reopen";
export const TODO_DELETE = "todo.delete";

export const EVENT_CARD_CAPABILITIES = [PRIVATE_EVENT_CREATE, PRIVATE_EVENT_UPDATE, PRIVATE_EVENT_DELETE, ATTENDANCE_CREATE, ATTENDANCE_UPDATE, ATTENDANCE_DELETE, SCHEDULE_CREATE, SCHEDULE_UPDATE, SCHEDULE_DELETE, TODO_COMPLETE, TODO_REOPEN, TODO_DELETE] as const;
export type EventCardCapability = (typeof EVENT_CARD_CAPABILITIES)[number];
export const isEventCardCapability = (value: unknown): value is EventCardCapability => (EVENT_CARD_CAPABILITIES as readonly unknown[]).includes(value);

/** The ledger operation type of each (features/agent/ledger/contract.ts). */
export const EVENT_OPERATION_TYPES: Record<EventCardCapability, string> = {
  "attendance.create": "create_attendance",
  "attendance.delete": "delete_attendance",
  "attendance.update": "update_attendance",
  "privateEvent.create": "create_private_event",
  "privateEvent.delete": "delete_private_event",
  "privateEvent.update": "update_private_event",
  "schedule.create": "create_schedule",
  "schedule.delete": "delete_schedule",
  "schedule.update": "update_schedule",
  "todo.complete": "complete_todo",
  "todo.delete": "delete_todo",
  "todo.reopen": "reopen_todo",
};

export type CardEventRef = { kind: "platform" | "private"; id: string } | { kind: "private"; localCreateRef: number };
export type DayPart = "morning" | "noon" | "afternoon" | "evening" | "night";
/** How the card names an event: its title and when it starts (a platform or private one). */
export interface EventShown { title: string; startsAt?: string | null; kind: "platform" | "private" }

export type EventCardIntent =
  | { capability: typeof PRIVATE_EVENT_CREATE; set: { title: string; startsAt: string; endsAt?: string; venue?: string; /** AG20a R5: a day said without a clock time (startsAt is 00:00 of that day). */ allDay?: boolean } }
  | { capability: typeof PRIVATE_EVENT_UPDATE; targetId: string; expectedVersion: number; set: { title?: string; startsAt?: string; endsAt?: string | null; venue?: string | null; allDay?: null }; shown: { title: string; before: Record<string, string | null>; /** AG20a: the event is all day (its start shows as the day and 全天). */ allDay?: boolean } }
  | { capability: typeof PRIVATE_EVENT_DELETE; targetId: string; expectedVersion: number; shown: { title: string; startsAt: string; references: number; allDay?: boolean } }
  | { capability: typeof ATTENDANCE_CREATE; set: { eventRef: CardEventRef; attendedOn: string; dayParts?: DayPart[]; selfNote?: string }; shown: { event: EventShown | null } }
  | { capability: typeof ATTENDANCE_UPDATE; targetId: string; expectedVersion: number; set: { eventRef: { kind: "platform" | "private"; id: string } }; shown: { from: EventShown; to: EventShown; attendedOn: string } }
  | { capability: typeof ATTENDANCE_DELETE; targetId: string; expectedVersion: number; shown: { event: EventShown; attendedOn: string } }
  | { capability: typeof SCHEDULE_CREATE; set: { title: string; startsAt: string; endsAt?: string; timeZone: string; /** AG20a: made from an all-day event — the whole day, never 00:00–00:00. */ allDay?: boolean; eventRefs?: { kind: "platform" | "private"; id: string }[]; contactIds?: string[] }; shown: { events: EventShown[]; names?: Record<string, string>; /** AG20a R6: the user's words for a zone other than their own ("伦敦时间"). */ zoneLabel?: string } }
  | { capability: typeof SCHEDULE_UPDATE; targetId: string; set: { scope: "this_occurrence" | "whole_series"; occurrenceDate?: string; startsAt?: string; endsAt?: string; eventRefs?: { kind: "platform" | "private"; id: string }[] }; shown: { title: string; before: { startsAt: string; endsAt?: string | null }; timeZone: string; repeats?: "daily" | "weekly" | "monthly" | null; eventTitles?: { before: string[]; after: string[] } } }
  | { capability: typeof SCHEDULE_DELETE; targetId: string; set: { scope: "this_occurrence" | "whole_series" | "single"; occurrenceDate?: string }; shown: { title: string; startsAt: string; timeZone: string; repeats?: "daily" | "weekly" | "monthly" | null } }
  | { capability: typeof TODO_COMPLETE | typeof TODO_REOPEN | typeof TODO_DELETE; targetId: string; shown: { title: string; status: string } };

/** to-do event/person links (todo.update) and memo event links (memo.update): the whole lists after the change. */
export interface LinkChangeShown {
  title: string;
  people?: { before: string[]; after: string[] };
  events?: { before: string[]; after: string[] };
}

type Words = {
  privateEvent: (title: string) => string;
  attendance: string;
  schedule: (title: string) => string;
  todo: (title: string) => string;
  memo: (title: string) => string;
  time: string;
  venue: string;
  visible: string;
  onlyYou: string;
  event: string;
  day: string;
  newEventAbove: (n: number) => string;
  waitsEvent: (n: number) => string;
  selfRecorded: string;
  scheduleOnly: string;
  scope: string;
  thisTime: string;
  wholeSeries: (repeats: string) => string;
  whichTime: string;
  restUnchanged: (repeats: string, time: string) => string;
  linksKept: string;
  repeats: Record<"daily" | "weekly" | "monthly", (weekday: string) => string>;
  status: string;
  open: string;
  completed: string;
  deleteForever: string;
  deleteLast: string;
  people: string;
  events: string;
  none: string;
  noLonger: string;
  memoKept: string;
  todoKept: (status: string) => string;
  keptAndAdded: (kept: string[], added: string[]) => string;
  join: string;
  dayPart: Record<DayPart, string>;
  platform: string;
  moveFrom: string;
  attendanceDeleteNote: string;
  kept: (labels: string) => string;
  keptRecord: Record<"attendance" | "memo" | "todo" | "schedule", (label: string) => string>;
};

const WORDS: Record<CardLocale, Words> = {
  zh: {
    attendance: "我去过（自己记的）", attendanceDeleteNote: "只删你自己记的这一条，主办方的签到和报名不受影响。", completed: "已完成", day: "日期", dayPart: { afternoon: "下午", evening: "晚上", morning: "上午", night: "夜里", noon: "中午" },
    deleteForever: "删了找不回。", deleteLast: "最后做。到时如果又有记录关联了它，就先不删，并告诉你是哪一条。", event: "活动", events: "关联活动",
    join: "、", keptAndAdded: (kept, added) => [kept.length ? `原有的${kept.map((item) => `「${item}」`).join("")}保留` : "", added.length ? `新加：${added.join("、")}` : ""].filter(Boolean).join("；") + "。",
    kept: (labels) => `活动没有删：${labels}还关联着它，先保留。`, keptRecord: { attendance: (label) => `「我去过」（${label}）`, memo: (label) => `笔记「${label}」`, schedule: (label) => `日程「${label}」`, todo: (label) => `待办「${label}」` },
    linksKept: "关联的人和笔记保留。", memo: (title) => `笔记「${title}」`, memoKept: "笔记原文不变。", moveFrom: "原来的活动", newEventAbove: (n) => `上面第 ${n} 项新建的这场`,
    noLonger: "不再关联", none: "无", onlyYou: "只有你", open: "未完成", people: "关联的人", platform: "平台活动", privateEvent: (title) => `私人活动「${title}」`,
    repeats: { daily: () => "每天", monthly: () => "每月", weekly: (weekday) => `每${weekday}` }, restUnchanged: (repeats, time) => `以后${repeats}照旧 ${time}。`,
    schedule: (title) => `日程「${title}」`, scheduleOnly: "只加进你的日程，不会替你报名。", scope: "改哪些", selfRecorded: "这是你自己记的，不会替你签到或报名。", status: "状态",
    thisTime: "只改这一次", time: "时间", todo: (title) => `待办「${title}」`, todoKept: (status) => `待办本身不变，还是${status}。`, venue: "地点", visible: "谁能看到",
    waitsEvent: (n) => `第 ${n} 项建好后才记这一项；第 ${n} 项没建成，这项也不记。`, whichTime: "哪一次", wholeSeries: (repeats) => `整个系列 · ${repeats}`,
  },
  ja: {
    attendance: "行った（自分で記録）", attendanceDeleteNote: "削除するのはご自身の記録だけです。主催者のチェックインや申込には影響しません。", completed: "完了", day: "日付", dayPart: { afternoon: "午後", evening: "夜", morning: "午前", night: "深夜", noon: "昼" },
    deleteForever: "削除すると元に戻せません。", deleteLast: "最後に行います。その時点で別の記録がこのイベントに紐づいていたら削除せず、どの記録かお知らせします。", event: "イベント", events: "関連イベント",
    join: "、", keptAndAdded: (kept, added) => [kept.length ? `既存の${kept.map((item) => `「${item}」`).join("")}はそのまま` : "", added.length ? `追加：${added.join("、")}` : ""].filter(Boolean).join("。") + "。",
    kept: (labels) => `イベントは削除していません。${labels}がまだ紐づいているため、残しています。`, keptRecord: { attendance: (label) => `「行った」の記録（${label}）`, memo: (label) => `メモ「${label}」`, schedule: (label) => `予定「${label}」`, todo: (label) => `タスク「${label}」` },
    linksKept: "関連する人とメモはそのままです。", memo: (title) => `メモ「${title}」`, memoKept: "メモの本文は変わりません。", moveFrom: "元のイベント", newEventAbove: (n) => `上の ${n} 件目で作るイベント`,
    noLonger: "紐づけを外す", none: "なし", onlyYou: "あなただけ", open: "未完了", people: "関連する人", platform: "プラットフォームのイベント", privateEvent: (title) => `プライベートイベント「${title}」`,
    repeats: { daily: () => "毎日", monthly: () => "毎月", weekly: (weekday) => `毎週${weekday}曜` }, restUnchanged: (repeats, time) => `ほかの回は${repeats} ${time}のままです。`,
    schedule: (title) => `予定「${title}」`, scheduleOnly: "予定に入れるだけで、申込はしません。", scope: "対象", selfRecorded: "ご自身の記録です。チェックインや申込の代わりにはなりません。", status: "状態",
    thisTime: "今回だけ", time: "時間", todo: (title) => `タスク「${title}」`, todoKept: (status) => `タスク自体は変わらず、${status}のままです。`, venue: "場所", visible: "公開範囲",
    waitsEvent: (n) => `${n} 件目が作成できてから記録します。${n} 件目が作成できなければ、この項目も記録しません。`, whichTime: "どの回", wholeSeries: (repeats) => `シリーズ全体 · ${repeats}`,
  },
  en: {
    attendance: "I went (my own note)", attendanceDeleteNote: "Only your own note is deleted; the organizer's check-in and registration are not touched.", completed: "done", day: "Date", dayPart: { afternoon: "afternoon", evening: "evening", morning: "morning", night: "night", noon: "midday" },
    deleteForever: "Deleted for good; it cannot be brought back.", deleteLast: "Done last. If another record links to it by then, it is kept and you are told which.", event: "Event", events: "Linked events",
    join: ", ", keptAndAdded: (kept, added) => [kept.length ? `${kept.map((item) => `"${item}"`).join(", ")} stays` : "", added.length ? `added: ${added.join(", ")}` : ""].filter(Boolean).join("; ") + ".",
    kept: (labels) => `The event was not deleted: ${labels} still links to it, so it is kept.`, keptRecord: { attendance: (label) => `the "I went" note (${label})`, memo: (label) => `the note "${label}"`, schedule: (label) => `the schedule item "${label}"`, todo: (label) => `the to-do "${label}"` },
    linksKept: "The linked people and notes stay.", memo: (title) => `Note "${title}"`, memoKept: "The note's text does not change.", moveFrom: "From event", newEventAbove: (n) => `the event item ${n} above creates`,
    noLonger: "no longer linked", none: "none", onlyYou: "Only you", open: "open", people: "Linked people", platform: "platform event", privateEvent: (title) => `Private event "${title}"`,
    repeats: { daily: () => "every day", monthly: () => "every month", weekly: (weekday) => `every ${weekday}` }, restUnchanged: (repeats, time) => `The other times stay ${repeats} ${time}.`,
    schedule: (title) => `Schedule item "${title}"`, scheduleOnly: "Only added to your schedule; you are not registered.", scope: "Changes", selfRecorded: "This is your own note; it does not check you in or register you.", status: "Status",
    thisTime: "Only this time", time: "Time", todo: (title) => `To-do "${title}"`, todoKept: (status) => `The to-do itself does not change; it stays ${status}.`, venue: "Place", visible: "Who can see it",
    waitsEvent: (n) => `Recorded only after item ${n} is created; if item ${n} is not created, this is not recorded either.`, whichTime: "Which time", wholeSeries: (repeats) => `The whole series · ${repeats}`,
  },
};

const WEEKDAY: Record<CardLocale, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};

function local(value: string, timeZone: string): { day: string; time: string; weekday: number } {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { day: "2-digit", hour: "2-digit", hourCycle: "h23", minute: "2-digit", month: "2-digit", timeZone, weekday: "short", year: "numeric" }).formatToParts(new Date(value)).map((part) => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  return { day, time: `${parts.hour}:${parts.minute}`, weekday: new Date(`${day}T00:00:00Z`).getUTCDay() };
}

/** "11月14日（周六）19:00". */
export function whenText(value: string, locale: CardLocale, timeZone: string): string {
  const at = local(value, timeZone);
  // R03: no space between a Chinese or Japanese date and the time ("11月14日（周六）19:00").
  return `${dayText(at.day, locale)}${locale === "en" ? " " : ""}${at.time}`;
}

/** AG20a: what an all-day event shows in the place of the clock time. */
export const ALL_DAY_WORDS: Record<CardLocale, string> = { en: "All day", ja: "終日", zh: "全天" };

/** AG20a: "2月6日（周六）全天" — an all-day event's day and 全天 where the time would be (whenText's layout). */
export function allDayText(value: string, locale: CardLocale, timeZone: string): string {
  return `${dayText(local(value, timeZone).day, locale)}${locale === "en" ? " " : ""}${ALL_DAY_WORDS[locale]}`;
}

/** whenText, or allDayText for an all-day event. */
export function eventWhenText(value: string, allDay: boolean | null | undefined, locale: CardLocale, timeZone: string): string {
  return allDay ? allDayText(value, locale, timeZone) : whenText(value, locale, timeZone);
}

/** "10:00–11:00", or the start alone. */
function spanText(startsAt: string, endsAt: string | null | undefined, timeZone: string): string {
  const start = local(startsAt, timeZone).time;
  return endsAt ? `${start}–${local(endsAt, timeZone).time}` : start;
}

export function eventLabel(event: EventShown | null, locale: CardLocale, timeZone: string): string {
  if (!event) return "";
  const when = event.startsAt ? dayText(local(event.startsAt, timeZone).day, locale) : "";
  return locale === "en" ? `${event.title}${when ? ` · ${when}` : ""}` : `${event.title}${when ? ` · ${when}` : ""}`;
}

function repeatsText(repeats: "daily" | "weekly" | "monthly" | null | undefined, startsAt: string, locale: CardLocale, timeZone: string): string {
  if (!repeats) return "";
  return WORDS[locale].repeats[repeats](WEEKDAY[locale][local(startsAt, timeZone).weekday]);
}

function base(input: { actionId: string; revision: number; index: number; partId?: string }) {
  return {
    compensation: { supported: false },
    dependsOn: [] as string[],
    effects: [] as string[],
    idempotencyKey: `${input.actionId}:r${input.revision}:op${input.index + 1}`,
    operationId: `${input.actionId}:op${input.index + 1}`,
    partId: input.partId ?? "p1",
    payloadVersion: 1,
    riskLevel: "write" as const,
  };
}

const textOf = (display: AgentCardOperationDisplayContract, locale: CardLocale) => {
  const rows = display.rows.map((row) => (row.before !== undefined ? `${row.label} ${row.before} → ${row.after}` : `${row.label} ${row.after}`)).join(locale === "en" ? "; " : "，");
  const verb = display.change === "create" ? (locale === "en" ? "Add" : locale === "ja" ? "追加" : "新增") : display.change === "delete" ? (locale === "en" ? "Delete" : locale === "ja" ? "削除" : "删除") : locale === "en" ? "Change" : locale === "ja" ? "変更" : "改";
  return `${verb} ${display.record}${rows ? (locale === "en" ? `: ${rows}` : `：${rows}`) : ""}${display.note ? (locale === "en" ? ` (${display.note})` : `（${display.note}）`) : ""}`;
};

/** Freezes one AG13 item. The data was read when the intent was made (propose/resolve); the executor checks it again. */
export function prepareEventOperation(input: { intent: EventCardIntent & { partId?: string }; actionId: string; revision: number; index: number; locale: CardLocale; timeZone?: string }): AgentActionOperationPayload {
  const { intent, locale } = input;
  const zone = input.timeZone ?? process.env.ORBIT_DEFAULT_TIME_ZONE ?? "Asia/Tokyo";
  const w = WORDS[locale];
  const common = { ...base({ ...input, partId: intent.partId }), capability: intent.capability, executorKey: intent.capability, operationType: EVENT_OPERATION_TYPES[intent.capability] as AgentActionOperationPayload["operationType"] };
  const done = (op: Omit<AgentActionOperationPayload, keyof typeof common | "preview"> & { display: AgentCardOperationDisplayContract }): AgentActionOperationPayload => ({ ...common, ...op, preview: textOf(op.display, locale) });
  switch (intent.capability) {
    case PRIVATE_EVENT_CREATE: {
      const set = intent.set;
      const after = { startsAt: set.startsAt, title: set.title, ...(set.endsAt ? { endsAt: set.endsAt } : {}), ...(set.venue ? { venue: set.venue } : {}), ...(set.allDay ? { allDay: true } : {}) };
      return done({ after, display: { change: "create", record: w.privateEvent(set.title), rows: [
        // AG20a R5: an all-day event shows its day and 全天 where the time would be.
        { after: set.allDay ? allDayText(set.startsAt, locale, zone) : set.endsAt ? `${whenText(set.startsAt, locale, zone)}–${local(set.endsAt, zone).time}` : whenText(set.startsAt, locale, zone), field: "startsAt", label: w.time },
        ...(set.venue ? [{ after: set.venue, field: "venue", label: w.venue }] : []),
        { after: w.onlyYou, field: "visibility", label: w.visible },
      ] }, payload: { ...after }, preconditions: { targetExists: false } });
    }
    case PRIVATE_EVENT_UPDATE: {
      // AG20a: allDay cleared with a new time is not a row of its own (the time row says it).
      const rows = Object.entries(intent.set).filter(([field]) => field !== "allDay").map(([field, value]) => ({
        after: value === null ? w.none : field === "startsAt" ? eventWhenText(String(value), intent.shown.allDay && intent.set.allDay !== null, locale, zone) : field === "endsAt" ? whenText(String(value), locale, zone) : String(value),
        before: intent.shown.before[field] === null || intent.shown.before[field] === undefined ? w.none : field === "startsAt" ? eventWhenText(String(intent.shown.before[field]), intent.shown.allDay, locale, zone) : field === "endsAt" ? whenText(String(intent.shown.before[field]), locale, zone) : String(intent.shown.before[field]),
        field, label: field === "venue" ? w.venue : field === "title" ? (locale === "en" ? "Title" : locale === "ja" ? "名前" : "名称") : w.time,
      }));
      return done({ after: { ...intent.set }, before: { ...intent.shown.before }, display: { change: "update", record: w.privateEvent(intent.shown.title), rows }, payload: { eventId: intent.targetId, expectedVersion: intent.expectedVersion, patch: { ...intent.set } }, preconditions: { targetExists: true, versionToken: String(intent.expectedVersion) }, shown: { ...intent.shown }, targetRef: { collection: PRIVATE_EVENT_COLLECTION, id: intent.targetId } });
    }
    case PRIVATE_EVENT_DELETE:
      return done({ after: { deleted: true }, display: { change: "delete", note: w.deleteLast, record: w.privateEvent(intent.shown.title), rows: [{ after: eventWhenText(intent.shown.startsAt, intent.shown.allDay, locale, zone), field: "startsAt", label: w.time }] }, payload: { eventId: intent.targetId, expectedVersion: intent.expectedVersion }, preconditions: { targetExists: true, versionToken: String(intent.expectedVersion) }, shown: { ...intent.shown }, targetRef: { collection: PRIVATE_EVENT_COLLECTION, id: intent.targetId } });
    case ATTENDANCE_CREATE: {
      const set = intent.set;
      const ref = set.eventRef;
      const local = "localCreateRef" in ref ? ref.localCreateRef : null;
      const after = { attendedOn: set.attendedOn, eventRef: { ...ref }, ...(set.dayParts?.length ? { dayParts: [...set.dayParts] } : {}), ...(set.selfNote ? { selfNote: set.selfNote } : {}) };
      const dayLine = `${dayText(set.attendedOn, locale)}${set.dayParts?.length ? `${locale === "en" ? ", " : ""}${set.dayParts.map((part) => w.dayPart[part]).join(w.join)}` : ""}`;
      return done({ after, display: { change: "create", note: local !== null ? `${w.waitsEvent(local)}${locale === "en" ? " " : ""}${w.selfRecorded}` : w.selfRecorded, record: w.attendance, rows: [
        { after: local !== null ? w.newEventAbove(local) : `${eventLabel(intent.shown.event, locale, zone)}${intent.shown.event?.kind === "platform" ? (locale === "en" ? ` (${w.platform})` : `（${w.platform}）`) : ""}`, field: "eventRef", label: w.event },
        { after: dayLine, field: "attendedOn", label: w.day },
      ] }, payload: { ...after }, preconditions: { targetExists: false }, shown: { event: intent.shown.event } });
    }
    case ATTENDANCE_UPDATE:
      return done({ after: { eventRef: { ...intent.set.eventRef } }, before: { eventRef: null }, display: { change: "update", record: w.attendance, rows: [{ after: eventLabel(intent.shown.to, locale, zone), before: eventLabel(intent.shown.from, locale, zone), field: "eventRef", label: w.event }] }, payload: { attendanceId: intent.targetId, expectedVersion: intent.expectedVersion, patch: { eventRef: { ...intent.set.eventRef } } }, preconditions: { targetExists: true, versionToken: String(intent.expectedVersion) }, shown: { ...intent.shown }, targetRef: { collection: ATTENDANCE_COLLECTION, id: intent.targetId } });
    case ATTENDANCE_DELETE:
      return done({ after: { deleted: true }, display: { change: "delete", note: w.attendanceDeleteNote, record: w.attendance, rows: [{ after: `${intent.shown.event.title} · ${dayText(intent.shown.attendedOn, locale)}`, field: "eventRef", label: w.event }] }, payload: { attendanceId: intent.targetId, expectedVersion: intent.expectedVersion }, preconditions: { targetExists: true, versionToken: String(intent.expectedVersion) }, shown: { ...intent.shown }, targetRef: { collection: ATTENDANCE_COLLECTION, id: intent.targetId } });
    case SCHEDULE_CREATE: {
      const set = intent.set;
      const after = { endsAt: set.endsAt, startsAt: set.startsAt, timeZone: set.timeZone, title: set.title, ...(set.allDay ? { allDay: true } : {}), ...(set.eventRefs?.length ? { eventRefs: set.eventRefs.map((ref) => ({ ...ref })) } : {}), ...(set.contactIds?.length ? { contactIds: [...set.contactIds] } : {}) };
      const rows = [
        { after: `${set.allDay ? allDayText(set.startsAt, locale, set.timeZone) : `${dayText(local(set.startsAt, set.timeZone).day, locale)}${locale === "en" ? " " : ""}${spanText(set.startsAt, set.endsAt, set.timeZone)}`}${intent.shown.zoneLabel ? (locale === "en" ? ` (${intent.shown.zoneLabel})` : `（${intent.shown.zoneLabel}）`) : ""}`, field: "startsAt", label: w.time },
        ...(intent.shown.events.length ? [{ after: intent.shown.events.map((event) => `${event.title}${event.kind === "platform" ? (locale === "en" ? ` (${w.platform})` : `（${w.platform}）`) : ""}`).join(w.join), field: "eventRefs", label: w.event }] : []),
        ...(set.contactIds?.length ? [{ after: set.contactIds.map((id) => intent.shown.names?.[id] ?? id).join(w.join), field: "contactIds", label: w.people }] : []),
      ];
      return done({ after: Object.fromEntries(Object.entries(after).filter(([, value]) => value !== undefined)), display: { change: "create", ...(intent.shown.events.some((event) => event.kind === "platform") ? { note: w.scheduleOnly } : {}), record: w.schedule(set.title), rows }, payload: Object.fromEntries(Object.entries(after).filter(([, value]) => value !== undefined)), preconditions: { targetExists: false }, shown: { ...intent.shown } });
    }
    case SCHEDULE_UPDATE: {
      const set = intent.set;
      const shown = intent.shown;
      const repeats = repeatsText(shown.repeats, shown.before.startsAt, locale, shown.timeZone);
      const rows: AgentCardOperationDisplayContract["rows"][number][] = [];
      if (set.scope === "this_occurrence" && set.occurrenceDate) rows.push({ after: dayText(set.occurrenceDate, locale), field: "occurrenceDate", label: w.whichTime });
      if (set.startsAt || set.endsAt) rows.push({ after: spanText(set.startsAt ?? shown.before.startsAt, set.endsAt ?? shown.before.endsAt, shown.timeZone), before: spanText(shown.before.startsAt, shown.before.endsAt, shown.timeZone), field: "startsAt", label: w.time });
      if (set.eventRefs && shown.eventTitles) rows.push({ after: shown.eventTitles.after.join(w.join) || w.noLonger, before: shown.eventTitles.before.join(w.join) || w.none, field: "eventRefs", label: w.events });
      const note = set.scope === "this_occurrence" && repeats ? w.restUnchanged(repeats, spanText(shown.before.startsAt, shown.before.endsAt, shown.timeZone)) : set.scope === "whole_series" ? w.linksKept : undefined;
      const scope = set.scope === "this_occurrence" ? w.thisTime : set.scope === "whole_series" && repeats ? w.wholeSeries(repeats) : "";
      const target = set.scope === "this_occurrence" && set.occurrenceDate ? `${intent.targetId}:occurrence:${set.occurrenceDate}` : intent.targetId;
      return done({ after: { ...set }, before: { endsAt: shown.before.endsAt ?? null, startsAt: shown.before.startsAt }, display: { change: "update", ...(note ? { note } : {}), record: `${w.schedule(shown.title)}${scope ? ` · ${scope}` : ""}`, rows }, payload: { patch: Object.fromEntries(Object.entries({ endsAt: set.endsAt, eventRefs: set.eventRefs, startsAt: set.startsAt }).filter(([, value]) => value !== undefined)), scheduleId: target, scope: set.scope === "this_occurrence" ? "occurrence" : set.scope === "whole_series" ? "series" : undefined, shownBefore: { ...shown.before } }, preconditions: { targetExists: true }, shown: { ...shown }, targetRef: { collection: "personal_schedule_items", id: intent.targetId } });
    }
    case SCHEDULE_DELETE: {
      const set = intent.set;
      const shown = intent.shown;
      const repeats = repeatsText(shown.repeats, shown.startsAt, locale, shown.timeZone);
      const target = set.scope === "this_occurrence" && set.occurrenceDate ? `${intent.targetId}:occurrence:${set.occurrenceDate}` : intent.targetId;
      return done({ after: { ...set, deleted: true }, display: { change: "delete", record: `${w.schedule(shown.title)}${set.scope === "this_occurrence" ? ` · ${w.thisTime}` : set.scope === "whole_series" && repeats ? ` · ${w.wholeSeries(repeats)}` : ""}`, rows: [{ after: set.occurrenceDate ? dayText(set.occurrenceDate, locale) : whenText(shown.startsAt, locale, shown.timeZone), field: "occurrenceDate", label: set.occurrenceDate ? w.whichTime : w.time }] }, payload: { scheduleId: target, scope: set.scope === "this_occurrence" ? "occurrence" : set.scope === "whole_series" ? "series" : undefined, shownStartsAt: shown.startsAt }, preconditions: { targetExists: true }, shown: { ...shown }, targetRef: { collection: "personal_schedule_items", id: intent.targetId } });
    }
    case TODO_COMPLETE:
    case TODO_REOPEN: {
      const to = intent.capability === TODO_COMPLETE ? "completed" : "open";
      return done({ after: { status: to }, before: { status: intent.shown.status }, display: { change: "update", record: w.todo(intent.shown.title), rows: [{ after: to === "completed" ? w.completed : w.open, before: intent.shown.status === "completed" ? w.completed : w.open, field: "status", label: w.status }] }, payload: { taskId: intent.targetId, shownStatus: intent.shown.status, shownTitle: intent.shown.title }, preconditions: { targetExists: true }, shown: { ...intent.shown }, targetRef: { collection: "tasks", id: intent.targetId } });
    }
    case TODO_DELETE:
      return done({ after: { deleted: true }, display: { change: "delete", note: w.deleteForever, record: w.todo(intent.shown.title), rows: [] }, payload: { shownTitle: intent.shown.title, taskId: intent.targetId }, preconditions: { targetExists: true }, shown: { ...intent.shown }, targetRef: { collection: "tasks", id: intent.targetId } });
    default:
      throw new Error(`unknown AG13 card item ${(intent as { capability: string }).capability}`);
  }
}

/** The rows of a to-do's or memo's link change (todo.update / memo.update): people and events, before → after. */
export function linkChangeDisplay(kind: "todo" | "memo", shown: LinkChangeShown, locale: CardLocale, status?: string): AgentCardOperationDisplayContract {
  const w = WORDS[locale];
  const rows: AgentCardOperationDisplayContract["rows"][number][] = [];
  const list = (items: string[], empty: string) => (items.length ? items.join(w.join) : empty);
  if (shown.people) rows.push({ after: list(shown.people.after, w.noLonger), before: list(shown.people.before, w.none), field: kind === "todo" ? "relatedContactIds" : "contactIds", label: w.people });
  if (shown.events) rows.push({ after: list(shown.events.after, w.noLonger), before: list(shown.events.before, w.none), field: kind === "todo" ? "relatedEventRefs" : "eventRefs", label: w.events });
  const removedOnly = [shown.people, shown.events].every((side) => !side || side.after.every((item) => side.before.includes(item)));
  const kept = [shown.people, shown.events].flatMap((side) => (side ? side.before.filter((item) => side.after.includes(item)) : []));
  const added = [shown.people, shown.events].flatMap((side) => (side ? side.after.filter((item) => !side.before.includes(item)) : []));
  const note = removedOnly ? (kind === "memo" ? w.memoKept : w.todoKept(status === "completed" ? w.completed : w.open)) : w.keptAndAdded(kept, added);
  return { change: "update", note, record: kind === "memo" ? w.memo(shown.title) : w.todo(shown.title), rows };
}

export function linkChangeText(display: AgentCardOperationDisplayContract, locale: CardLocale): string {
  return textOf(display, locale);
}

/**
 * What a kept private event's item says (the executor's message `KEPT_REFERENCED:` + JSON of the references), in the
 * card's language; null for any other outcome.
 */
export function outcomeOf(summary: string | undefined, locale: CardLocale): string | null {
  const match = /^KEPT_REFERENCED:([\s\S]*)$/u.exec(summary ?? "");
  if (!match) return null;
  try {
    const refs = JSON.parse(match[1]) as { kind: "attendance" | "memo" | "todo" | "schedule"; label: string }[];
    const w = WORDS[locale];
    return w.kept(refs.map((ref) => w.keptRecord[ref.kind]?.(ref.label) ?? ref.label).join(w.join));
  } catch {
    return null;
  }
}

/**
 * The card's items with an attendance note on a private event the same card creates: its `localCreateRef: n` becomes the
 * id the n-th item's receipt holds (`private_events:<id>`). Null when that item has no receipt with an id (it did not run).
 */
export function resolveLocalCreateRefs(payload: Readonly<Record<string, unknown>>, createdIdOf: (position: number) => string | null): Readonly<Record<string, unknown>> | null {
  const ref = payload.eventRef as { kind?: string; localCreateRef?: unknown } | undefined;
  if (!ref || typeof ref.localCreateRef !== "number") return payload;
  const id = createdIdOf(ref.localCreateRef);
  if (!id) return null;
  return { ...payload, eventRef: { id, kind: "private" } };
}
