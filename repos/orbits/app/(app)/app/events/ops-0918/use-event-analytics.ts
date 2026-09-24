"use client";

import { useEffect, useState } from "react";

import type {
  EventAnalyticsAttendeeReport,
  EventAnalyticsOrganizerAggregate,
} from "../../../../../features/events/event-analytics/contract";

// 原样抽自 [id]/analytics/event-analytics-route.tsx（11–34、55–123 行）：
// aggregate/attendee 两接口并行读取、403 双拒绝文案、重试计数。UI 本地状态
// `activeView` 留在组件；加载逻辑原样调用传入的 `setActiveView`（先清空，再按
// aggregate 是否可用选默认视图）。

export type AnalyticsView =
  | EventAnalyticsAttendeeReport
  | EventAnalyticsOrganizerAggregate;

export type AnalyticsViewKind = AnalyticsView["kind"];

export interface AnalyticsViews {
  attendee_report: EventAnalyticsAttendeeReport | null;
  organizer_aggregate: EventAnalyticsOrganizerAggregate | null;
}

interface Envelope<TValue> {
  data?: TValue;
  error?: { message?: string };
  success?: boolean;
}

async function readData<TValue>(response: Response): Promise<TValue> {
  const body = (await response.json().catch(() => null)) as Envelope<TValue> | null;
  if (!response.ok || body?.success !== true || !body.data) {
    throw new Error(body?.error?.message ?? `Request failed with ${response.status}.`);
  }
  return body.data;
}

/**
 * 数据报告会话（`GET /analytics/aggregate` + `GET /analytics/attendee`）：
 * - `views`：两份报告（缺权限的为 null）
 * - `value`：当前 `activeView` 对应的报告 | null
 * - `canSwitchViews`：两份都可用时显示视图切换
 * - `error`；`retry()`：重新拉取（重试按钮）
 */
export interface EventAnalyticsSession {
  canSwitchViews: boolean;
  error: string | null;
  retry: () => void;
  value: AnalyticsView | null;
  views: AnalyticsViews;
}

export function useEventAnalytics(
  eventId: string,
  activeView: AnalyticsViewKind | null,
  setActiveView: (view: AnalyticsViewKind | null) => void,
): EventAnalyticsSession {
  const [views, setViews] = useState<AnalyticsViews>({
    attendee_report: null,
    organizer_aggregate: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const encodedEventId = encodeURIComponent(eventId);

  useEffect(() => {
    let active = true;
    async function load() {
      setError(null);
      setViews({ attendee_report: null, organizer_aggregate: null });
      setActiveView(null);
      try {
        const [aggregateResponse, attendeeResponse] = await Promise.all([
          fetch(`/api/events/${encodedEventId}/analytics/aggregate`, {
            cache: "no-store",
          }),
          fetch(`/api/events/${encodedEventId}/analytics/attendee`, {
            cache: "no-store",
          }),
        ]);
        const [aggregate, attendee] = await Promise.all([
          aggregateResponse.ok
            ? readData<EventAnalyticsOrganizerAggregate>(aggregateResponse)
            : Promise.resolve(null),
          attendeeResponse.ok
            ? readData<EventAnalyticsAttendeeReport>(attendeeResponse)
            : Promise.resolve(null),
        ]);
        if (!aggregate && !attendee) {
          const actionableFailure = [aggregateResponse, attendeeResponse].find(
            (response) => response.status !== 403,
          );
          if (actionableFailure) {
            await readData<AnalyticsView>(actionableFailure);
          }
          throw new Error("当前账号没有可查看的活动汇总或个人报告。");
        }
        if (active) {
          const nextViews: AnalyticsViews = {
            attendee_report: attendee,
            organizer_aggregate: aggregate,
          };
          setViews(nextViews);
          setActiveView(
            aggregate ? "organizer_aggregate" : "attendee_report",
          );
        }
      } catch (cause) {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "无法读取活动报告。",
          );
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encodedEventId, requestVersion]);

  const value = activeView ? views[activeView] : null;
  const canSwitchViews = Boolean(
    views.organizer_aggregate && views.attendee_report,
  );

  return {
    canSwitchViews,
    error,
    retry: () => setRequestVersion((version) => version + 1),
    value,
    views,
  };
}
