import { useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { ContactDetailScreen } from "../../src/screens/contacts/ContactDetailScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function ContactDetailRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const contactId = Array.isArray(id) ? id[0] : id;
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.user?.id && contactId);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, auth.user?.id, auth.cookieHeader, server.baseUrl, contactId]);
  const latest = useRef(scope);
  latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  return enabled ? <ContactDetailScreen key={scope.key} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} /> : null;
}

export default withOrbitPrivateRoute(ContactDetailRoute);
