import type { ApiResult } from "../api/types";
import type { SnapshotRecord } from "./snapshot-store";

// Expo Web 使用浏览器管理的在线会话，不加载原生 SQLite/wasm worker。
// 快照是优化而非数据源；Web 端明确退回只走网络，避免缓存初始化阻塞请求。
export async function readSnapshot<TData>(
  _baseUrl: string,
  _actorId: string,
  _path: string
): Promise<SnapshotRecord<TData> | null> {
  return null;
}

export async function writeSnapshot<TData>(
  _baseUrl: string,
  _actorId: string,
  _path: string,
  _result: ApiResult<TData>
): Promise<void> {}

export async function clearSnapshots(): Promise<void> {}
