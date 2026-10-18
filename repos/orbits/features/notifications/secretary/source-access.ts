import type { InboxNotificationSource } from '../../../shared/contract/inbox-notifications';
import type { TransactionalSqlExecutor } from '../../../shared/storage/transactional-postgres';

type Query = Pick<TransactionalSqlExecutor, 'query'>;

/** Recheck the actor and live event state on every inbox/preview read. A missing table fails closed at the caller. */
export async function readEventSecretarySourceState(client: Query, workspaceId: string, actorId: string, source: InboxNotificationSource, nowIso: string): Promise<'available' | 'unavailable'> {
  if (source.sourceKind !== 'event_deadline' && source.sourceKind !== 'event_prep' && source.sourceKind !== 'event_pick') return 'unavailable';
  let eventId = source.sourceId;
  const daily = source.sourceKind === 'event_pick' && /^daily:\d{4}-\d{2}-\d{2}$/.test(source.sourceRevision);
  if (source.sourceKind === 'event_pick' && !daily) {
    const assessment = await client.query<{ event_id: string | null; status: string; user_decision: string | null }>(
      `/* secretary:assessment */ select event_id,status,user_decision from event_assessments
       where workspace_id=$1 and actor_id=$2 and id=$3 and source_kind='orbit_event' limit 1`,
      [workspaceId, actorId, source.sourceId],
    );
    const row = assessment.rows[0];
    if (!row?.event_id || row.status !== 'ready' || row.user_decision === 'dismissed') return 'unavailable';
    eventId = row.event_id;
  }
  const event = await client.query<{ lifecycle_state_v2: string | null; starts_at: Date | string | null }>(
    `/* secretary:event */ select lifecycle_state_v2,starts_at from event_ops_events where workspace_id=$1 and $2::text <> '' and event_id=$3 limit 1`,
    [workspaceId, actorId, eventId],
  );
  const current = event.rows[0];
  if (!current || current.lifecycle_state_v2 !== 'published' || !current.starts_at || Date.parse(String(current.starts_at)) <= Date.parse(nowIso)) return 'unavailable';

  if (source.sourceKind === 'event_pick') {
    const feedback = await client.query<{ dismissed: boolean }>(
      `/* secretary:feedback */ select exists(select 1 from orbit_records where workspace_id=$1 and user_id=$2
       and collection_name='eventRecommendationFeedback' and lifecycle_state='active' and payload->>'eventId'=$3) as dismissed`,
      [workspaceId, actorId, eventId],
    );
    if (feedback.rows[0]?.dismissed) return 'unavailable';
    if (!daily) return 'available';
    const membership = await client.query<{ status: string }>(
      `/* secretary:prep */ select status from event_ops_membership_heads
       where workspace_id=$1 and actor_id=$2 and event_id=$3 limit 1`,
      [workspaceId, actorId, eventId],
    );
    if (membership.rows[0]?.status === 'rsvped') return 'unavailable';
    const plan = await client.query<{ active: boolean }>(
      `/* secretary:plan */ select exists(select 1 from plans where workspace_id=$1 and actor_id=$2 and status='active') as active`,
      [workspaceId, actorId],
    );
    return plan.rows[0]?.active ? 'available' : 'unavailable';
  }
  if (source.sourceKind === 'event_prep') {
    const membership = await client.query<{ status: string }>(
      `/* secretary:prep */ select status from event_ops_membership_heads
       where workspace_id=$1 and actor_id=$2 and event_id=$3 limit 1`,
      [workspaceId, actorId, eventId],
    );
    return membership.rows[0]?.status === 'rsvped' ? 'available' : 'unavailable';
  }
  const deadline = await client.query<{ planned: boolean; registered: boolean; closes_at: Date | string | null }>(
    `/* secretary:deadline */ select
       exists(select 1 from plan_items i join plans p on p.workspace_id=i.workspace_id and p.id=i.plan_id and p.actor_id=i.actor_id
              where i.workspace_id=$1 and i.actor_id=$2 and i.kind='event' and i.status='recommended' and i.linked_event_id=$3 and p.status='active') as planned,
       exists(select 1 from event_ops_membership_heads m where m.workspace_id=$1 and m.actor_id=$2 and m.event_id=$3 and m.status='rsvped') as registered,
       (select policy.registration_closes_at from event_ops_admission_policy_heads head
         join event_ops_admission_policy_versions policy on policy.workspace_id=head.workspace_id and policy.event_id=head.event_id and policy.policy_version=head.policy_version
         where head.workspace_id=$1 and head.event_id=$3 limit 1) as closes_at`,
    [workspaceId, actorId, eventId],
  );
  const row = deadline.rows[0];
  return row?.planned && !row.registered && row.closes_at && Date.parse(String(row.closes_at)) > Date.parse(nowIso) ? 'available' : 'unavailable';
}
