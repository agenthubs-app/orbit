import { useGlobalSearchParams, useIsFocused, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { serverReachability } from "../../api/server-reachability";
import { AppScreenEmbeddingProvider } from "../../components/AppScreenEmbedding";
import { IconButton } from "../../components/ui/IconButton";
import { SwipeSegments } from "../../components/ui/Segmented";
import { EmptyState } from "../../components/ui/States";
import { UiText } from "../../components/ui/Text";
import { useToast } from "../../components/ui/Toast";
import { createThemedStyles } from "../../design/theme";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useStandardCopy } from "../../i18n/standard-copy";
import { useOrbitTimeZone } from "../../time/OrbitTimeZoneProvider";
import { TASK_SEGMENTS, type TaskSegment } from "../../view-models/app-navigation";
import { initialTaskSegment, rememberTaskSegment } from "../../view-models/shell-state";
import { NotesScreen } from "../notes/NotesScreen";
import { ScheduleScreen } from "../schedule/ScheduleScreen";
import { TasksScreen } from "../tasks/TasksScreen";
import { TaskQuickAdd, type TaskQuickAddHandle } from "./TaskQuickAdd";

// R05 Task container (RD-20, frozen). Four slots in a fixed order; each slot is
// one component and a feature Sprint replaces only its own slot:
//   calendar → R20 (now the existing ScheduleScreen)
//   todo     → R20 (now the existing TasksScreen under the add box)
//   plan     → R25 (now the 「目標を決める」 empty state)
//   memo     → R20 (now the existing NotesScreen)
// Do not change the container (header, segments, 「＋」 dispatch, URL `?seg=`).
export const TASK_SLOTS: Readonly<Record<TaskSegment, (props: TaskSlotProps) => ReactNode>> = {
  calendar: () => <ScheduleScreen />,
  todo: ({ quickAdd, revision, onCreated }) => <>
    <TaskQuickAdd ref={quickAdd} onCreated={onCreated} />
    <TasksScreen key={revision} />
  </>,
  plan: () => <PlanSlot />,
  memo: () => <MemoSlot />,
};

type TaskSlotProps = { quickAdd: RefObject<TaskQuickAddHandle | null>; revision: number; onCreated: () => void };

export function TaskScreen() {
  const { styles } = useStyles();
  const router = useRouter();
  const locale = useOrbitLocale();
  const copy = useStandardCopy();
  const { timeZone } = useOrbitTimeZone();
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
  const onCreated = useCallback(() => setRevision((value) => value + 1), []);

  const choose = useCallback((next: TaskSegment) => {
    setSegment(next);
    rememberTaskSegment(next);
    ownWrites.current.push(next);
    router.setParams({ seg: next });
  }, [router]);
  rememberTaskSegment(segment);

  const segments = useMemo(() => TASK_SEGMENTS.map((key) => ({ key, label: copy.taskSegments[key === "memo" ? "notes" : key] })), [copy]);
  const addLabel = segment === "calendar" ? locale.t("shell.task.addCalendar") : segment === "todo" ? locale.t("shell.task.addTodo") : segment === "memo" ? locale.t("shell.task.addMemo") : null;
  // A new note needs the server on the Web (the notes page disables its own 「＋」 the
  // same way, review m3); the device saves notes offline.
  const unreachable = useServerUnreachable();
  const addDisabled = segment === "memo" && Platform.OS === "web" && unreachable;
  const add = () => {
    if (segment === "calendar") router.push("/schedule/personal/new" as Href);
    else if (segment === "todo") quickAdd.current?.focus();
    else if (segment === "memo") router.push("/notes/new" as Href);
  };
  const today = new Intl.DateTimeFormat(locale.language === "ja" ? "ja-JP" : locale.language === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", weekday: "short", timeZone }).format(new Date());

  return (
    <SafeAreaView edges={["top"]} style={styles.page}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <UiText accessibilityRole="header" style={styles.title}>{copy.nav.task}</UiText>
          <UiText style={styles.subtitle}>{today}</UiText>
        </View>
        {addLabel ? <IconButton icon="plus" accessibilityLabel={addLabel} onPress={add} disabled={addDisabled} /> : <View style={styles.headerSpacer} />}
      </View>
      <SwipeSegments
        segments={segments}
        value={segment}
        onChange={choose}
        accessibilityLabel={copy.nav.task}
        renderPage={(key) => visited.has(key)
          ? <AppScreenEmbeddingProvider segment={key}>{TASK_SLOTS[key]({ quickAdd, revision, onCreated })}</AppScreenEmbeddingProvider>
          : null}
      />
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

function PlanSlot() {
  const locale = useOrbitLocale();
  const copy = useStandardCopy();
  const toast = useToast();
  const { styles } = useStyles();
  // R25 fills this slot; until then the action says it is coming soon.
  return (
    <View style={styles.plan}>
      <EmptyState
        title={locale.t("shell.task.planEmptyTitle")}
        message={locale.t("shell.task.planEmptyBody")}
        action={{ label: locale.t("shell.task.planEmptyAction"), onPress: () => toast.info(copy.homeEdit.comingSoon) }}
      />
    </View>
  );
}

function MemoSlot() {
  const focused = useIsFocused();
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const actorId = auth.actorId ?? "";
  const enabled = focused && auth.ready && auth.signedIn && server.ready && Boolean(actorId);
  const sequence = useRef(0);
  const scope = useMemo(() => ({ key: String(++sequence.current), enabled }), [enabled, actorId, auth.cookieHeader, server.baseUrl]);
  return enabled ? <NotesScreen key={scope.key} actorId={actorId} scopeKey={scope.key} /> : null;
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 },
  titleBlock: { flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 26, lineHeight: 32, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: colors.ink3Text, fontSize: 13, lineHeight: 18 },
  headerSpacer: { width: 40, height: 40 },
  plan: { paddingHorizontal: 16, paddingTop: 12 },
}));
