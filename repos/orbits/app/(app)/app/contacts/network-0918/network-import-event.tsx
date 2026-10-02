/**
 * W0053（W53-4）：「从活动添加」工作区。只列你在活动现场与对方互相交换过名片的人（按活动分组：已互换 N 人 · 其中已在人脉 M 人）；
 * 导入 = 给这些联系人补上「在该活动认识」并走一遍后续更新。没有互换过的参会者不能从这里导入——去活动页交换名片。
 */
"use client";

import { useEffect, useState } from "react";

import { importErrorCopy, followUpCopy } from "./network-import-file";
import { importApi, newIdempotencyKey, type ContactImportBatchView, type ImportableEventSummary } from "./network-import-client";

type Copy = { en: string; zh: string };
type T = (copy: Copy) => string;

function formatDay(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function EventImportPanel({ eventsHref, onChanged, t }: { eventsHref: string; onChanged: () => void; t: T }) {
  const [events, setEvents] = useState<readonly ImportableEventSummary[] | null>(null);
  const [error, setError] = useState<Copy | null>(null);
  const [busyEvent, setBusyEvent] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ContactImportBatchView>>({});
  const [keys] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void importApi.events()
      .then((data) => !cancelled && setEvents(data.events))
      .catch((caught) => {
        if (!cancelled) {
          setEvents([]);
          setError(importErrorCopy(caught));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function importEvent(eventId: string) {
    setBusyEvent(eventId);
    setError(null);
    keys[eventId] ??= newIdempotencyKey();
    try {
      const result = await importApi.importEvent(eventId, keys[eventId]!);
      setResults((current) => ({ ...current, [eventId]: result.batch }));
      onChanged();
    } catch (caught) {
      setError(importErrorCopy(caught));
    } finally {
      setBusyEvent(null);
    }
  }

  return (
    <div className="nwi-events" data-import-events>
      {events === null ? <div className="nwi-empty">{t({ en: "Loading your events…", zh: "正在读取你参加过的活动…" })}</div> : null}
      {events !== null && events.length === 0 && !error ? (
        <div className="nwi-empty" data-import-events-empty>{t({ en: "You have not exchanged cards with anyone at an event yet.", zh: "你还没有在活动现场和别人互换过名片。" })}</div>
      ) : null}
      {(events ?? []).map((event) => {
        const result = results[event.eventId];
        const follow = result ? followUpCopy(result) : null;
        return (
          <div key={event.eventId} className="nwi-event" data-import-event={event.eventId}>
            <span className="nwi-event-main">
              <strong>{event.title || t({ en: "Untitled event", zh: "未命名活动" })}</strong>
              <span className="nwi-row-sub">{formatDay(event.startsAt ?? event.lastExchangeAt)}</span>
              <span className="nwi-event-counts">
                {t({ en: `Exchanged ${event.exchanged} · ${event.inNetwork} already in your network`, zh: `已互换 ${event.exchanged} 人 · 其中已在人脉 ${event.inNetwork} 人` })}
                {event.syncing > 0 ? <span className="nwi-pill">{t({ en: `${event.syncing} syncing`, zh: `${event.syncing} 人同步中` })}</span> : null}
              </span>
            </span>
            <span className="nwi-actions">
              {result ? (
                <span className="nwi-row-sub" data-import-event-result>
                  {t({ en: `Marked ${result.counts.merged} as met here`, zh: `已为 ${result.counts.merged} 人记上「在该活动认识」` })}
                  {follow ? ` · ${t(follow)}` : ""}
                </span>
              ) : (
                <button type="button" className="btn nwi-primary" disabled={busyEvent !== null || event.inNetwork === 0} onClick={() => void importEvent(event.eventId)}>
                  {busyEvent === event.eventId ? t({ en: "Adding…", zh: "正在添加…" }) : t({ en: `Add ${event.inNetwork}`, zh: `添加 ${event.inNetwork} 人` })}
                </button>
              )}
            </span>
          </div>
        );
      })}
      {error ? <p className="nwi-error" role="alert">{t(error)}</p> : null}
      <p className="nwi-drop-hint">
        {t({ en: "Only people you exchanged cards with can be added. For other attendees, ", zh: "只有互相交换过名片的人可以添加；其他参会者请" })}
        <a className="nwi-link" href={eventsHref}>{t({ en: "exchange cards on the event page", zh: "去活动页交换名片" })}</a>
        {t({ en: ".", zh: "。" })}
      </p>
    </div>
  );
}
