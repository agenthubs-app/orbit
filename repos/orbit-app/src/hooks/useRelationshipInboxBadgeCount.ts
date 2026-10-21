import { useIsFocused } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import { useOrbitApiBaseUrl } from "../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../api/AuthSessionProvider";
import { subscribeInboxBadge } from "../api/inbox-badge-resource";
import { useOrbitApiClient } from "./useOrbitApiClient";
import { useLocalInbox } from "./useLocalInbox";
import { localInboxUnreadCount } from "../view-models/inbox-local";
import { withoutMailSummary } from "../api/compute/secretary-source";
import { useLocalRelationshipConversations } from "./useLocalRelationshipMessages";
import { localRelationshipUnreadTotal } from "../view-models/relationship-local";

const capped = (count: number) => (count > 0 ? Math.min(count, 99) : undefined);

/** LF3: how often a visible badge refreshes its device copies. */
export const BADGE_DEVICE_REFRESH_MS = 60_000;

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
  // Sprint 0119: the message part is counted on the device too (the sum of the account's member rows, the server's rule).
  const threads = useLocalRelationshipConversations(false);

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

  // LF3: with both device copies (native always) the badge is counted on the device; instead of polling the server
  // summary every 15 s, the copies are refreshed through the sync coordinator (a conditional read, 304 when unchanged)
  // once a minute while the badge is visible.
  const deviceCounts = local.available && threads.available;
  const refreshLocal = local.refresh, refreshThreads = threads.refresh;
  useEffect(() => {
    if (!scope.ready || !deviceCounts) return;
    const tick = () => { void refreshLocal(); void refreshThreads(); };
    tick();
    const timer = setInterval(tick, BADGE_DEVICE_REFRESH_MS);
    return () => clearInterval(timer);
  }, [deviceCounts, refreshLocal, refreshThreads, scope]);

  useEffect(() => {
    if (!scope.ready || deviceCounts) return;
    let active = true;
    const refresh = previousScopeKey.current !== scopeKey;
    previousScopeKey.current = scopeKey;
    const unsubscribe = subscribeInboxBadge({ scope: sharedKey, actorId, client, refresh, listener: (count, messages) => {
      if (active && latest.current === scope && nativeActive.current) setSnapshot({ scope, count, ...(messages === undefined ? {} : { messages }) });
    } });
    const stop = () => { active = false; unsubscribe(); };
    release.current = stop;
    return () => { stop(); if (release.current === stop) release.current = null; };
  }, [actorId, client, deviceCounts, scope, sharedKey]);

  const summary = scope.ready && snapshot?.scope === scope ? snapshot : null;
  if (scope.ready && local.available && local.freshness.readable) {
    const notices = localInboxUnreadCount(withoutMailSummary(local.rows), Date.now());
    const messages = threads.available && threads.freshness.readable ? localRelationshipUnreadTotal(threads.conversations) : summary?.messages;
    if (messages !== undefined) return capped(messages + notices);
    if (local.freshness.offline || summary) return capped(notices);
  }
  return summary?.count;
}
