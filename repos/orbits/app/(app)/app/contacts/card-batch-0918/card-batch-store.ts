/**
 * 名片批量导入的浏览器端持久化：
 *   - 待上传照片存 IndexedDB（File 可结构化克隆）。用户点「先完成设置」或换页后，
 *     全站的 CardBatchHost 会从这里取回照片继续上传——不再依赖原页面的内存。
 *   - 「进行中批次」登记表存 localStorage：全站提醒据此找到要盯的批次。
 * 两者都只是本机便利；读写失败（无痕模式/存储被禁）时退化为「只在当前页面内有效」。
 */
"use client";

const DB_NAME = "orbit-card-batch";
const STORE = "pending-files";
const ACTIVE_KEY = "orbit.cardBatches.active.v1";

interface PendingFileRecord {
  key: string;
  batchId: string;
  digest: string;
  file: Blob;
  name: string;
  type: string;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "key" }).createIndex("batchId", "batchId");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise(resolve => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

export async function savePendingFiles(batchId: string, byDigest: ReadonlyMap<string, File>): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const transaction = db.transaction(STORE, "readwrite");
  const store = transaction.objectStore(STORE);
  for (const [digest, file] of byDigest) {
    const record: PendingFileRecord = { batchId, digest, file, key: `${batchId}|${digest}`, name: file.name, type: file.type };
    store.put(record);
  }
  await done(transaction);
  db.close();
}

export async function loadPendingFiles(batchId: string): Promise<Map<string, File>> {
  const db = await openDb();
  const result = new Map<string, File>();
  if (!db) return result;
  const records = await new Promise<PendingFileRecord[]>(resolve => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).index("batchId").getAll(batchId);
      request.onsuccess = () => resolve((request.result ?? []) as PendingFileRecord[]);
      request.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  for (const record of records) {
    result.set(record.digest, record.file instanceof File ? record.file : new File([record.file], record.name, { type: record.type }));
  }
  return result;
}

export async function deletePendingFile(batchId: string, digest: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  const transaction = db.transaction(STORE, "readwrite");
  transaction.objectStore(STORE).delete(`${batchId}|${digest}`);
  await done(transaction);
  db.close();
}

export async function deletePendingFiles(batchId: string): Promise<void> {
  const files = await loadPendingFiles(batchId);
  await Promise.all([...files.keys()].map(digest => deletePendingFile(batchId, digest)));
}

// ── 进行中批次登记表（最新的在最后）──
export function listActiveBatches(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(ACTIVE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeActive(ids: readonly string[]): void {
  try {
    window.localStorage.setItem(ACTIVE_KEY, JSON.stringify(ids.slice(-10)));
    window.dispatchEvent(new Event("orbit-card-batches"));
  } catch {
    // 只影响全站提醒能否找到该批次。
  }
}

export function registerActiveBatch(batchId: string): void {
  writeActive([...listActiveBatches().filter(id => id !== batchId), batchId]);
}

export function unregisterActiveBatch(batchId: string): void {
  const current = listActiveBatches();
  if (current.includes(batchId)) writeActive(current.filter(id => id !== batchId));
}
