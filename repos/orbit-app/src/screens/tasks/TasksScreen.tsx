import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { taskPath, tasksPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { tasksToListView } from "../../view-models/today-tasks";

type TaskListMode = "open" | "completed";

function requestedMode(value: string | string[] | undefined): TaskListMode {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === "completed" ? "completed" : "open";
}

function mutationKey(action: string) {
  return `ios:${action}:${Date.now()}`;
}

export function TasksScreen() {
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const router = useRouter();
  const client = useOrbitApiClient();
  const [mode, setMode] = useState<TaskListMode>(() => requestedMode(params.view));
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const path = useMemo(() => tasksPath(mode), [mode]);
  const state = useApiResource<unknown>(path, () => false);
  const view =
    state.kind === "success" || state.kind === "empty"
      ? tasksToListView(state.data, mode)
      : null;

  useEffect(() => setMode(requestedMode(params.view)), [params.view]);

  async function toggleTask(taskId: string) {
    setUpdatingId(taskId);
    setMutationError(null);
    const result = await client.patch<unknown>(taskPath(taskId), {
      body: {
        action: mode === "open" ? "complete" : "reopen",
        idempotencyKey: mutationKey(`${mode}:${taskId}`),
      },
    });
    if (result.success) state.refresh();
    else setMutationError(result.error.message);
    setUpdatingId(null);
  }

  return (
    <AppScreen
      refreshControl={
        <RefreshControl
          onRefresh={state.refresh}
          refreshing={state.refreshing}
          tintColor={colors.accent}
        />
      }
      title="待办事项"
    >
      <TaskModeSwitcher mode={mode} onChange={setMode} />
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "failure" || state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="待办暂时打不开" />
      ) : null}
      {view && view.items.length === 0 ? (
        <EmptyState
          message={mode === "open" ? "新待办会出现在这里。" : "完成待办后，这里会留下记录。"}
          title={mode === "open" ? "暂无待办" : "暂无完成记录"}
        />
      ) : null}
      {view && view.items.length > 0 ? (
        <View style={styles.list}>
          {view.items.map((item, index) => (
            <View
              key={item.id}
              style={[styles.row, index > 0 ? styles.rowDivider : null]}
            >
              <Pressable
                accessibilityLabel={mode === "open" ? `完成：${item.title}` : `恢复：${item.title}`}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: mode === "completed" }}
                disabled={updatingId === item.id}
                onPress={() => toggleTask(item.id)}
                style={styles.checkButton}
              >
                <Ionicons
                  color={mode === "completed" ? colors.live : colors.borderStrong}
                  name={mode === "completed" ? "checkmark-circle" : "ellipse-outline"}
                  size={23}
                />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/tasks/${item.id}` as Href)}
                style={({ pressed }) => [styles.rowBody, pressed ? styles.pressed : null]}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.rowTitle, mode === "completed" ? styles.completedTitle : null]}
                >
                  {item.title}
                </Text>
                <Text numberOfLines={1} style={styles.rowDetail}>
                  {item.categoryLabel} · {item.dateLabel}
                </Text>
              </Pressable>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </View>
          ))}
        </View>
      ) : null}
      {mutationError ? <Text style={styles.errorText}>{mutationError}</Text> : null}
    </AppScreen>
  );
}

function TaskModeSwitcher({
  mode,
  onChange,
}: {
  mode: TaskListMode;
  onChange: (mode: TaskListMode) => void;
}) {
  const options: Array<{ label: string; value: TaskListMode }> = [
    { label: "待办", value: "open" },
    { label: "已完成", value: "completed" },
  ];
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {options.map((option) => {
        const selected = mode === option.value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.tab, selected ? styles.tabSelected : null]}
          >
            <Text style={[styles.tabText, selected ? styles.tabTextSelected : null]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  checkButton: { alignItems: "center", height: 48, justifyContent: "center", width: 42 },
  completedTitle: { color: colors.text3, textDecorationLine: "line-through" },
  errorText: { color: colors.rose, fontSize: typography.small },
  list: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  pressed: { opacity: 0.65 },
  row: { alignItems: "center", flexDirection: "row", minHeight: 60, paddingRight: spacing.md },
  rowBody: { flex: 1, gap: spacing.xs, justifyContent: "center", minHeight: 58, minWidth: 0 },
  rowDetail: { color: colors.text3, fontSize: typography.caption },
  rowDivider: { borderTopColor: colors.border, borderTopWidth: 1 },
  rowTitle: { color: colors.text, fontSize: typography.body, fontWeight: "600" },
  tab: { alignItems: "center", borderRadius: radius.control, flex: 1, justifyContent: "center", minHeight: 38 },
  tabSelected: { backgroundColor: colors.surface },
  tabs: { backgroundColor: colors.surface3, borderRadius: radius.md, flexDirection: "row", padding: 3 },
  tabText: { color: colors.text3, fontSize: typography.small, fontWeight: "600" },
  tabTextSelected: { color: colors.ink },
});
