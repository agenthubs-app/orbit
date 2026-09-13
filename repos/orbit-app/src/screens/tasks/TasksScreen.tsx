import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { taskPath, tasksPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { tasksToListView, type TaskListRowView } from "../../view-models/today-tasks";

type TaskListMode = "open" | "completed";

function requestedMode(value: string | string[] | undefined): TaskListMode {
  const normalized = Array.isArray(value) ? value[0] : value;
  return normalized === "completed" ? "completed" : "open";
}

function mutationKey(action: string) {
  return `ios:${action}:${Date.now()}`;
}

export function TasksScreen() {
  const { colors, styles } = useStyles();
  const params = useLocalSearchParams<{ view?: string | string[] }>();
  const router = useRouter();
  const client = useOrbitApiClient();
  const [mode, setMode] = useState<TaskListMode>(() => requestedMode(params.view));
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const busy = useRef(false);
  const state = useApiResource<unknown>(tasksPath(), () => false);
  const ready = state.kind === "success" || state.kind === "empty";
  const now = new Date();
  const open = ready ? tasksToListView(state.data, "open", now).items : null;
  const completed = ready ? tasksToListView(state.data, "completed", now).items : null;
  const today = tokyoDateKey(now);
  const groups = open && completed ? [
    ...(mode === "open" ? [
      { label: "已逾期", items: open.filter(item => taskDateKey(item) && taskDateKey(item)! < today), tone: "danger" },
      { label: "今天", items: open.filter(item => taskDateKey(item) === today), tone: "today" },
      { label: "之后", items: open.filter(item => taskDateKey(item) && taskDateKey(item)! > today), tone: "muted" },
      { label: "未安排", items: open.filter(item => !taskDateKey(item)), tone: "muted" },
    ] : []),
    { label: "已完成", items: completed, tone: "completed" },
  ].filter(group => group.items.length > 0) : [];

  useEffect(() => setMode(requestedMode(params.view)), [params.view]);

  async function toggleTask(item: TaskListRowView) {
    if (busy.current) return;
    busy.current = true;
    setUpdatingId(item.id);
    setMutationError(null);
    try {
      const action = item.status === "completed" ? "reopen" : "complete";
      const result = await client.patch<unknown>(taskPath(item.id), {
        body: { action, idempotencyKey: mutationKey(`${action}:${item.id}`) },
      });
      if (result.success) state.refresh();
      else setMutationError(result.error.message);
    } catch {
      setMutationError("操作未完成，请重试。");
    } finally {
      busy.current = false;
      setUpdatingId(null);
    }
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
      headerActions={<Pressable accessibilityLabel="添加待办（前往今天）" accessibilityRole="button" onPress={() => router.push("/today" as Href)} style={styles.addButton}>
        <Ionicons color={colors.accent} name="add" size={26} />
      </Pressable>}
      title="待办"
    >
      <TaskModeSwitcher mode={mode} onChange={setMode} openCount={open?.length} completedCount={completed?.length} />
      {state.kind === "loading" ? <LoadingState /> : null}
      {state.kind === "failure" || state.kind === "offline" ? (
        <ErrorState message={state.error.message} title="待办暂时打不开" />
      ) : null}
      {ready && (mode === "open" ? open?.length === 0 : completed?.length === 0) ? (
        <EmptyState
          message={mode === "open" ? "新待办会出现在这里。" : "完成待办后，这里会留下记录。"}
          title={mode === "open" ? "暂无待办" : "暂无完成记录"}
        />
      ) : null}
      <View style={styles.groups}>
      {groups.map(group => (
        <View key={group.label} style={styles.list}>
          <View accessibilityRole="header" accessibilityLabel={`${group.label} ${group.items.length}`} style={styles.groupHeading}>
            <Text style={[styles.groupTitle, group.tone === "completed" && styles.muted]}>{group.label}</Text>
            <Text style={[styles.groupCount, group.tone === "today" && styles.todayCount, group.tone === "danger" && styles.danger]}>{group.items.length}</Text>
          </View>
          {group.items.map(item => (
            <View
              key={item.id}
              style={styles.row}
            >
              <Pressable
                accessibilityLabel={item.status === "completed" ? `恢复：${item.title}` : `完成：${item.title}`}
                accessibilityRole="checkbox"
                aria-checked={item.status === "completed"}
                accessibilityState={{ checked: item.status === "completed", disabled: updatingId !== null, busy: updatingId === item.id }}
                disabled={updatingId !== null}
                onPress={() => void toggleTask(item)}
                style={styles.checkButton}
              >
                <View style={[styles.checkbox, item.status === "completed" && styles.checkboxCompleted]}>
                  {item.status === "completed" ? <Ionicons color={colors.onAccent} name="checkmark" size={16} /> : null}
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel={`${item.title}，${item.categoryLabel}，${item.dateLabel}`}
                accessibilityRole="button"
                onPress={() => router.push(`/tasks/${encodeURIComponent(item.id)}` as Href)}
                style={({ pressed }) => [styles.rowBody, pressed ? styles.pressed : null]}
              >
                <Text
                  style={[styles.rowTitle, item.status === "completed" ? styles.completedTitle : null]}
                >
                  {item.title}
                </Text>
                <Text style={styles.rowDetail}>
                  {item.categoryLabel} · {item.dateLabel}
                </Text>
              </Pressable>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </View>
          ))}
        </View>
      ))}
      </View>
      {mutationError ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
    </AppScreen>
  );
}

function TaskModeSwitcher({
  mode,
  onChange,
  openCount,
  completedCount,
}: {
  mode: TaskListMode;
  onChange: (mode: TaskListMode) => void;
  openCount: number | undefined;
  completedCount: number | undefined;
}) {
  const { styles } = useStyles();
  const options: Array<{ label: string; value: TaskListMode }> = [
    { label: "未完成", value: "open" },
    { label: "已完成", value: "completed" },
  ];
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {options.map((option) => {
        const selected = mode === option.value;
        const count = option.value === "open" ? openCount : completedCount;
        return (
          <Pressable
            accessibilityRole="tab"
            aria-selected={selected}
            accessibilityLabel={`${option.label}${count === undefined ? "" : ` ${count}`}`}
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.tab, selected ? styles.tabSelected : null]}
          >
            <Text style={[styles.tabText, selected ? styles.tabTextSelected : null]}>
              {option.label}
            </Text>
            {count !== undefined ? <Text style={[styles.tabText, selected && styles.tabCountSelected]}>{count}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function tokyoDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function taskDateKey(item: TaskListRowView): string | undefined {
  if (item.dueAt && Number.isFinite(Date.parse(item.dueAt))) return tokyoDateKey(new Date(item.dueAt));
  return item.plannedDate;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  addButton: { alignItems: "center", justifyContent: "center", minWidth: layout.control, minHeight: layout.control },
  checkButton: { alignItems: "flex-start", justifyContent: "center", width: layout.control, minHeight: layout.control },
  checkbox: { alignItems: "center", justifyContent: "center", borderColor: colors.ink, borderWidth: 1.5, borderRadius: 6, width: 22, height: 22 },
  checkboxCompleted: { backgroundColor: colors.accent, borderColor: colors.accent },
  completedTitle: { color: colors.text3, textDecorationLine: "line-through" },
  danger: { color: colors.rose },
  errorText: { color: colors.rose, fontSize: 13 },
  groupCount: { color: colors.text3, fontSize: 22, lineHeight: 28, fontWeight: "800", letterSpacing: -0.44 },
  groupHeading: { alignItems: "baseline", flexDirection: "row", gap: 10, paddingBottom: 4 },
  groupTitle: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  groups: { gap: 22 },
  list: { backgroundColor: colors.surface },
  muted: { color: colors.text3 },
  pressed: { opacity: 0.65 },
  row: { alignItems: "center", flexDirection: "row", minHeight: 66, paddingVertical: 9, borderBottomColor: colors.border2, borderBottomWidth: 1 },
  rowBody: { flex: 1, gap: 2, justifyContent: "center", minHeight: 46, minWidth: 0, paddingRight: 8 },
  rowDetail: { color: colors.text3, fontSize: 12, lineHeight: 18 },
  rowTitle: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  tab: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1, flexShrink: 1 },
  tabSelected: { borderBottomColor: colors.ink },
  tabs: { flexDirection: "row", gap: 22, borderBottomColor: colors.border, borderBottomWidth: 1 },
  tabText: { color: colors.text3, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  tabTextSelected: { color: colors.ink, fontWeight: "800" },
  tabCountSelected: { color: colors.accent, fontWeight: "800" },
  todayCount: { color: colors.accent },
}));
