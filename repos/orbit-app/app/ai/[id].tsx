import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { AiConversationScreen, type AiConversationJournal } from "../../src/screens/ai/AiConversationScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";

const ProtectedConversation = withOrbitPrivateRoute<NonNullable<Parameters<typeof AiConversationScreen>[0]>>(AiConversationScreen);

export default function AiConversationRoute() {
  const params = useLocalSearchParams<{ id?: string; source?: string; initialMessage?: string; initialMessageConsumed?: string }>();
  const router = useRouter();
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.user?.id);
  const intentKey = JSON.stringify([params.id, params.source, params.initialMessage]);
  // The navigation intent outlives an auth/focus remount. It must not replay an
  // inherited automatic write in a different identity scope.
  const intent = useMemo(() => ({ submitted: false }), [intentKey]);
  // Preserve local work across focus/cookie remounts, never across accounts or servers.
  const journal = useMemo<AiConversationJournal>(() => ({}), [intentKey, auth.user?.id, server.baseUrl]);
  const claimInitialPrompt = useCallback(() => {
    if (intent.submitted || params.initialMessageConsumed === "1") return false;
    intent.submitted = true;
    router.setParams({ initialMessageConsumed: "1" });
    return true;
  }, [intent, params.initialMessageConsumed, router]);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, auth.signedIn, auth.user?.id, auth.cookieHeader, server.baseUrl, intentKey]);
  const latest = useRef(scope);
  latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  return enabled ? <ProtectedConversation key={scope.key} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} claimInitialPrompt={claimInitialPrompt} journal={journal} /> : null;
}
