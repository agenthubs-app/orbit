import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { AiConversationScreen, type AiConversationJournal } from "../../src/screens/ai/AiConversationScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { aiSendIntentOrigin, consumeAiSendIntent } from "../../src/data/ai-send-intent";
import { aiSessionOriginInputSchema } from "../../src/api/schema/ai-sessions";

const ProtectedConversation = withOrbitPrivateRoute<NonNullable<Parameters<typeof AiConversationScreen>[0]>>(AiConversationScreen);

export default function AiConversationRoute() {
  const params = useLocalSearchParams<{ id?: string; source?: string; initialMessage?: string | string[]; initialMessageConsumed?: string; sendIntent?: string | string[]; entryPointId?: string | string[]; initialGroupId?: string | string[] }>();
  const initialMessage = (Array.isArray(params.initialMessage) ? params.initialMessage[0] : params.initialMessage)?.trim() ?? "";
  const sendIntent = Array.isArray(params.sendIntent) ? params.sendIntent[0] : params.sendIntent;
  const router = useRouter();
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(auth.user?.id);
  const intentKey = JSON.stringify([params.id, params.source, params.initialMessage, params.sendIntent, params.entryPointId, params.initialGroupId]);
  // The navigation intent outlives an auth/focus remount. It must not replay an
  // inherited automatic write in a different identity scope.
  const intent = useMemo(() => {
    const origin = aiSendIntentOrigin(sendIntent ?? "");
    return { submitted: false, owner: origin ? JSON.stringify([origin.actorId, origin.baseUrl]) : null as string | null, registeredOrigin: origin?.origin ?? null };
  }, [intentKey]);
  const declaredEntryPoint = Array.isArray(params.entryPointId) ? params.entryPointId[0] : params.entryPointId;
  const declaredGroupId = Array.isArray(params.initialGroupId) ? params.initialGroupId[0] : params.initialGroupId;
  const parsedOrigin = aiSessionOriginInputSchema.safeParse({
    entryClient: "app",
    entryPointId: declaredEntryPoint ?? "ai.new_chat",
    initialGroupId: declaredGroupId?.trim() || null,
    kind: declaredEntryPoint?.startsWith("home.") ? "structured" : "manual",
    template: declaredEntryPoint?.startsWith("home.")
      ? { id: declaredEntryPoint, version: 1 }
      : null,
  });
  const sessionOrigin = intent.registeredOrigin ?? (parsedOrigin.success ? parsedOrigin.data : undefined);
  const identity = JSON.stringify([auth.user?.id, server.baseUrl]);
  if (enabled && intent.owner === null) intent.owner = identity;
  const allowInitialPrompt = intent.owner === identity;
  useEffect(() => {
    if (enabled && !allowInitialPrompt && sendIntent && auth.user?.id) {
      consumeAiSendIntent({ id: sendIntent, actorId: auth.user.id, baseUrl: server.baseUrl, message: initialMessage });
    }
  }, [enabled, allowInitialPrompt, sendIntent, auth.user?.id, server.baseUrl, initialMessage]);
  // Preserve local work across focus/cookie remounts, never across accounts or servers.
  const journal = useMemo<AiConversationJournal>(() => ({}), [intentKey, auth.user?.id, server.baseUrl]);
  const claimInitialPrompt = useCallback(() => {
    if (!allowInitialPrompt || intent.submitted || params.initialMessageConsumed === "1" || !sendIntent || !auth.user?.id) return false;
    if (!consumeAiSendIntent({ id: sendIntent, actorId: auth.user.id, baseUrl: server.baseUrl, message: initialMessage })) return false;
    intent.submitted = true;
    router.setParams({ initialMessageConsumed: "1" });
    return true;
  }, [allowInitialPrompt, intent, params.initialMessageConsumed, sendIntent, initialMessage, auth.user?.id, server.baseUrl, router]);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, auth.signedIn, auth.user?.id, auth.cookieHeader, server.baseUrl, intentKey]);
  const latest = useRef(scope);
  latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  return enabled ? <ProtectedConversation key={scope.key} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} claimInitialPrompt={claimInitialPrompt} allowInitialPrompt={allowInitialPrompt} journal={journal} {...(sessionOrigin ? { sessionOrigin } : {})} /> : null;
}
