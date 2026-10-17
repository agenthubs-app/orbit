import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import { type Href, useGlobalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Platform, RefreshControl, StyleSheet, View } from "react-native";

import { taskPath } from "../../api/endpoints";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import type { TodoDecisionItem, TodoFollowupItem, TodoNextMoveItem, TodoPageContract, TodoSectionKey } from "../../api/contract/todo-page";
import type { TaskItemContract } from "../../api/contract/tasks";
import { TODO_SECTION_SOURCES, todoPageSchema } from "../../api/schema/todo-page";
import { AppScreen } from "../../components/AppScreen";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { Button } from "../../components/ui/Button";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { useToast } from "../../components/ui/Toast";
import { buildOfflineTaskMutation, isOfflineRelationshipFollowupMutation, isOfflineTaskCategory } from "../../data/sync/task-outbox-mutation";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { localParts, shiftCalendarDate } from "../../time/date-time";
import { taskDateReceiptMatches } from "../../view-models/task-dates";
import { readTaskListItems } from "../../view-models/task-list-scope";
import { PersonalScheduleDateTimePicker } from "../schedule/PersonalScheduleDateTimePicker";
import { TasksScreen } from "../tasks/TasksScreen";
import { TodoSections } from "./TodoSections";
import { TodoManualDraft, todoManualDraftForScope, todoManualMailto } from "./TodoManualDraft";
import { laterTaskDatePatch, todoDecisionHref, todoFollowupHref, todoInitialView, todoNativeDecisionReceipt, todoNativeDecisionRequest, todoNativeSnoozeReceipt, todoNativeSnoozeRequest, todoSuggestionDecisionRequest, todoSuggestionDecisionReceipt, todoSuggestionSnoozeRequest, todoSuggestionSnoozeReceipt, todoTaskCompletionReceipt } from "./todo-actions";
import { appendTodoSourcePage, todoAggregateHidden } from "./todo-page-model";
import { useTodoPage } from "./useTodoPage";

/** Until SC09 replaces the general task list, retain it as an explicit second view. */
export function TodoTaskSlot() {
  const params = useGlobalSearchParams<{ view?: string | string[] }>();
  const router = useRouter();
  const { t } = useOrbitLocale();
  const [view, setView] = useState(() => todoInitialView(params.view));
  useEffect(() => { if (todoInitialView(params.view) === "tasks") setView("tasks"); }, [params.view]);
  if (view === "tasks") return <View style={slotStyles.list}>
    <View style={slotStyles.back}><Button label={t("todo.backToTodo")} onPress={() => { setView("home"); router.setParams({ view: "open" }); }} variant="ghost" /></View>
    <TasksScreen />
  </View>;
  return <TodoScreen onShowTasks={() => setView("tasks")} />;
}

/** The first To-do page is a read-only aggregate; actions still use their owning source. */
export function TodoScreen({ onShowTasks }: { onShowTasks?: () => void }) {
  const { timeZone } = useOrbitTimeZone();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer); }, []);
  const date = localParts(now, timeZone).date;
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const locale = useOrbitLocale();
  const router = useRouter();
  const toast = useToast();
  const scopeKey = JSON.stringify([auth.actorId, auth.cookieHeader, auth.notificationSessionRevision, server.baseUrl, timeZone, date]);
  const client = useOrbitApiClient({ scopeKey });
  const todo = useTodoPage(timeZone, date);
  const pageKey = JSON.stringify([scopeKey, todo.page]);
  const [pagination, setPagination] = useState<{ key: string; page: TodoPageContract } | null>(null);
  const [pagingSection, setPagingSection] = useState<TodoSectionKey | null>(null);
  const [pagingFailedSection, setPagingFailedSection] = useState<TodoSectionKey | null>(null);
  const page = pagination?.key === pageKey ? pagination.page : todo.page;
  const visiblePage = useRef({ key: pageKey, page });
  visiblePage.current = { key: pageKey, page };
  const pagingEpoch = useRef(0);
  const pagingRequest = useRef(false);
  useEffect(() => {
    pagingEpoch.current++;
    pagingRequest.current = false;
    setPagination(null);
    setPagingSection(null);
    setPagingFailedSection(null);
  }, [pageKey]);
  const [busy, setBusy] = useState(false);
  const [deferItem, setDeferItem] = useState<TodoFollowupItem | null>(null);
  const [deferConfirmation, setDeferConfirmation] = useState<{ item: TodoFollowupItem; date: string } | null>(null);
  const [manualDraft, setManualDraft] = useState<{ scopeKey: string; item: TodoNextMoveItem; body: string } | null>(null);
  const visibleManualDraft = todoManualDraftForScope(manualDraft, scopeKey);
  const scope = useMemo(() => ({ active: true, controller: new AbortController(), keys: new Map<string, string>() }), [scopeKey]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  useEffect(() => {
    setBusy(false);
    setDeferItem(null);
    setDeferConfirmation(null);
    setManualDraft(null);
    return () => { scope.active = false; scope.controller.abort(); scope.keys.clear(); };
  }, [scope]);
  const isCurrent = () => scope.active && currentScope.current === scope;
  const offline = Boolean(todo.copy?.offline || todo.state.kind === "offline");
  // A last-seen copy shown while the network is still loading is not current enough to write against.
  const staleDay = todo.staleDay || Boolean(todo.copy && !todo.copy.offline);
  const mirroredTaskIds = useMemo(() => new Set(todo.mirror.records.filter(record => {
    if (Platform.OS === "web" || record.deletedAt !== null || !record.payload) return false;
    const task = record.payload as unknown as TaskItemContract;
    return task.accountId === auth.actorId && task.ownerUserId === auth.actorId && task.status === "open" &&
      (isOfflineTaskCategory(task.category) || isOfflineRelationshipFollowupMutation(task as unknown as Record<string, unknown>, "complete", {}));
  }).map(record => record.id)), [auth.actorId, todo.mirror.records]);
  const deferableTaskIds = useMemo(() => new Set(todo.mirror.records.filter(record => {
    const task = record.payload as unknown as TaskItemContract | null;
    return record.deletedAt === null && task && (Boolean(task.plannedDate) || Boolean(task.dueAt));
  }).map(record => record.id)), [todo.mirror.records]);
  const refresh = () => {
    pagingEpoch.current++;
    pagingRequest.current = false;
    setPagination(null);
    setPagingSection(null);
    setPagingFailedSection(null);
    todo.refresh(); void todo.mirror.refresh();
  };

  async function loadMore(section: TodoSectionKey) {
    const current = visiblePage.current;
    if (pagingRequest.current || offline || staleDay || !current.page || !auth.actorId) return;
    const source = TODO_SECTION_SOURCES[section].find(candidate => current.page?.[section].next[candidate]);
    if (!source) return;
    const cursor = current.page[section].next[source];
    if (!cursor) return;
    const epoch = pagingEpoch.current;
    pagingRequest.current = true;
    setPagingSection(section);
    setPagingFailedSection(null);
    const query = new URLSearchParams({ date, timeZone, section, source, cursor, limit: "50" });
    try {
      const result = await client.get<unknown>(`/api/todo/page?${query.toString()}`, { signal: scope.controller.signal });
      if (!isCurrent() || epoch !== pagingEpoch.current || visiblePage.current.key !== current.key) return;
      const parsed = result.success && result.status >= 200 && result.status < 300 ? todoPageSchema.safeParse(result.data) : null;
      const latest = visiblePage.current.page;
      const next = parsed?.success && latest?.[section].next[source] === cursor
        ? appendTodoSourcePage(latest, parsed.data, section, source) : null;
      if (!next) { setPagingFailedSection(section); if (result.status === 401 || result.status === 403) refresh(); return; }
      visiblePage.current = { key: current.key, page: next };
      setPagination({ key: current.key, page: next });
    } catch {
      if (isCurrent() && epoch === pagingEpoch.current) setPagingFailedSection(section);
    } finally {
      if (isCurrent() && epoch === pagingEpoch.current) { pagingRequest.current = false; setPagingSection(null); }
    }
  }

  function open(item: TodoDecisionItem | TodoNextMoveItem) {
    if (!("actions" in item)) {
      setManualDraft({ scopeKey, item, body: "" });
      return;
    }
    const href = "actions" in item ? todoDecisionHref(item) : null;
    if (href) router.push(href as Href);
    else toast.info(locale.t("todo.unavailable"));
  }

  async function decide(item: TodoDecisionItem, action: "accept" | "dismiss" | "snooze") {
    if (busy || offline || staleDay || !auth.actorId) return;
    const intent = `suggestion:${item.sourceId}:${action}`;
    const idempotencyKey = scope.keys.get(intent) ?? `ios:todo-${action}:${Crypto.randomUUID()}`;
    const request = action === "snooze"
      ? item.source === "task_suggestion" ? todoSuggestionSnoozeRequest(item, idempotencyKey, date, timeZone, new Date())
        : todoNativeSnoozeRequest(item)
      : item.source === "task_suggestion" ? todoSuggestionDecisionRequest(item, action, idempotencyKey)
      : todoNativeDecisionRequest(item, action, idempotencyKey);
    if (!request) { toast.error(locale.t("todo.unavailable")); return; }
    scope.keys.set(intent, idempotencyKey);
    setBusy(true);
    try {
      const result = await client.post<unknown>(request.path, { body: request.body, signal: scope.controller.signal });
      if (!isCurrent()) return;
      const acknowledged = result.success && (action === "snooze"
        ? item.source === "task_suggestion"
          ? "nextVisibleAt" in request.body && typeof request.body.nextVisibleAt === "string" &&
            todoSuggestionSnoozeReceipt(result.data, item.sourceId, request.body.nextVisibleAt)
          : todoNativeSnoozeReceipt(result.data, item)
        : item.source === "task_suggestion" ? todoSuggestionDecisionReceipt(result.data, item.sourceId, action)
        : todoNativeDecisionReceipt(result.data, item, action));
      if (!result.success || result.status < 200 || result.status >= 300 || !acknowledged) {
        toast.error(locale.t("todo.unavailable"));
        if (result.status === 401 || result.status === 403) refresh();
        return;
      }
      scope.keys.delete(intent);
      toast.success(locale.t(action === "accept" ? "todo.accepted" : action === "dismiss" ? "todo.dismissed"
        : item.source === "task_suggestion" ? "todo.snoozed" : "todo.laterSaved"));
      refresh();
    } catch {
      if (isCurrent()) toast.error(locale.t("todo.unavailable"));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  async function complete(item: TodoFollowupItem) {
    if (busy || staleDay || item.sample || !auth.actorId) return;
    if (item.kind === "lifecycle") { toast.error(locale.t("todo.unavailable")); return; }
    const row = todo.mirror.records.find(record => record.id === item.taskId && record.deletedAt === null);
    if (offline && (Platform.OS === "web" || !row || !mirroredTaskIds.has(item.taskId))) { toast.error(locale.t("todo.unavailable")); return; }
    setBusy(true);
    try {
      if (offline && row) {
        const idempotencyKey = `ios:todo-complete:${Crypto.randomUUID()}`;
        await todo.outbox.enqueueOfflineMutation(buildOfflineTaskMutation({
          mutationId: idempotencyKey, entityId: item.taskId, operation: "complete", baseRevision: row.revision,
          requestBody: { action: "complete", idempotencyKey }, createdAt: new Date().toISOString(),
        }));
        if (isCurrent()) toast.info(locale.t("tasks.outboxQueued"));
        return;
      }
      const intent = `complete:${item.taskId}`;
      const idempotencyKey = scope.keys.get(intent) ?? `ios:todo-complete:${Crypto.randomUUID()}`;
      scope.keys.set(intent, idempotencyKey);
      const result = await client.patch<unknown>(taskPath(item.taskId), { body: { action: "complete", idempotencyKey }, signal: scope.controller.signal });
      if (!isCurrent()) return;
      if (!result.success || result.status < 200 || result.status >= 300 || !todoTaskCompletionReceipt(result.data, auth.actorId, item.taskId)) {
        toast.error(locale.t("todo.unavailable"));
        return;
      }
      scope.keys.delete(intent);
      toast.success(locale.t("todo.complete"));
      refresh();
    } catch {
      if (isCurrent()) toast.error(locale.t("todo.unavailable"));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  async function defer(item: TodoFollowupItem, selectedDate: string) {
    if (busy || staleDay || item.sample || !auth.actorId || item.kind !== "task") return;
    const row = todo.mirror.records.find(record => record.id === item.taskId && record.deletedAt === null);
    if (offline && (Platform.OS === "web" || !row || !mirroredTaskIds.has(item.taskId))) { toast.error(locale.t("todo.unavailable")); return; }
    setBusy(true);
    try {
      let baseline: TaskItemContract | undefined;
      if (offline && row?.payload) baseline = row.payload as unknown as TaskItemContract;
      else {
        const result = await client.get<unknown>(taskPath(item.taskId), { signal: scope.controller.signal });
        if (!result.success || !isCurrent()) { if (isCurrent()) toast.error(locale.t("todo.unavailable")); return; }
        const raw = typeof result.data === "object" && result.data !== null && "task" in result.data ? result.data.task : null;
        baseline = readTaskListItems({ tasks: [raw] }, auth.actorId)?.[0];
      }
      if (!baseline || baseline.id !== item.taskId || baseline.status !== "open") { toast.error(locale.t("todo.unavailable")); return; }
      const patch = laterTaskDatePatch(baseline, selectedDate, timeZone);
      if (!patch) { toast.error(locale.t("todo.dateUnavailable")); return; }
      const intent = `defer:${item.taskId}:${baseline.updatedAt}:${selectedDate}`;
      const idempotencyKey = scope.keys.get(intent) ?? `ios:todo-defer:${Crypto.randomUUID()}`;
      scope.keys.set(intent, idempotencyKey);
      const body = { action: "update", expectedUpdatedAt: baseline.updatedAt, patch, idempotencyKey };
      if (offline && row) {
        await todo.outbox.enqueueOfflineMutation(buildOfflineTaskMutation({
          mutationId: idempotencyKey, entityId: item.taskId, operation: "update", baseRevision: row.revision,
          requestBody: body, createdAt: new Date().toISOString(),
        }));
        if (isCurrent()) { setDeferItem(null); toast.info(locale.t("tasks.outboxQueued")); }
        return;
      }
      const result = await client.patch<unknown>(taskPath(item.taskId), { body, signal: scope.controller.signal });
      if (!isCurrent()) return;
      if (!result.success || result.status < 200 || result.status >= 300 || !taskDateReceiptMatches(result.data, item.taskId, auth.actorId, patch)) {
        toast.error(locale.t("todo.unavailable"));
        return;
      }
      scope.keys.delete(intent);
      setDeferItem(null);
      toast.success(locale.t("todo.deferred"));
      refresh();
    } catch {
      if (isCurrent()) toast.error(locale.t("todo.unavailable"));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  }

  function openDefer(item: TodoFollowupItem) {
    if (item.kind === "lifecycle") { toast.error(locale.t("todo.unavailable")); return; }
    setDeferItem(item);
  }

  const deferStart = deferItem ? shiftCalendarDate(
    [date, deferItem.dueAt ? localParts(deferItem.dueAt, timeZone).date : date].sort().at(-1)!, 1,
  ) : date;

  if (!page && todoAggregateHidden(todo.state)) return null;

  return <AppScreen title={locale.t("tasks.title")} refreshControl={<RefreshControl refreshing={todo.state.refreshing} onRefresh={refresh} />}>
    {page ? <TodoSections page={page} offline={offline} staleDay={staleDay} busy={busy} pagingSection={pagingSection} pagingFailedSection={pagingFailedSection} mirroredTaskIds={mirroredTaskIds}
      onRefresh={refresh} canOpen={item => "actions" in item ? todoDecisionHref(item) !== null : true}
      onMore={section => { void loadMore(section); }}
      canOpenFollowup={item => todoFollowupHref(item) !== null}
      canDefer={item => !offline || deferableTaskIds.has(item.taskId)}
      onOpen={open} onOpenFollowup={item => { const href = todoFollowupHref(item); if (href) router.push(href as Href); }}
      onComplete={item => { void complete(item); }} onDefer={openDefer} onDecide={(item, action) => { void decide(item, action); }} /> : null}
    {visibleManualDraft ? <TodoManualDraft title={visibleManualDraft.item.titlePreview} value={visibleManualDraft.body}
      onChange={body => { if (isCurrent()) setManualDraft(current => {
        const scoped = todoManualDraftForScope(current, scopeKey);
        return scoped ? { ...scoped, body } : null;
      }); }}
      onClose={() => { if (isCurrent()) setManualDraft(null); }}
      onCopy={() => { if (!isCurrent()) return; void Clipboard.setStringAsync(visibleManualDraft.body.trim()).then(() => { if (isCurrent()) toast.success(locale.t("todo.manualCopied")); }).catch(() => { if (isCurrent()) toast.error(locale.t("todo.manualFailed")); }); }}
      onMail={() => { if (!isCurrent()) return; const href = todoManualMailto(visibleManualDraft.body); if (href) void Linking.openURL(href).catch(() => { if (isCurrent()) toast.error(locale.t("todo.manualFailed")); }); }} /> : null}
    {onShowTasks ? <View style={slotStyles.allTasks}><Button label={locale.t("todo.allTasks")} onPress={onShowTasks} variant="secondary" /></View> : null}
    {!todo.page && todo.state.kind === "loading" ? <LoadingState /> : null}
    {!todo.page && todo.state.kind !== "loading" ? <ErrorState title={locale.t("tasks.unavailable")} message={locale.t("todo.unavailable")} /> : null}
    {busy ? <View accessibilityState={{ busy: true }} /> : null}
    {deferItem ? <PersonalScheduleDateTimePicker key={`${deferItem.key}:${deferStart}`} kind="date" value={deferStart}
      zone={timeZone} disabled={busy} onCancel={() => { if (!busy) setDeferItem(null); }}
      onConfirm={selected => {
        if ((deferItem.deferralCount ?? 0) >= 1) {
          setDeferConfirmation({ item: deferItem, date: selected });
          setDeferItem(null);
        } else void defer(deferItem, selected);
      }} /> : null}
    <ConfirmDialog visible={deferConfirmation !== null} title={locale.t("todo.deferAgainTitle")}
      message={locale.t("todo.deferAgainMessage")} confirmLabel={locale.t("todo.deferAgainConfirm")}
      onCancel={() => setDeferConfirmation(null)} onConfirm={() => {
        if (!deferConfirmation) return;
        const selection = deferConfirmation;
        setDeferConfirmation(null);
        void defer(selection.item, selection.date);
      }} />
  </AppScreen>;
}

const slotStyles = StyleSheet.create({ list: { flex: 1 }, back: { paddingHorizontal: 16, paddingTop: 8 }, allTasks: { paddingHorizontal: 16, paddingBottom: 20 } });
