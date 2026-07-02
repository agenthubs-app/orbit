import { useLocalSearchParams } from "expo-router";
import { RefreshControl, Text } from "react-native";
import { eventDetailPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { eventDetailToSummary } from "../../view-models/events";

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? "event";
  }

  return value ?? "event";
}

export function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = firstParam(id);
  const state = useApiResource<unknown>(eventDetailPath(eventId), () => false);

  return (
    <AppScreen
      eyebrow="Event detail"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="Event"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="Server is offline" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "success" || state.kind === "empty" ? (
        <EventDetailCard data={state.data} />
      ) : null}
    </AppScreen>
  );
}

function EventDetailCard({ data }: { data: unknown }) {
  const event = eventDetailToSummary(data);

  return (
    <>
      <DataCard
        detail={`${event.startsAt} ${event.location}`.trim()}
        title={event.title}
      >
        <Text>{event.description || event.status}</Text>
      </DataCard>
      <DataCard detail={event.relationshipContext} title="Relationship context">
        <Text>{event.preparation}</Text>
      </DataCard>
      <DataCard detail={event.nextAction} title="Next move" />
    </>
  );
}
