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

/** AG16 fills this in; AG15 only records whether the rule asked for a push at this version. */
export interface AgentAutomationPushDelivery {
  state: "not_requested" | "pending" | "delivered" | "failed";
  attempts: number;
  lastAttemptAt?: string;
  deliveredAt?: string;
  lastError?: string;
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
    updatedAt: run.delivery.inbox.lastAttemptAt ?? run.computedAt,
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
