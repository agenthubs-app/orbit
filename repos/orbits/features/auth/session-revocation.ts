import { createConfiguredPostgresLiveRecordStore, type LiveRecordCustomRead } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { jsDateSafeTimestampSql } from "../../shared/storage/postgres-js-date-sql";
import { rowToRecord, type LiveRecordSqlClient, type PostgresLiveRecordRow } from "../../shared/storage/postgres-live-record-store";
import { authUserRecordId } from "./storage/auth-user-live-record-provider";

export type PasswordSessionStatus = "active" | "disabled" | "password_changed";

/** Unlike the Auth.js callback's boolean, this keeps storage failure distinguishable from revocation. */
export async function getPasswordSessionStatus(
  input: { email: string; userId: string; authenticatedAt: number },
  database = createConfiguredPostgresLiveRecordStore() as { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string } | null,
): Promise<PasswordSessionStatus> {
  if (!database) throw new Error("ACCOUNT_STATUS_DATABASE_UNAVAILABLE");
  const user = await database.store.getRecord({
    workspaceId: database.workspaceId,
    collectionName: "auth_users",
    recordId: authUserRecordId(input.email),
  });
  if (!user || user.lifecycleState !== "active" || user.payload.id !== input.userId) return "disabled";
  const changedAt = user.payload.passwordChangedAt;
  if (typeof changedAt !== "string") return "active";
  const changedAtMs = Date.parse(changedAt);
  if (!Number.isFinite(changedAtMs) || changedAtMs >= input.authenticatedAt) return "password_changed";
  return "active";
}

type SessionCheckInput = { email: string; userId: string; authenticatedAt: number };
type SessionCheckDatabase = {
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
  /** With `customRead`: one lightweight statement per check instead of `store.getRecord` (W0032). */
  client?: LiveRecordSqlClient;
  customRead?: LiveRecordCustomRead;
};

// Rows `rowToRecord` converts without throwing and whose payload is a JSON object: the check can
// then be decided from `payload->'id'` and `payload->'passwordChangedAt'` alone. Same timestamp
// rules as the W0030 identity read (created_at / updated_at must be valid JS dates; occurred_at /
// deleted_at may be null or ±infinity but not a finite value outside the JS Date range).
const ROW_READABLE = `(
      jsonb_typeof(payload) = 'object'
      and coalesce(${jsDateSafeTimestampSql("created_at")}, false)
      and coalesce(${jsDateSafeTimestampSql("updated_at")}, false)
      and not coalesce(isfinite(occurred_at) and not ${jsDateSafeTimestampSql("occurred_at")}, false)
      and not coalesce(isfinite(deleted_at) and not ${jsDateSafeTimestampSql("deleted_at")}, false)
    )`;

// One statement per check. Readable rows return only lifecycle, the two payload values (jsonb as
// is, never `->>`) and the flag; unreadable rows instead return the native columns `rowToRecord`
// needs (c1–c5), so the old conversion and its errors run on the same snapshot without a second
// read. Where clause = `getRecord`'s. No password hash or reset data is ever returned.
const SESSION_CHECK_SQL = `/* auth-session-revocation:v1 */
    select lifecycle_state, readable,
      case when readable then payload -> 'id' end as id,
      case when readable then payload -> 'passwordChangedAt' end as password_changed_at,
      case when not readable then occurred_at end as c1,
      case when not readable then created_at end as c2,
      case when not readable then updated_at end as c3,
      case when not readable then deleted_at end as c4,
      case when not readable then payload end as c5
    from (
      select lifecycle_state, payload, occurred_at, created_at, updated_at, deleted_at, ${ROW_READABLE} as readable
      from orbit_records
      where workspace_id = $1 and collection_name = $2 and record_id = $3 and lifecycle_state <> 'deleted'
      limit 1
    ) auth_user`;

interface SessionCheckRow {
  lifecycle_state: string;
  readable: boolean;
  id: unknown;
  password_changed_at: unknown;
  c1: Date | string | null;
  c2: Date | string;
  c3: Date | string;
  c4: Date | string | null;
  c5: Record<string, unknown> | string;
}

// Each logical check gets its own key, so the in-flight deduper never shares a check read (D31):
// a check started after a password reset commits always runs its own statement, on every instance.
// The read still passes the shared gate (auth_users is a critical collection) and is metered.
let sessionCheckSeq = 0;

function isSessionCurrent(lifecycleState: string, payload: Record<string, unknown>, input: SessionCheckInput): boolean {
  if (lifecycleState !== "active" || payload.id !== input.userId) return false;
  const changedAt = payload.passwordChangedAt;
  return typeof changedAt !== "string" || Date.parse(changedAt) < input.authenticatedAt;
}

async function readSessionCheck(
  database: SessionCheckDatabase & { client: LiveRecordSqlClient; customRead: LiveRecordCustomRead },
  recordId: string,
  input: SessionCheckInput,
): Promise<boolean> {
  sessionCheckSeq += 1;
  const collectionName = "auth_users";
  const row = await database.customRead({
    collectionName,
    key: JSON.stringify(["auth-session-revocation:v1:unshared", database.workspaceId, recordId, sessionCheckSeq]),
    read: async () => (await database.client.query<SessionCheckRow>(SESSION_CHECK_SQL, [database.workspaceId, collectionName, recordId])).rows[0] ?? null,
  });
  if (!row) return false;
  if (row.readable === true) {
    const lifecycleState = row.lifecycle_state === "archived" || row.lifecycle_state === "deleted" ? row.lifecycle_state : "active";
    return isSessionCurrent(lifecycleState, { id: row.id, passwordChangedAt: row.password_changed_at }, input);
  }
  // Bad data: the real conversion decides (and throws) exactly as the full read would.
  const user = rowToRecord<Record<string, unknown>>({
    collection_name: collectionName,
    created_at: row.c2,
    deleted_at: row.c4,
    lifecycle_state: row.lifecycle_state,
    occurred_at: row.c1,
    payload: row.c5,
    record_id: recordId,
    source_id: "",
    source_type: "",
    updated_at: row.c3,
    workspace_id: database.workspaceId,
  } satisfies PostgresLiveRecordRow);
  return isSessionCurrent(user.lifecycleState, user.payload, input);
}

export async function isPasswordSessionCurrent(input: SessionCheckInput, database: SessionCheckDatabase | null = createConfiguredPostgresLiveRecordStore()): Promise<boolean> {
  if (!database) return process.env.NODE_ENV !== "production";
  const recordId = authUserRecordId(input.email);
  if (database.client && database.customRead) {
    return readSessionCheck({ ...database, client: database.client, customRead: database.customRead }, recordId, input);
  }
  const user = await database.store.getRecord({ workspaceId: database.workspaceId, collectionName: "auth_users", recordId });
  if (!user) return false;
  return isSessionCurrent(user.lifecycleState, user.payload, input);
}
