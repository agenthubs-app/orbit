/**
 * R27 SC-R27-13：活动通知的维护任务（每 10 分钟最多一次；规则见 notifications.ts）。Owner: 甲 (R27).
 * - 候选（有界 ≤500）：已报名（membership rsvped / 审核中）且 24 小时内开场的活动；加进计划但没报名、48 小时内截止的活动。
 * - 写入走收件箱 upsert（semanticKey 幂等）；推送配额由投递 worker 检查，不在写收件箱前截断。
 */
import type { MaintenanceTask } from "../../operations/maintenance/pass";
import { runEventNotifications, type EventNotificationCandidate } from "./notifications";

export const EVENT_NOTIFICATION_TASK = "event-journey-notifications";
const THROTTLE_MS = 10 * 60_000;
const throttle = globalThis as typeof globalThis & { __orbitR27NotificationsAt?: number };

type Query = (sql: string, values?: readonly unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
const iso = (value: unknown) => (value instanceof Date ? value.toISOString() : value ? String(value) : null);

export async function readEventNotificationCandidates(query: Query, workspaceId: string, now: Date): Promise<EventNotificationCandidate[]> {
  const result = await query(
    `/* events:r27-notifications:candidates */
     with registered as (
       select m.actor_id, e.event_id, e.title, e.starts_at, null::timestamptz as closes_at, 'registered' as status
         from event_ops_membership_heads m join event_ops_events e on e.workspace_id = m.workspace_id and e.event_id = m.event_id
        where m.workspace_id = $1 and m.status = 'rsvped' and e.lifecycle_state_v2 = 'published' and e.starts_at > $2::timestamptz and e.starts_at <= $2::timestamptz + interval '24 hours'
     ), planned as (
       select i.actor_id, e.event_id, e.title, e.starts_at, policy.registration_closes_at as closes_at, 'planned' as status
         from plan_items i
         join plans p on p.workspace_id = i.workspace_id and p.actor_id = i.actor_id and p.id = i.plan_id and p.status = 'active'
         join event_ops_events e on e.workspace_id = i.workspace_id and e.event_id = i.linked_event_id
         join event_ops_admission_policy_heads head on head.workspace_id = e.workspace_id and head.event_id = e.event_id
         join event_ops_admission_policy_versions policy on policy.workspace_id = head.workspace_id and policy.event_id = head.event_id and policy.policy_version = head.policy_version
        where i.workspace_id = $1 and i.kind = 'event' and i.status = 'recommended' and e.lifecycle_state_v2 = 'published'
          and policy.registration_closes_at > $2::timestamptz and policy.registration_closes_at <= $2::timestamptz + interval '48 hours'
          and not exists (select 1 from event_ops_membership_heads m where m.workspace_id = i.workspace_id and m.actor_id = i.actor_id and m.event_id = e.event_id and m.status = 'rsvped')
     )
     select * from registered union all select * from planned order by starts_at limit 500`,
    [workspaceId, now.toISOString()],
  );
  return result.rows.flatMap((row) => {
    const startsAt = iso(row.starts_at);
    return startsAt ? [{ actorId: String(row.actor_id), eventId: String(row.event_id), registrationClosesAt: iso(row.closes_at), startsAt, status: row.status === "planned" ? "planned" as const : "registered" as const, title: String(row.title ?? "") }] : [];
  });
}

export function createEventNotificationMaintenanceTask(input: { resolve: () => { query: Query; workspaceId: string; write: (actorId: string, item: { semanticKey: string; sourceKind: "event_deadline" | "event_prep"; eventId: string; title: string; body: string; href: string; at: string }) => Promise<boolean> } | null }): MaintenanceTask {
  return {
    name: EVENT_NOTIFICATION_TASK,
    async run({ now }) {
      const deps = input.resolve();
      if (!deps) return { skipped: "database_unconfigured" };
      const at = now();
      if (throttle.__orbitR27NotificationsAt && at.getTime() - throttle.__orbitR27NotificationsAt < THROTTLE_MS) return { skipped: "throttled" };
      throttle.__orbitR27NotificationsAt = at.getTime();
      try {
        return await runEventNotifications({
          candidates: () => readEventNotificationCandidates(deps.query, deps.workspaceId, at),
          now: at,
          write: (item) => deps.write(item.actorId, { at: item.at, body: item.body, eventId: item.eventId, href: item.href, semanticKey: item.semanticKey, sourceKind: item.sourceKind, title: item.title }),
        });
      } catch (error) {
        if ((error as { code?: unknown })?.code === "42P01") return { skipped: "schema_missing" };
        throw error;
      }
    },
  };
}
