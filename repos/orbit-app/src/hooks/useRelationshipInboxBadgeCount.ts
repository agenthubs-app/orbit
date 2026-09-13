import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { ORBIT_API_ENDPOINTS, relationshipInboxPath } from "../api/endpoints";
import { useOrbitApiClient } from "./useOrbitApiClient";
import {
  relationshipAlertsToView,
  relationshipInboxBadgeCount,
  relationshipInboxToView
} from "../view-models/relationship-inbox";

export function useRelationshipInboxBadgeCount(scopeKey?: string): number | undefined {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [resumeIndex, setResumeIndex] = useState(0);
  const nativeActive = useRef(foreground);
  const pending = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const ready = focused && foreground && auth.ready && auth.signedIn && server.ready && Boolean(auth.user?.id);
  const scope = useMemo(() => ({ key: String(++sequence.current), ready }),
    [ready, auth.user?.id, auth.cookieHeader, server.baseUrl, scopeKey, resumeIndex]);
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
    const controller = new AbortController();
    pending.current = controller;
    const current = () => latest.current === scope && !controller.signal.aborted;
    // Each source can contribute independently, but never from an old scope or
    // a cached content preview while the current unread state is unknown.
    const data: { inbox?: unknown; notifications?: unknown } = {};
    async function read(path: string, source: keyof typeof data) {
      try {
        const result = await client.get<unknown>(path, { signal: controller.signal });
        if (!current()) return;
        data[source] = result.success && result.status >= 200 && result.status < 300 ? result.data : null;
      } catch {
        if (!current()) return;
        data[source] = null;
      }
      const inbox = relationshipInboxToView(data.inbox);
      const alerts = relationshipAlertsToView(data.notifications);
      const count = relationshipInboxBadgeCount(inbox, alerts);
      setSnapshot({ scope, signal: controller.signal, count: count > 0 ? Math.min(count, 99) : undefined });
    }
    void read(relationshipInboxPath(), "inbox");
    void read(ORBIT_API_ENDPOINTS.notifications, "notifications");
    return () => {
      controller.abort();
      if (pending.current === controller) pending.current = null;
    };
  }, [client, scope]);

  return scope.ready && snapshot?.scope === scope && !snapshot.signal.aborted ? snapshot.count : undefined;
}
