/**
 * 「我的计划」页与 iOrbit 首页共用的计划读写（W0009）。只走 W0007 已验证的接口：
 *
 * - `GET   /api/agent/plans/current`         读当前生效计划（null = 还没有）
 * - `PATCH /api/agent/plans/items/:itemId`   行动打勾 / 取消（`set_status`，带幂等键；
 *                                            服务端在同一事务里写一条 auto 进展记录并返回）
 * - `POST  /api/agent/plans/log`             手动记一笔进展（可带结构化的 @ 联系人／活动，W0012）
 * - `POST  /api/agent/plans/reanalyze`       重新分析／到期后制定下一份（W0012）
 * - `GET   /api/agent/plans/weekly-summary`  东京周一的上周小结（W0012）
 *
 * 快照的乐观更新也放在这里（纯函数），两处界面同一口径：先改本地、失败整份回滚。
 * 本文件不 import React。
 */
import type {
  PlanItem,
  PlanLogEntry,
  PlanViewSnapshot,
  PlanVersionOrigin,
  ReanalysisQuota,
} from "../../../../../features/plans/contract";
import type { PlanWeeklySummary } from "../../../../../features/plans/weekly-summary";

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

function isSnapshot(value: unknown): value is PlanViewSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.plan === "object" && record.plan !== null && Array.isArray(record.items) && Array.isArray(record.log);
}

/** 当前生效计划；没有计划时为 null。读不到时抛错（调用方显示「暂时读不到」）。 */
export async function fetchCurrentPlan(signal?: AbortSignal): Promise<PlanViewSnapshot | null> {
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
export async function postPlanNote(
  body: string,
  idempotencyKey: string,
  mentions: { contactIds?: readonly string[]; eventId?: string | null } = {},
): Promise<PlanLogEntry> {
  const response = await fetch("/api/agent/plans/log", {
    body: JSON.stringify({
      body,
      idempotencyKey,
      ...(mentions.contactIds?.length ? { linkedContactIds: mentions.contactIds } : {}),
      ...(mentions.eventId ? { linkedEventId: mentions.eventId } : {}),
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return (await readEnvelope<{ entry: PlanLogEntry }>(response)).entry;
}

/** 重新分析（`reanalysis`，占本月额度）或到期后的下一份（`next_plan`，不占额度）。键由调用方为一次点击持有。 */
export async function postPlanReanalyze(input: {
  basePlanId: string;
  origin: PlanVersionOrigin;
  idempotencyKey: string;
  locale: "en" | "zh";
}): Promise<{ planId: string; version: number; replayed: boolean; quota: ReanalysisQuota }> {
  const response = await fetch("/api/agent/plans/reanalyze", {
    body: JSON.stringify(input),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  return readEnvelope<{ planId: string; version: number; replayed: boolean; quota: ReanalysisQuota }>(response);
}

/** 东京周一的上周小结；其他日子或没有计划时为 null。 */
export async function fetchWeeklySummary(signal?: AbortSignal): Promise<PlanWeeklySummary | null> {
  const response = await fetch("/api/agent/plans/weekly-summary", { cache: "no-store", signal });
  return readEnvelope<PlanWeeklySummary | null>(response);
}

/** 乐观打勾：只改本地快照里的这一条行动。 */
export function withActionDone(snapshot: PlanViewSnapshot, itemId: string, done: boolean, now: Date): PlanViewSnapshot {
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
export function withServerItem(snapshot: PlanViewSnapshot, item: PlanItem, log: PlanLogEntry | null): PlanViewSnapshot {
  return {
    ...snapshot,
    items: snapshot.items.map((current) => (current.id === item.id ? item : current)),
    log: log && !snapshot.log.some((entry) => entry.id === log.id) ? [log, ...snapshot.log] : snapshot.log,
  };
}

export function withLogEntry(snapshot: PlanViewSnapshot, entry: PlanLogEntry): PlanViewSnapshot {
  return snapshot.log.some((current) => current.id === entry.id)
    ? snapshot
    : { ...snapshot, log: [entry, ...snapshot.log] };
}
