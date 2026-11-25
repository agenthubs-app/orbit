import type { SignupFunnelClient, SignupFunnelEventName, SignupFunnelSource } from "../../shared/contract/signup-funnel";
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";

export interface SignupFunnelStore {
  opened(input: { visitorId: string; client: SignupFunnelClient; source: SignupFunnelSource }): Promise<void>;
  accountCreated(input: { userId: string; visitorId: string | null; client: SignupFunnelClient; source: SignupFunnelSource }): Promise<void>;
  /** 建号之后的步骤：只给记过建号的账号记；来源沿用建号那一行，端没给也沿用。 */
  step(input: { userId: string; name: Exclude<SignupFunnelEventName, "register_opened" | "account_created">; client: SignupFunnelClient | null }): Promise<void>;
}

export function createSignupFunnelStore(client: Pick<LiveRecordSqlClient, "query">, workspaceId: string): SignupFunnelStore {
  return {
    async opened(input) {
      await client.query(`insert into signup_funnel_events (workspace_id, name, client, source, visitor_id)
        values ($1, 'register_opened', $2, $3, $4::uuid) on conflict do nothing`, [workspaceId, input.client, input.source, input.visitorId]);
    },
    async accountCreated(input) {
      await client.query(`insert into signup_funnel_events (workspace_id, name, client, source, visitor_id, user_id)
        values ($1, 'account_created', $2, $3, $4::uuid, $5) on conflict do nothing`,
      [workspaceId, input.client, input.source, input.visitorId, input.userId]);
    },
    async step(input) {
      await client.query(`insert into signup_funnel_events (workspace_id, name, client, source, user_id)
        select workspace_id, $3, coalesce($4, client), source, user_id from signup_funnel_events
        where workspace_id = $1 and user_id = $2 and name = 'account_created' on conflict do nothing`,
      [workspaceId, input.userId, input.name, input.client]);
    },
  };
}
