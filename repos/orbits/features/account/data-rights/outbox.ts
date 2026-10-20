import type { TransactionalPostgresClient } from "../../../shared/storage/transactional-postgres";

type Channel = "mail" | "push";
type Delivery = "delivered" | "retry" | "unavailable" | "uncertain";
type State = "pending" | "sending" | Delivery;

export interface AccountRightsMessage {
  id: string;
  actorId: string;
  kind: "export-ready" | "deletion-request" | "deletion-complete";
  exportId?: string;
  requestedAt?: string;
  purgeAfter?: string;
}

interface OutboxPayload extends Partial<AccountRightsMessage> {
  version: number;
  status: string;
  mail?: { state: State; attempts: number; retryAt?: string };
  push?: { state: State; attempts: number; retryAt?: string };
}

interface Row { record_id: string; user_id: string; payload: OutboxPayload | string }
const decode = (payload: OutboxPayload | string) => typeof payload === "string" ? JSON.parse(payload) as OutboxPayload : payload;

/** A channel is marked sending before the external call. An unknown provider
 * outcome is never automatically retried: SMTP and push cannot promise that
 * a timed-out call was not accepted. Explicit rejection can be retried. */
export function createAccountRightsOutbox(input: {
  db: TransactionalPostgresClient;
  workspaceId: string;
  deliver: Record<Channel, (message: AccountRightsMessage) => Promise<Delivery>>;
  now?: () => Date;
}) {
  const now = input.now ?? (() => new Date());
  return {
    async runOnce(actorId?: string): Promise<{ kind: "idle" | Delivery; id?: string; channel?: Channel }> {
      const claim = await input.db.transaction(async sql => {
        const rows = await sql.query<Row>(`select record_id,user_id,payload from orbit_records
          where workspace_id=$1 and collection_name='account_rights_outbox' and
          ($2::text is null or user_id=$2) and
          (coalesce(payload->'mail'->>'state','pending')='pending' or
           (payload->'mail'->>'state'='retry' and payload->'mail'->>'retryAt'<=$3) or
           coalesce(payload->'push'->>'state','pending')='pending' or
           (payload->'push'->>'state'='retry' and payload->'push'->>'retryAt'<=$3))
          order by created_at,record_id for update skip locked limit 1`, [input.workspaceId, actorId ?? null, now().toISOString()]);
        const row = rows.rows[0];
        if (!row) return null;
        const payload = decode(row.payload);
        const channel: Channel = !payload.mail || payload.mail.state === "pending" ||
          payload.mail.state === "retry" && !!payload.mail.retryAt && payload.mail.retryAt <= now().toISOString() ? "mail" : "push";
        const previous = payload[channel];
        const next: OutboxPayload = { ...payload, version: (payload.version ?? 0) + 1,
          [channel]: { state: "sending", attempts: (previous?.attempts ?? 0) + 1 } };
        await sql.query(`update orbit_records set payload=$4::jsonb,updated_at=$5::timestamptz
          where workspace_id=$1 and collection_name='account_rights_outbox' and record_id=$2 and user_id=$3`,
        [input.workspaceId, row.record_id, row.user_id, JSON.stringify(next), now().toISOString()]);
        if (!["export-ready", "deletion-request", "deletion-complete"].includes(String(payload.kind))) throw new Error("Invalid account rights notification");
        return { id: row.record_id, actorId: row.user_id, channel, payload: next };
      }, { isolation: "read committed" });
      if (!claim) return { kind: "idle" };
      const message: AccountRightsMessage = { id: claim.id, actorId: claim.actorId,
        kind: claim.payload.kind as AccountRightsMessage["kind"], exportId: claim.payload.exportId,
        requestedAt: claim.payload.requestedAt, purgeAfter: claim.payload.purgeAfter };
      let outcome: Delivery;
      try { outcome = await input.deliver[claim.channel](message); }
      catch { outcome = "uncertain"; }
      if (!["delivered", "retry", "unavailable", "uncertain"].includes(outcome)) outcome = "uncertain";
      await input.db.transaction(async sql => {
        const current = await sql.query<{ payload: OutboxPayload | string }>(`select payload from orbit_records
          where workspace_id=$1 and collection_name='account_rights_outbox' and record_id=$2 and user_id=$3 for update`,
        [input.workspaceId, claim.id, claim.actorId]);
        const payload = current.rows[0] && decode(current.rows[0].payload);
        if (!payload || payload.version !== claim.payload.version || payload[claim.channel]?.state !== "sending") return;
        const next = { ...payload, version: payload.version + 1,
          [claim.channel]: { ...payload[claim.channel], state: outcome,
            ...(outcome === "retry" ? { retryAt: new Date(now().getTime() + 60_000).toISOString() } : {}) } };
        await sql.query(`update orbit_records set payload=$4::jsonb,updated_at=$5::timestamptz
          where workspace_id=$1 and collection_name='account_rights_outbox' and record_id=$2 and user_id=$3`,
        [input.workspaceId, claim.id, claim.actorId, JSON.stringify(next), now().toISOString()]);
      }, { isolation: "read committed" });
      return { kind: outcome, id: claim.id, channel: claim.channel };
    },
  };
}
