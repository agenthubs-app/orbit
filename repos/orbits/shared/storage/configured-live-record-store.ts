import {
  resolveLiveDatabaseConnectionConfig,
  type LiveDatabaseEnv,
} from "./live-database-config";
import type { LiveRecordStoreLike } from "./live-record-store";
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
const DEFAULT_POOL_MAX = 4;

export function createConfiguredPostgresLiveRecordStore<
  TPayload extends Record<string, unknown> = Record<string, unknown>,
>({
  createClient = createPgLiveRecordSqlClient,
  env,
  max = DEFAULT_POOL_MAX,
}: CreateConfiguredPostgresLiveRecordStoreOptions = {}): ConfiguredPostgresLiveRecordStore<TPayload> | null {
  const config = resolveLiveDatabaseConnectionConfig(env);

  if (!config) {
    return null;
  }

  const cacheKey = `${config.connectionString}\u0000${config.workspaceId}\u0000${max}`;
  const cachedStore = cachedStores.get(cacheKey);

  if (cachedStore) {
    return cachedStore as ConfiguredPostgresLiveRecordStore<TPayload>;
  }

  const client = createClient({
    connectionString: config.connectionString,
    max,
  });
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({
    client,
  });
  const configuredStore = {
    client,
    store,
    workspaceId: config.workspaceId,
  };

  cachedStores.set(cacheKey, configuredStore);

  return configuredStore as ConfiguredPostgresLiveRecordStore<TPayload>;
}
