import { useRouter } from "expo-router";
import { RefreshControl, Text } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { eventsToSummaries } from "../../view-models/events";

export function EventsScreen() {
  const router = useRouter();
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.events,
    (data) => eventsToSummaries(data).length === 0
  );

  return (
    <AppScreen
      eyebrow="Relationship events"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="Events"
    >
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
              onPress={() =>
                router.push({
                  params: { id: event.id },
                  pathname: "/events/[id]"
                })
              }
              title={event.title}
            >
              <Text>{event.status}</Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}
