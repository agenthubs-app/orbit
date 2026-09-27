/**
 * 计划引用校验（`PlanReferenceValidator` 的两种实现）。都按当前登录者构造：
 *
 * - live：联系人查 `orbit_records`（collection `contacts`、未删除、`user_id` 为本人且
 *   `payload.accountId` 为空或本人，条件与 `contact-scope-postgres-reader.ts` 一致）；
 *   活动查 canonical 活动目录（`EventCoreService.getPublishedEvent`），只接受已发布、且 id 就是
 *   canonical event id 的活动（别名不算）。目录服务不可用时所有活动都视为找不到（fail closed）。
 * - allow-list：mock 模式与测试用。联系人按 actor 分组，活动是 workspace 级的公开目录；
 *   `"any"` 表示接受任意格式合法的 id（mock 模式没有可核对的数据源）。
 */
import type { EventCoreService } from "../events/core/service";
import type { PlanReferenceValidator } from "./contract";
import type { PlanQueryClient } from "./repository";

export function createPostgresPlanReferenceValidator(input: {
  client: PlanQueryClient;
  workspaceId: string;
  actorId: string;
  eventCore: Pick<EventCoreService, "getPublishedEvent"> | null;
}): PlanReferenceValidator {
  const { actorId, client, eventCore, workspaceId } = input;
  return {
    async findMissingContactIds(contactIds) {
      if (contactIds.length === 0) return [];
      const result = await client.query(
        `select c.record_id from orbit_records c
         where c.workspace_id = $1 and c.collection_name = 'contacts'
           and c.lifecycle_state <> 'deleted'
           and c.record_id = any($3::text[])
           and c.user_id = $2
           and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb
                or c.payload->'accountId' = to_jsonb($2::text))`,
        [workspaceId, actorId, [...contactIds]],
      );
      const found = new Set((result.rows as Array<{ record_id: string }>).map((row) => row.record_id));
      return contactIds.filter((id) => !found.has(id));
    },
    async findMissingEventIds(eventIds) {
      if (!eventCore) return [...eventIds];
      const checks = await Promise.all(
        eventIds.map(async (id) => ((await eventCore.getPublishedEvent(id))?.eventId === id ? null : id)),
      );
      return checks.filter((id): id is string => id !== null);
    },
  };
}

export interface PlanReferenceAllowList {
  /** actorId → 该用户拥有的联系人 id；`"any"` 接受任意 id。 */
  contactsByActor: Readonly<Record<string, readonly string[]>> | "any";
  /** 公开活动目录里的活动 id；`"any"` 接受任意 id。 */
  eventIds: readonly string[] | "any";
}

export function createAllowListPlanReferenceValidator(input: {
  actorId: string;
  allowList: PlanReferenceAllowList;
}): PlanReferenceValidator {
  const { actorId, allowList } = input;
  return {
    async findMissingContactIds(contactIds) {
      if (allowList.contactsByActor === "any") return [];
      const owned = new Set(allowList.contactsByActor[actorId] ?? []);
      return contactIds.filter((id) => !owned.has(id));
    },
    async findMissingEventIds(eventIds) {
      if (allowList.eventIds === "any") return [];
      const known = new Set(allowList.eventIds);
      return eventIds.filter((id) => !known.has(id));
    },
  };
}
