/**
 * 本人是否报名过任意一场活动（W0006 引导第 4 步「报名任意活动即完成」）。
 *
 * 直接读报名事实，不经过公开目录——活动下架、结束或不再公开后，报名过的人仍算完成：
 *   1. canonical 报名（`event_ops_membership_heads`，按 canonical actor id）里有 `rsvped`；
 *   2. 否则看旧投影（`orbit_records` 的 `event_registrations`，同一个 actor id）里状态为
 *      `rsvped` 的活动；某场活动已经有这个人的 canonical 记录时以 canonical 为准（旧投影可能
 *      过期），只有没有 canonical 记录的活动才按旧投影计。
 * 身份只接受服务端解析出的 canonical actor id（报名接口写入时用的同一个 id）。
 */
import type { EventOperationsSqlExecutor } from "../event-operations/storage/postgres-client";
import { createConfiguredEventOperationsPostgresRuntime } from "../event-operations/storage/postgres-client";
import { createConfiguredPostgresLiveRecordStore } from "../../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../../shared/storage/postgres-live-record-store";
import { resolveSharedReadBudgetGate } from "../../sync/read-budget-gate";
import { EVENT_REGISTRATION_COLLECTION } from "./storage/live-record-provider";

export const ACTIVE_CANONICAL_REGISTRATION_SQL = `select 1 as found
from event_ops_membership_heads
where workspace_id = $1
  and actor_id = $2
  and status = 'rsvped'
limit 1`;

/** 旧投影里本人 `rsvped` 的活动 id（最多 50 个，够判断「有没有」）。 */
export const LEGACY_RSVPED_EVENT_IDS_SQL = `select distinct r.payload->'registration'->>'eventId' as event_id
from orbit_records r
where r.workspace_id = $1
  and r.collection_name = '${EVENT_REGISTRATION_COLLECTION}'
  and r.lifecycle_state <> 'deleted'
  and r.user_id = $2
  and r.payload->'registration'->>'userId' = $2
  and r.payload->'registration'->>'status' = 'rsvped'
  and coalesce(r.payload->'registration'->>'eventId', '') <> ''
limit 50`;

/** 这些活动里本人已有 canonical 记录（任意状态）的 id。 */
export const CANONICAL_HEAD_EVENT_IDS_SQL = `select event_id
from event_ops_membership_heads
where workspace_id = $1
  and actor_id = $2
  and event_id = any($3::text[])`;

export type ActiveRegistrationChecker = (actorId: string) => Promise<boolean>;

export interface ActiveRegistrationSources {
  canonical: { client: EventOperationsSqlExecutor; workspaceId: string } | null;
  legacy: { client: LiveRecordSqlClient; workspaceId: string } | null;
}

export function createActiveRegistrationChecker(sources: ActiveRegistrationSources): ActiveRegistrationChecker {
  return async (actorId) => {
    const id = actorId.trim();
    if (!id) throw new Error("ACTIVE_REGISTRATION_ACTOR_REQUIRED");

    if (sources.canonical) {
      const found = await sources.canonical.client.query(ACTIVE_CANONICAL_REGISTRATION_SQL, [
        sources.canonical.workspaceId,
        id,
      ]);
      if (found.rows.length > 0) return true;
    }
    if (!sources.legacy) return false;

    const legacy = await sources.legacy.client.query<{ event_id: string | null }>(LEGACY_RSVPED_EVENT_IDS_SQL, [
      sources.legacy.workspaceId,
      id,
    ]);
    const legacyEventIds = legacy.rows.flatMap((row) => (row.event_id ? [row.event_id] : []));
    if (legacyEventIds.length === 0) return false;
    if (!sources.canonical) return true;

    const heads = await sources.canonical.client.query<{ event_id: string }>(CANONICAL_HEAD_EVENT_IDS_SQL, [
      sources.canonical.workspaceId,
      id,
      legacyEventIds,
    ]);
    const canonicalEventIds = new Set(heads.rows.map((row) => row.event_id));
    return legacyEventIds.some((eventId) => !canonicalEventIds.has(eventId));
  };
}

/**
 * 按部署配置读取。两个来源都没配置时返回 false（本地无数据库）；读取出错时抛出，
 * 由调用方决定如何降级。
 */
export async function hasAnyActiveRegistration(actorId: string): Promise<boolean> {
  const runtime = createConfiguredEventOperationsPostgresRuntime();
  const configured = createConfiguredPostgresLiveRecordStore();
  if (configured) resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: EVENT_REGISTRATION_COLLECTION });
  return createActiveRegistrationChecker({
    canonical: runtime ? { client: runtime.client, workspaceId: runtime.workspaceId } : null,
    legacy: configured ? { client: configured.client, workspaceId: configured.workspaceId } : null,
  })(actorId);
}
