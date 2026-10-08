import {
  createReadBudgetGatedLiveRecordStore,
  resolveSharedReadBudgetGate,
  type ReadBudgetGate,
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
  /**
   * Runs a purpose-built read (custom SQL on `client`) under the same rules as
   * `store` reads: the read-budget gate is checked on every logical call, then
   * identical in-flight reads share one statement; writes through `store`
   * evict in-flight reads. Failures are never cached.
   */
  customRead: LiveRecordCustomRead;
  store: LiveRecordStoreLike<TPayload>;
  workspaceId: string;
}

/** `key` must identify the read completely (operation and every parameter). */
export type LiveRecordCustomRead = <TValue>(input: {
  collectionName: string;
  key: string;
  read: () => Promise<TValue>;
}) => Promise<TValue>;

export interface InflightReadDeduper {
  clear(): void;
  once<TValue>(key: string, read: () => TValue | Promise<TValue>): Promise<TValue>;
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
  customRead: LiveRecordCustomRead;
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

/** Process-local in-flight read sharing; a settled read (success or failure) is dropped. */
export function createInflightReadDeduper(): InflightReadDeduper {
  const inflightReads = new Map<string, Promise<unknown>>();

  return {
    clear() {
      inflightReads.clear();
    },
    once<TValue>(key: string, read: () => TValue | Promise<TValue>) {
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
    },
  };
}

/**
 * Same wrapping order as the configured store: the gate is checked per
 * logical call (before dedupe, before any SQL), then identical reads share.
 */
export function createGatedDedupedCustomRead(
  deduper: InflightReadDeduper,
  gate: ReadBudgetGate | null,
): LiveRecordCustomRead {
  return ({ collectionName, key, read }) => {
    gate?.assertAllowed({ collectionName });
    return deduper.once(`customRead\u0000${key}`, read);
  };
}

function createReadDedupedLiveRecordStore<
  TPayload extends Record<string, unknown>,
>(
  store: LiveRecordStoreLike<TPayload>,
  deduper: InflightReadDeduper = createInflightReadDeduper(),
): LiveRecordStoreLike<TPayload> {
  const once = deduper.once;
  const insertRecordIfAbsent = store.insertRecordIfAbsent?.bind(store);

  return {
    ...(store.updateRecordIfCurrent ? {
      async updateRecordIfCurrent(record, expected) {
        deduper.clear();
        try {
          return await store.updateRecordIfCurrent!(record, expected);
        } finally {
          deduper.clear();
        }
      },
    } satisfies Pick<LiveRecordStoreLike<TPayload>, "updateRecordIfCurrent"> : {}),
    ...(insertRecordIfAbsent ? {
      async insertRecordIfAbsent(record) {
        deduper.clear();
        try {
          return await insertRecordIfAbsent(record);
        } finally {
          // Reads started while the insert was in flight must not be reused
          // after completion, including a conflict or uncertain write failure.
          deduper.clear();
        }
      },
    } satisfies Pick<LiveRecordStoreLike<TPayload>, "insertRecordIfAbsent"> : {}),
    ...(store.reassignRecordOwner ? {
      async reassignRecordOwner(input) {
        deduper.clear();
        try {
          return await store.reassignRecordOwner!(input);
        } finally {
          deduper.clear();
        }
      },
    } satisfies Pick<LiveRecordStoreLike<TPayload>, "reassignRecordOwner"> : {}),
    async deleteRecord(input) {
      deduper.clear();
      try {
        return await store.deleteRecord(input);
      } finally {
        deduper.clear();
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
      deduper.clear();
      try {
        return await store.upsertRecord(record);
      } finally {
        deduper.clear();
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
  const gate = resolveSharedReadBudgetGate(env);
  const deduper = createInflightReadDeduper();
  const store = createReadBudgetGatedLiveRecordStore(
    createReadDedupedLiveRecordStore(
      createPostgresLiveRecordStore<Record<string, unknown>>({
        client,
      }),
      deduper,
    ),
    gate,
  );
  const configuredStore = {
    client,
    customRead: createGatedDedupedCustomRead(deduper, gate),
    store,
    workspaceId: config.workspaceId,
  };

  cachedStores.set(cacheKey, configuredStore);

  return configuredStore as ConfiguredPostgresLiveRecordStore<TPayload>;
}
