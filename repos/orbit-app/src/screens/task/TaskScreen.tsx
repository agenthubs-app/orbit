import { useGlobalSearchParams, useIsFocused, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { isTaskPlanDemoStatus, saveTaskPlanDemoCollapse, TASK_PLAN_DEMO_PATH, taskPlanDemoOf, type TaskPlanDemoResult } from "../../api/task-plan-demo";
import { serverReachability } from "../../api/server-reachability";
import { AppScreenEmbeddingProvider } from "../../components/AppScreenEmbedding";
import { TabPageBar } from "../../components/TabPageBar";
import { ShellBackground } from "../../components/ShellBackground";
import { shellHeaderDate } from "../../components/shell-date";
import { SHELL_GUTTER, ShellTopBar, useShellTopGap } from "../../components/ShellTopBar";
import { IconButton } from "../../components/ui/IconButton";
import { RetryCard, Skeleton } from "../../components/ui";
import { SwipeSegments } from "../../components/ui/Segmented";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { usePageCopySession } from "../../hooks/usePageCopySession";
import { readThroughPageCopy } from "../../data/sync/page-copy-through";
import { PLAN_COPY_FRESH_MS } from "../plan/plan-copies";
import { useStandardCopy } from "../../i18n/standard-copy";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { TASK_SEGMENTS, type TaskSegment } from "../../view-models/app-navigation";
import { initialTaskSegment, rememberTaskSegment } from "../../view-models/shell-state";
import { CalendarScreen } from "../calendar/CalendarScreen";
import { MemoListScreen } from "../memo/MemoListScreen";
import { PlanSegment } from "../plan/PlanSegment";
import { PlanGoalInputShown } from "../plan/plan-goal-input-shown";
import { TodoTaskSlot } from "../todo/TodoScreen";
import { TaskQuickAdd, type TaskQuickAddHandle } from "./TaskQuickAdd";
import { TaskPlanDemoNotice } from "./TaskPlanDemoNotice";

// R05 Task container (RD-20, frozen). Four slots in a fixed order; each slot is
// one component and a feature Sprint replaces only its own slot:
//   calendar → R20a unified CalendarScreen
//   todo     → R20a Todo first page; the existing task list remains a second view until SC09 replacement
//   plan     → R23 PlanSegment (goal input / confirmed card); R24 adds the overview
//   memo     → R20b MemoListScreen
// Do not change the container (header, segments, 「＋」 dispatch, URL `?seg=`).
export const TASK_SLOTS: Readonly<Record<TaskSegment, (props: TaskSlotProps) => ReactNode>> = {
  calendar: () => <CalendarScreen />,
  todo: ({ quickAdd, revision, onCreated }) => <>
    <TaskQuickAdd ref={quickAdd} onCreated={onCreated} />
    <TodoTaskSlot key={revision} />
  </>,
  plan: () => <PlanSegment />,
  memo: () => <MemoSlot />,
};

type TaskSlotProps = { quickAdd: RefObject<TaskQuickAddHandle | null>; revision: number; onCreated: () => void };

export function TaskScreen() {
  const { styles } = useStyles();
  const router = useRouter();
  const locale = useOrbitLocale();
  const copy = useStandardCopy();
  const { timeZone } = useOrbitTimeZone();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useOrbitApiClient();
  const focused = useIsFocused();
  const params = useGlobalSearchParams<{ seg?: string | string[] }>();
  const [segment, setSegment] = useState<TaskSegment>(() => initialTaskSegment(params.seg));
  const linked = Array.isArray(params.seg) ? params.seg[0] : params.seg;
  const observedLink = useRef(linked);
  // The values this page wrote with setParams and has not seen come back yet. They
  // land a render (or several) later, in order; while they arrive they are only
  // consumed, never followed — otherwise a quick second tap would be pulled back to
  // the first one for a moment (R05 review M2). Any other value is a new link (a
  // notification, an old address) and moves the segment.
  const ownWrites = useRef<string[]>([]);
  if (linked !== observedLink.current) {
    observedLink.current = linked;
    const own = linked === undefined ? -1 : ownWrites.current.indexOf(linked);
    if (own >= 0) ownWrites.current.splice(0, own + 1);
    else {
      ownWrites.current = [];
      const next = initialTaskSegment(linked);
      if (next !== segment) setSegment(next);
    }
  }
  // Pages mount the first time they are shown and then stay, like a tab pager.
  const [visited, setVisited] = useState<ReadonlySet<TaskSegment>>(() => new Set([segment]));
  if (!visited.has(segment)) setVisited(new Set([...visited, segment]));
  const quickAdd = useRef<TaskQuickAddHandle>(null);
  const [revision, setRevision] = useState(0);
  const [planDemo, setPlanDemo] = useState<TaskPlanDemoResult | { kind: "loading" }>({ kind: "loading" });
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [demoIntercept, setDemoIntercept] = useState(false);
  const demoTicket = useRef(0);
  const { whenReady } = usePageCopySession();
  // LF9: the demo decision is a page copy too, so a visit within the plan copies' window reads nothing and
  // offline the segment shows the saved decision instead of a retry card.
  const reloadDemo = useCallback(async (force = false) => {
    const ticket = ++demoTicket.current;
    setPlanDemo({ kind: "loading" });
    const got = await readThroughPageCopy(whenReady, { id: "task-demo-status", variant: "main" }, { accept: isTaskPlanDemoStatus, force, freshForMs: PLAN_COPY_FRESH_MS },
      () => client.get<unknown>(TASK_PLAN_DEMO_PATH).catch(() => null),
      (result) => result?.success ? { data: result.data } : { network: !result || (result.status === 0 && result.error.code === "ORBIT_APP_NETWORK_ERROR") });
    if (ticket === demoTicket.current) setPlanDemo(got.from === "failed" ? { kind: "unavailable" } : taskPlanDemoOf(got.data));
  }, [client, whenReady]);
  useEffect(() => {
    if (!focused || segment !== "plan") return;
    if (!auth.ready || !auth.signedIn || !auth.actorId || !server.ready) {
      setPlanDemo({ kind: "unavailable" });
      return;
    }
    void reloadDemo();
    return () => { demoTicket.current += 1; };
  }, [focused, segment, auth.ready, auth.signedIn, auth.actorId, auth.cookieHeader, server.ready, server.baseUrl, reloadDemo]);
  const onCreated = useCallback(() => setRevision((value) => value + 1), []);

  const choose = useCallback((next: TaskSegment) => {
    setSegment(next);
    rememberTaskSegment(next);
    ownWrites.current.push(next);
    router.setParams({ seg: next });
  }, [router]);
  rememberTaskSegment(segment);

  const segments = useMemo(() => TASK_SEGMENTS.map((key) => ({ key, label: copy.taskSegments[key === "memo" ? "notes" : key] })), [copy]);
  // プラン: 「＋」 = 目標を追加 (app.html #20 / #23, b10 ①), the same `new=1` address as 「次の目標」.
  const addLabel = segment === "calendar" ? locale.t("shell.task.addCalendar") : segment === "todo" ? locale.t("shell.task.addTodo") : segment === "memo" ? locale.t("shell.task.addMemo") : locale.t("plan.goals.add");
  // A new note needs the server on the Web (the notes page disables its own 「＋」 the
  // same way, review m3); the device saves notes offline.
  const unreachable = useServerUnreachable();
  const addDisabled = segment === "memo" && Platform.OS === "web" && unreachable
    || segment === "plan" && planDemo.kind !== "ready" && planDemo.kind !== "off";
  const add = () => {
    if (segment === "calendar") router.push("/schedule/personal/new" as Href);
    else if (segment === "todo") quickAdd.current?.focus();
    else if (segment === "memo") router.push("/notes/new" as Href);
    else if (planDemo.kind === "ready") setDemoIntercept(true);
    else if (planDemo.kind === "off") router.setParams({ new: "1", seg: "plan" });
  };
  const toggleDemo = async () => {
    if (planDemo.kind !== "ready" || demoBusy) return;
    const previous = planDemo.view;
    setDemoBusy(true);
    setDemoError("");
    const next = !previous.bannerCollapsed;
    const saved = await saveTaskPlanDemoCollapse(client, next);
    if (saved) setPlanDemo(current => current.kind === "ready" && current.view === previous
      ? { kind: "ready", view: { ...previous, bannerCollapsed: next } } : current);
    else setDemoError(locale.t("tasks.demoSaveFailed"));
    setDemoBusy(false);
  };
  const today = shellHeaderDate(new Date(), locale.language, timeZone, locale.t);
  // 目標入力（新用户空状态、`new=1`、概要的「目標を追加」、旧计划的「新しいプランを作る」）时副标题是一句说明，
  // 不是日期（b10 ①、b12 A-R23-02a～c）；PlanSegment 通过 PlanGoalInputShown 报上来。
  const [planGoalInput, setPlanGoalInput] = useState(false);
  const goalInput = segment === "plan" && planGoalInput;
  const topGap = useShellTopGap();

  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { paddingTop: topGap }]}>
      <ShellBackground />
      {/* kit taskHead (app.html:633): 🔍 · Task + date · ＋. R30 (R20-01): 🔍 opens the
          global search page /search (people / events / conversations), like the Web ⌘K. */}
      <View style={styles.header}>
        <ShellTopBar title={copy.nav.task} subtitle={goalInput ? locale.t("plan.goal.headerHint") : today}
          left={<IconButton icon="search" accessibilityLabel={locale.t("search.open")} onPress={() => router.push("/search" as Href)} />}
          right={addLabel ? <IconButton icon="plus" accessibilityLabel={addLabel} onPress={add} disabled={addDisabled} /> : null} />
      </View>
      {segment === "plan" && planDemo.kind === "ready" ? <TaskPlanDemoNotice view={planDemo.view} busy={demoBusy}
        error={demoError} intercept={demoIntercept} onToggle={() => void toggleDemo()}
        onContinue={() => { setDemoIntercept(false); router.push("/start" as Href); }} onClose={() => setDemoIntercept(false)} /> : null}
      <SwipeSegments
        segments={segments}
        value={segment}
        onChange={choose}
        accessibilityLabel={copy.nav.task}
        renderPage={(key) => visited.has(key)
          ? <AppScreenEmbeddingProvider segment={key}><PlanGoalInputShown.Provider value={setPlanGoalInput}>
            {key === "plan" && planDemo.kind !== "off" ? planDemo.kind === "ready" ? <View style={styles.demoBlocked}>
              <View style={styles.demoBlocked} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {TASK_SLOTS[key]({ quickAdd, revision, onCreated })}
              </View>
              <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={locale.t("tasks.demoBlockedTitle")}
                onPress={() => setDemoIntercept(true)} />
            </View> : planDemo.kind === "loading" ? <Skeleton lines={4} />
              : <RetryCard title={locale.t("tasks.demoUnavailable")} onRetry={() => void reloadDemo(true)} />
              : TASK_SLOTS[key]({ quickAdd, revision, onCreated })}
          </PlanGoalInputShown.Provider></AppScreenEmbeddingProvider>
          : null}
      />
      <TabPageBar tab="task" />
    </SafeAreaView>
  );
}

function useServerUnreachable(): boolean {
  const { baseUrl } = useOrbitApiBaseUrl();
  const [state, setState] = useState(() => serverReachability.state(baseUrl));
  useEffect(() => {
    setState(serverReachability.state(baseUrl));
    return serverReachability.subscribe((url, next) => { if (url === baseUrl) setState(next); });
  }, [baseUrl]);
  return state === "unreachable";
}

function MemoSlot() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, actorId, auth.cookieHeader, server.baseUrl]);
  return enabled ? <MemoListScreen key={scope.key} actorId={actorId} scopeKey={scope.key} /> : null;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: SHELL_GUTTER },
  demoBlocked: { flex: 1 },
}));
