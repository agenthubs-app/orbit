import type { LocalSyncDatabase, LocalSyncSqlValue } from "./local-sync-database-core";

/** Domains the browser may mirror. Notes stay online-only in the browser (PLANNER 0077, 判断 4). */
export const WEB_MIRROR_DOMAIN_IDS: readonly string[] = ["tasks", "personal-schedule"];

/**
 * Browser mirror storage: expo-sqlite's web build (wa-sqlite in a Worker, OPFS
 * access-handle pool). Availability is probed, never assumed — any missing
 * capability degrades to online-only with a stated reason instead of an error.
 */
export type WebMirrorUnavailableReason =
  | "insecure-context"
  | "no-opfs"
  | "no-indexeddb"
  | "no-webcrypto"
  | "no-worker"
  | "open-failed";

export interface WebMirrorProbe {
  available: boolean;
  reason: WebMirrorUnavailableReason | null;
}

export interface WebMirrorEnvironment {
  isSecureContext: boolean;
  storage: Pick<StorageManager, "getDirectory"> | undefined;
  indexedDB: IDBFactory | undefined;
  subtle: SubtleCrypto | undefined;
  hasWorker: boolean;
}

export function browserMirrorEnvironment(): WebMirrorEnvironment {
  const g = globalThis as typeof globalThis & { isSecureContext?: boolean; navigator?: Navigator };
  return {
    isSecureContext: Boolean(g.isSecureContext),
    storage: g.navigator?.storage,
    indexedDB: g.indexedDB,
    subtle: g.crypto?.subtle,
    hasWorker: typeof g.Worker === "function",
  };
}

export function probeWebMirror(env: WebMirrorEnvironment): WebMirrorProbe {
  if (!env.isSecureContext) return { available: false, reason: "insecure-context" };
  if (!env.storage || typeof env.storage.getDirectory !== "function") return { available: false, reason: "no-opfs" };
  if (!env.indexedDB) return { available: false, reason: "no-indexeddb" };
  if (!env.subtle) return { available: false, reason: "no-webcrypto" };
  if (!env.hasWorker) return { available: false, reason: "no-worker" };
  return { available: true, reason: null };
}

/** expo-sqlite has no bigint binding; the adapter rejects it before the worker sees it. */
export type WebSqlBindValue = Exclude<LocalSyncSqlValue, bigint>;

export interface WebSqliteHandle {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: WebSqlBindValue[]): Promise<{ changes: number }>;
  getFirstAsync<T>(source: string, params: WebSqlBindValue[]): Promise<T | null>;
  getAllAsync<T>(source: string, params: WebSqlBindValue[]): Promise<T[]>;
  closeAsync(): Promise<void>;
}

export interface WebSqlite {
  openDatabaseAsync(name: string, options: { useNewConnection: boolean }): Promise<WebSqliteHandle>;
  deleteDatabaseAsync(name: string): Promise<void>;
}

function parameters(values: readonly LocalSyncSqlValue[]): WebSqlBindValue[] {
  return values.map((value) => {
    if (typeof value === "bigint") throw new Error("SYNC_BIND_UNSUPPORTED");
    return value;
  });
}

/** Same adapter shape as the native lifecycle; all access is serialized by the caller. */
export function adaptWebDatabase(handle: WebSqliteHandle): LocalSyncDatabase {
  return {
    execute: (source) => handle.execAsync(source),
    run: (source, params = []) => handle.runAsync(source, parameters(params)),
    get: (source, params = []) => handle.getFirstAsync(source, parameters(params)),
    all: (source, params = []) => handle.getAllAsync(source, parameters(params)),
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

/** wa-sqlite's OPFS access-handle pool caps path names at 64 bytes; half the digest keeps 128 bits of scope identity. */
export function webMirrorDatabaseName(digest: string): string {
  return `orbit-sync-${digest.slice(0, 32)}.db`;
}

export async function sha256Hex(subtle: Pick<SubtleCrypto, "digest">, text: string): Promise<string> {
  const bytes = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}
