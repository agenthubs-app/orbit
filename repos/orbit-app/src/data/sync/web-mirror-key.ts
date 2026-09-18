/**
 * Browser mirror keys: one AES-GCM key per (server, actor) digest, generated
 * with `extractable: false` and kept as a CryptoKey object inside IndexedDB.
 * Structured cloning preserves the non-extractable flag, so the raw key bytes
 * never exist in JavaScript. This is not the native SecureStore: any script
 * running in this origin can use (not read) the key, and clearing site data
 * deletes it together with the mirror.
 */
export interface WebMirrorKeyDependencies {
  indexedDB: IDBFactory;
  subtle: Pick<SubtleCrypto, "generateKey">;
}

const DATABASE_NAME = "orbit-sync-keys";
const STORE = "keys";
const PENDING_CLEANUP = "pending-cleanup";

function request<T>(target: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    target.onsuccess = () => resolve(target.result);
    target.onerror = () => reject(target.error ?? new Error("WEB_MIRROR_KEY_STORE_FAILED"));
  });
}

async function openStore(deps: WebMirrorKeyDependencies): Promise<IDBDatabase> {
  const open = deps.indexedDB.open(DATABASE_NAME, 1);
  open.onupgradeneeded = () => {
    if (!open.result.objectStoreNames.contains(STORE)) open.result.createObjectStore(STORE);
  };
  return request(open);
}

async function withStore<T>(deps: WebMirrorKeyDependencies, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openStore(deps);
  try {
    const transaction = database.transaction(STORE, mode);
    const result = await request(run(transaction.objectStore(STORE)));
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("WEB_MIRROR_KEY_TX_FAILED"));
      transaction.onabort = () => reject(transaction.error ?? new Error("WEB_MIRROR_KEY_TX_ABORTED"));
    });
    return result;
  } finally {
    database.close();
  }
}

export async function loadWebMirrorKey(digest: string, deps: WebMirrorKeyDependencies, discardOrphan: () => Promise<void>): Promise<CryptoKey> {
  const name = `orbit.sync.key.${digest}`;
  const stored = await withStore<CryptoKey | undefined>(deps, "readonly", (store) => store.get(name) as IDBRequest<CryptoKey | undefined>);
  if (stored) {
    if (stored.extractable || stored.algorithm.name !== "AES-GCM") throw new Error("WEB_MIRROR_KEY_INVALID");
    return stored;
  }
  // A mirror file without its key (restored profile, cleared key store) is never opened.
  await discardOrphan();
  const key = await deps.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await withStore(deps, "readwrite", (store) => store.put(key, name));
  return key;
}

export async function deleteWebMirrorKey(digest: string, deps: WebMirrorKeyDependencies): Promise<void> {
  await withStore(deps, "readwrite", (store) => store.delete(`orbit.sync.key.${digest}`));
}

export async function readPendingWebMirrorCleanup(deps: WebMirrorKeyDependencies): Promise<string | null> {
  const digest = await withStore<string | undefined>(deps, "readonly", (store) => store.get(PENDING_CLEANUP) as IDBRequest<string | undefined>);
  if (digest !== undefined && !/^[a-f0-9]{64}$/u.test(digest)) throw new Error("WEB_MIRROR_CLEANUP_STATE_INVALID");
  return digest ?? null;
}

export async function persistPendingWebMirrorCleanup(digest: string, deps: WebMirrorKeyDependencies): Promise<void> {
  await withStore(deps, "readwrite", (store) => store.put(digest, PENDING_CLEANUP));
}

export async function clearPendingWebMirrorCleanup(deps: WebMirrorKeyDependencies): Promise<void> {
  await withStore(deps, "readwrite", (store) => store.delete(PENDING_CLEANUP));
}
