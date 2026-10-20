import type { AccountExportScope } from "../../../shared/contract/account";
import type { TransactionalSqlExecutor } from "../../../shared/storage/transactional-postgres";

const MAX_ROWS_PER_DOMAIN = 10_000;

const RECORD_QUERIES: Record<Exclude<AccountExportScope, "plans">, string> = {
  contacts: `select jsonb_build_object('id',record_id,'displayName',payload->>'displayName',
    'email',payload->>'email','phone',payload->>'phone','organization',payload->>'organization',
    'createdAt',coalesce(payload->>'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
    'updatedAt',coalesce(payload->>'updatedAt',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))) as item
    from orbit_records where workspace_id=$1 and collection_name='contacts' and user_id=$2
    and lifecycle_state<>'deleted' and (payload->'accountId' is null or payload->'accountId'=to_jsonb($2::text))
    order by record_id limit 10001`,
  notes: `select jsonb_build_object('id',record_id,'title',payload->'note'->>'title',
    'body',payload->'note'->>'body','createdAt',payload->'note'->>'createdAt','updatedAt',payload->'note'->>'updatedAt') as item
    from orbit_records where workspace_id=$1 and collection_name='notes' and user_id=$2
    and lifecycle_state<>'deleted' and payload->'note'->>'ownerUserId'=$2 and payload->'note'->>'accountId'=$2
    order by record_id limit 10001`,
  tasks: `select jsonb_build_object('id',record_id,'title',payload->'task'->>'title',
    'description',payload->'task'->>'notes','status',payload->'task'->>'status','dueAt',payload->'task'->>'dueAt',
    'createdAt',payload->'task'->>'createdAt','updatedAt',payload->'task'->>'updatedAt') as item
    from orbit_records where workspace_id=$1 and collection_name='tasks' and user_id=$2
    and lifecycle_state<>'deleted' and payload->'task'->>'ownerUserId'=$2 and payload->'task'->>'accountId'=$2
    order by record_id limit 10001`,
  events: `select jsonb_build_object('id',record_id,'title',payload->>'title','kind',collection_name,
    'startsAt',coalesce(payload->>'startsAt',payload->>'startAt'),'status',coalesce(payload->>'status',payload->>'state'),
    'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as item
    from orbit_records where workspace_id=$1 and lifecycle_state<>'deleted' and
    ((collection_name='events' and (user_id=$2 or payload->'accountId'=to_jsonb($2::text))) or
     (collection_name in ('attendees','eventParticipantIntents') and user_id=$2) or
     (collection_name='event_registrations' and (user_id=$2 or payload->'registration'->>'userId'=$2)))
    order by collection_name,record_id limit 10001`,
};

const CANONICAL_EVENTS_QUERY = `select item from (
  select 0 as rank,e.event_id as id,jsonb_build_object('id','host:'||e.event_id,'title',e.title,'kind','host',
    'startsAt',e.starts_at,'status',coalesce(e.lifecycle_state_v2,e.lifecycle_state),
    'createdAt',e.created_at,'updatedAt',e.updated_at) as item
    from event_ops_events e where e.workspace_id=$1 and e.organizer_actor_id=$2
  union all
  select 1 as rank,e.event_id as id,jsonb_build_object('id','attendee:'||e.event_id,'title',e.title,'kind','attendee',
    'startsAt',e.starts_at,'status',h.status,'createdAt',e.created_at,'updatedAt',e.updated_at) as item
    from event_ops_membership_heads h join event_ops_events e on e.workspace_id=h.workspace_id and e.event_id=h.event_id
    where h.workspace_id=$1 and h.actor_id=$2 and e.organizer_actor_id<>$2
) history order by rank,id limit 10001`;

const PLANS_QUERY = `select item from (
  select 0 as rank,id,jsonb_build_object('id',id,'kind','plan','title',goal_snapshot,'status',status,
    'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as item
    from plans where workspace_id=$1 and actor_id=$2
  union all
  select 1 as rank,id,jsonb_build_object('id',id,'kind','step','title',title,'description',detail,'status',status,
    'planId',plan_id,'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'updatedAt',to_char(updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as item
    from plan_items where workspace_id=$1 and actor_id=$2
  union all
  select 2 as rank,id,jsonb_build_object('id',id,'kind','log','title',event,'body',body,'planId',plan_id,
    'createdAt',to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) as item
    from plan_log where workspace_id=$1 and actor_id=$2
) domain order by rank,id limit 10001`;

export function createAccountExportDomainReader({ db, workspaceId, actorId }: {
  db: TransactionalSqlExecutor;
  workspaceId: string;
  actorId: string;
}) {
  if (!workspaceId.trim() || !actorId.trim()) throw new Error("Export actor required");
  return async (scope: AccountExportScope): Promise<Record<string, unknown>[]> => {
    const query = scope === "plans" ? PLANS_QUERY : RECORD_QUERIES[scope];
    if (!query) throw new Error("Unknown export domain");
    const result = await db.query<{ item: Record<string, unknown> | string }>(query, [workspaceId, actorId]);
    let items = result.rows.map(row => typeof row.item === "string" ? JSON.parse(row.item) as Record<string, unknown> : row.item);
    if (scope === "events") {
      const sources = await db.query<{ events: string | null; memberships: string | null }>(
        `select to_regclass('event_ops_events')::text as events,to_regclass('event_ops_membership_heads')::text as memberships`,
      );
      const available = sources.rows[0];
      if (Boolean(available?.events) !== Boolean(available?.memberships)) throw new Error("EVENT_HISTORY_SOURCE_UNAVAILABLE");
      if (available?.events) {
        const canonical = await db.query<{ item: Record<string, unknown> | string }>(CANONICAL_EVENTS_QUERY, [workspaceId, actorId]);
        items = items.concat(canonical.rows.map(row => typeof row.item === "string" ? JSON.parse(row.item) as Record<string, unknown> : row.item));
      }
    }
    if (items.length > MAX_ROWS_PER_DOMAIN) throw new Error("Export exceeds row limit");
    return items;
  };
}
