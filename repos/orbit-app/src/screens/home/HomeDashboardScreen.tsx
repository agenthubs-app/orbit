import { Ionicons } from "@expo/vector-icons";
import { type Href, useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, AppState, Image, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { useOrbitApiBaseUrl } from "../../api/ApiBaseUrlProvider";
import { useOrbitAuthSession } from "../../api/AuthSessionProvider";
import { ORBIT_API_ENDPOINTS, taskPath, tasksPath } from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { LoadingState } from "../../components/LoadingState";
import { OrbitNavigationIcon } from "../../components/OrbitNavigationIcon";
import { createThemedStyles } from "../../design/theme";
import { layout } from "../../design/tokens";
import { useRelationshipInboxBadgeCount } from "../../hooks/useRelationshipInboxBadgeCount";
import { useHomeDashboardClient } from "../../hooks/useHomeDashboardClient";
import { contactAvatarFor } from "../../view-models/contacts";
import { homeDateView, homeFollowupsToView, homeScheduleToView, homeTasksToView } from "../../view-models/home-dashboard";

type Section = "schedule" | "tasks" | "followups";
type Resource = { kind: "loading" } | { kind: "ready"; data: unknown } | { kind: "error"; message: string };
type Resources = Record<Section, Resource>;
type Scope = { key: number; ready: boolean; baseUrl: string; client: ReturnType<typeof useHomeDashboardClient> };
const paths: Record<Section, string> = { schedule: ORBIT_API_ENDPOINTS.scheduleItems, tasks: tasksPath("open"), followups: ORBIT_API_ENDPOINTS.contacts };
const sections: Section[] = ["schedule", "tasks", "followups"];
const loading = (): Resources => ({ schedule: { kind: "loading" }, tasks: { kind: "loading" }, followups: { kind: "loading" } });
const invalidData = "返回的数据不完整，请重新读取。";
const homeFont = Platform.select({
  web: '-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",sans-serif',
  ios: "System",
  default: "sans-serif",
});
const quickActions = [
  { label: "扫名片", href: "/contacts/new", icon: "scan" },
  { label: "查看日程", href: "/schedule", icon: "calendar" },
  { label: "新建待办", href: "/today", icon: "task" },
  { label: "联系跟进", href: "/followups", icon: "contacts" },
] as const;

export function HomeDashboardScreen() {
  const auth = useOrbitAuthSession();
  const server = useOrbitApiBaseUrl();
  const client = useHomeDashboardClient();
  const actor = auth.user?.id ?? "";
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(actor);
  const sequence = useRef(0);
  const scope = useMemo<Scope>(() => ({
    key: ++sequence.current, ready, baseUrl: server.baseUrl, client,
  }), [ready, actor, server.baseUrl, auth.cookieHeader, client]);
  const latest = useRef(scope);
  latest.current = scope;
  const current = useCallback(() => latest.current === scope && scope.ready, [scope]);
  return scope.ready ? <HomeDashboard key={scope.key} scope={scope} current={current} />
    : <AppScreen title="首页"><LoadingState /></AppScreen>;
}

function HomeDashboard({ scope, current }: { scope: Scope; current: () => boolean }) {
  const router = useRouter();
  const { colors, styles } = useStyles();
  const { width, fontScale } = useWindowDimensions();
  const avatarScope = useId().replace(/:/gu, "");
  const singleColumn = fontScale >= 1.15 || width < 360;
  const wideQuickActions = fontScale >= 1.5 || width < 360;
  const [active, setActive] = useState(false);
  const [query, setQuery] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<string>();
  const date = homeDateView(now, selected);
  const selectedDate = useRef(date.selectedDateKey);
  selectedDate.current = date.selectedDateKey;
  const [resources, setResources] = useState<Resources>(loading);
  const [mutationError, setMutationError] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const runtime = useRef({
    alive: true, focused: false, foreground: AppState.currentState === "active", generation: 0,
    mutating: false, writeSequence: 0, reading: new Set<Section>(), resources: loading(),
    controllers: new Set<AbortController>(),
  });
  const isCurrent = useCallback(() => {
    const r = runtime.current;
    return r.alive && r.focused && r.foreground && current();
  }, [current]);
  const put = useCallback((section: Section, resource: Resource) => {
    runtime.current.resources = { ...runtime.current.resources, [section]: resource };
    setResources(runtime.current.resources);
  }, []);
  const invalidate = useCallback(() => {
    const r = runtime.current;
    r.generation++;
    r.controllers.forEach(controller => controller.abort()); r.controllers.clear();
    r.reading.clear(); r.mutating = false; r.resources = loading();
    setResources(r.resources); setUpdatingId(null); setMutationError("");
  }, []);
  const capture = useCallback(() => {
    const r = runtime.current;
    const generation = r.generation;
    const controller = new AbortController();
    r.controllers.add(controller);
    return {
      signal: controller.signal,
      valid: () => isCurrent() && runtime.current.generation === generation && !controller.signal.aborted,
      release: () => runtime.current.controllers.delete(controller),
    };
  }, [isCurrent]);
  const read = useCallback(async (section: Section) => {
    const r = runtime.current;
    if (!isCurrent() || r.reading.has(section) || (section === "tasks" && r.mutating)) return;
    r.reading.add(section); put(section, { kind: "loading" });
    const ticket = capture();
    try {
      const result = await scope.client.get<unknown>(paths[section], { signal: ticket.signal });
      if (!ticket.valid()) return;
      const time = new Date();
      const accepted = result.success && result.status >= 200 && result.status < 300;
      const data = accepted ? (section === "tasks" ? homeTasksToView(result.data, selectedDate.current, time)
        : section === "schedule" ? homeScheduleToView(result.data, selectedDate.current, time) : homeFollowupsToView(result.data)) : null;
      put(section, accepted && data !== null ? { kind: "ready", data: result.data }
        : { kind: "error", message: result.success ? invalidData : result.error.message });
    } finally {
      if (ticket.valid()) r.reading.delete(section);
      ticket.release();
    }
  }, [capture, isCurrent, put, scope]);
  const refresh = useCallback(() => {
    if (!isCurrent()) return;
    invalidate(); setNow(new Date());
    sections.forEach(section => { void read(section); });
  }, [invalidate, isCurrent, read]);
  useFocusEffect(useCallback(() => {
    const r = runtime.current; r.alive = true; r.focused = true; setActive(r.foreground);
    refresh();
    return () => { r.focused = false; setActive(false); invalidate(); };
  }, [invalidate, refresh]));
  useEffect(() => {
    const r = runtime.current; r.alive = true;
    const listener = AppState.addEventListener("change", state => {
      r.foreground = state === "active";
      setActive(r.foreground && r.focused);
      if (r.foreground) refresh(); else invalidate();
    });
    const timer = setInterval(() => { if (isCurrent()) setNow(new Date()); }, 60_000);
    return () => { r.alive = false; invalidate(); listener.remove(); clearInterval(timer); };
  }, [invalidate, isCurrent, refresh]);

  async function complete(id: string) {
    const r = runtime.current;
    const resource = r.resources.tasks;
    if (!isCurrent() || r.mutating || resource.kind !== "ready" ||
      !homeTasksToView(resource.data, selectedDate.current, new Date())?.some(task => task.id === id)) return;
    r.mutating = true; setUpdatingId(id); setMutationError("");
    const ticket = capture();
    try {
      const result = await scope.client.patch<unknown>(taskPath(id), {
        signal: ticket.signal,
        body: { action: "complete", idempotencyKey: "ios:home:complete:" + id + ":" + Date.now() + ":" + ++r.writeSequence },
      });
      if (!ticket.valid()) return;
      r.mutating = false; setUpdatingId(null);
      const task = result.success && typeof result.data === "object" && result.data !== null && "task" in result.data ? result.data.task : null;
      if (result.success && result.status >= 200 && result.status < 300 && typeof task === "object" && task !== null && "id" in task && task.id === id && "status" in task && task.status === "completed") {
        // The row is removed only by a subsequent server read, not by an
        // optimistic checkbox or a generic HTTP 200 response.
        void read("tasks");
      } else setMutationError(result.success ? "未能确认待办已完成，请重新读取后再试。" : result.error.message);
    } finally { ticket.release(); }
  }
  function navigate(href: string) { if (isCurrent()) router.push(href as Href); }
  const schedules = resources.schedule.kind === "ready" ? homeScheduleToView(resources.schedule.data, date.selectedDateKey, now) : null;
  const tasks = resources.tasks.kind === "ready" ? homeTasksToView(resources.tasks.data, date.selectedDateKey, now) : null;
  const followups = resources.followups.kind === "ready" ? homeFollowupsToView(resources.followups.data) : null;
  const highlightedSchedule = schedules?.find(item => item.state === "ongoing") ?? schedules?.find(item => item.state === "upcoming");

  function sectionBody(section: Section, label: string, content: ReactNode) {
    const state = resources[section];
    if (state.kind === "loading") return <View accessibilityRole="progressbar" accessibilityLabel={"正在读取" + label} style={styles.skeleton}>
      {(section === "tasks" ? [0, 1, 2] : [0, 1]).map(index => <View key={index} importantForAccessibility="no-hide-descendants" aria-hidden style={styles.skeletonRow}>
        <View style={section === "tasks" ? styles.skeletonCheckbox : section === "schedule" ? styles.skeletonMarker : styles.skeletonAvatar} />
        <View style={styles.skeletonContent}>
          {section !== "tasks" ? <View style={styles.skeletonShort} /> : null}
          <View style={[styles.skeletonLine, section === "tasks" && styles.skeletonTaskLine]} />
          {section === "schedule" ? <View style={styles.skeletonDetail} /> : null}
        </View>
      </View>)}
    </View>;
    if (state.kind === "error") return <View style={styles.errorGroup}>
      <Text accessibilityRole="alert" style={styles.error}>{state.message}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={"重试" + label} onPress={() => { void read(section); }} style={styles.retry}>
        <Text style={styles.link}>重新读取</Text>
      </Pressable>
    </View>;
    return content;
  }
  function sectionHeading(title: string, count: number | undefined, href: string, label: string, pending: boolean) {
    return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => navigate(href)} style={styles.sectionHeading}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionAction}>{pending ? <View aria-hidden importantForAccessibility="no-hide-descendants" style={styles.skeletonCount} /> : <>
        {count !== undefined ? <Text style={styles.count}>{count}</Text> : null}<Ionicons name="chevron-forward" size={9} color={colors.accent} />
      </>}
      </View>
    </Pressable>;
  }
  return <AppScreen title="首页" refreshControl={<RefreshControl onRefresh={refresh} refreshing={sections.some(section => resources[section].kind === "loading")} tintColor={colors.accent} />}
    header={<View style={[styles.header, singleColumn && styles.headerWrap]}>
      <Text style={styles.brand}>Orbit<Text style={styles.signal}>.</Text></Text>
      <View style={[styles.search, singleColumn && styles.largeHeaderControl]}>
        <View pointerEvents="none" style={styles.searchSurface} />
        <HomeIcon name="search" color={colors.text3} size={16} />
        <TextInput accessibilityLabel="搜索人脉" placeholder="搜索人脉" placeholderTextColor={colors.text3}
          value={query} onChangeText={setQuery} onSubmitEditing={() => { const value = query.trim(); if (value) navigate("/contacts/list?q=" + encodeURIComponent(value)); }}
          returnKeyType="search" style={styles.searchInput} />
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="收件箱" onPress={() => navigate("/inbox")} style={[styles.inbox, singleColumn && styles.largeHeaderControl]}>
        <View pointerEvents="none" style={styles.inboxSurface} />
        <HomeIcon name="inbox" color={colors.ink} size={18} />
        {active ? <HomeInboxBadge scopeKey={String(scope.key)} /> : null}
      </Pressable>
    </View>}>
    <View style={styles.dateRow}>
      <Text accessibilityRole="header" style={styles.date}>{date.dateLabel}</Text>
      {resources.schedule.kind === "loading" && resources.tasks.kind === "loading" ?
        <View testID="home-summary-loading" aria-hidden importantForAccessibility="no-hide-descendants" style={styles.summarySkeleton} /> :
        <Text style={styles.dateSummary}>{[date.weekdayLabel, ...(schedules ? [schedules.length + " 项日程"] : []), ...(tasks ? [tasks.length + " 项待办"] : [])].join(" · ")}</Text>}
    </View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.weekScroll} contentContainerStyle={styles.week}>
      {date.week.map(day => <Pressable key={day.dateKey} accessibilityRole="button" accessibilityLabel={day.dateKey + " " + day.weekdayLabel}
        accessibilityState={{ selected: day.isSelected }} aria-selected={day.isSelected}
        onPress={() => { if (isCurrent()) setSelected(day.isToday ? undefined : day.dateKey); }}
        style={[styles.day, day.isSelected && styles.selectedDay]}>
        <Text style={styles.weekday}>{day.weekdayLabel}</Text>
        <Text style={[styles.dayNumber, day.isSelected && styles.signal]}>{day.dayNumber}</Text>
      </Pressable>)}
    </ScrollView>
    <View style={[styles.quickActions, wideQuickActions && styles.quickActionsWrap]}>
      {quickActions.map(action => <Pressable key={action.href} accessibilityRole="button" accessibilityLabel={action.label}
        onPress={() => navigate(action.href)} style={[styles.quickAction, wideQuickActions && styles.quickActionWide]}>
        <HomeIcon name={action.icon} size={singleColumn ? 24 : 22} color={colors.ink} /><Text style={styles.quickLabel}>{action.label}</Text>
      </Pressable>)}
    </View>
    <View testID="home-day-sections" style={[styles.daySections, singleColumn && styles.singleColumn, singleColumn && styles.largeSections]}>
      <View style={[styles.scheduleColumn, singleColumn && styles.fullSchedule]}>
        {sectionHeading(date.isToday ? "今天" : "日程", schedules?.length, "/schedule", "全部日程", resources.schedule.kind === "loading")}
        {sectionBody("schedule", "日程", schedules?.length ? schedules.map(item =>
          <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={"查看日程：" + item.title} onPress={() => navigate(item.href)} style={[styles.scheduleRow, singleColumn && styles.largeScheduleRow]}>
            <View style={[styles.scheduleMarker, item.id !== highlightedSchedule?.id && styles.endedMarker]} />
            <View style={styles.rowContent}>
              <Text style={styles.time}>{item.timeLabel}</Text><Text style={[styles.rowTitle, styles.scheduleTitle]}>{item.title}</Text>
              {item.detail ? <Text style={styles.detail}>{item.detail}</Text> : null}
            </View>
          </Pressable>) : <Text style={styles.empty}>当天没有日程</Text>)}
      </View>
      <View style={[styles.taskColumn, singleColumn && styles.fullTasks]}>
        {sectionHeading("待办", tasks?.length, "/tasks", "全部待办", resources.tasks.kind === "loading")}
        {sectionBody("tasks", "待办", tasks?.length ? tasks.map(task => <View key={task.id} style={styles.taskRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={"完成待办：" + task.title}
            accessibilityState={{ disabled: updatingId !== null }} disabled={updatingId !== null}
            onPress={() => { void complete(task.id); }} style={styles.checkTarget}>
            {updatingId === task.id ? <ActivityIndicator size="small" color={colors.accent} /> : <View style={styles.checkbox} />}
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={"查看待办：" + task.title} onPress={() => navigate("/tasks/" + encodeURIComponent(task.id))} style={styles.taskContent}>
            <Text style={styles.rowTitle}>{task.title}</Text>
            <Text style={[styles.detail, task.dueTone === "danger" && styles.error]}>{[task.categoryLabel, task.dueLabel].filter(Boolean).join(" · ")}</Text>
          </Pressable>
        </View>) : <Text style={styles.empty}>当天没有待办</Text>)}
        {mutationError ? <Text accessibilityRole="alert" style={styles.error}>{mutationError}</Text> : null}
      </View>
    </View>
    <View style={styles.followups}>
      {sectionHeading("联系跟进", followups?.length, "/followups", "全部联系跟进", resources.followups.kind === "loading")}
      {sectionBody("followups", "联系跟进", followups?.length ? <View style={styles.people}>
        {followups.map((contact, index) => {
          const avatar = contactAvatarFor(contact);
          // Source 1c avatar colors and 135-degree stops. The existing ID-based
          // tone selection remains stable; sample names do not dictate colors.
          const tones = { sky: ["#7FB3FF", "#3B82F6"], emerald: ["#5EEAD4", "#0EA5E9"], amber: ["#FCD34D", "#F59E0B"], violet: ["#A78BFA", "#6366F1"], rose: ["#FDA4AF", "#F472B6"] } as const;
          const gradientId = "home-avatar-" + avatarScope + "-" + index;
          const uri = contact.imageUrl ? (/^https?:\/\//iu.test(contact.imageUrl) ? contact.imageUrl : scope.baseUrl.replace(/\/+$/u, "") + "/" + contact.imageUrl.replace(/^\/+/u, "")) : undefined;
          return <Pressable key={contact.id} accessibilityRole="button" accessibilityLabel={"查看人脉：" + contact.name}
            onPress={() => navigate("/contacts/" + encodeURIComponent(contact.id))}
            style={[styles.person, { width: (Math.min(width, layout.contentMax) - 2 * layout.pageInset - 16) / 2 }, singleColumn && styles.fullPerson]}>
            <View style={styles.avatar}>
              {uri ? <Image accessible={false} source={{ uri }} style={styles.avatarImage} /> : <>
                <Svg accessible={false} style={StyleSheet.absoluteFill} width={36} height={36} viewBox="0 0 36 36">
                  <Defs><LinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor={tones[avatar.tone][0]} /><Stop offset="100%" stopColor={tones[avatar.tone][1]} />
                  </LinearGradient></Defs>
                  <Circle cx={18} cy={18} r={18} fill={"url(#" + gradientId + ")"} />
                </Svg>
                <Text style={styles.initial}>{avatar.initial}</Text>
              </>}
            </View>
            <View style={styles.rowContent}><Text style={styles.personName}>{contact.name}</Text>{contact.role ? <Text style={styles.detail}>{contact.role}</Text> : null}</View>
            <Ionicons name="chevron-forward" size={12} color={colors.text4} />
          </Pressable>;
        })}
      </View> : <Text style={styles.empty}>暂无需要联系的人脉</Text>)}
    </View>
  </AppScreen>;
}

function HomeInboxBadge({ scopeKey }: { scopeKey: string }) {
  const { styles } = useStyles();
  const count = useRelationshipInboxBadgeCount(scopeKey);
  return count === undefined ? null : <View testID="home-inbox-badge" style={styles.badge}><Text style={styles.badgeText}>{count}</Text></View>;
}

function HomeIcon({ name, size, color }: { name: "search" | "inbox" | "scan" | "calendar" | "task" | "contacts"; size: number; color: string }) {
  if (name === "contacts") return <OrbitNavigationIcon name="contacts" size={size} color={color} />;
  // Exact source geometry from 1c-首页. Calendar reuses the source's existing
  // calendar outline without the creation mark because this opens the calendar.
  return <Svg accessible={false} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={name === "search" ? 2 : name === "inbox" ? 1.8 : 1.6} strokeLinecap="round" strokeLinejoin="round">
    {name === "search" ? <><Circle cx={11} cy={11} r={7} /><Path d="M20 20l-3.5-3.5" /></> : null}
    {name === "inbox" ? <><Rect x={3} y={5} width={18} height={14} rx={3} /><Path d="M3 8l9 6 9-6" /></> : null}
    {name === "scan" ? <Path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M3 12h18" /> : null}
    {name === "calendar" ? <><Rect x={3} y={5} width={18} height={16} rx={3} /><Path d="M3 10h18M8 3v4M16 3v4" /></> : null}
    {name === "task" ? <><Rect x={4} y={4} width={16} height={16} rx={4} /><Path d="M8 12l3 3 5-6" /></> : null}
  </Svg>;
}

const useStyles = createThemedStyles(colors => StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: -9 },
  headerWrap: { flexWrap: "wrap" },
  brand: { color: colors.ink, fontFamily: homeFont, fontSize: 19, fontWeight: "900", letterSpacing: -0.38 },
  signal: { color: colors.accent },
  search: { flex: 1, minWidth: 110, minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12 },
  searchSurface: { position: "absolute", zIndex: -1, top: 3, bottom: 3, left: 0, right: 0, borderRadius: 10, backgroundColor: colors.surface2 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, padding: 0, color: colors.ink, fontFamily: homeFont, fontSize: 14, lineHeight: 20 },
  largeHeaderControl: { minHeight: 50 },
  inbox: { width: 44, minHeight: 44, marginHorizontal: -3, alignItems: "center", justifyContent: "center" },
  inboxSurface: { position: "absolute", zIndex: -1, top: 3, bottom: 3, left: 3, right: 3, borderRadius: 10, borderWidth: 1, borderColor: colors.border },
  badge: { position: "absolute", top: 0, right: 0, minWidth: 16, minHeight: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.onAccent, fontFamily: homeFont, fontSize: 10, fontWeight: "700" },
  dateRow: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", columnGap: 10, rowGap: 4 },
  date: { fontFamily: homeFont, fontSize: 34, lineHeight: 34, fontWeight: "800", letterSpacing: -1.02, color: colors.ink },
  dateSummary: { flexShrink: 1, fontFamily: homeFont, fontSize: 14, lineHeight: 22, color: colors.text3 },
  summarySkeleton: { width: 140, height: 12, borderRadius: 4, backgroundColor: colors.surface2, alignSelf: "flex-end", marginBottom: 4 },
  weekScroll: { marginTop: -6 },
  week: { flexGrow: 1 },
  day: { flex: 1, minWidth: 44, minHeight: 48, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 6, borderBottomWidth: 2, borderBottomColor: colors.border },
  selectedDay: { borderBottomColor: colors.accent },
  weekday: { fontFamily: homeFont, fontSize: 11, color: colors.text3 },
  dayNumber: { fontFamily: homeFont, fontSize: 15, fontWeight: "700", color: colors.ink },
  quickActions: { flexDirection: "row", marginTop: -2, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  quickActionsWrap: { flexWrap: "wrap", rowGap: 12 },
  quickAction: { flex: 1, minHeight: 44, alignItems: "center", justifyContent: "center", gap: 6 },
  quickActionWide: { flexBasis: "50%", flexGrow: 0, flexShrink: 0 },
  quickLabel: { color: colors.ink, fontFamily: homeFont, fontSize: 12, lineHeight: 16, textAlign: "center" },
  daySections: { flexDirection: "row" },
  singleColumn: { flexDirection: "column", gap: 16 },
  largeSections: { marginTop: 8 },
  scheduleColumn: { flex: 1, minWidth: 0, paddingRight: 14, borderRightWidth: 1, borderRightColor: colors.border },
  taskColumn: { flex: 1, minWidth: 0, paddingLeft: 14 },
  fullSchedule: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", paddingRight: 0, borderRightWidth: 0 },
  fullTasks: { flexGrow: 0, flexShrink: 0, flexBasis: "auto", paddingLeft: 0, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  sectionHeading: { minHeight: 44, marginTop: -16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sectionTitle: { flexShrink: 1, color: colors.ink, fontFamily: homeFont, fontSize: 15, lineHeight: 22, fontWeight: "800" },
  sectionAction: { flexDirection: "row", alignItems: "center", gap: 2 },
  count: { color: colors.accent, fontFamily: homeFont, fontSize: 12, fontWeight: "700" },
  scheduleRow: { minHeight: 44, paddingTop: 6, paddingBottom: 10, flexDirection: "row", gap: 10 },
  largeScheduleRow: { paddingTop: 10, gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border2 },
  scheduleMarker: { width: 3, borderRadius: 2, backgroundColor: colors.accent },
  endedMarker: { opacity: 0.4 },
  rowContent: { flex: 1, minWidth: 0, gap: 2 },
  time: { color: colors.ink, fontFamily: homeFont, fontSize: 15, fontWeight: "800", letterSpacing: -0.15 },
  rowTitle: { color: colors.ink, fontFamily: homeFont, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  scheduleTitle: { fontWeight: "400" },
  detail: { color: colors.text3, fontFamily: homeFont, fontSize: 11, lineHeight: 16 },
  taskRow: { flexDirection: "row", alignItems: "flex-start", minHeight: 44, borderBottomWidth: 1, borderBottomColor: colors.border2 },
  checkTarget: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", marginLeft: -10 },
  checkbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: colors.ink },
  taskContent: { flex: 1, minWidth: 44, minHeight: 44, justifyContent: "center", paddingVertical: 7 },
  followups: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  people: { flexDirection: "row", flexWrap: "wrap", columnGap: 16 },
  person: { minHeight: 54, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border2 },
  fullPerson: { width: "100%" },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImage: { width: 36, height: 36 },
  initial: { color: "#FFFFFF", fontFamily: homeFont, fontSize: 14, fontWeight: "700" },
  personName: { color: colors.ink, fontFamily: homeFont, fontSize: 14, lineHeight: 18, fontWeight: "600" },
  empty: { color: colors.text3, fontFamily: homeFont, fontSize: 13, lineHeight: 20, paddingVertical: 12 },
  errorGroup: { gap: 4 },
  error: { color: colors.rose, fontFamily: homeFont, fontSize: 12, lineHeight: 18 },
  retry: { minHeight: 44, alignSelf: "flex-start", justifyContent: "center", paddingRight: 12 },
  link: { color: colors.accent, fontFamily: homeFont, fontSize: 13, fontWeight: "600" },
  skeleton: { gap: 14, paddingVertical: 8 },
  skeletonRow: { flexDirection: "row", gap: 10 },
  skeletonContent: { flex: 1, gap: 6 },
  skeletonMarker: { width: 3, borderRadius: 2, backgroundColor: colors.border },
  skeletonCheckbox: { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border },
  skeletonAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2 },
  skeletonCount: { width: 20, height: 10, borderRadius: 3, backgroundColor: colors.surface2 },
  skeletonShort: { width: 50, height: 12, borderRadius: 3, backgroundColor: colors.surface2 },
  skeletonLine: { width: "100%", height: 10, borderRadius: 3, backgroundColor: colors.surface2 },
  skeletonTaskLine: { marginTop: 3 },
  skeletonDetail: { width: "70%", height: 8, borderRadius: 3, backgroundColor: colors.surface2 },
}));
