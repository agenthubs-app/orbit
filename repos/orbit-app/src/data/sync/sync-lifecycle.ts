import { Platform } from "react-native";
import { normalizeOrbitApiBaseUrl } from "../../api/base-url";
import { initializeLocalSyncDatabase, type LocalSyncDatabase, type LocalSyncSqlValue } from "./local-sync-database";
import {
  deleteSyncDatabaseKey,
  clearPendingSyncCleanup,
  loadSyncDatabaseKey,
  persistPendingSyncCleanup,
  readPendingSyncCleanup,
  syncScopeDigest,
  type SyncKeyDependencies,
  type SyncSessionScope,
} from "./sync-database-key";
import { archivePendingWrites, countPendingWritesInVault, isPendingWritesVaultExpired, restorePendingWrites } from "./pending-write-vault";

interface NativeSyncDependencies extends SyncKeyDependencies {
  sqlite: Pick<typeof import("expo-sqlite"), "openDatabaseAsync" | "deleteDatabaseAsync"> & {
    /** Names of the files in the SQLite directory; used to find other identities' mirrors (sprint 0113). */
    listDatabaseNames?: () => Promise<readonly string[]>;
  };
}

const IDENTITY_DATABASE = /^orbit-sync-([a-f0-9]{64})\.db$/u;
const PENDING_VAULT = /^orbit-pending-vault-([a-f0-9]{64})\.db$/u;

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
  return normalizeOrbitApiBaseUrl(left.baseUrl) === normalizeOrbitApiBaseUrl(right.baseUrl) && left.actorId === right.actorId;
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
  let cleanupRecovered = false;
  let pendingVaultsScanned = false;
  let readyToken = -1;
  // Between suspendScope and the next setScope no read or write reaches the kept database (0130).
  let suspended = false;

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }

  async function withPendingVault<T>(digest: string, operation: (database: LocalSyncDatabase) => Promise<T>): Promise<T> {
    if (!native) throw new Error("PENDING_VAULT_NATIVE_UNAVAILABLE");
    const keyName = `orbit.pending-vault.key.${digest}`;
    const keyOptions = { keychainAccessible: native.secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };
    let key = await native.secureStore.getItemAsync(keyName, keyOptions);
    if (key === null) {
      const existing = (await native.sqlite.listDatabaseNames?.() ?? []).includes(`orbit-pending-vault-${digest}.db`);
      if (existing) throw new Error("PENDING_VAULT_KEY_MISSING");
      const bytes = await native.crypto.getRandomBytesAsync(32);
      if (bytes.length !== 32) throw new Error("PENDING_VAULT_KEY_INVALID");
      key = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
      await native.secureStore.setItemAsync(keyName, key, keyOptions);
    }
    if (!/^[a-f0-9]{64}$/u.test(key)) throw new Error("PENDING_VAULT_KEY_INVALID");
    const name = `orbit-pending-vault-${digest}.db`;
    const handle = await native.sqlite.openDatabaseAsync(name, { useNewConnection: true });
    try {
      await handle.execAsync(`PRAGMA key = "x'${key}'";`);
      const cipher = await handle.getFirstAsync<{ cipher_version: string }>("PRAGMA cipher_version");
      if (!cipher?.cipher_version) throw new Error("PENDING_VAULT_CIPHER_UNAVAILABLE");
      return await operation(adaptDatabase(handle));
    } finally {
      await handle.closeAsync();
    }
  }

  async function archiveCurrentWrites(database: LocalSyncDatabase, digest: string): Promise<void> {
    const pending = await database.get<{ mutations: number; aliases: number }>(`SELECT
      (SELECT COUNT(*) FROM sync_outbox) AS mutations,
      (SELECT COUNT(*) FROM sync_aliases) AS aliases`);
    if (!pending || (pending.mutations === 0 && pending.aliases === 0)) return;
    await withPendingVault(digest, vault => archivePendingWrites({
      source: database,
      vault,
      identityDigest: digest,
      now: new Date().toISOString(),
      hash: value => native!.crypto.digestStringAsync(native!.crypto.CryptoDigestAlgorithm.SHA256, value),
    }));
  }

  async function restoreCurrentWrites(database: LocalSyncDatabase, digest: string): Promise<void> {
    if (!native) return;
    const key = await native.secureStore.getItemAsync(`orbit.pending-vault.key.${digest}`, {
      keychainAccessible: native.secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    const name = `orbit-pending-vault-${digest}.db`;
    const exists = (await native.sqlite.listDatabaseNames?.() ?? []).includes(name);
    if (key === null && !exists) return;
    if (key === null || !/^[a-f0-9]{64}$/u.test(key)) throw new Error("PENDING_VAULT_KEY_MISSING");
    const restored = await withPendingVault(digest, vault => restorePendingWrites({
      source: database,
      vault,
      identityDigest: digest,
      now: new Date().toISOString(),
      hash: value => native!.crypto.digestStringAsync(native!.crypto.CryptoDigestAlgorithm.SHA256, value),
    }));
    if (restored.status === "restored" || restored.status === "expired" || restored.status === "empty") {
      await deletePendingVault(digest);
    }
  }

  async function archiveStoredIdentity(digest: string): Promise<void> {
    if (!native) return;
    const sourceKey = await native.secureStore.getItemAsync(`orbit.sync.key.${digest}`, {
      keychainAccessible: native.secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    const names = await native.sqlite.listDatabaseNames?.() ?? [];
    if (!names.includes(`orbit-sync-${digest}.db`)) return;
    // A file left behind after its SecureStore key was deleted is already cryptographically erased.
    if (!sourceKey) return;
    if (!/^[a-f0-9]{64}$/u.test(sourceKey)) throw new Error("PENDING_VAULT_SOURCE_KEY_INVALID");
    const handle = await native.sqlite.openDatabaseAsync(`orbit-sync-${digest}.db`, { useNewConnection: true });
    try {
      await handle.execAsync(`PRAGMA key = "x'${sourceKey}'";`);
      const cipher = await handle.getFirstAsync<{ cipher_version: string }>("PRAGMA cipher_version");
      if (!cipher?.cipher_version) throw new Error("PENDING_VAULT_SOURCE_CIPHER_UNAVAILABLE");
      const database = adaptDatabase(handle);
      await initializeLocalSyncDatabase(database);
      await archiveCurrentWrites(database, digest);
    } finally {
      await handle.closeAsync();
    }
  }

  async function deletePendingVault(digest: string): Promise<void> {
    if (!native) return;
    await native.secureStore.deleteItemAsync(`orbit.pending-vault.key.${digest}`, {
      keychainAccessible: native.secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    if ((await native.sqlite.listDatabaseNames?.() ?? []).includes(`orbit-pending-vault-${digest}.db`)) {
      await native.sqlite.deleteDatabaseAsync(`orbit-pending-vault-${digest}.db`);
    }
  }

  async function expireOldPendingVaults(): Promise<void> {
    if (!native?.sqlite.listDatabaseNames) return;
    for (const name of await native.sqlite.listDatabaseNames()) {
      const digest = PENDING_VAULT.exec(name)?.[1];
      if (!digest) continue;
      const key = await native.secureStore.getItemAsync(`orbit.pending-vault.key.${digest}`, {
        keychainAccessible: native.secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      if (!key) throw new Error("PENDING_VAULT_KEY_MISSING");
      const expired = await withPendingVault(digest, vault => isPendingWritesVaultExpired({
        vault,
        identityDigest: digest,
        now: new Date().toISOString(),
      }));
      if (expired) await deletePendingVault(digest);
    }
  }

  async function pendingWriteSummary(scope?: SyncSessionScope): Promise<{ currentAccount: number; otherAccounts: number } | null> {
    if (input.platform === "web") return { currentAccount: 0, otherAccounts: 0 };
    return enqueue(async () => {
      if (!(await prepare()) || !native) return null;
      const wantedDigest = scope ? await syncScopeDigest(scope, native) : null;
      const summary = { currentAccount: 0, otherAccounts: 0 };
      if (current?.database) {
        const row = await current.database.get<{ count: number }>("SELECT COUNT(*) AS count FROM sync_outbox");
        const key = wantedDigest !== null && current.digest === wantedDigest ? "currentAccount" : "otherAccounts";
        summary[key] += Number(row?.count ?? 0);
      }
      const names = await native.sqlite.listDatabaseNames?.() ?? [];
      for (const name of names) {
        const digest = PENDING_VAULT.exec(name)?.[1];
        if (!digest) continue;
        const keyName = `orbit.pending-vault.key.${digest}`;
        const key = await native.secureStore.getItemAsync(keyName, {
          keychainAccessible: native.secureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        });
        if (!key || !/^[a-f0-9]{64}$/u.test(key)) return null;
        const count = await withPendingVault(digest, vault => countPendingWritesInVault({
          vault,
          identityDigest: digest,
          now: new Date().toISOString(),
          hash: value => native!.crypto.digestStringAsync(native!.crypto.CryptoDigestAlgorithm.SHA256, value),
        }));
        const bucket = wantedDigest !== null && digest === wantedDigest ? "currentAccount" : "otherAccounts";
        summary[bucket] += count;
      }
      return summary;
    });
  }

  async function finishPendingCleanup(digest: string): Promise<boolean> {
    if (!native) return false;
    try {
      await deleteSyncDatabaseKey(digest, native);
    } catch {
      input.report("SYNC_KEY_DELETE_FAILED", digest);
      return false;
    }
    try {
      await native.sqlite.deleteDatabaseAsync(`orbit-sync-${digest}.db`);
    } catch {
      input.report("SYNC_FILE_DELETE_FAILED", digest);
    }
    try {
      await clearPendingSyncCleanup(native);
    } catch {
      input.report("SYNC_CLEANUP_STATE_FAILED", digest);
      return false;
    }
    return true;
  }

  /**
   * One identity per device (sprint 0113; the browser has done this since
   * 0125): opening a scope erases every other identity's database and key,
   * including ones this process never opened (a session that ended by expiry,
   * a killed process, an older build). Each erasure persists its intent first,
   * exactly like purge, so a crash mid-way is finished by the next process
   * before it accepts any identity. A failed erasure refuses the new identity.
   */
  async function eraseOtherIdentities(keep: string): Promise<boolean> {
    if (!native?.sqlite.listDatabaseNames) return true;
    let names: readonly string[];
    try {
      names = await native.sqlite.listDatabaseNames();
    } catch {
      // Enumeration is best effort; the open identity is still isolated by its own key.
      input.report("SYNC_IDENTITY_SCAN_FAILED", keep);
      return true;
    }
    const others = new Set(names.map(name => IDENTITY_DATABASE.exec(name)?.[1]).filter((digest): digest is string => Boolean(digest) && digest !== keep));
    for (const digest of others) {
      try {
        await archiveStoredIdentity(digest);
      } catch {
        input.report("PENDING_VAULT_WRITE_FAILED", digest);
        return false;
      }
      try {
        await persistPendingSyncCleanup(digest, native);
      } catch {
        input.report("SYNC_CLEANUP_STATE_FAILED", digest);
        return false;
      }
      if (!(await finishPendingCleanup(digest))) return false;
    }
    return true;
  }

  async function purge(): Promise<boolean> {
    if (!current || !native) return true;
    if (current.database) {
      try {
        await archiveCurrentWrites(current.database, current.digest);
      } catch {
        input.report("PENDING_VAULT_WRITE_FAILED", current.digest);
        return false;
      }
    }
    current.database = null;
    current.blocked = true;
    try {
      // Persist intent before closing/deleting: a restarted process must finish
      // crypto erasure before it can accept any other identity.
      await persistPendingSyncCleanup(current.digest, native);
    } catch {
      input.report("SYNC_CLEANUP_STATE_FAILED", current.digest);
      return false;
    }
    if (current.handle) {
      try {
        await current.handle.closeAsync();
        current.handle = null;
      } catch {
        input.report("SYNC_CLOSE_FAILED", current.digest);
        return false;
      }
    }
    if (!(await finishPendingCleanup(current.digest))) return false;
    current = null;
    return true;
  }

  /** Loads the native modules and finishes a crash-interrupted erasure before any transition. */
  async function prepare(): Promise<boolean> {
    try {
      native ??= await input.loadNative();
    } catch {
      input.report("SYNC_CLEANUP_STATE_FAILED");
      return false;
    }
    if (!cleanupRecovered) {
      try {
        const pending = await readPendingSyncCleanup(native);
        if (pending && !(await finishPendingCleanup(pending))) return false;
        cleanupRecovered = true;
      } catch {
        // An unreadable marker cannot be treated as proof of no pending key.
        input.report("SYNC_CLEANUP_STATE_FAILED");
        return false;
      }
    }
    return true;
  }

  return {
    pendingWriteSummary,
    // setScope accepts an identity transition; only this reports initialized storage.
    isScopeReadable(scope: SyncSessionScope | null): boolean {
      return input.platform !== "web" && readyToken === token && Boolean(scope && current?.database && !current.blocked &&
        sameScope(current.scope, scope) && (scope.workspaceId === undefined || scope.workspaceId === current.scope.workspaceId));
    },
    /**
     * The session is being re-validated against `baseUrl` (sprint 0130). Reads pause (queued and
     * later reads return null) until setScope confirms an identity; nothing is deleted. An open
     * scope of another server is purged here: a server change never keeps the old mirror. After
     * this, setScope(same identity) resumes the kept database, setScope(other identity) or
     * setScope(null) purges it.
     */
    suspendScope(baseUrl: string): Promise<boolean> {
      const normalized = normalizeOrbitApiBaseUrl(baseUrl);
      ++token;
      return enqueue(async () => {
        if (input.platform === "web") return true;
        if (!(await prepare())) return false;
        suspended = true;
        if (current && (current.blocked || normalizeOrbitApiBaseUrl(current.scope.baseUrl) !== normalized)) {
          return purge();
        }
        return true;
      });
    },
    setScope(scope: SyncSessionScope | null): Promise<boolean> {
      scope = scope ? { ...scope, baseUrl: normalizeOrbitApiBaseUrl(scope.baseUrl) } : null;
      const requestToken = ++token;
      return enqueue(async () => {
        if (input.platform === "web") return true;
        if (!(await prepare()) || !native) return false;
        const loaded = native;
        suspended = false;
        // Purge an old scope even if a newer request superseded this request.
        if (current && (current.blocked || !scope || !sameScope(current.scope, scope))) {
          if (!(await purge())) return false;
        }
        if (requestToken !== token) return false;
        try {
          if (!legacyRemoved) {
            // The old implementation no longer opens or owns a plaintext handle.
            await loaded.sqlite.deleteDatabaseAsync("orbit-cache.db");
            legacyRemoved = true;
          }
          if (!pendingVaultsScanned) {
            try {
              await expireOldPendingVaults();
              pendingVaultsScanned = true;
            } catch {
              input.report("PENDING_VAULT_EXPIRY_CHECK_FAILED");
              return false;
            }
          }
          if (!scope) return true;
          if (current) {
            current.scope = scope;
            if (current.database) readyToken = requestToken;
            return true;
          }
          const digest = await syncScopeDigest(scope, loaded);
          if (!(await eraseOtherIdentities(digest))) return false;
          current = { scope, digest, name: `orbit-sync-${digest}.db`, handle: null, database: null, blocked: false };
          const key = await loadSyncDatabaseKey(digest, loaded, () => loaded.sqlite.deleteDatabaseAsync(current!.name));
          current.handle = await loaded.sqlite.openDatabaseAsync(current.name, { useNewConnection: true });
          await current.handle.execAsync(`PRAGMA key = "x'${key}'";`);
          const cipher = await current.handle.getFirstAsync<{ cipher_version: string }>("PRAGMA cipher_version");
          if (!cipher?.cipher_version) throw new Error("SYNC_CIPHER_UNAVAILABLE");
          const database = adaptDatabase(current.handle);
          await initializeLocalSyncDatabase(database);
          await restoreCurrentWrites(database, digest);
          if (requestToken !== token) {
            await purge();
            return false;
          }
          current.database = database;
          readyToken = requestToken;
          return true;
        } catch {
          input.report("SYNC_INIT_FAILED", current?.digest);
          // Failure is not logout. Retain key and old schema/drafts/outbox for
          // recovery instead of converting a rolled-back migration into erasure.
          if (current) {
            current.database = null;
            try { await current.handle?.closeAsync(); current.handle = null; }
            catch { input.report("SYNC_CLOSE_FAILED", current.digest); return false; }
          }
          return true;
        }
      });
    },

    withDatabase<T>(scope: SyncSessionScope | null, operation: (database: LocalSyncDatabase, activeScope: Readonly<SyncSessionScope>) => Promise<T>): Promise<T | null> {
      const requestToken = token;
      return enqueue(async () => {
        if (requestToken !== token || suspended || !current?.database || current.blocked) return null;
        if (scope && (!sameScope(current.scope, scope) || (scope.workspaceId !== undefined && scope.workspaceId !== current.scope.workspaceId))) return null;
        try {
          const result = await operation(current.database, { ...current.scope });
          return requestToken === token ? result : null;
        } catch {
          input.report("SYNC_OPERATION_FAILED", current.digest);
          // A storage operation failure must not erase unrelated local evidence.
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

export async function listSyncDatabaseNames(
  sqlite: Pick<typeof import("expo-sqlite"), "defaultDatabaseDirectory">,
  Directory: new (...paths: string[]) => { exists: boolean; list(): { name: string }[] },
): Promise<string[]> {
  const directory = new Directory(sqlite.defaultDatabaseDirectory);
  return directory.exists ? directory.list().map(entry => entry.name) : [];
}

export const syncLifecycle = createSyncLifecycle({
  platform: Platform.OS,
  loadNative: async () => {
    // Cleanup state must remain readable even if the optional SQLite binary is
    // unavailable. Only inability to inspect device key state blocks identity.
    const [crypto, secureStore] = await Promise.all([
      import("expo-crypto"), import("expo-secure-store"),
    ]);
    try {
      const [sqlite, fileSystem] = await Promise.all([import("expo-sqlite"), import("expo-file-system")]);
      return {
        sqlite: {
          openDatabaseAsync: sqlite.openDatabaseAsync,
          deleteDatabaseAsync: (name: string) => deleteSyncDatabaseFiles(name, sqlite, fileSystem.File),
          listDatabaseNames: async () => listSyncDatabaseNames(sqlite, fileSystem.Directory),
        },
        crypto,
        secureStore,
      };
    } catch {
      const unavailable = async (): Promise<never> => { throw new Error("SYNC_NATIVE_UNAVAILABLE"); };
      return { crypto, secureStore, sqlite: { openDatabaseAsync: unavailable, deleteDatabaseAsync: unavailable } };
    }
  },
  report: (code, scopeHash) => console.warn(code, scopeHash?.slice(0, 16) ?? "unavailable"),
});
