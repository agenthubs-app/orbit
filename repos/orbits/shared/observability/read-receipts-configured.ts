import { createConfiguredTransactionalPostgresRuntime } from "../storage/transactional-postgres";
import { READ_RECEIPTS_SAMPLE_RATE_ENV } from "./read-receipts";
import { installNextReadReceipts } from "./read-receipts-next";
import { p0MeasurementActive } from "./request-timing";
import {
  axiomConfigFromEnv,
  createPostgresReadReceiptWriter,
  createReadReceiptSink,
} from "./read-receipts-sink";

/**
 * Production wiring: receipts go to `orbit_read_receipts` through the shared
 * transactional pool (no extra pool), to one log line, and to Axiom when
 * `AXIOM_TOKEN` and `AXIOM_DATASET` are both set.
 */
export function installConfiguredReadReceipts(env: Record<string, string | undefined> = process.env): boolean {
  // During the P0 week every request gets a receipt; it goes to the log only, so measuring adds no
  // database writes (request-timing.ts). Afterwards the normal sampled table writer returns.
  const sink = createReadReceiptSink({
    write: p0MeasurementActive()
      ? null
      : createPostgresReadReceiptWriter(() => createConfiguredTransactionalPostgresRuntime({ env })?.client ?? null),
    axiom: axiomConfigFromEnv(env),
  });
  // P0: every request, not the usual sample (the log line is the only output, so no database cost).
  return installNextReadReceipts({
    sink,
    env: p0MeasurementActive() ? { ...env, [READ_RECEIPTS_SAMPLE_RATE_ENV]: "1" } : env,
  });
}
