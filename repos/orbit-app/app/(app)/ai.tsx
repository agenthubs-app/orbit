import { useIsFocused } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { AiScreen } from "../../src/screens/ai/AiScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

function AiMainRoute() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, auth.signedIn, auth.actorId, auth.cookieHeader, server.baseUrl]);
  const latest = useRef(scope);
  latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  return enabled ? <AiScreen key={scope.key} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} /> : null;
}

export default withOrbitPrivateRoute(AiMainRoute);
