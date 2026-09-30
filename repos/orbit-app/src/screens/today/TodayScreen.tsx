import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import * as Crypto from "expo-crypto";
import {
  Pressable,
  Platform,
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
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { OfflineNotice } from "../../components/OfflineNotice";
import { NeedsNetworkState } from "../../components/NeedsNetworkState";
import { LoadingState } from "../../components/LoadingState";
import { textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useTodayTaskPages } from "../../hooks/useTodayTaskPages";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useOfflineTaskOutbox } from "../../data/sync/useOfflineTaskOutbox";
import { buildOfflineTaskMutation } from "../../data/sync/task-outbox-mutation";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { overlayTodayTaskPageView, todayTaskPageToView, type TodayTaskCardRowView, type TodayTaskPageView } from "../../view-models/today-task-pages";

function todayDateKey(timeZone: string, now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((item) => [item.type, item.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function mutationKey(action: string): string {
  return `ios:${action}:${Crypto.randomUUID()}`;
}

export function TodayScreen() {
  const { timeZone, canSave } = useOrbitTimeZone();
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const router = useRouter();
  const client = useOrbitApiClient();
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const date = todayDateKey(timeZone, clock);
  const todayState = useTodayTaskPages(timeZone, date);
  const taskMirror = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const taskOutbox = useOfflineTaskOutbox(taskMirror, Platform.OS !== "web");
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  // Sprint 0131: offline the page is today's device copy (page copy "today-page"); writing needs the network.
  const offline = todayState.copy?.offline === true;
  const baseView = todayState.data
    ? todayTaskPageToView(todayState.data.today, todayState.data.page.actorId, date, clock, timeZone, locale.language,
      todayState.data.page.items, todayState.data.page)
    : null;
  const view = overlayTodayTaskPageView(baseView,
    taskMirror.records.flatMap(record => record.deletedAt === null && record.payload && typeof record.payload === "object"
      ? [record.payload as unknown as import("../../api/contract/tasks").TaskItemContract] : []),
    taskOutbox.queuedMutations, todayState.data?.page.actorId ?? "", date, clock, timeZone, locale.language);

  async function createTask() {
    if (!canSave) { setMutationError(locale.t("today.timezoneUnavailable")); return; }
    const title = draft.trim();
    if (!title || creating || offline && Platform.OS === "web") return;
    setCreating(true);
    setMutationError(null);
    if (offline) {
      if (Platform.OS === "web") return;
      const mutationId = mutationKey("create-task");
      const entityId = `local:${Crypto.randomUUID()}`;
      try {
        await taskOutbox.enqueueOfflineMutation(buildOfflineTaskMutation({
          mutationId, entityId, operation: "create", baseRevision: null,
          requestBody: { category: "personal", idempotencyKey: mutationId, plannedDate: date, title },
          createdAt: new Date().toISOString(),
        }));
        setDraft("");
      } catch (error) {
        setMutationError(error instanceof Error ? error.message : locale.t("taskDetail.operationFailed"));
      }
      setCreating(false);
      return;
    }
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.tasks, {
      body: {
        category: "other",
        idempotencyKey: mutationKey("create-task"),
        plannedDate: todayDateKey(timeZone),
        title,
      },
    });
    if (result.success) {
      setDraft("");
      todayState.state.refresh();
    } else {
      setMutationError(result.error.message);
    }
    setCreating(false);
  }

  async function completeTask(taskId: string) {
    if (offline) {
      const task = view?.tasks.find(item => item.id === taskId);
      if (task?.category !== "personal") return;
      setUpdatingId(taskId);
      setMutationError(null);
      const mutationId = mutationKey(`complete:${taskId}`);
      const record = taskMirror.records.find(item => item.id === taskId);
      try {
        await taskOutbox.enqueueOfflineMutation(buildOfflineTaskMutation({
          mutationId, entityId: taskId, operation: "complete", baseRevision: record?.revision ?? null,
          requestBody: { action: "complete", idempotencyKey: mutationId }, createdAt: new Date().toISOString(),
        }));
      } catch (error) {
        setMutationError(error instanceof Error ? error.message : locale.t("taskDetail.operationFailed"));
      }
      setUpdatingId(null);
      return;
    }
    setUpdatingId(taskId);
    setMutationError(null);
    const result = await client.patch<unknown>(taskPath(taskId), {
      body: {
        action: "complete",
        idempotencyKey: mutationKey(`complete:${taskId}`),
      },
    });
    if (result.success) {
      todayState.state.refresh();
    } else {
      setMutationError(result.error.message);
    }
    setUpdatingId(null);
  }

  async function acceptSuggestion(suggestionId: string) {
    if (offline) return;
    setUpdatingId(suggestionId);
    setMutationError(null);
    const result = await client.post<unknown>(taskSuggestionAcceptPath(suggestionId), {
      body: { idempotencyKey: mutationKey(`accept:${suggestionId}`) },
    });
    if (result.success) {
      todayState.state.refresh();
    } else {
      setMutationError(result.error.message);
    }
    setUpdatingId(null);
  }

  return (
    <AppScreen
      refreshControl={
        <RefreshControl
          onRefresh={todayState.state.refresh}
          refreshing={todayState.state.refreshing}
          tintColor={colors.accent}
        />
      }
      title={locale.t("today.title")}
    >
      {offline ? <OfflineNotice lastSyncedAt={todayState.copy?.lastSyncedAt ?? null} reason={todayState.copy?.reason ?? null} /> : null}
      {todayState.state.kind === "loading" ? <LoadingState /> : null}
      {todayState.state.kind === "offline" ? <NeedsNetworkState message={locale.t("sync.notOnDevice")} onRetry={todayState.state.refresh} /> : null}
      {todayState.state.kind === "failure" ? (
        <View>
          <ErrorState message={todayState.state.error.message} title={locale.t("today.unavailable")} />
          <Pressable accessibilityRole="button" onPress={todayState.state.refresh} style={styles.headerAction}>
            <Text style={styles.headerActionText}>{locale.t("common.retry")}</Text>
          </Pressable>
        </View>
      ) : null}
      {(todayState.state.kind === "success" || todayState.state.kind === "empty") && !view ? (
        <ErrorState message={locale.t("common.error")} title={locale.t("today.unavailable")} />
      ) : null}
      {view ? (
        <TodayWorkspace
          creating={creating}
          draft={draft}
          onAcceptSuggestion={acceptSuggestion}
          onChangeDraft={setDraft}
          onCompleteTask={completeTask}
          onCreateTask={createTask}
          offline={offline}
          offlineWritesAllowed={Platform.OS !== "web"}
          onLoadMoreTasks={todayState.loadMore}
          onOpenCompleted={() =>
            router.push({ pathname: "/tasks", params: { view: "completed" } })
          }
          onOpenSchedule={() => router.push("/schedule" as Href)}
          onOpenTask={(id) => router.push(`/tasks/${encodeURIComponent(id)}` as Href)}
          onOpenTasks={() => router.push("/tasks" as Href)}
          taskLoadError={todayState.moreError}
          taskLoadingMore={todayState.loadingMore}
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
  offline,
  offlineWritesAllowed,
  onAcceptSuggestion,
  onChangeDraft,
  onCompleteTask,
  onCreateTask,
  onLoadMoreTasks,
  onOpenCompleted,
  onOpenSchedule,
  onOpenTask,
  onOpenTasks,
  taskLoadError,
  taskLoadingMore,
  updatingId,
  view,
}: {
  creating: boolean;
  draft: string;
  offline: boolean;
  offlineWritesAllowed: boolean;
  onAcceptSuggestion: (id: string) => void;
  onChangeDraft: (value: string) => void;
  onCompleteTask: (id: string) => void;
  onCreateTask: () => void;
  onLoadMoreTasks: () => void;
  onOpenCompleted: () => void;
  onOpenSchedule: () => void;
  onOpenTask: (id: string) => void;
  onOpenTasks: () => void;
  taskLoadError: string | null;
  taskLoadingMore: boolean;
  updatingId: string | null;
  view: TodayTaskPageView;
}) {
  const locale = useOrbitLocale();
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
          accessibilityLabel={locale.t("today.addTask")}
          editable={!offline || offlineWritesAllowed}
          blurOnSubmit={false}
          onChangeText={onChangeDraft}
          onSubmitEditing={onCreateTask}
          placeholder={offline && !offlineWritesAllowed ? `${locale.t("today.addTask")} · ${locale.t("sync.needsNetwork")}` : locale.t("today.addTask")}
          placeholderTextColor={colors.text4}
          returnKeyType="done"
          style={styles.quickAddInput}
          value={draft}
        />
        {creating ? <Text style={styles.savingText}>{locale.t("today.creating")}</Text> : null}
      </View>

      <SectionHeader action={locale.t("today.all")} onPress={onOpenTasks} title={locale.t("today.tasks")} />
      <View style={styles.group}>
        {view.tasks.length === 0 ? (
          <Text style={styles.emptyText}>{locale.t("today.emptyTasks")}</Text>
        ) : (
          view.tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              last={index === view.tasks.length - 1}
              loading={updatingId === task.id}
              offline={offline}
              offlineWritesAllowed={offlineWritesAllowed}
              onComplete={() => onCompleteTask(task.id)}
              onOpen={() => onOpenTask(task.id)}
              task={task}
            />
          ))
        )}
        {view.hasMore && !offline ? (
          <View style={styles.moreTasks}>
            {taskLoadError ? <Text accessibilityRole="alert" style={styles.errorText}>{taskLoadError}</Text> : null}
            <Pressable accessibilityRole="button" disabled={taskLoadingMore} onPress={onLoadMoreTasks} style={styles.moreTasksButton}>
              <Text style={styles.headerActionText}>{locale.t(taskLoadError ? "common.retry" : taskLoadingMore ? "today.loadingMoreTasks" : "today.loadMoreTasks")}</Text>
            </Pressable>
          </View>
        ) : null}
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
          <SectionHeader title={locale.t("today.suggestions")} />
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
                  accessibilityLabel={locale.t("today.addNamed", { title: item.title }) + (offline ? " · " + locale.t("sync.needsNetwork") : "")}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: offline || updatingId === item.id }}
                  disabled={offline || updatingId === item.id}
                  onPress={() => onAcceptSuggestion(item.id)}
                  style={({ pressed }) => [
                    styles.addSuggestionButton,
                    pressed ? styles.pressed : null,
                  ]}
                >
                  <Text style={styles.addSuggestionText}>
                    {offline ? locale.t("sync.needsNetwork") : locale.t(updatingId === item.id ? "today.adding" : "today.add")}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <SectionHeader action={locale.t("today.schedule")} onPress={onOpenSchedule} title={locale.t("schedule.title")} />
      <View style={styles.group}>
        {view.schedule.length === 0 ? (
          <Text style={styles.emptyText}>{locale.t("today.emptySchedule")}</Text>
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
  offline,
  offlineWritesAllowed,
  onComplete,
  onOpen,
  task,
}: {
  last: boolean;
  loading: boolean;
  offline: boolean;
  offlineWritesAllowed: boolean;
  onComplete: () => void;
  onOpen: () => void;
  task: TodayTaskCardRowView;
}) {
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  return (
    <View style={[styles.taskRow, !last ? styles.rowBorder : null]}>
      <Pressable
        accessibilityLabel={locale.t("today.completeNamed", { title: task.titlePreview }) + (offline && (!offlineWritesAllowed || task.category !== "personal") ? " · " + locale.t("sync.needsNetwork") : "")}
        accessibilityRole="checkbox"
        accessibilityState={{ disabled: loading || offline && (!offlineWritesAllowed || task.category !== "personal") }}
        disabled={loading || offline && (!offlineWritesAllowed || task.category !== "personal")}
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
        <Text numberOfLines={1} style={styles.rowTitle}>{task.titlePreview}</Text>
        <Text style={styles.rowMeta}>{[task.categoryLabel, task.locationPreview].filter(Boolean).join(" · ")}</Text>
        {task.localMutationState ? <Text style={styles.rowMutationState}>{locale.t(task.localMutationState === "conflict" ? "tasks.outboxConflict" : task.localMutationState === "failed" ? "tasks.outboxFailed" : "tasks.outboxQueued")}</Text> : null}
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
  rowMutationState: { color: colors.text2, fontSize: typography.caption, marginTop: spacing.xs },
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
  moreTasks: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.md, paddingTop: spacing.xs },
  moreTasksButton: { alignItems: "center", minHeight: 40, justifyContent: "center", minWidth: 120 },
  workspace: { gap: spacing.sm },
}));
