import {
  createReadBudgetGatedLiveRecordStore,
  resolveSharedReadBudgetGate,
} from "../../features/sync/read-budget-gate";
import { poolTimeoutOptions, resolveDatabaseRuntimeProfile } from "./database-runtime-profile";
import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "./live-database-config";
import { configuredReadMetrics } from "./transactional-postgres";
import type {
  LiveRecordGetQuery,
  LiveRecordListQuery,
  LiveRecordStoreLike,
} from "./live-record-store";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
  type ClosableLiveRecordSqlClient,
  type PgLiveRecordSqlClientOptions,
} from "./postgres-live-record-store";

export interface ConfiguredPostgresLiveRecordStore<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
> {
  client: ClosableLiveRecordSqlClient;
  store: LiveRecordStoreLike<TPayload>;
  workspaceId: string;
}

export interface CreateConfiguredPostgresLiveRecordStoreOptions {
  createClient?: (
    options: PgLiveRecordSqlClientOptions,
  ) => ClosableLiveRecordSqlClient;
  env?: LiveDatabaseEnv;
  max?: number;
}

interface CachedConfiguredPostgresLiveRecordStore {
  client: ClosableLiveRecordSqlClient;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

const cachedStores = new Map<string, CachedConfiguredPostgresLiveRecordStore>();

function normalizeReadQuery(
  query: LiveRecordGetQuery | LiveRecordListQuery,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(query)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => [
        key,
        Array.isArray(value) ? [...value].sort() : value,
      ]),
  );
}

function createReadDedupeKey(
  operation: "getRecord" | "listRecords",
  query: LiveRecordGetQuery | LiveRecordListQuery,
): string {
  return `${operation}\u0000${JSON.stringify(normalizeReadQuery(query))}`;
}

function createReadDedupedLiveRecordStore<
  TPayload extends Record<string, unknown>,
>(store: LiveRecordStoreLike<TPayload>): LiveRecordStoreLike<TPayload> {
  const inflightReads = new Map<string, Promise<unknown>>();
  const insertRecordIfAbsent = store.insertRecordIfAbsent?.bind(store);

  function once<TValue>(key: string, read: () => TValue | Promise<TValue>) {
    const existingRead = inflightReads.get(key) as Promise<TValue> | undefined;

    if (existingRead) {
      return existingRead;
    }

    const nextRead = Promise.resolve()
      .then(read)
      .finally(() => {
        if (inflightReads.get(key) === nextRead) inflightReads.delete(key);
      });

    inflightReads.set(key, nextRead);

    return nextRead;
  }

  return {
    ...(store.updateRecordIfCurrent ? {
      async updateRecordIfCurrent(record, expected) {
        inflightReads.clear();
        try {
          return await store.updateRecordIfCurrent!(record, expected);
        } finally {
          inflightReads.clear();
        }
      },
    } satisfies Pick<LiveRecordStoreLike<TPayload>, "updateRecordIfCurrent"> : {}),
    ...(insertRecordIfAbsent ? {
      async insertRecordIfAbsent(record) {
        inflightReads.clear();
        try {
          return await insertRecordIfAbsent(record);
        } finally {
          // Reads started while the insert was in flight must not be reused
          // after completion, including a conflict or uncertain write failure.
          inflightReads.clear();
        }
      },
    } satisfies Pick<LiveRecordStoreLike<TPayload>, "insertRecordIfAbsent"> : {}),
    async deleteRecord(input) {
      inflightReads.clear();
      try {
        return await store.deleteRecord(input);
      } finally {
        inflightReads.clear();
      }
    },
    getRecord(query) {
      return once(createReadDedupeKey("getRecord", query), () =>
        store.getRecord(query),
      );
    },
    listRecords(query) {
      return once(createReadDedupeKey("listRecords", query), () =>
        store.listRecords(query),
      );
    },
    async upsertRecord(record) {
      inflightReads.clear();
      try {
        return await store.upsertRecord(record);
      } finally {
        inflightReads.clear();
      }
    },
  };
}

export function createConfiguredPostgresLiveRecordStore<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
>({
  createClient = createPgLiveRecordSqlClient,
  env,
  max,
}: CreateConfiguredPostgresLiveRecordStoreOptions = {}): ConfiguredPostgresLiveRecordStore<TPayload> | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  // Pool width and timeouts follow the runtime (serverless / worker / local), not a global constant.
  const profile = resolveDatabaseRuntimeProfile(env);
  const poolMax = max ?? profile.poolMax;
  const cacheKey = `${config.connectionString}\u0000${config.workspaceId}\u0000${poolMax}`;
  const cachedStore = cachedStores.get(cacheKey);

  if (cachedStore) {
    return cachedStore as ConfiguredPostgresLiveRecordStore<TPayload>;
  }

  const client = createClient({
    connectionString: config.connectionString,
    max: poolMax,
    timeouts: poolTimeoutOptions(profile),
    readMetrics: configuredReadMetrics(env),
  });
  // Reads pass the process read-budget gate (absent unless configured); writes never do.
  const store = createReadBudgetGatedLiveRecordStore(
    createReadDedupedLiveRecordStore(
      createPostgresLiveRecordStore<Record<string, unknown>>({
        client,
      }),
    ),
    resolveSharedReadBudgetGate(env),
  );
  const configuredStore = {
    client,
    store,
    workspaceId: config.workspaceId,
  };

  cachedStores.set(cacheKey, configuredStore);

  return configuredStore as ConfiguredPostgresLiveRecordStore<TPayload>;
}
