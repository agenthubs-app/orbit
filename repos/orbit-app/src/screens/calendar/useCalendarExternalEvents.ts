import { useMemo } from "react";

import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useApiResource } from "../../hooks/useApiResource";
import type { CalendarMode } from "./calendar-projection";
import { calendarExternalRanges } from "./calendar-external-range";
import { readCalendarExternalChunks, type CalendarExternalView } from "./calendar-external-state";

const PATH = "/api/calendar/external-events";
const pathFor = (range: { from: string; to: string } | undefined) => range
  ? `${PATH}?${new URLSearchParams(range).toString()}` : PATH;

/** Network-only: provider events are never copied into device mirrors or snapshots. */
export function useCalendarExternalEvents(dateKey: string, mode: CalendarMode, timeZone: string, enabled: boolean): {
  view: CalendarExternalView | null;
  refreshing: boolean;
  refresh(): void;
} {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const ranges = useMemo(() => calendarExternalRanges(dateKey, mode, timeZone), [dateKey, mode, timeZone]);
  const ready = enabled && auth.ready && auth.signedIn && Boolean(auth.actorId);
  const scope = JSON.stringify([auth.actorId, auth.cookieHeader, auth.notificationSessionRevision, server.baseUrl, dateKey, mode, timeZone]);
  const first = useApiResource<unknown>(pathFor(ranges[0]), () => false, {
    cachePolicy: "network-only", enabled: ready && ranges.length > 0, scopeKey: `${scope}:0`,
  });
  const second = useApiResource<unknown>(pathFor(ranges[1]), () => false, {
    cachePolicy: "network-only", enabled: ready && ranges.length > 1, scopeKey: `${scope}:1`,
  });
  if (!ready) return { view: null, refreshing: false, refresh() {} };
  if (!ranges.length) return { view: { connection: "unavailable", events: [] }, refreshing: false, refresh() {} };
  const resources = ranges.length > 1 ? [first, second] : [first];
  const view = resources.some(resource => resource.kind === "loading") ? null
    : readCalendarExternalChunks(resources.map(resource => resource.kind === "success" || resource.kind === "empty" ? resource.data : null));
  return { view, refreshing: resources.some(resource => resource.refreshing), refresh() { for (const resource of resources) resource.refresh(); } };
}
