/**
 * 「我的计划」页与 iOrbit 首页共用的计划读写（W0009）。只走 W0007 已验证的接口：
 *
 * - `GET   /api/agent/plans/current`         读当前生效计划（null = 还没有）
 * - `PATCH /api/agent/plans/items/:itemId`   行动打勾 / 取消（`set_status`，带幂等键；
 *                                            服务端在同一事务里写一条 auto 进展记录并返回）
 * - `POST  /api/agent/plans/log`             手动记一笔进展
 *
 * 快照的乐观更新也放在这里（纯函数），两处界面同一口径：先改本地、失败整份回滚。
 * 本文件不 import React。
 */
import type {
  PlanItem,
  PlanLogEntry,
  PlanSnapshot,
} from "../../../../../features/plans/contract";

export class PlanClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanClientError";
  }
}

export function newPlanIdempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${random}`;
}

async function readEnvelope<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => null)) as {
    data?: T;
    error?: { message?: unknown };
    success?: boolean;
  } | null;
  if (!response.ok || !body?.success) {
    const message = typeof body?.error?.message === "string" ? body.error.message : `HTTP ${response.status}`;
    throw new PlanClientError(message);
  }
  return body.data as T;
}

function isSnapshot(value: unknown): value is PlanSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.plan === "object" && record.plan !== null && Array.isArray(record.items) && Array.isArray(record.log);
}

/** 当前生效计划；没有计划时为 null。读不到时抛错（调用方显示「暂时读不到」）。 */
export async function fetchCurrentPlan(signal?: AbortSignal): Promise<PlanSnapshot | null> {
  const response = await fetch("/api/agent/plans/current", { cache: "no-store", signal });
  const data = await readEnvelope<unknown>(response);
  if (data === null) return null;
  if (!isSnapshot(data)) throw new PlanClientError("Unexpected plan payload.");
  return data;
}

export async function patchPlanActionDone(
  itemId: string,
  done: boolean,
): Promise<{ item: PlanItem; log: PlanLogEntry | null }> {
  const response = await fetch(`/api/agent/plans/items/${encodeURIComponent(itemId)}`, {
    body: JSON.stringify({
      change: { op: "set_status", status: done ? "done" : "not_started" },
      idempotencyKey: newPlanIdempotencyKey("plan-check"),
    }),
    headers: { "content-type": "application/json" },
    method: "PATCH",
  });
  return readEnvelope<{ item: PlanItem; log: PlanLogEntry | null }>(response);
}

/** 手动记录。`idempotencyKey` 由调用方为「一次提交」持有：重试时沿用，服务端回放第一次的结果。 */
export async function postPlanNote(body: string, idempotencyKey: string): Promise<PlanLogEntry> {
  const response = await fetch("/api/agent/plans/log", {
    body: JSON.stringify({ body, idempotencyKey }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return (await readEnvelope<{ entry: PlanLogEntry }>(response)).entry;
}

/** 乐观打勾：只改本地快照里的这一条行动。 */
export function withActionDone(snapshot: PlanSnapshot, itemId: string, done: boolean, now: Date): PlanSnapshot {
  return {
    ...snapshot,
    items: snapshot.items.map((item) =>
      item.id === itemId
        ? { ...item, completedAt: done ? now.toISOString() : null, status: done ? "done" : "not_started" }
        : item,
    ),
  };
}

/** 服务端确认后：用返回的条目替换本地那一条，新的进展记录放到最前。 */
export function withServerItem(snapshot: PlanSnapshot, item: PlanItem, log: PlanLogEntry | null): PlanSnapshot {
  return {
    ...snapshot,
    items: snapshot.items.map((current) => (current.id === item.id ? item : current)),
    log: log && !snapshot.log.some((entry) => entry.id === log.id) ? [log, ...snapshot.log] : snapshot.log,
  };
}

export function withLogEntry(snapshot: PlanSnapshot, entry: PlanLogEntry): PlanSnapshot {
  return snapshot.log.some((current) => current.id === entry.id)
    ? snapshot
    : { ...snapshot, log: [entry, ...snapshot.log] };
}
