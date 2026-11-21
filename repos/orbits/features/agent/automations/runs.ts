/**
 * The run history of scheduled rules (agent-design AG15; 设计稿 §5.3, 附录 E; PLANNER 易错边界 3/4/5/7).
 *
 * One record per period that was run, in its own collection `agentAutomationRuns` (the owner's partition). Its id is
 * made from workspace, owner, rule, rule version and the period's planned time, so a period is computed once: a retry
 * with the same key finds the record and goes on from it. The result and what is still to be delivered are kept on the
 * record together; when the period was computed (`computedAt`) and when its result reached the user (`delivery`) are
 * separate fields.
 */
import { createHash } from "node:crypto";

import type { LiveRecord, LiveRecordStoreLike } from "../../../shared/storage/live-record-store";
import type { AgentAnswerRecordContract } from "../../../shared/contract/agent-v1";
import type { AgentRuleNotify } from "./contract";

export const AGENT_AUTOMATION_RUN_COLLECTION = "agentAutomationRuns" as const;

/** delivered 已送达 · no_match 没有新的 · undelivered 已算出未送出 · failed 失败 · needs_attention 需处理 */
export type AgentAutomationRunOutcomeKind = "delivered" | "no_match" | "undelivered" | "failed" | "needs_attention";

export interface AgentAutomationRunItem {
  /** "event:<id>", "contact:<id>", "todo:<id>". */
  ref: string;
  kind: "event" | "contact" | "todo";
  id: string;
  title: string;
  /** One line of the record's own facts (code writes it). */
  line: string;
  /** AG15 interface: the record as AG19's record card (three lines written by code when the period was computed). */
  card?: AgentAnswerRecordContract;
}

export interface AgentAutomationInboxDelivery {
  /**
   * none: nothing to send (no new content). pending: computed, not in the inbox yet. delivered. cancelled: called off
   * before sending (the rule was paused, removed or changed, or what it reads may no longer be read).
   */
  state: "none" | "pending" | "delivered" | "cancelled";
  attempts: number;
  lastAttemptAt?: string;
  lastError?: string;
  deliveredAt?: string;
  cancelReason?: "rule_paused" | "rule_removed" | "rule_changed" | "reference_unreadable";
  inboxId?: string;
}

/**
 * Why a period's reminder was not sent, or did not arrive (agent-design AG16; 设计稿 §5.3「什么时候不打扰」).
 * Not sent on purpose (`skipped`): quiet_hours, daily_cap, notifications_off (the owner's own notification settings);
 * reminder_off, rule_paused, rule_removed (the task changed before the reminder went out); result_not_sent (the result
 * itself was called off, so there is nothing to point at).
 * Wanted but not arrived (`failed`): no_device (no phone or browser of the owner allows notifications),
 * permission_revoked (the push service refused the device: notifications were turned off there), provider_rejected
 * (refused for another reason, every retry used up), outcome_unknown (the push service did not answer; never re-sent),
 * not_configured (this deployment has no push channel for the owner's devices).
 */
export type AgentAutomationPushReason =
  | "quiet_hours" | "daily_cap" | "notifications_off"
  | "reminder_off" | "rule_paused" | "rule_removed" | "result_not_sent"
  | "no_device" | "permission_revoked" | "provider_rejected" | "outcome_unknown" | "not_configured";

/** One device a period's reminder went to (a phone through Expo, a browser through Web Push). No token is kept here. */
export interface AgentAutomationPushTarget {
  deviceId: string;
  platform: "ios" | "android" | "web";
  /**
   * delivered: the push service accepted it. retry: explicitly refused, sent again at the next pass. revoked: the push
   * service says this device no longer takes notifications (the device registration was revoked). rejected: refused and
   * not retried any more. unknown: no answer from the push service — never re-sent.
   */
  state: "delivered" | "retry" | "revoked" | "rejected" | "unknown";
  attempts: number;
  lastAttemptAt?: string;
  deliveredAt?: string;
  /** The push service's ticket; `receipt` says whether its receipt was checked afterwards. */
  receiptId?: string;
  receipt?: "pending" | "verified";
  error?: string;
}

/**
 * The reminder of one period (AG16). AG15 records whether the rule asked for one (`pending` or `not_requested`); AG16
 * sends. Kept apart from `computedAt`: sending again changes only this block — the result is never worked out again.
 */
export interface AgentAutomationPushDelivery {
  /** skipped: not sent on purpose (see `reason`). failed: wanted, but it did not arrive. */
  state: "not_requested" | "pending" | "delivered" | "failed" | "skipped";
  /** Rounds in which at least one send was tried. */
  attempts: number;
  lastAttemptAt?: string;
  deliveredAt?: string;
  lastError?: string;
  reason?: AgentAutomationPushReason;
  /** The opaque id a reminder carries as its only data; it names this period's inbox entry to its signed-in owner. */
  deliveryId?: string;
  targets?: readonly AgentAutomationPushTarget[];
}

const RUN_ID_PREFIX = "autorun:";
const PUSH_DELIVERY_PREFIX = "rule-push:";
const PUSH_DUE_PREFIX = "push:";

/** The reminder's opaque id: the run id's own hash under another prefix. It holds no title, time, place or name. */
export function pushDeliveryIdOf(runId: string): string {
  return `${PUSH_DELIVERY_PREFIX}${runId.startsWith(RUN_ID_PREFIX) ? runId.slice(RUN_ID_PREFIX.length) : runId}`;
}

/** The run a reminder's id names; null when the id is not a scheduled task's reminder. */
export function runIdOfPushDelivery(deliveryId: string): string | null {
  return /^rule-push:[0-9a-f]{32}$/u.test(deliveryId) ? `${RUN_ID_PREFIX}${deliveryId.slice(PUSH_DELIVERY_PREFIX.length)}` : null;
}

/** A run's reminder row in the due index: kind `delivery`, this key (the inbox delivery's row is keyed by the run id itself). */
export function pushDueKeyOf(runId: string): string {
  return `${PUSH_DUE_PREFIX}${runId}`;
}

export function runIdOfPushDueKey(key: string): string | null {
  return key.startsWith(PUSH_DUE_PREFIX) ? key.slice(PUSH_DUE_PREFIX.length) : null;
}

/** A reminder still waiting when its result was called off is called off with it. */
export function pushCalledOff(push: AgentAutomationPushDelivery, now: string): AgentAutomationPushDelivery {
  return push.state === "pending" ? { ...push, lastAttemptAt: now, reason: "result_not_sent", state: "skipped" } : push;
}

export interface AgentAutomationRunRecord {
  runId: string;
  automationId: string;
  ownerId: string;
  /** The rule's version this period ran with. */
  version: number;
  /** The period's planned time (not when it actually ran). */
  scheduledAt: string;
  /** When the period was computed. */
  computedAt: string;
  /** How many tries the computation took (1: the first try; more: it failed first and was tried again with the same key). */
  computeAttempts?: number;
  outcome: AgentAutomationRunOutcomeKind;
  /** Periods passed over before this one after an interruption (only the latest is run). */
  skipped: number;
  /** The local days of the periods passed over, oldest first (at most the first 12). */
  skippedDays?: readonly string[];
  title: string;
  locale: "zh" | "en" | "ja";
  /** What the inbox entry says: the basis, the coverage and the list. Empty when nothing is sent. */
  text: string;
  items: readonly AgentAutomationRunItem[];
  /** A card this period made (it waits in the inbox for the owner's click). */
  cardId?: string;
  cardExpiresAt?: string;
  /** Why the owner has to look at the rule (a referenced note can no longer be read). */
  attention?: { reason: "reference_unreadable"; message: string; reference?: { type: string; id: string; title?: string } };
  error?: string;
  coverage?: { total: number; afterHardConditions: number; judged: number; truncated: number };
  /** AG15 interface: the result page's basis line and the plain notes under its cards. */
  detail?: {
    basis: string;
    notes: readonly string[];
    /** The note the run picked by: which one (two may share a title), for the trace and the judge. */
    basisNote?: { id: string; title: string; day: string };
    /** The same note as a small card the result page opens (AE-SCL-030 R4), with the line above it. */
    source?: { caption: string; card: AgentAnswerRecordContract };
  };
  notify: AgentRuleNotify;
  delivery: { inbox: AgentAutomationInboxDelivery; push: AgentAutomationPushDelivery };
}

export function automationRunId(input: { workspaceId: string; ownerId: string; automationId: string; version: number; scheduledAt: string }): string {
  const key = JSON.stringify([input.workspaceId, input.ownerId, input.automationId, input.version, new Date(input.scheduledAt).toISOString()]);
  return `autorun:${createHash("sha256").update(key).digest("hex").slice(0, 32)}`;
}

export function automationPartition(workspaceId: string, ownerId: string): string {
  return `${workspaceId}:agent-actor:${ownerId}`;
}

function recordOf(workspaceId: string, run: AgentAutomationRunRecord): LiveRecord<Record<string, unknown>> {
  return {
    collectionName: AGENT_AUTOMATION_RUN_COLLECTION,
    createdAt: run.computedAt,
    evidenceIds: [],
    lifecycleState: "active",
    occurredAt: run.scheduledAt,
    payload: { run } as unknown as Record<string, unknown>,
    recordId: run.runId,
    sourceId: run.automationId,
    sourceLabel: "Orbit scheduled rule run",
    sourceType: "system",
    updatedAt: [run.computedAt, run.delivery.inbox.lastAttemptAt, run.delivery.push.lastAttemptAt].filter((at): at is string => Boolean(at)).sort().pop()!,
    userId: run.ownerId,
    workspaceId: automationPartition(workspaceId, run.ownerId),
  };
}

const runOf = (record: LiveRecord<Record<string, unknown>> | null): AgentAutomationRunRecord | null => (record?.payload?.run as AgentAutomationRunRecord | undefined) ?? null;

export interface AutomationRunStore {
  get(ownerId: string, runId: string): Promise<AgentAutomationRunRecord | null>;
  /** Inserts the period's record; null when the period has one already (it was computed before). */
  insert(run: AgentAutomationRunRecord): Promise<AgentAutomationRunRecord | null>;
  save(run: AgentAutomationRunRecord): Promise<AgentAutomationRunRecord>;
  /** Newest period first. */
  list(ownerId: string, automationId: string, limit: number): Promise<AgentAutomationRunRecord[]>;
}

export const AUTOMATION_RUN_HISTORY_LIMIT = 200;

export function createAutomationRunStore(store: LiveRecordStoreLike<Record<string, unknown>>, workspaceId: string): AutomationRunStore {
  return {
    async get(ownerId, runId) {
      return runOf(await store.getRecord({ collectionName: AGENT_AUTOMATION_RUN_COLLECTION, recordId: runId, workspaceId: automationPartition(workspaceId, ownerId) }));
    },
    async insert(run) {
      const record = recordOf(workspaceId, run);
      if (store.insertRecordIfAbsent) return runOf(await store.insertRecordIfAbsent(record));
      const existing = await store.getRecord({ collectionName: AGENT_AUTOMATION_RUN_COLLECTION, recordId: run.runId, workspaceId: record.workspaceId });
      if (existing) return null;
      return runOf(await store.upsertRecord(record));
    },
    async list(ownerId, automationId, limit) {
      const records = await store.listRecords({ collectionName: AGENT_AUTOMATION_RUN_COLLECTION, limit: Math.min(Math.max(1, limit), AUTOMATION_RUN_HISTORY_LIMIT), sourceId: automationId, workspaceId: automationPartition(workspaceId, ownerId) });
      return records.map(runOf).filter((run): run is AgentAutomationRunRecord => Boolean(run)).sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt));
    },
    async save(run) {
      await store.upsertRecord(recordOf(workspaceId, run));
      return run;
    },
  };
}

/**
 * Records a rule already told its owner about (PLANNER 易错边界 5): the items of earlier periods whose result was
 * delivered or is still to be delivered. A period called off before sending told nothing.
 */
export function toldRefsOf(runs: readonly AgentAutomationRunRecord[]): Set<string> {
  const told = new Set<string>();
  for (const run of runs) {
    if (run.delivery.inbox.state !== "delivered" && run.delivery.inbox.state !== "pending") continue;
    for (const item of run.items) told.add(item.ref);
  }
  return told;
}

/** One history line as the "my scheduled tasks" page shows it (plain words; code writes them). */
export function runHistoryLine(run: Pick<AgentAutomationRunRecord, "outcome" | "skipped" | "skippedDays" | "items" | "attention" | "delivery" | "cardId" | "computeAttempts">, locale: "zh" | "en" | "ja"): string {
  const count = run.items.length;
  const base: Record<AgentAutomationRunOutcomeKind, Record<"zh" | "en" | "ja", string>> = {
    delivered: {
      en: run.cardId ? "A change is waiting for your confirmation in the inbox" : `Sent to your inbox: ${count} item${count === 1 ? "" : "s"}`,
      ja: run.cardId ? "受信箱で確認待ちの変更があります" : `受信箱に届けました（${count}件）`,
      zh: run.cardId ? "有一项修改在收件箱里等你确认" : `已放进收件箱（${count}条）`,
    },
    failed: { en: "This run did not finish", ja: "今回は実行できませんでした", zh: "这一期没有跑成" },
    needs_attention: { en: run.attention?.message ?? "Needs your attention", ja: run.attention?.message ?? "確認が必要です", zh: run.attention?.message ?? "需要你处理" },
    no_match: { en: "Nothing new", ja: "新しいものはありません", zh: "没有新的" },
    undelivered: UNDELIVERED[run.delivery.inbox.state === "cancelled" ? run.delivery.inbox.cancelReason ?? "rule_changed" : "pending"],
  };
  // Tried again before it worked: said plainly, and that a re-sent result was not worked out a second time.
  const recomputed = (run.computeAttempts ?? 1) > 1 && run.outcome !== "failed"
    ? ({ en: " — the first try did not finish; the retry did", ja: "（1回目は実行できず、やり直して完了しました）", zh: "（第一次没跑成，重试后跑成了）" } as const)[locale]
    : "";
  const resent = run.delivery.inbox.state === "delivered" && run.delivery.inbox.attempts > 1
    ? ({ en: " — it did not reach the inbox at first and was sent again; nothing was worked out a second time", ja: "（最初は届かず、送り直しました。結果の計算はやり直していません）", zh: "（第一次没送到，补送到了；没有重新算）" } as const)[locale]
    : "";
  const days = (run.skippedDays ?? []).map((day) => {
    const [, month, date] = day.split("-").map(Number);
    return locale === "en" ? `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${date}` : `${month}月${date}日`;
  });
  const more = run.skipped > days.length && days.length > 0;
  const named = days.length ? ({ en: `: ${days.join(", ")}${more ? ", …" : ""}`, ja: `：${days.join("、")}${more ? " ほか" : ""}`, zh: `：${days.join("、")}${more ? "等" : ""}` } as const)[locale] : "";
  const skipped = run.skipped > 0
    ? ({ en: ` — ${run.skipped} earlier run${run.skipped === 1 ? " was" : "s were"} skipped while the service was down${named}`, ja: `（その前の${run.skipped}回分は実行されず、飛ばしました${named}）`, zh: `（之前有${run.skipped}期没有运行，已跳过${named}）` } as const)[locale]
    : "";
  return `${base[run.outcome][locale]}${recomputed}${resent}${skipped}`;
}

const UNDELIVERED: Record<"pending" | NonNullable<AgentAutomationInboxDelivery["cancelReason"]>, Record<"zh" | "en" | "ja", string>> = {
  pending: { en: "Worked out, not sent yet", ja: "結果は出ましたが、まだ届いていません", zh: "已算出，还没送出" },
  reference_unreadable: { en: "Worked out, not sent: the note it picks by could no longer be opened", ja: "結果は出ましたが、基準のメモが開けなくなったため届けていません", zh: "已算出，没有送出：用来挑的笔记打不开了" },
  rule_changed: { en: "Worked out, not sent: you changed the task before it went out", ja: "結果は出ましたが、届ける前にタスクが変更されたため届けていません", zh: "已算出，没有送出：送出前你改了这条任务" },
  rule_paused: { en: "Worked out, not sent: you paused the task before it went out", ja: "結果は出ましたが、届ける前に停止されたため届けていません", zh: "已算出，没有送出：送出前你暂停了这条任务" },
  rule_removed: { en: "Worked out, not sent: you deleted the task before it went out", ja: "結果は出ましたが、届ける前にタスクが削除されたため届けていません", zh: "已算出，没有送出：送出前你删除了这条任务" },
};

type PushLineRun = Pick<AgentAutomationRunRecord, "outcome" | "delivery">;

/** "9:04": when the reminder arrived, on the wall clock of the task's zone. */
function pushClock(instant: string, timeZone: string): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", minute: "2-digit", timeZone }).formatToParts(new Date(instant));
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return hour && minute ? `${Number(hour)}:${minute}` : null;
  } catch {
    return null;
  }
}

const DEVICE_WORDS: Record<"phone" | "browser" | "both", Record<"zh" | "en" | "ja", string>> = {
  both: { en: "notifications were turned off on your phone and in your browser", ja: "スマホとブラウザの通知がオフになっていました", zh: "手机和浏览器的通知都被关了" },
  browser: { en: "notifications were turned off in your browser", ja: "ブラウザの通知がオフになっていました", zh: "浏览器的通知被关了" },
  phone: { en: "notifications were turned off on your phone", ja: "スマホの通知がオフになっていました", zh: "手机的通知被关了" },
};

const IN_INBOX: Record<"zh" | "en" | "ja", string> = { en: " The result is in your inbox.", ja: "結果は受信箱にあります。", zh: "结果在收件箱里。" };

type SkipReason = "quiet_hours" | "daily_cap" | "notifications_off" | "reminder_off" | "rule_paused" | "rule_removed" | "result_not_sent";

const PUSH_SKIPPED: Record<SkipReason, Record<"zh" | "en" | "ja", string>> = {
  daily_cap: { en: "No reminder: the day's reminder limit was reached.", ja: "お知らせなし：1日の上限に達していました。", zh: "没有提醒：当天的提醒已到每日上限。" },
  notifications_off: { en: "No reminder: this kind of notification is turned off in your notification settings.", ja: "お知らせなし：通知設定でこの種類の通知がオフになっています。", zh: "没有提醒：通知设置里关掉了这类提醒。" },
  quiet_hours: { en: "No reminder: it was during your quiet hours.", ja: "お知らせなし：おやすみ時間帯でした。", zh: "没有提醒：当时是免打扰时段。" },
  reminder_off: { en: "No reminder: you turned this task's reminder off before it went out.", ja: "お知らせなし：送る前にこのタスクのお知らせがオフになりました。", zh: "没有提醒：送出前你关掉了这条任务的提醒。" },
  result_not_sent: { en: "No reminder: the result itself was not sent.", ja: "お知らせなし：結果そのものを届けていません。", zh: "没有提醒：这一期的结果没有送出。" },
  rule_paused: { en: "No reminder: you paused the task before it went out.", ja: "お知らせなし：送る前にタスクが停止されました。", zh: "没有提醒：送出前你暂停了这条任务。" },
  rule_removed: { en: "No reminder: you deleted the task before it went out.", ja: "お知らせなし：送る前にタスクが削除されました。", zh: "没有提醒：送出前你删除了这条任务。" },
};

/**
 * The second history line of a period (AG16; 视觉稿 16-4): whether the reminder arrived — apart from the first line,
 * which says when the result was worked out. A reminder that did not arrive is said as such and never as a failed task.
 * Null: nothing to say (the period made no result to remind about and the first line says why).
 */
export function pushHistoryLine(run: PushLineRun, locale: "zh" | "en" | "ja", timeZone?: string): string | null {
  const push = run.delivery.push;
  // With the task's zone (the task pages): when the reminder arrived, as the draft writes it (「提醒已送到 9:04」).
  const at = timeZone && push.deliveredAt ? pushClock(push.deliveredAt, timeZone) : null;
  const inbox = run.delivery.inbox.state === "delivered" ? IN_INBOX[locale] : "";
  if (push.state === "not_requested") {
    if (run.outcome === "no_match") return ({ en: "Nothing new, so no reminder", ja: "新しいものがないため、お知らせはありません", zh: "没有新的，所以不提醒" } as const)[locale];
    if (run.outcome === "delivered" || run.outcome === "undelivered") return ({ en: "The reminder was not turned on then", ja: "このときはお知らせがオフでした", zh: "当时没开提醒" } as const)[locale];
    return null;
  }
  if (push.state === "delivered") {
    if (at) {
      return push.attempts > 1
        ? ({ en: `The reminder did not go out at first and arrived at ${at}. Nothing was worked out a second time.`, ja: `お知らせは最初は送れず、${at} に届きました。結果の計算はやり直していません。`, zh: `第一次没送出去，${at} 补送到了。没有重新算。` } as const)[locale]
        : ({ en: `Reminder delivered at ${at}`, ja: `お知らせを届けました（${at}）`, zh: `提醒已送到 ${at}` } as const)[locale];
    }
    return push.attempts > 1
      ? ({ en: "The reminder did not go out at first and was sent again. Nothing was worked out a second time.", ja: "お知らせは最初は送れず、送り直して届きました。結果の計算はやり直していません。", zh: "第一次没送出去，后来补送到了。没有重新算。" } as const)[locale]
      : ({ en: "Reminder delivered", ja: "お知らせを届けました", zh: "提醒已送到" } as const)[locale];
  }
  if (push.state === "pending") {
    return push.attempts > 0
      ? ({ en: "The reminder did not go out at first; it will be sent again. Nothing is worked out a second time.", ja: "お知らせは最初は送れませんでした。もう一度送ります。結果の計算はやり直しません。", zh: "提醒第一次没送出去，会再送一次；不会重新算。" } as const)[locale]
      : ({ en: "The reminder has not gone out yet", ja: "お知らせはまだ送っていません", zh: "提醒还没送出" } as const)[locale];
  }
  if (push.state === "skipped") {
    const reason: SkipReason = push.reason && push.reason in PUSH_SKIPPED ? (push.reason as SkipReason) : "result_not_sent";
    return `${PUSH_SKIPPED[reason][locale]}${reason === "result_not_sent" ? "" : inbox}`;
  }
  // failed: wanted, did not arrive.
  const head = ({ en: "The reminder did not arrive", ja: "お知らせは届きませんでした", zh: "提醒没送到" } as const)[locale];
  const stop = locale === "en" ? "." : "。";
  const colon = locale === "en" ? ": " : "：";
  if (push.reason === "permission_revoked") {
    const revoked = (push.targets ?? []).filter((target) => target.state === "revoked");
    const phone = revoked.some((target) => target.platform !== "web");
    const browser = revoked.some((target) => target.platform === "web");
    const which = DEVICE_WORDS[phone && browser ? "both" : browser ? "browser" : "phone"][locale];
    return `${head}${colon}${which}${stop}${inbox}`;
  }
  if (push.reason === "no_device") {
    return `${head}${colon}${({ en: "no phone or browser of yours allows Orbit to send notifications", ja: "Orbit の通知を許可している端末がありません", zh: "没有设备允许 Orbit 发通知" } as const)[locale]}${stop}${inbox}`;
  }
  return `${head}${stop}${inbox}`;
}
