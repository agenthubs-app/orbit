import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { authUserRecordId } from "./storage/auth-user-live-record-provider";

export interface PasswordResetRecord {
  tokenHash: string;
  sealedToken: string;
  expiresAt: string;
  requestedAt: string;
  retryAt: string;
  delivery: "pending" | "sending" | "sent" | "failed";
  attempts: number;
  leaseId?: string;
}

export interface PasswordResetMailJob {
  email: string;
  reset: PasswordResetRecord;
}

export interface PasswordResetStore {
  request(email: string, reset: PasswordResetRecord, before: string): Promise<void>;
  hasPendingDelivery(now: string): Promise<boolean>;
  isValid(tokenHash: string, now: string): Promise<boolean>;
  consume(tokenHash: string, passwordHash: string, now: string): Promise<boolean>;
  claim(now: string, leaseUntil: string, leaseId: string): Promise<PasswordResetMailJob | null>;
  finish(job: PasswordResetMailJob, delivered: boolean, retryAt: string, now: string): Promise<void>;
}

export function createPasswordResetStore(client: LiveRecordSqlClient, workspaceId: string): PasswordResetStore {
  return {
    async hasPendingDelivery(now) {
      const result = await client.query(`SELECT 1 FROM orbit_records WHERE workspace_id = $1
        AND collection_name = 'auth_users' AND lifecycle_state = 'active'
        AND payload->'passwordReset'->>'delivery' IN ('pending', 'sending')
        AND (payload->'passwordReset'->>'expiresAt')::timestamptz > $2::timestamptz
        LIMIT 1`, [workspaceId, now]);
      return result.rows.length > 0;
    },
    async request(email, reset, before) {
      // One row per existing account: atomic cooldown, no unbounded anonymous rows.
      await client.query(`UPDATE orbit_records SET payload = jsonb_set(payload, '{passwordReset}', $3::jsonb), updated_at = $4
        WHERE workspace_id = $1 AND collection_name = 'auth_users' AND record_id = $2
          AND lifecycle_state = 'active' AND coalesce(payload->>'passwordHash', '') <> ''
          AND coalesce(payload->'passwordReset'->>'requestedAt', '') <= $5`,
      [workspaceId, authUserRecordId(email), JSON.stringify(reset), reset.requestedAt, before]);
    },
    async isValid(tokenHash, now) {
      const result = await client.query(`SELECT 1 FROM orbit_records WHERE workspace_id = $1
        AND collection_name = 'auth_users' AND lifecycle_state = 'active'
        AND payload->'passwordReset'->>'tokenHash' = $2
        AND (payload->'passwordReset'->>'expiresAt')::timestamptz > $3::timestamptz`, [workspaceId, tokenHash, now]);
      return result.rows.length === 1;
    },
    async consume(tokenHash, passwordHash, now) {
      // Credential update and token consumption are ONE conditional SQL statement.
      // Row locking makes simultaneous redemption succeed at most once.
      const result = await client.query(`UPDATE orbit_records SET
        payload = (payload - 'passwordReset') || jsonb_build_object('passwordHash', $3::text,
          'passwordChangedAt', $4::text, 'updatedAt', $4::text), updated_at = $4
        WHERE workspace_id = $1 AND collection_name = 'auth_users' AND lifecycle_state = 'active'
          AND payload->'passwordReset'->>'tokenHash' = $2
          AND (payload->'passwordReset'->>'expiresAt')::timestamptz > $4::timestamptz
        RETURNING record_id`, [workspaceId, tokenHash, passwordHash, now]);
      return result.rows.length === 1;
    },
    async claim(now, leaseUntil, leaseId) {
      const result = await client.query<{ payload: { email: string; passwordReset: PasswordResetRecord } }>(`
        WITH candidate AS (SELECT record_id FROM orbit_records WHERE workspace_id = $1
          AND collection_name = 'auth_users' AND lifecycle_state = 'active'
          AND payload->'passwordReset'->>'delivery' IN ('pending', 'sending')
          AND (payload->'passwordReset'->>'expiresAt')::timestamptz > $2::timestamptz
          AND (payload->'passwordReset'->>'retryAt')::timestamptz <= $2::timestamptz
          ORDER BY payload->'passwordReset'->>'requestedAt' LIMIT 1 FOR UPDATE SKIP LOCKED)
        UPDATE orbit_records r SET payload = jsonb_set(r.payload, '{passwordReset}',
          (r.payload->'passwordReset') || jsonb_build_object('delivery', 'sending', 'retryAt', $3::text,
            'leaseId', $4::text, 'attempts', (r.payload->'passwordReset'->>'attempts')::int + 1)), updated_at = $2
        FROM candidate c WHERE r.workspace_id = $1 AND r.collection_name = 'auth_users' AND r.record_id = c.record_id
        RETURNING r.payload`, [workspaceId, now, leaseUntil, leaseId]);
      const row = result.rows[0]?.payload;
      return row ? { email: row.email, reset: row.passwordReset } : null;
    },
    async finish(job, delivered, retryAt, now) {
      const state = delivered ? "sent" : job.reset.attempts >= 5 ? "failed" : "pending";
      await client.query(`UPDATE orbit_records SET payload = jsonb_set(payload, '{passwordReset}',
        ((payload->'passwordReset') - 'leaseId') || jsonb_build_object('delivery', $4::text, 'retryAt', $5::text,
          'sealedToken', CASE WHEN $4 IN ('sent', 'failed') THEN '' ELSE payload->'passwordReset'->>'sealedToken' END)), updated_at = $6
        WHERE workspace_id = $1 AND collection_name = 'auth_users' AND record_id = $2
          AND payload->'passwordReset'->>'tokenHash' = $3 AND payload->'passwordReset'->>'leaseId' = $7`,
      [workspaceId, authUserRecordId(job.email), job.reset.tokenHash, state, retryAt, now, job.reset.leaseId]);
    },
  };
}
