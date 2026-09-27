// Read-cost monitoring (O2 + O3) configuration. Thresholds are code constants
// by design; the only runtime setting is who may see the page and receive alerts.
// There is no platform-admin role in Orbit, so admins are an explicit account-id
// list. Empty or unset means nobody: the page refuses everyone and alerts wait.

export const READ_COST_ADMIN_ACCOUNT_IDS_ENV = "ORBIT_READ_COST_ADMIN_ACCOUNT_IDS";

/** Receipts are kept 14 days, daily rollups 1 year, reconciliation rows for ever. */
export const RECEIPT_RETENTION_DAYS = 14;
export const ROLLUP_RETENTION_DAYS = 365;
/** Complete UTC days still covered by receipts that a pass may (re)compute. */
export const ROLLUP_LOOKBACK_DAYS = RECEIPT_RETENTION_DAYS - 1;
/** A day's rollup is final once computed this long after the day ended (late after() writes). */
export const ROLLUP_FINAL_AFTER_MS = 15 * 60_000;

/**
 * Rule 1 (design O3, as approved): a route's average bytes per request exceeds
 * the median of its previous 7 daily averages times this. The rule is checked
 * whenever a median exists (at least one history day); there is no minimum
 * history length or minimum average (user decision 2026-09-27, Sprint 0121).
 */
export const ROUTE_SPIKE_FACTOR = 2;
export const ROUTE_SPIKE_HISTORY_DAYS = 7;
/** Rule 2: any single request reading more than 5 MB. */
export const LARGE_REQUEST_BYTES = 5 * 1024 * 1024;
/**
 * Neon reconciliation retry for days recorded as failed/unavailable while
 * receipts are still retained: at most this many Neon attempts per day, the
 * next one no earlier than NEON_RETRY_BASE_MS * 2^(attempts - 1) (capped at
 * NEON_RETRY_MAX_MS) after the last, and at most NEON_RETRY_PER_PASS days per pass.
 */
export const NEON_MAX_ATTEMPTS = 6;
export const NEON_RETRY_BASE_MS = 60 * 60_000;
export const NEON_RETRY_MAX_MS = 24 * 60 * 60_000;
export const NEON_RETRY_PER_PASS = ROLLUP_LOOKBACK_DAYS;
/** Rule 3: recorded bytes cover less than 70 % of Neon's transfer. */
export const LOW_COVERAGE_BELOW = 0.7;
/** Alerts are only raised for recently finalized days, never for an old backlog. */
export const ALERT_MAX_AGE_DAYS = 2;

export function readCostAdminAccountIds(env: Record<string, string | undefined> = process.env): string[] {
  const ids = (env[READ_COST_ADMIN_ACCOUNT_IDS_ENV] ?? "").split(",").map((id) => id.trim()).filter(Boolean);
  return [...new Set(ids)];
}

export function isReadCostAdmin(accountId: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  const id = accountId?.trim();
  return Boolean(id) && readCostAdminAccountIds(env).includes(id!);
}
