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
async function main(): Promise<void> {
  while (true) {
    // Configuration errors (no actor or Event Core database) propagate and stop
    // the process, matching the previous fail-fast startup behaviour.
    const pass = await runNotificationDeliveryPass({ workerId });
    const { actorCount, result } = pass;
    if (result.claimed > 0) {
      process.stdout.write(
        `${JSON.stringify({ actorCount, result, workerId })}\n`,
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
