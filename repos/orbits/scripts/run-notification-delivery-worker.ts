import { loadEnvConfig } from "@next/env";

import { createAgentPreferencesService } from "../features/agent/preferences";
import { createAgentSignalService } from "../features/agent/signals/service-factory";
import {
  createNotificationDeliveryService,
  createNotificationDeliveryWorker,
} from "../features/notifications/delivery-service";
import { materializeCommitmentSignals } from "../features/notifications/signal-materializer";
import {
  createCanonicalPostEventNotificationDeliveryMaterializer,
  materializeCanonicalPostEventReminderIntents,
  readCanonicalPostEventReminderIntents,
} from "../features/notifications/canonical-post-event-reminder-source";
import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { createConfiguredExpoPushAdapter } from "../features/notifications/push-adapter";
import {
  createConfiguredPushDeviceActorEnumerator,
  createPushDeviceService,
} from "../features/notifications/push-device-service";

loadEnvConfig(process.cwd());

const pollIntervalMs = Math.max(
  1_000,
  Number.parseInt(process.env.ORBIT_NOTIFICATION_WORKER_POLL_MS ?? "5000", 10) ||
    5_000,
);
const workerId =
  process.env.ORBIT_NOTIFICATION_WORKER_ID?.trim() ??
  `notification-worker:${process.pid}`;
const signalPollIntervalMs = Math.max(
  10_000,
  Number.parseInt(process.env.ORBIT_NOTIFICATION_SIGNAL_POLL_MS ?? "60000", 10) ||
    60_000,
);

async function main(): Promise<void> {
  const actors = createConfiguredPushDeviceActorEnumerator();
  if (!actors) {
    throw new Error(
      "A configured live database is required for the notification actor dispatcher.",
    );
  }
  const eventRuntime = createConfiguredEventOperationsPostgresRuntime();
  if (!eventRuntime) {
    throw new Error(
      "A configured Event Core database is required for canonical proactive reminders.",
    );
  }
  let nextSignalRefreshAt = 0;
  while (true) {
    const now = new Date().toISOString();
    const actorIds = await actors.listOptedInActorIds();
    const total = {
      claimed: 0,
      deferred: 0,
      deadLettered: 0,
      receiptPending: 0,
      retried: 0,
      sent: 0,
      suppressed: 0,
    };
    const signalMaterialization = { created: 0, skipped: 0 };
    const postEventMaterialization = { created: 0, skipped: 0 };
    const refreshSignals = Date.now() >= nextSignalRefreshAt;
    if (refreshSignals) nextSignalRefreshAt = Date.now() + signalPollIntervalMs;

    for (const [index, actorId] of actorIds.entries()) {
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
          delivery,
          now,
          preferences: currentPreferences,
          signals: refreshedSignals,
        });
        signalMaterialization.created += materialized.created;
        signalMaterialization.skipped += materialized.skipped;
        const postEventIntents = await readCanonicalPostEventReminderIntents({
          actorId,
          now,
          runtime: eventRuntime,
        });
        const postEvent = await materializeCanonicalPostEventReminderIntents({
          actorId,
          intents: postEventIntents,
          materializer: createCanonicalPostEventNotificationDeliveryMaterializer({
            actorId,
            delivery,
          }),
        });
        postEventMaterialization.created += postEvent.created;
        postEventMaterialization.skipped += postEvent.skipped;
      }
      const result = await createNotificationDeliveryWorker({
        delivery,
        devices,
        preferences: () => preferences.get(),
        push: createConfiguredExpoPushAdapter(),
        sourceEligible: async (candidate) => {
          if (!candidate.signalId.startsWith("signal:")) return true;
          if (!refreshedSignals) {
            await signals.refresh();
            refreshedSignals = await signals.list({
              includeResolved: true,
              limit: 100,
            });
          }
          const source = refreshedSignals.find(
            (signal) => signal.signalId === candidate.signalId,
          );
          return source?.status === "new";
        },
      }).run({
        limit: 25,
        workerId: `${workerId}:${index}`,
      });
      total.claimed += result.claimed;
      total.deferred += result.deferred;
      total.deadLettered += result.deadLettered;
      total.receiptPending += result.receiptPending;
      total.retried += result.retried;
      total.sent += result.sent;
      total.suppressed += result.suppressed;
    }
    if (
      total.claimed > 0 ||
      signalMaterialization.created > 0 ||
      postEventMaterialization.created > 0
    ) {
      process.stdout.write(
        `${JSON.stringify({ actorCount: actorIds.length, postEventMaterialization, result: total, signalMaterialization, workerId })}\n`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
