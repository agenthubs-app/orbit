import { loadEnvConfig } from "@next/env";

import { runNotificationDeliveryPass } from "../features/notifications/delivery-pass";

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
  let nextSignalRefreshAt = 0;
  while (true) {
    const refreshSignals = Date.now() >= nextSignalRefreshAt;
    if (refreshSignals) nextSignalRefreshAt = Date.now() + signalPollIntervalMs;
    // Configuration errors (no actor or Event Core database) propagate and stop
    // the process, matching the previous fail-fast startup behaviour.
    const pass = await runNotificationDeliveryPass({ refreshSignals, workerId });
    const { actorCount, postEventMaterialization, result, signalMaterialization } = pass;
    if (
      result.claimed > 0 ||
      signalMaterialization.created > 0 ||
      postEventMaterialization.created > 0
    ) {
      process.stdout.write(
        `${JSON.stringify({ actorCount, postEventMaterialization, result, signalMaterialization, workerId })}\n`,
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
