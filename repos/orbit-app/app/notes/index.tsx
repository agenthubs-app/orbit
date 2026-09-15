import { useIsFocused } from "expo-router";
import { useCallback, useMemo, useRef } from "react";

import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { NotesScreen } from "../../src/screens/notes/NotesScreen";

function NotesRoute() {
  const focused = useIsFocused(); const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, actorId, auth.cookieHeader, server.baseUrl]);
  return enabled ? <NotesScreen key={scope.key} actorId={actorId} scopeKey={scope.key} /> : null;
}

export default withOrbitPrivateRoute(NotesRoute);
