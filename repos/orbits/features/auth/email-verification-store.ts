// 邮箱验证的存取：都在 auth_users 那一行的 payload 里（不加表、不改 schema）。
// - `emailVerifiedAt`：完成时间；有它就算已验证（Google 账号不看它，一律算）。
// - `emailVerification`：最近一封信。只存令牌的 SHA-256；`issued` 记发过的哈希（最多 10 个），
//   用来分清「已完成后再点」和「过期 / 被新链接取代」。
// 每个写都是一条带条件的 UPDATE：一分钟一封、一天五封、令牌只用一次都由这条语句保证。
import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { authUserRecordId } from "./storage/auth-user-live-record-provider";

export type EmailVerificationLanguage = "zh" | "ja" | "en";

export interface EmailVerificationAccount {
  email: string;
  userId: string;
}

export interface EmailVerificationLetter {
  tokenHash: string;
  language: EmailVerificationLanguage;
  sentAt: string;
  expiresAt: string;
  /** 东京日期，一天五封按它数。 */
  day: string;
}

export interface EmailVerificationState {
  verified: boolean;
  sentAt: string | null;
  day: string | null;
  count: number;
}

export interface EmailVerificationStore {
  /** 占用一封的额度并换上新令牌。false：不满足条件（已验证、太快、当天用完、账号不在），用 read 看原因。 */
  issue(account: EmailVerificationAccount, letter: EmailVerificationLetter, limits: { notAfter: string; perDay: number }): Promise<boolean>;
  read(account: EmailVerificationAccount): Promise<EmailVerificationState | null>;
  /** 通道没收下：退回当天的一封（一分钟间隔仍然算）。 */
  refund(account: EmailVerificationAccount, tokenHash: string): Promise<void>;
  confirm(tokenHash: string, now: string): Promise<{ outcome: "verified"; userId: string } | { outcome: "already" | "expired" }>;
}

const VERIFIED = `(payload->>'provider' = 'google' OR coalesce(payload->>'emailVerifiedAt', '') <> '')`;

export function createEmailVerificationStore(client: LiveRecordSqlClient, workspaceId: string): EmailVerificationStore {
  return {
    async issue(account, letter, limits) {
      const result = await client.query(`UPDATE orbit_records SET
        payload = jsonb_set(payload, '{emailVerification}', $4::jsonb || jsonb_build_object(
          'count', CASE WHEN payload->'emailVerification'->>'day' = $5 THEN coalesce((payload->'emailVerification'->>'count')::int, 0) + 1 ELSE 1 END,
          'issued', (SELECT coalesce(jsonb_agg(hash), '[]'::jsonb) FROM (
            SELECT hash FROM jsonb_array_elements(coalesce(payload->'emailVerification'->'issued', '[]'::jsonb) || jsonb_build_array($6::text)) WITH ORDINALITY AS item(hash, n)
            ORDER BY n DESC LIMIT 10) recent))), updated_at = $7::timestamptz
        WHERE workspace_id = $1 AND collection_name = 'auth_users' AND record_id = $2 AND lifecycle_state = 'active'
          AND payload->>'id' = $3 AND NOT ${VERIFIED}
          AND coalesce(payload->'emailVerification'->>'sentAt', '') <= $8
          AND NOT (coalesce(payload->'emailVerification'->>'day', '') = $5 AND coalesce((payload->'emailVerification'->>'count')::int, 0) >= $9)
        RETURNING record_id`, [workspaceId, authUserRecordId(account.email), account.userId, JSON.stringify(letter), letter.day, letter.tokenHash,
        letter.sentAt, limits.notAfter, limits.perDay]);
      return result.rows.length === 1;
    },
    async read(account) {
      const result = await client.query<{ verified: boolean; sent_at: string | null; day: string | null; count: number | null }>(`SELECT ${VERIFIED} AS verified,
          payload->'emailVerification'->>'sentAt' AS sent_at, payload->'emailVerification'->>'day' AS day,
          (payload->'emailVerification'->>'count')::int AS count
        FROM orbit_records WHERE workspace_id = $1 AND collection_name = 'auth_users' AND record_id = $2
          AND lifecycle_state = 'active' AND payload->>'id' = $3 LIMIT 1`, [workspaceId, authUserRecordId(account.email), account.userId]);
      const row = result.rows[0];
      return row ? { verified: row.verified === true, sentAt: row.sent_at, day: row.day, count: row.count ?? 0 } : null;
    },
    async refund(account, tokenHash) {
      await client.query(`UPDATE orbit_records SET payload = jsonb_set(payload, '{emailVerification,count}',
          to_jsonb(greatest(coalesce((payload->'emailVerification'->>'count')::int, 1) - 1, 0)))
        WHERE workspace_id = $1 AND collection_name = 'auth_users' AND record_id = $2 AND payload->>'id' = $3
          AND payload->'emailVerification'->>'tokenHash' = $4`, [workspaceId, authUserRecordId(account.email), account.userId, tokenHash]);
    },
    async confirm(tokenHash, now) {
      // 换掉状态和作废令牌是同一条语句：同时点两次，只有一次是「这次完成」。
      const done = await client.query<{ user_id: string }>(`UPDATE orbit_records SET
          payload = (payload || jsonb_build_object('emailVerifiedAt', $3::text))
            || jsonb_build_object('emailVerification', (payload->'emailVerification') - 'tokenHash'), updated_at = $3::timestamptz
        WHERE workspace_id = $1 AND collection_name = 'auth_users' AND lifecycle_state = 'active'
          AND payload->'emailVerification'->>'tokenHash' = $2 AND NOT ${VERIFIED}
          AND (payload->'emailVerification'->>'expiresAt')::timestamptz > $3::timestamptz
        RETURNING payload->>'id' AS user_id`, [workspaceId, tokenHash, now]);
      if (done.rows[0]) return { outcome: "verified", userId: done.rows[0].user_id };
      const seen = await client.query(`SELECT 1 FROM orbit_records WHERE workspace_id = $1 AND collection_name = 'auth_users'
          AND lifecycle_state = 'active' AND payload->'emailVerification'->'issued' ? $2 AND ${VERIFIED} LIMIT 1`, [workspaceId, tokenHash]);
      return { outcome: seen.rows.length ? "already" : "expired" };
    },
  };
}
