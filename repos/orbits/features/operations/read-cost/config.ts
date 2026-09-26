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

/** Rule 1: a route's average bytes per request exceeds the median of its previous 7 daily averages times this. */
export const ROUTE_SPIKE_FACTOR = 2;
export const ROUTE_SPIKE_HISTORY_DAYS = 7;
/** At least this many of those 7 days must have data before a median is trusted. */
export const ROUTE_SPIKE_MIN_HISTORY_DAYS = 3;
/** Averages below this are too small to be worth an alert, whatever the ratio. */
export const ROUTE_SPIKE_MIN_AVERAGE_BYTES = 100_000;
/** Rule 2: any single request reading more than 5 MB. */
export const LARGE_REQUEST_BYTES = 5 * 1024 * 1024;
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
