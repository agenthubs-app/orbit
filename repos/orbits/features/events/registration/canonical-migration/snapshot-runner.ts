import {
  createEventOperationsPostgresClient,
  type EventOperationsSqlExecutor,
  type EventOperationsTransactionIsolation,
} from "../../event-operations/storage/postgres-client";

const canonicalMigrationSnapshotBrand: unique symbol = Symbol(
  "canonical-membership-migration-snapshot",
);
const trustedCanonicalMigrationSnapshots = new WeakSet<object>();

export interface CanonicalMembershipMigrationSnapshot {
  readonly [canonicalMigrationSnapshotBrand]: true;
  readonly executor: EventOperationsSqlExecutor;
}

function snapshot(executor: EventOperationsSqlExecutor): CanonicalMembershipMigrationSnapshot {
  let value: CanonicalMembershipMigrationSnapshot;
  const guardedExecutor: EventOperationsSqlExecutor = Object.freeze({
    async query<TRow = Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ) {
      if (!trustedCanonicalMigrationSnapshots.has(value)) {
        throw new Error("Canonical migration database snapshot is no longer active.");
      }
      const result = await executor.query<TRow>(text, values);
      if (!trustedCanonicalMigrationSnapshots.has(value)) {
        throw new Error("Canonical migration database snapshot is no longer active.");
      }
      return result;
    },
  });
  value = Object.freeze({
    [canonicalMigrationSnapshotBrand]: true as const,
    executor: guardedExecutor,
  });
  trustedCanonicalMigrationSnapshots.add(value);
  return value;
}

const INPUT_KEYS = ["connectionString", "isolation", "operation"] as const;

function runnerInput<TValue>(value: unknown): {
  connectionString: string;
  isolation: Extract<
    EventOperationsTransactionIsolation,
    "repeatable read" | "serializable"
  >;
  operation: (
    value: CanonicalMembershipMigrationSnapshot,
  ) => Promise<TValue>;
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Canonical migration snapshot runner input is invalid.");
  }
  const prototype = Object.getPrototypeOf(value);
  const record = value as Record<string, unknown>;
  const keys = Reflect.ownKeys(record);
  const connectionString = record.connectionString;
  const isolation = record.isolation;
  const operation = record.operation;
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    !keys.every(
      (key) =>
        typeof key === "string" &&
        INPUT_KEYS.includes(key as (typeof INPUT_KEYS)[number]),
    ) ||
    keys.length !== (Object.hasOwn(record, "isolation") ? 3 : 2) ||
    !Object.hasOwn(record, "connectionString") ||
    !Object.hasOwn(record, "operation") ||
    typeof connectionString !== "string" ||
    connectionString.trim() !== connectionString ||
    connectionString.length === 0 ||
    typeof operation !== "function" ||
    (isolation !== undefined &&
      isolation !== "repeatable read" &&
      isolation !== "serializable")
  ) {
    throw new TypeError("Canonical migration snapshot runner input is invalid.");
  }
  return {
    connectionString,
    isolation: isolation === "serializable" ? "serializable" : "repeatable read",
    operation: operation as (
      value: CanonicalMembershipMigrationSnapshot,
    ) => Promise<TValue>,
  };
}

export function isCanonicalMembershipMigrationSnapshot(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    trustedCanonicalMigrationSnapshots.has(value) &&
    Object.isFrozen(value)
  );
}

export async function withCanonicalMembershipMigrationSnapshot<TValue>(input: {
  connectionString: string;
  isolation?: Extract<
    EventOperationsTransactionIsolation,
    "repeatable read" | "serializable"
  >;
  operation: (
    value: CanonicalMembershipMigrationSnapshot,
  ) => Promise<TValue>;
}): Promise<TValue> {
  const parsed = runnerInput<TValue>(input);
  const client = createEventOperationsPostgresClient({
    connectionString: parsed.connectionString,
  });
  try {
    return await client.transaction(
      async (executor) => {
        const value = snapshot(executor);
        try {
          return await parsed.operation(value);
        } finally {
          trustedCanonicalMigrationSnapshots.delete(value);
        }
      },
      { isolation: parsed.isolation },
    );
  } finally {
    await client.close();
  }
}
