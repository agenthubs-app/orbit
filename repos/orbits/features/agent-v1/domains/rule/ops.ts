/**
 * agent-design AG15 `prepare` for scheduled rules (设计稿 §5.3, §10, 附录 B「定时规则」; PLANNER 易错边界 1).
 *
 * A rule is made, changed, paused, resumed or removed only through a confirmation card. The card of a new rule lists,
 * each on its own row: when it checks ("每周五 9:00 之后约 10 分钟内" — never a promise of the exact minute), what it
 * picks from, what it picks by, how many, until when, how it tells the owner, and the day the next run is expected.
 * Everything on the card is written here by code, frozen and covered by the card hash. The rule keeps capability and
 * parameters (ids of the notes it references), never the text of a note read when it was made.
 */
import type { AgentCardOperationDisplayContract } from "../../../../shared/contract/agent-v1";
import {
  agentAutomationLocalDay,
  nextAgentRulePeriod,
  type AgentAutomationSchedule,
  type AgentRuleSpec,
} from "../../../agent/automations/contract";
import type { AgentActionOperationPayload } from "../../../agent/runtime/contract";
import { dayText, type CardLocale } from "../../../agent/runtime/todo-operations";

export const RULE_CREATE = "rule.create";
export const RULE_UPDATE = "rule.update";
export const RULE_PAUSE = "rule.pause";
export const RULE_RESUME = "rule.resume";
export const RULE_CANCEL = "rule.cancel";
export const RULE_CAPABILITIES = [RULE_CREATE, RULE_UPDATE, RULE_PAUSE, RULE_RESUME, RULE_CANCEL] as const;
export type RuleCapability = (typeof RULE_CAPABILITIES)[number];

export const isRuleCapability = (capability: string): capability is RuleCapability => (RULE_CAPABILITIES as readonly string[]).includes(capability);

export type RuleSchedule = Extract<AgentAutomationSchedule, { kind: "daily" | "weekly" }>;

/** What a rule looks like now (read when a card about it is frozen and again at the click). */
export interface RuleSnapshot {
  automationId: string;
  title: string;
  version: number;
  status: string;
  schedule: RuleSchedule;
  rule: AgentRuleSpec;
}

export interface RuleCreateIntent {
  capability: typeof RULE_CREATE;
  set: { title: string; schedule: RuleSchedule; rule: AgentRuleSpec };
}

export interface RuleUpdateIntent {
  capability: typeof RULE_UPDATE;
  targetId: string;
  expectedVersion: number;
  /** Only the parameters named here change. */
  set: { schedule?: RuleSchedule; maxItems?: number; validUntil?: string | null; notify?: { inApp: true; push: boolean } };
  shown: RuleSnapshot;
}

export interface RuleStateIntent {
  capability: typeof RULE_PAUSE | typeof RULE_RESUME | typeof RULE_CANCEL;
  targetId: string;
  expectedVersion: number;
  shown: RuleSnapshot;
}

export type RuleOperationIntent = RuleCreateIntent | RuleUpdateIntent | RuleStateIntent;

/* ── words (code writes every one of them) ─────────────────────────── */

const DAY: Record<CardLocale, string[]> = {
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  ja: ["日曜", "月曜", "火曜", "水曜", "木曜", "金曜", "土曜"],
  zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
};

/** "9:00", "18:30" — the hour as people write it. */
const clock = (time: string) => `${Number(time.slice(0, 2))}:${time.slice(3, 5)}`;

/** "每周五 9:00", "every Friday at 9:00", "毎週金曜 9:00". */
export function scheduleWords(schedule: RuleSchedule, locale: CardLocale): string {
  if (schedule.kind === "daily") return ({ en: `every day at ${clock(schedule.time)}`, ja: `毎日 ${clock(schedule.time)}`, zh: `每天 ${clock(schedule.time)}` } as const)[locale];
  const days = [...schedule.daysOfWeek].sort((left, right) => ((left + 6) % 7) - ((right + 6) % 7)).map((day) => DAY[locale][day]);
  if (locale === "en") return `every ${days.join(" and ")} at ${clock(schedule.time)}`;
  if (locale === "ja") return `毎週${days.join("・")} ${clock(schedule.time)}`;
  return `每${days.join("、")} ${clock(schedule.time)}`;
}

/** When the rule checks: after the time, within about 10 minutes. The exact minute is never promised (§5.3). */
export function checkTimeWords(schedule: RuleSchedule, locale: CardLocale): string {
  const when = scheduleWords(schedule, locale);
  if (locale === "en") return `${when.charAt(0).toUpperCase()}${when.slice(1).replace(/ at (\S+)$/u, ", within about 10 minutes after $1")}`;
  if (locale === "ja") return `${when} 以降、約10分以内`;
  return `${when} 之后约10分钟内`;
}

const UNIT: Record<AgentRuleSpec["scope"]["domain"], Record<CardLocale, string>> = {
  contact: { en: "contacts", ja: "人", zh: "位" },
  event: { en: "events", ja: "件", zh: "场" },
  todo: { en: "to-dos", ja: "件", zh: "条" },
};

export function countWords(rule: Pick<AgentRuleSpec, "maxItems" | "scope">, locale: CardLocale): string {
  const unit = UNIT[rule.scope.domain][locale];
  return ({ en: `Up to ${rule.maxItems} ${unit}`, ja: `最大${rule.maxItems}${unit}`, zh: `最多${rule.maxItems}${unit}` } as const)[locale];
}

export function validityWords(validUntil: string | null, locale: CardLocale): string {
  if (!validUntil) return ({ en: "No end date — until you pause or delete it", ja: "期限なし（停止または削除するまで）", zh: "一直有效，直到你暂停或删除" } as const)[locale];
  const day = dayText(validUntil, locale);
  return ({ en: `Through ${day}`, ja: `${day}まで`, zh: `到${day}为止` } as const)[locale];
}

/**
 * agent-design AG16 (视觉稿 16-2): what a card that switches a task's reminder says under its rows — it changes this one
 * task only, the reminder is the one fixed sentence, and the result still goes to the inbox.
 */
export function reminderNote(push: boolean, locale: CardLocale): string {
  // The approved draft's sentence (16-2): only this task changes, and the reminder holds no names, times or places.
  if (push) {
    return ({
      en: "Only this task changes; your other tasks still go to your inbox only. The reminder shows no event names, times or places.",
      ja: "変わるのはこのタスクだけで、ほかのタスクはこれまでどおり受信箱だけです。お知らせにはイベント名・日時・場所を書きません。",
      zh: "只改这一条，别的任务照旧只进收件箱。提醒上不写活动名称、时间和地点。",
    } as const)[locale];
  }
  return ({
    en: "Only this task changes. It will no longer remind you; its results still go to your inbox.",
    ja: "変わるのはこのタスクだけです。今後はお知らせせず、結果はこれまでどおり受信箱に届きます。",
    zh: "只改这一条。之后不再提醒，结果照常放进收件箱。",
  } as const)[locale];
}

export function notifyWords(notify: { push: boolean }, locale: CardLocale): string {
  // AG16 (approved draft 16-2): said as what happens, without 「推送」 or 「站内」 (push, in-app).
  if (notify.push) return ({ en: "To your inbox, with a reminder on your phone and in your browser", ja: "受信箱に届け、スマホとブラウザにもお知らせ", zh: "放进收件箱，并在手机和浏览器上提醒" } as const)[locale];
  return ({ en: "To your inbox only", ja: "受信箱に届けるだけ", zh: "只放进收件箱" } as const)[locale];
}

/** The day the next run is expected, with its weekday, and the same "about 10 minutes" wording. */
export function nextRunWords(schedule: RuleSchedule, validUntil: string | null, now: string, locale: CardLocale): string {
  const next = nextAgentRulePeriod(schedule, validUntil, now);
  if (!next) return ({ en: "No run left before the end date", ja: "期限までに実行される回はありません", zh: "有效期内已经没有下一次运行" } as const)[locale];
  const day = dayText(agentAutomationLocalDay(next, schedule.timeZone), locale);
  return ({ en: `${day}, within about 10 minutes after ${clock(schedule.time)}`, ja: `${day} ${clock(schedule.time)} 以降、約10分以内`, zh: `${day} ${clock(schedule.time)} 之后约10分钟内` } as const)[locale];
}

const LABELS: Record<CardLocale, { record: (title: string) => string; when: string; scope: string; basis: string; count: string; until: string; notify: string; next: string; state: string; active: string; paused: string; none: string; noteNoRun: string; noteResume: string; noteCancel: string }> = {
  en: { active: "On", basis: "Picked by", count: "How many", next: "Next run expected", none: "nothing left to run", noteCancel: "The task is removed and will not run again. What it already sent stays in your inbox.", noteNoRun: "It will not run again until you resume it; a result not delivered yet is not sent either.", noteResume: "It runs again from its next scheduled time; runs missed while paused are not made up.", notify: "When there's something new", paused: "Paused", record: (title) => `Scheduled task "${title}"`, scope: "Picks from", state: "Status", until: "Runs until", when: "Checks" },
  ja: { active: "実行中", basis: "選び方", count: "件数", next: "次回の実行予定", none: "実行される回はありません", noteCancel: "このタスクは削除され、今後は実行されません。すでに届いた結果は受信箱に残ります。", noteNoRun: "再開するまで実行されません。まだ届いていない結果も届けません。", noteResume: "次の予定時刻から再び実行します。停止中の回はさかのぼって実行しません。", notify: "新しい結果があったら", paused: "停止中", record: (title) => `定期タスク「${title}」`, scope: "対象", state: "状態", until: "有効期限", when: "チェックする時間" },
  zh: { active: "运行中", basis: "排序依据", count: "条数", next: "下次预计运行", none: "没有要运行的了", noteCancel: "这条任务会被删除，之后不再运行。已经送到收件箱的结果不受影响。", noteNoRun: "之后不再运行，直到你恢复它；还没送出的结果也不再送。", noteResume: "从下一个预定时间起恢复运行；暂停期间错过的不补。", notify: "有新结果", paused: "已暂停", record: (title) => `定时任务「${title}」`, scope: "候选范围", state: "状态", until: "有效期", when: "检查时间" },
};

type Row = AgentCardOperationDisplayContract["rows"][number];

function ruleRows(input: { schedule: RuleSchedule; rule: AgentRuleSpec }, locale: CardLocale, now: string): Row[] {
  const words = LABELS[locale];
  return [
    { after: checkTimeWords(input.schedule, locale), field: "schedule", label: words.when },
    { after: input.rule.scopeText, field: "scope", label: words.scope },
    { after: input.rule.rankingBasis, field: "rankingBasis", label: words.basis },
    { after: countWords(input.rule, locale), field: "maxItems", label: words.count },
    { after: validityWords(input.rule.validUntil, locale), field: "validUntil", label: words.until },
    { after: notifyWords(input.rule.notify, locale), field: "notify", label: words.notify },
    { after: nextRunWords(input.schedule, input.rule.validUntil, now, locale), field: "nextRunAt", label: words.next },
  ];
}

const sep = (locale: CardLocale) => (locale === "en" ? "; " : "；");

/* ── the card's three lines (approved draft 15-1 as shortened by the user, APPROVAL.md) ──────────────── */

const ZONE_NAMES: Record<string, Record<CardLocale, string>> = {
  "America/Los_Angeles": { en: "Los Angeles time", ja: "ロサンゼルス時間", zh: "洛杉矶时间" },
  "America/New_York": { en: "New York time", ja: "ニューヨーク時間", zh: "纽约时间" },
  "Asia/Seoul": { en: "Seoul time", ja: "ソウル時間", zh: "首尔时间" },
  "Asia/Shanghai": { en: "China time", ja: "中国時間", zh: "北京时间" },
  "Asia/Singapore": { en: "Singapore time", ja: "シンガポール時間", zh: "新加坡时间" },
  "Asia/Tokyo": { en: "Tokyo time", ja: "東京時間", zh: "东京时间" },
  "Europe/London": { en: "London time", ja: "ロンドン時間", zh: "伦敦时间" },
  UTC: { en: "UTC", ja: "協定世界時", zh: "协调世界时" },
};

/** "东京时间", "Tokyo time": a schedule's time zone as people say it (the IANA name when it has no common name). */
export function zoneWords(timeZone: string, locale: CardLocale): string {
  return ZONE_NAMES[timeZone]?.[locale] ?? timeZone;
}

const LINE_WORDS: Record<CardLocale, { when: string; pick: string; after: string; next: (day: string) => string; noNext: string; forever: string; through: (day: string) => string; inbox: string; inboxPush: string; join: string; listJoin: string }> = {
  en: { after: "After that", forever: "Keeps running until you pause or delete it", inbox: "results go to your inbox", inboxPush: "results go to your inbox, and you get a reminder", join: " · ", listJoin: " · ", next: (day) => `next ${day}`, noNext: "no run left before the end date", pick: "What it picks", through: (day) => `Runs through ${day}`, when: "When" },
  ja: { after: "そのあと", forever: "停止または削除するまで続けます", inbox: "結果は受信箱へ", inboxPush: "結果は受信箱へ届け、お知らせもします", join: " · ", listJoin: "、", next: (day) => `次回 ${day}`, noNext: "期限までに実行される回はありません", pick: "何を選ぶか", through: (day) => `${day}まで実行`, when: "いつ" },
  zh: { after: "之后", forever: "一直运行，直到你暂停或删除", inbox: "结果放进收件箱", inboxPush: "结果放进收件箱，并提醒你", join: " · ", listJoin: "，", next: (day) => `下次 ${day}`, noNext: "有效期内已经没有下一次运行", pick: "挑什么", through: (day) => `运行到 ${day}`, when: "什么时候" },
};

/**
 * The three lines a new task's card shows: when (check time, next day), what it picks (from where, by what, how many),
 * after that (until when, how you are told). Every fact of `ruleRows` is still on the card, grouped; the separate rows
 * stay in the frozen card. The time zone is named only on a device in another zone (`zone`).
 */
export function ruleLines(input: { schedule: RuleSchedule; rule: AgentRuleSpec }, locale: CardLocale, now: string): NonNullable<AgentCardOperationDisplayContract["lines"]> {
  const words = LINE_WORDS[locale];
  const next = nextAgentRulePeriod(input.schedule, input.rule.validUntil, now);
  const nextText = next ? words.next(dayText(agentAutomationLocalDay(next, input.schedule.timeZone), locale)) : words.noNext;
  const check = checkTimeWords(input.schedule, locale);
  const zone = zoneWords(input.schedule.timeZone, locale);
  const zoned = locale === "en" ? `${check} (${zone})` : `${check}（${zone}）`;
  const basis = locale === "en" ? input.rule.rankingBasis : input.rule.rankingBasis.replace(/[。.]$/u, "");
  const count = countWords(input.rule, locale);
  const until = input.rule.validUntil ? words.through(dayText(input.rule.validUntil, locale)) : words.forever;
  // The approved card keeps a line to two lines at most and never cuts the basis: the scope is said in the user's own
  // words here; how code reads them (the part in brackets) stays on the separate row and on the task's page.
  const scope = input.rule.scopeText.replace(/\s*[（(][^（）()]*[）)]$/u, "").trim() || input.rule.scopeText;
  return [
    { fields: ["schedule", "nextRunAt"], key: "when", label: words.when, text: `${check}${words.join}${nextText}`, zone: { id: input.schedule.timeZone, text: `${zoned}${words.join}${nextText}` } },
    { fields: ["scope", "rankingBasis", "maxItems"], key: "pick", label: words.pick, text: [scope, basis, locale === "en" ? count.charAt(0).toLowerCase() + count.slice(1) : count].join(words.listJoin) },
    { fields: ["validUntil", "notify"], key: "after", label: words.after, text: `${until}${words.join}${input.rule.notify.push ? words.inboxPush : words.inbox}` },
  ];
}

/** The fields a rule's card and its record share (the eval and both clients read these names). */
function ruleAfter(input: { title: string; schedule: RuleSchedule; rule: AgentRuleSpec }): Record<string, unknown> {
  const { rule } = input;
  return {
    maxItems: rule.maxItems,
    notify: { inApp: rule.notify.inApp, push: rule.notify.push },
    onEmpty: rule.onEmpty,
    rankingBasis: rule.rankingBasis,
    // Ids only: the notes are read again at every period.
    references: rule.references.map((reference) => ({ id: reference.id, type: reference.type })),
    schedule: { ...input.schedule, ...(input.schedule.kind === "weekly" ? { daysOfWeek: [...input.schedule.daysOfWeek] } : {}) },
    scopeText: rule.scopeText,
    title: input.title,
    validUntil: rule.validUntil,
  };
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

const intentCopy = (intent: RuleOperationIntent): Record<string, unknown> => JSON.parse(JSON.stringify(intent)) as Record<string, unknown>;

/** One rule item of a card, frozen from its intent. `now` only words the next run; it is not part of what is written. */
export function prepareRuleOperation(input: { intent: RuleOperationIntent & { partId?: string }; actionId: string; revision: number; index: number; locale: CardLocale; now?: string }): AgentActionOperationPayload {
  const { intent, locale } = input;
  const now = input.now ?? new Date().toISOString();
  const words = LABELS[locale];
  const common = base({ ...input, partId: intent.partId });
  const { partId: _partId, ...kept } = intent as RuleOperationIntent & { partId?: string; dependsOn?: unknown };
  delete (kept as { dependsOn?: unknown }).dependsOn;
  const cardIntent = intentCopy(kept as RuleOperationIntent);
  if (intent.capability === RULE_CREATE) {
    const rows = ruleRows(intent.set, locale, now);
    const display: AgentCardOperationDisplayContract = { change: "create", lines: ruleLines(intent.set, locale, now), record: words.record(intent.set.title), rows };
    const after = ruleAfter(intent.set);
    return {
      ...common,
      after,
      capability: RULE_CREATE,
      display,
      executorKey: RULE_CREATE,
      operationType: "create_rule",
      payload: { cardIntent, rule: intent.set.rule, schedule: intent.set.schedule, title: intent.set.title },
      preconditions: { targetExists: false },
      preview: `${({ en: "New", ja: "追加：", zh: "新增" } as const)[locale]}${locale === "en" ? " " : ""}${words.record(intent.set.title).replace(/^S/u, (letter) => (locale === "en" ? "s" : letter))}${locale === "en" ? ": " : "："}${rows.map((row) => `${row.label}${locale === "en" ? ": " : "："}${row.after}`).join(sep(locale))}`,
      shown: { title: intent.set.title },
    };
  }
  const shown = intent.shown;
  const record = words.record(shown.title);
  const target = { collection: "agentAutomations", id: intent.targetId };
  const preconditions = { targetExists: true, versionToken: String(intent.expectedVersion) };
  if (intent.capability === RULE_UPDATE) {
    const next = { rule: { ...shown.rule, ...(intent.set.maxItems !== undefined ? { maxItems: intent.set.maxItems } : {}), ...(intent.set.validUntil !== undefined ? { validUntil: intent.set.validUntil } : {}), ...(intent.set.notify ? { notify: intent.set.notify } : {}) }, schedule: intent.set.schedule ?? shown.schedule };
    const before = ruleRows(shown, locale, now);
    const rows = ruleRows(next, locale, now).map((row, index) => ({ ...row, before: before[index].after })).filter((row) => row.before !== row.after && (row.field !== "nextRunAt" || Boolean(intent.set.schedule) || intent.set.validUntil !== undefined));
    const reminderChanged = intent.set.notify !== undefined && intent.set.notify.push !== shown.rule.notify.push;
    const display: AgentCardOperationDisplayContract = { change: "update", record, rows, ...(reminderChanged ? { note: reminderNote(intent.set.notify!.push, locale) } : {}) };
    const after: Record<string, unknown> = { ...(intent.set.schedule ? { schedule: intent.set.schedule } : {}), ...(intent.set.maxItems !== undefined ? { maxItems: intent.set.maxItems } : {}), ...(intent.set.validUntil !== undefined ? { validUntil: intent.set.validUntil } : {}), ...(intent.set.notify ? { notify: { ...intent.set.notify } } : {}) };
    const beforeValues: Record<string, unknown> = { ...(intent.set.schedule ? { schedule: shown.schedule } : {}), ...(intent.set.maxItems !== undefined ? { maxItems: shown.rule.maxItems } : {}), ...(intent.set.validUntil !== undefined ? { validUntil: shown.rule.validUntil } : {}), ...(intent.set.notify ? { notify: { ...shown.rule.notify } } : {}) };
    return {
      ...common, after, before: beforeValues, capability: RULE_UPDATE, display, executorKey: RULE_UPDATE, operationType: "update_rule",
      payload: { automationId: intent.targetId, cardIntent, expectedVersion: intent.expectedVersion, set: after },
      preconditions,
      // AG16: a card that switches the reminder also says, in its text, that only this task changes and what the reminder holds.
      preview: `${record}${locale === "en" ? ": " : "："}${rows.map((row) => `${row.label}${locale === "en" ? ": " : "："}${row.before} → ${row.after}`).join(sep(locale))}${display.note ? `${locale === "en" ? ". " : "。"}${display.note}` : ""}`,
      shown: { title: shown.title },
      targetRef: target,
    };
  }
  const state = intent.capability === RULE_PAUSE ? "paused" : intent.capability === RULE_RESUME ? "active" : "removed";
  const note = intent.capability === RULE_PAUSE ? words.noteNoRun : intent.capability === RULE_RESUME ? words.noteResume : words.noteCancel;
  const stateRow: Row[] = intent.capability === RULE_CANCEL
    ? [{ after: ({ en: "Deleted", ja: "削除", zh: "删除" } as const)[locale], before: shown.status === "paused" ? words.paused : words.active, field: "status", label: words.state }]
    : [
      { after: intent.capability === RULE_PAUSE ? words.paused : words.active, before: intent.capability === RULE_PAUSE ? words.active : words.paused, field: "status", label: words.state },
      { after: intent.capability === RULE_PAUSE ? words.none : nextRunWords(shown.schedule, shown.rule.validUntil, now, locale), field: "nextRunAt", label: words.next },
    ];
  const display: AgentCardOperationDisplayContract = { change: intent.capability === RULE_CANCEL ? "delete" : "update", note, record, rows: [{ after: checkTimeWords(shown.schedule, locale), field: "schedule", label: words.when }, ...stateRow] };
  const verb = ({
    [RULE_CANCEL]: { en: "Delete", ja: "削除：", zh: "删除" },
    [RULE_PAUSE]: { en: "Pause", ja: "停止：", zh: "暂停" },
    [RULE_RESUME]: { en: "Resume", ja: "再開：", zh: "恢复" },
  } as const)[intent.capability][locale];
  const lowered = locale === "en" ? ` ${record.charAt(0).toLowerCase()}${record.slice(1)}` : record;
  return {
    ...common,
    after: { status: state },
    before: { status: shown.status },
    capability: intent.capability,
    display,
    executorKey: intent.capability,
    operationType: intent.capability === RULE_PAUSE ? "pause_rule" : intent.capability === RULE_RESUME ? "resume_rule" : "cancel_rule",
    payload: { automationId: intent.targetId, cardIntent, expectedVersion: intent.expectedVersion },
    preconditions,
    preview: `${verb}${lowered}（${checkTimeWords(shown.schedule, locale)}）${locale === "en" ? ". " : "。"}${note}`.replace(/（/gu, locale === "en" ? " (" : "（").replace(/）/gu, locale === "en" ? ")" : "）"),
    shown: { title: shown.title },
    targetRef: target,
  };
}

/** The intent a rule item was frozen from (regenerating a card keeps it). */
export function ruleIntentOf(op: AgentActionOperationPayload): RuleOperationIntent | null {
  const kept = (op.payload as { cardIntent?: unknown } | undefined)?.cardIntent;
  return kept && typeof kept === "object" && isRuleCapability(String((kept as { capability?: unknown }).capability)) ? (kept as RuleOperationIntent) : null;
}
