import { createHash } from "node:crypto";

import {
  CONDITIONAL_READ_HEADERS,
  conditionalJsonRead,
  type ConditionalReadDependencies,
  type ConditionalReadScope,
} from "../_shared/conditional-read";
import { READ_AUTHORIZATION_COLLECTIONS } from "../../../shared/storage/domain-watermark";

// Task list rows live in orbit_records, while a displayed planLink depends on
// the one active v2 plan and its type-item IDs. Keep all three inputs in one
// actor-scoped SQL row so an unchanged conditional GET remains a single read.
const TASK_LIST_WATERMARK_SQL = `
  /* task-list:plan-aware-watermark */
  with task_watermark as (
    select max(updated_at)::text as task_updated_at, count(*)::text as task_count
    from orbit_records
    where workspace_id = $1 and lifecycle_state <> 'deleted'
      and ((collection_name = 'tasks' and user_id = $2)
        or collection_name = any($3::text[]))
  ), active_plan as (
    select id from plans
    where workspace_id = $1 and actor_id = $2 and model_version = 2
      and status = 'active' and achieved_at is null
    limit 1
  ), type_watermark as (
    select md5(coalesce(string_agg(item.id, E'\\x1f' order by item.id), '')) as type_digest
    from plan_items item join active_plan plan on plan.id = item.plan_id
    where item.workspace_id = $1 and item.actor_id = $2 and item.kind = 'network_need'
  )
  select task_watermark.task_updated_at, task_watermark.task_count,
    (select id from active_plan) as active_plan_id, type_watermark.type_digest
  from task_watermark cross join type_watermark
`;

type WatermarkRow = {
  task_updated_at: string | null;
  task_count: string;
  active_plan_id: string | null;
  type_digest: string;
};

function version(dependencies: ConditionalReadDependencies): string {
  return dependencies.version ?? (process.env.ORBIT_READ_ETAG_VERSION?.trim()
    || process.env.VERCEL_GIT_COMMIT_SHA?.trim() || "dev");
}

export async function conditionalTaskListRead(
  scope: ConditionalReadScope,
  dependencies: ConditionalReadDependencies,
  produce: () => Promise<Response>,
): Promise<Response> {
  // Reuse the ordinary helper's fail-closed read envelope, without asking it
  // to run its task-only watermark after the plan-aware query.
  const read = () => conditionalJsonRead(scope, { client: null }, produce);
  const workspaceId = scope.workspaceId ?? dependencies.workspaceId;
  if (!workspaceId || !dependencies.client) return read();
  let etag: string;
  try {
    const { rows } = await dependencies.client.query<WatermarkRow>(TASK_LIST_WATERMARK_SQL,
      [workspaceId, scope.actorId, READ_AUTHORIZATION_COLLECTIONS]);
    const row = rows[0];
    if (!row) return read();
    const url = new URL(scope.request.url);
    const digest = createHash("sha256").update(JSON.stringify([
      scope.routeKey, url.pathname, url.search, scope.actorId, workspaceId,
      row.task_updated_at, row.task_count, row.active_plan_id, row.type_digest, version(dependencies),
    ])).digest("hex");
    etag = `W/"${digest}"`;
  } catch {
    // A watermark failure must not suppress the actual actor-scoped read.
    return read();
  }
  const requested = scope.request.headers.get("If-None-Match");
  if (requested?.split(",").some((candidate) => candidate.trim() === etag || candidate.trim() === "*")) {
    return new Response(null, { status: 304, headers: { ETag: etag, ...CONDITIONAL_READ_HEADERS } });
  }
  const response = await read();
  if (response.status !== 200) return response;
  const headers = new Headers(response.headers);
  headers.set("ETag", etag);
  for (const [key, value] of Object.entries(CONDITIONAL_READ_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
