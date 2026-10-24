import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { RelationshipLifecycleList, useOpenFollowUps } from "./RelationshipLifecycleList";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";

import { taskPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { Icon } from "../../components/ui/Icon";
import { EmptyState } from "../../components/EmptyState";
import { OfflineNotice } from "../../components/OfflineNotice";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { layout } from "../../design/tokens";
import { createThemedStyles } from "../../design/theme";
import { useContactLabels } from "../../hooks/useContactLabels";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { tasksToListView, type TaskListRowView } from "../../view-models/today-tasks";
import { parseTaskListSelection, taskListReceiptMatches } from "../../view-models/task-list-scope";
import { useTaskListSource } from "./task-list-source";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { buildOfflineTaskMutation, isOfflineTaskCategory } from "../../data/sync/task-outbox-mutation";

type TaskListMode = "open" | "completed";
type FollowUpRow = { key: string; title: string; contactName: string; connectionId: string; dueAt: string | null };
type TaskGroup = { id: string; label: string; items: TaskListRowView[]; followUps: FollowUpRow[]; tone: "danger" | "today" | "muted" | "completed"; fold?: boolean };

function mutationKey(action: string) {
  return `ios:${action}:${Crypto.randomUUID()}`;
}

/**
 * UX-7 (user 2026-10-25: 「代办界面过于复杂… ios 提醒事项那种」): one list like iOS Reminders — no
 * all / relationship / personal tabs and no open / completed tabs. Rows are a round checkbox, the
 * title and one quiet line (date — red when overdue — and the person); completed items fold at the
 * bottom. `listHeader` lets the To-do tab put its suggestions row above the list.
 */
export function TasksScreen({ listHeader }: { listHeader?: ReactNode } = {}) {
  const { timeZone } = useOrbitTimeZone();
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const params = useLocalSearchParams<{ scope?: string | string[]; view?: string | string[] }>();
  const parsed = parseTaskListSelection(params);
  // One list: every task, open first, completed folded at the bottom.
  const requested = useMemo(() => ({ ...parsed, scope: "all" as const, view: "open" as const }), [parsed.scope, parsed.view]);
  const router = useRouter();
  const auth = useOrbitAuthSession(), server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && !!actorId;
  const scopeKey = JSON.stringify([actorId, auth.cookieHeader, server.baseUrl, ready]);
  const client = useOrbitApiClient({ scopeKey });
  const scope = useMemo(() => ({ active: true, busy: false, controller: new AbortController(), keys: new Map<string, string>() }), [client, scopeKey]);
  const currentScope = useRef(scope); currentScope.current = scope;
  const [selection, setSelection] = useState(requested);
  const mode = selection.view;
  const foldScope = JSON.stringify([scopeKey, selection.scope]);
  const [fold, setFold] = useState({ scope: foldScope, expanded: false });
  const completedExpanded = mode === "open" && fold.scope === foldScope && fold.expanded;
  const [completedPosition, setCompletedPosition] = useState<{ scope: string; cursor: string | null }>({ scope: foldScope, cursor: null });
  const completedCursor = completedPosition.scope === foldScope ? completedPosition.cursor : null;
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [displayScope, setDisplayScope] = useState(scope);
  if (displayScope !== scope) { setDisplayScope(scope); setUpdatingId(null); setMutationError(null); }
  const now = new Date();
  const today = tokyoDateKey(now, timeZone);
  const pageScope=JSON.stringify([scopeKey,selection,today,timeZone]);
  const [position,setPosition]=useState<{scope:string;cursor:string|null}>({scope:pageScope,cursor:null});
  const cursor=position.scope===pageScope?position.cursor:null;
  // Both sources expose one window: native/browser mirror reads locally;
  // online-only browsers use SQL pages instead of fetching the full task list.
  const source = useTaskListSource({ actorId, ready, scopeKey, selection, cursor, completedExpanded, completedCursor, today, timeZone });
  const failureTitleKey = source.unconfirmed || source.queueFailure ? "tasks.dataUnavailable" : "tasks.unavailable";
  const failureMessageKey = source.unconfirmed ? "tasks.dataUnavailableBody" : source.queueFailure ? "sync.failure" : "tasks.readFailed";
  const refreshTasks=()=>{setPosition({scope:pageScope,cursor:null});setCompletedPosition({scope:foldScope,cursor:null});source.refresh();};
  const loaded = ready && !source.loading && !source.failure;
  const canonical = source.canonical;
  const foldedCanonical = source.completedSection?.canonical;
  const contactsState=useContactLabels([...(canonical??[]),...(foldedCanonical??[])].flatMap(task=>task.relatedContactId?[task.relatedContactId]:[]),JSON.stringify([scopeKey,selection,cursor,completedCursor,completedExpanded]),ready);
  const contacts = new Map(contactsState.items.map(contact => [contact.id, contact]));
  // The authoritative source already filters scope before paging. A card may
  // hide an unauthorized contact, which must not make its owned task disappear.
  const open = canonical ? tasksToListView({ tasks: canonical }, "open", now, timeZone, locale.language).items : null;
  const completed = canonical ? tasksToListView({ tasks: canonical }, "completed", now, timeZone, locale.language).items : null;
  const foldedCompleted = foldedCanonical ? tasksToListView({ tasks: foldedCanonical }, "completed", now, timeZone, locale.language).items : null;
  // UX-7: relationship follow-ups sit among the tasks by date (no separate 人脉 list); finishing one
  // still asks for the relationship's next step on its own page.
  const followUps = useOpenFollowUps(scopeKey, ready);
  const [moreFollowUps, setMoreFollowUps] = useState(false);
  const followUpBucket = (dueAt: string | null) => {
    if (!dueAt || !Number.isFinite(Date.parse(dueAt))) return "unscheduled";
    const key = tokyoDateKey(new Date(dueAt), timeZone);
    return key < today ? "overdue" : key === today ? "today" : "later";
  };
  const followUpRows = (bucket: string): FollowUpRow[] => mode === "open" ? (followUps.items ?? [])
    .filter(item => followUpBucket(item.dueAt) === bucket)
    .map(item => ({ key: item.itemKey, title: item.titlePreview, contactName: item.contactNamePreview, connectionId: item.connectionId, dueAt: item.dueAt })) : [];
  const groups: TaskGroup[] = open && completed ? [
    ...(mode === "open" ? [
      { id: "overdue", label: locale.t("tasks.groupOverdue"), items: open.filter(item => taskDateKey(item, timeZone) && taskDateKey(item, timeZone)! < today), followUps: followUpRows("overdue"), tone: "danger" as const },
      { id: "today", label: locale.t("tasks.groupToday"), items: open.filter(item => taskDateKey(item, timeZone) === today), followUps: followUpRows("today"), tone: "today" as const },
      { id: "later", label: locale.t("tasks.groupLater"), items: open.filter(item => taskDateKey(item, timeZone) && taskDateKey(item, timeZone)! > today), followUps: followUpRows("later"), tone: "muted" as const },
      { id: "unscheduled", label: locale.t("tasks.groupUnscheduled"), items: open.filter(item => !taskDateKey(item, timeZone)), followUps: followUpRows("unscheduled"), tone: "muted" as const },
    ] : [{ id: "completed", label: locale.t("tasks.groupCompleted"), items: completed, followUps: [], tone: "completed" as const }]),
    ...(mode === "open" && (open.length > 0 || (source.counts?.completed ?? 0) > 0)
      ? [{ id: "completed-fold", label: locale.t("tasks.groupCompleted"), items: foldedCompleted ?? [], followUps: [], tone: "completed" as const, fold: true }]
      : []),
  ].filter(group => group.items.length > 0 || group.followUps.length > 0 || group.fold) as TaskGroup[] : [];
  const followUpDate = (dueAt: string | null) => dueAt && Number.isFinite(Date.parse(dueAt))
    ? new Date(dueAt).toLocaleDateString(locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric", timeZone }) : "";

  useEffect(() => setSelection(requested), [requested.scope, requested.view]);
  useEffect(() => {
    scope.active = true;
    if (scope.controller.signal.aborted) scope.controller = new AbortController();
    return () => { scope.active = false; scope.controller.abort(); };
  }, [scope]);

  async function toggleTask(item: TaskListRowView) {
    const baseline = canonical?.find(task => task.id === item.id) ?? foldedCanonical?.find(task => task.id === item.id);
    if (!ready || !baseline || !scope.active || currentScope.current !== scope || scope.busy) return;
    scope.busy = true;
    setUpdatingId(item.id);
    setMutationError(null);
    try {
      const action = item.status === "completed" ? "reopen" : "complete";
      if (source.offline) {
        if (!isOfflineTaskCategory(baseline.category)) {
          setMutationError(locale.t("sync.needsNetwork"));
          return;
        }
        const idempotencyKey = Crypto.randomUUID();
        const createdAt = new Date().toISOString();
        await source.enqueueOfflineMutation(buildOfflineTaskMutation({
          mutationId: idempotencyKey,
          entityId: baseline.id,
          operation: action,
          baseRevision: baseline.baseRevision,
          requestBody: { action, idempotencyKey },
          createdAt,
        }));
        setPosition({ scope: pageScope, cursor: null });
        setCompletedPosition({ scope: foldScope, cursor: null });
        return;
      }
      const intent = JSON.stringify([item.id, action, baseline.updatedAt]);
      const key = scope.keys.get(intent) ?? mutationKey(`${action}:${item.id}`);
      scope.keys.set(intent, key);
      const result = await client.patch<unknown>(taskPath(item.id), {
        body: { action, idempotencyKey: key }, signal: scope.controller.signal,
      });
      if (!scope.active || currentScope.current !== scope) return;
      if (!result.success) setMutationError(locale.t("tasks.operationFailed"));
      else if (result.status < 200 || result.status >= 300 || !taskListReceiptMatches(result.data, actorId, baseline, action)) setMutationError(locale.t("tasks.operationUnconfirmed"));
      else if (await source.confirmMutation(item.id, action)) { scope.keys.delete(intent); setPosition({scope:pageScope,cursor:null}); setCompletedPosition({scope:foldScope,cursor:null}); }
      else setMutationError(locale.t("sync.mutationPending"));
    } catch {
      if (scope.active && currentScope.current === scope) setMutationError(locale.t("tasks.operationFailed"));
    } finally {
      scope.busy = false;
      if (scope.active && currentScope.current === scope) setUpdatingId(null);
    }
  }

  return (
    <AppScreen
      backAccessibilityLabel={locale.t("common.backToNamed", { name: locale.t("nav.home") })}
      backLabel={locale.t("nav.home")}
      refreshControl={
        <RefreshControl
          onRefresh={() => { refreshTasks(); contactsState.refresh(); }}
          refreshing={source.refreshing}
          tintColor={colors.accentText}
        />
      }
      headerActions={<Pressable accessibilityLabel={locale.t("tasks.addAtToday")} accessibilityRole="button" onPress={() => router.push("/today" as Href)} style={styles.addButton}>
        <Ionicons color={colors.accentText} name="add" size={26} />
      </Pressable>}
      title={locale.t("tasks.title")}
    >
      {listHeader}
      {source.offline ? <OfflineNotice lastSyncedAt={source.offline.lastSyncedAt} queues="tasks" /> : null}
      {source.loading ? <LoadingState /> : null}
      {source.failure ? (
        <ErrorState message={locale.t(failureMessageKey)} title={locale.t(failureTitleKey)} />
      ) : null}
      {loaded && !canonical ? <ErrorState title={locale.t("tasks.dataUnavailable")} message={locale.t("tasks.dataUnavailableBody")} /> : null}
      {ready && contactsState.failure ? <ErrorState title={locale.t("tasks.contactsUnavailable")} message={locale.t("tasks.contactsUnavailableBody")} /> : null}
      {canonical && (mode === "open" ? open?.length === 0 && (followUps.items?.length ?? 0) === 0 : completed?.length === 0) ? (
        <EmptyState
          message={locale.t(mode === "open" ? "tasks.emptyOpenBody" : "tasks.emptyCompletedBody")}
          title={locale.t(mode === "open" ? "tasks.emptyOpenTitle" : "tasks.emptyCompletedTitle")}
        />
      ) : null}
      <View style={styles.groups}>
      {groups.map(group => (
        <View key={group.id} style={styles.section}>
          {group.fold ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={locale.t(completedExpanded ? "tasks.collapseCompleted" : "tasks.expandCompleted")}
            accessibilityState={{ expanded: completedExpanded }}
            onPress={() => { setFold({ scope: foldScope, expanded: !completedExpanded }); if (completedExpanded) setCompletedPosition({ scope: foldScope, cursor: null }); }}
            style={[styles.groupHeading, styles.foldHeading]}
          >
            <Text style={[styles.groupTitle, styles.muted]}>{group.label}</Text>
            <Text style={styles.groupCount}>{source.counts?.completed ?? 0}</Text>
            <Icon name={completedExpanded ? "up" : "down"} size={16} color={colors.ink3Text} />
          </Pressable> : <View accessibilityRole="header" accessibilityLabel={`${group.label} ${group.items.length + group.followUps.length}`} style={styles.groupHeading}>
            <Text style={[styles.groupTitle, group.tone === "danger" && styles.danger, group.tone === "today" && styles.todayCount]}>{group.label}</Text>
            <Text style={styles.groupCount}>{group.items.length + group.followUps.length}</Text>
          </View>}
          {group.fold && completedExpanded && source.completedSection?.loading ? <LoadingState /> : null}
          {group.fold && completedExpanded && source.completedSection?.failure ? <ErrorState title={locale.t(source.completedSection.unconfirmed ? "tasks.dataUnavailable" : "tasks.unavailable")} message={locale.t(source.completedSection.unconfirmed ? "tasks.dataUnavailableBody" : "tasks.readFailed")} /> : null}
          {group.fold && completedExpanded && foldedCompleted?.length === 0 ? <Text style={styles.rowDetail}>{locale.t("tasks.emptyCompletedTitle")}</Text> : null}
          {group.items.length || group.followUps.length ? <View style={styles.card}>{group.items.map((item, index) => {
            const contactId = (canonical?.find(task => task.id === item.id) ?? foldedCanonical?.find(task => task.id === item.id))?.relatedContactId;
            const contact = contactId ? contacts.get(contactId) : null;
            const completedItem = item.status === "completed";
            const offlineBlocked = Boolean(source.offline && !isOfflineTaskCategory(item.category));
            return <View key={item.id} style={styles.row}>
              <Pressable
                accessibilityLabel={locale.t(completedItem ? "tasks.restoreNamed" : "tasks.completeNamed", { title: item.title }) + (offlineBlocked ? " · " + locale.t("sync.needsNetwork") : "")}
                accessibilityRole="checkbox"
                aria-checked={completedItem}
                accessibilityState={{ checked: completedItem, disabled: updatingId !== null || offlineBlocked, busy: updatingId === item.id }}
                disabled={updatingId !== null || offlineBlocked}
                hitSlop={8}
                onPress={() => void toggleTask(item)}
                style={styles.checkButton}
              >
                <View style={[styles.checkbox, completedItem && styles.checkboxCompleted, updatingId === item.id && styles.checkboxBusy]}>
                  {completedItem ? <Ionicons color={colors.onAccent} name="checkmark" size={15} /> : null}
                </View>
              </Pressable>
              <Pressable
                accessibilityLabel={[item.title, item.dateLabel, contact?.name].filter(Boolean).join("，")}
                accessibilityRole="button"
                onPress={() => router.push(`/tasks/${encodeURIComponent(item.id)}` as Href)}
                style={({ pressed }) => [styles.rowBody, index > 0 && styles.rowLine, pressed ? styles.pressed : null]}
              >
                <Text style={[styles.rowTitle, completedItem ? styles.completedTitle : null]}>{item.title}</Text>
                {item.dateLabel || contact || item.location ? <Text numberOfLines={1} style={styles.rowDetail}>
                  {item.dateLabel ? <Text style={group.tone === "danger" ? styles.danger : group.tone === "today" ? styles.todayCount : null}>{item.dateLabel}</Text> : null}
                  {[contact?.name, item.location].filter(Boolean).map(part => `${item.dateLabel ? "  ·  " : ""}${part}`).join("")}
                </Text> : null}
                {item.localMutationState ? <Text style={styles.rowDetail}>{locale.t(item.localMutationState === "conflict" ? "tasks.outboxConflict" : item.localMutationState === "failed" ? "tasks.outboxFailed" : "tasks.outboxQueued")}</Text> : null}
              </Pressable>
            </View>;
          })}{group.followUps.map((item, index) => <View key={item.key} style={styles.row}>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: false }} accessibilityLabel={locale.t("tasks.completeNamed", { title: item.title })} hitSlop={8}
              onPress={() => router.push(`/tasks/relationship/${encodeURIComponent(item.connectionId)}` as Href)} style={styles.checkButton}>
              <View style={styles.checkbox} />
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={[item.title, followUpDate(item.dueAt), item.contactName].filter(Boolean).join("，")}
              onPress={() => router.push(`/tasks/relationship/${encodeURIComponent(item.connectionId)}` as Href)}
              style={({ pressed }) => [styles.rowBody, (group.items.length > 0 || index > 0) && styles.rowLine, pressed ? styles.pressed : null]}>
              <Text style={styles.rowTitle}>{item.title}</Text>
              <Text numberOfLines={1} style={styles.rowDetail}>
                {followUpDate(item.dueAt) ? <Text style={group.tone === "danger" ? styles.danger : group.tone === "today" ? styles.todayCount : null}>{followUpDate(item.dueAt)}</Text> : null}
                {item.contactName ? `${followUpDate(item.dueAt) ? "  ·  " : ""}${item.contactName}` : ""}
              </Text>
            </Pressable>
          </View>)}</View> : null}
          {group.fold && completedExpanded && source.completedSection?.nextCursor ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("tasks.completedNextPage")} onPress={() => setCompletedPosition({ scope: foldScope, cursor: source.completedSection?.nextCursor ?? null })} style={styles.contactLink}><Text style={styles.contactText}>{locale.t("tasks.completedNextPage")}</Text></Pressable> : null}
          {group.fold && completedExpanded && completedCursor ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("tasks.completedFirstPage")} onPress={() => setCompletedPosition({ scope: foldScope, cursor: null })} style={styles.contactLink}><Text style={styles.contactText}>{locale.t("tasks.completedFirstPage")}</Text></Pressable> : null}
        </View>
      ))}
      </View>
      {source.nextCursor ? <Pressable accessibilityRole="button" onPress={()=>setPosition({scope:pageScope,cursor:source.nextCursor})} style={styles.contactLink}><Text style={styles.contactText}>{locale.language==="zh"?"下一页待办":locale.language==="ja"?"次のタスク":"Next task page"}</Text></Pressable>:null}
      {cursor ? <Pressable accessibilityRole="button" onPress={refreshTasks} style={styles.contactLink}><Text style={styles.contactText}>{locale.language==="zh"?"返回待办第一页":locale.language==="ja"?"最初のタスク":"First task page"}</Text></Pressable>:null}
      {mutationError ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
      {mode === "open" && followUps.hasMore && !moreFollowUps ? <Pressable accessibilityRole="button" onPress={() => setMoreFollowUps(true)} style={styles.contactLink}>
        <Text style={styles.contactText}>{locale.t("tasks.moreFollowUps", { count: followUps.total - (followUps.items?.length ?? 0) })}</Text>
      </Pressable> : null}
      {moreFollowUps ? <RelationshipLifecycleList key={`lifecycle:${scopeKey}`} scopeKey={scopeKey} ready={ready} mode={mode} /> : null}
    </AppScreen>
  );
}

function tokyoDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function taskDateKey(item: TaskListRowView, timeZone: string): string | undefined {
  if (item.dueAt && Number.isFinite(Date.parse(item.dueAt))) return tokyoDateKey(new Date(item.dueAt), timeZone);
  return item.plannedDate;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  addButton: { alignItems: "center", justifyContent: "center", minWidth: layout.control, minHeight: layout.control },
  checkButton: { alignItems: "center", justifyContent: "center", width: 40, minHeight: 52 },
  contactLink: { minHeight: layout.control, justifyContent: "center", paddingLeft: layout.control },
  contactText: { color: colors.accentText, fontSize: 15, lineHeight: 23 },
  checkbox: { alignItems: "center", justifyContent: "center", borderColor: colors.ink4, borderWidth: 1.6, borderRadius: 12, width: 24, height: 24 },
  checkboxBusy: { opacity: 0.5 },
  checkboxCompleted: { backgroundColor: colors.accentText, borderColor: colors.accentText },
  completedTitle: { color: colors.ink3Text, textDecorationLine: "line-through" },
  danger: { color: colors.coralText },
  errorText: { color: colors.coralText, fontSize: 15 },
  groupCount: { color: colors.ink3Text, fontSize: 17, fontWeight: "600", marginLeft: "auto" },
  groupHeading: { alignItems: "center", flexDirection: "row", gap: 8, paddingHorizontal: 4, paddingBottom: 6 },
  groupTitle: { color: colors.ink, fontSize: 20, fontWeight: "700" },
  groups: { gap: 22 }, section: { gap: 0 }, foldHeading: { minHeight: layout.control },
  card: { backgroundColor: colors.surface, borderRadius: 14, paddingLeft: 6, overflow: "hidden" },
  muted: { color: colors.ink3Text },
  pressed: { opacity: 0.65 },
  row: { alignItems: "stretch", flexDirection: "row" },
  rowLine: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
  rowBody: { flex: 1, gap: 2, justifyContent: "center", minHeight: 52, minWidth: 0, paddingVertical: 10, paddingRight: 14 },
  rowDetail: { color: colors.ink3Text, fontSize: 15, lineHeight: 20 },
  rowTitle: { color: colors.ink, fontSize: 17, lineHeight: 22 },
  todayCount: { color: colors.accentText },
}));
