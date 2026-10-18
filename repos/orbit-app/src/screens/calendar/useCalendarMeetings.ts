import { useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import type { OrbitLanguage } from "../../api/contract/language";
import type { ScheduleItemContract } from "../../api/contract/tasks";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { type PageCopy, type PageCopyStatus } from "../../data/sync/page-copies";
import { useApiResource } from "../../hooks/useApiResource";
import { usePageCopySession } from "../../hooks/usePageCopySession";
import { calendarDate, localParts } from "../../time/date-time";
import type { CalendarPart } from "../schedule/schedule-calendar-source-mirror";
import type { CalendarMode } from "./calendar-projection";
import { calendarMeetingWindow, readCalendarMeetings } from "./calendar-meeting-source";

const COPY_ID = "calendar-meetings";
type MeetingCopy = { from: string; to: string; language: OrbitLanguage; readLocalDate: string; meetings: ScheduleItemContract[] };
type MeetingCopyStatus = PageCopyStatus & { readLocalDate: string; stale: boolean };

function copyRows(value: unknown, from: string, to: string, language: OrbitLanguage): MeetingCopy | null {
  if (!value || typeof value !== "object") return null;
  const copy = value as MeetingCopy;
  if (copy.from !== from || copy.to !== to || copy.language !== language || typeof copy.readLocalDate !== "string" || !calendarDate(copy.readLocalDate)) return null;
  const meetings = readCalendarMeetings({ scheduleItems: copy.meetings });
  return meetings && meetings.length === copy.meetings.length ? { ...copy, meetings } : null;
}

function queueCopyOperation(queue: Map<string, Promise<void>>, scope: string, operation: () => Promise<void>): void {
  const previous = queue.get(scope) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation).catch(() => undefined);
  queue.set(scope, next);
  void next.then(() => { if (queue.get(scope) === next) queue.delete(scope); });
}

/** The native calendar keeps only meeting previews from an actor-authenticated calendar read. */
export function useCalendarMeetings(dateKey: string, mode: CalendarMode, timeZone: string, language: OrbitLanguage): {
  part: CalendarPart;
  copy: MeetingCopyStatus | null;
  refreshing: boolean;
  refresh(): void;
} {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const range = calendarMeetingWindow(dateKey, mode, timeZone);
  const ready = server.ready && auth.ready && auth.signedIn && Boolean(auth.actorId) && Boolean(range);
  const copyEnabled = ready && Platform.OS !== "web";
  const variant = range ? `${range.variant}|${language}` : "invalid";
  const actorBinding = JSON.stringify([server.baseUrl, auth.actorId, auth.cookieHeader, auth.notificationSessionRevision]);
  const scope = JSON.stringify([server.baseUrl, auth.actorId, auth.cookieHeader, auth.notificationSessionRevision, variant]);
  const path = range ? `/api/schedule-items?${new URLSearchParams({ scope: "calendar", from: range.from, to: range.to, language })}` : "/api/schedule-items";
  const network = useApiResource<unknown>(path, () => false, { cachePolicy: "network-only", enabled: ready, scopeKey: scope });
  const { session, whenReady } = usePageCopySession(copyEnabled);
  const [stored, setStored] = useState<{ key: string; copy: PageCopy<MeetingCopy> | null; settled: boolean }>({ key: "", copy: null, settled: false });
  const [now, setNow] = useState(() => new Date());
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const activeActorBinding = useRef(actorBinding);
  activeActorBinding.current = actorBinding;
  const deniedScopes = useRef(new Set<string>());
  const saved = useRef<{ scope: string; answer: unknown } | null>(null);
  const copyOperations = useRef(new Map<string, Promise<void>>());
  const authoritativeDenied = network.kind === "failure" && network.status >= 400 && network.status < 500;
  const current = stored.key === scope ? stored : { key: scope, copy: null, settled: false };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!copyEnabled || !range || authoritativeDenied || deniedScopes.current.has(scope)) return;
    let live = true;
    void whenReady().then(found => found?.readPageCopy<MeetingCopy>(COPY_ID, variant) ?? null).then(copy => {
      if (!live) return;
      const data = copy && copyRows(copy.data, range.from, range.to, language);
      setStored({ key: scope, copy: data && copy ? { ...copy, data } : null, settled: true });
    }).catch(() => { if (live) setStored({ key: scope, copy: null, settled: true }); });
    return () => { live = false; };
  }, [authoritativeDenied, copyEnabled, language, range?.from, range?.to, scope, session, variant, whenReady]);

  useEffect(() => {
    if (!copyEnabled || !range || !authoritativeDenied) return;
    deniedScopes.current.add(scope);
    if (saved.current?.scope === scope) saved.current = null;
    setStored(current => current.key === scope && current.settled && !current.copy ? current : { key: scope, copy: null, settled: true });
    queueCopyOperation(copyOperations.current, scope, async () => {
      const found = session ?? await whenReady();
      if (activeActorBinding.current === actorBinding) await found?.deletePageCopy(COPY_ID, variant);
    });
  }, [actorBinding, authoritativeDenied, copyEnabled, range?.from, range?.to, scope, session, variant, whenReady]);

  const answer = network.kind === "success" || network.kind === "empty" ? network.data : undefined;
  const meetings = answer === undefined ? null : readCalendarMeetings(answer);
  useEffect(() => {
    if (!copyEnabled || !range || meetings === null || answer === undefined || (saved.current?.scope === scope && saved.current.answer === answer)) return;
    deniedScopes.current.delete(scope);
    saved.current = { scope, answer };
    const data: MeetingCopy = { from: range.from, to: range.to, language, readLocalDate: localParts(new Date(), timeZone).date, meetings };
    queueCopyOperation(copyOperations.current, scope, async () => {
      const found = await whenReady();
      if (activeScope.current === scope && !deniedScopes.current.has(scope)) await found?.savePageCopy(COPY_ID, variant, data);
    });
  }, [answer, copyEnabled, language, meetings, range?.from, range?.to, scope, timeZone, variant, whenReady]);

  if (!ready || !range) return { part: { kind: "loading", data: null, message: "" }, copy: null, refreshing: false, refresh: network.refresh };
  if (meetings) return { part: { kind: "ready", data: { scheduleItems: meetings }, message: "" }, copy: null, refreshing: network.refreshing, refresh: network.refresh };
  const reason = network.kind === "offline" ? "unreachable" : network.kind === "failure" && network.status >= 500 ? "unavailable" : null;
  const useCopy = !deniedScopes.current.has(scope) && current.copy && (network.kind === "loading" || reason !== null);
  if (useCopy) {
    const copy = current.copy!;
    return {
      part: { kind: "ready", data: { scheduleItems: copy.data.meetings }, message: "" },
      copy: { lastSyncedAt: copy.syncedAt, offline: reason !== null, reason, readLocalDate: copy.data.readLocalDate, stale: copy.data.readLocalDate !== localParts(now, timeZone).date },
      refreshing: network.refreshing, refresh: network.refresh,
    };
  }
  if (network.kind === "loading" || (reason && !current.settled)) return { part: { kind: "loading", data: null, message: "" }, copy: null, refreshing: network.refreshing, refresh: network.refresh };
  return { part: { kind: reason ? "offline" : "failure", data: null, message: "calendar.view.invalid" }, copy: null, refreshing: network.refreshing, refresh: network.refresh };
}
