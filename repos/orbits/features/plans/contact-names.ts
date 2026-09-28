/**
 * 计划里关联的联系人 → 名字与副标题（公司 · 职位），供「我的计划」显示（W0009）。
 *
 * 计划只存联系人 id。这里按 id 列表一次批量读取，归属谓词与 `reference-validator.ts` 的联系人校验
 * 一致（workspace、collection `contacts`、未删除、`user_id` 是本人、`payload.accountId` 为空或本人），
 * 所以别人的联系人 id 永远读不出名字。查询只按 id 列表取几个轻字段、有硬上限（Neon egress）。
 */
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { resolveSharedReadBudgetGate } from "../sync/read-budget-gate";
import type { PlanSnapshot } from "./contract";

export interface PlanContactName {
  name: string;
  subtitle: string | null;
}

/** 一次最多解析的联系人数；超过部分显示占位名（计划里的关联人数远低于此）。 */
export const PLAN_CONTACT_NAME_LIMIT = 500;

export const PLAN_CONTACT_NAMES_SQL = `select c.record_id,
       c.payload->>'displayName' as display_name,
       c.payload->>'organization' as organization,
       c.payload->>'role' as role
  from orbit_records c
 where c.workspace_id = $1
   and c.collection_name = 'contacts'
   and c.lifecycle_state <> 'deleted'
   and c.record_id = any($3::text[])
   and c.user_id = $2
   and (c.payload->'accountId' is null or c.payload->'accountId' = 'null'::jsonb
        or c.payload->'accountId' = to_jsonb($2::text))`;

interface NameRow {
  record_id: string | null;
  display_name: string | null;
  organization: string | null;
  role: string | null;
}

function text(value: string | null | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** 快照里所有联系人关联的 id（去重，保持出现顺序）。 */
export function planContactIds(snapshot: PlanSnapshot): string[] {
  const ids = new Set<string>();
  for (const item of snapshot.items) for (const link of item.contactLinks) ids.add(link.contactId);
  return [...ids];
}

export function createPostgresPlanContactNameReader(input: {
  client: Pick<LiveRecordSqlClient, "query">;
  workspaceId: string;
}): (actorId: string, contactIds: readonly string[]) => Promise<Record<string, PlanContactName>> {
  return async (actorId, contactIds) => {
    const actor = actorId.trim();
    const ids = [...new Set(contactIds.filter((id) => typeof id === "string" && id.trim()))].slice(0, PLAN_CONTACT_NAME_LIMIT);
    if (!actor || ids.length === 0) return {};
    const result = await input.client.query<NameRow>(PLAN_CONTACT_NAMES_SQL, [input.workspaceId, actor, ids]);
    const names: Record<string, PlanContactName> = {};
    for (const row of result.rows) {
      const name = text(row.display_name);
      if (!row.record_id || !name) continue;
      const subtitle = [text(row.organization), text(row.role)].filter(Boolean).join(" · ");
      names[row.record_id] = { name, subtitle: subtitle || null };
    }
    return names;
  };
}

/** 按当前配置的联系人存储读取；存储未配置时返回空（界面显示占位名）。读取失败向上抛，由页面降级。 */
export async function readPlanContactNames(
  actorId: string,
  contactIds: readonly string[],
): Promise<Record<string, PlanContactName>> {
  if (contactIds.length === 0) return {};
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return {};
  resolveSharedReadBudgetGate()?.assertAllowed({ collectionName: "contacts" });
  return createPostgresPlanContactNameReader({ client: configured.client, workspaceId: configured.workspaceId })(
    actorId,
    contactIds,
  );
}
