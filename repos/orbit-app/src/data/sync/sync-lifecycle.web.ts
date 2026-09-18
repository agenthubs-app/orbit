import * as sqlite from "expo-sqlite";
import { normalizeOrbitApiBaseUrl } from "../../api/base-url";
import { initializeLocalSyncDatabase, type LocalSyncDatabase } from "./local-sync-database-core";
import { createAesGcmPayloadCodec, type PayloadCodec } from "./payload-codec";
import type { SyncSessionScope } from "./sync-database-key";
import {
  clearPendingWebMirrorCleanup,
  deleteWebMirrorKey,
  loadWebMirrorKey,
  persistPendingWebMirrorCleanup,
  readPendingWebMirrorCleanup,
} from "./web-mirror-key";
import {
  adaptWebDatabase,
  browserMirrorEnvironment,
  probeWebMirror,
  sha256Hex,
  WEB_MIRROR_DOMAIN_IDS,
  webMirrorDatabaseName,
  type WebMirrorEnvironment,
  type WebMirrorUnavailableReason,
  type WebSqlite,
  type WebSqliteHandle,
} from "./web-mirror-storage";

/**
 * Browser mirror lifecycle. Same contract and ordering as the native lifecycle
 * (identity transition → cleanup recovery → purge → open), but storage is OPFS
 * through expo-sqlite's web worker, the key is a non-extractable Web Crypto
 * AES-GCM key, and only the whitelisted domains below are ever bound. When any
 * capability is missing the App stays online-only and says why.
 */
export { WEB_MIRROR_DOMAIN_IDS };

export type WebMirrorStatus =
  | { mode: "online-only"; reason: WebMirrorUnavailableReason }
  | { mode: "local-mirror"; scopeDigest: string | null; domains: readonly string[] };

export interface WebSyncDependencies {
  sqlite: WebSqlite;
  indexedDB: IDBFactory;
  subtle: SubtleCrypto;
  getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;
}

interface OpenScope {
  scope: SyncSessionScope;
  digest: string;
  name: string;
  handle: WebSqliteHandle | null;
  database: LocalSyncDatabase | null;
  codec: PayloadCodec | null;
  blocked: boolean;
}

/** expo-sqlite's worker channel never settles if the Worker itself fails to boot; bound every open. */
export const WEB_MIRROR_OPEN_TIMEOUT_MS = 15_000;

function withDeadline<T>(operation: Promise<T>, ms: number, code: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(code)), ms); });
  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer));
}

function sameScope(left: SyncSessionScope, right: SyncSessionScope): boolean {
  return normalizeOrbitApiBaseUrl(left.baseUrl) === normalizeOrbitApiBaseUrl(right.baseUrl) && left.actorId === right.actorId;
}

export function createWebSyncLifecycle(input: {
  environment: () => WebMirrorEnvironment;
  loadSqlite: () => Promise<WebSqlite>;
  report: (code: string, scopeHash?: string, error?: unknown) => void;
  openTimeoutMs?: number;
}) {
  const openTimeoutMs = input.openTimeoutMs ?? WEB_MIRROR_OPEN_TIMEOUT_MS;
  let deps: WebSyncDependencies | null = null;
  let unavailable: WebMirrorUnavailableReason | null | undefined;
  let current: OpenScope | null = null;
  let token = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let cleanupRecovered = false;
  let readyToken = -1;
  const listeners = new Set<() => void>();
  let statusSnapshot: WebMirrorStatus | null = null;

  function status(): WebMirrorStatus {
    const next: WebMirrorStatus = unavailable
      ? { mode: "online-only", reason: unavailable }
      : { mode: "local-mirror", scopeDigest: current?.database && !current.blocked ? current.digest : null, domains: WEB_MIRROR_DOMAIN_IDS };
    if (statusSnapshot && JSON.stringify(statusSnapshot) === JSON.stringify(next)) return statusSnapshot;
    statusSnapshot = next;
    return next;
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result.finally(notify);
  }

  /** The probe runs once per page: a capability does not appear or vanish mid-session. */
  function probe(): WebMirrorUnavailableReason | null {
    if (unavailable === undefined) unavailable = probeWebMirror(input.environment()).reason;
    return unavailable;
  }

  async function loadDependencies(): Promise<WebSyncDependencies | null> {
    if (deps) return deps;
    const env = input.environment();
    if (!env.indexedDB || !env.subtle) return null;
    try {
      const sqlite = await withDeadline(input.loadSqlite(), openTimeoutMs, "SYNC_OPEN_TIMEOUT");
      deps = { sqlite, indexedDB: env.indexedDB, subtle: env.subtle, getRandomValues: (bytes) => globalThis.crypto.getRandomValues(bytes) };
      return deps;
    } catch {
      return null;
    }
  }

  async function finishPendingCleanup(digest: string): Promise<boolean> {
    if (!deps) return false;
    try {
      await deleteWebMirrorKey(digest, deps);
    } catch {
      input.report("SYNC_KEY_DELETE_FAILED", digest);
      return false;
    }
    try {
      await deps.sqlite.deleteDatabaseAsync(webMirrorDatabaseName(digest));
    } catch {
      input.report("SYNC_FILE_DELETE_FAILED", digest);
    }
    try {
      await clearPendingWebMirrorCleanup(deps);
    } catch {
      input.report("SYNC_CLEANUP_STATE_FAILED", digest);
      return false;
    }
    return true;
  }

  async function purge(): Promise<boolean> {
    if (!current || !deps) return true;
    current.database = null;
    current.codec = null;
    current.blocked = true;
    try {
      // Persist intent first: a reloaded tab must finish erasure before accepting another identity.
      await persistPendingWebMirrorCleanup(current.digest, deps);
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

  const payloadCodec: PayloadCodec = {
    async encode(serialized) {
      if (!current?.codec) throw new Error("SYNC_CODEC_UNAVAILABLE");
      return current.codec.encode(serialized);
    },
    async decode(stored) {
      if (!current?.codec) throw new Error("SYNC_CODEC_UNAVAILABLE");
      return current.codec.decode(stored);
    },
  };

  return {
    registeredDomainIds: WEB_MIRROR_DOMAIN_IDS,
    payloadCodec,
    status,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    isScopeReadable(scope: SyncSessionScope | null): boolean {
      return readyToken === token && Boolean(scope && current?.database && !current.blocked &&
        sameScope(current.scope, scope) && (scope.workspaceId === undefined || scope.workspaceId === current.scope.workspaceId));
    },
    setScope(scope: SyncSessionScope | null): Promise<boolean> {
      scope = scope ? { ...scope, baseUrl: normalizeOrbitApiBaseUrl(scope.baseUrl) } : null;
      const requestToken = ++token;
      return enqueue(async () => {
        // Online-only is a valid, reported state, not a failed identity transition.
        if (probe()) return true;
        if (!(await loadDependencies())) {
          unavailable = "open-failed";
          input.report("SYNC_INIT_FAILED");
          return true;
        }
        const loaded = deps!;
        if (!cleanupRecovered) {
          try {
            const pending = await readPendingWebMirrorCleanup(loaded);
            if (pending && !(await finishPendingCleanup(pending))) return false;
            cleanupRecovered = true;
          } catch (error) {
            // Without a readable key store nothing can be opened or leaked: degrade for this page session.
            unavailable = "open-failed";
            input.report("SYNC_CLEANUP_STATE_FAILED", undefined, error);
            return true;
          }
        }
        if (current && (current.blocked || !scope || !sameScope(current.scope, scope))) {
          if (!(await purge())) return false;
        }
        if (requestToken !== token) return false;
        if (!scope) return true;
        if (current) {
          current.scope = scope;
          if (current.database) readyToken = requestToken;
          return true;
        }
        try {
          const digest = await sha256Hex(loaded.subtle, JSON.stringify([scope.baseUrl, scope.actorId]));
          current = { scope, digest, name: webMirrorDatabaseName(digest), handle: null, database: null, codec: null, blocked: false };
          const key = await loadWebMirrorKey(digest, loaded, () => loaded.sqlite.deleteDatabaseAsync(current!.name));
          current.handle = await withDeadline(loaded.sqlite.openDatabaseAsync(current.name, { useNewConnection: true }), openTimeoutMs, "SYNC_OPEN_TIMEOUT");
          const database = adaptWebDatabase(current.handle);
          await withDeadline(initializeLocalSyncDatabase(database), openTimeoutMs, "SYNC_OPEN_TIMEOUT");
          if (requestToken !== token) {
            await purge();
            return false;
          }
          current.codec = createAesGcmPayloadCodec(key, loaded);
          current.database = database;
          readyToken = requestToken;
          return true;
        } catch (error) {
          input.report("SYNC_INIT_FAILED", current?.digest, error);
          // Failure is not logout: key and file stay for the next page load; this
          // session reports online-only with the reason instead of retrying blindly.
          unavailable = "open-failed";
          if (current) {
            current.database = null;
            current.codec = null;
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
        if (requestToken !== token || !current?.database || current.blocked) return null;
        if (scope && (!sameScope(current.scope, scope) || (scope.workspaceId !== undefined && scope.workspaceId !== current.scope.workspaceId))) return null;
        try {
          const result = await operation(current.database, { ...current.scope });
          return requestToken === token ? result : null;
        } catch (error) {
          input.report("SYNC_OPERATION_FAILED", current.digest, error);
          return null;
        }
      });
    },
  };
}

export const syncLifecycle = createWebSyncLifecycle({
  environment: browserMirrorEnvironment,
  // Static on purpose: a dynamic import would put expo-sqlite in an async chunk, and Expo's
  // serializer then moves modules shared with the sqlite Worker chunk into __common.js,
  // which Workers never load ("Requiring unknown module"). In the main bundle they stay put.
  loadSqlite: async () => ({ openDatabaseAsync: sqlite.openDatabaseAsync, deleteDatabaseAsync: sqlite.deleteDatabaseAsync }),
  report: (code, scopeHash, error) => console.warn(code, scopeHash?.slice(0, 16) ?? "unavailable", error instanceof Error ? error.message : ""),
});
