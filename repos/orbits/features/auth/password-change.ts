// 登录后修改密码 + 首次登录强制改密（批量建账户时脚本在 auth_users payload 写 `mustChangePassword: true`）。
// 写库是一条条件 UPDATE：只有当前 passwordHash 仍是刚刚校验过的那一个时才替换，并发的两次修改至多成功一次。
// 写入 passwordChangedAt 让旧会话失效（session-revocation），客户端随后用新密码重新 signIn。
import { compare, hash } from "bcryptjs";

import type { LiveRecordSqlClient } from "../../shared/storage/postgres-live-record-store";
import { AUTH_PASSWORD_MIN_LENGTH } from "./contract";
import { authUserRecordId } from "./storage/auth-user-live-record-provider";

const BCRYPT_COST = 12;
const MAX_PASSWORD_BYTES = 72;

/** Auth.js 会话里的身份：`userId` = token.sub = auth_users payload.id。 */
export interface PasswordChangeAccount {
  email: string;
  userId: string;
}

export interface PasswordChangeState {
  mustChangePassword: boolean;
  passwordHash: string | null;
}

export interface PasswordChangeStore {
  read(account: PasswordChangeAccount): Promise<PasswordChangeState | null>;
  replace(account: PasswordChangeAccount, expectedHash: string, nextHash: string, now: string): Promise<boolean>;
}

export type PasswordChangeFailureCode = "INVALID_INPUT" | "SAME_PASSWORD" | "WRONG_PASSWORD" | "NO_PASSWORD" | "CONFLICT";
export type PasswordChangeResult = { success: true } | { success: false; code: PasswordChangeFailureCode };

export function createPasswordChangeStore(client: LiveRecordSqlClient, workspaceId: string): PasswordChangeStore {
  return {
    async read(account) {
      const result = await client.query<{ password_hash: string | null; must_change: boolean | null }>(`SELECT
          payload->>'passwordHash' AS password_hash,
          coalesce(payload->'mustChangePassword' = 'true'::jsonb, false) AS must_change
        FROM orbit_records WHERE workspace_id = $1 AND collection_name = 'auth_users' AND record_id = $2
          AND lifecycle_state = 'active' AND payload->>'id' = $3
        LIMIT 1`, [workspaceId, authUserRecordId(account.email), account.userId]);
      const row = result.rows[0];
      if (!row) return null;
      return { mustChangePassword: row.must_change === true, passwordHash: row.password_hash || null };
    },
    async replace(account, expectedHash, nextHash, now) {
      // Credential swap, flag removal and any pending reset link removal are ONE conditional statement.
      const result = await client.query(`UPDATE orbit_records SET
        payload = (payload - 'mustChangePassword' - 'passwordReset') || jsonb_build_object('passwordHash', $4::text,
          'passwordChangedAt', $5::text, 'updatedAt', $5::text), updated_at = $5::timestamptz
        WHERE workspace_id = $1 AND collection_name = 'auth_users' AND record_id = $2
          AND lifecycle_state = 'active' AND payload->>'id' = $3 AND payload->>'passwordHash' = $6
        RETURNING record_id`, [workspaceId, authUserRecordId(account.email), account.userId, nextHash, now, expectedHash]);
      return result.rows.length === 1;
    },
  };
}

function isAcceptablePassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= AUTH_PASSWORD_MIN_LENGTH && Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES;
}

export function createPasswordChangeService(store: PasswordChangeStore, now = () => new Date()) {
  return {
    async change(account: PasswordChangeAccount, currentPassword: unknown, newPassword: unknown): Promise<PasswordChangeResult> {
      if (typeof currentPassword !== "string" || !currentPassword || Buffer.byteLength(currentPassword, "utf8") > MAX_PASSWORD_BYTES) {
        return { success: false, code: "WRONG_PASSWORD" };
      }
      if (!isAcceptablePassword(newPassword)) return { success: false, code: "INVALID_INPUT" };
      if (newPassword === currentPassword) return { success: false, code: "SAME_PASSWORD" };
      const state = await store.read(account);
      if (!state) return { success: false, code: "CONFLICT" };
      if (!state.passwordHash) return { success: false, code: "NO_PASSWORD" };
      if (!await compare(currentPassword, state.passwordHash)) return { success: false, code: "WRONG_PASSWORD" };
      const nextHash = await hash(newPassword, BCRYPT_COST);
      return await store.replace(account, state.passwordHash, nextHash, now().toISOString())
        ? { success: true }
        : { success: false, code: "CONFLICT" };
    },
    async status(account: PasswordChangeAccount): Promise<{ mustChangePassword: boolean }> {
      const state = await store.read(account);
      return { mustChangePassword: Boolean(state?.passwordHash && state.mustChangePassword) };
    },
  };
}

export type PasswordChangeService = ReturnType<typeof createPasswordChangeService>;
