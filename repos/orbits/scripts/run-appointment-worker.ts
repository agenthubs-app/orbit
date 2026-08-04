import { hostname } from "node:os";

import { createPostgresAppointmentNotificationProjector } from "../features/appointments/notification-projector";
import { runAppointmentOutboxBatch } from "../features/appointments/outbox-worker";
import { runAppointmentMigrations } from "../features/appointments/storage/migrations";
import { createConfiguredEventOperationsPostgresRuntime } from "../features/events/event-operations/storage/postgres-client";
import { loadLocalEnv } from "./load-local-env";
import { abortableWait } from "./abortable-wait";

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive integer.`);
  return value;
}

async function main() {
  loadLocalEnv();
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  if (!runtime) throw new Error("Appointment worker requires the configured live database.");
  await runAppointmentMigrations(runtime.client);
  const projector = createPostgresAppointmentNotificationProjector(runtime);
  const pollMs = positiveInteger("ORBIT_APPOINTMENT_WORKER_POLL_MS", 1_000);
  const workerId = `appointment:${hostname()}:${process.pid}`;
  let stopping = false;
  const stopController = new AbortController();
  const stop = () => { stopping = true; stopController.abort(); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let failures = 0;
  process.stdout.write(`${JSON.stringify({ event: "appointment_worker_started", workerId })}\n`);
  try {
    while (!stopping) {
      try {
        const result = await runAppointmentOutboxBatch({ projector, runtime });
        failures = 0;
        if (result.completed || result.failed || result.retried) process.stdout.write(`${JSON.stringify({ event: "appointment_worker_drain", workerId, ...result })}\n`);
        await abortableWait(result.completed || result.failed || result.retried ? Math.min(25, pollMs) : pollMs, stopController.signal);
      } catch (error) {
        failures += 1;
        const backoffMs = Math.min(30_000, pollMs * 2 ** Math.min(5, failures - 1));
        process.stderr.write(`${JSON.stringify({ backoffMs, error: error instanceof Error ? error.message : "Appointment worker drain failed.", event: "appointment_worker_drain_failed", workerId })}\n`);
        await abortableWait(backoffMs, stopController.signal);
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    process.stdout.write(`${JSON.stringify({ event: "appointment_worker_stopped", workerId })}\n`);
    await runtime.client.close();
  }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
