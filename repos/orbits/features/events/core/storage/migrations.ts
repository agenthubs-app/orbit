import { runEventOperationsMigrations } from "../../event-operations/storage/migrations";
import type { EventOperationsMigrationClient } from "../../event-operations/storage/migrations";

/**
 * Event Core is an additive v8 extension of the existing event-operations
 * schema. Running the complete chain is what makes upgrades from every old
 * supported schema safe and checksum-verifiable.
 */
export async function runEventCoreMigrations(
  client: EventOperationsMigrationClient,
): Promise<void> {
  await runEventOperationsMigrations(client);
}
