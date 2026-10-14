import { useIsFocused } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { EventsHome } from "../../src/screens/events/v2/EventsHome";

export default function EventsRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const enabled = focused && auth.ready && server.ready;
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, auth.signedIn, auth.user?.id, auth.cookieHeader, server.baseUrl]);
  const latest = useRef(scope);
  latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  // R26: the new イベント page (評価 / 参加予定 / 探す); 探す still shows the existing list until R27.
  void isScopeCurrent;
  return enabled ? <EventsHome key={scope.key} scopeKey={scope.key} /> : null;
}
