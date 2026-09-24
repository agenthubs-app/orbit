import {notificationInboxData,INBOX_NOTIFICATIONS_PATH} from '../api/inbox-notifications';
import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { readLegacyNotificationUnreadCount, type LegacyUnreadCapability } from "../api/legacy-notification-unread-summary";
import { readRelationshipUnreadCount, type RelationshipUnreadCapability } from "../api/relationship-unread-summary";
import {
  MESSAGE_STATE_FOREGROUND_REFRESH_MS,
  subscribeMessageStateInvalidation,
} from "../api/message-state";
import { useOrbitApiClient } from "./useOrbitApiClient";
import {
  relationshipAlertsToView,
  relationshipInboxBadgeCount,
} from "../view-models/relationship-inbox";

export function useRelationshipInboxBadgeCount(scopeKey?: string): number | undefined {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [resumeIndex, setResumeIndex] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const nativeActive = useRef(foreground);
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const actorId = auth.actorId ?? "";
  const ready = focused && foreground && auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const scope = useMemo(() => ({ key: String(++sequence.current), ready, unreadCapability: {} as RelationshipUnreadCapability, legacyCapability: {} as LegacyUnreadCapability }),
    [ready, actorId, auth.cookieHeader, server.baseUrl, scopeKey, resumeIndex]);
  const latest = useRef(scope);
  latest.current = scope;
  const client = useOrbitApiClient({ scopeKey: scope.key });
  const [snapshot, setSnapshot] = useState<{ scope: typeof scope; signal: AbortSignal; count: number | undefined } | null>(null);

  useEffect(() => {
    const listener = AppState.addEventListener("change", state => {
      const active = state === "active";
      // Revoke before React renders so a late 401 cannot expire the session.
      if (!active) pending.current?.abort();
      if (active && !nativeActive.current) setResumeIndex(value => value + 1);
      nativeActive.current = active;
      setForeground(active);
    });
    return () => { listener.remove(); pending.current?.abort(); };
  }, []);

  useEffect(() => {
    if (!scope.ready) return;
    const refresh = () => setAttempt(value => value + 1);
    const timer = setInterval(refresh, MESSAGE_STATE_FOREGROUND_REFRESH_MS);
    const unsubscribe = subscribeMessageStateInvalidation(refresh);
    return () => { clearInterval(timer); unsubscribe(); };
  }, [scope]);

  useEffect(() => {
    if (!scope.ready) return;
    const controller = new AbortController();
    pending.current = controller;
    const current = () => latest.current === scope && !controller.signal.aborted;
    // Each source can contribute independently, but never from an old scope or
    // a cached content preview while the current unread state is unknown.
    const data: { inbox?: number | undefined; notifications?: number | undefined; typed?: unknown } = {};
    async function read(path: string, source: keyof typeof data) {
      try {
        if (source === "inbox") {
          const count = await readRelationshipUnreadCount({ client, actorId, signal: controller.signal, capability: scope.unreadCapability });
          if (!current()) return;
          data.inbox = count;
        } else if (source === "notifications") {
          const count = await readLegacyNotificationUnreadCount({client,actorId,signal:controller.signal,capability:scope.legacyCapability});
          if (!current()) return;
          data.notifications = count;
        } else {
          const result = await client.get<unknown>(path, { signal: controller.signal });
          if (!current()) return;
          data[source] = result.success && result.status >= 200 && result.status < 300 ? result.data : null;
        }
      } catch {
        if (!current()) return;
        if (source === "inbox" || source === "notifications") data[source] = undefined;
        else data[source] = null;
      }
      const typed=notificationInboxData(data.typed,actorId);
      const count = (typed?.enabled ? typed.unreadCount : typed?.enabled === false ? data.notifications ?? 0 : 0) + relationshipInboxBadgeCount({
        conversations: [], selected: null, summary: "暂无对话", title: "收件箱", unreadTotal: data.inbox ?? 0,
      }, relationshipAlertsToView(null));
      setSnapshot({ scope, signal: controller.signal, count: count > 0 ? Math.min(count, 99) : undefined });
    }
    void read("", "inbox");
    void read("", "notifications");
    // The global count is independent of page size. Until typed summary has a
    // producer-complete read-only endpoint, request the smallest supported page.
    void read(`${INBOX_NOTIFICATIONS_PATH}?limit=1`, "typed");
    return () => {
      controller.abort();
      if (pending.current === controller) pending.current = null;
    };
  }, [actorId, attempt, client, scope]);

  return scope.ready && snapshot?.scope === scope && !snapshot.signal.aborted ? snapshot.count : undefined;
}
