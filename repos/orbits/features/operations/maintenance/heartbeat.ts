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
//
// W0057 (SC-05): the chain follows new deployments. A self-perpetuating queue
// message returns to the deployment that sent it, so without a hand-over the
// chain keeps running old code forever. The row records its owner (deployment
// id and build timestamp). `ensure` from a process built later than the owner
// atomically swaps in a new chain id and sends its first tick; the old chain's
// next tick is then superseded by the existing chain-id check. A tick handled
// by a build older than the recorded owner also exits as superseded, and an
// older build never takes the chain back. Without a build timestamp (local
// runs, old code) behaviour is unchanged. Rolling back to an older build is an
// operator step: delete the workspace row and the next cron / internal request
// / queue consumer recreates the chain on the current deployment.

export const MAINTENANCE_HEARTBEAT_TOPIC = "maintenance-heartbeat";
export const DEFAULT_MAINTENANCE_INTERVAL_SECONDS = 600;
const MIN_INTERVAL_SECONDS = 60;
const MAX_INTERVAL_SECONDS = 3_600;
const SCHEMA_LOCK_KEY = "orbit:maintenance-heartbeat-schema";

/** Who runs this process: Vercel deployment id and the build timestamp baked into the bundle (null locally). */
export interface MaintenanceDeploymentIdentity {
  deploymentId: string | null;
  buildAt: string | null;
}

const NO_IDENTITY: MaintenanceDeploymentIdentity = { deploymentId: null, buildAt: null };

function buildMillis(value: string | Date | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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
-- W0057: chain owner. "create table if not exists" never alters an existing
-- table, so the columns are added separately (idempotent).
alter table orbit_maintenance_heartbeat add column if not exists owner_deployment_id text;
alter table orbit_maintenance_heartbeat add column if not exists owner_build_at timestamptz;
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
  owner_build_at?: Date | string | null;
  seq: string | number;
  dispatched_seq: string | number;
  interval_seconds: number;
  next_due_at: Date | string;
}

const asInt = (value: string | number): number => (typeof value === "number" ? value : Number.parseInt(value, 10));

export interface EnsureMaintenanceHeartbeatResult {
  outcome: "started" | "restarted" | "alive" | "taken_over";
  chainId: string;
}

/**
 * Starts a chain when none exists, restarts one whose next tick is overdue by
 * more than two intervals (lost message, exhausted retries, deleted topic), and
 * otherwise leaves the live chain alone.
 */
export async function ensureMaintenanceHeartbeat({
  pool, workspaceId, send, intervalSeconds = DEFAULT_MAINTENANCE_INTERVAL_SECONDS, now = () => new Date(), id = randomUUID,
  identity = NO_IDENTITY,
}: {
  pool: Pick<Pool, "connect">;
  workspaceId: string;
  send: SendHeartbeat;
  intervalSeconds?: number;
  now?: () => Date;
  id?: () => string;
  identity?: MaintenanceDeploymentIdentity;
}): Promise<EnsureMaintenanceHeartbeatResult> {
  if (!workspaceId.trim()) throw new Error("Invalid maintenance workspace.");
  const client = await pool.connect();
  let outcome: EnsureMaintenanceHeartbeatResult;
  try {
    await client.query("BEGIN");
    const current = now();
    const existing = await client.query<HeartbeatRow>(
      "SELECT chain_id, seq, dispatched_seq, interval_seconds, next_due_at, owner_build_at FROM orbit_maintenance_heartbeat WHERE workspace_id = $1 FOR UPDATE",
      [workspaceId],
    );
    const row = existing.rows[0];
    const staleAfterMs = 2 * (row?.interval_seconds ?? intervalSeconds) * 1_000;
    const overdue = row ? current.getTime() - new Date(row.next_due_at).getTime() > staleAfterMs : false;
    // W0057: a process built later than the chain owner (or than a chain with no owner) takes it over.
    const mine = buildMillis(identity.buildAt);
    const owner = buildMillis(row?.owner_build_at);
    const newerBuild = mine !== null && (owner === null || mine > owner);
    if (row && !overdue && !newerBuild) {
      await client.query("COMMIT");
      return { outcome: "alive", chainId: row.chain_id };
    }
    const chainId = id();
    await client.query(
      `INSERT INTO orbit_maintenance_heartbeat (workspace_id, chain_id, seq, dispatched_seq, interval_seconds, next_due_at, owner_deployment_id, owner_build_at)
       VALUES ($1, $2, 0, 0, $3, $4, $5, $6)
       ON CONFLICT (workspace_id) DO UPDATE SET chain_id = excluded.chain_id, seq = 0, dispatched_seq = 0,
         interval_seconds = excluded.interval_seconds, next_due_at = excluded.next_due_at,
         owner_deployment_id = excluded.owner_deployment_id, owner_build_at = excluded.owner_build_at, updated_at = now()`,
      [workspaceId, chainId, intervalSeconds, new Date(current.getTime() + intervalSeconds * 1_000), identity.deploymentId, mine === null ? null : new Date(mine)],
    );
    await client.query("COMMIT");
    outcome = { outcome: !row ? "started" : overdue ? "restarted" : "taken_over", chainId };
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
  identity = NO_IDENTITY,
}: {
  pool: Pick<Pool, "connect" | "query">;
  workspaceId: string;
  runPass: () => Promise<MaintenancePassResult>;
  send: SendHeartbeat;
  intervalSeconds?: number;
  now?: () => Date;
  identity?: MaintenanceDeploymentIdentity;
}): Promise<ProcessMaintenanceHeartbeatResult> {
  const client = await pool.connect();
  let decision: "run" | "resend" | "superseded";
  let nextSeq = message.seq + 1;
  try {
    await client.query("BEGIN");
    const existing = await client.query<HeartbeatRow>(
      "SELECT chain_id, seq, dispatched_seq, interval_seconds, next_due_at, owner_build_at FROM orbit_maintenance_heartbeat WHERE workspace_id = $1 FOR UPDATE",
      [workspaceId],
    );
    const row = existing.rows[0];
    const mine = buildMillis(identity.buildAt);
    const owner = buildMillis(row?.owner_build_at);
    if (!row || row.chain_id !== message.chainId || (mine !== null && owner !== null && owner > mine)) {
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
    // W0057: record which deployment ran the pass and which tasks it had, for production checks.
    const lastResult = { ...pass, deploymentId: identity.deploymentId, buildAt: identity.buildAt, taskNames: pass.tasks.map((task) => task.name) };
    await pool.query(
      "UPDATE orbit_maintenance_heartbeat SET last_result = $2, updated_at = now() WHERE workspace_id = $1 AND chain_id = $3",
      [workspaceId, JSON.stringify(lastResult), message.chainId],
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
