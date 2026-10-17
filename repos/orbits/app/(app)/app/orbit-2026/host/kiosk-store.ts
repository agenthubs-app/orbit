// R17 受付 kiosk 的本机存储（无 React，jsdom / 单元测试可直接用内存实现）：
// - 离线队列：断网时「到着にする」先存本机（IndexedDB），联网后按顺序补发；每条带自己的幂等键，服务端重复只记一次（duplicate）。
// - 名单缓存：`GET /kiosk/roster` 成功（= 服务端认可本机有受付权限）后才存；TTL = cacheUntil（活动结束 +12h），过期或失去权限即清。
// - 清理（DESIGN §2.6「注销也清、启动时检查过期即清」）：打开 kiosk 时清掉所有过期名单；失去权限时清这场的名单与队列；
//   注销时 `clearKioskDevice()` 删掉整个本机库（壳的「ログアウト」调用）。
// - 设备 id：localStorage，心跳用（N台で受付中）。
import type { HostCheckInResult, HostKioskRow } from "../../../../../shared/contract/host-console";

export type KioskQueueItem = {
  /** 幂等键 = 队列主键（补发多少次都是同一个键）。 */
  idempotencyKey: string;
  eventId: string;
  participantId: string;
  name: string;
  org: string | null;
  /** 本机受付的时刻（ISO；画面上按 kiosk 的时钟显示）。 */
  at: string;
  /** 补发失败（4xx，非网络）的原因；有值的条目留在队列里，等人工处理。 */
  error?: string | null;
};

export type KioskRosterCache = { eventId: string; cacheUntil: string; rows: readonly HostKioskRow[]; savedAt: string };

export interface KioskStore {
  queue(eventId: string): Promise<KioskQueueItem[]>;
  enqueue(item: KioskQueueItem): Promise<void>;
  update(item: KioskQueueItem): Promise<void>;
  remove(idempotencyKey: string): Promise<void>;
  roster(eventId: string): Promise<KioskRosterCache | null>;
  saveRoster(cache: KioskRosterCache): Promise<void>;
  clearRoster(eventId: string): Promise<void>;
  /** 所有场次的名单缓存（启动时清过期用）。 */
  rosters(): Promise<KioskRosterCache[]>;
  /** 这场的名单与离线队列一起清（失去权限时）。 */
  clearEvent(eventId: string): Promise<void>;
}

/** 内存实现（测试 / IndexedDB 不可用时的退路——退路下离线受付只活到关页）。 */
export function memoryKioskStore(): KioskStore & { dump: () => { queue: KioskQueueItem[]; rosters: KioskRosterCache[] } } {
  const queue = new Map<string, KioskQueueItem>();
  const rosters = new Map<string, KioskRosterCache>();
  return {
    async clearRoster(eventId) { rosters.delete(eventId); },
    async clearEvent(eventId) { rosters.delete(eventId); for (const [key, item] of queue) if (item.eventId === eventId) queue.delete(key); },
    async rosters() { return [...rosters.values()]; },
    dump: () => ({ queue: [...queue.values()], rosters: [...rosters.values()] }),
    async enqueue(item) { if (!queue.has(item.idempotencyKey)) queue.set(item.idempotencyKey, item); },
    async queue(eventId) { return [...queue.values()].filter((item) => item.eventId === eventId).sort((a, b) => a.at.localeCompare(b.at)); },
    async remove(key) { queue.delete(key); },
    async roster(eventId) { return rosters.get(eventId) ?? null; },
    async saveRoster(cache) { rosters.set(cache.eventId, cache); },
    async update(item) { if (queue.has(item.idempotencyKey)) queue.set(item.idempotencyKey, item); },
  };
}

const DB = "orbit-host-kiosk";
const Q = "queue";
const R = "roster";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

/** IndexedDB 实现（浏览器）。打不开时返回 null，由调用方退到内存实现。 */
export async function indexedDbKioskStore(): Promise<KioskStore | null> {
  if (typeof indexedDB === "undefined") return null;
  let db: IDBDatabase;
  try {
    db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => {
        const store = open.result.createObjectStore(Q, { keyPath: "idempotencyKey" });
        store.createIndex("eventId", "eventId");
        open.result.createObjectStore(R, { keyPath: "eventId" });
      };
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
  } catch {
    return null;
  }
  const tx = (name: string, mode: IDBTransactionMode) => db.transaction(name, mode).objectStore(name);
  return {
    async clearRoster(eventId) { await request(tx(R, "readwrite").delete(eventId)); },
    async clearEvent(eventId) {
      await request(tx(R, "readwrite").delete(eventId));
      const keys = (await request(tx(Q, "readonly").index("eventId").getAllKeys(eventId))) as IDBValidKey[];
      for (const key of keys) await request(tx(Q, "readwrite").delete(key));
    },
    async rosters() { return ((await request(tx(R, "readonly").getAll())) as KioskRosterCache[]) ?? []; },
    async enqueue(item) { const store = tx(Q, "readwrite"); if (!(await request(store.get(item.idempotencyKey)))) await request(tx(Q, "readwrite").put(item)); },
    async queue(eventId) { const items = (await request(tx(Q, "readonly").index("eventId").getAll(eventId))) as KioskQueueItem[]; return items.sort((a, b) => a.at.localeCompare(b.at)); },
    async remove(key) { await request(tx(Q, "readwrite").delete(key)); },
    async roster(eventId) { return ((await request(tx(R, "readonly").get(eventId))) as KioskRosterCache | undefined) ?? null; },
    async saveRoster(cache) { await request(tx(R, "readwrite").put(cache)); },
    async update(item) { await request(tx(Q, "readwrite").put(item)); },
  };
}

/** 启动时：清掉所有过期的名单缓存（不只当前这场）。 */
export async function purgeExpiredRosters(store: KioskStore, now: Date): Promise<number> {
  let purged = 0;
  for (const cache of await store.rosters().catch(() => [] as KioskRosterCache[])) {
    if (!rosterFresh(cache, now)) { await store.clearRoster(cache.eventId); purged += 1; }
  }
  return purged;
}

/** 注销：删掉整个本机受付库（名单与离线队列都有姓名）。没有 IndexedDB 时什么都不做。 */
export async function clearKioskDevice(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase(DB);
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      // 隐私模式 / 不透明源会同步抛错：那里本来也存不了名单，直接放行注销。
      resolve();
    }
  });
}

/** 缓存是否还能用（cacheUntil 之前）。 */
export const rosterFresh = (cache: KioskRosterCache | null, now: Date) => Boolean(cache && Date.parse(cache.cacheUntil) > now.getTime());

/** 读缓存；过期就顺手清掉（TTL = cacheUntil）。 */
export async function readRoster(store: KioskStore, eventId: string, now: Date): Promise<KioskRosterCache | null> {
  const cache = await store.roster(eventId);
  if (!cache) return null;
  if (!rosterFresh(cache, now)) { await store.clearRoster(eventId); return null; }
  return cache;
}

export type SendResult = { ok: true; data: HostCheckInResult } | { ok: false; reason: string };

/**
 * 按受付顺序补发。网络失败 → 停下（剩下的留着等下次）；成功或 duplicate → 出队；
 * 其他失败（找不到人 / キャンセル待ち 等 4xx）→ 记 error 留在队列，不再自动重试。
 */
export async function flushQueue(store: KioskStore, eventId: string, send: (item: KioskQueueItem) => Promise<SendResult>): Promise<{ sent: number; duplicate: number; failed: number; stopped: boolean }> {
  const items = (await store.queue(eventId)).filter((item) => !item.error);
  let sent = 0;
  let duplicate = 0;
  let failed = 0;
  for (const item of items) {
    const res = await send(item);
    if (res.ok) {
      await store.remove(item.idempotencyKey);
      if ((res as { data: HostCheckInResult }).data.duplicate) duplicate += 1; else sent += 1;
      continue;
    }
    const reason = (res as { reason: string }).reason;
    if (reason === "network" || reason === "unavailable" || reason === "rate_limited") return { duplicate, failed, sent, stopped: true };
    await store.update({ ...item, error: reason });
    failed += 1;
  }
  return { duplicate, failed, sent, stopped: false };
}

/** 本机名单 + 队列 → 离线搜索结果（ひらがな・名前・会社）。 */
export function searchRoster(rows: readonly HostKioskRow[], q: string, queued: ReadonlySet<string>): HostKioskRow[] {
  const query = q.trim();
  if (!query) return [];
  return rows.filter((row) => [row.name, row.kana ?? "", row.org ?? ""].some((text) => text.includes(query))).map((row) => (queued.has(row.participantId) && row.status === "not_arrived" ? { ...row, status: "checked_in" as const, undoable: false } : row));
}

const DEVICE_KEY = "orbit.host.kioskDevice";

/** 心跳用的设备 id（本机固定；localStorage 不可用时每次打开新给一个）。 */
export function kioskDeviceId(): string {
  const fresh = () => `kiosk-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
  try {
    const saved = window.localStorage.getItem(DEVICE_KEY);
    if (saved) return saved;
    const id = fresh();
    window.localStorage.setItem(DEVICE_KEY, id);
    return id;
  } catch {
    return fresh();
  }
}
