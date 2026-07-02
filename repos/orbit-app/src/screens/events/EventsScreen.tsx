import { Text } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { useApiResource } from "../../hooks/useApiResource";
import { eventsToSummaries } from "../../view-models/events";

export function EventsScreen() {
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.events,
    (data) => eventsToSummaries(data).length === 0
  );

  return (
    <AppScreen eyebrow="Relationship events" title="Events">
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="Server is offline" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState message="Events from Orbit will appear here." title="No events" />
      ) : null}
      {state.kind === "success"
        ? eventsToSummaries(state.data).map((event) => (
            <DataCard
              detail={`${event.startsAt} ${event.location}`.trim()}
              key={event.id}
              title={event.title}
            >
              <Text>{event.status}</Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}
