import { useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { EventDetailScreen } from "../../src/screens/events/EventDetailScreen";

export default function EventDetailRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const enabled = focused && auth.ready && server.ready && Boolean(eventId?.trim());
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, eventId, auth.signedIn, auth.user?.id, auth.cookieHeader, server.baseUrl]);
  const latest = useRef(scope);
  latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  return enabled ? <EventDetailScreen key={scope.key} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} /> : null;
}
