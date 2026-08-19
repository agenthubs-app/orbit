import type { AgentSignal } from "../agent/signals/contract";
import type {
  NotificationDeliveryPreferences,
  NotificationDeliveryService,
} from "./delivery-service";

export interface AgentSignalMaterializationResult {
  created: number;
  skipped: number;
}

/**
 * Materializes only signal-owned follow-up-due reminders. Event-upcoming signals
 * remain on the pre-event workflow path so the event scheduler and signal
 * worker cannot create two different delivery ids for the same event.
 */
export async function materializeCommitmentSignals(input: {
  delivery: NotificationDeliveryService;
  now: string;
  preferences: Pick<NotificationDeliveryPreferences, "followupDuePushEnabled">;
  signals: readonly AgentSignal[];
}): Promise<AgentSignalMaterializationResult> {
  let created = 0;
  let skipped = 0;
  for (const signal of input.signals) {
    if (
      (signal.status !== "new" && signal.status !== "snoozed") ||
      signal.type !== "followup_due" ||
      !input.preferences.followupDuePushEnabled
    ) {
      skipped += 1;
      continue;
    }
    const snoozedUntil =
      signal.status === "snoozed" ? signal.snoozedUntil : undefined;
    if (signal.status === "snoozed" && !snoozedUntil) {
      skipped += 1;
      continue;
    }
    const scheduledFor =
      snoozedUntil ??
      (Number.isFinite(Date.parse(signal.occurredAt)) &&
      Date.parse(signal.occurredAt) > Date.parse(input.now)
        ? signal.occurredAt
        : input.now);
    const result = await input.delivery.materialize({
      body: "你有一条待处理的关系提醒，打开 Orbit 查看。",
      phase: "commitment",
      scheduledFor,
      signalId: signal.signalId,
      signalRevision: snoozedUntil
        ? `${signal.materialHash}:snooze:${snoozedUntil}`
        : signal.materialHash,
      title: "Orbit 提醒",
    });
    if (result.created) created += 1;
    else skipped += 1;
  }
  return { created, skipped };
}
