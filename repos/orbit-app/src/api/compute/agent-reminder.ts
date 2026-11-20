/**
 * agent-design AG16 (approved visual draft 16-1 to 16-4): what both clients decide about a scheduled task's reminder
 * on its page and under a confirmed card. The words are the server's (the history's second line) or each client's fixed
 * copy; this file only chooses — the same way on the web and in the App.
 */
import type { AgentActionPreviewContract, AgentScheduledTaskContract, AgentScheduledTaskRunContract } from "../contract/agent-v1";

/**
 * The history shows each period's reminder line only for a task that has, or once had, its reminder on. A task whose
 * reminder was never turned on keeps one line per period (draft 15-4), not "当时没开提醒" under every one of them.
 */
export function showsReminderLines(task: Pick<AgentScheduledTaskContract, "notify">, runs: readonly Pick<AgentScheduledTaskRunContract, "push">[]): boolean {
  return task.notify.push || runs.some((run) => run.push.state !== "not_requested");
}

export type ReminderLineTone = "delivered" | "missed" | "quiet";

/**
 * A period's second line (16-4): the server's sentence and how it is shown — delivered with a tick, a reminder that
 * did not arrive in red (the task did not fail), anything else in grey. Null: no second line for this period.
 */
export function reminderLineOf(run: Pick<AgentScheduledTaskRunContract, "push">): { text: string; tone: ReminderLineTone } | null {
  const text = run.push.line;
  if (!text) return null;
  return { text, tone: run.push.state === "delivered" ? "delivered" : run.push.state === "failed" ? "missed" : "quiet" };
}

/** The first line of a period that made a result, when the history tells the two apart (16-4 「结果已生成 9:04」). */
export function namesResultTime(run: Pick<AgentScheduledTaskRunContract, "outcome" | "display">, reminderLines: boolean): boolean {
  return reminderLines && run.outcome === "delivered" && Boolean(run.display?.time);
}

const pushOn = (value: unknown): boolean => {
  const notify = value && typeof value === "object" ? (value as { notify?: unknown }).notify : undefined;
  return Boolean(notify && typeof notify === "object" && (notify as { push?: unknown }).push === true);
};

/**
 * A card that, once confirmed, turned a scheduled task's reminder on (16-2): one of its changes to a task set the
 * reminder from off to on and went through. Under such a card the client says whether this device will ring.
 */
export function cardTurnedReminderOn(card: Pick<AgentActionPreviewContract, "status" | "operations">): boolean {
  if (card.status !== "completed" && card.status !== "partially_failed") return false;
  return card.operations.some((operation) => operation.capability === "rule.update" && operation.status === "succeeded" && pushOn(operation.after) && !pushOn(operation.before));
}

/**
 * The period whose reminder found that this device no longer allows notifications (16-3 ④ 「11月6日 那期」): the
 * newest one whose reminder this device refused. Null when this task's history does not have it.
 */
export function refusedRunOf<Run extends Pick<AgentScheduledTaskRunContract, "push">>(runs: readonly Run[], deviceId: string | null): Run | null {
  if (!deviceId) return null;
  return runs.find((run) => (run.push.targets ?? []).some((target) => target.deviceId === deviceId && target.state === "revoked")) ?? null;
}
