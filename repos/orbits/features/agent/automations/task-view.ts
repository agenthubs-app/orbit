/**
 * What "my scheduled tasks" shows (agent-design AG15; 设计稿 §10, 附录 E; approved visual draft 15-3, 15-4): a task
 * with its seven facts (the same code as its confirmation card writes the values), its next expected run from the due
 * index, its latest run, and its run history. Every word on those pages is written here, in the task's language; the two
 * clients show them as they are and neither assembles dates or sentences.
 */
import type { AgentScheduledTaskContract, AgentScheduledTaskHistoryContract, AgentScheduledTaskRunContract } from "../../../shared/contract/agent-v1";
import { checkTimeWords, countWords, nextRunWords, zoneWords, type RuleSchedule } from "../../agent-v1/domains/rule/ops";
import { dayText } from "../runtime/todo-operations";
import { agentAutomationLocalDay, agentAutomationNotify, type AgentAutomation, type AgentAutomationService } from "./contract";
import type { AutomationStorage } from "./due-index";
import { createAutomationRunStore, pushHistoryLine, runHistoryLine, type AgentAutomationRunRecord } from "./runs";

type Locale = "zh" | "en" | "ja";
type Domain = "event" | "contact" | "todo";

/** The labels of the approved draft (15-4 「这条任务怎么跑」 and 「下次运行」). */
const LABELS: Record<Locale, { when: string; scope: string; basis: string; count: string; until: string; notify: string; next: string; none: string }> = {
  en: { basis: "Picks by", count: "How many", next: "Next run", none: "No run scheduled", notify: "How you're told", scope: "Picks from", until: "Runs until", when: "When it checks" },
  ja: { basis: "何で選ぶか", count: "何件", next: "次回の実行", none: "実行予定はありません", notify: "知らせ方", scope: "どこから選ぶか", until: "いつまで", when: "いつ確認するか" },
  zh: { basis: "按什么挑", count: "挑几条", next: "下次运行", none: "没有要运行的了", notify: "怎么通知你", scope: "从哪里挑", until: "跑到哪天", when: "什么时候查" },
};

const WORDS: Record<Locale, {
  zoneNote: (zone: string) => string;
  readsNow: string;
  quiet: string;
  forever: string;
  through: (day: string) => string;
  inbox: string;
  inboxPush: string;
  after: (clock: string) => string;
  today: (clock: string) => string;
  next: (day: string) => string;
  last: (when: string, text: string) => string;
  paused: string;
  ended: (count: number) => string;
  ranThrough: (day: string) => string;
  attention: (title: string | null, message: string) => string;
  found: Record<Domain, (count: number) => string>;
  waiting: (count: number) => string;
  nothing: string;
  failed: string;
  retried: (clock: string, text: string) => string;
  resent: string;
  undelivered: Record<"pending" | "rule_paused" | "rule_changed" | "rule_removed" | "reference_unreadable", string>;
  skipped: (count: number, days: string) => string;
  join: string;
}> = {
  en: {
    after: (clock) => `within about 10 minutes after ${clock}`,
    attention: (title, message) => (title ? `Needs you: the note "${title}" can no longer be opened. Choose another one, or pick by something else.` : `Needs you: ${message}`),
    ended: (count) => `Ended · ran ${count} time${count === 1 ? "" : "s"}`,
    failed: "Did not run",
    forever: "Keeps running until you pause or delete it",
    found: { contact: (n) => `${n} ${n === 1 ? "person" : "people"} to contact`, event: (n) => `${n} new event${n === 1 ? "" : "s"}`, todo: (n) => `${n} to-do${n === 1 ? "" : "s"}` },
    inbox: "To your inbox",
    inboxPush: "To your inbox, with a reminder",
    join: " · ",
    last: (when, text) => `last ${when}: ${text}`,
    next: (day) => `Next ${day}`,
    nothing: "Nothing new",
    paused: "Paused, will not run",
    quiet: "A run with nothing new does not disturb you",
    ranThrough: (day) => `Ran through ${day}`,
    readsNow: "Read again at every run, as it is then",
    resent: " (it did not reach the inbox at first and was sent again)",
    retried: (clock, text) => `Did not run at first, tried again; finished ${clock}: ${text}`,
    skipped: (count, days) => `${count} run${count === 1 ? " was" : "s were"} skipped${days ? ` (${days})` : ""}. Orbit was down then; after it came back only the latest run was made up.`,
    through: (day) => `Through ${day}`,
    today: (clock) => `today ${clock}`,
    undelivered: {
      pending: "Worked out, not delivered yet; it will be sent again",
      reference_unreadable: "Worked out, but the note it picks by could no longer be opened, so it was not sent",
      rule_changed: "Worked out, but you changed the task before it went out, so it was not sent",
      rule_paused: "Worked out, but you paused the task before it went out, so it was not sent",
      rule_removed: "Worked out, but you deleted the task before it went out, so it was not sent",
    },
    waiting: (n) => `${n} change${n === 1 ? "" : "s"} waiting for your confirmation`,
    zoneNote: (zone) => `${zone}. It does not start on the minute.`,
  },
  ja: {
    after: (clock) => `${clock} 以降、約10分以内`,
    attention: (title, message) => (title ? `対応が必要です：メモ「${title}」が開けなくなりました。別のメモを選ぶか、選び方を変えてください。` : `対応が必要です：${message}`),
    ended: (count) => `終了 · 全${count}回実行`,
    failed: "実行できませんでした",
    forever: "停止または削除するまで続けます",
    found: { contact: (n) => `連絡したい人が${n}人`, event: (n) => `新しいイベントが${n}件`, todo: (n) => `タスクが${n}件` },
    inbox: "受信箱へ",
    inboxPush: "受信箱へ届け、お知らせもします",
    join: " · ",
    last: (when, text) => `前回 ${when}：${text}`,
    next: (day) => `次回 ${day}`,
    nothing: "新しいものはありません",
    paused: "停止中、実行しません",
    quiet: "新しいものがない回はお知らせしません",
    ranThrough: (day) => `${day}まで実行`,
    readsNow: "毎回、その時点の内容を読みます",
    resent: "（最初は届かず、送り直しました）",
    retried: (clock, text) => `実行できず再試行；${clock} に完了：${text}`,
    skipped: (count, days) => `${count}回分を飛ばしました${days ? `（${days}）` : ""}。その間 Orbit が止まっていたため、再開後は最新の1回だけ実行しました。`,
    through: (day) => `${day}まで`,
    today: (clock) => `今日 ${clock}`,
    undelivered: {
      pending: "結果は出ましたが、まだ届いていません。送り直します",
      reference_unreadable: "結果は出ましたが、基準のメモが開けなくなったため届けていません",
      rule_changed: "結果は出ましたが、届ける前にタスクを変更したため届けていません",
      rule_paused: "結果は出ましたが、届ける前に停止したため届けていません",
      rule_removed: "結果は出ましたが、届ける前に削除したため届けていません",
    },
    waiting: (n) => `${n}件の変更が確認待ち`,
    zoneNote: (zone) => `${zone}。ちょうどの時刻には始まりません。`,
  },
  zh: {
    after: (clock) => `${clock} 之后约10分钟内`,
    attention: (title, message) => (title ? `需要你处理：笔记「${title}」打不开了。重新选一篇，或者改成别的挑法。` : `需要你处理：${message}`),
    ended: (count) => `已结束 · 一共跑了 ${count} 期`,
    failed: "没跑成",
    forever: "一直跑，直到你暂停或删除",
    found: { contact: (n) => `有 ${n} 位该联系的人`, event: (n) => `有 ${n} 场新活动`, todo: (n) => `有 ${n} 条待办` },
    inbox: "放进收件箱",
    inboxPush: "放进收件箱，并提醒你",
    join: " · ",
    last: (when, text) => `上次 ${when}：${text}`,
    next: (day) => `下次 ${day}`,
    nothing: "没有新的",
    paused: "已暂停，不会再运行",
    quiet: "没有新的就不打扰",
    ranThrough: (day) => `跑到 ${day}为止`,
    readsNow: "每次运行读它当时的内容",
    resent: "（第一次没送到，补送到了）",
    retried: (clock, text) => `没跑成，已重试；${clock} 跑完：${text}`,
    skipped: (count, days) => `中间跳过了 ${count} 期${days ? `（${days}）` : ""}。那段时间 Orbit 停过，恢复后只补了最近一期。`,
    through: (day) => `跑到 ${day}为止`,
    today: (clock) => `今天 ${clock}`,
    undelivered: {
      pending: "已经算好，还没送到，会再送",
      reference_unreadable: "已经算好，但用来挑的笔记打不开了，没有送",
      rule_changed: "已经算好，但你在送出前改了这条任务，没有送",
      rule_paused: "已经算好，但你在送出前暂停了，没有送",
      rule_removed: "已经算好，但你在送出前删了这条任务，没有送",
    },
    waiting: (n) => `有 ${n} 条要改，等你确认`,
    zoneNote: (zone) => `${zone}。不保证整点开始。`,
  },
};

const DEFAULT_ZONE = "Asia/Tokyo";

/** "9:04": an instant's wall clock in a zone. */
function clockAt(instant: string, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone }).formatToParts(new Date(instant));
    const hour = parts.find((part) => part.type === "hour")?.value ?? "0";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    return `${Number(hour)}:${minute}`;
  } catch {
    return instant.slice(11, 16);
  }
}

function localDayOf(instant: string, timeZone: string): string {
  try {
    return agentAutomationLocalDay(instant, timeZone);
  } catch {
    return instant.slice(0, 10);
  }
}

/** "10月23日", "Oct 23" (the days passed over, without weekday). */
function shortDay(day: string, locale: Locale): string {
  const [, month, date] = day.split("-").map(Number);
  return locale === "en" ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${date}` : `${month}月${date}日`;
}

const domainOf = (automation: AgentAutomation): Domain | null => automation.rule?.scope.domain ?? null;

/** One period as the history shows it (15-4 「历史里每种情况怎么写」). */
function runDisplay(run: AgentAutomationRunRecord, locale: Locale, timeZone: string, domain: Domain | null): AgentScheduledTaskRunContract["display"] {
  const words = WORDS[locale];
  const count = run.items.length;
  const kind: Domain = domain ?? run.items[0]?.kind ?? "event";
  let text: string;
  if (run.outcome === "needs_attention") text = words.attention(run.attention?.reference?.title ?? null, run.attention?.message ?? "");
  else if (run.outcome === "no_match") text = words.nothing;
  else if (run.outcome === "failed") text = words.failed;
  else if (run.outcome === "undelivered") text = words.undelivered[run.delivery.inbox.state === "cancelled" ? run.delivery.inbox.cancelReason ?? "rule_changed" : "pending"];
  else text = run.cardId ? words.waiting(count) : words.found[kind](count);
  if (run.outcome === "delivered" && run.delivery.inbox.attempts > 1) text += words.resent;
  const time = clockAt(run.computedAt, timeZone);
  const retried = (run.computeAttempts ?? 1) > 1 && run.outcome !== "failed";
  const days = (run.skippedDays ?? []).map((day) => shortDay(day, locale)).join(locale === "en" ? ", " : "、");
  return {
    day: dayText(localDayOf(run.scheduledAt, timeZone), locale),
    opens: run.outcome === "delivered" ? (run.cardId ? "card" : "result") : null,
    skippedNote: run.skipped > 0 ? words.skipped(run.skipped, days) : null,
    text: retried ? words.retried(time, text) : text,
    time: retried ? null : time,
  };
}

/**
 * The title of a period's inbox entry (approved draft 15-5): what it found, in one short line — "有 2 场新活动",
 * "有 2 条要改，等你确认", "需要你处理：笔记「X」打不开了…". The task's own name is the entry's second line.
 */
export function runInboxTitle(run: AgentAutomationRunRecord): string {
  const words = WORDS[run.locale] ?? WORDS.zh;
  if (run.outcome === "needs_attention") return words.attention(run.attention?.reference?.title ?? null, run.attention?.message ?? "").slice(0, 200);
  if (run.cardId) return words.waiting(run.items.length);
  return words.found[run.items[0]?.kind ?? "event"](run.items.length);
}

export function scheduledRunView(run: AgentAutomationRunRecord, locale: Locale = run.locale, timeZone = DEFAULT_ZONE, domain: Domain | null = null): AgentScheduledTaskRunContract {
  return {
    ...(run.attention ? { attention: { message: run.attention.message, reason: run.attention.reason, ...(run.attention.reference?.title ? { referenceTitle: run.attention.reference.title } : {}) } } : {}),
    computeAttempts: run.computeAttempts ?? 1,
    computedAt: run.computedAt,
    delivery: { attempts: run.delivery.inbox.attempts, state: run.delivery.inbox.state, ...(run.delivery.inbox.deliveredAt ? { deliveredAt: run.delivery.inbox.deliveredAt } : {}), ...(run.delivery.inbox.cancelReason ? { cancelReason: run.delivery.inbox.cancelReason } : {}) },
    display: runDisplay(run, locale, timeZone, domain),
    ...(run.detail ? { detail: { basis: run.detail.basis, notes: [...run.detail.notes], ...(run.detail.source ? { source: run.detail.source } : {}) } } : {}),
    items: run.items.map((item) => ({ id: item.id, kind: item.kind, line: item.line, ref: item.ref, title: item.title, ...(item.card ? { card: item.card } : {}) })),
    line: runHistoryLine(run, locale),
    outcome: run.outcome,
    // AG16: the reminder, apart from the result's own line above. No ticket, token or error text leaves the server.
    push: {
      attempts: run.delivery.push.attempts,
      line: pushHistoryLine(run, locale, timeZone),
      state: run.delivery.push.state,
      targets: (run.delivery.push.targets ?? []).map((target) => ({ deviceId: target.deviceId, platform: target.platform, state: target.state })),
      ...(run.delivery.push.deliveredAt ? { deliveredAt: run.delivery.push.deliveredAt } : {}),
      ...(run.delivery.push.lastAttemptAt ? { lastAttemptAt: run.delivery.push.lastAttemptAt } : {}),
      ...(run.delivery.push.reason ? { reason: run.delivery.push.reason } : {}),
    },
    runId: run.runId,
    scheduledAt: run.scheduledAt,
    skipped: run.skipped,
    skippedDays: [...(run.skippedDays ?? [])],
    taskId: run.automationId,
    text: run.text,
    ...(run.cardId ? { cardId: run.cardId } : {}),
  };
}

export function scheduledTaskView(automation: AgentAutomation, lastRun: AgentAutomationRunRecord | null, now: string, requested?: Locale, runCount = lastRun ? 1 : 0): AgentScheduledTaskContract {
  const locale: Locale = requested ?? automation.rule?.locale ?? "zh";
  const labels = LABELS[locale];
  const words = WORDS[locale];
  const schedule = automation.trigger.kind === "schedule" && automation.trigger.schedule.kind !== "once" ? (automation.trigger.schedule as RuleSchedule) : null;
  const timeZone = schedule?.timeZone ?? DEFAULT_ZONE;
  const status: AgentScheduledTaskContract["status"] = automation.status === "paused" ? "paused" : automation.status === "completed" || automation.status === "failed" ? "completed" : "active";
  const rule = automation.rule;
  const notify = agentAutomationNotify(automation);
  const domain = domainOf(automation);
  const rows: { field: string; label: string; value: string; note?: string }[] = [];
  if (schedule) rows.push({ field: "schedule", label: labels.when, note: words.zoneNote(zoneWords(schedule.timeZone, locale)), value: checkTimeWords(schedule, locale) });
  if (rule) {
    rows.push(
      { field: "scope", label: labels.scope, value: rule.scopeText },
      { field: "rankingBasis", label: labels.basis, value: rule.rankingBasis, ...(rule.references.length ? { note: words.readsNow } : {}) },
      { field: "maxItems", label: labels.count, value: countWords(rule, locale) },
      { field: "validUntil", label: labels.until, value: rule.validUntil ? words.through(dayText(rule.validUntil, locale)) : words.forever },
    );
  }
  rows.push({ field: "notify", label: labels.notify, note: words.quiet, value: notify.push ? words.inboxPush : words.inbox });
  const nextRunAt = status === "active" ? automation.nextRunAt : null;
  if (schedule) rows.push({ field: "nextRunAt", label: labels.next, value: nextRunAt ? nextRunWords(schedule, rule?.validUntil ?? null, new Date(Date.parse(nextRunAt) - 1).toISOString(), locale) : labels.none });

  const last = lastRun ? runDisplay(lastRun, locale, timeZone, domain) : null;
  const lastWhen = lastRun ? (localDayOf(lastRun.computedAt, timeZone) === localDayOf(now, timeZone) && last?.time ? words.today(last.time) : dayText(localDayOf(lastRun.scheduledAt, timeZone), locale)) : null;
  const needsAttention = status !== "completed" && lastRun?.outcome === "needs_attention";
  // A period that needs the owner reads "没跑成" in the list; the reason is the yellow line under it (15-3).
  const lastPart = last && lastWhen ? words.last(lastWhen, lastRun?.outcome === "needs_attention" ? words.failed : last.text) : null;
  const nextDay = nextRunAt ? dayText(localDayOf(nextRunAt, timeZone), locale) : null;
  let statusLine: string;
  if (status === "completed") statusLine = words.ended(runCount);
  else if (status === "paused") statusLine = [words.paused, lastPart].filter(Boolean).join(words.join);
  else statusLine = [needsAttention || !nextDay ? null : words.next(nextDay), lastPart].filter(Boolean).join(words.join);
  const scheduleLine = status === "completed" && rule?.validUntil ? words.ranThrough(dayText(rule.validUntil, locale)) : schedule ? checkTimeWords(schedule, locale) : "";
  return {
    createdAt: automation.createdAt,
    domain,
    id: automation.automationId,
    last: lastRun && last && lastWhen ? { runId: lastRun.runId, text: last.text, when: lastWhen, opens: last.opens } : null,
    lastRun: lastRun ? scheduledRunView(lastRun, locale, timeZone, domain) : null,
    needsAttention,
    next: nextDay && schedule ? { day: nextDay, time: words.after(`${Number(schedule.time.slice(0, 2))}:${schedule.time.slice(3, 5)}`) } : null,
    nextRunAt,
    notify,
    rows,
    status,
    summary: {
      attention: needsAttention && lastRun ? words.attention(lastRun.attention?.reference?.title ?? null, lastRun.attention?.message ?? "") : null,
      schedule: scheduleLine,
      status: statusLine,
    },
    timeZone: schedule?.timeZone ?? null,
    title: automation.title,
    updatedAt: automation.updatedAt,
    version: automation.version,
    ...(schedule && rule ? { form: formOf(automation, schedule) } : {}),
  };
}

/** What the edit form starts from (15-4 「点「改」之后」): the schedule and the rule's parameters, ids only for notes. */
function formOf(automation: AgentAutomation, schedule: RuleSchedule): NonNullable<AgentScheduledTaskContract["form"]> {
  const rule = automation.rule!;
  const basis: NonNullable<AgentScheduledTaskContract["form"]>["basis"] = rule.references.length
    ? { kind: "note", noteId: rule.references[0].id, title: rule.references[0].title ?? "" }
    : rule.ranking.topic
      ? { kind: "topic", words: rule.ranking.topic }
      : { field: rule.ranking.field?.name ?? "startsAt", kind: "field" };
  return {
    basis,
    domain: rule.scope.domain,
    maxItems: rule.maxItems,
    push: rule.notify.push,
    schedule: schedule.kind === "daily" ? { kind: "daily", time: schedule.time, timeZone: schedule.timeZone } : { daysOfWeek: [...schedule.daysOfWeek], kind: "weekly", time: schedule.time, timeZone: schedule.timeZone },
    scopeText: rule.scopeText,
    title: automation.title,
    validUntil: rule.validUntil,
    ...(rule.scope.domain === "event" ? { window: rule.scope.window } : {}),
  };
}

/** The owner's tasks with each one's latest run (scheduled ones only; signal-triggered playbooks stay on their own page). */
export async function listScheduledTasks(input: { ownerId: string; service: Pick<AgentAutomationService, "list">; storage: AutomationStorage | null; now: string; locale?: Locale }): Promise<AgentScheduledTaskContract[]> {
  const automations = (await input.service.list()).filter((automation) => automation.trigger.kind === "schedule");
  const runs = input.storage ? createAutomationRunStore(input.storage.direct.store, input.storage.workspaceId) : null;
  const tasks: AgentScheduledTaskContract[] = [];
  for (const automation of automations) {
    const history = runs ? await runs.list(input.ownerId, automation.automationId, 50) : [];
    tasks.push(scheduledTaskView(automation, history[0] ?? null, input.now, input.locale, history.length));
  }
  // The draft's order (15-3): running, then those that need the owner, paused, ended; newest first within each.
  const rank = (task: AgentScheduledTaskContract) => (task.status === "completed" ? 3 : task.status === "paused" ? 2 : task.needsAttention ? 1 : 0);
  return tasks.sort((left, right) => rank(left) - rank(right) || right.createdAt.localeCompare(left.createdAt));
}

/** One task with its history, newest period first; null when it is not this owner's. */
export async function scheduledTaskHistory(input: { ownerId: string; automationId: string; service: Pick<AgentAutomationService, "get">; storage: AutomationStorage | null; now: string; locale?: Locale; limit?: number }): Promise<AgentScheduledTaskHistoryContract | null> {
  const automation = await input.service.get(input.automationId);
  if (!automation) return null;
  const runs = input.storage ? await createAutomationRunStore(input.storage.direct.store, input.storage.workspaceId).list(input.ownerId, automation.automationId, input.limit ?? 50) : [];
  const locale = input.locale ?? automation.rule?.locale ?? "zh";
  const timeZone = automation.trigger.kind === "schedule" && automation.trigger.schedule.kind !== "once" ? (automation.trigger.schedule as RuleSchedule).timeZone : DEFAULT_ZONE;
  return { runs: runs.map((run) => scheduledRunView(run, locale, timeZone, domainOf(automation))), task: scheduledTaskView(automation, runs[0] ?? null, input.now, input.locale, runs.length) };
}
