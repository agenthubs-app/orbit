/**
 * 「本人已确认联系人」的唯一 SQL 谓词（W0054 review P2-1 统一口径）。
 *
 * 引导第 1 步计数与名片槽位、人脉分析门槛、W0048a 快照（刷新判定、输入）、W0051 洞察读取都用这一条：
 * `orbit_records` 的 contacts，user_id 是本人且 payload.accountId 为空或本人，未删除、已完成初始化
 * （`lifecycleInitialization` 不是 pending），并且**姓名非空**——空姓名记录不算有效联系人（与成熟 CRM 的
 * 「有效联系人」口径一致）。参数约定：$1 workspace，$2 actor。
 */
export function confirmedContactPredicate(alias: string): string {
  return `${alias}.workspace_id = $1
    and ${alias}.collection_name = 'contacts'
    and ${alias}.lifecycle_state <> 'deleted'
    and ${alias}.user_id = $2
    and (${alias}.payload->'accountId' is null or ${alias}.payload->'accountId' = 'null'::jsonb or ${alias}.payload->'accountId' = to_jsonb($2::text))
    and jsonb_typeof(${alias}.payload->'id') = 'string'
    and ${alias}.payload->>'lifecycleInitialization' is distinct from 'pending'
    and coalesce(trim(${alias}.payload->>'displayName'), '') <> ''`;
}
