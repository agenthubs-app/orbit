import { loadEnvConfig } from "@next/env";

import { createConfiguredMaintenanceTasks } from "../features/operations/maintenance/configured-tasks";
import { resolveMaintenanceIntervalSeconds } from "../features/operations/maintenance/heartbeat";
import { runMaintenancePass } from "../features/operations/maintenance/pass";

// In-process scheduler for hosts without Vercel Cron or Queues (local
// development, a VM, a container). `--once` runs a single pass and exits with
// a non-zero code when any task failed, which suits external cron as well.

loadEnvConfig(process.cwd());

const once = process.argv.includes("--once");
const intervalMs = resolveMaintenanceIntervalSeconds() * 1_000;
const workerId = process.env.ORBIT_MAINTENANCE_WORKER_ID?.trim() || `maintenance-scheduler:${process.pid}`;

let stopping = false;
let wake: (() => void) | null = null;
const stop = () => { stopping = true; wake?.(); };
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

async function main(): Promise<void> {
  while (true) {
    const pass = await runMaintenancePass({ tasks: createConfiguredMaintenanceTasks({ workerId }), log: (line) => process.stdout.write(`${line}\n`) });
    if (once) {
      process.exitCode = pass.failed > 0 ? 1 : 0;
      return;
    }
    if (stopping) return;
    await new Promise<void>((resolve) => {
      wake = resolve;
      setTimeout(resolve, intervalMs);
    });
    wake = null;
    if (stopping) return;
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exitCode = 1;
});
