import { createConfiguredTransactionalPostgresRuntime } from "../storage/transactional-postgres";
import { installNextReadReceipts } from "./read-receipts-next";
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
  const sink = createReadReceiptSink({
    write: createPostgresReadReceiptWriter(() => createConfiguredTransactionalPostgresRuntime({ env })?.client ?? null),
    axiom: axiomConfigFromEnv(env),
  });
  return installNextReadReceipts({ sink, env });
}
