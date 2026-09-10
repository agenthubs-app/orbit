import { createAgentPreferencesService } from "../agent/preferences";
import { createAgentSignalService } from "../agent/signals/service-factory";
import { createConfiguredEventOperationsPostgresRuntime } from "../events/event-operations/storage/postgres-client";
import {
  createCanonicalPostEventNotificationDeliveryMaterializer,
  materializeCanonicalPostEventReminderIntents,
  readCanonicalPostEventReminderIntents,
} from "./canonical-post-event-reminder-source";
import { createNotificationDeliveryService, createNotificationDeliveryWorker } from "./delivery-service";
import { createConfiguredExpoPushAdapter } from "./push-adapter";
import { createConfiguredPushDeviceActorEnumerator, createPushDeviceService } from "./push-device-service";
import { materializeCommitmentSignals } from "./signal-materializer";

// One bounded delivery pass over every opted-in actor. The long-running
// `scripts/run-notification-delivery-worker.ts` loop and the scheduled
// maintenance pass share this body so redelivery does not depend on a
// never-ending process being alive somewhere.

export interface NotificationDeliveryPassCounts {
  claimed: number;
  deferred: number;
  deadLettered: number;
  receiptPending: number;
  retried: number;
  sent: number;
  suppressed: number;
}

export interface NotificationDeliveryPassResult {
  actorCount: number;
  /** Actors skipped because the caller's deadline passed. */
  deferredActors: number;
  postEventMaterialization: { created: number; skipped: number };
  result: NotificationDeliveryPassCounts;
  signalMaterialization: { created: number; skipped: number };
  workerId: string;
}

export interface NotificationDeliveryPassOptions {
  /** Epoch milliseconds; actors are not started once it has passed. */
  deadline?: number;
  actors?: { listOptedInActorIds(): Promise<string[]> } | null;
  eventRuntime?: ReturnType<typeof createConfiguredEventOperationsPostgresRuntime>;
  limit?: number;
  now?: string;
  push?: ReturnType<typeof createConfiguredExpoPushAdapter>;
  refreshSignals: boolean;
  workerId: string;
}

export class NotificationDeliveryUnconfigured extends Error {
  constructor(readonly reason: "actor_database" | "event_database") {
    super(`Notification delivery is unavailable: ${reason} is not configured.`);
    this.name = "NotificationDeliveryUnconfigured";
  }
}

export async function runNotificationDeliveryPass(
  options: NotificationDeliveryPassOptions,
): Promise<NotificationDeliveryPassResult> {
  const actors = options.actors === undefined ? createConfiguredPushDeviceActorEnumerator() : options.actors;
  if (!actors) throw new NotificationDeliveryUnconfigured("actor_database");
  const eventRuntime = options.eventRuntime === undefined
    ? createConfiguredEventOperationsPostgresRuntime()
    : options.eventRuntime;
  if (!eventRuntime) throw new NotificationDeliveryUnconfigured("event_database");
  const push = options.push === undefined ? createConfiguredExpoPushAdapter() : options.push;
  const now = options.now ?? new Date().toISOString();
  const { refreshSignals, workerId } = options;
  const actorIds = await actors.listOptedInActorIds();
  const total: NotificationDeliveryPassCounts = {
    claimed: 0, deferred: 0, deadLettered: 0, receiptPending: 0, retried: 0, sent: 0, suppressed: 0,
  };
  const signalMaterialization = { created: 0, skipped: 0 };
  const postEventMaterialization = { created: 0, skipped: 0 };
  let deferredActors = 0;

  for (const [index, actorId] of actorIds.entries()) {
    if (options.deadline !== undefined && Date.now() >= options.deadline) {
      deferredActors += 1;
      continue;
    }
    const delivery = createNotificationDeliveryService({ actorId });
    const devices = createPushDeviceService({ actorId });
    const preferences = createAgentPreferencesService({ actorId });
    const signals = createAgentSignalService({ actorId, mode: "live" });
    let refreshedSignals: Awaited<ReturnType<typeof signals.list>> | null = null;
    if (refreshSignals) {
      const currentPreferences = await preferences.get();
      await signals.refresh();
      refreshedSignals = await signals.list({ includeResolved: true, limit: 100 });
      const materialized = await materializeCommitmentSignals({
        delivery, now, preferences: currentPreferences, signals: refreshedSignals,
      });
      signalMaterialization.created += materialized.created;
      signalMaterialization.skipped += materialized.skipped;
      const postEventIntents = await readCanonicalPostEventReminderIntents({ actorId, now, runtime: eventRuntime });
      const postEvent = await materializeCanonicalPostEventReminderIntents({
        actorId,
        intents: postEventIntents,
        materializer: createCanonicalPostEventNotificationDeliveryMaterializer({ actorId, delivery }),
      });
      postEventMaterialization.created += postEvent.created;
      postEventMaterialization.skipped += postEvent.skipped;
    }
    const result = await createNotificationDeliveryWorker({
      delivery,
      devices,
      preferences: () => preferences.get(),
      push,
      sourceEligible: async (candidate) => {
        if (!candidate.signalId.startsWith("signal:")) return true;
        if (!refreshedSignals) {
          await signals.refresh();
          refreshedSignals = await signals.list({ includeResolved: true, limit: 100 });
        }
        const source = refreshedSignals.find((signal) => signal.signalId === candidate.signalId);
        return source?.status === "new";
      },
    }).run({ limit: options.limit ?? 25, workerId: `${workerId}:${index}` });
    total.claimed += result.claimed;
    total.deferred += result.deferred;
    total.deadLettered += result.deadLettered;
    total.receiptPending += result.receiptPending;
    total.retried += result.retried;
    total.sent += result.sent;
    total.suppressed += result.suppressed;
  }
  return { actorCount: actorIds.length, deferredActors, postEventMaterialization, result: total, signalMaterialization, workerId };
}
