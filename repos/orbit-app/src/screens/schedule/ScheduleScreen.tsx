import { RefreshControl, Text } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { tasksToScheduleItems } from "../../view-models/schedule";

export function ScheduleScreen() {
  const state = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.tasks,
    (data) => tasksToScheduleItems(data).length === 0
  );

  return (
    <AppScreen
      eyebrow="Follow-up queue"
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="Schedule"
    >
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="Server is offline" />
      ) : null}
      {state.kind === "failure" ? (
        <ErrorState message={state.error.message} />
      ) : null}
      {state.kind === "empty" ? (
        <EmptyState
          message="Follow-up tasks will appear here."
          title="No follow-ups"
        />
      ) : null}
      {state.kind === "success"
        ? tasksToScheduleItems(state.data).map((task) => (
            <DataCard detail={task.dueAt} key={task.id} title={task.title}>
              <Text>Review before taking action.</Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}
