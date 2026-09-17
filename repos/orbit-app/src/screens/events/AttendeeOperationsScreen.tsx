import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { type Href, useIsFocused, useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { AppScreen } from "../../components/AppScreen";
import { createAttendeeController } from "../../view-models/event-attendee-controller";
import { AttendeeOperationsContent, attendeeOperationsTitle } from "./AttendeeOperationsContent";

export function AttendeeOperationsScreen() {
  const params = useLocalSearchParams<{ id?: string; participantId?: string }>();
  const eventId = typeof params.id === "string" ? params.id : "";
  const participantId = typeof params.participantId === "string" ? params.participantId : null;
  const path = usePathname(); const router = useRouter(); const isFocused = useIsFocused();
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const locale = useOrbitLocale();
  const expectedPath = `/events/${encodeURIComponent(eventId)}/${participantId ? `participants/${encodeURIComponent(participantId)}` : "attendees"}`;
  // Expo may expose decoded pathname, while params are already decoded once.
  const focused = path === expectedPath || path === `/events/${eventId}/${participantId ? `participants/${participantId}` : "attendees"}`;
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId && auth.user?.id && eventId) && focused && isFocused;
  const scopeKey = JSON.stringify([auth.actorId, auth.user?.id, auth.cookieHeader, server.baseUrl, eventId, participantId, ready]);
  const client = useOrbitApiClient({ scopeKey });
  const scope = useMemo(() => ({ scopeKey }), [scopeKey]);
  const latest = useRef(scope); latest.current = scope;
  const mounted = useRef(true);
  const controller = useMemo(() => createAttendeeController({ client, eventId, participantId, operationsActorId: auth.actorId ?? "", isCurrent: () => mounted.current && latest.current === scope && ready }), [client, scope]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { mounted.current = true; controller.activate(); void controller.load(); return () => { mounted.current = false; controller.dispose(); }; }, [controller]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  if (!ready) return null;
  const current = () => mounted.current && latest.current === scope && ready;
  return <AppScreen title={attendeeOperationsTitle(locale.language)}>
    <AttendeeOperationsContent state={state} language={locale.language} now={now}
      onAction={action => { if (current()) void controller.act(action); }} onRefresh={() => { if (current()) void controller.load(); }}
      onParticipant={id => { if (current() && state.workspace?.directory.some(p => p.participantId === id)) router.push(`/events/${encodeURIComponent(eventId)}/participants/${encodeURIComponent(id)}` as Href); }}
      onContact={id => { const live = controller.getSnapshot(); if (current() && !live.loading && !live.busy && live.detail?.contactRequest.status === "accepted" && live.detail.contactRequest.contactId === id) router.push(`/contacts/${encodeURIComponent(id)}` as Href); }} />
  </AppScreen>;
}
