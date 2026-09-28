import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { subscribeInboxBadge } from "../api/inbox-badge-resource";
import { useOrbitApiClient } from "./useOrbitApiClient";
import { useLocalInbox } from "./useLocalInbox";
import { localInboxUnreadCount } from "../view-models/inbox-local";

const capped = (count: number) => (count > 0 ? Math.min(count, 99) : undefined);

export function useRelationshipInboxBadgeCount(scopeKey?: string): number | undefined {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [resumeIndex, setResumeIndex] = useState(0);
  const nativeActive = useRef(foreground);
  const release = useRef<(() => void) | null>(null);
  const actorId = auth.actorId ?? "";
  const ready = focused && foreground && auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const scope = useMemo(() => ({ ready }), [ready, actorId, auth.cookieHeader, server.baseUrl, scopeKey, resumeIndex]);
  const sharedKey = JSON.stringify(["inbox-summary-v1", server.baseUrl, actorId, auth.cookieHeader]);
  const previousScopeKey = useRef(scopeKey);
  const latest = useRef(scope);
  latest.current = scope;
  const client = useOrbitApiClient({ scopeKey: sharedKey });
  const [snapshot, setSnapshot] = useState<{ scope: typeof scope; count: number | undefined; messages?: number } | null>(null);
  // Sprint 0118: where the device mirror holds the inbox, its notification part is counted on the device
  // (the same rule as the server) and added to the server's message count; offline it stands alone.
  const local = useLocalInbox(false);

  useEffect(() => {
    const listener = AppState.addEventListener("change", state => {
      const active = state === "active";
      // Revoke before React renders so a late 401 cannot expire the session.
      if (!active) { release.current?.(); release.current = null; }
      if (active && !nativeActive.current) setResumeIndex(value => value + 1);
      nativeActive.current = active;
      setForeground(active);
    });
    return () => { listener.remove(); release.current?.(); release.current = null; };
  }, []);

  useEffect(() => {
    if (!scope.ready) return;
    let active = true;
    const refresh = previousScopeKey.current !== scopeKey;
    previousScopeKey.current = scopeKey;
    const unsubscribe = subscribeInboxBadge({ scope: sharedKey, actorId, client, refresh, listener: (count, messages) => {
      if (active && latest.current === scope && nativeActive.current) setSnapshot({ scope, count, ...(messages === undefined ? {} : { messages }) });
    } });
    const stop = () => { active = false; unsubscribe(); };
    release.current = stop;
    return () => { stop(); if (release.current === stop) release.current = null; };
  }, [actorId, client, scope, sharedKey]);

  const summary = scope.ready && snapshot?.scope === scope ? snapshot : null;
  if (scope.ready && local.available && local.freshness.readable) {
    const notices = localInboxUnreadCount(local.rows, Date.now());
    if (summary?.messages !== undefined) return capped(summary.messages + notices);
    if (local.freshness.offline || summary) return capped(notices);
  }
  return summary?.count;
}
