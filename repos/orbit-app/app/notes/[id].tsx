import { useIsFocused, useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef } from "react";

import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { NoteDetailScreen } from "../../src/screens/notes/NoteDetailScreen";

function NoteDetailRoute() {
  const focused = useIsFocused(); const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl();
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const noteId = (Array.isArray(id) ? id[0] : id) ?? "";
  const actorId = auth.user?.id ?? "";
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(actorId && noteId);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, actorId, auth.cookieHeader, server.baseUrl, noteId]);
  const latest = useRef(scope); latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  return enabled ? <NoteDetailScreen key={scope.key} actorId={actorId} noteId={noteId} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} /> : null;
}

export default withOrbitPrivateRoute(NoteDetailRoute);
