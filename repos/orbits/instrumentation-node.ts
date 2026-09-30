/**
 * Node.js-only part of the server start hook: installs request read receipts
 * (monitoring O1). Kept in its own module so the edge bundle never imports pg.
 */
import { installConfiguredReadReceipts } from "./shared/observability/read-receipts-configured";

try {
  installConfiguredReadReceipts();
} catch (error) {
  console.warn(JSON.stringify({ event: "read_receipts_install_failed", error: error instanceof Error ? error.name : "Error" }));
}
