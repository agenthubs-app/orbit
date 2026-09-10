import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  ORBIT_API_ENDPOINTS,
  taskPath,
  taskSuggestionAcceptPath,
  todayPath,
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  todayToView,
  type TodayTaskRowView,
  type TodayView,
} from "../../view-models/today-tasks";

function todayDateKey(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Tokyo",
    year: "numeric",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function mutationKey(action: string): string {
  return `ios:${action}:${Date.now()}`;
}

function usable<T>(state: ReturnType<typeof useApiResource<T>>) {
  return state.kind === "success" || state.kind === "empty";
}

export function TodayScreen() {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const client = useOrbitApiClient();
  const path = useMemo(() => todayPath("Asia/Tokyo"), []);
  const todayState = useApiResource<unknown>(path, () => false);
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const view = usable(todayState) ? todayToView(todayState.data) : null;

  async function createTask() {
    const title = draft.trim();
    if (!title || creating) return;
    setCreating(true);
    setMutationError(null);
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.tasks, {
      body: {
        category: "other",
        idempotencyKey: mutationKey("create-task"),
        plannedDate: todayDateKey(),
        title,
      },
    });
    if (result.success) {
      setDraft("");
      todayState.refresh();
    } else {
      setMutationError(result.error.message);
    }
    setCreating(false);
  }

  async function completeTask(taskId: string) {
    setUpdatingId(taskId);
    setMutationError(null);
    const result = await client.patch<unknown>(taskPath(taskId), {
      body: {
        action: "complete",
        idempotencyKey: mutationKey(`complete:${taskId}`),
      },
    });
    if (result.success) {
      todayState.refresh();
    } else {
      setMutationError(result.error.message);
    }
    setUpdatingId(null);
  }

  async function acceptSuggestion(suggestionId: string) {
    setUpdatingId(suggestionId);
    setMutationError(null);
    const result = await client.post<unknown>(taskSuggestionAcceptPath(suggestionId), {
      body: { idempotencyKey: mutationKey(`accept:${suggestionId}`) },
    });
    if (result.success) {
      todayState.refresh();
    } else {
      setMutationError(result.error.message);
    }
    setUpdatingId(null);
  }

  return (
    <AppScreen
      refreshControl={
        <RefreshControl
          onRefresh={todayState.refresh}
          refreshing={todayState.refreshing}
          tintColor={colors.accent}
        />
      }
      title="今天"
    >
      {todayState.kind === "loading" ? <LoadingState /> : null}
      {todayState.kind === "failure" || todayState.kind === "offline" ? (
        <ErrorState message={todayState.error.message} title="今天暂时打不开" />
      ) : null}
      {view ? (
        <TodayWorkspace
          creating={creating}
          draft={draft}
          onAcceptSuggestion={acceptSuggestion}
          onChangeDraft={setDraft}
          onCompleteTask={completeTask}
          onCreateTask={createTask}
          onOpenCompleted={() =>
            router.push({ pathname: "/tasks", params: { view: "completed" } })
          }
          onOpenSchedule={() => router.push("/schedule" as Href)}
          onOpenTask={(id) => router.push(`/tasks/${id}` as Href)}
          onOpenTasks={() => router.push("/tasks" as Href)}
          updatingId={updatingId}
          view={view}
        />
      ) : null}
      {mutationError ? <Text style={styles.errorText}>{mutationError}</Text> : null}
    </AppScreen>
  );
}

function TodayWorkspace({
  creating,
  draft,
  onAcceptSuggestion,
  onChangeDraft,
  onCompleteTask,
  onCreateTask,
  onOpenCompleted,
  onOpenSchedule,
  onOpenTask,
  onOpenTasks,
  updatingId,
  view,
}: {
  creating: boolean;
  draft: string;
  onAcceptSuggestion: (id: string) => void;
  onChangeDraft: (value: string) => void;
  onCompleteTask: (id: string) => void;
  onCreateTask: () => void;
  onOpenCompleted: () => void;
  onOpenSchedule: () => void;
  onOpenTask: (id: string) => void;
  onOpenTasks: () => void;
  updatingId: string | null;
  view: TodayView;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.workspace}>
      <View style={styles.dateBlock}>
        <Text style={styles.dateLabel}>{view.dateLabel}</Text>
        <Text style={styles.summary}>{view.summary}</Text>
      </View>
      <View style={styles.quickAdd}>
        <Ionicons color={colors.text3} name="add-circle-outline" size={21} />
        <TextInput
          accessibilityLabel="添加待办"
          blurOnSubmit={false}
          onChangeText={onChangeDraft}
          onSubmitEditing={onCreateTask}
          placeholder="添加待办"
          placeholderTextColor={colors.text4}
          returnKeyType="done"
          style={styles.quickAddInput}
          value={draft}
        />
        {creating ? <Text style={styles.savingText}>添加中</Text> : null}
      </View>

      <SectionHeader action="全部" onPress={onOpenTasks} title="待办" />
      <View style={styles.group}>
        {view.tasks.length === 0 ? (
          <Text style={styles.emptyText}>今天没有待办</Text>
        ) : (
          view.tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              last={index === view.tasks.length - 1}
              loading={updatingId === task.id}
              onComplete={() => onCompleteTask(task.id)}
              onOpen={() => onOpenTask(task.id)}
              task={task}
            />
          ))
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onOpenCompleted}
          style={({ pressed }) => [styles.completedRow, pressed ? styles.pressed : null]}
        >
          <Ionicons color={colors.live} name="checkmark-done" size={19} />
          <Text style={styles.completedText}>{view.completedLabel}</Text>
          <Ionicons color={colors.text4} name="chevron-forward" size={17} />
        </Pressable>
      </View>

      {view.suggestions.length > 0 ? (
        <>
          <SectionHeader title="Orbit 建议" />
          <View style={styles.group}>
            {view.suggestions.map((item, index) => (
              <View
                key={item.id}
                style={[styles.suggestionRow, index > 0 ? styles.divider : null]}
              >
                <View style={styles.suggestionIcon}>
                  <Ionicons color={colors.accent} name="sparkles" size={17} />
                </View>
                <View style={styles.rowCopy}>
                  <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
                  <Text numberOfLines={2} style={styles.rowDetail}>{item.reason}</Text>
                </View>
                <Pressable
                  accessibilityLabel={`加入待办：${item.title}`}
                  accessibilityRole="button"
                  disabled={updatingId === item.id}
                  onPress={() => onAcceptSuggestion(item.id)}
                  style={({ pressed }) => [
                    styles.addSuggestionButton,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.addSuggestionText}>
                    {updatingId === item.id ? "加入中" : "加入"}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader action="日历" onPress={onOpenSchedule} title="日程" />
      <View style={styles.group}>
        {view.schedule.length === 0 ? (
          <Text style={styles.emptyText}>今天没有日程</Text>
        ) : (
          view.schedule.map((item, index) => (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              onPress={onOpenSchedule}
              style={({ pressed }) => [
                styles.scheduleRow,
                index > 0 ? styles.divider : null,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.scheduleTime}>{item.stateLabel}</Text>
              <View style={styles.scheduleRule} />
              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text>
                <Text numberOfLines={1} style={styles.rowDetail}>{item.detail}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}

function SectionHeader({
  action,
  onPress,
  title,
}: {
  action?: string;
  onPress?: () => void;
  title: string;
}) {
  const { colors, styles } = useStyles();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={styles.headerAction}>
          <Text style={styles.headerActionText}>{action}</Text>
          <Ionicons color={colors.text3} name="chevron-forward" size={15} />
        </Pressable>
      ) : null}
    </View>
  );
}

function TaskRow({
  last,
  loading,
  onComplete,
  onOpen,
  task,
}: {
  last: boolean;
  loading: boolean;
  onComplete: () => void;
  onOpen: () => void;
  task: TodayTaskRowView;
}) {
  const { styles } = useStyles();
  return (
    <View style={[styles.taskRow, !last ? styles.rowBorder : null]}>
      <Pressable
        accessibilityLabel={`完成待办：${task.title}`}
        accessibilityRole="checkbox"
        disabled={loading}
        onPress={onComplete}
        style={styles.checkButton}
      >
        <View style={[styles.checkCircle, task.priority === "high" ? styles.checkHigh : null]}>
          {loading ? <View style={styles.loadingDot} /> : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onOpen}
        style={({ pressed }) => [styles.taskBody, pressed ? styles.pressed : null]}
      >
        <Text numberOfLines={1} style={styles.rowTitle}>{task.title}</Text>
        <Text style={styles.rowMeta}>{task.categoryLabel}</Text>
      </Pressable>
      {task.dueLabel ? (
        <Text
          style={[
            styles.dueLabel,
            task.dueTone === "danger" ? styles.dueDanger : null,
          ]}
        >
          {task.dueLabel}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  addSuggestionButton: {
    ...createControlStyles(colors).chip
  },
  addSuggestionText: { color: colors.accent, fontSize: typography.small, fontWeight: "700" },
  checkButton: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
  checkCircle: { borderColor: colors.borderStrong, borderRadius: 10, borderWidth: 1.5, height: 20, width: 20 },
  checkHigh: { borderColor: colors.rose },
  completedRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 48, paddingHorizontal: spacing.md },
  completedText: { color: colors.text2, flex: 1, fontSize: typography.body, fontWeight: "600" },
  dateBlock: { gap: spacing.xs, paddingHorizontal: spacing.xs },
  dateLabel: { ...textStyles.section, color: colors.ink },
  divider: { borderTopColor: colors.border, borderTopWidth: 1 },
  dueDanger: { color: colors.rose },
  dueLabel: { color: colors.text3, fontSize: typography.caption, fontWeight: "600", paddingRight: spacing.md },
  emptyText: { color: colors.text3, fontSize: typography.body, padding: spacing.lg },
  errorText: { color: colors.rose, fontSize: typography.small },
  group: { borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 0 },
  headerAction: { alignItems: "center", flexDirection: "row", minHeight: 44, paddingLeft: spacing.md },
  headerActionText: { color: colors.text3, fontSize: typography.small },
  loadingDot: { backgroundColor: colors.accent, borderRadius: 3, height: 6, margin: 5, width: 6 },
  pressed: { opacity: 0.68 },
  quickAdd: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border2, borderWidth: 1, flexDirection: "row", minHeight: 50, paddingHorizontal: spacing.md, borderRadius: radius.input },
  quickAddInput: { color: colors.text, flex: 1, fontSize: typography.body, minHeight: 48, paddingHorizontal: spacing.sm, paddingVertical: 0 },
  rowBorder: { borderBottomColor: colors.border, borderBottomWidth: 1 },
  rowCopy: { flex: 1, gap: 3, minWidth: 0 },
  rowDetail: { ...textStyles.caption, color: colors.text3 },
  rowMeta: { color: colors.text3, fontSize: typography.caption },
  rowTitle: { ...textStyles.listTitle, color: colors.text },
  savingText: { color: colors.text3, fontSize: typography.caption },
  scheduleRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 60, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  scheduleRule: { backgroundColor: colors.amber, borderRadius: 2, height: 34, width: 3 },
  scheduleTime: { color: colors.text2, fontSize: typography.small, fontVariant: ["tabular-nums"], width: 48 },
  sectionHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 44, paddingHorizontal: spacing.xs },
  sectionTitle: { ...textStyles.section, color: colors.ink },
  suggestionIcon: { alignItems: "center", backgroundColor: colors.accentSofter, borderRadius: radius.control, height: 36, justifyContent: "center", width: 36 },
  suggestionRow: { alignItems: "center", flexDirection: "row", gap: spacing.md, minHeight: 70, padding: spacing.md },
  summary: { color: colors.text3, fontSize: typography.small },
  taskBody: { flex: 1, gap: 3, justifyContent: "center", minHeight: 52, minWidth: 0 },
  taskRow: { alignItems: "center", flexDirection: "row", minHeight: 54, paddingLeft: spacing.xs },
  workspace: { gap: spacing.sm },
}));
