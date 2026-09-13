import { useIsFocused } from "expo-router";
import { useCallback, useRef } from "react";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { ContactsScreen } from "../../src/screens/contacts/ContactsScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function ContactsMainRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const scopeKey = JSON.stringify([auth.user?.id, auth.cookieHeader, server.baseUrl]);
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.user?.id);
  const latest = useRef("");
  latest.current = enabled ? scopeKey : "";
  const isScopeCurrent = useCallback(() => latest.current === scopeKey, [scopeKey]);
  if (!enabled) return null;
  return <ContactsScreen key={scopeKey} mode="main" scopeKey={scopeKey} isScopeCurrent={isScopeCurrent} />;
}

export default withOrbitPrivateRoute(ContactsMainRoute);
