import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { PersonalScheduleList } from "../schedule/PersonalScheduleList";
import { RelationshipTaskTools } from "./RelationshipTaskTools";
import { RelationshipLifecycleList } from "./RelationshipLifecycleList";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
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
type TaskGroup = { label: string; items: TaskListRowView[]; tone: "danger" | "today" | "muted" | "completed"; fold?: boolean };

function mutationKey(action: string) {
  return `ios:${action}:${Crypto.randomUUID()}`;
}

export function TasksScreen() {
  const { timeZone } = useOrbitTimeZone();
  const locale = useOrbitLocale();
  const { colors, styles } = useStyles();
  const params = useLocalSearchParams<{ scope?: string | string[]; view?: string | string[] }>();
  const requested = parseTaskListSelection(params);
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
  const groups: TaskGroup[] = open && completed ? [
    ...(mode === "open" ? [
      { label: locale.t("tasks.groupOverdue"), items: open.filter(item => taskDateKey(item, timeZone) && taskDateKey(item, timeZone)! < today), tone: "danger" as const },
      { label: locale.t("tasks.groupToday"), items: open.filter(item => taskDateKey(item, timeZone) === today), tone: "today" as const },
      { label: locale.t("tasks.groupLater"), items: open.filter(item => taskDateKey(item, timeZone) && taskDateKey(item, timeZone)! > today), tone: "muted" as const },
      { label: locale.t("tasks.groupUnscheduled"), items: open.filter(item => !taskDateKey(item, timeZone)), tone: "muted" as const },
    ] : [{ label: locale.t("tasks.groupCompleted"), items: completed, tone: "completed" }]),
    ...(mode === "open" && (open.length > 0 || (source.counts?.completed ?? 0) > 0)
      ? [{ label: locale.t("tasks.groupCompleted"), items: foldedCompleted ?? [], tone: "completed" as const, fold: true }]
      : []),
  ].filter(group => group.items.length > 0 || group.fold) as TaskGroup[] : [];

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
      <View accessibilityRole="tablist" style={styles.tabs}>
        {([ ["all", locale.t("tasks.scopeAll")], ["relationship", locale.t("tasks.scopeRelationship")], ["personal", locale.t("tasks.scopePersonal")] ] as const).map(([value, label]) => <Pressable key={value} accessibilityRole="tab" accessibilityLabel={label} aria-selected={selection.scope === value} accessibilityState={{ selected: selection.scope === value }} onPress={() => setSelection(previous => ({ ...previous, scope: value }))} style={[styles.tab, selection.scope === value && styles.tabSelected]}><Text style={[styles.tabText, selection.scope === value && styles.tabTextSelected]}>{label}</Text></Pressable>)}
      </View>
      <TaskModeSwitcher mode={mode} onChange={view => setSelection(previous => ({ ...previous, view }))} openCount={source.counts?.open} completedCount={source.counts?.completed} />
      {source.offline ? <OfflineNotice lastSyncedAt={source.offline.lastSyncedAt} queues="tasks" /> : source.syncLabelKey ? <Text accessibilityLiveRegion="polite" style={styles.syncStatus}>{locale.t(source.syncLabelKey)}</Text> : null}
      {source.loading ? <LoadingState /> : null}
      {source.failure ? (
        <ErrorState message={locale.t(failureMessageKey)} title={locale.t(failureTitleKey)} />
      ) : null}
      {loaded && !canonical ? <ErrorState title={locale.t("tasks.dataUnavailable")} message={locale.t("tasks.dataUnavailableBody")} /> : null}
      {ready && contactsState.failure ? <ErrorState title={locale.t("tasks.contactsUnavailable")} message={locale.t("tasks.contactsUnavailableBody")} /> : null}
      {canonical && (mode === "open" ? open?.length === 0 : completed?.length === 0) ? (
        <EmptyState
          message={locale.t(mode === "open" ? "tasks.emptyOpenBody" : "tasks.emptyCompletedBody")}
          title={locale.t(mode === "open" ? "tasks.emptyOpenTitle" : "tasks.emptyCompletedTitle")}
        />
      ) : null}
      <View style={styles.groups}>
      {groups.map(group => (
        <View key={group.label} style={styles.list}>
          {group.fold ? <Pressable
            accessibilityRole="button"
            accessibilityLabel={locale.t(completedExpanded ? "tasks.collapseCompleted" : "tasks.expandCompleted")}
            accessibilityState={{ expanded: completedExpanded }}
            onPress={() => { setFold({ scope: foldScope, expanded: !completedExpanded }); if (completedExpanded) setCompletedPosition({ scope: foldScope, cursor: null }); }}
            style={styles.groupHeading}
          >
            <Text style={[styles.groupTitle, styles.muted]}>{group.label}</Text>
            <Text style={styles.groupCount}>{source.counts?.completed ?? 0}</Text>
            <Icon name="down" size={16} color={colors.ink3Text} />
          </Pressable> : <View accessibilityRole="header" accessibilityLabel={`${group.label} ${group.items.length}`} style={styles.groupHeading}>
            <Text style={[styles.groupTitle, group.tone === "completed" && styles.muted]}>{group.label}</Text>
            <Text style={[styles.groupCount, group.tone === "today" && styles.todayCount, group.tone === "danger" && styles.danger]}>{group.items.length}</Text>
          </View>}
          {group.fold && completedExpanded && source.completedSection?.loading ? <LoadingState /> : null}
          {group.fold && completedExpanded && source.completedSection?.failure ? <ErrorState title={locale.t(source.completedSection.unconfirmed ? "tasks.dataUnavailable" : "tasks.unavailable")} message={locale.t(source.completedSection.unconfirmed ? "tasks.dataUnavailableBody" : "tasks.readFailed")} /> : null}
          {group.fold && completedExpanded && foldedCompleted?.length === 0 ? <Text style={styles.rowDetail}>{locale.t("tasks.emptyCompletedTitle")}</Text> : null}
          {group.items.map(item => {
            const contactId = (canonical?.find(task => task.id === item.id) ?? foldedCanonical?.find(task => task.id === item.id))?.relatedContactId;
            const contact = contactId ? contacts.get(contactId) : null;
            return <View key={item.id}><View
              style={styles.row}
            >
              <Pressable
                accessibilityLabel={locale.t(item.status === "completed" ? "tasks.restoreNamed" : "tasks.completeNamed", { title: item.title }) + (source.offline && !isOfflineTaskCategory(item.category) ? " · " + locale.t("sync.needsNetwork") : "")}
                accessibilityRole="checkbox"
                aria-checked={item.status === "completed"}
                accessibilityState={{ checked: item.status === "completed", disabled: updatingId !== null || Boolean(source.offline && !isOfflineTaskCategory(item.category)), busy: updatingId === item.id }}
                disabled={updatingId !== null || Boolean(source.offline && !isOfflineTaskCategory(item.category))}
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
                  style={[styles.rowTitle, item.status === "completed" ? styles.completedTitle : null, group.tone === "danger" && styles.danger]}
                >
                  {item.title}
                </Text>
                <Text style={[styles.rowDetail, group.tone === "danger" && styles.danger]}>
                  {[item.categoryLabel, item.dateLabel, item.location].filter(Boolean).join(" · ")}
                </Text>
                {item.localMutationState ? <Text style={styles.rowDetail}>{locale.t(item.localMutationState === "conflict" ? "tasks.outboxConflict" : item.localMutationState === "failed" ? "tasks.outboxFailed" : "tasks.outboxQueued")}</Text> : null}
              </Pressable>
              <Ionicons color={colors.ink3Text} name="chevron-forward" size={17} />
            </View>
            {contact ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("tasks.viewContact", { name: contact.name })} onPress={() => router.push(`/contacts/${encodeURIComponent(contact.id)}` as Href)} style={styles.contactLink}><Text style={styles.contactText}>{[contact.name, contact.organization].filter(Boolean).join(" · ")}</Text></Pressable> : contactId ? <Text style={styles.rowDetail}>{locale.t("tasks.contactUnavailable")}</Text> : null}
            </View>;
          })}
          {group.fold && completedExpanded && source.completedSection?.nextCursor ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("tasks.completedNextPage")} onPress={() => setCompletedPosition({ scope: foldScope, cursor: source.completedSection?.nextCursor ?? null })} style={styles.contactLink}><Text style={styles.contactText}>{locale.t("tasks.completedNextPage")}</Text></Pressable> : null}
          {group.fold && completedExpanded && completedCursor ? <Pressable accessibilityRole="button" accessibilityLabel={locale.t("tasks.completedFirstPage")} onPress={() => setCompletedPosition({ scope: foldScope, cursor: null })} style={styles.contactLink}><Text style={styles.contactText}>{locale.t("tasks.completedFirstPage")}</Text></Pressable> : null}
        </View>
      ))}
      </View>
      {source.nextCursor ? <Pressable accessibilityRole="button" onPress={()=>setPosition({scope:pageScope,cursor:source.nextCursor})} style={styles.contactLink}><Text style={styles.contactText}>{locale.language==="zh"?"下一页待办":locale.language==="ja"?"次のタスク":"Next task page"}</Text></Pressable>:null}
      {cursor ? <Pressable accessibilityRole="button" onPress={refreshTasks} style={styles.contactLink}><Text style={styles.contactText}>{locale.language==="zh"?"返回待办第一页":locale.language==="ja"?"最初のタスク":"First task page"}</Text></Pressable>:null}
      {mutationError ? <Text accessibilityRole="alert" style={styles.errorText}>{mutationError}</Text> : null}
      {selection.scope !== "personal" ? <RelationshipLifecycleList key={`lifecycle:${scopeKey}`} scopeKey={scopeKey} ready={ready} mode={mode} /> : null}
      {selection.scope === "all" && mode === "open" ? <PersonalScheduleList /> : null}
      {selection.scope === "relationship" && canonical ? <RelationshipTaskTools key={`tools:${scopeKey}`} tasks={canonical} contacts={[...contacts.values()]} tasksPayload={source.tasksPayload} /> : null}
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
  const locale = useOrbitLocale();
  const { styles } = useStyles();
  const options: Array<{ label: string; value: TaskListMode }> = [
    { label: locale.t("tasks.viewOpen"), value: "open" },
    { label: locale.t("tasks.viewCompleted"), value: "completed" },
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

function tokyoDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function taskDateKey(item: TaskListRowView, timeZone: string): string | undefined {
  if (item.dueAt && Number.isFinite(Date.parse(item.dueAt))) return tokyoDateKey(new Date(item.dueAt), timeZone);
  return item.plannedDate;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  addButton: { alignItems: "center", justifyContent: "center", minWidth: layout.control, minHeight: layout.control },
  checkButton: { alignItems: "flex-start", justifyContent: "center", width: layout.control, minHeight: layout.control },
  contactLink: { minHeight: layout.control, justifyContent: "center", paddingLeft: layout.control },
  contactText: { color: colors.accentText, fontSize: 15, lineHeight: 23 },
  checkbox: { alignItems: "center", justifyContent: "center", borderColor: colors.ink, borderWidth: 1.5, borderRadius: 6, width: 22, height: 22 },
  checkboxCompleted: { backgroundColor: colors.accentText, borderColor: colors.accentText },
  completedTitle: { color: colors.ink3Text, textDecorationLine: "line-through" },
  danger: { color: colors.coralText },
  errorText: { color: colors.coralText, fontSize: 15 },
  groupCount: { color: colors.ink3Text, fontSize: 24, lineHeight: 31, fontWeight: "800", letterSpacing: -0.44 },
  groupHeading: { alignItems: "baseline", flexDirection: "row", gap: 10, paddingBottom: 4 },
  groupTitle: { color: colors.ink, fontSize: 17, lineHeight: 25, fontWeight: "800" },
  syncStatus: { color: colors.ink3Text, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  groups: { gap: 22 },
  list: { backgroundColor: colors.surface },
  muted: { color: colors.ink3Text },
  pressed: { opacity: 0.65 },
  row: { alignItems: "center", flexDirection: "row", minHeight: 66, paddingVertical: 9, borderBottomColor: colors.line, borderBottomWidth: 1 },
  rowBody: { flex: 1, gap: 2, justifyContent: "center", minHeight: 46, minWidth: 0, paddingRight: 8 },
  rowDetail: { color: colors.ink3Text, fontSize: 14, lineHeight: 21 },
  rowTitle: { color: colors.ink, fontSize: 17, lineHeight: 25, fontWeight: "600" },
  tab: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1, flexShrink: 1 },
  tabSelected: { borderBottomColor: colors.ink },
  tabs: { flexDirection: "row", gap: 22, borderBottomColor: colors.line, borderBottomWidth: 1 },
  tabText: { color: colors.ink3Text, fontSize: 17, lineHeight: 24, flexShrink: 1 },
  tabTextSelected: { color: colors.ink, fontWeight: "800" },
  tabCountSelected: { color: colors.accentText, fontWeight: "800" },
  todayCount: { color: colors.accentText },
}));
