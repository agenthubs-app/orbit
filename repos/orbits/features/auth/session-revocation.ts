import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
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

export async function isPasswordSessionCurrent(input: { email: string; userId: string; authenticatedAt: number }, database = createConfiguredPostgresLiveRecordStore() as { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string } | null): Promise<boolean> {
  if (!database) return process.env.NODE_ENV !== "production";
  const user = await database.store.getRecord({ workspaceId: database.workspaceId, collectionName: "auth_users", recordId: authUserRecordId(input.email) });
  if (!user || user.lifecycleState !== "active" || user.payload.id !== input.userId) return false;
  const changedAt = user.payload.passwordChangedAt;
  return typeof changedAt !== "string" || Date.parse(changedAt) < input.authenticatedAt;
}
