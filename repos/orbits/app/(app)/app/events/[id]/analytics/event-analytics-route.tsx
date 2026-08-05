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
  const [value, setValue] = useState<AnalyticsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const encodedEventId = encodeURIComponent(eventId);

  useEffect(() => {
    let active = true;
    async function load() {
      setError(null);
      setValue(null);
      try {
        const aggregateResponse = await fetch(
          `/api/events/${encodedEventId}/analytics/aggregate`,
          { cache: "no-store" },
        );
        if (aggregateResponse.ok) {
          const aggregate = await readData<EventAnalyticsOrganizerAggregate>(
            aggregateResponse,
          );
          if (active) setValue(aggregate);
          return;
        }
        if (aggregateResponse.status !== 403) {
          await readData<EventAnalyticsOrganizerAggregate>(aggregateResponse);
          return;
        }
        const attendee = await readData<EventAnalyticsAttendeeReport>(
          await fetch(`/api/events/${encodedEventId}/analytics/attendee`, {
            cache: "no-store",
          }),
        );
        if (active) setValue(attendee);
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
