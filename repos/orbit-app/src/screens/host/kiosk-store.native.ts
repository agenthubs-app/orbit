// R17 受付的本机存储（原生，expo-sqlite）：离线队列 + 当天名单缓存。表只在这台设备上，不同步到服务端。
// 打不开数据库时退到内存实现（离线受付只活到关 App）。逻辑（补发顺序、TTL、权限清缓存）在 kiosk-queue.ts。
import * as SQLite from "expo-sqlite";

import { memoryKioskStore, type KioskQueueItem, type KioskRosterCache, type KioskStore } from "./kiosk-queue";

type QueueRow = { idempotencyKey: string; eventId: string; participantId: string; name: string; initial: string; org: string | null; at: string; error: string | null };
type RosterRow = { eventId: string; cacheUntil: string; savedAt: string; rows: string };

let shared: Promise<KioskStore> | null = null;

async function open(): Promise<KioskStore> {
  let db: SQLite.SQLiteDatabase;
  try {
    db = await SQLite.openDatabaseAsync("orbit-host-kiosk.db");
    await db.execAsync(`CREATE TABLE IF NOT EXISTS kiosk_queue (idempotencyKey TEXT PRIMARY KEY NOT NULL, eventId TEXT NOT NULL, participantId TEXT NOT NULL, name TEXT NOT NULL, initial TEXT NOT NULL, org TEXT, at TEXT NOT NULL, error TEXT);
      CREATE INDEX IF NOT EXISTS kiosk_queue_event ON kiosk_queue (eventId, at);
      CREATE TABLE IF NOT EXISTS kiosk_roster (eventId TEXT PRIMARY KEY NOT NULL, cacheUntil TEXT NOT NULL, savedAt TEXT NOT NULL, rows TEXT NOT NULL);`);
  } catch {
    return memoryKioskStore();
  }
  const toItem = (row: QueueRow): KioskQueueItem => ({ at: row.at, error: row.error, eventId: row.eventId, idempotencyKey: row.idempotencyKey, initial: row.initial, name: row.name, org: row.org, participantId: row.participantId });
  return {
    async clearRoster(eventId) { await db.runAsync("DELETE FROM kiosk_roster WHERE eventId = ?", eventId); },
    async enqueue(item) {
      // 同一个幂等键只存一次（INSERT OR IGNORE）。
      await db.runAsync("INSERT OR IGNORE INTO kiosk_queue (idempotencyKey, eventId, participantId, name, initial, org, at, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", item.idempotencyKey, item.eventId, item.participantId, item.name, item.initial, item.org, item.at, item.error ?? null);
    },
    async queue(eventId) { return (await db.getAllAsync<QueueRow>("SELECT * FROM kiosk_queue WHERE eventId = ? ORDER BY at ASC", eventId)).map(toItem); },
    async remove(key) { await db.runAsync("DELETE FROM kiosk_queue WHERE idempotencyKey = ?", key); },
    async roster(eventId) {
      const row = await db.getFirstAsync<RosterRow>("SELECT * FROM kiosk_roster WHERE eventId = ?", eventId);
      if (!row) return null;
      try { return { cacheUntil: row.cacheUntil, eventId: row.eventId, rows: JSON.parse(row.rows) as KioskRosterCache["rows"], savedAt: row.savedAt }; } catch { return null; }
    },
    async saveRoster(cache) { await db.runAsync("INSERT OR REPLACE INTO kiosk_roster (eventId, cacheUntil, savedAt, rows) VALUES (?, ?, ?, ?)", cache.eventId, cache.cacheUntil, cache.savedAt, JSON.stringify(cache.rows)); },
    async update(item) { await db.runAsync("UPDATE kiosk_queue SET error = ?, at = ? WHERE idempotencyKey = ?", item.error ?? null, item.at, item.idempotencyKey); },
  };
}

export function openKioskStore(): Promise<KioskStore> {
  shared ??= open();
  return shared;
}
