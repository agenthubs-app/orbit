import { Platform } from "react-native";
import { initializeLocalSyncDatabase, type LocalSyncDatabase, type LocalSyncSqlValue } from "./local-sync-database";
import {
  deleteSyncDatabaseKey,
  loadSyncDatabaseKey,
  syncScopeDigest,
  type SyncKeyDependencies,
  type SyncSessionScope,
} from "./sync-database-key";

interface NativeSyncDependencies extends SyncKeyDependencies {
  sqlite: Pick<typeof import("expo-sqlite"), "openDatabaseAsync" | "deleteDatabaseAsync">;
}

type NativeDatabase = Awaited<ReturnType<NativeSyncDependencies["sqlite"]["openDatabaseAsync"]>>;
interface OpenScope {
  scope: SyncSessionScope;
  digest: string;
  name: string;
  handle: NativeDatabase | null;
  database: LocalSyncDatabase | null;
  blocked: boolean;
}

function sameScope(left: SyncSessionScope, right: SyncSessionScope): boolean {
  return left.baseUrl === right.baseUrl && left.actorId === right.actorId;
}

function nativeParameters(parameters: readonly LocalSyncSqlValue[]) {
  return parameters.map(value => {
    if (typeof value === "bigint") throw new Error("SYNC_BIND_UNSUPPORTED");
    return value;
  });
}

function adaptDatabase(handle: NativeDatabase): LocalSyncDatabase {
  return {
    execute: source => handle.execAsync(source),
    run: (source, parameters = []) => handle.runAsync(source, nativeParameters(parameters)),
    get: (source, parameters = []) => handle.getFirstAsync(source, nativeParameters(parameters)),
    all: (source, parameters = []) => handle.getAllAsync(source, nativeParameters(parameters)),
    // All access is serialized by the lifecycle. Use the already keyed handle:
    // Expo exclusive transactions open a second, initially unkeyed connection.
    async transaction(operation) {
      await handle.execAsync("BEGIN IMMEDIATE");
      try {
        const result = await operation();
        await handle.execAsync("COMMIT");
        return result;
      } catch (error) {
        await handle.execAsync("ROLLBACK");
        throw error;
      }
    },
  };
}

export function createSyncLifecycle(input: {
  platform: string;
  loadNative: () => Promise<NativeSyncDependencies>;
  report: (code: string, scopeHash?: string) => void;
}) {
  let native: NativeSyncDependencies | null = null;
  let current: OpenScope | null = null;
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let legacyRemoved = false;

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }

  async function purge(): Promise<boolean> {
    if (!current || !native) return true;
    current.database = null;
    current.blocked = true;
    if (current.handle) {
      try {
        await current.handle.closeAsync();
        current.handle = null;
      } catch {
        input.report("SYNC_CLOSE_FAILED", current.digest);
        return false;
      }
    }
    try {
      await deleteSyncDatabaseKey(current.digest, native);
    } catch {
      input.report("SYNC_KEY_DELETE_FAILED", current.digest);
      return false;
    }
    try {
      // Deleting the database also removes records, snapshots, outbox and cursors.
      await native.sqlite.deleteDatabaseAsync(current.name);
    } catch {
      input.report("SYNC_FILE_DELETE_FAILED", current.digest);
    }
    current = null;
    return true;
  }

  return {
    setScope(scope: SyncSessionScope | null): Promise<boolean> {
      const requestToken = ++token;
      return enqueue(async () => {
        if (input.platform === "web") return true;
        // Purge an old scope even if a newer request superseded this request.
        if (current && (current.blocked || !scope || !sameScope(current.scope, scope))) {
          if (!(await purge())) return false;
        }
        if (requestToken !== token) return false;
        try {
          native ??= await input.loadNative();
          if (!legacyRemoved) {
            // The old implementation no longer opens or owns a plaintext handle.
            await native.sqlite.deleteDatabaseAsync("orbit-cache.db");
            legacyRemoved = true;
          }
          if (!scope) return true;
          if (current) {
            current.scope = scope;
            return true;
          }
          const digest = await syncScopeDigest(scope, native);
          current = { scope, digest, name: `orbit-sync-${digest}.db`, handle: null, database: null, blocked: false };
          const key = await loadSyncDatabaseKey(digest, native, () => native!.sqlite.deleteDatabaseAsync(current!.name));
          current.handle = await native.sqlite.openDatabaseAsync(current.name, { useNewConnection: true });
          await current.handle.execAsync(`PRAGMA key = "x'${key}'";`);
          const cipher = await current.handle.getFirstAsync<{ cipher_version: string }>("PRAGMA cipher_version");
          if (!cipher?.cipher_version) throw new Error("SYNC_CIPHER_UNAVAILABLE");
          const database = adaptDatabase(current.handle);
          await initializeLocalSyncDatabase(database);
          if (requestToken !== token) {
            await purge();
            return false;
          }
          current.database = database;
          return true;
        } catch {
          input.report("SYNC_INIT_FAILED", current?.digest);
          const failed = current;
          if (!(await purge())) return false;
          // Avoid repeatedly reopening a corrupt/unavailable scope in this session.
          if (failed) current = { ...failed, handle: null, database: null, blocked: false };
          return true;
        }
      });
    },

    withDatabase<T>(scope: SyncSessionScope | null, operation: (database: LocalSyncDatabase) => Promise<T>): Promise<T | null> {
      const requestToken = token;
      return enqueue(async () => {
        if (requestToken !== token || !current?.database || current.blocked) return null;
        if (scope && (!sameScope(current.scope, scope) || (scope.workspaceId !== undefined && scope.workspaceId !== current.scope.workspaceId))) return null;
        try {
          const result = await operation(current.database);
          return requestToken === token ? result : null;
        } catch {
          input.report("SYNC_OPERATION_FAILED", current.digest);
          await purge();
          return null;
        }
      });
    },
  };
}

export async function deleteSyncDatabaseFiles(
  name: string,
  sqlite: Pick<typeof import("expo-sqlite"), "defaultDatabaseDirectory" | "deleteDatabaseAsync">,
  File: new (...paths: string[]) => { exists: boolean; delete(): void },
): Promise<void> {
  if (new File(sqlite.defaultDatabaseDirectory, name).exists) {
    await sqlite.deleteDatabaseAsync(name);
  }
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    const file = new File(sqlite.defaultDatabaseDirectory, `${name}${suffix}`);
    if (file.exists) file.delete();
  }
}

export const syncLifecycle = createSyncLifecycle({
  platform: Platform.OS,
  loadNative: async () => {
    const [sqlite, crypto, secureStore, fileSystem] = await Promise.all([
      import("expo-sqlite"), import("expo-crypto"), import("expo-secure-store"), import("expo-file-system"),
    ]);
    return {
      sqlite: {
        openDatabaseAsync: sqlite.openDatabaseAsync,
        deleteDatabaseAsync: name => deleteSyncDatabaseFiles(name, sqlite, fileSystem.File),
      },
      crypto,
      secureStore,
    };
  },
  report: (code, scopeHash) => console.warn(code, scopeHash?.slice(0, 16) ?? "unavailable"),
});
