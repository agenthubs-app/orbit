// A maintenance pass runs a fixed list of idempotent recovery tasks inside one
// bounded invocation: stale-work redispatch, expired-record reclaim, orphaned
// object cleanup and notification redelivery. Every task is isolated: one
// failure neither aborts the pass nor hides the other results. The pass never
// throws; callers decide what to do with the aggregate.

export type MaintenanceTaskStatus = "ok" | "failed" | "skipped";

export type MaintenanceTaskOutcome =
  | { skipped: string }
  | Record<string, number>;

export interface MaintenanceTaskContext {
  /** Epoch milliseconds after which a task should stop starting new work. */
  deadline: number;
  now: () => Date;
}

export interface MaintenanceTask {
  name: string;
  run(context: MaintenanceTaskContext): Promise<MaintenanceTaskOutcome>;
}

export interface MaintenanceTaskResult {
  name: string;
  status: MaintenanceTaskStatus;
  durationMs: number;
  reason?: string;
  summary?: Record<string, number>;
}

export interface MaintenancePassResult {
  startedAt: string;
  durationMs: number;
  budgetMs: number;
  ok: number;
  failed: number;
  skipped: number;
  tasks: MaintenanceTaskResult[];
}

export const DEFAULT_MAINTENANCE_BUDGET_MS = 240_000;

function isSkip(outcome: MaintenanceTaskOutcome): outcome is { skipped: string } {
  return typeof (outcome as { skipped?: unknown }).skipped === "string";
}

export async function runMaintenancePass({
  tasks,
  budgetMs = DEFAULT_MAINTENANCE_BUDGET_MS,
  now = () => new Date(),
  log = (line) => console.info(line),
}: {
  tasks: readonly MaintenanceTask[];
  budgetMs?: number;
  now?: () => Date;
  log?: (line: string) => void;
}): Promise<MaintenancePassResult> {
  const started = now();
  const deadline = started.getTime() + Math.max(1_000, budgetMs);
  const results: MaintenanceTaskResult[] = [];
  for (const task of tasks) {
    const taskStarted = now().getTime();
    if (taskStarted >= deadline) {
      results.push({ name: task.name, status: "skipped", durationMs: 0, reason: "budget_exhausted" });
      continue;
    }
    try {
      const outcome = await task.run({ deadline, now });
      const durationMs = now().getTime() - taskStarted;
      if (isSkip(outcome)) {
        results.push({ name: task.name, status: "skipped", durationMs, reason: outcome.skipped });
      } else {
        const summary = Object.fromEntries(
          Object.entries(outcome).filter(([, value]) => Number.isFinite(value)),
        );
        const partial = (summary.failed ?? 0) > 0;
        results.push({
          name: task.name,
          status: partial ? "failed" : "ok",
          durationMs,
          summary,
          ...(partial ? { reason: "partial_failure" } : {}),
        });
      }
    } catch (error) {
      // Provider or database detail must not leave the process through the
      // aggregate; the error class name is enough to locate the failing task.
      results.push({
        name: task.name,
        status: "failed",
        durationMs: now().getTime() - taskStarted,
        reason: error instanceof Error && error.name ? error.name : "error",
      });
    }
  }
  const result: MaintenancePassResult = {
    startedAt: started.toISOString(),
    durationMs: now().getTime() - started.getTime(),
    budgetMs,
    ok: results.filter((task) => task.status === "ok").length,
    failed: results.filter((task) => task.status === "failed").length,
    skipped: results.filter((task) => task.status === "skipped").length,
    tasks: results,
  };
  try {
    log(JSON.stringify({ event: "maintenance_pass", ...result }));
  } catch {
    // Logging must never turn a completed pass into a failure.
  }
  return result;
}
