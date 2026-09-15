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
import type { OrbitLanguage } from "../../api/contract/language";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout, textStyles, radius, spacing, typography } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { OrbitTranslator } from "../../i18n/messages";
import { notifyReminderPlansChanged, requestNotificationPermission } from "../../notifications/native-notifications";
import { reminderPlansToView, reminderQuickOptions } from "../../view-models/reminders";
import { ownedTaskDetailToView, taskActivitiesToView, type TaskDetailView } from "../../view-models/today-tasks";
import { buildTaskDatePatch, taskDateDraftFromView, taskDateReceiptMatches, type TaskDateDraft } from "../../view-models/task-dates";

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function mutationKey() {
  return `ios:task:${Crypto.randomUUID()}`;
}

function localeTag(language: OrbitLanguage): string {
  return language === "zh" ? "zh-CN" : language === "ja" ? "ja-JP" : "en-US";
}

function dateLabel(value: string | undefined, timeZone: string, language: OrbitLanguage, t: OrbitTranslator): string {
  if (!value) return t("taskDetail.dateUnscheduled");
  const hasTime = value.length !== 10;
  const parsed = new Date(hasTime ? value : `${value}T12:00:00Z`);
  return new Intl.DateTimeFormat(localeTag(language), {
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
  const locale = useOrbitLocale();
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
  const actorId = auth.actorId ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const scopeKey = JSON.stringify([server.baseUrl, actorId, taskId, ready]);
  const client = useOrbitApiClient({ scopeKey });
  const detailPath = useMemo(() => taskPath(taskId), [taskId]);
  const activitiesPath = useMemo(() => taskActivitiesPath(taskId), [taskId]);
  const reminderResourcePath = useMemo(() => remindersPath("task", taskId), [taskId]);
  const detailState = useApiResource<unknown>(detailPath, () => false, { scopeKey });
  const activitiesState = useApiResource<unknown>(activitiesPath, () => false, { scopeKey });
  const remindersState = useApiResource<unknown>(reminderResourcePath, () => false, { scopeKey });
  const detail = ready && (detailState.kind === "success" || detailState.kind === "empty") ? ownedTaskDetailToView(detailState.data, actorId, locale.language) : null;
  const activities = activitiesState.kind === "success" || activitiesState.kind === "empty" ? taskActivitiesToView(activitiesState.data, timeZone, locale.language) : [];
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
          setMutationError(locale.t("taskDetail.saveDateUnconfirmed"));
          return;
        }
        scope.keys.delete(fingerprint);
        onSuccess(result.data);
      } else setMutationError(result.error.message);
    } catch {
      if (isCurrent()) setMutationError(locale.t("taskDetail.operationFailed"));
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
    if (!canSave) { setMutationError(locale.t("taskDetail.timezoneUnavailable")); return; }
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
      const updated = ownedTaskDetailToView(data, actorId, locale.language)!; // Accepted below before acknowledging.
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
      setMutationError(locale.t("taskDetail.noteClearUnsupported"));
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
      const updated = ownedTaskDetailToView(data, actorId, locale.language);
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
    if (!canSave) { setReminderMessage(locale.t("taskDetail.reminderTimezoneUnavailable")); return; }
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
        title: locale.t("taskDetail.reminderTitle"),
      };
    }, () => {
      setReminderMessage(locale.t(systemEnabled ? "taskDetail.reminderSet" : "taskDetail.reminderSetInApp"));
      notifyReminderPlansChanged();
      remindersState.refresh();
    });
  }

  async function cancelReminder(reminderId: string) {
    await mutate("patch", reminderPath(reminderId), { action: "cancel" }, () => {
      setReminderMessage(locale.t("taskDetail.reminderCancelled"));
      notifyReminderPlansChanged();
      remindersState.refresh();
    });
  }

  return (
    <View style={styles.screen}>
    <AppScreen
      backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("tasks.title") })}
      backLabel={locale.t("tasks.title")}
      refreshControl={<RefreshControl onRefresh={refresh} refreshing={detailState.refreshing || activitiesState.refreshing || remindersState.refreshing} tintColor={colors.accent} />}
      headerActions={detail ? <Pressable accessibilityLabel={locale.t("taskDetail.edit")} accessibilityRole="button" disabled={saving} onPress={() => titleInputRef.current?.focus()} style={styles.iconButton}>
        {largeText ? <Ionicons color={colors.accent} name="create-outline" size={22} /> : <Text style={styles.editLink}>{locale.t("taskDetail.edit")}</Text>}
      </Pressable> : null}
      title={locale.t("taskDetail.title")}
    >
      {detailState.kind === "loading" ? <LoadingState /> : null}
      {detailState.kind === "failure" || detailState.kind === "offline" ? <ErrorState message={detailState.error.message} title={locale.t("taskDetail.unavailable")} /> : null}
      {detail ? (
        <>
          <View style={styles.hero}>
            <Pressable
              accessibilityLabel={locale.t(detail.status === "completed" ? "tasks.restoreNamed" : "tasks.completeNamed", { title: detail.title })}
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
              <TextInput ref={titleInputRef} accessibilityLabel={locale.t("taskDetail.titleLabel")} editable={!saving} multiline scrollEnabled={false} onBlur={save} onChangeText={setTitle}
                onContentSizeChange={event => setTitleHeight(event.nativeEvent.contentSize.height)}
                style={[styles.titleInput, { minHeight: Math.max(32 * fontScale, titleHeight) }]} value={title} />
              <View style={styles.badges}>
                <Text style={styles.statusText}>{detail.status === "open" ? locale.t("taskDetail.statusOpen") : detail.statusLabel}</Text>
                {displayedDate ? <Text style={styles.dateBadge}>{taskDateLabel(displayedDate, timeZone, locale.language, locale.t)}</Text> : null}
              </View>
            </View>
          </View>

          {staleDraft && !moreOpen ? <View>
            <Text accessibilityRole="alert" style={styles.errorText}>{locale.t("taskDetail.staleWarning")}</Text>
            <Pressable accessibilityRole="button" disabled={saving} onPress={discardDraft} style={styles.sheetRow}>
              <Text style={styles.sheetRowAction}>{locale.t("taskDetail.discardDraft")}</Text>
            </Pressable>
          </View> : null}

          <View style={styles.metadataGroup}>
            <Pressable accessibilityLabel={locale.t("taskDetail.editDateTime")} accessibilityRole="button" onPress={() => setMoreOpen(true)} style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>{locale.t((latest ?? detail).dueAt ? "taskDetail.due" : "taskDetail.scheduled")}</Text>
              <Text style={styles.metadataValue}>{taskDateLabel(displayedDate, timeZone, locale.language, locale.t)}</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable>
            {detail.relatedContactId ? <Pressable accessibilityLabel={locale.t("taskDetail.viewContact")} accessibilityRole="button" onPress={() => router.push(`/contacts/${encodeURIComponent(detail.relatedContactId!)}` as Href)} style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>{locale.t("taskDetail.relatedContact")}</Text>
              <Text style={[styles.metadataValue, styles.linkValue]}>{locale.t("taskDetail.viewContact")}</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable> : null}
            {detail.relatedEventId ? <Pressable accessibilityLabel={locale.t("taskDetail.viewEvent")} accessibilityRole="button" onPress={() => router.push(`/events/${encodeURIComponent(detail.relatedEventId!)}` as Href)} style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>{locale.t("taskDetail.relatedEvent")}</Text>
              <Text style={[styles.metadataValue, styles.linkValue]}>{locale.t("taskDetail.viewEvent")}</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable> : null}
            {(latest ?? detail).location ? <View style={styles.metadataRow}><Text style={metadataLabelStyle}>{locale.t("taskDetail.location")}</Text><Text style={styles.metadataValue}>{(latest ?? detail).location}</Text></View> : null}
            {detail.sourceNoteId && detail.sourceNoteVersion ? <Pressable accessibilityLabel={locale.t("taskDetail.viewSourceNote")} accessibilityRole="button" onPress={() => router.push(`/notes/${encodeURIComponent(detail.sourceNoteId!)}` as Href)} style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>{locale.t("taskDetail.sourceNote")}</Text>
              <Text style={[styles.metadataValue, styles.linkValue]}>{locale.t("taskDetail.viewSourceNoteVersion", { version: detail.sourceNoteVersion })}</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable> : null}
            {detail.sourceLabel ? <View style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>{locale.t("taskDetail.source")}</Text>
              <Text style={styles.metadataValue}>{detail.sourceLabel}</Text>
            </View> : null}
            {detail.createdAt ? <View style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>{locale.t("taskDetail.createdAt")}</Text>
              <Text style={styles.metadataValue}>{createdDateLabel(detail.createdAt, timeZone, locale.language)}</Text>
            </View> : null}
            <View style={styles.metadataRow}>
              <Text style={metadataLabelStyle}>{locale.t("taskDetail.category")}</Text>
              <Text style={styles.metadataValue}>{detail.categoryLabel}</Text>
            </View>
            <Pressable accessibilityLabel={locale.t("taskDetail.moreActions")} accessibilityRole="button" onPress={() => setMoreOpen(true)} style={({ pressed }) => [styles.metadataRow, pressed ? styles.pressed : null]}>
              <Text style={metadataLabelStyle}>{locale.t("taskDetail.reminder")}</Text>
              <Text style={styles.metadataValue}>{reminders[0]?.label ?? locale.t("taskDetail.reminderUnset")}</Text>
              <Ionicons color={colors.text4} name="chevron-forward" size={17} />
            </Pressable>
          </View>

          <View style={styles.contentSection}>
            <Text accessibilityRole="header" style={styles.contentHeading}>{locale.t("taskDetail.content")}</Text>
            <TextInput accessibilityLabel={locale.t("taskDetail.notes")} editable={!saving} multiline scrollEnabled={false} onBlur={save} onChangeText={setNotes}
              onContentSizeChange={event => setNotesHeight(event.nativeEvent.contentSize.height)}
              placeholder={locale.t("taskDetail.notePlaceholder")} placeholderTextColor={colors.text4}
              style={[styles.notesInput, { height: Math.max(72, notesHeight, 24 * fontScale) }]} value={notes} />
          </View>

          {mutationError && !moreOpen ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
          {reminderMessage ? <Text style={styles.successText}>{reminderMessage}</Text> : null}

          <Modal animationType="slide" onRequestClose={() => setMoreOpen(false)} transparent visible={moreOpen}>
            <View style={styles.modalRoot}>
              <Pressable accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="task-settings-scrim" style={styles.modalScrim} onPress={() => setMoreOpen(false)} />
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text style={styles.sheetTitle}>{locale.t("taskDetail.settings")}</Text>
                  <Pressable accessibilityLabel={locale.t("taskDetail.closeSettings")} accessibilityRole="button" onPress={() => setMoreOpen(false)} style={styles.iconButton}>
                    <Ionicons color={colors.text2} name="close" size={21} />
                  </Pressable>
                </View>
                <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
                  {mutationError ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
                  {timeZone !== editTimeZone ? <Text accessibilityRole="alert">{locale.t("taskDetail.draftTimeZone", { timeZone: editTimeZone })}</Text> : null}
              {staleDraft ? <View>
                    <Text accessibilityRole="alert" style={styles.errorText}>{locale.t("taskDetail.staleWarning")}</Text>
                    <Pressable accessibilityRole="button" disabled={saving} onPress={discardDraft} style={styles.sheetRow}>
                      <Text style={styles.sheetRowAction}>{locale.t("taskDetail.discardDraft")}</Text>
                    </Pressable>
                  </View> : null}
                  <Text style={styles.sheetSection}>{locale.t("taskDetail.dateTimeSection")}</Text>
                  <Text style={styles.dateHint}>{locale.t("taskDetail.dateHint", { timeZone: editTimeZone })}</Text>
                  {([
                    ["plannedDate", locale.t("taskDetail.plannedDate"), "YYYY-MM-DD"],
                    ["dueDate", locale.t("taskDetail.dueDate"), "YYYY-MM-DD"],
                    ["dueTime", locale.t("taskDetail.dueTime"), "HH:mm"],
                    ["location", locale.t("taskDetail.location"), locale.t("taskDetail.locationPlaceholder")],
                  ] as const).map(([field, label, placeholder]) => <View key={field} style={styles.dateField}>
                    <Text style={styles.dateFieldLabel}>{label}</Text>
                    <TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} editable={!saving && detail.status !== "cancelled"}
                      onChangeText={value => changeDate(field, value)}
                      placeholder={placeholder} placeholderTextColor={colors.text4} style={styles.dateInput} value={dateDraft[field] ?? ""} />
                  </View>)}
                  <Text style={styles.dateHint}>{locale.t("taskDetail.reminderUnaffected")}</Text>
                  {detail.status === "cancelled" ? <Text style={styles.dateHint}>{locale.t("taskDetail.cancelledNoDate")}</Text> : null}
                  <Pressable accessibilityLabel={locale.t("taskDetail.saveDateTime")} accessibilityRole="button" disabled={saving || staleDraft || detail.status === "cancelled"} onPress={saveDates}
                    style={[styles.dateSaveButton, (saving || staleDraft || detail.status === "cancelled") && styles.pressed]}>
                    <Text style={styles.completeButtonText}>{locale.t(saving ? "taskDetail.saving" : "taskDetail.saveDateTime")}</Text>
                  </Pressable>
                  <Text style={styles.sheetSection}>{locale.t("taskDetail.reminderOptions")}</Text>
                  {reminders.map((item) => (
                    <Pressable key={item.id} onPress={() => void cancelReminder(item.id)} style={styles.sheetRow}>
                      <Text style={styles.sheetRowText}>{item.label}</Text>
                      <Text style={styles.sheetRowAction}>{locale.t("taskDetail.cancelReminder")}</Text>
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

                  <Text style={styles.sheetSection}>{locale.t("taskDetail.changeHistory")}</Text>
                  {activities.slice(-5).reverse().map((item) => (
                    <View key={item.id} style={styles.sheetRow}>
                      <Text style={styles.sheetRowText}>{item.label}</Text>
                      <Text style={styles.sheetRowMeta}>{item.dateLabel}</Text>
                    </View>
                  ))}

                  <Pressable accessibilityRole="button" disabled={saving} onPress={deleteTask} style={styles.deleteButton}>
                    <Ionicons color={colors.rose} name="trash-outline" size={18} />
                    <Text style={styles.deleteText}>{locale.t("taskDetail.deleteTask")}</Text>
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
          <Text style={detail.status === "completed" ? styles.reopenButtonText : styles.completeButtonText}>{locale.t(detail.status === "completed" ? "taskDetail.restore" : "taskDetail.markComplete")}</Text>
        </Pressable> : null}
        <Pressable accessibilityLabel={locale.t("taskDetail.edit")} accessibilityRole="button" disabled={saving} onPress={() => titleInputRef.current?.focus()} style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
          <Text style={styles.editButtonText}>{locale.t("taskDetail.edit")}</Text>
        </Pressable>
      </View>
    </View> : null}
    </View>
  );
}

function taskDateLabel(value: string | undefined, timeZone: string, language: OrbitLanguage, t: OrbitTranslator): string {
  if (!value) return t("taskDetail.dateUnscheduled");
  const now = new Date();
  const date = new Date(value.length === 10 ? `${value}T12:00:00+09:00` : value);
  if (!Number.isFinite(date.getTime())) return t("taskDetail.dateUnavailable");
  if ((value.length === 10 ? value : localParts(date, timeZone).date) === localParts(now, timeZone).date) {
    return value.length === 10 ? t("tasks.groupToday") : t("taskDetail.todayAt", { time: new Intl.DateTimeFormat(localeTag(language), { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date) });
  }
  return dateLabel(value, timeZone, language, t);
}

function createdDateLabel(value: string, timeZone: string, language: OrbitLanguage): string {
  return new Intl.DateTimeFormat(localeTag(language), { timeZone, month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
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
