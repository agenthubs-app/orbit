/**
 * agent-design AG15 (设计稿 §5.3, §10 站内收件箱): whether the reader may still see what an agent-written inbox entry
 * points at. A scheduled task's result is its run record; a card waiting for a click (made by a scheduled task, or
 * proposed by a connected external agent — AG17) is the card in the reader's own ledger. Both live in the reader's own
 * partition, so another account's id never resolves.
 */
import type { InboxNotificationSource } from "../../shared/contract/inbox-notifications";
import type { TransactionalSqlExecutor } from "../../shared/storage/transactional-postgres";

/** Sources Orbit's own agent writes. They are never turned into push candidates by the inbox pipeline (AG16 sends per task). */
export const AGENT_INBOX_SOURCE_KINDS = ["automation_result", "agent_card", "external_proposal"] as const satisfies readonly InboxNotificationSource["sourceKind"][];

export function isAgentInboxSourceKind(kind: string): boolean {
  return (AGENT_INBOX_SOURCE_KINDS as readonly string[]).includes(kind);
}

const COLLECTION_OF: Partial<Record<InboxNotificationSource["sourceKind"], string>> = {
  agent_card: "agentActionsV2",
  automation_result: "agentAutomationRuns",
  external_proposal: "agentActionsV2",
};

export async function readAgentInboxSourceState(
  client: TransactionalSqlExecutor,
  workspaceId: string,
  actorId: string,
  source: Pick<InboxNotificationSource, "sourceKind" | "sourceId">,
): Promise<"available" | "unavailable"> {
  const collection = COLLECTION_OF[source.sourceKind];
  if (!collection || !actorId.trim()) return "unavailable";
  const found = await client.query<{ present: number }>(
    "select 1 as present from orbit_records where workspace_id = $1 and collection_name = $2 and record_id = $3 and lifecycle_state = 'active' limit 1",
    [`${workspaceId}:agent-actor:${actorId}`, collection, source.sourceId],
  );
  return found.rows.length > 0 ? "available" : "unavailable";
}
