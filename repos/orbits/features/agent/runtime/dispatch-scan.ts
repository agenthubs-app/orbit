import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import { AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS } from "../storage/agent-runtime-live-record-provider";
import { enqueueAgentAction } from "./action-queue";
import { isAgentActionWake } from "./action-queue-worker";
import type { AgentActionWake } from "./background-dispatch";

export interface AgentDispatchScanResult {
  examined: number;
  published: number;
  failed: number;
  truncated: boolean;
}

export async function redispatchPendingAgentActions(input: {
  client: LiveRecordSqlClient;
  workspaceId: string;
  publish?: (message: AgentActionWake) => Promise<void>;
  now?: Date;
  limit?: number;
}): Promise<AgentDispatchScanResult> {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 100;
  if (!input.workspaceId.trim() || !Number.isFinite(now.getTime()) ||
      !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("Agent dispatch scan configuration invalid.");
  }
  const prefix = `${input.workspaceId}:agent-actor:`;
  const publish = input.publish ?? enqueueAgentAction;
  let rows: readonly { actor_id: string; action_id: string; run_id: string }[];
  try {
    rows = (await input.client.query<{ actor_id: string; action_id: string; run_id: string }>(`
      select substring(outbox.workspace_id from char_length($1) + 1) as actor_id,
        outbox.payload->'entity'->>'actionId' as action_id,
        outbox.payload->'entity'->>'runId' as run_id
      from orbit_records outbox
      join orbit_records action on action.workspace_id = outbox.workspace_id
        and action.collection_name = $3
        and action.record_id = outbox.payload->'entity'->>'actionId'
        and action.payload->'entity'->>'actionId' = action.record_id
        and action.payload->'entity'->>'runId' = outbox.payload->'entity'->>'runId'
        and action.payload->'entity'->>'status' in ('approved', 'executing')
        and action.lifecycle_state <> 'deleted'
      join orbit_records run on run.workspace_id = outbox.workspace_id
        and run.collection_name = $4
        and run.record_id = outbox.payload->'entity'->>'runId'
        and run.lifecycle_state <> 'deleted'
      where left(outbox.workspace_id, char_length($1)) = $1
        and char_length(outbox.workspace_id) > char_length($1)
        and outbox.collection_name = $2 and outbox.lifecycle_state <> 'deleted'
        and (outbox.payload->'entity'->>'availableAt')::timestamptz <= $5::timestamptz
        and (
          (outbox.payload->'entity'->>'status' in ('pending', 'retry_scheduled')
            and outbox.updated_at <= $6::timestamptz)
          or (outbox.payload->'entity'->>'status' = 'processing'
            and (outbox.payload->'entity'->>'leasedAt')::timestamptz <= $7::timestamptz)
        )
      group by outbox.workspace_id, outbox.payload->'entity'->>'actionId', outbox.payload->'entity'->>'runId'
      order by min(outbox.updated_at), outbox.workspace_id, action_id, run_id
      limit $8`, [prefix, AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
      AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions, AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runs,
      now.toISOString(), new Date(now.getTime() - 120_000).toISOString(),
      new Date(now.getTime() - 15 * 60_000).toISOString(), limit + 1])).rows;
  } catch {
    throw new Error("Agent dispatch scan unavailable.");
  }
  const result: AgentDispatchScanResult = { examined: Math.min(rows.length, limit), published: 0, failed: 0, truncated: rows.length > limit };
  for (const row of rows.slice(0, limit)) {
    const message = { version: 1, actorId: row.actor_id, actionId: row.action_id, runId: row.run_id };
    if (!isAgentActionWake(message)) { result.failed += 1; continue; }
    try { await publish(message); result.published += 1; }
    catch { result.failed += 1; }
  }
  // Scans never change action/outbox status. A publish failure remains eligible
  // for the next scan; duplicates are fenced by the existing execution lease.
  return result;
}
