import { createConfiguredMaintenanceTasks } from "./configured-tasks";
import { runMaintenancePass, type MaintenancePassResult } from "./pass";

// Process-level wiring for the scheduled maintenance pass. On Vercel the hourly cron (vercel.json →
// /api/internal/maintenance) runs it against the current production deployment only; reminders that fall due
// between passes are queued as delayed wakes by the pass itself (scheduleUpcomingCanonicalReminderWakes).
// Elsewhere `scripts/run-maintenance-scheduler.ts` loops in-process.

export const DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 600;
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 3_600;

/** Loop interval for the in-process scheduler (local / VM hosts). */
export function resolveMaintenanceIntervalSeconds(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number.parseInt(env.ORBIT_MAINTENANCE_INTERVAL_SECONDS ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAINTENANCE_INTERVAL_SECONDS;
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, parsed));
}

export function runConfiguredMaintenancePass(workerId = "maintenance"): Promise<MaintenancePassResult> {
  return runMaintenancePass({ tasks: createConfiguredMaintenanceTasks({ workerId }) });
}
