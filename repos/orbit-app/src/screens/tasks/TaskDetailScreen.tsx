import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { localParts } from "../../time/date-time";
import * as Crypto from "expo-crypto";
import { type Href, useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { serverReachability, type ServerReachabilityState } from "../../api/server-reachability";
import { Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ORBIT_API_ENDPOINTS, reminderPath, remindersPath, taskPath } from "../../api/endpoints";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import type { OrbitLanguage } from "../../api/contract/language";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { textStyles, radius, spacing, typography } from "../../design/tokens";
import { Icon } from "../../components/ui/Icon";
import { PersonalScheduleDateTimePicker } from "../schedule/PersonalScheduleDateTimePicker";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useSyncedCollection } from "../../hooks/useSyncedCollection";
import { useOfflineTaskOutbox } from "../../data/sync/useOfflineTaskOutbox";
import { buildOfflineTaskMutation, isOfflineTaskCategory } from "../../data/sync/task-outbox-mutation";
import { overlayQueuedTasks } from "../../view-models/tasks-mirror";
import type { TaskItemContract } from "../../api/contract/tasks";
import { mirrorFreshness } from "../../data/sync/mirror-freshness";
import { OfflineNotice } from "../../components/OfflineNotice";
import { NeedsNetworkState } from "../../components/NeedsNetworkState";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import type { OrbitTranslator } from "../../i18n/messages";
import { notifyReminderPlansChanged, requestNotificationPermission } from "../../notifications/native-notifications";
import { reminderPlansToView, reminderQuickOptions } from "../../view-models/reminders";
import { ownedTaskDetailToView, type TaskDetailView } from "../../view-models/today-tasks";
import { buildTaskDatePatch, taskDateDraftFromView, taskDatePatchMovesLater, taskDateReceiptMatches, type TaskDateDraft } from "../../view-models/task-dates";

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
  const titleInputRef = useRef<TextInput>(null);
  const [titleHeight, setTitleHeight] = useState(0);
  const [notesHeight, setNotesHeight] = useState(0);
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const taskId = first(params.id);
  const router = useRouter();
  const navigation = useNavigation();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const scopeKey = JSON.stringify([server.baseUrl, actorId, taskId, ready]);
  const client = useOrbitApiClient({ scopeKey });
  const detailPath = useMemo(() => taskPath(taskId), [taskId]);
  const reminderResourcePath = useMemo(() => remindersPath("task", taskId), [taskId]);
  const detailState = useApiResource<unknown>(detailPath, () => false, { scopeKey });
  const remindersState = useApiResource<unknown>(reminderResourcePath, () => false, { scopeKey });
  const serverDetail = ready && (detailState.kind === "success" || detailState.kind === "empty") ? ownedTaskDetailToView(detailState.data, actorId, locale.language) : null;
  // Sprint 0131: when the server cannot be reached (or answers 5xx) the task comes from the device
  // copy (sync domain tasks); it is read-only with 截至 until the connection is back.
  const taskMirror = useSyncedCollection<Record<string, unknown>>({ kind: "task" });
  const taskOutbox = useOfflineTaskOutbox(taskMirror, Platform.OS !== "web");
  const mirrorState = mirrorFreshness(taskMirror, ready);
  // On the phone the snapshot cache can answer an offline read as if it were the server; the
  // client's reachability record is what says the server was not reached.
  const reachUrl = server.baseUrl.trim().replace(/\/+$/u, "");
  const [reach, setReach] = useState<ServerReachabilityState>(() => serverReachability.state(reachUrl));
  useEffect(() => {
    setReach(serverReachability.state(reachUrl));
    return serverReachability.subscribe((url, state) => { if (url === reachUrl) setReach(state); });
  }, [reachUrl]);
  const serverUnreachable = reach === "unreachable" || detailState.kind === "offline" || (detailState.kind === "failure" && detailState.status >= 500);
  const mirrorRow = serverUnreachable && mirrorState.readable ? taskMirror.records.find((record) => record.id === taskId && record.deletedAt === null) : undefined;
  const mirrorDetail = mirrorRow ? ownedTaskDetailToView({ task: mirrorRow.payload }, actorId, locale.language) : null;
  const isLocalQueuedTask = taskOutbox.queuedMutations.some(item => item.id === taskId && item.operation === "create");
  const offline = mirrorDetail !== null && (serverDetail === null || reach === "unreachable") || isLocalQueuedTask;
  const taskConflict = taskOutbox.queuedMutations.find(item => item.id === taskId && item.kind === "task" && item.state === "conflict");
  const taskFailure = taskOutbox.queuedMutations.filter(item => item.id === taskId && item.kind === "task" && item.state === "failed").at(-1);
  const conflictSnapshot = typeof taskConflict?.serverSnapshot === "object" && taskConflict.serverSnapshot !== null && !Array.isArray(taskConflict.serverSnapshot)
    ? taskConflict.serverSnapshot as Record<string, unknown> : null;
  const conflictServerDetail = conflictSnapshot ? ownedTaskDetailToView({ task: conflictSnapshot }, actorId, locale.language) : null;
  const overlayBase = taskConflict?.operation === "delete" && conflictSnapshot
    ? conflictSnapshot as unknown as TaskItemContract
    : mirrorRow?.payload as unknown as TaskItemContract | undefined;
  const projectedTasks = overlayQueuedTasks(
    overlayBase ? [overlayBase] : serverDetail ? [{ ...serverDetail, accountId: actorId, ownerUserId: actorId, source: "manual", createdAt: serverDetail.createdAt ?? serverDetail.updatedAt } as unknown as TaskItemContract] : [],
    taskOutbox.queuedMutations.filter(item => item.id === taskId), // the base holds only this task
    actorId,
  );
  const projectedTask = projectedTasks?.find(task => task.id === taskId);
  const projectedDetail = projectedTask ? ownedTaskDetailToView({ task: projectedTask }, actorId, locale.language) : null;
  const detail = projectedDetail ?? (offline ? mirrorDetail : serverDetail ?? mirrorDetail);
  const reminders = remindersState.kind === "success" || remindersState.kind === "empty"
    ? reminderPlansToView(remindersState.data, timeZone, locale.language).filter((item) => item.status === "scheduled")
    : [];
  const quickReminderOptions = useMemo(() => reminderQuickOptions(new Date(), timeZone, locale.t), [timeZone, locale.t]);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dateDraft, setDateDraft] = useState(() => taskDateDraftFromView(null));
  const dateDraftRef = useRef(dateDraft);
  dateDraftRef.current = dateDraft;
  const [baseline, setBaseline] = useState<TaskDetailView | null>(null);
  const [latest, setLatest] = useState<TaskDetailView | null>(null);
  const latestRef = useRef(latest);
  latestRef.current = latest;
  const [saving, setSaving] = useState(false);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [reminderMessage, setReminderMessage] = useState<string | null>(null);
  const [confirmConflictDelete, setConfirmConflictDelete] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSecondDeferral, setConfirmSecondDeferral] = useState(false);
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
    setConfirmDelete(false); setConfirmSecondDeferral(false); setSaving(false); setMutationError(null); setReminderMessage(null);
  }

  useEffect(() => {
    mutationScope.active = true;
    setSaving(false);
    setMutationError(null);
    setReminderMessage(null);
    setConfirmDelete(false);
    setConfirmSecondDeferral(false);
    return () => { mutationScope.active = false; mutationScope.controller.abort(); mutationScope.keys.clear(); };
  }, [mutationScope]);

  async function mutate(
    method: "patch" | "post" | "delete",
    path: string,
    body: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
    onSuccess: (data: unknown) => void,
    accepts?: (data: unknown) => boolean,
  ): Promise<boolean> {
    const scope = mutationScope;
    const isCurrent = () => ready && scope.active && scopeRef.current === scope;
    const isTaskPath = path === taskPath(taskId);
    if (!isCurrent() || scope.busy || offline && !isTaskPath) return false;
    scope.busy = true;
    setSaving(true);
    setMutationError(null);
    try {
      const payload = typeof body === "function" ? await body() : body;
      if (!isCurrent()) return false;
      if (offline && isTaskPath) {
        if (!isOfflineTaskCategory(detail?.category)) return false;
        const mutationId = mutationKey();
        const operation = method === "delete" ? "delete" : method === "patch" ? String(payload.action ?? "update") : "";
        const requestBody = { ...payload, idempotencyKey: mutationId };
        const mutation = buildOfflineTaskMutation({
          mutationId,
          entityId: taskId,
          operation,
          baseRevision: mirrorRow?.revision ?? null,
          requestBody,
          createdAt: new Date().toISOString(),
        });
        await taskOutbox.enqueueOfflineMutation(mutation);
        onSuccess({});
        return true;
      }
      const fingerprint = JSON.stringify([method, path, payload]);
      const key = scope.keys.get(fingerprint) ?? mutationKey();
      scope.keys.set(fingerprint, key);
      const result = await client[method]<unknown>(path, { body: { ...payload, idempotencyKey: key }, signal: scope.controller.signal });
      if (!isCurrent()) return false;
      if (result.success) {
        if (accepts && (result.status < 200 || result.status >= 300 || !accepts(result.data))) {
          setMutationError(locale.t("taskDetail.saveDateUnconfirmed"));
          return false;
        }
        scope.keys.delete(fingerprint);
        onSuccess(result.data);
        return true;
      }
      setMutationError(locale.t("taskDetail.operationFailed"));
      return false;
    } catch {
      if (isCurrent()) setMutationError(locale.t("taskDetail.operationFailed"));
      return false;
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

  function refresh() {
    detailState.refresh();
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

  async function saveDates(confirmedSecondDeferral = false) {
    if (!canSave) { setMutationError(locale.t("taskDetail.timezoneUnavailable")); return; }
    if (!ready || scopeRef.current !== mutationScope || !mutationScope.active || dateDraftRef.current !== dateDraft) return;
    if (!detail || !baseline || baseline.id !== taskId || detail.status === "cancelled" || staleDraft || saving) return;
    if (latestRef.current?.id !== baseline.id || latestRef.current.updatedAt !== baseline.updatedAt) return;
    const change = buildTaskDatePatch(baseline, dateDraft, editTimeZone);
    if (change.kind === "invalid") { setMutationError(change.message); return; }
    if (change.kind === "unchanged") { setMutationError(null); return; }
    if (baseline.deferralCount >= 1 && taskDatePatchMovesLater(baseline, change.patch) && !confirmedSecondDeferral) {
      setConfirmSecondDeferral(true);
      return;
    }
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

  async function save(): Promise<"noop" | "saved" | "failed"> {
    if (!detail || !baseline || baseline.id !== taskId || staleDraft || saving || !title.trim()) return "noop";
    const normalizedTitle = title.trim();
    const normalizedNotes = notes.trim();
    if (baseline.notes && !normalizedNotes) {
      setMutationError(locale.t("taskDetail.noteClearUnsupported"));
      return "noop";
    }
    if (normalizedTitle === baseline.title && normalizedNotes === baseline.notes.trim()) return "noop";
    const revisionAtStart = latest?.updatedAt;
    const saved = await mutate("patch", taskPath(taskId), {
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
    return saved ? "saved" : "failed";
  }

  // Leaving (header back, swipe, router.back) unmounts the editor before a blur
  // save can run, and the unmounted scope drops it. Save a typed title/note first.
  // If that save fails the user stays with the draft and the error; leaving again
  // with the same draft is not blocked, so an offline user is never trapped (0126).
  const saveRef = useRef(save);
  saveRef.current = save;
  const draftRef = useRef("");
  draftRef.current = JSON.stringify([title.trim(), notes.trim()]);
  const unsavedRef = useRef(false);
  unsavedRef.current = Boolean(detail && baseline && baseline.id === taskId && !staleDraft && !saving && title.trim() &&
    !(baseline.notes && !notes.trim()) && (title.trim() !== baseline.title || notes.trim() !== baseline.notes.trim()));
  const [allowLeaveDraft, setAllowLeaveDraft] = useState<string | null>(null);
  const preventLeave = unsavedRef.current && allowLeaveDraft !== draftRef.current;
  const pendingLeaveRef = useRef<Parameters<typeof navigation.dispatch>[0] | null>(null);
  // usePreventRemove also stops the native swipe, so JS and native stacks stay in sync.
  usePreventRemove(preventLeave, ({ data }) => {
    const draft = draftRef.current;
    void saveRef.current().then((result) => {
      if (result !== "failed") pendingLeaveRef.current = data.action;
      setAllowLeaveDraft(draft);
    });
  });
  useEffect(() => {
    if (!pendingLeaveRef.current || preventLeave) return;
    const action = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    // Dispatch after usePreventRemove has committed preventRemove=false.
    setTimeout(() => navigation.dispatch(action), 0);
  });

  async function changeStatus() {
    if (!detail) return;
    const action = detail.status === "completed" ? "reopen" : "complete";
    await mutate("patch", taskPath(taskId), { action }, () => {
      notifyReminderPlansChanged();
      refresh();
    });
  }

  async function deleteTask() {
    await mutate("delete", taskPath(taskId), { ...(baseline ? { expectedUpdatedAt: baseline.updatedAt } : {}) }, () => {
      notifyReminderPlansChanged();
      router.replace(taskListReturnHref);
    });
  }

  async function resolveTaskConflict(resolution: "server" | "replace") {
    if (!taskConflict) return;
    if (resolution === "replace" && taskConflict.operation === "delete" && !confirmConflictDelete) {
      setConfirmConflictDelete(true);
      return;
    }
    const session = taskMirror.currentSession();
    if (!session?.resolveTaskConflict) { setMutationError(locale.t("taskDetail.conflictUnavailable")); return; }
    try {
      if (resolution === "server") {
        await session.resolveTaskConflict({ mutationId: taskConflict.mutationId, resolution });
      } else {
        const serverTask = typeof taskConflict.serverSnapshot === "object" && taskConflict.serverSnapshot !== null && !Array.isArray(taskConflict.serverSnapshot)
          ? taskConflict.serverSnapshot as Record<string, unknown> : null;
        if (!serverTask || typeof serverTask.updatedAt !== "string" || typeof serverTask.id !== "string" || serverTask.id !== taskId) {
          setMutationError(locale.t("taskDetail.conflictUnavailable"));
          return;
        }
        const requestBody = JSON.parse(taskConflict.requestJson ?? "null") as Record<string, unknown>;
        const mutationId = mutationKey();
        const replacementBody: Record<string, unknown> = { ...requestBody, idempotencyKey: mutationId };
        if (taskConflict.operation === "update" || taskConflict.operation === "delete") replacementBody.expectedUpdatedAt = serverTask.updatedAt;
        const replacement = buildOfflineTaskMutation({
          mutationId,
          entityId: taskId,
          operation: taskConflict.operation,
          baseRevision: taskMirror.records.find(record => record.id === taskId)?.revision ?? taskConflict.baseRevision,
          requestBody: replacementBody,
          createdAt: new Date().toISOString(),
        });
        await session.resolveTaskConflict({ mutationId: taskConflict.mutationId, resolution, replacement });
        if (taskConflict.operation === "delete") {
          // Like the online delete: the confirmed delete is queued, so leave the deleted task's page.
          notifyReminderPlansChanged();
          router.replace(taskListReturnHref);
          return;
        }
      }
      setConfirmConflictDelete(false);
      setMutationError(null);
      await taskOutbox.refreshQueued();
      detailState.refresh();
    } catch {
      setMutationError(locale.t("taskDetail.conflictUnavailable"));
    }
  }

  // Sprint 0136: 「未能保存 · 重试 / 放弃」 (design step 7). Discarding a task that only exists on this phone leaves its page.
  async function settleTaskFailure(action: "retry" | "discard") {
    if (!taskFailure) return;
    const session = taskMirror.currentSession();
    if (!session?.retryOfflineWrite || !session.discardOfflineWrite) { setMutationError(locale.t("taskDetail.conflictUnavailable")); return; }
    try {
      if (action === "retry") await session.retryOfflineWrite("task", taskFailure.mutationId);
      else {
        await session.discardOfflineWrite("task", taskFailure.mutationId);
        if (taskFailure.operation === "create") { router.replace("/tasks" as Href); return; }
      }
      setMutationError(null);
      await taskOutbox.refreshQueued();
    } catch {
      setMutationError(locale.t("taskDetail.conflictUnavailable"));
    }
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

  // UX T4/T5: Reminders-style inline rows instead of the old settings sheet. Each date change saves at once with the same
  // update write the sheet used: 日期 alone is plannedDate; 日期 + 时间 is dueAt (and the same plannedDate). Confirming a
  // picker again after a failed save retries the same draft (same request key); an unchanged draft writes nothing.
  const locked = !detail || saving || offline && !isOfflineTaskCategory(detail.category);
  const datesLocked = locked || staleDraft || detail?.status === "cancelled";
  const shownDate = dateDraft.dueDate || dateDraft.plannedDate;
  const [picker, setPicker] = useState<"date" | "time" | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [dateSaveRequest, setDateSaveRequest] = useState(0);
  useEffect(() => { if (dateSaveRequest > 0) void saveDates(); }, [dateSaveRequest]);
  function setDates(next: Partial<TaskDateDraft>) {
    if (scopeRef.current !== mutationScope || !mutationScope.active || mutationScope.busy || latestRef.current?.status === "cancelled") return;
    dateDraftRef.current = { ...dateDraftRef.current, ...next };
    setDateDraft(dateDraftRef.current);
    setDateSaveRequest(value => value + 1);
  }
  const todayKey = () => localParts(new Date(), editTimeZone).date;
  const nextHour = () => `${String(Math.min(23, Number(localParts(new Date(), editTimeZone).time.slice(0, 2)) + 1)).padStart(2, "0")}:00`;
  const toggleDate = (on: boolean) => setDates(on ? { plannedDate: todayKey() } : { plannedDate: "", dueDate: "", dueTime: "" });
  const toggleTime = (on: boolean) => { const day = shownDate || todayKey(); setDates(on ? { plannedDate: day, dueDate: day, dueTime: nextHour() } : { plannedDate: shownDate, dueDate: "", dueTime: "" }); };
  const pickDate = (day: string) => setDates({ plannedDate: day, ...(dateDraft.dueTime ? { dueDate: day } : {}) });
  const pickTime = (time: string) => setDates({ dueDate: shownDate || todayKey(), dueTime: time, ...(shownDate ? {} : { plannedDate: todayKey() }) });
  const revertDates = () => { if (!baseline) return; dateDraftRef.current = taskDateDraftFromView(baseline, editTimeZone); setDateDraft(dateDraftRef.current); };

  return (
    <View style={styles.screen}>
    <AppScreen
      backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("tasks.title") })}
      backLabel={locale.t("tasks.title")}
      refreshControl={<RefreshControl onRefresh={refresh} refreshing={detailState.refreshing || remindersState.refreshing} tintColor={colors.accentText} />}
      title={locale.t("taskDetail.title")}
    >
      {detailState.kind === "loading" ? <LoadingState /> : null}
      {offline ? <OfflineNotice lastSyncedAt={taskMirror.lastSyncedAt} reason={reach === "unreachable" || detailState.kind === "offline" ? "unreachable" : "unavailable"} queues="tasks" /> : null}
      {detail?.localMutationState && !taskConflict ? <Text style={styles.localMutationLabel}>{locale.t(detail.localMutationState === "conflict" ? "tasks.outboxConflict" : detail.localMutationState === "failed" ? "tasks.outboxFailed" : "tasks.outboxQueued")}</Text> : null}
      {taskFailure && !taskConflict ? <View style={styles.conflictActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("sync.retryChangeNamed", { title: detail?.title ?? "" })} onPress={() => void settleTaskFailure("retry")} style={styles.conflictAction}><Text style={styles.conflictActionText}>{locale.t("common.retry")}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={locale.t("sync.discardChangeNamed", { title: detail?.title ?? "" })} onPress={() => void settleTaskFailure("discard")} style={styles.conflictAction}><Text style={styles.conflictActionText}>{locale.t("sync.discardChange")}</Text></Pressable>
      </View> : null}
      {taskConflict ? <View style={styles.conflictPanel}>
        <Text style={styles.conflictText}>{locale.t(taskConflict.operation === "delete" ? "taskDetail.deleteConflict" : "taskDetail.taskConflict")}</Text>
        {conflictServerDetail ? <Text style={styles.conflictServerText}>{locale.t("taskDetail.serverVersionNamed", { title: conflictServerDetail.title })}</Text> : null}
        <View style={styles.conflictActions}>
          <Pressable accessibilityRole="button" onPress={() => void resolveTaskConflict("server")} style={styles.conflictAction}><Text style={styles.conflictActionText}>{locale.t("taskDetail.useServerVersion")}</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => void resolveTaskConflict("replace")} style={styles.conflictAction}><Text style={styles.conflictActionText}>{locale.t(taskConflict.operation === "delete" && confirmConflictDelete ? "taskDetail.confirmDeleteConflict" : "taskDetail.keepLocalVersion")}</Text></Pressable>
        </View>
      </View> : null}
      {!offline && detailState.kind === "offline" ? <NeedsNetworkState message={locale.t("sync.notOnDevice")} onRetry={detailState.refresh} /> : null}
      {!offline && detailState.kind === "failure" ? <ErrorState message={locale.t("taskDetail.readFailed")} title={locale.t("taskDetail.unavailable")} /> : null}
      {detail ? (
        <>
          {/* Reminders detail: the round check, the title and the note in one card. */}
          <View style={[styles.card, styles.hero]}>
            <Pressable
              accessibilityLabel={locale.t(detail.status === "completed" ? "tasks.restoreNamed" : "tasks.completeNamed", { title: detail.title })}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: detail.status === "completed", disabled: locked || detail.status === "cancelled" }}
              aria-checked={detail.status === "completed"}
              disabled={locked || detail.status === "cancelled"}
              onPress={changeStatus}
              style={styles.heroCheckButton}
            >
              <View style={[styles.checkbox, detail.status === "completed" && styles.checkboxCompleted]}>
                {detail.status === "completed" ? <Icon color={colors.onAccent} name="check" size={15} strokeWidth={2.4} /> : null}
              </View>
            </Pressable>
            <View style={styles.heroBody}>
              <TextInput ref={titleInputRef} accessibilityLabel={locale.t("taskDetail.titleLabel")} editable={!locked} multiline scrollEnabled={false} onBlur={save} onChangeText={setTitle}
                onContentSizeChange={event => setTitleHeight(event.nativeEvent.contentSize.height)}
                style={[styles.titleInput, detail.status === "completed" && styles.titleDone, { minHeight: Math.max(30 * fontScale, titleHeight) }]} value={title} />
              <TextInput accessibilityLabel={locale.t("taskDetail.notes")} editable={!locked} multiline scrollEnabled={false} onBlur={save} onChangeText={setNotes}
                onContentSizeChange={event => setNotesHeight(event.nativeEvent.contentSize.height)}
                placeholder={locale.t("taskDetail.notes")} placeholderTextColor={colors.ink3Text}
                style={[styles.notesInput, { height: Math.max(24 * fontScale, notesHeight) }]} value={notes} />
            </View>
          </View>

          {staleDraft ? <View>
            <Text accessibilityRole="alert" style={styles.errorText}>{locale.t("taskDetail.staleWarning")}</Text>
            <Pressable accessibilityRole="button" disabled={locked} onPress={discardDraft} style={styles.linkRow}>
              <Text style={styles.linkText}>{locale.t("taskDetail.discardDraft")}</Text>
            </Pressable>
          </View> : null}
          {timeZone !== editTimeZone ? <Text accessibilityRole="alert" style={styles.hint}>{locale.t("taskDetail.draftTimeZone", { timeZone: editTimeZone })}</Text> : null}

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={[styles.rowIcon, { backgroundColor: colors.coralText }]}><Icon color={colors.onAccent} name="calendar" size={16} /></View>
              <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>{locale.t("taskDetail.date")}</Text>
                {shownDate ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("taskDetail.changeDate")} disabled={datesLocked} onPress={() => setPicker("date")} hitSlop={8}>
                  <Text style={styles.rowValueLink}>{taskDateLabel(shownDate, editTimeZone, locale.language, locale.t)}</Text>
                </Pressable> : null}
              </View>
              <Switch accessibilityLabel={locale.t("taskDetail.date")} value={Boolean(shownDate)} disabled={datesLocked} onValueChange={toggleDate} />
            </View>
            <View style={[styles.row, styles.rowLine]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.accentText }]}><Icon color={colors.onAccent} name="clock" size={16} /></View>
              <View style={styles.rowBody}>
                <Text style={styles.rowLabel}>{locale.t("taskDetail.time")}</Text>
                {dateDraft.dueTime ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("taskDetail.changeTime")} disabled={datesLocked} onPress={() => setPicker("time")} hitSlop={8}>
                  <Text style={styles.rowValueLink}>{dateDraft.dueTime}</Text>
                </Pressable> : null}
              </View>
              <Switch accessibilityLabel={locale.t("taskDetail.time")} value={Boolean(dateDraft.dueTime)} disabled={datesLocked} onValueChange={toggleTime} />
            </View>
          </View>
          {detail.status === "cancelled" ? <Text style={styles.hint}>{locale.t("taskDetail.cancelledNoDate")}</Text> : null}

          <View style={styles.card}>
            <Pressable accessibilityLabel={locale.t("taskDetail.reminder")} accessibilityRole="button" disabled={locked} onPress={() => setReminderOpen(true)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.macApricotText }]}><Icon color={colors.onAccent} name="bell" size={16} /></View>
              <Text style={[styles.rowLabel, styles.rowGrow]}>{locale.t("taskDetail.reminder")}</Text>
              <Text numberOfLines={1} style={styles.rowValue}>{reminders[0]?.label ?? locale.t("taskDetail.reminderUnset")}</Text>
              <Icon color={colors.ink3Text} name="right" size={16} />
            </Pressable>
          </View>

          <View style={styles.card}>
            {detail.relatedContactId ? <Pressable accessibilityLabel={locale.t("taskDetail.viewContact")} accessibilityRole="button" onPress={() => router.push(`/contacts/${encodeURIComponent(detail.relatedContactId!)}` as Href)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.ink3Text }]}><Icon color={colors.onAccent} name="user" size={16} /></View>
              <Text style={[styles.rowLabel, styles.rowGrow]}>{locale.t("taskDetail.relatedContact")}</Text>
              <Text style={styles.rowValue}>{locale.t("taskDetail.open")}</Text>
              <Icon color={colors.ink3Text} name="right" size={16} />
            </Pressable> : null}
            {detail.relatedEventId ? <Pressable accessibilityLabel={locale.t("taskDetail.viewEvent")} accessibilityRole="button" onPress={() => router.push(`/events/${encodeURIComponent(detail.relatedEventId!)}` as Href)} style={({ pressed }) => [styles.row, detail.relatedContactId && styles.rowLine, pressed && styles.pressed]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.ink3Text }]}><Icon color={colors.onAccent} name="ticket" size={16} /></View>
              <Text style={[styles.rowLabel, styles.rowGrow]}>{locale.t("taskDetail.relatedEvent")}</Text>
              <Text style={styles.rowValue}>{locale.t("taskDetail.open")}</Text>
              <Icon color={colors.ink3Text} name="right" size={16} />
            </Pressable> : null}
            {detail.sourceNoteId && detail.sourceNoteVersion ? <Pressable accessibilityLabel={locale.t("taskDetail.viewSourceNote")} accessibilityRole="button" onPress={() => router.push(`/notes/${encodeURIComponent(detail.sourceNoteId!)}` as Href)} style={({ pressed }) => [styles.row, (detail.relatedContactId || detail.relatedEventId) && styles.rowLine, pressed && styles.pressed]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.ink3Text }]}><Icon color={colors.onAccent} name="note" size={16} /></View>
              <Text style={[styles.rowLabel, styles.rowGrow]}>{locale.t("taskDetail.sourceNote")}</Text>
              <Text style={styles.rowValue}>{locale.t("taskDetail.open")}</Text>
              <Icon color={colors.ink3Text} name="right" size={16} />
            </Pressable> : null}
            <View style={[styles.row, Boolean(detail.relatedContactId || detail.relatedEventId || detail.sourceNoteId && detail.sourceNoteVersion) && styles.rowLine]}>
              <View style={[styles.rowIcon, { backgroundColor: colors.ink3Text }]}><Icon color={colors.onAccent} name="pin" size={16} /></View>
              <TextInput accessibilityLabel={locale.t("taskDetail.location")} autoCorrect={false} editable={!datesLocked} onBlur={() => { void saveDates(); }}
                onChangeText={value => changeDate("location", value)} placeholder={locale.t("taskDetail.locationPlaceholder")} placeholderTextColor={colors.ink3Text}
                style={styles.locationInput} value={dateDraft.location ?? ""} />
            </View>
          </View>

          {mutationError ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
          {reminderMessage ? <Text style={styles.successText}>{reminderMessage}</Text> : null}

          <Pressable accessibilityRole="button" disabled={locked} onPress={() => setConfirmDelete(true)} style={({ pressed }) => [styles.card, styles.deleteButton, pressed && styles.pressed]}>
            <Text style={styles.deleteText}>{locale.t("taskDetail.deleteTask")}</Text>
          </Pressable>

          {picker ? <PersonalScheduleDateTimePicker kind={picker} value={picker === "date" ? shownDate : dateDraft.dueTime} zone={editTimeZone} disabled={datesLocked}
            onCancel={() => setPicker(null)} onConfirm={value => { setPicker(null); (picker === "date" ? pickDate : pickTime)(value); }} /> : null}

          <Modal animationType="slide" onRequestClose={() => setReminderOpen(false)} transparent visible={reminderOpen}>
            <View style={styles.modalRoot}>
              <Pressable accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="task-settings-scrim" style={styles.modalScrim} onPress={() => setReminderOpen(false)} />
              <View role="dialog" accessibilityLabel={locale.t("taskDetail.reminder")} style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <Text accessibilityRole="header" style={styles.sheetTitle}>{locale.t("taskDetail.reminder")}</Text>
                  <Pressable accessibilityLabel={locale.t("personal60.done")} accessibilityRole="button" onPress={() => setReminderOpen(false)} style={styles.sheetDone}>
                    <Text style={styles.linkText}>{locale.t("personal60.done")}</Text>
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.sheetBody}>
                  {reminders.map((item) => (
                    <View key={item.id} style={styles.sheetRow}>
                      <Text style={styles.sheetRowText}>{item.label}</Text>
                      <Pressable accessibilityRole="button" accessibilityLabel={`${locale.t("taskDetail.cancelReminder")} ${item.label}`} disabled={locked} onPress={() => void cancelReminder(item.id)} hitSlop={8}>
                        <Text style={styles.sheetRowAction}>{locale.t("taskDetail.cancelReminder")}</Text>
                      </Pressable>
                    </View>
                  ))}
                  {detail.status === "open" ? quickReminderOptions.map((option) => (
                    <Pressable key={option.fireAt} accessibilityRole="button" disabled={locked} onPress={() => void addReminder(option.fireAt)} style={({ pressed }) => [styles.sheetRow, pressed && styles.pressed]}>
                      <Text style={styles.sheetRowText}>{option.label}</Text>
                      <Icon color={colors.accentText} name="plus" size={16} />
                    </Pressable>
                  )) : null}
                  <Text style={styles.hint}>{locale.t("taskDetail.reminderUnaffected")}</Text>
                </ScrollView>
              </View>
            </View>
          </Modal>
          <ConfirmDialog visible={confirmDelete && !saving} destructive title={locale.t("taskDetail.deleteConfirmTitle")}
            message={locale.t("taskDetail.deleteConfirmBody")} confirmLabel={locale.t("taskDetail.deleteConfirmAction")}
            onCancel={() => setConfirmDelete(false)}
            onConfirm={() => { setConfirmDelete(false); void deleteTask(); }} />
          <ConfirmDialog visible={confirmSecondDeferral && !saving} destructive title={locale.t("taskDetail.deferAgainTitle")}
            message={locale.t("taskDetail.deferAgainBody")} confirmLabel={locale.t("taskDetail.deferAgainAction")}
            onCancel={() => { setConfirmSecondDeferral(false); revertDates(); }}
            onConfirm={() => { setConfirmSecondDeferral(false); void saveDates(true); }} />
        </>
      ) : null}
      <View style={{ height: 24 + insets.bottom }} />
    </AppScreen>
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

const taskListReturnHref = "/task?seg=todo&view=all" as Href;

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 14, paddingLeft: 14, marginBottom: 14, overflow: "hidden" },
  checkbox: { alignItems: "center", justifyContent: "center", width: 24, height: 24, borderWidth: 1.6, borderColor: colors.ink4, borderRadius: 12 },
  checkboxCompleted: { backgroundColor: colors.accentText, borderColor: colors.accentText },
  conflictPanel: { backgroundColor: colors.surface2, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, gap: spacing.sm, marginVertical: spacing.md, padding: spacing.md },
  conflictText: { color: colors.ink, fontSize: typography.bodySm, lineHeight: 24 },
  conflictServerText: { color: colors.ink2, fontSize: typography.label, lineHeight: 21 },
  conflictActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  conflictAction: { ...createControlStyles(colors).secondaryButton, flexGrow: 1, minHeight: 42, paddingHorizontal: spacing.sm },
  conflictActionText: { ...createControlStyles(colors).secondaryButtonText, fontSize: typography.label, textAlign: "center" },
  deleteButton: { alignItems: "center", justifyContent: "center", minHeight: 50, paddingLeft: 0 },
  deleteText: { color: colors.coralText, fontSize: 17 },
  errorText: { color: colors.coralText, fontSize: typography.bodySm, marginBottom: 12 },
  hero: { alignItems: "flex-start", flexDirection: "row", paddingVertical: 10, paddingRight: 14, paddingLeft: 4 },
  heroBody: { flex: 1, minWidth: 0, gap: 4 },
  heroCheckButton: { width: 44, minHeight: 44, alignItems: "center", justifyContent: "flex-start", paddingTop: 5 },
  hint: { color: colors.ink3Text, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  linkRow: { minHeight: 44, justifyContent: "center", marginBottom: 8 },
  linkText: { color: colors.accentText, fontSize: 17, fontWeight: "600" },
  localMutationLabel: { color: colors.ink2, fontSize: typography.label, marginVertical: spacing.xs },
  locationInput: { flex: 1, minHeight: 44, color: colors.ink, fontSize: 17, padding: 0 },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalScrim: { backgroundColor: colors.scrim, ...StyleSheet.absoluteFill },
  notesInput: { color: colors.ink2, fontSize: 16, lineHeight: 22, padding: 0, textAlignVertical: "top" },
  pressed: { opacity: 0.68 },
  row: { alignItems: "center", flexDirection: "row", gap: 12, minHeight: 52, paddingVertical: 6, paddingRight: 14 },
  rowBody: { flex: 1, minWidth: 0 },
  rowGrow: { flex: 1 },
  rowIcon: { alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 8 },
  rowLabel: { color: colors.ink, fontSize: 17 },
  rowLine: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  rowValue: { color: colors.ink3Text, fontSize: 16, flexShrink: 1 },
  rowValueLink: { color: colors.accentText, fontSize: 15, marginTop: 1 },
  screen: { flex: 1, backgroundColor: colors.bg },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "78%", overflow: "hidden" },
  sheetBody: { paddingHorizontal: spacing.lg, paddingBottom: 32 },
  sheetDone: { minHeight: 44, minWidth: 44, alignItems: "flex-end", justifyContent: "center" },
  sheetHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", minHeight: 56, paddingHorizontal: spacing.lg },
  sheetRow: { alignItems: "center", borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: "row", gap: spacing.sm, minHeight: 50 },
  sheetRowAction: { color: colors.coralText, fontSize: typography.bodySm, fontWeight: "600" },
  sheetRowText: { color: colors.ink, flex: 1, fontSize: 17 },
  sheetTitle: { ...textStyles.section, color: colors.ink },
  successText: { color: colors.accentText, fontSize: typography.bodySm, marginBottom: 12 },
  titleDone: { color: colors.ink3Text },
  titleInput: { color: colors.ink, fontSize: 22, lineHeight: 28, fontWeight: "700", padding: 0, textAlignVertical: "top" },
}));
