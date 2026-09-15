import { useIsFocused, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOrbitAuthSession } from "../../src/api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../src/api/ApiBaseUrlProvider";
import { AiConversationScreen, type AiConversationJournal } from "../../src/screens/ai/AiConversationScreen";
import { withOrbitPrivateRoute } from "../../src/components/OrbitRouteAccessBoundary";
import { aiSendIntentOrigin, consumeAiSendIntent } from "../../src/data/ai-send-intent";
import { aiSessionOriginInputSchema } from "../../src/api/schema/ai-sessions";
import { consumeAiTemplatePrefill, type AiTemplatePrefill } from "../../src/data/ai-template-prefill";

const ProtectedConversation = withOrbitPrivateRoute<NonNullable<Parameters<typeof AiConversationScreen>[0]>>(AiConversationScreen);

export default function AiConversationRoute() {
  const params = useLocalSearchParams<{ id?: string; source?: string; initialMessage?: string | string[]; initialMessageConsumed?: string; sendIntent?: string | string[]; prefillIntent?: string | string[]; entryPointId?: string | string[]; initialGroupId?: string | string[]; sourceNoteId?: string | string[]; sourceNoteVersion?: string | string[] }>();
  const initialMessage = (Array.isArray(params.initialMessage) ? params.initialMessage[0] : params.initialMessage)?.trim() ?? "";
  const sendIntent = Array.isArray(params.sendIntent) ? params.sendIntent[0] : params.sendIntent;
  const prefillIntent = Array.isArray(params.prefillIntent) ? params.prefillIntent[0] : params.prefillIntent;
  const router = useRouter();
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.actorId;
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const intentKey = JSON.stringify([params.id, params.source, params.initialMessage, params.sendIntent, params.prefillIntent, params.entryPointId, params.initialGroupId, params.sourceNoteId, params.sourceNoteVersion]);
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
  const identity = JSON.stringify([actorId, server.baseUrl]);
  const [prefillSnapshot, setPrefillSnapshot] = useState<{
    identity: string;
    intentId: string;
    value: AiTemplatePrefill | null;
  } | null>(null);
  const prefillClaim = useRef(prefillSnapshot);
  useEffect(() => {
    if (!auth.ready || !auth.signedIn || !server.ready || !actorId || !prefillIntent) {
      return;
    }
    const claimed = prefillClaim.current?.identity === identity
      && prefillClaim.current.intentId === prefillIntent
      ? prefillClaim.current
      : {
        identity,
        intentId: prefillIntent,
        value: consumeAiTemplatePrefill({
          id: prefillIntent,
          actorId,
          baseUrl: server.baseUrl,
        }),
      };
    prefillClaim.current = claimed;
    setPrefillSnapshot(claimed);
  }, [actorId, auth.ready, auth.signedIn, identity, prefillIntent, server.baseUrl, server.ready]);
  const prefillResolved = !prefillIntent
    || (prefillSnapshot?.identity === identity && prefillSnapshot.intentId === prefillIntent);
  const prefill = prefillResolved ? prefillSnapshot?.value ?? null : null;
  if (enabled && intent.owner === null) intent.owner = identity;
  const allowInitialPrompt = intent.owner === identity;
  useEffect(() => {
    if (enabled && !allowInitialPrompt && sendIntent && actorId) {
      consumeAiSendIntent({ id: sendIntent, actorId, baseUrl: server.baseUrl, message: initialMessage });
    }
  }, [actorId, enabled, allowInitialPrompt, sendIntent, server.baseUrl, initialMessage]);
  // Preserve local work across focus/cookie remounts, never across accounts or servers.
  const journal = useMemo<AiConversationJournal>(() => ({}), [intentKey, actorId, server.baseUrl]);
  const claimInitialPrompt = useCallback(() => {
    if (!allowInitialPrompt || intent.submitted || params.initialMessageConsumed === "1" || !sendIntent || !actorId) return false;
    if (!consumeAiSendIntent({ id: sendIntent, actorId, baseUrl: server.baseUrl, message: initialMessage })) return false;
    intent.submitted = true;
    router.setParams({ initialMessageConsumed: "1" });
    return true;
  }, [actorId, allowInitialPrompt, intent, params.initialMessageConsumed, sendIntent, initialMessage, server.baseUrl, router]);
  const sequence = useRef(0);
  const routeEnabled = enabled && prefillResolved;
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled: routeEnabled }), [routeEnabled, auth.signedIn, actorId, auth.cookieHeader, server.baseUrl, intentKey]);
  const latest = useRef(scope);
  latest.current = scope;
  const isScopeCurrent = useCallback(() => latest.current === scope && scope.enabled, [scope]);
  const effectiveOrigin = prefill?.origin ?? sessionOrigin;
  return routeEnabled ? <ProtectedConversation key={scope.key} scopeKey={scope.key} isScopeCurrent={isScopeCurrent} claimInitialPrompt={claimInitialPrompt} allowInitialPrompt={allowInitialPrompt} journal={journal} {...(prefill?.message ? { initialDraft: prefill.message } : {})} {...(prefill?.references ? { initialReferences: prefill.references } : {})} {...(effectiveOrigin ? { sessionOrigin: effectiveOrigin } : {})} /> : null;
}
