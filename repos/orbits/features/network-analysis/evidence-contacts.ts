/**
 * W0049：快照依据（`blocks[].evidence.contactIds`）的姓名读取，结构标签的依据图标用它列出姓名链接。
 *
 * - 只按 id 有界读取（去重后 ≤ EVIDENCE_CONTACT_READ_LIMIT 个），只取 id 与姓名两列；
 * - 只解析本人 actor 范围内的联系人（与名单同一范围谓词：user_id = actor，accountId 为空或为本人）；
 *   不在范围、已删除或不存在的 id 静默略去（调用方据此不渲染）；
 * - W0050／W0051 的依据展示复用本函数，不再各写一份。
 */
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

/** 一次最多解析的依据联系人数（诊断 1 条 + 洞察 3 条，每条依据至多 12 人，去重后取前 30）。 */
export const EVIDENCE_CONTACT_READ_LIMIT = 30;

export interface EvidenceContactName {
  id: string;
  name: string;
}

export async function readEvidenceContactNames(
  input: { client: LiveRecordSqlClient; workspaceId: string },
  actorId: string,
  contactIds: readonly string[],
): Promise<Map<string, string>> {
  const actor = actorId.trim();
  const ids = [...new Set(contactIds.filter((id) => typeof id === "string" && id.trim()))].slice(0, EVIDENCE_CONTACT_READ_LIMIT);
  if (!actor || ids.length === 0) return new Map();
  const result = await input.client.query<{ id: string; name: string | null }>(`
    /* network-analysis:evidence-contact-names */
    select distinct on (payload ->> 'id') payload ->> 'id' as id, payload ->> 'displayName' as name
    from orbit_records
    where workspace_id = $1
      and collection_name = 'contacts'
      and user_id = $2
      and lifecycle_state <> 'deleted'
      and payload ->> 'id' = any($3::text[])
      and (payload -> 'accountId' is null or payload -> 'accountId' = 'null'::jsonb or payload -> 'accountId' = to_jsonb($2::text))
    order by payload ->> 'id', updated_at desc, record_id
    limit ${EVIDENCE_CONTACT_READ_LIMIT}
  `, [input.workspaceId, actor, ids]);
  const names = new Map<string, string>();
  for (const row of result.rows) {
    const name = typeof row.name === "string" ? row.name.trim() : "";
    if (row.id && name) names.set(row.id, name);
  }
  return names;
}
