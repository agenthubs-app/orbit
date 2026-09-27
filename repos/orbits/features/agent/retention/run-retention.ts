import type { TransactionalPostgresClient, TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";
import {
  AGENT_RUN_TARGET_TYPE,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS,
} from "../storage/agent-runtime-live-record-provider";

// Sprint 0111 (AI A4, design decision 1): a run and everything that belongs to
// it (steps, actions, outbox events, execution receipts) is deleted as one set
// once the set has ended at least a year ago. A set that is still open — the
// run or any action or outbox event not terminal — is never deleted. Request
// records (the conversation) are kept; only their link to the deleted run is
// cleared. Children are joined by run id through the envelope target (0103);
// a child row still missing that target blocks its run set and is reported.

export const AGENT_RUN_RETENTION_DAYS = 365;
/** Candidate runs read per page. */
export const AGENT_RUN_RETENTION_BATCH = 50;
/** Most run sets one maintenance pass examines; the rest wait for the next pass. */
export const AGENT_RUN_RETENTION_MAX_PER_PASS = 500;
/** Rows read per page when collecting one run's children. */
const CHILD_PAGE = 500;
const DAY_MS = 86_400_000;

export const AGENT_REQUEST_COLLECTION = "orbit_agent_chat_requests";
export const AGENT_RUN_CHILD_COLLECTION_NAMES = [
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runSteps,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox,
  AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts,
] as const;

const TERMINAL_RUN = new Set(["completed", "failed", "canceled"]);
const TERMINAL_ACTION = new Set(["completed", "partially_failed", "failed", "rejected", "canceled", "undone"]);
const TERMINAL_OUTBOX = new Set(["completed", "dead_letter", "canceled"]);
const TERMINAL_RECEIPT = new Set(["completed", "failed", "undone"]);
const END_FIELDS = ["createdAt", "updatedAt", "completedAt", "failedAt", "rejectedAt", "canceledAt", "undoneAt", "processedAt"] as const;

type Member = Record<string, unknown>;

export interface AgentRunSetForRetention {
  run: Member;
  steps: readonly Member[];
  actions: readonly Member[];
  outbox: readonly Member[];
  receipts: readonly Member[];
}

export function agentRunRetentionCutoff(now: Date): Date {
  return new Date(now.getTime() - AGENT_RUN_RETENTION_DAYS * DAY_MS);
}

function latest(member: Member): number | null {
  let max: number | null = null;
  for (const field of END_FIELDS) {
    const value = member[field];
    if (typeof value !== "string") continue;
    const at = Date.parse(value);
    if (Number.isFinite(at) && (max === null || at > max)) max = at;
  }
  return max;
}

/**
 * When the run set ended, as an ISO timestamp, or null while it is still open
 * (or cannot be dated). Open means the run, an action or an outbox event is
 * not in a terminal status; unknown statuses count as open. The end is the
 * latest timestamp on any member, including updatedAt, so a late undo, retry
 * or receipt pushes the end forward rather than letting the set expire early.
 */
export function agentRunSetEndedAt(set: AgentRunSetForRetention): string | null {
  if (!TERMINAL_RUN.has(String(set.run.status))) return null;
  if (set.actions.some((action) => !TERMINAL_ACTION.has(String(action.status)))) return null;
  if (set.outbox.some((event) => !TERMINAL_OUTBOX.has(String(event.status)))) return null;
  if (set.receipts.some((receipt) => !TERMINAL_RECEIPT.has(String(receipt.status)))) return null;
  const runEnd = latest(set.run);
  if (runEnd === null) return null;
  let end = runEnd;
  for (const member of [...set.steps, ...set.actions, ...set.outbox, ...set.receipts]) {
    const at = latest(member);
    if (at !== null && at > end) end = at;
  }
  return new Date(end).toISOString();
}

export type RunSetDecision =
  | { outcome: "deleted"; rows: Record<string, number>; requestLinksCleared: number }
  | { outcome: "open" | "recent" | "unlinked" | "gone"; unlinkedRows?: number };

function entityOf(payload: unknown): Member {
  const parsed = typeof payload === "string" ? (JSON.parse(payload) as unknown) : payload;
  const entity = (parsed as { entity?: unknown } | null)?.entity;
  return entity && typeof entity === "object" && !Array.isArray(entity) ? (entity as Member) : {};
}

/** The actor id of an agent subspace `<workspace>:agent-actor:<actor>`, or null. */
export function actorOfAgentSubspace(baseWorkspaceId: string, subspace: string): string | null {
  const prefix = `${baseWorkspaceId}:agent-actor:`;
  return subspace.startsWith(prefix) && subspace.length > prefix.length ? subspace.slice(prefix.length) : null;
}

/** Child rows of one run that still lack the 0103 run target (payload names the run, envelope does not). */
export async function countUnlinkedRunChildren(tx: TransactionalSqlExecutor, subspace: string, runId: string): Promise<number> {
  const result = await tx.query<{ n: string }>(
    `select count(*)::text as n from orbit_records
      where workspace_id = $1 and target_id is null and collection_name = any($2::text[])
        and payload->'entity'->>'runId' = $3`,
    [subspace, AGENT_RUN_CHILD_COLLECTION_NAMES, runId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function runChildren(tx: TransactionalSqlExecutor, subspace: string, runId: string) {
  const byCollection: Record<string, Member[]> = Object.fromEntries(AGENT_RUN_CHILD_COLLECTION_NAMES.map((name) => [name, []]));
  let after = "";
  for (;;) {
    const page = await tx.query<{ collection_name: string; record_id: string; payload: unknown }>(
      `select collection_name, record_id, payload from orbit_records
        where workspace_id = $1 and target_type = $2 and target_id = $3 and collection_name = any($4::text[])
          and (collection_name || '/' || record_id) collate "C" > $5 collate "C"
        order by (collection_name || '/' || record_id) collate "C"
        limit ${CHILD_PAGE}`,
      [subspace, AGENT_RUN_TARGET_TYPE, runId, AGENT_RUN_CHILD_COLLECTION_NAMES, after],
    );
    for (const row of page.rows) byCollection[row.collection_name]?.push(entityOf(row.payload));
    if (page.rows.length < CHILD_PAGE) break;
    const last = page.rows.at(-1)!;
    after = `${last.collection_name}/${last.record_id}`;
  }
  return byCollection;
}

/**
 * Deletes one run set when it ended before the cutoff, inside the given
 * transaction: the run row is locked first, the children are re-read and the
 * end is recomputed under that lock, then the run and every child row with
 * its target are deleted and the request records' link to it is cleared.
 */
export async function deleteExpiredRunSet(
  tx: TransactionalSqlExecutor,
  input: { baseWorkspaceId: string; subspace: string; runId: string; cutoff: Date },
): Promise<RunSetDecision> {
  const run = await tx.query<{ payload: unknown }>(
    "select payload from orbit_records where workspace_id = $1 and collection_name = $2 and record_id = $3 for update",
    [input.subspace, AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runs, input.runId],
  );
  if (!run.rows[0]) return { outcome: "gone" };
  const unlinkedRows = await countUnlinkedRunChildren(tx, input.subspace, input.runId);
  if (unlinkedRows > 0) return { outcome: "unlinked", unlinkedRows };
  const children = await runChildren(tx, input.subspace, input.runId);
  const endedAt = agentRunSetEndedAt({
    run: entityOf(run.rows[0].payload),
    steps: children[AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runSteps]!,
    actions: children[AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions]!,
    outbox: children[AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox]!,
    receipts: children[AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts]!,
  });
  if (endedAt === null) return { outcome: "open" };
  if (Date.parse(endedAt) >= input.cutoff.getTime()) return { outcome: "recent" };
  const deleted = await tx.query<{ collection_name: string; n: string }>(
    `with gone as (
       delete from orbit_records
        where workspace_id = $1
          and ((collection_name = $2 and record_id = $3)
            or (target_type = $4 and target_id = $3 and collection_name = any($5::text[])))
        returning collection_name)
     select collection_name, count(*)::text as n from gone group by collection_name`,
    [input.subspace, AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runs, input.runId, AGENT_RUN_TARGET_TYPE, AGENT_RUN_CHILD_COLLECTION_NAMES],
  );
  const requestLinksCleared = await clearRequestLinks(tx, input.baseWorkspaceId, input.subspace, [input.runId]);
  return {
    outcome: "deleted",
    rows: Object.fromEntries(deleted.rows.map((row) => [row.collection_name, Number(row.n)])),
    requestLinksCleared,
  };
}

/**
 * Request records stay (they are the conversation); only the envelope link to
 * deleted runs is cleared so nothing points at a missing run. The record's
 * payload is left as it was.
 */
export async function clearRequestLinks(
  tx: TransactionalSqlExecutor,
  baseWorkspaceId: string,
  subspace: string,
  runIds: readonly string[],
): Promise<number> {
  const actorId = actorOfAgentSubspace(baseWorkspaceId, subspace);
  if (!actorId || runIds.length === 0) return 0;
  const result = await tx.query<{ n: string }>(
    `with cleared as (
       update orbit_records set target_type = null, target_id = null
        where workspace_id = $1 and collection_name = $2 and user_id = $3
          and target_type = $4 and target_id = any($5::text[])
        returning 1)
     select count(*)::text as n from cleared`,
    [baseWorkspaceId, AGENT_REQUEST_COLLECTION, actorId, AGENT_RUN_TARGET_TYPE, runIds],
  );
  return Number(result.rows[0]?.n ?? 0);
}

export interface AgentRunRetentionResult {
  examined: number;
  runSetsDeleted: number;
  rowsDeleted: number;
  stepsDeleted: number;
  actionsDeleted: number;
  outboxDeleted: number;
  receiptsDeleted: number;
  requestLinksCleared: number;
  keptOpen: number;
  keptRecent: number;
  /** Run sets skipped because child rows still lack the 0103 run target; run db:migrate:agent-run-targets. */
  blockedUnlinked: number;
  unlinkedRows: number;
  /** More candidates remained when the pass stopped (per-pass cap or deadline). */
  truncated: number;
  failed: number;
}

/**
 * One bounded retention sweep over every agent subspace of the workspace.
 * Candidates are terminal runs whose own timestamps are all before the cutoff
 * (a set cannot end before its run), read in keyset pages; each set is then
 * decided and deleted in its own transaction, so an interrupted sweep leaves
 * whole sets either deleted or untouched and the next sweep resumes.
 */
export async function runAgentRunRetention(input: {
  client: TransactionalPostgresClient;
  workspaceId: string;
  now: Date;
  deadline?: number;
  clock?: () => Date;
  batchSize?: number;
  maxRunSets?: number;
  log?: (line: string) => void;
}): Promise<AgentRunRetentionResult> {
  const batchSize = input.batchSize ?? AGENT_RUN_RETENTION_BATCH;
  const maxRunSets = input.maxRunSets ?? AGENT_RUN_RETENTION_MAX_PER_PASS;
  const clock = input.clock ?? (() => new Date());
  const deadline = input.deadline ?? Number.POSITIVE_INFINITY;
  const log = input.log ?? ((line: string) => console.info(line));
  const cutoff = agentRunRetentionCutoff(input.now);
  const prefix = `${input.workspaceId}:agent-actor:`;
  const result: AgentRunRetentionResult = {
    examined: 0, runSetsDeleted: 0, rowsDeleted: 0, stepsDeleted: 0, actionsDeleted: 0, outboxDeleted: 0,
    receiptsDeleted: 0, requestLinksCleared: 0, keptOpen: 0, keptRecent: 0, blockedUnlinked: 0, unlinkedRows: 0,
    truncated: 0, failed: 0,
  };
  let after: { workspace: string; runId: string } = { workspace: "", runId: "" };
  outer: for (;;) {
    const page = await input.client.query<{ workspace_id: string; record_id: string }>(
      `select workspace_id, record_id from orbit_records
        where left(workspace_id, char_length($1)) = $1 and char_length(workspace_id) > char_length($1)
          and collection_name = $2
          and payload->'entity'->>'status' in ('completed', 'failed', 'canceled')
          and greatest(payload->'entity'->>'createdAt' collate "C", payload->'entity'->>'updatedAt' collate "C",
                       payload->'entity'->>'completedAt' collate "C", payload->'entity'->>'failedAt' collate "C",
                       payload->'entity'->>'canceledAt' collate "C") < $3 collate "C"
          and (workspace_id collate "C", record_id collate "C") > ($4 collate "C", $5 collate "C")
        order by workspace_id collate "C", record_id collate "C"
        limit $6`,
      [prefix, AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runs, cutoff.toISOString(), after.workspace, after.runId, batchSize],
    );
    for (const row of page.rows) {
      if (result.examined >= maxRunSets || clock().getTime() >= deadline) {
        result.truncated = 1;
        break outer;
      }
      result.examined += 1;
      after = { workspace: row.workspace_id, runId: row.record_id };
      try {
        const decision = await input.client.transaction((tx) => deleteExpiredRunSet(tx, {
          baseWorkspaceId: input.workspaceId, subspace: row.workspace_id, runId: row.record_id, cutoff,
        }));
        if (decision.outcome === "deleted") {
          result.runSetsDeleted += 1;
          result.requestLinksCleared += decision.requestLinksCleared;
          for (const [collection, n] of Object.entries(decision.rows)) {
            result.rowsDeleted += n;
            if (collection === AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.runSteps) result.stepsDeleted += n;
            if (collection === AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.actions) result.actionsDeleted += n;
            if (collection === AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.outbox) result.outboxDeleted += n;
            if (collection === AGENT_RUNTIME_LIVE_RECORD_COLLECTIONS.receipts) result.receiptsDeleted += n;
          }
        } else if (decision.outcome === "open") result.keptOpen += 1;
        else if (decision.outcome === "recent") result.keptRecent += 1;
        else if (decision.outcome === "unlinked") {
          result.blockedUnlinked += 1;
          result.unlinkedRows += decision.unlinkedRows ?? 0;
        }
      } catch {
        result.failed += 1;
      }
    }
    if (page.rows.length < batchSize) break;
  }
  if (result.blockedUnlinked > 0) {
    // Fail visibly: these sets are neither deleted nor silently kept.
    log(JSON.stringify({ event: "agent_run_retention_unlinked_children", runSets: result.blockedUnlinked, rows: result.unlinkedRows,
      remedy: "npm run db:migrate:agent-run-targets" }));
  }
  log(JSON.stringify({ event: "agent_run_retention", cutoff: cutoff.toISOString(), ...result }));
  return result;
}
