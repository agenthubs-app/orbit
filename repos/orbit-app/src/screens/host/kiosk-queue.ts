// R17 受付（App）的本机队列与名单缓存逻辑（无 React、无原生依赖，测试直接用内存实现）。与 Web kiosk-store.ts 同口径：
// - 离线队列：「到着」请求网络失败时先存本机（原生 = expo-sqlite，kiosk-store.native.ts），联网后按受付顺序补发；
//   每条带自己的幂等键，补发多少次都是同一个键，服务端重复只记一次（duplicate）。
// - 名单缓存：`GET /kiosk/roster` 成功（= 服务端认可本机有受付权限）后才存；TTL = cacheUntil（按 kiosk 的时钟比，活动结束 +12h），
//   过期即清；服务端说没有权限（forbidden / not_found）也立即清。
import type { HostCheckInResult, HostKioskRecent, HostKioskRow } from "../../api/contract/host-console";

export type KioskQueueItem = {
  idempotencyKey: string;
  eventId: string;
  participantId: string;
  name: string;
  initial: string;
  org: string | null;
  /** 本机受付的时刻（ISO，按 kiosk 的时钟）。 */
  at: string;
  /** 补发被拒（4xx，非网络）的原因；有值的条目留在队列里等人工处理（再試行）。 */
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
}

export function memoryKioskStore(): KioskStore & { dump: () => { queue: KioskQueueItem[]; rosters: KioskRosterCache[] } } {
  const queue = new Map<string, KioskQueueItem>();
  const rosters = new Map<string, KioskRosterCache>();
  return {
    async clearRoster(eventId) { rosters.delete(eventId); },
    dump: () => ({ queue: [...queue.values()], rosters: [...rosters.values()] }),
    async enqueue(item) { if (!queue.has(item.idempotencyKey)) queue.set(item.idempotencyKey, item); },
    async queue(eventId) { return [...queue.values()].filter((item) => item.eventId === eventId).sort((a, b) => a.at.localeCompare(b.at)); },
    async remove(key) { queue.delete(key); },
    async roster(eventId) { return rosters.get(eventId) ?? null; },
    async saveRoster(cache) { rosters.set(cache.eventId, cache); },
    async update(item) { if (queue.has(item.idempotencyKey)) queue.set(item.idempotencyKey, item); },
  };
}

/** 缓存是否还能用（cacheUntil 之前，按 kiosk 的时钟）。 */
export const rosterFresh = (cache: KioskRosterCache | null, now: Date) => Boolean(cache && Date.parse(cache.cacheUntil) > now.getTime());

/** 读缓存；过期就顺手清掉（TTL = cacheUntil）。 */
export async function readRoster(store: KioskStore, eventId: string, now: Date): Promise<KioskRosterCache | null> {
  const cache = await store.roster(eventId);
  if (!cache) return null;
  if (!rosterFresh(cache, now)) { await store.clearRoster(eventId); return null; }
  return cache;
}

/** 名单接口的结果落到本机：成功且未过期才存；没有权限就清。 */
export async function applyRoster(store: KioskStore, eventId: string, result: { ok: true; data: { cacheUntil: string; rows: readonly HostKioskRow[] } } | { ok: false; reason: string }, now: Date): Promise<KioskRosterCache | null> {
  if (result.ok) {
    const cache: KioskRosterCache = { cacheUntil: result.data.cacheUntil, eventId, rows: result.data.rows, savedAt: now.toISOString() };
    if (rosterFresh(cache, now)) { await store.saveRoster(cache); return cache; }
    await store.clearRoster(eventId);
    return null;
  }
  if (result.reason === "forbidden" || result.reason === "not_found") await store.clearRoster(eventId);
  return null;
}

export type SendResult = { ok: true; data: HostCheckInResult } | { ok: false; reason: string };
const RETRY_LATER = new Set(["network", "unavailable", "rate_limited"]);

/**
 * 按受付顺序补发。网络失败 → 停下（剩下的留着等下次）；成功或 duplicate → 出队；
 * 其他失败（找不到人 / キャンセル待ち 等 4xx）→ 记 error 留在队列，不再自动重试（画面上「再試行」）。
 * `includeFailed` = 人工点「再試行」时连带已记 error 的条目一起重发。
 */
export async function flushQueue(store: KioskStore, eventId: string, send: (item: KioskQueueItem) => Promise<SendResult>, includeFailed = false): Promise<{ sent: number; duplicate: number; failed: number; stopped: boolean }> {
  const items = (await store.queue(eventId)).filter((item) => includeFailed || !item.error);
  let sent = 0;
  let duplicate = 0;
  let failed = 0;
  for (const item of items) {
    const res = await send(item);
    if (res.ok) {
      await store.remove(item.idempotencyKey);
      if (res.data.duplicate) duplicate += 1; else sent += 1;
      continue;
    }
    if (RETRY_LATER.has(res.reason)) return { duplicate, failed, sent, stopped: true };
    await store.update({ ...item, error: res.reason });
    failed += 1;
  }
  return { duplicate, failed, sent, stopped: false };
}

/** 本机名单 + 队列 → 离线搜索结果（ひらがな・名前・会社）；排队中的人显示为到着。 */
export function searchRoster(rows: readonly HostKioskRow[], q: string, queued: ReadonlySet<string>): HostKioskRow[] {
  const query = q.trim();
  if (!query) return [];
  return rows.filter((row) => [row.name, row.kana ?? "", row.org ?? ""].some((text) => text.includes(query))).map((row) => (queued.has(row.participantId) && row.status === "not_arrived" ? { ...row, status: "checked_in" as const, undoable: false } : row));
}

export type KioskStreamRow = { key: string; at: string; name: string; initial: string; org: string | null; table: string | null; queued: boolean; participantId: string };

/** 最新の受付：本机还没送出的（新→旧）在前，其后是服务端的；同一人只出一次。 */
export function streamRows(recent: readonly HostKioskRecent[], queue: readonly KioskQueueItem[], limit = 5): KioskStreamRow[] {
  const pending = [...queue].sort((a, b) => b.at.localeCompare(a.at)).map((item) => ({ at: item.at, initial: item.initial, key: item.idempotencyKey, name: item.name, org: item.org, participantId: item.participantId, queued: true, table: null }));
  const queued = new Set(queue.map((item) => item.participantId));
  const rest = recent.filter((item) => !queued.has(item.participantId)).map((item) => ({ at: item.at, initial: item.initial, key: `r:${item.participantId}:${item.at}`, name: item.name, org: item.org, participantId: item.participantId, queued: false, table: item.table }));
  return [...pending, ...rest].slice(0, limit);
}
