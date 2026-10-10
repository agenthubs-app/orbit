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

/** POST /api/account/exports. */
export interface AccountExportCreateInput {
  scope: readonly AccountExportScope[];
  idempotencyKey: string;
}

export interface AccountDeletionRequestContract {
  requestedAt: string;
  /** requestedAt + 30 days; cancelling before then keeps the account. */
  purgeAfter: string;
  cancelledAt?: string;
}

/**
 * GET /api/app/version. Enforced only after the first public release (README rule 10,
 * confirmed 2026-10-10): before that there are no installed versions to keep working,
 * so contract changes ship with a new App build; afterwards a change an installed
 * version cannot read either waits for a tolerant release or raises this minimum.
 */
export interface AppVersionContract {
  minSupportedAppVersion: string;
  latestAppVersion: string;
}
