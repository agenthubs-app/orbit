/**
 * Sprint 0107: App event live page `/events/[id]/live` (web `/app/events/[id]/live`).
 * Design: docs/designs/2026-09-27-app-onboarding-live (LiveHome/Rec/All/Group/Agenda/Denied).
 * Data: the registered attendee workspace `GET /api/events/:id/operations` through the
 * existing attendee controller (check-in, exchange commands, receipt checks, reread),
 * plus the public event detail for the title and the organizer-published agenda.
 * Replaces the former AttendeeOperationsScreen and PartyModeScreen.
 */
import { Ionicons } from "@expo/vector-icons";
import { type Href, useIsFocused, useLocalSearchParams, usePathname, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Line } from "react-native-svg";
import { useOrbitAuthSession } from "../../../api/AuthSessionProvider";
import { useOrbitApiBaseUrl } from "../../../api/ApiBaseUrlProvider";
import type { AttendeeWorkspace } from "../../../api/event-attendee-operations";
import { publicEventDetailSchema } from "../../../api/event-detail-contract";
import { publicEventDetailPath } from "../../../api/endpoints";
import { validateApiResourceState } from "../../../api/validated-resource-state";
import { createControlStyles } from "../../../design/controls";
import { layout, radius, rowRoleStyles, spacing } from "../../../design/tokens";
import { createThemedStyles } from "../../../design/theme";
import { useApiResource } from "../../../hooks/useApiResource";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { useOrbitTimeZone } from "../../../time/OrbitTimeZoneProvider";
import { createAttendeeController, type AttendeeState } from "../../../view-models/event-attendee-controller";
import {
  LIVE_TABS, agendaItems, agendaStatuses, currentPlacement, exchangeState, graphRing, initialFor, liveTabFrom,
  otherAttendees, personRole, placements, recommendedPeople, type LiveTab, type Placement
} from "../../../view-models/event-live";
import { liveCopy, type LiveCopy } from "./live-copy";
import { LivePersonSheet } from "./LivePersonSheet";
import { liveFont } from "./live-theme";

const HOME_RECS = 3;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export function formatClock(iso: string, timeZone: string): string {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(ms)) : "—";
}

export function EventLiveScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; tab?: string | string[]; participant?: string | string[] }>();
  const eventId = first(params.id);
  const path = usePathname(); const router = useRouter(); const isFocused = useIsFocused();
  const auth = useOrbitAuthSession(); const server = useOrbitApiBaseUrl(); const locale = useOrbitLocale();
  const { timeZone } = useOrbitTimeZone();
  const c = liveCopy[locale.language];
  const { styles, colors } = useStyles();
  // Expo may expose a decoded pathname while params are already decoded once.
  const focused = path === `/events/${encodeURIComponent(eventId)}/live` || path === `/events/${eventId}/live`;
  const ready = auth.ready && auth.signedIn && server.ready && Boolean(auth.actorId && auth.user?.id && eventId) && focused && isFocused;
  const scopeKey = JSON.stringify([auth.actorId, auth.user?.id, auth.cookieHeader, server.baseUrl, eventId, ready]);
  const client = useOrbitApiClient({ scopeKey });
  const scope = useMemo(() => ({ scopeKey }), [scopeKey]);
  const latest = useRef(scope); latest.current = scope;
  const mounted = useRef(true);
  const current = () => mounted.current && latest.current === scope && ready;
  const controller = useMemo(() => createAttendeeController({ client, eventId, participantId: null, operationsActorId: auth.actorId ?? "", isCurrent: () => mounted.current && latest.current === scope && ready }), [client, scope]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const detailRaw = useApiResource<unknown>(publicEventDetailPath(eventId), () => false, { scopeKey: JSON.stringify(["event-live-detail", scopeKey]) });
  const detail = validateApiResourceState(detailRaw, publicEventDetailSchema);
  const event = detail.kind === "success" || detail.kind === "empty" ? detail.data.event : null;
  const [tab, setTab] = useState<LiveTab>(() => liveTabFrom(params.tab));
  const [selected, setSelected] = useState<string | null>(() => first(params.participant) || null);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { mounted.current = true; controller.activate(); void controller.load(); return () => { mounted.current = false; controller.dispose(); }; }, [controller]);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  if (!ready) return null;
  const w = state.workspace;
  const denied = !w && (state.errorStatus === 403 || state.errorStatus === 404);
  const offline = state.errorStatus === 0;
  const open = (id: string) => { if (current() && w?.directory.some(p => p.participantId === id && id !== w.me.participantId)) setSelected(id); };
  const goBack = () => { if (!current()) return; if (router.canGoBack()) router.back(); else router.replace(`/events/${encodeURIComponent(eventId)}` as Href); };

  return <SafeAreaView edges={["top"]} style={styles.safe}>
    <View style={styles.header}>
      <View style={styles.headerRow}>
        <Pressable accessibilityRole="link" accessibilityLabel={c.back} onPress={goBack} style={styles.back}>
          <Ionicons name="chevron-back" size={20} color={colors.accent} /><Text style={styles.backText}>{c.back}</Text>
        </Pressable>
        {!denied ? <View style={styles.liveMark}><View style={styles.liveDot} /><Text style={styles.liveMarkText}>{c.live}</Text></View> : null}
      </View>
      {!denied ? <>
        <Text accessibilityRole="header" style={styles.title}>{event?.title ?? c.fallbackTitle}</Text>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {LIVE_TABS.map(key => <Pressable key={key} accessibilityRole="tab" accessibilityLabel={c.tabs[key]} accessibilityState={{ selected: tab === key }} aria-selected={tab === key} onPress={() => setTab(key)} style={styles.tab}>
            <View style={[styles.tabLabel, tab === key && styles.tabSelected]}><Text style={[styles.tabText, tab === key && styles.tabTextSelected]}>{c.tabs[key]}</Text></View>
          </Pressable>)}
        </View>
      </> : null}
    </View>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"
      refreshControl={denied ? undefined : <RefreshControl refreshing={false} onRefresh={() => { if (current()) { void controller.load(); detail.refresh(); } }} tintColor={colors.accent} />}>
      {offline ? <Text accessibilityRole="alert" style={styles.offline}>{c.offline}</Text> : null}
      {denied ? <LiveDeniedView c={c} message={state.error} onEvent={() => { if (current()) router.replace(`/events/${encodeURIComponent(eventId)}` as Href); }} /> : null}
      {!denied && state.error && !offline ? <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text> : null}
      {!denied && !w && !state.loading ? <Pressable accessibilityRole="button" accessibilityLabel={c.retry} onPress={() => { if (current()) void controller.load(); }} style={styles.secondary}><Text style={styles.secondaryText}>{c.retry}</Text></Pressable> : null}
      {state.loading && !w ? <Text style={styles.muted}>{c.loading}</Text> : null}
      {state.busy ? <Text style={styles.muted}>{c.busy}</Text> : null}
      {w ? <>
        {tab === "home" ? <HomeTab c={c} state={state} w={w} now={now} timeZone={timeZone} onCheckIn={() => { if (current()) void controller.act("check-in"); }} onOpen={open} go={setTab} /> : null}
        {tab === "rec" ? <RecTab c={c} w={w} onOpen={open} /> : null}
        {tab === "all" ? <AllTab c={c} w={w} onOpen={open} /> : null}
        {tab === "group" ? <GroupTab c={c} w={w} now={now} onOpen={open} /> : null}
        {tab === "agenda" ? <AgendaTab c={c} w={w} now={now} timeZone={timeZone} published={event?.agenda ?? []} onOpen={open} /> : null}
      </> : null}
    </ScrollView>
    {w && selected ? <LivePersonSheet key={selected} eventId={eventId} participantId={selected} workspace={w} venue={event?.venue ?? event?.location ?? ""} now={now}
      onClose={changed => { setSelected(null); if (changed && current()) void controller.load(); }}
      onContact={id => { setSelected(null); if (current()) router.push(`/contacts/${encodeURIComponent(id)}` as Href); }} /> : null}
  </SafeAreaView>;
}

function LiveDeniedView({ c, message, onEvent }: { c: LiveCopy; message: string | null; onEvent: () => void }) {
  const { styles, colors } = useStyles();
  return <View style={styles.denied}>
    <View style={styles.iconRing}><Ionicons name="lock-closed-outline" size={24} color={colors.ink} /></View>
    <Text accessibilityRole="header" style={styles.stateTitle}>{c.deniedTitle}</Text>
    <Text style={styles.stateBody}>{c.deniedBody}</Text>
    {message ? <Text accessibilityRole="alert" style={styles.caption}>{message}</Text> : null}
    <Pressable accessibilityRole="button" accessibilityLabel={c.deniedAction} onPress={onEvent} style={[styles.primary, styles.stretch]}><Text style={styles.primaryText}>{c.deniedAction}</Text></Pressable>
  </View>;
}

function ResultsNotice({ c, w }: { c: LiveCopy; w: AttendeeWorkspace }) {
  const { styles } = useStyles();
  const copy = c.results[w.resultsState];
  const body = w.resultsState === "ready" && w.recommendations?.noMatchReason ? w.recommendations.noMatchReason : copy.body;
  return <View accessibilityRole="summary" style={styles.notice}><Text style={styles.noticeTitle}>{copy.title}</Text><Text style={styles.muted}>{body}</Text></View>;
}

function Avatar({ name, size }: { name: string; size: 36 | 40 | 44 | 56 }) {
  const { styles } = useStyles();
  return <View style={[styles.avatar, { width: size, height: size }]}><Text style={[styles.avatarText, { fontSize: size >= 56 ? 20 : size >= 44 ? 16 : size >= 40 ? 15 : 14 }]}>{initialFor(name)}</Text></View>;
}

function PersonRow({ person, onPress, trailing, size = 40, minHeight = 64, divider = true }: { person: AttendeeWorkspace["directory"][number]; onPress: () => void; trailing?: ReactNode; size?: 36 | 40 | 44; minHeight?: number; divider?: boolean }) {
  const { styles } = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={person.displayName} onPress={onPress} style={[styles.personRow, { minHeight }, !divider && styles.noDivider]}>
    <Avatar name={person.displayName} size={size} />
    <View style={styles.personCopy}><Text style={styles.personName}>{person.displayName}</Text>{personRole(person) ? <Text style={styles.personRole}>{personRole(person)}</Text> : null}</View>
    {trailing}
  </Pressable>;
}

function BigTable({ c, placement, detail }: { c: LiveCopy; placement: Placement; detail: string }) {
  const { styles } = useStyles();
  return <View style={styles.bigRow}><Text style={styles.big}>{c.table(placement.table.tableNumber)}</Text><Text style={styles.bigDetail}>{detail}</Text></View>;
}

function HomeTab({ c, state, w, now, timeZone, onCheckIn, onOpen, go }: { c: LiveCopy; state: AttendeeState; w: AttendeeWorkspace; now: number; timeZone: string; onCheckIn: () => void; onOpen: (id: string) => void; go: (tab: LiveTab) => void }) {
  const { styles, colors } = useStyles();
  const placement = currentPlacement(w, now);
  const recs = recommendedPeople(w).slice(0, HOME_RECS);
  const ring = graphRing(w);
  return <View style={styles.section20}>
    <View style={styles.gap4}>
      <Text style={styles.groupHeading}>{c.position}</Text>
      {placement ? <BigTable c={c} placement={placement} detail={`${c.round(placement.round)} · ${c.people(placement.members.length + 1)}`} />
        : w.resultsState === "ready" ? <Text style={styles.muted}>{c.noTable}</Text> : <ResultsNotice c={c} w={w} />}
      {w.checkIn ? <View style={styles.checked} accessibilityRole="summary">
        <Ionicons name="checkmark" size={18} color={colors.live} /><Text style={styles.checkedText}>{c.checkedIn}</Text>
        <Text style={styles.muted}>{c.checkedInAt(formatClock(w.checkIn.checkedInAt, timeZone))}</Text>
      </View> : w.checkInAvailable
        ? <Pressable accessibilityRole="button" accessibilityLabel={c.checkIn} disabled={state.busy || state.loading} onPress={onCheckIn} style={[styles.primary, styles.top6, (state.busy || state.loading) && styles.disabled]}><Text style={styles.primaryText}>{state.busy ? c.checkingIn : c.checkIn}</Text></Pressable>
        : <View accessibilityRole="button" accessibilityState={{ disabled: true }} style={[styles.disabledButton, styles.top6]}><Text style={styles.disabledButtonText}>{c.checkInClosed}</Text></View>}
    </View>
    <View>
      <View style={styles.listHead}><Text style={styles.sectionTitle}>{c.forYou}</Text><Pressable accessibilityRole="link" onPress={() => go("rec")} hitSlop={8}><Text style={styles.link}>{c.all}</Text></Pressable></View>
      {recs.length ? recs.map(r => <PersonRow key={r.person.participantId} person={r.person} onPress={() => onOpen(r.person.participantId)} trailing={<Text style={styles.matchSmall}>{c.match(r.score)}</Text>} />)
        : <ResultsNotice c={c} w={w} />}
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel={c.graphRow} onPress={() => go("agenda")} style={styles.navRow}>
      <View style={styles.gap2}><Text style={styles.personName}>{c.graphRow}</Text><Text style={styles.personRole}>{c.graphSummary(ring.knownCount, ring.recommendedCount)}</Text></View>
      <Ionicons name="chevron-forward" size={18} color={colors.text4} />
    </Pressable>
  </View>;
}

function RecTab({ c, w, onOpen }: { c: LiveCopy; w: AttendeeWorkspace; onOpen: (id: string) => void }) {
  const { styles } = useStyles();
  const recs = recommendedPeople(w);
  return <View>
    <Text style={[styles.muted, styles.bottom6]}>{c.recIntro}</Text>
    {recs.length ? recs.map(r => {
      const exchange = exchangeState(w, r.person.participantId);
      const actionable = exchange.kind === "none" || exchange.kind === "withdrawn_outgoing" || exchange.kind === "incoming";
      return <View key={r.person.participantId} style={styles.recCard}>
        <PersonRow person={r.person} size={44} minHeight={44} divider={false} onPress={() => onOpen(r.person.participantId)} trailing={<Text style={styles.matchBig}>{c.match(r.score)}</Text>} />
        {r.reasons.length ? <Text style={styles.body}>{r.reasons.join(" ")}</Text> : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`${c.recAction[exchange.kind]} · ${r.person.displayName}`} onPress={() => onOpen(r.person.participantId)} style={actionable ? styles.secondary : styles.pending}>
          <Text style={actionable ? styles.secondaryText : styles.pendingText}>{c.recAction[exchange.kind]}</Text>
        </Pressable>
      </View>;
    }) : <ResultsNotice c={c} w={w} />}
  </View>;
}

function AllTab({ c, w, onOpen }: { c: LiveCopy; w: AttendeeWorkspace; onOpen: (id: string) => void }) {
  const { styles, colors } = useStyles();
  const [query, setQuery] = useState("");
  const people = otherAttendees(w, query);
  const total = otherAttendees(w, "").length;
  return <View style={styles.gap12}>
    <View style={styles.search}><Ionicons name="search" size={18} color={colors.text3} />
      <TextInput accessibilityLabel={c.searchLabel} placeholder={c.search} placeholderTextColor={colors.text3} value={query} onChangeText={setQuery} style={styles.searchInput} />
    </View>
    <View style={styles.countRow}><Text style={styles.groupHeading}>{c.allAttendees}</Text><Text style={styles.count}>{people.length}</Text></View>
    <View style={styles.topRule}>
      {people.map(person => {
        const known = exchangeState(w, person.participantId).kind === "accepted";
        return <PersonRow key={person.participantId} person={person} minHeight={62} onPress={() => onOpen(person.participantId)} trailing={known ? <Text style={styles.knownTag}>{c.cardState.accepted}</Text> : null} />;
      })}
      {!people.length ? <Text style={[styles.muted, styles.padV]}>{total ? c.noMatch : c.noOthers}</Text> : null}
    </View>
  </View>;
}

function GroupTab({ c, w, now, onOpen }: { c: LiveCopy; w: AttendeeWorkspace; now: number; onOpen: (id: string) => void }) {
  const { styles } = useStyles();
  const both = placements(w);
  const initial = currentPlacement(w, now);
  const [round, setRound] = useState<1 | 2 | null>(null);
  const shown = (round === 1 ? both.one : round === 2 ? both.two : null) ?? initial;
  if (!shown) return <ResultsNotice c={c} w={w} />;
  const isCurrent = shown.round === initial?.round;
  const prompts = shown.table.memberPrompts[w.me.participantId] ?? [];
  return <View style={styles.section20}>
    <View style={styles.gap6}>
      <View style={styles.listHeadPlain}>
        <Text style={styles.groupHeading}>{isCurrent ? c.currentGroup(shown.round) : c.otherGroup(shown.round)}</Text>
        {both.one && both.two ? <Pressable accessibilityRole="button" accessibilityLabel={c.switchRound} onPress={() => setRound(shown.round === 1 ? 2 : 1)} style={styles.linkButton}><Text style={styles.link}>{c.switchRound}</Text></Pressable> : null}
      </View>
      <BigTable c={c} placement={shown} detail={c.peopleWithMe(shown.members.length + 1)} />
      {shown.table.theme ? <Text style={styles.body}>{c.theme(shown.table.theme)}</Text> : null}
    </View>
    <View style={styles.topRule}>
      <InfoBlock title={c.whyTable} lines={[shown.myRationale, shown.table.rationale].filter(Boolean)} />
      {prompts.length ? <InfoBlock title={c.prompts} lines={prompts} /> : null}
      {shown.table.icebreakers.length ? <InfoBlock title={c.icebreakers} lines={shown.table.icebreakers} /> : null}
    </View>
    <View>
      <Text style={[styles.groupHeading, styles.bottom6]}>{c.tablemates}</Text>
      {shown.members.map(member => <PersonRow key={member.participantId} person={member} size={36} minHeight={56} onPress={() => onOpen(member.participantId)} />)}
    </View>
  </View>;
}

function InfoBlock({ title, lines }: { title: string; lines: readonly string[] }) {
  const { styles } = useStyles();
  return <View style={styles.infoBlock}><Text style={styles.sectionTitle}>{title}</Text>{lines.map((line, index) => <Text key={index} style={styles.body}>{line}</Text>)}</View>;
}

function AgendaTab({ c, w, now, timeZone, published, onOpen }: { c: LiveCopy; w: AttendeeWorkspace; now: number; timeZone: string; published: readonly { time: string; label?: string | undefined; title?: string | undefined; description?: string | undefined }[]; onOpen: (id: string) => void }) {
  const { styles, colors } = useStyles();
  const items = agendaItems(w);
  const statuses = agendaStatuses(items, now);
  const [width, setWidth] = useState(358);
  const ring = graphRing(w, 8, { width, height: 240 });
  return <View style={styles.section24}>
    {published.length ? <View style={styles.topRule}>
      {published.map((item, index) => <View key={index} style={styles.agendaRow}><Text style={styles.agendaTime}>{item.time}</Text><View style={styles.personCopy}><Text style={styles.personName}>{item.label ?? item.title}</Text>{item.description ? <Text style={styles.personRole}>{item.description}</Text> : null}</View></View>)}
    </View> : <View style={styles.emptyState}>
      <View style={styles.iconRing}><Ionicons name="calendar-outline" size={24} color={colors.ink} /></View>
      <Text style={styles.stateTitle}>{c.agendaEmptyTitle}</Text>
      <Text style={styles.stateBody}>{c.agendaEmptyBody}</Text>
    </View>}
    <View>
      <Text style={[styles.sectionTitle, styles.bottom6]}>{c.flow}</Text>
      {items.map((item, index) => <View key={item.key} style={[styles.agendaRow, statuses[index] === "now" && styles.agendaNow]}>
        <Text style={styles.agendaTime}>{formatClock(item.at, timeZone)}</Text>
        <Text style={[styles.personName, styles.flex1]}>{c.flowItems[item.key]}</Text>
        <Text style={statuses[index] === "now" ? styles.knownTag : styles.personRole}>{c.agendaStatus[statuses[index]!]}</Text>
      </View>)}
    </View>
    <View style={styles.gap12}>
      <View style={styles.listHeadPlain}><Text style={styles.sectionTitle}>{c.graphTitle}</Text><Text style={styles.caption}>{c.graphHint}</Text></View>
      {ring.nodes.length ? <View style={styles.graph} accessibilityLabel={c.graphTitle} onLayout={event => { const next = Math.round(event.nativeEvent.layout.width); if (next > 0 && next !== width) setWidth(next); }}>
        <Svg width={ring.center.x * 2} height={ring.center.y * 2} style={StyleSheet.absoluteFill}>
          {ring.nodes.map(node => <Line key={node.participantId} x1={ring.center.x} y1={ring.center.y} x2={node.x} y2={node.y} stroke={node.kind === "known" ? colors.ink : colors.border} strokeWidth={node.kind === "known" ? 2 : 1.5} />)}
        </Svg>
        <View style={[styles.graphMe, { left: ring.center.x - 24, top: ring.center.y - 24 }]}><Text style={styles.graphMeText}>{c.me}</Text></View>
        {ring.nodes.map(node => <Pressable key={node.participantId} accessibilityRole="button" accessibilityLabel={node.name} onPress={() => onOpen(node.participantId)}
          style={[styles.graphNode, node.kind === "known" ? styles.graphKnown : styles.graphRecommended, { left: node.x - 18, top: node.y - 18 }]}>
          <Text style={styles.graphNodeText}>{node.initial}</Text>
        </Pressable>)}
      </View> : <Text style={styles.muted}>{c.graphEmpty}</Text>}
      <View style={styles.legend}>
        <View style={styles.legendItem}><View style={styles.legendKnown} /><Text style={styles.legendText}>{c.known}</Text></View>
        <View style={styles.legendItem}><View style={styles.legendRecommended} /><Text style={styles.legendText}>{c.recommended}</Text></View>
      </View>
    </View>
  </View>;
}

export const useStyles = createThemedStyles(colors => {
  const controls = createControlStyles(colors);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: layout.pageInset, gap: 6 },
    headerRow: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    back: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 2 },
    backText: { color: colors.accent, fontFamily: liveFont, fontSize: 16 },
    liveMark: { flexDirection: "row", alignItems: "center", gap: 6 },
    liveDot: { width: 7, height: 7, borderRadius: radius.pill, backgroundColor: colors.live },
    liveMarkText: { ...rowRoleStyles.groupHeading, color: colors.live, fontFamily: liveFont },
    title: { color: colors.ink, fontFamily: liveFont, fontSize: 22, lineHeight: 30, fontWeight: "800" },
    tabs: { flexDirection: "row", gap: 6, borderBottomWidth: 1, borderBottomColor: colors.border, marginTop: 6 },
    tab: { minHeight: 44, minWidth: 44, alignItems: "center", justifyContent: "flex-end", marginBottom: -1 },
    tabLabel: { paddingVertical: 10, paddingHorizontal: 6, borderBottomWidth: 2, borderBottomColor: "transparent" },
    tabSelected: { borderBottomColor: colors.ink },
    tabText: { color: colors.text3, fontFamily: liveFont, fontSize: 14, lineHeight: 20 },
    tabTextSelected: { color: colors.ink, fontWeight: "800" },
    content: { paddingHorizontal: layout.pageInset, paddingTop: 20, paddingBottom: layout.contentBottom, gap: spacing.md },
    section20: { gap: 20 }, section24: { gap: 24 }, gap2: { gap: 2, flex: 1 }, gap4: { gap: 4 }, gap6: { gap: 6 }, gap12: { gap: 12 },
    top6: { marginTop: 6 }, bottom6: { marginBottom: 6 }, padV: { paddingVertical: 14 }, flex1: { flex: 1 }, stretch: { alignSelf: "stretch" },
    groupHeading: { ...rowRoleStyles.groupHeading, color: colors.text3, fontFamily: liveFont },
    sectionTitle: { color: colors.ink, fontFamily: liveFont, fontSize: 15, lineHeight: 22, fontWeight: "800" },
    body: { color: colors.text2, fontFamily: liveFont, fontSize: 14, lineHeight: 21 },
    muted: { color: colors.text3, fontFamily: liveFont, fontSize: 13, lineHeight: 20 },
    caption: { color: colors.text3, fontFamily: liveFont, fontSize: 12, lineHeight: 18 },
    link: { color: colors.accent, fontFamily: liveFont, fontSize: 14, fontWeight: "600" },
    linkButton: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
    error: { color: colors.rose, backgroundColor: colors.roseSoft, borderRadius: radius.control, padding: 12, fontFamily: liveFont, fontSize: 14, lineHeight: 21 },
    offline: { color: colors.amber, backgroundColor: colors.amberSoft, borderRadius: radius.control, paddingVertical: 12, paddingHorizontal: 14, fontFamily: liveFont, fontSize: 14, lineHeight: 21 },
    bigRow: { flexDirection: "row", alignItems: "baseline", gap: 12, flexWrap: "wrap" },
    big: { color: colors.ink, fontFamily: liveFont, fontSize: 64, lineHeight: 70, fontWeight: "900", letterSpacing: -2 },
    bigDetail: { color: colors.text3, fontFamily: liveFont, fontSize: 15 },
    checked: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" },
    checkedText: { color: colors.live, fontFamily: liveFont, fontSize: 15, fontWeight: "600" },
    primary: { ...controls.primaryButton }, primaryText: { ...controls.primaryButtonText, fontFamily: liveFont },
    secondary: { ...controls.secondaryButton }, secondaryText: { ...controls.secondaryButtonText, fontFamily: liveFont },
    pending: { ...controls.secondaryButton, borderWidth: 0, backgroundColor: colors.surface2 }, pendingText: { ...controls.secondaryButtonText, color: colors.text3, fontFamily: liveFont },
    disabled: { opacity: 0.5 },
    disabledButton: { ...controls.primaryButton, backgroundColor: colors.bgSunken }, disabledButtonText: { ...controls.primaryButtonText, color: colors.text3, fontFamily: liveFont },
    listHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    listHeadPlain: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 22 },
    personRow: { flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    noDivider: { borderBottomWidth: 0 },
    personCopy: { flex: 1, gap: 2 },
    personName: { color: colors.ink, fontFamily: liveFont, fontSize: 15, lineHeight: 20, fontWeight: "700" },
    personRole: { color: colors.text3, fontFamily: liveFont, fontSize: 13, lineHeight: 18 },
    avatar: { borderRadius: radius.pill, backgroundColor: colors.bgSunken, alignItems: "center", justifyContent: "center" },
    avatarText: { color: colors.text2, fontFamily: liveFont, fontWeight: "800" },
    matchSmall: { color: colors.ink, fontFamily: liveFont, fontSize: 13, fontWeight: "800", fontVariant: ["tabular-nums"] },
    matchBig: { color: colors.ink, fontFamily: liveFont, fontSize: 20, fontWeight: "900", letterSpacing: -0.4, fontVariant: ["tabular-nums"] },
    navRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: colors.hairline },
    recCard: { gap: 12, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44, backgroundColor: colors.surface2, borderRadius: radius.control, paddingHorizontal: 14 },
    searchInput: { flex: 1, color: colors.ink, fontFamily: liveFont, fontSize: 15, minHeight: 44, padding: 0 },
    countRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" },
    count: { color: colors.accent, fontFamily: liveFont, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
    topRule: { borderTopWidth: 1, borderTopColor: colors.hairline },
    knownTag: { color: colors.live, fontFamily: liveFont, fontSize: 12, fontWeight: "600" },
    infoBlock: { gap: 4, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    notice: { gap: 4, paddingVertical: 12 },
    noticeTitle: { color: colors.ink, fontFamily: liveFont, fontSize: 15, lineHeight: 22, fontWeight: "800" },
    denied: { alignItems: "center", gap: 10, paddingTop: 24, paddingBottom: 22 },
    emptyState: { alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    iconRing: { width: 56, height: 56, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.ink, alignItems: "center", justifyContent: "center" },
    stateTitle: { color: colors.ink, fontFamily: liveFont, fontSize: 20, lineHeight: 28, fontWeight: "900", letterSpacing: -0.4, textAlign: "center" },
    stateBody: { color: colors.text3, fontFamily: liveFont, fontSize: 14, lineHeight: 21, textAlign: "center" },
    agendaRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.hairline },
    agendaNow: { backgroundColor: colors.liveSoft, paddingHorizontal: 8, borderRadius: radius.sm },
    agendaTime: { color: colors.text2, fontFamily: liveFont, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"], minWidth: 48 },
    graph: { height: 240, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline },
    graphMe: { position: "absolute", width: 48, height: 48, borderRadius: radius.pill, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
    graphMeText: { color: colors.onAccent, fontFamily: liveFont, fontSize: 14, fontWeight: "800" },
    graphNode: { position: "absolute", width: 36, height: 36, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
    graphKnown: { backgroundColor: colors.surface, borderWidth: 2, borderColor: colors.ink },
    graphRecommended: { backgroundColor: colors.bgSunken },
    graphNodeText: { color: colors.text2, fontFamily: liveFont, fontSize: 14, fontWeight: "800" },
    legend: { flexDirection: "row", gap: 18 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendKnown: { width: 12, height: 12, borderRadius: radius.pill, borderWidth: 2, borderColor: colors.ink },
    legendRecommended: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: colors.bgSunken },
    legendText: { color: colors.text2, fontFamily: liveFont, fontSize: 13 }
  });
});
