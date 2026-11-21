/**
 * Node.js-only part of the server start hook: installs request read receipts
 * (monitoring O1) and, during the P0 week, connection timing. Kept in its own
 * module so the edge bundle never imports pg.
 */
import pg from "pg";
import { currentReadLedgerForTiming } from "./shared/observability/read-receipts";
import { installConfiguredReadReceipts } from "./shared/observability/read-receipts-configured";
import { enableRequestTiming, installPgConnectTiming, p0MeasurementActive } from "./shared/observability/request-timing";

try {
  installConfiguredReadReceipts();
} catch (error) {
  console.warn(JSON.stringify({ event: "read_receipts_install_failed", error: error instanceof Error ? error.name : "Error" }));
}

try {
  if (p0MeasurementActive()) enableRequestTiming();
  installPgConnectTiming(pg.Client, currentReadLedgerForTiming);
} catch (error) {
  console.warn(JSON.stringify({ event: "pg_connect_timing_install_failed", error: error instanceof Error ? error.name : "Error" }));
}
