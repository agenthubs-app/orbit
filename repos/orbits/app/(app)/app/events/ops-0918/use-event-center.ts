"use client";

import { useCallback, useEffect, useState } from "react";

// 原样抽自 center/event-center-workspace.tsx（8–32、131–161 行）：
// 类型 + requestJson + 列表加载状态。角色/生命周期谓词留在组件。

export type EventRole =
  | "owner"
  | "operations"
  | "check_in"
  | "reviewer"
  | "read_only_analyst";

export interface EventCenterItem {
  endsAt: string | null;
  eventId: string;
  lifecycleState: string;
  migrationPending: boolean;
  owner: boolean;
  revision: number;
  role: EventRole;
  startsAt: string | null;
  title: string | null;
  venue: string | null;
}

interface ApiEnvelope<T> {
  data?: T;
  error?: { message?: string };
  success: boolean;
}

async function requestJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const envelope = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;
  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw new Error(envelope?.error?.message ?? "无法加载运营活动中心。");
  }
  return envelope.data;
}

/**
 * 运营活动中心会话：
 * - `events`：`GET /api/events/center` 返回的可访问活动列表（失败时为空数组）
 * - `error`：加载错误文案 | null
 * - `loading`：首次加载 / 刷新中
 * - `load()`：重新拉取列表（「刷新列表」按钮）
 */
export interface EventCenterSession {
  events: readonly EventCenterItem[];
  error: string | null;
  loading: boolean;
  load: () => Promise<void>;
}

export function useEventCenter(): EventCenterSession {
  const [events, setEvents] = useState<readonly EventCenterItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await requestJson<readonly EventCenterItem[]>("/api/events/center");
      setEvents(next);
      setError(null);
    } catch (cause) {
      setEvents([]);
      setError(cause instanceof Error ? cause.message : "无法加载运营活动中心。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { events, error, loading, load };
}
