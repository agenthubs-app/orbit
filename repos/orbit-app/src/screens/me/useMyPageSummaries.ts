import { useMemo } from "react";
import type { HostCenterSummary } from "../../api/contract/host-events";
import { myEventsResponseSchema } from "../../api/schema/events-mine";
import { hostCenterSummarySchema } from "../../api/schema/host-events";
import { usePageCopyResource } from "../../hooks/usePageCopyResource";
import { useRelationshipInboxBadgeCount } from "../../hooks/useRelationshipInboxBadgeCount";
import { EVENTS_COPY_FRESH_MS, EVENTS_MINE_UPCOMING_PATH } from "../events/v2/events-copies";

/** LF8: how long the my page shows the saved host summary without re-reading it. */
export const MY_PAGE_HOST_FRESH_MS = 10 * 60_000;

/**
 * LF8: the my page's three counts. Unread is the Home bell's count (on the device where the mirror holds the
 * inbox); going is the events tab's 参加予定 copy, the list the row opens (the server counts plan items and
 * pending reviews the device does not hold); the host summary is its own copy. Offline each keeps its last value.
 */
export function useMyPageSummaries(enabled: boolean, scopeKey: string): { unread: number | null; going: number | null; host: HostCenterSummary | null } {
  const badge = useRelationshipInboxBadgeCount(scopeKey);
  const goingCopy = usePageCopyResource<unknown>(EVENTS_MINE_UPCOMING_PATH, () => false, { copy: { id: "events-mine", variant: "upcoming" }, enabled,
    freshForMs: EVENTS_COPY_FRESH_MS, accept: (value) => myEventsResponseSchema.safeParse(value).success });
  const hostCopy = usePageCopyResource<unknown>("/api/events/center?summary=1", () => false, { copy: { id: "host-summary" }, enabled,
    freshForMs: MY_PAGE_HOST_FRESH_MS, accept: (value) => hostCenterSummarySchema.safeParse(value).success });
  const goingData = goingCopy.kind === "success" || goingCopy.kind === "empty" ? goingCopy.data : undefined;
  const hostData = hostCopy.kind === "success" || hostCopy.kind === "empty" ? hostCopy.data : undefined;
  return useMemo(() => {
    const going = myEventsResponseSchema.safeParse(goingData);
    const host = hostCenterSummarySchema.safeParse(hostData);
    return { unread: badge ?? 0, going: going.success ? going.data.upcomingCount : null, host: host.success ? host.data as HostCenterSummary : null };
  }, [badge, goingData, hostData]);
}
