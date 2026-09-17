import { useRef } from "react";
import { eventRecommendationsPath } from "../../api/endpoints";
import { useApiResource } from "../../hooks/useApiResource";
import { Registration7aRecommendationsView } from "./Registration7aRecommendations";

export function Registration7aRecommendations({ eventId, scopeKey, onContact }: { eventId: string; scopeKey: string; onContact: (id: string) => void }) {
  const state = useApiResource<unknown>(eventRecommendationsPath(eventId, 3), () => false, { scopeKey, cachePolicy: "network-only" });
  const latest = useRef(state); latest.current = state;
  return <Registration7aRecommendationsView eventId={eventId} state={state} onContact={id => { if (latest.current === state) onContact(id); }} />;
}
