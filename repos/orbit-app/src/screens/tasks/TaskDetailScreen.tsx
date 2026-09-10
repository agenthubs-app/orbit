import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ORBIT_API_ENDPOINTS, reminderPath, remindersPath, taskActivitiesPath, taskPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { notifyReminderPlansChanged, requestNotificationPermission } from "../../notifications/native-notifications";
import { reminderPlansToView, reminderQuickOptions } from "../../view-models/reminders";
import { taskActivitiesToView, taskDetailToView, type TaskDetailView } from "../../view-models/today-tasks";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function mutationKey() {
  return `ios:task:${Crypto.randomUUID()}`;
}

function dateLabel(value?: string): string {
  if (!value) return "未安排日期";
  const hasTime = value.length !== 10;
  const parsed = new Date(hasTime ? value : `${value}T12:00:00+09:00`);
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: hasTime ? "2-digit" : undefined,
    minute: hasTime ? "2-digit" : undefined,
    month: "long",
    timeZone: "Asia/Tokyo",
    weekday: "short",
  }).format(parsed);
}

export function TaskDetailScreen() {
  const { colors, styles } = useStyles();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const taskId = first(params.id);
  const router = useRouter();
  const client = useOrbitApiClient();
  const detailPath = useMemo(() => taskPath(taskId), [taskId]);
  const activitiesPath = useMemo(() => taskActivitiesPath(taskId), [taskId]);
  const reminderResourcePath = useMemo(() => remindersPath("task", taskId), [taskId]);
  const detailState = useApiResource<unknown>(detailPath, () => false);
  const activitiesState = useApiResource<unknown>(activitiesPath, () => false);
  const remindersState = useApiResource<unknown>(reminderResourcePath, () => false);
  const detail = detailState.kind === "success" || detailState.kind === "empty" ? taskDetailToView(detailState.data) : null;
  const activities = activitiesState.kind === "success" || activitiesState.kind === "empty" ? taskActivitiesToView(activitiesState.data) : [];
  const reminders = remindersState.kind === "success" || remindersState.kind === "empty"
    ? reminderPlansToView(remindersState.data).filter((item) => item.status === "scheduled")
    : [];
  const quickReminderOptions = useMemo(() => reminderQuickOptions(new Date()), []);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [baseline, setBaseline] = useState<TaskDetailView | null>(null);
  const [latest, setLatest] = useState<TaskDetailView | null>(null);
  const latestRef = useRef(latest);
  latestRef.current = latest;
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const mutationScope = useMemo(() => ({ active: true, busy: false, keys: new Map<string, string>() }), [client, taskId]);
  const scopeRef = useRef(mutationScope);
  scopeRef.current = mutationScope;

  useEffect(() => {
    mutationScope.active = true;
    setSaving(false);
    setMutationError(null);
    setReminderMessage(null);
    setMoreOpen(false);
    return () => { mutationScope.active = false; mutationScope.keys.clear(); };
  }, [mutationScope]);

  async function mutate(
    method: "patch" | "post" | "delete",
    path: string,
    body: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
    onSuccess: (data: unknown) => void,
  ) {
    const scope = mutationScope;
    const isCurrent = () => scope.active && scopeRef.current === scope;
    if (!isCurrent() || scope.busy) return;
    scope.busy = true;
    setSaving(true);
    setMutationError(null);
    try {
      const payload = typeof body === "function" ? await body() : body;
      if (!isCurrent()) return;
      const fingerprint = JSON.stringify([method, path, payload]);
      const key = scope.keys.get(fingerprint) ?? mutationKey();
      scope.keys.set(fingerprint, key);
      const result = await client[method]<unknown>(path, { body: { ...payload, idempotencyKey: key } });
      if (!isCurrent()) return;
      if (result.success) {
        scope.keys.delete(fingerprint);
        onSuccess(result.data);
      } else setMutationError(result.error.message);
    } catch {
      if (isCurrent()) setMutationError("操作未完成，请重试。");
    } finally {
      scope.busy = false;
      if (isCurrent()) setSaving(false);
    }
  }

  useEffect(() => {
    if (!detail) return;
    setLatest(detail);
    if (!baseline || baseline.id !== detail.id || (
      baseline.updatedAt !== detail.updatedAt && title === baseline.title && notes === baseline.notes
    )) {
      setBaseline(detail);
      setTitle(detail.title);
      setNotes(detail.notes);
    }
    // Only a newly received revision may replace the editor. A successful
    // write can arrive before the GET resource refreshes its older snapshot.
  }, [detail?.id, detail?.updatedAt]);
  const staleDraft = !!baseline && !!latest && baseline.id === latest.id && baseline.updatedAt !== latest.updatedAt;

  function refresh() {
    detailState.refresh();
    activitiesState.refresh();
    remindersState.refresh();
  }

  async function save() {
    if (!detail || !baseline || baseline.id !== taskId || staleDraft || saving || !title.trim()) return;
    const normalizedTitle = title.trim();
    const normalizedNotes = notes.trim();
    if (baseline.notes && !normalizedNotes) {
      setMutationError("暂不支持清空已有备注，请保留或修改内容。");
      return;
    }
    if (normalizedTitle === baseline.title && normalizedNotes === baseline.notes.trim()) return;
    const revisionAtStart = latest?.updatedAt;
    await mutate("patch", taskPath(taskId), {
      action: "update",
      expectedUpdatedAt: baseline.updatedAt,
      patch: {
        ...(normalizedNotes ? { notes: normalizedNotes } : {}),
        title: normalizedTitle,
      },
    }, (data) => {
      if (latestRef.current?.id !== baseline.id) return;
      const updated = taskDetailToView(data);
      if (updated) {
        if (latestRef.current?.updatedAt === revisionAtStart) setLatest(updated);
        setBaseline(updated);
        setTitle(updated.title);
        setNotes(updated.notes);
      }
      refresh();
    });
  }

  async function changeStatus() {
    if (!detail) return;
    const action = detail.status === "completed" ? "reopen" : "complete";
    await mutate("patch", taskPath(taskId), { action }, () => {
      notifyReminderPlansChanged();
      refresh();
    });
  }

  async function deleteTask() {
    await mutate("delete", taskPath(taskId), {}, () => {
      notifyReminderPlansChanged();
      setMoreOpen(false);
      router.replace("/tasks" as Href);
    });
  }

  async function addReminder(fireAt: string) {
    if (!detail) return;
    let systemEnabled = false;
    await mutate("post", ORBIT_API_ENDPOINTS.reminders, async () => {
      setReminderMessage(null);
      const permission = await requestNotificationPermission().catch(() => "denied" as const);
      systemEnabled = permission === "granted" || permission === "provisional";
      return {
        body: detail.title,
        channels: systemEnabled ? ["in_app", "ios_push"] : ["in_app"],
        createdBy: "user",
        deepLink: `/tasks/${encodeURIComponent(taskId)}`,
        fireAt,
        targetId: taskId,
        targetType: "task",
        timeZone: "Asia/Tokyo",
        title: "待办提醒",
      };
    }, () => {
      setReminderMessage(systemEnabled ? "提醒已设置" : "已添加站内提醒；可在系统设置开启通知");
      notifyReminderPlansChanged();
      remindersState.refresh();
    });
  }

  async function cancelReminder(reminderId: string) {
    await mutate("patch", reminderPath(reminderId), { action: "cancel" }, () => {
      setReminderMessage("提醒已取消");
      notifyReminderPlansChanged();
      remindersState.refresh();
    });
  }

  return (
    <AppScreen
      refreshControl={<RefreshControl onRefresh={refresh} refreshing={detailState.refreshing || activitiesState.refreshing || remindersState.refreshing} tintColor={colors.accent} />}
      title="待办"
    >
      {detailState.kind === "loading" ? <LoadingState /> : null}
      {detailState.kind === "failure" || detailState.kind === "offline" ? <ErrorState message={detailState.error.message} title="待办暂时打不开" /> : null}
      {detail ? (
        <>
          <View style={styles.topBar}>
            <Text style={styles.statusText}>{detail.statusLabel}</Text>
            <Pressable accessibilityLabel="更多待办操作" accessibilityRole="button" onPress={() => setMoreOpen(true)} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null]}>
              <Ionicons color={colors.text2} name="ellipsis-horizontal" size={21} />
            </Pressable>
          </View>

          <View style={styles.editorGroup}>
            <TextInput accessibilityLabel="待办标题" editable={!saving} multiline onBlur={save} onChangeText={setTitle} style={styles.titleInput} value={title} />
            <TextInput accessibilityLabel="备注" editable={!saving} multiline onBlur={save} onChangeText={setNotes} placeholder="写一点备注" placeholderTextColor={colors.text4} style={styles.notesInput} value={notes} />
          </View>

          {staleDraft ? <View>
            <Text accessibilityRole="alert" style={styles.errorText}>这条待办已有新版本，草稿已保留。请复制需要保留的内容，再载入最新版本。</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => {
              if (!latest) return;
              setBaseline(latest); setTitle(latest.title); setNotes(latest.notes); setMutationError(null);
            }} style={styles.sheetRow}>
              <Text style={styles.sheetRowAction}>放弃草稿并载入最新内容</Text>
            </Pressable>
          </View> : null}

          <View style={styles.metadataGroup}>
            <View style={styles.metadataRow}>
              <Ionicons color={colors.accent} name="calendar-outline" size={19} />
              <Text style={styles.metadataLabel}>安排</Text>
              <Text style={styles.metadataValue}>{dateLabel(detail.dueAt ?? detail.plannedDate)}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setMoreOpen(true)} style={({ pressed }) => [styles.metadataRow, pressed ? styles.pressed : null]}>
              <Ionicons color={colors.amber} name="notifications-outline" size={19} />
              <Text style={styles.metadataLabel}>提醒</Text>
              <Text style={styles.metadataValue}>{reminders[0]?.label ?? "未设置"}</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable>
            <View style={[styles.metadataRow, styles.metadataRowLast]}>
              <Ionicons color={colors.sky} name="link-outline" size={19} />
              <Text style={styles.metadataLabel}>关联</Text>
              <Text style={styles.metadataValue}>{detail.categoryLabel}</Text>
            </View>
          </View>

          {mutationError && !moreOpen ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
          {reminderMessage ? <Text style={styles.successText}>{reminderMessage}</Text> : null}

          {detail.status !== "cancelled" ? (
            <Pressable accessibilityRole="button" disabled={saving} onPress={changeStatus} style={({ pressed }) => [styles.completeButton, detail.status === "completed" ? styles.reopenButton : null, pressed ? styles.pressed : null]}>
              <Ionicons color={detail.status === "completed" ? colors.accent : colors.onAccent} name={detail.status === "completed" ? "refresh" : "checkmark"} size={20} />
              <Text style={detail.status === "completed" ? styles.reopenButtonText : styles.completeButtonText}>{detail.status === "completed" ? "恢复待办" : "标记完成"}</Text>
            </Pressable>
          ) : null}

          <Modal animationType="slide" onRequestClose={() => setMoreOpen(false)} transparent visible={moreOpen}>
            <View style={styles.modalRoot}>
              <Pressable style={styles.modalScrim} onPress={() => setMoreOpen(false)} />
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>待办设置</Text>
                  <Pressable accessibilityLabel="关闭待办设置" accessibilityRole="button" onPress={() => setMoreOpen(false)} style={styles.iconButton}>
                    <Ionicons color={colors.text2} name="close" size={21} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.sheetBody}>
                  {mutationError ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
                  <Text style={styles.sheetSection}>提醒选项</Text>
                  {reminders.map((item) => (
                    <Pressable key={item.id} onPress={() => void cancelReminder(item.id)} style={styles.sheetRow}>
                      <Text style={styles.sheetRowText}>{item.label}</Text>
                      <Text style={styles.sheetRowAction}>取消</Text>
                    </Pressable>
                  ))}
                  {detail.status === "open" ? (
                    <View style={styles.reminderOptions}>
                      {quickReminderOptions.map((option) => (
                        <Pressable key={option.fireAt} onPress={() => void addReminder(option.fireAt)} style={styles.reminderOption}>
                          <Text style={styles.reminderOptionText}>{option.label}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}

                  <Text style={styles.sheetSection}>变更历史</Text>
                  {activities.slice(-5).reverse().map((item) => (
                    <View key={item.id} style={styles.sheetRow}>
                      <Text style={styles.sheetRowText}>{item.label}</Text>
                      <Text style={styles.sheetRowMeta}>{item.dateLabel}</Text>
                    </View>
                  ))}

                  <Pressable accessibilityRole="button" disabled={saving} onPress={deleteTask} style={styles.deleteButton}>
                    <Ionicons color={colors.rose} name="trash-outline" size={18} />
                    <Text style={styles.deleteText}>删除待办</Text>
                  </Pressable>
                </ScrollView>
              </View>
            </View>
          </Modal>
        </>
      ) : null}
    </AppScreen>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  completeButton: { ...createControlStyles(colors).primaryButton, flexDirection: "row", gap: spacing.sm },
  completeButtonText: { ...createControlStyles(colors).primaryButtonText, color: colors.onAccent },
  deleteButton: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 50, marginTop: spacing.lg },
  deleteText: { color: colors.rose, fontSize: typography.body, fontWeight: "700" },
  editorGroup: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, overflow: "hidden", borderRadius: radius.input },
  errorText: { color: colors.rose, fontSize: typography.small },
  iconButton: { alignItems: "center", justifyContent: "center", minHeight: layout.control, width: layout.control, borderRadius: radius.control },
  metadataGroup: { borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 0 },
  metadataLabel: { ...textStyles.body, color: colors.text2, fontWeight: "600", minWidth: 54, flexShrink: 0 },
  metadataRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, minHeight: 54, paddingVertical: spacing.sm },
  metadataRowLast: { borderBottomWidth: 0 },
  metadataValue: { ...textStyles.small, color: colors.text3, flex: 1, minWidth: 140, textAlign: "right" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalScrim: { backgroundColor: "rgba(16, 24, 40, 0.28)", ...StyleSheet.absoluteFill },
  notesInput: { ...textStyles.body, borderTopColor: colors.border, borderTopWidth: 1, color: colors.text2, minHeight: 120, padding: spacing.md, textAlignVertical: "top" },
  pressed: { opacity: 0.68 },
  reminderOption: { ...createControlStyles(colors).chip, flex: 1 },
  reminderOptions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  reminderOptionText: { ...textStyles.caption, color: colors.accent, textAlign: "center", flexShrink: 1 },
  reopenButton: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1 },
  reopenButtonText: { ...createControlStyles(colors).secondaryButtonText, color: colors.accent },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "78%", overflow: "hidden" },
  sheetBody: { gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.sm },
  sheetHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 58, paddingHorizontal: spacing.lg },
  sheetRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 46 },
  sheetRowAction: { color: colors.rose, fontSize: typography.small, fontWeight: "700" },
  sheetRowMeta: { color: colors.text3, fontSize: typography.caption },
  sheetRowText: { color: colors.text, flex: 1, fontSize: typography.small, fontWeight: "600" },
  sheetSection: { color: colors.text3, fontSize: typography.caption, fontWeight: "800", marginTop: spacing.md },
  sheetTitle: { ...textStyles.section, color: colors.ink },
  statusText: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  successText: { color: colors.accent, fontSize: typography.small },
  titleInput: { ...textStyles.title, color: colors.ink, minHeight: 76, padding: spacing.md },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 40 },
}));
