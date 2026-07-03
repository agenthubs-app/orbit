import { RefreshControl, StyleSheet, Text } from "react-native";
import { ORBIT_API_ENDPOINTS } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  tasksToScheduleItems,
  type ScheduleItem
} from "../../view-models/schedule";

function scheduleDetail(task: ScheduleItem): string {
  return [task.dueAt, task.contactName, task.organization]
    .filter(Boolean)
    .join(" | ");
}

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
            <DataCard detail={scheduleDetail(task)} key={task.id} title={task.title}>
              <Text style={styles.actionText}>{task.recommendedAction}</Text>
              <Text style={styles.priorityText}>{task.priority}</Text>
            </DataCard>
          ))
        : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  actionText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  priorityText: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  }
});
