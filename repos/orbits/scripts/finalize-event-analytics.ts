import { runEventAnalyticsMigrations } from "../features/events/event-analytics/migrations";
import { createEventAnalyticsRoiSnapshotFinalizer } from "../features/events/event-analytics/snapshot";
import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { eventPilotDecision } from "../shared/config/event-pilot-gate";
import { loadLocalEnv } from "./load-local-env";

function limitFromEnvironment(): number {
  const raw = process.env.ORBIT_EVENT_ANALYTICS_FINALIZE_LIMIT?.trim();
  if (!raw) return 50;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 100) {
    throw new Error(
      "ORBIT_EVENT_ANALYTICS_FINALIZE_LIMIT must be an integer from 1 to 100.",
    );
  }
  return value;
}

function productionEventIds(): readonly string[] | undefined {
  if (process.env.NODE_ENV !== "production") return undefined;
  const eventIds = [...new Set(
    (process.env.ORBIT_EVENT_PILOT_EVENT_IDS ?? "")
      .split(",")
      .map((eventId) => eventId.trim())
      .filter(Boolean),
  )];
  if (eventIds.length === 0) {
    throw new Error(
      "Production ROI finalization requires ORBIT_EVENT_PILOT_EVENT_IDS.",
    );
  }
  for (const eventId of eventIds) {
    const decision = eventPilotDecision({
      capability: "effective_connection_roi",
      eventId,
    });
    if (!decision.enabled) {
      throw new Error(
        `Production ROI finalization is disabled for ${eventId}: ${decision.reason}.`,
      );
    }
  }
  return eventIds;
}

async function main(): Promise<void> {
  loadLocalEnv();
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) {
    throw new Error(
      "Set ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before finalizing event analytics.",
    );
  }
  try {
    await runEventAnalyticsMigrations(runtime.client);
    const result = await createEventAnalyticsRoiSnapshotFinalizer({ runtime })
      .finalizeDue({
        eventIds: productionEventIds(),
        limit: limitFromEnvironment(),
      });
    console.log(JSON.stringify({
      finalized: result.finalized,
      metric: "event-roi",
      workspaceId: runtime.workspaceId,
    }));
  } finally {
    await runtime.client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
