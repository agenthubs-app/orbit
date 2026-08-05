"use client";

import { useEffect, useState } from "react";

import type {
  EventAnalyticsAttendeeReport,
  EventAnalyticsOrganizerAggregate,
} from "../../../../../../features/events/event-analytics/contract";
import { EventAnalyticsReport } from "../../../../../../features/events/event-analytics/report";

type AnalyticsView =
  | EventAnalyticsAttendeeReport
  | EventAnalyticsOrganizerAggregate;

type AnalyticsViewKind = AnalyticsView["kind"];

interface AnalyticsViews {
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

export function EventAnalyticsRoute({ eventId }: { eventId: string }) {
  const [views, setViews] = useState<AnalyticsViews>({
    attendee_report: null,
    organizer_aggregate: null,
  });
  const [activeView, setActiveView] = useState<AnalyticsViewKind | null>(null);
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
  }, [encodedEventId, requestVersion]);

  const value = activeView ? views[activeView] : null;
  const canSwitchViews = Boolean(
    views.organizer_aggregate && views.attendee_report,
  );

  return (
    <main style={{ display: "grid", gap: 16, margin: "0 auto", maxWidth: 960, padding: "24px 16px" }}>
      <header style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between" }}>
        <div>
          <span className="eyebrow">EVENT ANALYTICS</span>
          <h1 style={{ fontSize: 24, margin: "5px 0 0" }}>活动数据报告</h1>
        </div>
        <a className="btn btn-ghost btn-sm" href={`/app/events/${encodedEventId}`}>
          返回活动详情
        </a>
      </header>
      {canSwitchViews ? (
        <nav
          aria-label="活动报告视图"
          data-event-analytics-view-switch
          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
        >
          <button
            aria-pressed={activeView === "organizer_aggregate"}
            className={activeView === "organizer_aggregate" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
            data-event-analytics-view="organizer_aggregate"
            onClick={() => setActiveView("organizer_aggregate")}
            type="button"
          >
            组织者汇总
          </button>
          <button
            aria-pressed={activeView === "attendee_report"}
            className={activeView === "attendee_report" ? "btn btn-primary btn-sm" : "btn btn-ghost btn-sm"}
            data-event-analytics-view="attendee_report"
            onClick={() => setActiveView("attendee_report")}
            type="button"
          >
            我的报告
          </button>
        </nav>
      ) : null}
      {error ? (
        <div
          className="card-flat"
          role="alert"
          style={{ alignItems: "center", color: "var(--danger)", display: "flex", gap: 12, justifyContent: "space-between", padding: 14 }}
        >
          <span>{error}</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setRequestVersion((version) => version + 1)}
            type="button"
          >
            重试
          </button>
        </div>
      ) : null}
      {!error && !value ? (
        <div className="card-flat" aria-live="polite" style={{ padding: 14 }}>
          正在读取活动证据…
        </div>
      ) : null}
      {value ? <EventAnalyticsReport value={value} /> : null}
    </main>
  );
}
