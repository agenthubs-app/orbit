import { Pool } from "pg";
import { send } from "@vercel/queue";
import { resolveLiveDatabaseConnectionConfig } from "../../../shared/storage/live-database-config";
import { createConfiguredMaintenanceTasks } from "./configured-tasks";
import {
  MAINTENANCE_HEARTBEAT_TOPIC,
  ensureMaintenanceHeartbeat,
  ensureMaintenanceHeartbeatSchema,
  processMaintenanceHeartbeat,
  resolveMaintenanceIntervalSeconds,
  type EnsureMaintenanceHeartbeatResult,
  type MaintenanceHeartbeatMessage,
  type ProcessMaintenanceHeartbeatResult,
} from "./heartbeat";
import { runMaintenancePass, type MaintenancePassResult } from "./pass";

// Process-level wiring for the scheduled maintenance pass and its queue
// heartbeat. The heartbeat exists only where the durable queue does
// (`VERCEL=1`); elsewhere `scripts/run-maintenance-scheduler.ts` loops in-process.

interface ConfiguredMaintenanceRuntime {
  pool: Pool;
  workspaceId: string;
  ready: Promise<void>;
}

const globalCache = globalThis as unknown as { __orbitMaintenanceRuntime?: ConfiguredMaintenanceRuntime | null };

export function getConfiguredMaintenanceRuntime(): ConfiguredMaintenanceRuntime | null {
  if (globalCache.__orbitMaintenanceRuntime !== undefined) return globalCache.__orbitMaintenanceRuntime;
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) {
    globalCache.__orbitMaintenanceRuntime = null;
    return null;
  }
  const pool = new Pool({ connectionString: config.connectionString, max: 2 });
  globalCache.__orbitMaintenanceRuntime = {
    pool,
    workspaceId: config.workspaceId,
    ready: ensureMaintenanceHeartbeatSchema(pool),
  };
  return globalCache.__orbitMaintenanceRuntime;
}

export function maintenanceHeartbeatEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.VERCEL === "1" && env.ORBIT_MAINTENANCE_HEARTBEAT !== "0";
}

async function sendHeartbeat(message: MaintenanceHeartbeatMessage, delaySeconds: number): Promise<void> {
  await send(MAINTENANCE_HEARTBEAT_TOPIC, message, { delaySeconds, retentionSeconds: 7 * 24 * 60 * 60 });
}

export function runConfiguredMaintenancePass(workerId = "maintenance"): Promise<MaintenancePassResult> {
  return runMaintenancePass({ tasks: createConfiguredMaintenanceTasks({ workerId }) });
}

/** Starts or repairs the queue heartbeat chain; `null` when the heartbeat is not applicable here. */
export async function ensureConfiguredMaintenanceHeartbeat(): Promise<EnsureMaintenanceHeartbeatResult | null> {
  if (!maintenanceHeartbeatEnabled()) return null;
  const runtime = getConfiguredMaintenanceRuntime();
  if (!runtime) return null;
  await runtime.ready;
  return ensureMaintenanceHeartbeat({
    pool: runtime.pool, workspaceId: runtime.workspaceId, send: sendHeartbeat,
    intervalSeconds: resolveMaintenanceIntervalSeconds(),
  });
}

/**
 * Best-effort bootstrap for hosts without cron (Vercel Preview): any queue
 * consumer may call this after its own work so the first background wake of a
 * deployment starts the chain. Failures are logged as aggregates and swallowed
 * so they cannot fail the caller's message.
 */
export async function bootstrapMaintenanceHeartbeat(): Promise<void> {
  try {
    const result = await ensureConfiguredMaintenanceHeartbeat();
    if (result && result.outcome !== "alive") {
      console.info(JSON.stringify({ event: "maintenance_heartbeat_bootstrap", outcome: result.outcome }));
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "maintenance_heartbeat_bootstrap_failed",
      error: error instanceof Error && error.name ? error.name : "error",
    }));
  }
}

export async function processConfiguredMaintenanceHeartbeat(
  message: MaintenanceHeartbeatMessage,
): Promise<ProcessMaintenanceHeartbeatResult> {
  const runtime = getConfiguredMaintenanceRuntime();
  if (!runtime) throw new Error("Maintenance database unavailable.");
  await runtime.ready;
  return processMaintenanceHeartbeat(message, {
    pool: runtime.pool, workspaceId: runtime.workspaceId, send: sendHeartbeat,
    intervalSeconds: resolveMaintenanceIntervalSeconds(),
    runPass: () => runConfiguredMaintenancePass(`maintenance-heartbeat:${message.seq}`),
  });
}
