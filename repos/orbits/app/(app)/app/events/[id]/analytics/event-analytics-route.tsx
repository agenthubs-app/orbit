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

/** Orbit_0918 数据报告路由样式（类选择器，避免属性选择器转义问题）。 */
const AN_ROUTE_CSS = `
.an-route { margin: 0 auto; max-width: 1240px; padding: 14px clamp(16px,4vw,40px) 72px; display: flex; flex-direction: column; gap: 22px; background: #FBFBFE; color: #0E1225; font-family: 'Noto Sans SC','PingFang SC','Hiragino Sans GB',sans-serif; min-height: 60vh; }
.an-route .an-crumb { font-size: 13px; color: #9FA3C4; }
.an-route .an-crumb a { color: #6B6F99; text-decoration: none; }
.an-route .an-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 18px; }
.an-route .an-head-title { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.an-route .an-eyebrow { font-size: 10px; letter-spacing: .14em; color: #9FA3C4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.an-route .an-head h1 { margin: 0; font-family: 'Noto Serif SC','Songti SC','SimSun',serif; font-weight: 900; font-size: clamp(28px,3.4vw,40px); letter-spacing: -0.03em; }
.an-route .an-head p { margin: 0; font-size: 15px; color: #3B3F7A; }
.an-route .an-switch { display: flex; gap: 6px; padding: 5px; border-radius: 10px; background: #F7F7FD; align-self: flex-start; }
.an-route .an-switch-btn { padding: 10px 20px; border: 0; border-radius: 8px; background: transparent; color: #6B6F99; font-size: 13px; font-family: inherit; cursor: pointer; }
.an-route .an-switch-btn.an-switch-on { background: #2E3270; color: #FFFFFF; font-weight: 500; }
.an-route .an-alert { display: flex; align-items: center; justify-content: space-between; gap: 12px; border: 1px solid #FBECEA; background: #FBECEA; color: #B5473A; border-radius: 14px; padding: 14px 16px; font-size: 14px; }
.an-route .an-alert-retry { padding: 9px 16px; border: 1px solid #B5473A; border-radius: 9px; background: #FFFFFF; color: #B5473A; font-size: 13px; font-family: inherit; cursor: pointer; }
.an-route .an-loading { border: 1px solid #E8E9F6; border-radius: 18px; background: #FFFFFF; padding: 24px; font-size: 14px; color: #6B6F99; }
`;

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
    <main className="an-route">
      <style>{AN_ROUTE_CSS}</style>
      <nav className="an-crumb">
        <a href={`/app/events/${encodedEventId}`}>活动详情</a>
        {" / "}
        <span>数据报告</span>
      </nav>
      <header className="an-head">
        <div className="an-head-title">
          <span className="an-eyebrow">EVENT ANALYTICS</span>
          <h1>数据报告</h1>
          <p>查看活动整体表现与会后跟进情况。</p>
        </div>
        {canSwitchViews ? (
          <nav
            aria-label="活动报告视图"
            className="an-switch"
            data-event-analytics-view-switch
          >
            <button
              aria-pressed={activeView === "organizer_aggregate"}
              className={activeView === "organizer_aggregate" ? "an-switch-btn an-switch-on" : "an-switch-btn"}
              data-event-analytics-view="organizer_aggregate"
              onClick={() => setActiveView("organizer_aggregate")}
              type="button"
            >
              组织者汇总
            </button>
            <button
              aria-pressed={activeView === "attendee_report"}
              className={activeView === "attendee_report" ? "an-switch-btn an-switch-on" : "an-switch-btn"}
              data-event-analytics-view="attendee_report"
              onClick={() => setActiveView("attendee_report")}
              type="button"
            >
              我的报告
            </button>
          </nav>
        ) : null}
      </header>
      {error ? (
        <div className="an-alert" role="alert">
          <span>{error}</span>
          <button
            className="an-alert-retry"
            onClick={() => setRequestVersion((version) => version + 1)}
            type="button"
          >
            重试
          </button>
        </div>
      ) : null}
      {!error && !value ? (
        <div className="an-loading" aria-live="polite">
          正在读取活动证据…
        </div>
      ) : null}
      {value ? <EventAnalyticsReport value={value} /> : null}
    </main>
  );
}
