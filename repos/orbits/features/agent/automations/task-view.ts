/**
 * What "my scheduled tasks" shows (agent-design AG15; 设计稿 §10, 附录 E): a task with the same rows its confirmation
 * card had (written by the same code), its next expected run from the due index, and its run history. The two clients
 * show these as they are; neither assembles the words.
 */
import type { AgentScheduledTaskContract, AgentScheduledTaskHistoryContract, AgentScheduledTaskRunContract } from "../../../shared/contract/agent-v1";
import { checkTimeWords, countWords, nextRunWords, notifyWords, validityWords, type RuleSchedule } from "../../agent-v1/domains/rule/ops";
import { agentAutomationNotify, type AgentAutomation, type AgentAutomationService } from "./contract";
import type { AutomationStorage } from "./due-index";
import { createAutomationRunStore, pushHistoryLine, runHistoryLine, type AgentAutomationRunRecord } from "./runs";

type Locale = "zh" | "en" | "ja";

const LABELS: Record<Locale, { when: string; scope: string; basis: string; count: string; until: string; notify: string; next: string; none: string }> = {
  en: { basis: "Picked by", count: "How many", next: "Next run expected", none: "No run scheduled", notify: "How you're told", scope: "Picks from", until: "Runs until", when: "Checks" },
  ja: { basis: "選び方", count: "件数", next: "次回の実行予定", none: "実行予定はありません", notify: "お知らせ方法", scope: "対象", until: "有効期限", when: "チェックする時間" },
  zh: { basis: "排序依据", count: "条数", next: "下次预计运行", none: "没有要运行的了", notify: "提醒方式", scope: "候选范围", until: "有效期", when: "检查时间" },
};

export function scheduledRunView(run: AgentAutomationRunRecord, locale: Locale = run.locale): AgentScheduledTaskRunContract {
  return {
    ...(run.attention ? { attention: { message: run.attention.message, reason: run.attention.reason, ...(run.attention.reference?.title ? { referenceTitle: run.attention.reference.title } : {}) } } : {}),
    computeAttempts: run.computeAttempts ?? 1,
    computedAt: run.computedAt,
    delivery: { attempts: run.delivery.inbox.attempts, state: run.delivery.inbox.state, ...(run.delivery.inbox.deliveredAt ? { deliveredAt: run.delivery.inbox.deliveredAt } : {}), ...(run.delivery.inbox.cancelReason ? { cancelReason: run.delivery.inbox.cancelReason } : {}) },
    items: run.items.map((item) => ({ id: item.id, kind: item.kind, line: item.line, ref: item.ref, title: item.title })),
    line: runHistoryLine(run, locale),
    outcome: run.outcome,
    // AG16: the reminder, apart from the result's own line above. No ticket, token or error text leaves the server.
    push: {
      attempts: run.delivery.push.attempts,
      line: pushHistoryLine(run, locale),
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

export function scheduledTaskView(automation: AgentAutomation, lastRun: AgentAutomationRunRecord | null, now: string, requested?: Locale): AgentScheduledTaskContract {
  const locale: Locale = requested ?? automation.rule?.locale ?? "zh";
  const labels = LABELS[locale];
  const schedule = automation.trigger.kind === "schedule" && automation.trigger.schedule.kind !== "once" ? (automation.trigger.schedule as RuleSchedule) : null;
  const status: AgentScheduledTaskContract["status"] = automation.status === "paused" ? "paused" : automation.status === "completed" || automation.status === "failed" ? "completed" : "active";
  const rule = automation.rule;
  const rows: { field: string; label: string; value: string }[] = [];
  if (schedule) rows.push({ field: "schedule", label: labels.when, value: checkTimeWords(schedule, locale) });
  if (rule) {
    rows.push(
      { field: "scope", label: labels.scope, value: rule.scopeText },
      { field: "rankingBasis", label: labels.basis, value: rule.rankingBasis },
      { field: "maxItems", label: labels.count, value: countWords(rule, locale) },
      { field: "validUntil", label: labels.until, value: validityWords(rule.validUntil, locale) },
    );
  }
  rows.push({ field: "notify", label: labels.notify, value: notifyWords(agentAutomationNotify(automation), locale) });
  if (schedule) rows.push({ field: "nextRunAt", label: labels.next, value: status === "active" && automation.nextRunAt ? nextRunWords(schedule, rule?.validUntil ?? null, new Date(Date.parse(automation.nextRunAt) - 1).toISOString(), locale) : labels.none });
  void now;
  return {
    createdAt: automation.createdAt,
    id: automation.automationId,
    lastRun: lastRun ? scheduledRunView(lastRun, locale) : null,
    nextRunAt: status === "active" ? automation.nextRunAt : null,
    notify: agentAutomationNotify(automation),
    rows,
    status,
    timeZone: schedule?.timeZone ?? null,
    title: automation.title,
    updatedAt: automation.updatedAt,
    version: automation.version,
  };
}

/** The owner's tasks with each one's latest run (scheduled ones only; signal-triggered playbooks stay on their own page). */
export async function listScheduledTasks(input: { ownerId: string; service: Pick<AgentAutomationService, "list">; storage: AutomationStorage | null; now: string; locale?: Locale }): Promise<AgentScheduledTaskContract[]> {
  const automations = (await input.service.list()).filter((automation) => automation.trigger.kind === "schedule");
  const runs = input.storage ? createAutomationRunStore(input.storage.direct.store, input.storage.workspaceId) : null;
  const tasks: AgentScheduledTaskContract[] = [];
  for (const automation of automations) {
    const last = runs ? (await runs.list(input.ownerId, automation.automationId, 20))[0] ?? null : null;
    tasks.push(scheduledTaskView(automation, last, input.now, input.locale));
  }
  return tasks;
}

/** One task with its history, newest period first; null when it is not this owner's. */
export async function scheduledTaskHistory(input: { ownerId: string; automationId: string; service: Pick<AgentAutomationService, "get">; storage: AutomationStorage | null; now: string; locale?: Locale; limit?: number }): Promise<AgentScheduledTaskHistoryContract | null> {
  const automation = await input.service.get(input.automationId);
  if (!automation) return null;
  const runs = input.storage ? await createAutomationRunStore(input.storage.direct.store, input.storage.workspaceId).list(input.ownerId, automation.automationId, input.limit ?? 50) : [];
  const locale = input.locale ?? automation.rule?.locale ?? "zh";
  return { runs: runs.map((run) => scheduledRunView(run, locale)), task: scheduledTaskView(automation, runs[0] ?? null, input.now, input.locale) };
}
