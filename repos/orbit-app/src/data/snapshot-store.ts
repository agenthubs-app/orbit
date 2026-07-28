import type { ApiResult } from "../api/types";
import { Platform } from "react-native";

// 每一次成功的 GET 都在本地留一份快照，下次打开这一屏时先渲染它，
// 网络回来了再覆盖。断网时快照就是用户看到的内容——离线是常态，
// 内容页不会因此变成错误屏。
//
// 缓存是优化，不是依赖：SQLite 打不开（Web 端、模拟器异常、磁盘满）时
// 全部操作降级成空操作，App 行为退回改造前，不会因为缓存层出问题而崩。
//
// 快照里是真实人脉数据，所以登出时必须整表清空，见 clearSnapshots。

// 快照按「服务器 + 路径」建键。App 支持切换服务器（设置里的服务器地址），
// 只按 path 建键会让换服务器之后读到上一台的数据。
function snapshotKey(baseUrl: string, path: string): string {
  return `${baseUrl}|${path}`;
}

interface SnapshotRow {
  payload: string;
  status: number;
  synced_at: string;
}

export interface SnapshotRecord<TData> {
  result: ApiResult<TData>;
  syncedAt: string;
}

type Database = {
  execAsync: (source: string) => Promise<unknown>;
  getFirstAsync: (
    source: string,
    ...params: unknown[]
  ) => Promise<SnapshotRow | null>;
  runAsync: (source: string, ...params: unknown[]) => Promise<unknown>;
};

const DATABASE_NAME = "orbit-cache.db";

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS api_snapshots (
    path TEXT PRIMARY KEY NOT NULL,
    payload TEXT NOT NULL,
    status INTEGER NOT NULL,
    synced_at TEXT NOT NULL
  );
`;

let databasePromise: Promise<Database | null> | null = null;
let reportedUnavailable = false;

function reportUnavailable(error: unknown): null {
  if (!reportedUnavailable) {
    reportedUnavailable = true;
    console.warn("Orbit 本地缓存不可用，将只走网络", error);
  }

  return null;
}

async function database(): Promise<Database | null> {
  if (Platform.OS === "web") {
    return null;
  }

  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = (async () => {
    try {
      // 动态引入：Node 测试环境和 Web 端没有这个原生模块，
      // 顶层 import 会让引用到本模块的一切一起挂掉。
      const sqlite = (await import("expo-sqlite")) as {
        openDatabaseAsync: (name: string) => Promise<Database>;
      };
      const db = await sqlite.openDatabaseAsync(DATABASE_NAME);
      await db.execAsync(CREATE_TABLE);
      // 早期版本只按 path 建键，那些行现在永远读不到，清掉省空间。
      await db.runAsync("DELETE FROM api_snapshots WHERE path NOT LIKE '%|%'");
      return db;
    } catch (error) {
      return reportUnavailable(error);
    }
  })();

  return databasePromise;
}

export async function readSnapshot<TData>(
  baseUrl: string,
  path: string
): Promise<SnapshotRecord<TData> | null> {
  const db = await database();

  if (!db) {
    return null;
  }

  try {
    const row = await db.getFirstAsync(
      "SELECT payload, status, synced_at FROM api_snapshots WHERE path = ?",
      snapshotKey(baseUrl, path)
    );

    if (!row) {
      return null;
    }

    return {
      result: {
        data: JSON.parse(row.payload) as TData,
        meta: { featureMode: null, privacy: null, runtimeBoundary: null },
        status: row.status,
        success: true
      },
      syncedAt: row.synced_at
    };
  } catch (error) {
    // 快照坏了不该影响这次请求，下一次成功响应会把它覆盖掉。
    console.warn("Orbit 读取本地快照失败", error);
    return null;
  }
}

export async function writeSnapshot<TData>(
  baseUrl: string,
  path: string,
  result: ApiResult<TData>
): Promise<void> {
  if (!result.success) {
    return;
  }

  const db = await database();

  if (!db) {
    return;
  }

  try {
    await db.runAsync(
      `INSERT INTO api_snapshots (path, payload, status, synced_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         payload = excluded.payload,
         status = excluded.status,
         synced_at = excluded.synced_at`,
      snapshotKey(baseUrl, path),
      JSON.stringify(result.data),
      result.status,
      new Date().toISOString()
    );
  } catch (error) {
    console.warn("Orbit 写入本地快照失败", error);
  }
}

// 登出时必须调用：快照里是上一个账号的人脉数据。
export async function clearSnapshots(): Promise<void> {
  const db = await database();

  if (!db) {
    return;
  }

  try {
    await db.runAsync("DELETE FROM api_snapshots");
  } catch (error) {
    console.warn("Orbit 清除本地快照失败", error);
  }
}
