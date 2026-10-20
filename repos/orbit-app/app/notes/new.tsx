import { useIsFocused } from "expo-router";
import { useCallback, useMemo, useRef } from "react";

import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { NewMemoScreen } from "../../src/screens/memo/NewMemoScreen";

function NewNoteRoute() {
  const focused = useIsFocused(); const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, actorId, auth.cookieHeader, server.baseUrl]);
  const latest = useRef(scope); latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  return enabled ? <NewMemoScreen key={scope.key} actorId={actorId} draftServer={server.baseUrl} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} /> : null;
}

export default withOrbitPrivateRoute(NewNoteRoute);
