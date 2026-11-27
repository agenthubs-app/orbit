/**
 * 会话里的显示名（2026-11-27）：资料姓名优先，没有才用账号名（与名单、站内信、通知邮件同一规则）。
 * auth.ts 的 jwt 回调每个令牌只读一次（不是每个请求都查），资料改名后由页面调用 session.update 刷新。
 * 读不到（库不可用、没有资料）返回 null，调用方保持账号名，不影响登录。
 */
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";

export async function readProfileDisplayName(actorId: string): Promise<string | null> {
  const configured = createConfiguredPostgresLiveRecordStore();
  if (!configured) return null;
  const { rows } = await configured.client.query<{ name: string | null }>(
    `select payload ->> 'displayName' as name from orbit_records
     where workspace_id = $1 and collection_name = 'profiles' and user_id = $2 and lifecycle_state <> 'deleted'
     order by updated_at desc limit 1`,
    [configured.workspaceId, actorId],
  );
  const name = rows[0]?.name?.trim();
  return name ? name : null;
}
