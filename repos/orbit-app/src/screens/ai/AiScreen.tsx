import { Text } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { useApiResource } from "../../hooks/useApiResource";
import { conversationsToSummaries } from "../../view-models/conversations";

export function AiScreen() {
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.conversations,
    (data) => conversationsToSummaries(data).length === 0
  );

  return (
    <AppScreen eyebrow="Relationship steward" title="Orbit AI">
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="Server is offline" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState
          message="Start a conversation to prepare your next relationship move."
          title="No conversations yet"
        />
      ) : null}
      {state.kind === "success"
        ? conversationsToSummaries(state.data).map((item) => (
            <DataCard
              detail={item.preview || "Ready for your next prompt"}
              key={item.id}
              title={item.title}
            >
              <Text>
                {item.preview ||
                  "Ask Orbit AI who to meet, what to prepare, or who needs follow-up."}
              </Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}
