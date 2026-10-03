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

interface NativeSyncDependencies extends SyncKeyDependencies {
  sqlite: Pick<typeof import("expo-sqlite"), "openDatabaseAsync" | "deleteDatabaseAsync"> & {
    /** Names of the files in the SQLite directory; used to find other identities' mirrors (sprint 0113). */
    listDatabaseNames?: () => Promise<readonly string[]>;
  };
}

const IDENTITY_DATABASE = /^orbit-sync-([a-f0-9]{64})\.db$/u;

/** Why a storage step refused, without key names, digests or payloads (sprint 0137). */
export interface SyncFailureDetail {
  stage: string;
  name: string;
  code: string | null;
  message: string;
}

// Messages that are fixed strings from this module, expo-modules-core or expo-secure-store's
// KeyChainException and can never contain a key name, digest or stored value.
const SAFE_MESSAGES = [
  /^SYNC_[A-Z_]+$/u,
  /^Cannot find native module '[A-Za-z0-9_]+'$/u,
  /^The method or property [A-Za-z0-9_.]+ is not available on [a-z]+/u,
  /^(Invalid key|I\/O error\.|User interaction is not allowed\.|Unknown Keychain Error\.|Unable to decode the provided data\.|No keychain is available\. You may need to restart your computer\.|One or more parameters passed to a function where not valid\.|Bad parameter or invalid state for operation\.|A required entitlement isn't present\.)$/u,
];

export function describeSyncFailure(stage: string, error: unknown): SyncFailureDetail {
  const record = typeof error === "object" && error !== null ? error as { name?: unknown; code?: unknown; message?: unknown } : {};
  const name = typeof record.name === "string" && /^[A-Za-z0-9_]{1,64}$/u.test(record.name) ? record.name : typeof error;
  const code = typeof record.code === "string" && /^[A-Za-z0-9_:.-]{1,64}$/u.test(record.code) ? record.code : null;
  const raw = typeof record.message === "string" ? record.message : "";
  // Expo wraps native failures as "Calling the '…' function has failed\n→ Caused by: <reason>".
  const reason = raw.split(/Caused by: /u).pop()?.trim() ?? "";
  const message = [raw, reason].find(candidate => SAFE_MESSAGES.some(pattern => pattern.test(candidate))) ?? "[redacted]";
  return { stage, name, code, message };
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
  report: (code: string, scopeHash?: string, detail?: SyncFailureDetail) => void;
}) {
  let native: NativeSyncDependencies | null = null;
  let current: OpenScope | null = null;
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let legacyRemoved = false;
  let cleanupRecovered = false;
  // A marker that is not a digest names no key to erase; it is retired by the next
  // complete erasure of every other identity (0137), instead of blocking sign-in forever.
  let malformedMarker = false;
  let readyToken = -1;
  // Between suspendScope and the next setScope no read or write reaches the kept database (0130).
  let suspended = false;

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }

  async function finishPendingCleanup(digest: string): Promise<boolean> {
    if (!native) return false;
    try {
      await deleteSyncDatabaseKey(digest, native);
    } catch (error) {
      input.report("SYNC_KEY_DELETE_FAILED", digest, describeSyncFailure("delete-key", error));
      return false;
    }
    try {
      await native.sqlite.deleteDatabaseAsync(`orbit-sync-${digest}.db`);
    } catch {
      input.report("SYNC_FILE_DELETE_FAILED", digest);
    }
    try {
      await clearPendingSyncCleanup(native);
    } catch (error) {
      input.report("SYNC_CLEANUP_STATE_FAILED", digest, describeSyncFailure("clear-pending-cleanup", error));
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
    } catch (error) {
      // Enumeration is best effort; the open identity is still isolated by its own key.
      input.report("SYNC_IDENTITY_SCAN_FAILED", keep, describeSyncFailure("scan-identities", error));
      return true;
    }
    const others = new Set(names.map(name => IDENTITY_DATABASE.exec(name)?.[1]).filter((digest): digest is string => Boolean(digest) && digest !== keep));
    for (const digest of others) {
      try {
        await persistPendingSyncCleanup(digest, native);
      } catch (error) {
        input.report("SYNC_CLEANUP_STATE_FAILED", digest, describeSyncFailure("persist-pending-cleanup", error));
        return false;
      }
      if (!(await finishPendingCleanup(digest))) return false;
    }
    if (malformedMarker) {
      // Every other identity is gone, so whatever the unreadable marker meant is done.
      try {
        await clearPendingSyncCleanup(native);
        malformedMarker = false;
      } catch (error) {
        input.report("SYNC_CLEANUP_STATE_FAILED", keep, describeSyncFailure("clear-pending-cleanup", error));
        return false;
      }
    }
    return true;
  }

  async function purge(): Promise<boolean> {
    if (!current || !native) return true;
    current.database = null;
    current.blocked = true;
    try {
      // Persist intent before closing/deleting: a restarted process must finish
      // crypto erasure before it can accept any other identity.
      await persistPendingSyncCleanup(current.digest, native);
    } catch (error) {
      input.report("SYNC_CLEANUP_STATE_FAILED", current.digest, describeSyncFailure("persist-pending-cleanup", error));
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
    } catch (error) {
      input.report("SYNC_CLEANUP_STATE_FAILED", undefined, describeSyncFailure("load-native", error));
      return false;
    }
    if (!cleanupRecovered) {
      let pending: string | null;
      try {
        pending = await readPendingSyncCleanup(native);
      } catch (error) {
        if (error instanceof Error && error.message === "SYNC_CLEANUP_STATE_INVALID") {
          input.report("SYNC_CLEANUP_STATE_INVALID", undefined, describeSyncFailure("read-pending-cleanup", error));
          malformedMarker = true;
          cleanupRecovered = true;
          return true;
        }
        // An unreadable marker cannot be treated as proof of no pending key.
        input.report("SYNC_CLEANUP_STATE_FAILED", undefined, describeSyncFailure("read-pending-cleanup", error));
        return false;
      }
      if (pending && !(await finishPendingCleanup(pending))) return false;
      cleanupRecovered = true;
    }
    return true;
  }

  return {
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
          if (requestToken !== token) {
            await purge();
            return false;
          }
          current.database = database;
          readyToken = requestToken;
          return true;
        } catch (error) {
          input.report("SYNC_INIT_FAILED", current?.digest, describeSyncFailure("open-scope", error));
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
  report: (code, scopeHash, detail) => console.warn(code, scopeHash?.slice(0, 16) ?? "unavailable", detail ? JSON.stringify(detail) : ""),
});
