import type {
  EventOperationsPostgresClient,
  EventOperationsSqlExecutor,
  EventOperationsTransactionIsolation,
} from "../../event-operations/storage/postgres-client";

const canonicalMigrationSnapshotBrand: unique symbol = Symbol(
  "canonical-membership-migration-snapshot",
);

export interface CanonicalMembershipMigrationSnapshot {
  readonly [canonicalMigrationSnapshotBrand]: true;
  readonly executor: EventOperationsSqlExecutor;
}

function snapshot(executor: EventOperationsSqlExecutor): CanonicalMembershipMigrationSnapshot {
  return Object.freeze({
    [canonicalMigrationSnapshotBrand]: true as const,
    executor,
  });
}

export async function withCanonicalMembershipMigrationSnapshot<TValue>(input: {
  client: EventOperationsPostgresClient;
  isolation?: Extract<
    EventOperationsTransactionIsolation,
    "repeatable read" | "serializable"
  >;
  operation: (
    value: CanonicalMembershipMigrationSnapshot,
  ) => Promise<TValue>;
}): Promise<TValue> {
  return input.client.transaction(
    (executor) => input.operation(snapshot(executor)),
    { isolation: input.isolation ?? "repeatable read" },
  );
}
