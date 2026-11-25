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

// One statement per check. Readable rows return only lifecycle, the payload values (jsonb as
// is, never `->>`) and the flag; unreadable rows instead return the native columns `rowToRecord`
// needs (c1–c5), so the old conversion and its errors run on the same snapshot without a second
// read. Where clause = `getRecord`'s. No password hash or reset data is ever returned.
const SESSION_CHECK_SQL = `/* auth-session-revocation:v2 */
    select lifecycle_state, readable,
      case when readable then payload -> 'id' end as id,
      case when readable then payload -> 'passwordChangedAt' end as password_changed_at,
      case when readable then payload -> 'deletionRequestedAt' end as deletion_requested_at,
      case when readable then (payload ->> 'provider') is not distinct from 'google'
        or (jsonb_typeof(payload -> 'emailVerifiedAt') = 'string' and payload ->> 'emailVerifiedAt' <> '') end as email_verified,
      case when readable then payload -> 'emailVerification' is not null end as email_mailed,
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
  deletion_requested_at: unknown;
  email_verified: boolean | null;
  email_mailed: boolean | null;
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

function isBeforeDeletionRequest(lifecycleState: string, payload: Record<string, unknown>, input: SessionCheckInput): boolean {
  if (lifecycleState !== "active" || payload.id !== input.userId) return false;
  const requestedAt = payload.deletionRequestedAt;
  if (typeof requestedAt !== "string") return true;
  const requestedMs = Date.parse(requestedAt);
  return Number.isFinite(requestedMs) && requestedMs < input.authenticatedAt;
}

/** `sent`: a verification mail was sent to this account before (the button then says 再送する). */
export interface EmailVerificationFlags { verified: boolean; sent: boolean }

type SessionRow = { lifecycleState: string; payload: Record<string, unknown>; email: EmailVerificationFlags };

async function readSessionRow(database: SessionCheckDatabase, recordId: string): Promise<SessionRow | null> {
  const collectionName = "auth_users";
  if (!database.client || !database.customRead) {
    const user = await database.store.getRecord({ workspaceId: database.workspaceId, collectionName, recordId });
    return user ? { lifecycleState: user.lifecycleState, payload: user.payload, email: emailFlags(user.payload) } : null;
  }
  const { client, customRead } = database;
  sessionCheckSeq += 1;
  const row = await customRead({
    collectionName,
    key: JSON.stringify(["auth-session-revocation:v2:unshared", database.workspaceId, recordId, sessionCheckSeq]),
    read: async () => (await client.query<SessionCheckRow>(SESSION_CHECK_SQL, [database.workspaceId, collectionName, recordId])).rows[0] ?? null,
  });
  if (!row) return null;
  if (row.readable === true) {
    const lifecycleState = row.lifecycle_state === "archived" || row.lifecycle_state === "deleted" ? row.lifecycle_state : "active";
    return { lifecycleState, email: { verified: row.email_verified === true, sent: row.email_mailed === true },
      payload: { id: row.id, passwordChangedAt: row.password_changed_at, deletionRequestedAt: row.deletion_requested_at } };
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
  return { lifecycleState: user.lifecycleState, payload: user.payload, email: emailFlags(user.payload) };
}

export async function isPasswordSessionCurrent(input: SessionCheckInput, database: SessionCheckDatabase | null = createConfiguredPostgresLiveRecordStore()): Promise<boolean> {
  if (!database) return process.env.NODE_ENV !== "production";
  const user = await readSessionRow(database, authUserRecordId(input.email));
  return user ? isSessionCurrent(user.lifecycleState, user.payload, input) : false;
}

/** A deletion application invalidates JWTs issued before it, including rotated cookies. */
export async function isPreDeletionSessionCurrent(input: SessionCheckInput, database: Pick<SessionCheckDatabase, "store" | "workspaceId"> | null = createConfiguredPostgresLiveRecordStore()): Promise<boolean> {
  if (!database) return process.env.NODE_ENV !== "production";
  const user = await database.store.getRecord({ workspaceId: database.workspaceId, collectionName: "auth_users", recordId: authUserRecordId(input.email) });
  if (!user) return false;
  return isBeforeDeletionRequest(user.lifecycleState, user.payload, input);
}

/** Google accounts are verified by Google; a password account once its mailed link (or a mailed password reset) was used. */
export function isEmailVerifiedPayload(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false;
  return payload.provider === "google" || (typeof payload.emailVerifiedAt === "string" && payload.emailVerifiedAt !== "");
}

function emailFlags(payload: Record<string, unknown> | null): EmailVerificationFlags {
  return { verified: isEmailVerifiedPayload(payload), sent: Boolean(payload?.emailVerification) };
}

export interface AuthSessionState {
  current: boolean;
  /** Same read as the check itself. null: no database to ask (development without one). */
  emailVerification: EmailVerificationFlags | null;
}

/**
 * Both Auth.js session checks (password change and deletion request) and the email-verified flag, decided from one
 * read of the auth_users row, instead of one read each. Still unshared across checks (D31).
 */
export async function readAuthSessionState(input: SessionCheckInput, database: SessionCheckDatabase | null = createConfiguredPostgresLiveRecordStore()): Promise<AuthSessionState> {
  if (!database) return { current: process.env.NODE_ENV !== "production", emailVerification: null };
  const user = await readSessionRow(database, authUserRecordId(input.email));
  if (!user) return { current: false, emailVerification: null };
  return {
    current: isSessionCurrent(user.lifecycleState, user.payload, input) && isBeforeDeletionRequest(user.lifecycleState, user.payload, input),
    emailVerification: user.email,
  };
}

export async function isAuthSessionCurrent(input: SessionCheckInput, database: SessionCheckDatabase | null = createConfiguredPostgresLiveRecordStore()): Promise<boolean> {
  return (await readAuthSessionState(input, database)).current;
}
