import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type { MaintenancePassResult } from "./pass";

// Self-perpetuating scheduler on top of the durable queue. A heartbeat chain is
// one row per workspace; every tick advances `seq`, runs a maintenance pass and
// enqueues the next tick with a delay. The row is the single source of truth:
// duplicate deliveries, messages from a superseded chain and lost sends are all
// resolved against it, so at most one live chain exists per workspace and a
// dead chain is restarted by the next `ensureMaintenanceHeartbeat` call (the
// daily cron, a manual internal request, or any queue tick that runs it).

export const MAINTENANCE_HEARTBEAT_TOPIC = "maintenance-heartbeat";
export const DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 600;
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 3_600;
const SCHEMA_LOCK_KEY = "orbit:maintenance-heartbeat-schema";

export interface MaintenanceHeartbeatMessage {
  version: 1;
  kind: "maintenance-heartbeat";
  chainId: string;
  seq: number;
}

export function isMaintenanceHeartbeatMessage(value: unknown): value is MaintenanceHeartbeatMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const message = value as Record<string, unknown>;
  return Object.keys(message).length === 4 && message.version === 1 && message.kind === "maintenance-heartbeat" &&
    typeof message.chainId === "string" && /^[0-9a-f-]{36}$/.test(message.chainId) &&
    typeof message.seq === "number" && Number.isInteger(message.seq) && message.seq >= 0;
}

export function resolveMaintenanceIntervalSeconds(env: Record<string, string | undefined> = process.env): number {
  const parsed = Number.parseInt(env.ORBIT_MAINTENANCE_INTERVAL_SECONDS ?? "", 10);
  if (!Number.isFinite(parsed)) return DEFAULT_MAINTENANCE_INTERVAL_SECONDS;
  return Math.min(MAX_INTERVAL_SECONDS, Math.max(MIN_INTERVAL_SECONDS, parsed));
}

export const MAINTENANCE_HEARTBEAT_SCHEMA_SQL = `
create table if not exists orbit_maintenance_heartbeat (
  workspace_id text primary key,
  chain_id text not null,
  -- seq: the tick expected next; dispatched_seq: highest tick confirmed sent.
  seq bigint not null default 0 check (seq >= 0),
  dispatched_seq bigint not null default 0 check (dispatched_seq >= 0),
  interval_seconds integer not null check (interval_seconds between ${MIN_INTERVAL_SECONDS} and ${MAX_INTERVAL_SECONDS}),
  next_due_at timestamptz not null,
  last_run_at timestamptz,
  last_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
`;

export async function ensureMaintenanceHeartbeatSchema(pool: Pick<Pool, "connect">): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [SCHEMA_LOCK_KEY]);
    await client.query(MAINTENANCE_HEARTBEAT_SCHEMA_SQL);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

type SendHeartbeat = (message: MaintenanceHeartbeatMessage, delaySeconds: number) => Promise<void>;

interface HeartbeatRow {
  chain_id: string;
  seq: string | number;
  dispatched_seq: string | number;
  interval_seconds: number;
  next_due_at: Date | string;
}

const asInt = (value: string | number): number => (typeof value === "number" ? value : Number.parseInt(value, 10));

export interface EnsureMaintenanceHeartbeatResult {
  outcome: "started" | "restarted" | "alive";
  chainId: string;
}

/**
 * Starts a chain when none exists, restarts one whose next tick is overdue by
 * more than two intervals (lost message, exhausted retries, deleted topic), and
 * otherwise leaves the live chain alone.
 */
export async function ensureMaintenanceHeartbeat({
  pool, workspaceId, send, intervalSeconds = DEFAULT_MAINTENANCE_INTERVAL_SECONDS, now = () => new Date(), id = randomUUID,
}: {
  pool: Pick<Pool, "connect">;
  workspaceId: string;
  send: SendHeartbeat;
  intervalSeconds?: number;
  now?: () => Date;
  id?: () => string;
}): Promise<EnsureMaintenanceHeartbeatResult> {
  if (!workspaceId.trim()) throw new Error("Invalid maintenance workspace.");
  const client = await pool.connect();
  let outcome: EnsureMaintenanceHeartbeatResult;
  try {
    await client.query("BEGIN");
    const current = now();
    const existing = await client.query<HeartbeatRow>(
      "SELECT chain_id, seq, dispatched_seq, interval_seconds, next_due_at FROM orbit_maintenance_heartbeat WHERE workspace_id = $1 FOR UPDATE",
      [workspaceId],
    );
    const row = existing.rows[0];
    const staleAfterMs = 2 * (row?.interval_seconds ?? intervalSeconds) * 1_000;
    const overdue = row ? current.getTime() - new Date(row.next_due_at).getTime() > staleAfterMs : false;
    if (row && !overdue) {
      await client.query("COMMIT");
      return { outcome: "alive", chainId: row.chain_id };
    }
    const chainId = id();
    await client.query(
      `INSERT INTO orbit_maintenance_heartbeat (workspace_id, chain_id, seq, dispatched_seq, interval_seconds, next_due_at)
       VALUES ($1, $2, 0, 0, $3, $4)
       ON CONFLICT (workspace_id) DO UPDATE SET chain_id = excluded.chain_id, seq = 0, dispatched_seq = 0,
         interval_seconds = excluded.interval_seconds, next_due_at = excluded.next_due_at, updated_at = now()`,
      [workspaceId, chainId, intervalSeconds, new Date(current.getTime() + intervalSeconds * 1_000)],
    );
    await client.query("COMMIT");
    outcome = { outcome: row ? "restarted" : "started", chainId };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  // A failed send leaves a row whose tick never arrives; it is treated as
  // overdue and restarted by the next ensure call rather than looping here.
  await send({ version: 1, kind: "maintenance-heartbeat", chainId: outcome.chainId, seq: 0 }, intervalSeconds);
  return outcome;
}

export interface ProcessMaintenanceHeartbeatResult {
  outcome: "ran" | "resent" | "superseded";
  pass?: MaintenancePassResult;
}

/**
 * Consumes one queued tick. Exactly-once semantics come from `seq`: the tick
 * whose seq matches the row runs and advances it; a redelivery of the previous
 * seq only re-sends the next tick when that send was never confirmed; anything
 * else belongs to a superseded chain and is dropped without re-enqueueing.
 */
export async function processMaintenanceHeartbeat(message: MaintenanceHeartbeatMessage, {
  pool, workspaceId, runPass, send, intervalSeconds = DEFAULT_MAINTENANCE_INTERVAL_SECONDS, now = () => new Date(),
}: {
  pool: Pick<Pool, "connect" | "query">;
  workspaceId: string;
  runPass: () => Promise<MaintenancePassResult>;
  send: SendHeartbeat;
  intervalSeconds?: number;
  now?: () => Date;
}): Promise<ProcessMaintenanceHeartbeatResult> {
  const client = await pool.connect();
  let decision: "run" | "resend" | "superseded";
  let nextSeq = message.seq + 1;
  try {
    await client.query("BEGIN");
    const existing = await client.query<HeartbeatRow>(
      "SELECT chain_id, seq, dispatched_seq, interval_seconds, next_due_at FROM orbit_maintenance_heartbeat WHERE workspace_id = $1 FOR UPDATE",
      [workspaceId],
    );
    const row = existing.rows[0];
    if (!row || row.chain_id !== message.chainId) {
      decision = "superseded";
    } else if (asInt(row.seq) === message.seq) {
      decision = "run";
      await client.query(
        `UPDATE orbit_maintenance_heartbeat SET seq = $2, interval_seconds = $3, next_due_at = $4, last_run_at = $5, updated_at = now()
         WHERE workspace_id = $1`,
        [workspaceId, nextSeq, intervalSeconds, new Date(now().getTime() + intervalSeconds * 1_000), now()],
      );
    } else if (asInt(row.seq) === message.seq + 1 && asInt(row.dispatched_seq) < asInt(row.seq)) {
      decision = "resend";
      nextSeq = asInt(row.seq);
    } else {
      decision = "superseded";
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  if (decision === "superseded") return { outcome: "superseded" };
  let pass: MaintenancePassResult | undefined;
  if (decision === "run") {
    pass = await runPass();
    await pool.query(
      "UPDATE orbit_maintenance_heartbeat SET last_result = $2, updated_at = now() WHERE workspace_id = $1 AND chain_id = $3",
      [workspaceId, JSON.stringify(pass), message.chainId],
    ).catch(() => undefined);
  }
  // Throwing here hands the message back to the queue; the retry takes the
  // `resend` branch above and does not run the pass a second time.
  await send({ version: 1, kind: "maintenance-heartbeat", chainId: message.chainId, seq: nextSeq }, intervalSeconds);
  await pool.query(
    "UPDATE orbit_maintenance_heartbeat SET dispatched_seq = $2, updated_at = now() WHERE workspace_id = $1 AND chain_id = $3 AND dispatched_seq < $2",
    [workspaceId, nextSeq, message.chainId],
  ).catch(() => undefined);
  return decision === "run" ? { outcome: "ran", pass } : { outcome: "resent" };
}
