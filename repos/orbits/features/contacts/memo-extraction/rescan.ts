/**
 * W0048a：memo 提取的有界补扫（W0046 交接：开闸后由维护任务补「没有 memo_extractions 记录」以及
 * 「disabled／到期 deferred／认领租约过期」的 memo，计入后台池）。
 *
 * 一条语句取至多 `limit` 条候选（按 memo 所在详情行最近更新倒序），逐条重跑幂等的 `runMemoExtraction`：
 * 作业自己做原子认领与终态判断，补扫与写 memo 后的 after() 并发也只会有一方发请求。
 * 只读候选；写入全部经作业与闸门（后台池满时作业记 deferred 到次日，0 次调用）。
 */
import { MEMO_NOTE_ID_PREFIX } from "../../relationship-timeline/build";
import type { MemoExtractionJobInput } from "./job";

export interface MemoRescanSqlClient {
  query<TRow = Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly TRow[] }>;
}

/** 每轮维护最多补扫的 memo 条数（每条至多 1 次操作）。 */
export const MEMO_RESCAN_LIMIT = 10;

export const MEMO_RESCAN_SQL = `/* memo-extraction:rescan */
  select r.user_id as actor_id, r.payload->>'contactId' as contact_id, n->>'noteId' as note_id, n->>'body' as body,
    c.payload->>'organization' as organization, c.payload->>'role' as role
  from orbit_records r
  cross join lateral jsonb_array_elements(case when jsonb_typeof(r.payload->'notes') = 'array' then r.payload->'notes' else '[]'::jsonb end) as n
  join orbit_records c
    on c.workspace_id = r.workspace_id and c.collection_name = 'contacts' and c.record_id = r.payload->>'contactId'
    and c.user_id = r.user_id and c.lifecycle_state <> 'deleted'
  where r.workspace_id = $1 and r.collection_name = 'contact_detail_states' and r.lifecycle_state <> 'deleted'
    and r.payload->>'actorId' = r.user_id
    and n->>'noteId' like '${MEMO_NOTE_ID_PREFIX}%'
    and coalesce(trim(n->>'body'), '') <> ''
    and not exists (
      select 1 from orbit_records m
      where m.workspace_id = $1 and m.collection_name = 'memo_extractions' and m.user_id = r.user_id
        and m.lifecycle_state <> 'deleted' and m.payload->>'noteId' = n->>'noteId'
        and not (
          m.payload->>'status' = 'disabled'
          or (m.payload->>'status' = 'deferred' and coalesce(m.payload->>'retryOn', '') <= $2)
          or (m.payload->>'status' = 'claimed' and coalesce(m.payload->>'leaseUntil', '') <= $2)
        )
    )
  order by r.updated_at desc, n->>'noteId'
  limit $3`;

export async function listMemoExtractionRescanCandidates(
  client: MemoRescanSqlClient,
  input: { workspaceId: string; now: Date; limit?: number },
): Promise<MemoExtractionJobInput[]> {
  const rows = (await client.query<Record<string, unknown>>(MEMO_RESCAN_SQL, [input.workspaceId, input.now.toISOString(), input.limit ?? MEMO_RESCAN_LIMIT])).rows;
  return rows.flatMap((row) => {
    const actorId = typeof row.actor_id === "string" ? row.actor_id : "";
    const contactId = typeof row.contact_id === "string" ? row.contact_id : "";
    const noteId = typeof row.note_id === "string" ? row.note_id : "";
    const body = typeof row.body === "string" ? row.body : "";
    if (!actorId || !contactId || !noteId || !body.trim()) return [];
    return [{
      actorId,
      body,
      contact: {
        organization: typeof row.organization === "string" ? row.organization : null,
        role: typeof row.role === "string" ? row.role : null,
      },
      contactId,
      noteId,
    }];
  });
}
