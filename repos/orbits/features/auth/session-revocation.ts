import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import type { LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { authUserRecordId } from "./storage/auth-user-live-record-provider";

export async function isPasswordSessionCurrent(input: { email: string; userId: string; authenticatedAt: number }, database = createConfiguredPostgresLiveRecordStore() as { store: LiveRecordStoreLike<Record<string, unknown>>; workspaceId: string } | null): Promise<boolean> {
  if (!database) return process.env.NODE_ENV !== "production";
  const user = await database.store.getRecord({ workspaceId: database.workspaceId, collectionName: "auth_users", recordId: authUserRecordId(input.email) });
  if (!user || user.lifecycleState !== "active" || user.payload.id !== input.userId) return false;
  const changedAt = user.payload.passwordChangedAt;
  return typeof changedAt !== "string" || Date.parse(changedAt) < input.authenticatedAt;
}
