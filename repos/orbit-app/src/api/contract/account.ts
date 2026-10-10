// R08 contract 11 — data export, account deletion request, minimum app version.
// Owner: 乙 (R18). Used by: settings, App start-up.
export type AccountExportScope = "contacts" | "notes" | "tasks" | "events" | "plans";

export interface AccountExportContract {
  id: string;
  scope: readonly AccountExportScope[];
  status: "queued" | "running" | "ready" | "failed" | "expired";
  requestedAt: string;
  /** The download link works for 7 days once ready. */
  downloadUrl?: string;
  expiresAt?: string;
}

export interface AccountDeletionRequestContract {
  requestedAt: string;
  /** requestedAt + 30 days; cancelling before then keeps the account. */
  purgeAfter: string;
  cancelledAt?: string;
}

export interface AppVersionContract {
  minSupportedAppVersion: string;
  latestAppVersion: string;
}
