import { useIsFocused } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { ProfileScreen } from "../../src/screens/profile/ProfileScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function ProfileMainRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.user?.id);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, auth.signedIn, auth.user?.id, auth.cookieHeader, server.baseUrl]);
  const latest = useRef(scope);
  latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  return enabled ? <ProfileScreen key={scope.key} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} /> : null;
}

export default withOrbitPrivateRoute(ProfileMainRoute);
