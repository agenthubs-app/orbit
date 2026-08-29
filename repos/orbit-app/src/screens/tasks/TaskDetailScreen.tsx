import { Ionicons } from "@expo/vector-icons";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { ORBIT_API_ENDPOINTS, reminderPath, remindersPath, taskActivitiesPath, taskPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { notifyReminderPlansChanged, requestNotificationPermission } from "../../notifications/native-notifications";
import { reminderPlansToView, reminderQuickOptions } from "../../view-models/reminders";
import { taskActivitiesToView, taskDetailToView } from "../../view-models/today-tasks";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function mutationKey(action: string) {
  return `ios:${action}:${Date.now()}`;
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) return;
    setTitle(detail.title);
    setNotes(detail.notes);
  }, [detail?.id, detail?.updatedAt]);

  function refresh() {
    detailState.refresh();
    activitiesState.refresh();
    remindersState.refresh();
  }

  async function save() {
    if (!detail || !title.trim() || saving) return;
    const normalizedTitle = title.trim();
    const normalizedNotes = notes.trim();
    if (normalizedTitle === detail.title && normalizedNotes === detail.notes.trim()) return;
    setSaving(true);
    setMutationError(null);
    const result = await client.patch<unknown>(taskPath(taskId), {
      body: {
        action: "update",
        expectedUpdatedAt: detail.updatedAt,
        idempotencyKey: mutationKey(`update:${taskId}`),
        patch: {
          category: detail.category,
          ...(normalizedNotes ? { notes: normalizedNotes } : {}),
          title: normalizedTitle,
        },
      },
    });
    if (result.success) refresh();
    else setMutationError(result.error.message);
    setSaving(false);
  }

  async function changeStatus() {
    if (!detail) return;
    setSaving(true);
    setMutationError(null);
    const action = detail.status === "completed" ? "reopen" : "complete";
    const result = await client.patch<unknown>(taskPath(taskId), {
      body: { action, idempotencyKey: mutationKey(`${action}:${taskId}`) },
    });
    if (result.success) {
      notifyReminderPlansChanged();
      refresh();
    } else setMutationError(result.error.message);
    setSaving(false);
  }

  async function deleteTask() {
    setSaving(true);
    setMutationError(null);
    const result = await client.delete<unknown>(taskPath(taskId), {
      body: { idempotencyKey: mutationKey(`delete:${taskId}`) },
    });
    if (result.success) {
      notifyReminderPlansChanged();
      setMoreOpen(false);
      router.replace("/tasks" as Href);
    } else setMutationError(result.error.message);
    setSaving(false);
  }

  async function addReminder(fireAt: string) {
    if (!detail) return;
    setSaving(true);
    setMutationError(null);
    setReminderMessage(null);
    const permission = await requestNotificationPermission().catch(() => "denied" as const);
    const systemEnabled = permission === "granted" || permission === "provisional";
    const result = await client.post<unknown>(ORBIT_API_ENDPOINTS.reminders, {
      body: {
        body: detail.title,
        channels: systemEnabled ? ["in_app", "ios_push"] : ["in_app"],
        createdBy: "user",
        deepLink: `/tasks/${encodeURIComponent(taskId)}`,
        fireAt,
        idempotencyKey: mutationKey(`reminder:${taskId}:${fireAt}`),
        targetId: taskId,
        targetType: "task",
        timeZone: "Asia/Tokyo",
        title: "待办提醒",
      },
    });
    if (result.success) {
      setReminderMessage(systemEnabled ? "提醒已设置" : "已添加站内提醒；可在系统设置开启通知");
      notifyReminderPlansChanged();
      remindersState.refresh();
    } else setMutationError(result.error.message);
    setSaving(false);
  }

  async function cancelReminder(reminderId: string) {
    setSaving(true);
    setMutationError(null);
    const result = await client.patch<unknown>(reminderPath(reminderId), {
      body: { action: "cancel", idempotencyKey: mutationKey(`cancel-reminder:${reminderId}`) },
    });
    if (result.success) {
      setReminderMessage("提醒已取消");
      notifyReminderPlansChanged();
      remindersState.refresh();
    } else setMutationError(result.error.message);
    setSaving(false);
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
            <TextInput accessibilityLabel="待办标题" multiline onBlur={save} onChangeText={setTitle} style={styles.titleInput} value={title} />
            <TextInput accessibilityLabel="备注" multiline onBlur={save} onChangeText={setNotes} placeholder="写一点备注" placeholderTextColor={colors.text4} style={styles.notesInput} value={notes} />
          </View>

          <View style={styles.metadataGroup}>
            <View style={styles.metadataRow}>
              <Ionicons color={colors.accent} name="calendar-outline" size={19} />
              <Text style={styles.metadataLabel}>安排</Text>
              <Text numberOfLines={1} style={styles.metadataValue}>{dateLabel(detail.dueAt ?? detail.plannedDate)}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setMoreOpen(true)} style={({ pressed }) => [styles.metadataRow, pressed ? styles.pressed : null]}>
              <Ionicons color={colors.amber} name="notifications-outline" size={19} />
              <Text style={styles.metadataLabel}>提醒</Text>
              <Text numberOfLines={1} style={styles.metadataValue}>{reminders[0]?.label ?? "未设置"}</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable>
            <View style={[styles.metadataRow, styles.metadataRowLast]}>
              <Ionicons color={colors.sky} name="link-outline" size={19} />
              <Text style={styles.metadataLabel}>关联</Text>
              <Text numberOfLines={1} style={styles.metadataValue}>{detail.categoryLabel}</Text>
            </View>
          </View>

          {mutationError ? <Text style={styles.errorText}>{mutationError}</Text> : null}
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

const styles = StyleSheet.create({
  completeButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.control, flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 50 },
  completeButtonText: { color: colors.onAccent, fontSize: typography.body, fontWeight: "800" },
  deleteButton: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 50, marginTop: spacing.lg },
  deleteText: { color: colors.rose, fontSize: typography.body, fontWeight: "700" },
  editorGroup: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  errorText: { color: colors.rose, fontSize: typography.small },
  iconButton: { alignItems: "center", borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  metadataGroup: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.md, borderWidth: 1, overflow: "hidden" },
  metadataLabel: { color: colors.text2, fontSize: typography.body, fontWeight: "700", width: 54 },
  metadataRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 54, paddingHorizontal: spacing.md },
  metadataRowLast: { borderBottomWidth: 0 },
  metadataValue: { color: colors.text3, flex: 1, fontSize: typography.small, textAlign: "right" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalScrim: { backgroundColor: "rgba(16, 24, 40, 0.28)", ...StyleSheet.absoluteFill },
  notesInput: { borderTopColor: colors.border, borderTopWidth: 1, color: colors.text2, fontSize: typography.body, lineHeight: 22, minHeight: 120, padding: spacing.md, textAlignVertical: "top" },
  pressed: { opacity: 0.68 },
  reminderOption: { alignItems: "center", backgroundColor: colors.accentSofter, borderRadius: radius.control, flex: 1, justifyContent: "center", minHeight: 42, paddingHorizontal: spacing.xs },
  reminderOptions: { flexDirection: "row", gap: spacing.sm },
  reminderOptionText: { color: colors.accent, fontSize: typography.caption, fontWeight: "700", textAlign: "center" },
  reopenButton: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1 },
  reopenButtonText: { color: colors.accent, fontSize: typography.body, fontWeight: "800" },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "78%", overflow: "hidden" },
  sheetBody: { gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.sm },
  sheetHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 58, paddingHorizontal: spacing.lg },
  sheetRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 46 },
  sheetRowAction: { color: colors.rose, fontSize: typography.small, fontWeight: "700" },
  sheetRowMeta: { color: colors.text3, fontSize: typography.caption },
  sheetRowText: { color: colors.text, flex: 1, fontSize: typography.small, fontWeight: "600" },
  sheetSection: { color: colors.text3, fontSize: typography.caption, fontWeight: "800", marginTop: spacing.md },
  sheetTitle: { color: colors.ink, fontSize: typography.section, fontWeight: "800" },
  statusText: { color: colors.text3, fontSize: typography.caption, fontWeight: "700" },
  successText: { color: colors.accent, fontSize: typography.small },
  titleInput: { color: colors.ink, fontSize: typography.title, fontWeight: "700", lineHeight: 30, minHeight: 76, padding: spacing.md },
  topBar: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 40 },
});
