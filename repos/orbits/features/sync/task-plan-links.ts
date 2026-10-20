import { createHash } from "node:crypto";

import type { AuthorizationEpochSqlClient } from "./authorization-epoch";

export interface TaskPlanLinks {
  fingerprint: string;
  has(planId: string, typeItemId: string): boolean;
}

const ACTIVE_TYPE_LINKS_SQL = `
  /* sync:task-plan-links */
  select plan.id as plan_id, item.id as type_item_id
  from plans plan join plan_items item
    on item.workspace_id = plan.workspace_id and item.actor_id = plan.actor_id and item.plan_id = plan.id
  where plan.workspace_id = $1 and plan.actor_id = $2 and plan.model_version = 2
    and plan.status = 'active' and plan.achieved_at is null and item.kind = 'network_need'
  order by plan.id, item.id
`;

/** A single actor-scoped snapshot drives both task cursor generation and page visibility. */
export async function readTaskPlanLinks(
  client: AuthorizationEpochSqlClient,
  input: { actorId: string; workspaceId: string },
): Promise<TaskPlanLinks> {
  const { rows } = await client.query<{ plan_id: string; type_item_id: string }>(
    ACTIVE_TYPE_LINKS_SQL, [input.workspaceId, input.actorId],
  );
  const pairs = rows.map((row) => [row.plan_id, row.type_item_id] as const);
  const keys = new Set(pairs.map((pair) => JSON.stringify(pair)));
  return {
    fingerprint: createHash("sha256").update(JSON.stringify(pairs)).digest("hex").slice(0, 16),
    has: (planId, typeItemId) => keys.has(JSON.stringify([planId, typeItemId])),
  };
}
