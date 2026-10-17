/**
 * R17-08（用户 2026-10-17「按主办方资料页」）：旧的 actor 级主办方关注（`org_…`）展开成该主办方名下每份资料页的关注（`orgp_…`），
 * 保留原关注时间，然后删掉旧记录——拆分实体时不让已关注的人丢关注（成熟产品惯例）。没有资料页的主办方（旧活动）保持 actor 级不动。
 * 幂等：重复执行只会跳过已迁移的行。只在本机 / 回环库运行；生产迁移需授权（DEFERRED-A §4）。
 */
import { createPostgresActorRecordStore } from "../../actor-records/store";
import type { EventOperationsPostgresClient } from "../../event-operations/storage/postgres-client";
import { createOrganizerFollowService } from "../../journey/attendee-records";
import { organizerKeyFor, organizerKeyForProfile } from "../../journey/live-mapping";

export interface FollowMigrationResult { legacy: number; migrated: number; created: number; kept: number }

export async function migrateActorFollowsToProfiles(deps: { client: EventOperationsPostgresClient; workspaceId: string; now?: () => Date }): Promise<FollowMigrationResult> {
  const { client, workspaceId } = deps;
  const query = async (sql: string, values?: readonly unknown[]) => ({ rows: [...(await client.query<Record<string, unknown>>(sql, values as unknown[])).rows] });
  const follows = createOrganizerFollowService({ store: createPostgresActorRecordStore({ query, workspaceId }), ...(deps.now ? { now: deps.now } : {}) });
  const profiles = await query(`select owner_actor_id, profile_id from organizer_profiles where workspace_id = $1`, [workspaceId]);
  const byActorKey = new Map<string, string[]>();
  for (const row of profiles.rows) {
    const key = organizerKeyFor(String(row.owner_actor_id));
    const profileKey = organizerKeyForProfile(String(row.profile_id));
    if (key && profileKey) byActorKey.set(key, [...(byActorKey.get(key) ?? []), profileKey]);
  }
  const legacy = await query(
    `select user_id, payload ->> 'organizerId' as organizer_id, payload ->> 'followedAt' as followed_at from orbit_records
      where workspace_id = $1 and collection_name = 'organizerFollows' and lifecycle_state <> 'deleted' and payload ->> 'organizerId' like 'org\\_%'`,
    [workspaceId],
  );
  const result: FollowMigrationResult = { created: 0, kept: 0, legacy: legacy.rows.length, migrated: 0 };
  for (const row of legacy.rows) {
    const actorId = String(row.user_id);
    const targets = byActorKey.get(String(row.organizer_id));
    if (!targets?.length) { result.kept += 1; continue; }
    for (const target of targets) if (await follows.adopt(actorId, target, String(row.followed_at ?? (deps.now?.() ?? new Date()).toISOString()))) result.created += 1;
    await follows.drop(actorId, String(row.organizer_id));
    result.migrated += 1;
  }
  return result;
}
