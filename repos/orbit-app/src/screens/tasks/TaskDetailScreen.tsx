import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { localParts } from "../../time/date-time";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ORBIT_API_ENDPOINTS, reminderPath, remindersPath, taskActivitiesPath, taskPath } from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
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
import { buildTaskDatePatch, taskDateDraftFromView, taskDateReceiptMatches, type TaskDateDraft } from "../../view-models/task-dates";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function mutationKey() {
  return `ios:task:${Crypto.randomUUID()}`;
}

function dateLabel(value: string | undefined, timeZone: string): string {
  if (!value) return "未安排日期";
  const hasTime = value.length !== 10;
  const parsed = new Date(hasTime ? value : `${value}T12:00:00Z`);
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: hasTime ? "2-digit" : undefined,
    minute: hasTime ? "2-digit" : undefined,
    month: "long",
    timeZone: hasTime ? timeZone : "UTC",
    weekday: "short",
  }).format(parsed);
}

export function TaskDetailScreen() {
  const { timeZone, canSave } = useOrbitTimeZone();
  const [editTimeZone, setEditTimeZone] = useState(timeZone);
  const { colors, styles } = useStyles();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const metadataLabelStyle = [styles.metadataLabel, largeText && styles.metadataLabelLarge];
  const titleInputRef = useRef<TextInput>(null);
  const [titleHeight, setTitleHeight] = useState(0);
  const [notesHeight, setNotesHeight] = useState(0);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const taskId = first(params.id);
  const router = useRouter();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.user?.id ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const scopeKey = JSON.stringify([server.baseUrl, actorId, taskId, ready]);
  const client = useOrbitApiClient({ scopeKey });
  const detailPath = useMemo(() => taskPath(taskId), [taskId]);
  const activitiesPath = useMemo(() => taskActivitiesPath(taskId), [taskId]);
  const reminderResourcePath = useMemo(() => remindersPath("task", taskId), [taskId]);
  const detailState = useApiResource<unknown>(detailPath, () => false, { scopeKey });
  const activitiesState = useApiResource<unknown>(activitiesPath, () => false, { scopeKey });
  const remindersState = useApiResource<unknown>(reminderResourcePath, () => false, { scopeKey });
  const detail = ready && (detailState.kind === "success" || detailState.kind === "empty") ? taskDetailToView(detailState.data) : null;
  const activities = activitiesState.kind === "success" || activitiesState.kind === "empty" ? taskActivitiesToView(activitiesState.data, timeZone) : [];
  const reminders = remindersState.kind === "success" || remindersState.kind === "empty"
    ? reminderPlansToView(remindersState.data, timeZone).filter((item) => item.status === "scheduled")
    : [];
  const quickReminderOptions = useMemo(() => reminderQuickOptions(new Date(), timeZone), [timeZone]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dateDraft, setDateDraft] = useState(() => taskDateDraftFromView(null));
  const dateDraftRef = useRef(dateDraft);
  dateDraftRef.current = dateDraft;
  const [baseline, setBaseline] = useState<TaskDetailView | null>(null);
  const [latest, setLatest] = useState<TaskDetailView | null>(null);
  const latestRef = useRef(latest);
  latestRef.current = latest;
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const mutationScope = useMemo(() => ({ active: true, busy: false, keys: new Map<string, string>(), controller: new AbortController() }), [client, scopeKey]);
  const scopeRef = useRef(mutationScope);
  scopeRef.current = mutationScope;
  const [editorScope, setEditorScope] = useState(mutationScope);
  if (editorScope !== mutationScope) {
    // Reset before the new scope is committed, including same-ID/same-version
    // tasks from another account. An effect-only reset can expose the old form.
    setEditorScope(mutationScope);
    setEditTimeZone(timeZone);
    setBaseline(null); setLatest(null); setTitle(""); setNotes("");
    setDateDraft(taskDateDraftFromView(null));
    setMoreOpen(false); setSaving(false); setMutationError(null); setReminderMessage(null);
  }

  useEffect(() => {
    mutationScope.active = true;
    setSaving(false);
    setMutationError(null);
    setReminderMessage(null);
    setMoreOpen(false);
    return () => { mutationScope.active = false; mutationScope.controller.abort(); mutationScope.keys.clear(); };
  }, [mutationScope]);

  async function mutate(
    method: "patch" | "post" | "delete",
    path: string,
    body: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
    onSuccess: (data: unknown) => void,
    accepts?: (data: unknown) => boolean,
  ) {
    const scope = mutationScope;
    const isCurrent = () => ready && scope.active && scopeRef.current === scope;
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
      const result = await client[method]<unknown>(path, { body: { ...payload, idempotencyKey: key }, signal: scope.controller.signal });
      if (!isCurrent()) return;
      if (result.success) {
        if (accepts && (result.status < 200 || result.status >= 300 || !accepts(result.data))) {
          setMutationError("未能确认日期已保存，草稿已保留。请重试或重新读取待办。");
          return;
        }
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
    latestRef.current = detail;
    setLatest(detail);
    if (!baseline || baseline.id !== detail.id || (
      baseline.updatedAt !== detail.updatedAt && title === baseline.title && notes === baseline.notes && buildTaskDatePatch(baseline, dateDraft, editTimeZone).kind === "unchanged"
    )) {
      setEditTimeZone(timeZone);
      setBaseline(detail);
      setTitle(detail.title);
      setNotes(detail.notes);
      dateDraftRef.current = taskDateDraftFromView(detail, timeZone);
      setDateDraft(dateDraftRef.current);
    }
    // Only a newly received revision may replace the editor. A successful
    // write can arrive before the GET resource refreshes its older snapshot.
  }, [detail?.id, detail?.updatedAt, mutationScope]);
  useEffect(() => {
    if (!baseline || timeZone === editTimeZone || saving) return;
    const clean = title === baseline.title && notes === baseline.notes && buildTaskDatePatch(baseline, dateDraft, editTimeZone).kind === "unchanged";
    if (clean) {
      setEditTimeZone(timeZone);
      dateDraftRef.current = taskDateDraftFromView(baseline, timeZone);
      setDateDraft(dateDraftRef.current);
    }
  }, [timeZone, editTimeZone, baseline, title, notes, dateDraft, saving]);
  const staleDraft = !!baseline && !!latest && baseline.id === latest.id && baseline.updatedAt !== latest.updatedAt;
  const displayedDate = (latest ?? detail)?.dueAt ?? (latest ?? detail)?.plannedDate;

  function refresh() {
    detailState.refresh();
    activitiesState.refresh();
    remindersState.refresh();
  }

  function discardDraft() {
    if (!latest || saving) return;
    setEditTimeZone(timeZone);
    setBaseline(latest); setTitle(latest.title); setNotes(latest.notes);
    dateDraftRef.current = taskDateDraftFromView(latest, timeZone);
    setDateDraft(dateDraftRef.current); setMutationError(null);
  }

  function changeDate(field: keyof TaskDateDraft, value: string) {
    if (scopeRef.current !== mutationScope || !mutationScope.active || mutationScope.busy || latestRef.current?.status === "cancelled") return;
    dateDraftRef.current = { ...dateDraftRef.current, [field]: value };
    setDateDraft(dateDraftRef.current);
  }

  async function saveDates() {
    if (!canSave) { setMutationError("无法读取设备时区，草稿已保留。请恢复时区后保存。"); return; }
    if (!ready || scopeRef.current !== mutationScope || !mutationScope.active || dateDraftRef.current !== dateDraft) return;
    if (!detail || !baseline || baseline.id !== taskId || detail.status === "cancelled" || staleDraft || saving) return;
    if (latestRef.current?.id !== baseline.id || latestRef.current.updatedAt !== baseline.updatedAt) return;
    const change = buildTaskDatePatch(baseline, dateDraft, editTimeZone);
    if (change.kind === "invalid") { setMutationError(change.message); return; }
    if (change.kind === "unchanged") { setMutationError(null); return; }
    const revisionAtStart = latest?.updatedAt;
    await mutate("patch", taskPath(taskId), {
      action: "update", expectedUpdatedAt: baseline.updatedAt, patch: change.patch,
    }, data => {
      const updated = taskDetailToView(data)!; // Accepted below before acknowledging.
      if (latestRef.current?.updatedAt === revisionAtStart) setLatest(updated);
      setBaseline(updated);
      dateDraftRef.current = taskDateDraftFromView(updated, editTimeZone);
      setDateDraft(dateDraftRef.current);
      // Title and notes may still be unsaved. Their draft belongs to the user.
      refresh();
    }, data => taskDateReceiptMatches(data, taskId, actorId, change.patch));
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
    if (!canSave) { setReminderMessage("无法读取设备时区，请稍后设置提醒。"); return; }
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
        timeZone,
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
    <View style={styles.screen}>
    <AppScreen
      refreshControl={<RefreshControl onRefresh={refresh} refreshing={detailState.refreshing || activitiesState.refreshing || remindersState.refreshing} tintColor={colors.accent} />}
      headerActions={detail ? <Pressable accessibilityLabel="编辑待办" accessibilityRole="button" disabled={saving} onPress={() => titleInputRef.current?.focus()} style={styles.iconButton}>
        {largeText ? <Ionicons color={colors.accent} name="create-outline" size={22} /> : <Text style={styles.editLink}>编辑</Text>}
      </Pressable> : null}
      title="待办详情"
    >
      {detailState.kind === "loading" ? <LoadingState /> : null}
      {detailState.kind === "failure" || detailState.kind === "offline" ? <ErrorState message={detailState.error.message} title="待办暂时打不开" /> : null}
      {detail ? (
        <>
          <View style={styles.hero}>
            <Pressable
              accessibilityLabel={detail.status === "completed" ? `恢复：${detail.title}` : `完成：${detail.title}`}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: detail.status === "completed", disabled: saving || detail.status === "cancelled" }}
              aria-checked={detail.status === "completed"}
              disabled={saving || detail.status === "cancelled"}
              onPress={changeStatus}
              style={styles.heroCheckButton}
            >
              <View style={[styles.checkbox, detail.status === "completed" && styles.checkboxCompleted]}>
                {detail.status === "completed" ? <Ionicons color={colors.onAccent} name="checkmark" size={18} /> : null}
              </View>
            </Pressable>
            <View style={styles.heroBody}>
              <TextInput ref={titleInputRef} accessibilityLabel="待办标题" editable={!saving} multiline scrollEnabled={false} onBlur={save} onChangeText={setTitle}
                onContentSizeChange={event => setTitleHeight(event.nativeEvent.contentSize.height)}
                style={[styles.titleInput, { minHeight: Math.max(32 * fontScale, titleHeight) }]} value={title} />
              <View style={styles.badges}>
                <Text style={styles.statusText}>{detail.status === "open" ? "未完成" : detail.statusLabel}</Text>
                {displayedDate ? <Text style={styles.dateBadge}>{taskDateLabel(displayedDate, timeZone)}</Text> : null}
              </View>
            </View>
          </View>

          {staleDraft && !moreOpen ? <View>
            <Text accessibilityRole="alert" style={styles.errorText}>这条待办已有新版本，草稿已保留。请复制需要保留的内容，再载入最新版本。</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={discardDraft} style={styles.sheetRow}>
              <Text style={styles.sheetRowAction}>放弃草稿并载入最新内容</Text>
            </Pressable>
          </View> : null}

          <View style={styles.metadataGroup}>
            <Pressable accessibilityLabel="编辑日期和时间" accessibilityRole="button" onPress={() => setMoreOpen(true)} style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>{(latest ?? detail).dueAt ? "截止" : "安排"}</Text>
              <Text style={styles.metadataValue}>{taskDateLabel(displayedDate, timeZone)}</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable>
            {detail.relatedContactId ? <Pressable accessibilityLabel="查看关联人脉" accessibilityRole="button" onPress={() => router.push(`/contacts/${encodeURIComponent(detail.relatedContactId!)}` as Href)} style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>相关人脉</Text>
              <Text style={[styles.metadataValue, styles.linkValue]}>查看关联人脉</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable> : null}
            {detail.relatedEventId ? <Pressable accessibilityLabel="查看关联活动" accessibilityRole="button" onPress={() => router.push(`/events/${encodeURIComponent(detail.relatedEventId!)}` as Href)} style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>相关活动</Text>
              <Text style={[styles.metadataValue, styles.linkValue]}>查看关联活动</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable> : null}
            {(latest ?? detail).location ? <View style={styles.metadataRow}><Text style={metadataLabelStyle}>地点</Text><Text style={styles.metadataValue}>{(latest ?? detail).location}</Text></View> : null}
            {detail.sourceLabel ? <View style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>来源</Text>
              <Text style={styles.metadataValue}>{detail.sourceLabel}</Text>
            </View> : null}
            {detail.createdAt ? <View style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>创建于</Text>
              <Text style={styles.metadataValue}>{createdDateLabel(detail.createdAt, timeZone)}</Text>
            </View> : null}
            <View style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>分类</Text>
              <Text style={styles.metadataValue}>{detail.categoryLabel}</Text>
            </View>
            <Pressable accessibilityLabel="更多待办操作" accessibilityRole="button" onPress={() => setMoreOpen(true)} style={({ pressed }) => [styles.metadataRow, pressed ? styles.pressed : null]}>
              <Text style={metadataLabelStyle}>提醒</Text>
              <Text style={styles.metadataValue}>{reminders[0]?.label ?? "未设置"}</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable>
          </View>

          <View style={styles.contentSection}>
            <Text accessibilityRole="header" style={styles.contentHeading}>内容</Text>
            <TextInput accessibilityLabel="备注" editable={!saving} multiline scrollEnabled={false} onBlur={save} onChangeText={setNotes}
              onContentSizeChange={event => setNotesHeight(event.nativeEvent.contentSize.height)}
              placeholder="写一点备注" placeholderTextColor={colors.text4}
              style={[styles.notesInput, { height: Math.max(72, notesHeight, 24 * fontScale) }]} value={notes} />
          </View>

          {mutationError && !moreOpen ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
          {reminderMessage ? <Text style={styles.successText}>{reminderMessage}</Text> : null}

          <Modal animationType="slide" onRequestClose={() => setMoreOpen(false)} transparent visible={moreOpen}>
            <View style={styles.modalRoot}>
              <Pressable accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="task-settings-scrim" style={styles.modalScrim} onPress={() => setMoreOpen(false)} />
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>待办设置</Text>
                  <Pressable accessibilityLabel="关闭待办设置" accessibilityRole="button" onPress={() => setMoreOpen(false)} style={styles.iconButton}>
                    <Ionicons color={colors.text2} name="close" size={21} />
                  </Pressable>
                </View>
                <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
                  {mutationError ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
                  {timeZone !== editTimeZone ? <Text accessibilityRole="alert">此草稿按原时区 {editTimeZone} 保存。</Text> : null}
              {staleDraft ? <View>
                    <Text accessibilityRole="alert" style={styles.errorText}>这条待办已有新版本，草稿已保留。请复制需要保留的内容，再载入最新版本。</Text>
                    <Pressable accessibilityRole="button" disabled={saving} onPress={discardDraft} style={styles.sheetRow}>
                      <Text style={styles.sheetRowAction}>放弃草稿并载入最新内容</Text>
                    </Pressable>
                  </View> : null}
                  <Text style={styles.sheetSection}>日期和时间</Text>
                  <Text style={styles.dateHint}>没有具体时间时，只填写安排日期。截止时间使用 {editTimeZone}。清空日期或地点后保存即可移除。</Text>
                  {([
                    ["plannedDate", "安排日期", "YYYY-MM-DD"],
                    ["dueDate", "截止日期", "YYYY-MM-DD"],
                    ["dueTime", "截止时间", "HH:mm"],
                    ["location", "地点", "填写地点，清空可移除"],
                  ] as const).map(([field, label, placeholder]) => <View key={field} style={styles.dateField}>
                    <Text style={styles.dateFieldLabel}>{label}</Text>
                    <TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} editable={!saving && detail.status !== "cancelled"}
                      onChangeText={value => changeDate(field, value)}
                      placeholder={placeholder} placeholderTextColor={colors.text4} style={styles.dateInput} value={dateDraft[field] ?? ""} />
                  </View>)}
                  <Text style={styles.dateHint}>修改日期不会自动调整已有提醒。</Text>
                  {detail.status === "cancelled" ? <Text style={styles.dateHint}>已取消的待办不能修改日期。</Text> : null}
                  <Pressable accessibilityLabel="保存日期和时间" accessibilityRole="button" disabled={saving || staleDraft || detail.status === "cancelled"} onPress={saveDates}
                    style={[styles.dateSaveButton, (saving || staleDraft || detail.status === "cancelled") && styles.pressed]}>
                    <Text style={styles.completeButtonText}>{saving ? "正在保存…" : "保存日期、时间和地点"}</Text>
                  </Pressable>
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
    {detail ? <View testID="task-detail-actions" style={[styles.actionDock, { paddingBottom: Math.max(24, insets.bottom) }]}>
      <View style={styles.actionContent}>
        {detail.status !== "cancelled" ? <Pressable accessibilityRole="button" disabled={saving} onPress={changeStatus} style={({ pressed }) => [styles.completeButton, detail.status === "completed" ? styles.reopenButton : null, pressed ? styles.pressed : null]}>
          <Text style={detail.status === "completed" ? styles.reopenButtonText : styles.completeButtonText}>{detail.status === "completed" ? "恢复待办" : "标记完成"}</Text>
        </Pressable> : null}
        <Pressable accessibilityLabel="编辑待办" accessibilityRole="button" disabled={saving} onPress={() => titleInputRef.current?.focus()} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
          <Text style={styles.editButtonText}>编辑待办</Text>
        </Pressable>
      </View>
    </View> : null}
    </View>
  );
}

function taskDateLabel(value: string | undefined, timeZone: string): string {
  if (!value) return "未安排日期";
  const now = new Date();
  const date = new Date(value.length === 10 ? `${value}T12:00:00+09:00` : value);
  if (!Number.isFinite(date.getTime())) return "日期不可用";
  if ((value.length === 10 ? value : localParts(date, timeZone).date) === localParts(now, timeZone).date) {
    return value.length === 10 ? "今天" : `今天 ${new Intl.DateTimeFormat("zh-CN", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date)}`;
  }
  return dateLabel(value, timeZone);
}

function createdDateLabel(value: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("zh-CN", { timeZone, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("month")}月${part("day")}日 ${part("hour")}:${part("minute")}`;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  actionContent: { alignSelf: "center", gap: 8, maxWidth: layout.contentMax - 2 * layout.pageInset, width: "100%" },
  actionDock: { backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 12, paddingHorizontal: 16 },
  badges: { alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  checkbox: { alignItems: "center", justifyContent: "center", width: 26, height: 26, borderWidth: 1.5, borderColor: colors.ink, borderRadius: 7 },
  checkboxCompleted: { backgroundColor: colors.accent, borderColor: colors.accent },
  completeButton: { ...createControlStyles(colors).primaryButton, minHeight: 50 },
  completeButtonText: { ...createControlStyles(colors).primaryButtonText, fontSize: 15, lineHeight: 22 },
  contentHeading: { color: colors.ink, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  contentSection: { gap: 6 },
  dateBadge: { color: colors.surface, backgroundColor: colors.ink, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 9, fontSize: 11, lineHeight: 16, fontWeight: "700" },
  dateField: { gap: 6, marginTop: spacing.sm },
  dateFieldLabel: { color: colors.text2, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  dateHint: { color: colors.text3, fontSize: 13, lineHeight: 20 },
  dateInput: { color: colors.ink, fontSize: 16, lineHeight: 24, minHeight: 48, borderWidth: 1, borderColor: colors.border, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 10 },
  dateSaveButton: { ...createControlStyles(colors).primaryButton, minHeight: 48, marginTop: spacing.sm },
  deleteButton: { alignItems: "center", flexDirection: "row", gap: spacing.sm, justifyContent: "center", minHeight: 50, marginTop: spacing.lg },
  deleteText: { color: colors.rose, fontSize: typography.body, fontWeight: "700" },
  editButton: { ...createControlStyles(colors).secondaryButton, minHeight: 46 },
  editButtonText: { ...createControlStyles(colors).secondaryButtonText, fontSize: 14, lineHeight: 20 },
  editLink: { color: colors.accent, fontSize: 14, lineHeight: 20, fontWeight: "600" },
  errorText: { color: colors.rose, fontSize: typography.small },
  iconButton: { alignItems: "center", justifyContent: "center", minHeight: layout.control, width: layout.control, borderRadius: radius.control },
  hero: { alignItems: "flex-start", flexDirection: "row", gap: 0, paddingTop: 4 },
  heroBody: { flex: 1, minWidth: 0 },
  heroCheckButton: { width: 44, minHeight: 44, justifyContent: "flex-start", paddingTop: 4 },
  linkValue: { color: colors.accent },
  metadataGroup: { borderTopColor: colors.border, borderTopWidth: 1, backgroundColor: colors.surface },
  metadataLabel: { color: colors.text3, fontSize: 14, lineHeight: 20, width: 72, flexShrink: 0 },
  metadataLabelLarge: { width: "100%", marginBottom: 6 },
  metadataRow: { alignItems: "center", borderBottomColor: colors.border2, borderBottomWidth: 1, flexDirection: "row", flexWrap: "wrap", gap: 0, minHeight: 48, paddingVertical: 13 },
  metadataValue: { color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: "600", flex: 1, minWidth: 120 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalScrim: { backgroundColor: "rgba(16, 24, 40, 0.28)", ...StyleSheet.absoluteFill },
  notesInput: { color: colors.text2, fontSize: 15, lineHeight: 24, padding: 0, textAlignVertical: "top" },
  pressed: { opacity: 0.68 },
  reminderOption: { ...createControlStyles(colors).chip, flex: 1 },
  reminderOptions: { flexDirection: "row", gap: spacing.sm, flexWrap: "wrap" },
  reminderOptionText: { ...textStyles.caption, color: colors.accent, textAlign: "center", flexShrink: 1 },
  reopenButton: { backgroundColor: colors.surface, borderColor: colors.accent, borderWidth: 1 },
  reopenButtonText: { ...createControlStyles(colors).secondaryButtonText, color: colors.accent },
  screen: { flex: 1, backgroundColor: colors.surface },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "78%", overflow: "hidden" },
  sheetBody: { gap: spacing.sm, padding: spacing.lg, paddingTop: spacing.sm },
  sheetHeader: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 58, paddingHorizontal: spacing.lg },
  sheetRow: { alignItems: "center", borderBottomColor: colors.border, borderBottomWidth: 1, flexDirection: "row", gap: spacing.sm, minHeight: 46 },
  sheetRowAction: { color: colors.rose, fontSize: typography.small, fontWeight: "700" },
  sheetRowMeta: { color: colors.text3, fontSize: typography.caption },
  sheetRowText: { color: colors.text, flex: 1, fontSize: typography.small, fontWeight: "600" },
  sheetSection: { color: colors.text3, fontSize: typography.caption, fontWeight: "800", marginTop: spacing.md },
  sheetTitle: { ...textStyles.section, color: colors.ink },
  statusText: { color: colors.text3, fontSize: 11, lineHeight: 16, borderColor: colors.border, borderWidth: 1, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 3 },
  successText: { color: colors.accent, fontSize: typography.small },
  titleInput: { color: colors.ink, fontSize: 24, lineHeight: 32, fontWeight: "900", letterSpacing: -0.48, padding: 0, textAlignVertical: "top" },
}));
