// R27 会場モード（App；b2 #26–#35，深 #44 / #45）：受付前 = ① チェックイン；受付後 = 会場モード（LIVE 顶栏 + 专用 5 tab 玻璃底栏：
// 現場 · おすすめ · 参加者 · グループ · 予定），⑧ 参加者シート（申請の承認 / 無視 · 依据 · 自分だけのメモ · 面談を提案）、
// ⑨ 面談を提案シート（候补 3 个 · 只做下书き，D46）、⑩ 交換成功 toast。数据：GET /api/events/[id]/venue（只读）；
// 名刺交換走现有 /operations/contact-requests*，メモ走 /venue/memo。示例世界（sample）只改本地状态。
// 链接参数 `?tab=now|recs|people|groups|agenda&view=map&person=<id>`（旧 attendees / participants / party 跳转也用）；
// 门禁开发开关 open-path 下另有 `meet=1`（面談シート）、`approve=<id>`（交換 toast 常驻）。
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import type { EventVenuePerson, EventVenueResponse } from "../../../api/contract/event-venue";
import { ShellBackground } from "../../../components/ShellBackground";
import { SHELL_GUTTER, useShellTopGap } from "../../../components/ShellTopBar";
import { BottomSheet, GlassSurface, Icon, IconButton, UiPressable, UiText, useToast, type IconName } from "../../../components/ui";
import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { darkColors, floatShadow } from "../../../design/tokens";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { addDesignMock } from "../../add/add-design-mock";
import { useJourneyApi } from "./journey-api";
import { hm, tokyo, weekday, type JourneyT } from "./journey-model";
import { JourneyPage } from "./JourneyPage";
import { useJourneyT } from "./useJourneyT";
import { AgendaTab, CheckInView, GroupsTab, NowTab, PeopleTab, RecsTab } from "./VenueTabs";
import { Avatar, Chip, personTones, shortTitle, surname, useVenueStyles, Why, WhyBody } from "./venue-ui";

type Tab = "now" | "recs" | "people" | "groups" | "agenda";
const TABS: readonly { key: Tab; icon: IconName; label: string }[] = [
  { icon: "home", key: "now", label: "segNow" },
  { icon: "star", key: "recs", label: "segRecs" },
  { icon: "users", key: "people", label: "tabPeople" },
  { icon: "grid", key: "groups", label: "segGroups" },
  { icon: "clock", key: "agenda", label: "vTabAgenda" },
];
const isTab = (value: string | undefined): value is Tab => TABS.some((tab) => tab.key === value);

/** kit .topbar（会場モード）：✕ · 标题 + 「● LIVE 20:22 · ラウンド 2 / 3」· 受付 QR。 */
function LiveTopBar({ title, line, onClose, onQr, t }: { title: string; line: string; onClose: () => void; onQr: () => void; t: JourneyT }) {
  const { styles } = useStyles();
  return (
    <View style={styles.bar}>
      <IconButton icon="x" accessibilityLabel={t("liveExit")} onPress={onClose} />
      <View style={styles.center}>
        <UiText accessibilityRole="header" style={styles.title} numberOfLines={1}>{title}</UiText>
        <View style={styles.subRow}><View style={styles.liveDot} /><UiText style={styles.live}>LIVE</UiText><UiText style={styles.subtitle}>{` ${line}`}</UiText></View>
      </View>
      <IconButton icon="scan" accessibilityLabel={t("checkInQr")} onPress={onQr} />
    </View>
  );
}

/** kit .tabbar.livebar：left 14 / right 16，5 等分，玻璃胶囊（同 OrbitTabBar 的尺寸与选中态）。 */
function LiveTabBar({ tab, onTab, t }: { tab: Tab; onTab: (tab: Tab) => void; t: JourneyT }) {
  const { styles, colors } = useStyles();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.dock, { bottom: Math.max(14, insets.bottom - 8) }]}>
      <View accessibilityRole="tablist" style={styles.frame}>
        <GlassSurface radius={999} style={styles.glass}>
          <View style={styles.tabs}>
            {TABS.map((item) => {
              const selected = item.key === tab;
              return (
                <UiPressable key={item.key} accessibilityRole="tab" accessibilityLabel={t(item.label)} accessibilityState={{ selected }} onPress={() => onTab(item.key)} style={[styles.tab, selected ? styles.tabOn : null]} testID={`events-venue-tab-${item.key}`}>
                  <Icon name={item.icon} size={21} color={selected ? colors.ink : colors.ink3} />
                  <UiText maxFontSizeMultiplier={1} numberOfLines={1} style={[styles.tabLabel, selected ? { color: colors.ink } : null]}>{t(item.label)}</UiText>
                </UiPressable>
              );
            })}
          </View>
        </GlassSurface>
      </View>
    </View>
  );
}

export function VenuePage() {
  const { styles, colors } = useStyles();
  const vs = useVenueStyles().styles;
  const { t, language } = useJourneyT();
  const locale = useOrbitLocale();
  const router = useRouter();
  const toast = useToast();
  const api = useJourneyApi();
  const client = useOrbitApiClient();
  const topGap = useShellTopGap();
  const dev = addDesignMock("open-path");
  const noKeyboard = addDesignMock("no-keyboard");
  const params = useLocalSearchParams<{ id?: string; tab?: string; view?: string; person?: string; meet?: string; approve?: string }>();
  const eventId = String(params.id ?? "");
  const base = `/events/${encodeURIComponent(eventId)}`;
  const [data, setData] = useState<EventVenueResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>(isTab(params.tab) ? params.tab : "now");
  const [view, setView] = useState<"list" | "map">(params.view === "map" ? "map" : "list");
  const [selectedId, setSelectedId] = useState<string | null>(params.person ?? null);
  const [meeting, setMeeting] = useState(dev && params.meet === "1");
  const [memo, setMemo] = useState("");
  const [why, setWhy] = useState(false);
  const [openerShift, setOpenerShift] = useState(0);
  // 面談候补（服务端给默认 3 个；这里只在本机调 ±1 天 / ±30 分，下书き用调整后的时间）。
  const [slots, setSlots] = useState<string[] | null>(null);
  const memoRef = useRef<TextInput | null>(null);

  const load = useCallback(() => api.venue(eventId).then((res) => { if (res.ok) setData(res.data); else setMissing(true); return res; }), [api, eventId]);
  useEffect(() => { void load(); }, [load]);

  const people = useMemo(() => {
    if (!data) return [] as EventVenuePerson[];
    const seen = new Map<string, EventVenuePerson>();
    for (const person of [...data.attendees, ...data.nextOrder, ...data.recommendations]) if (!seen.has(person.attendeeId)) seen.set(person.attendeeId, person);
    return [...seen.values()];
  }, [data]);
  const toneOf = useMemo(() => (data ? personTones(data) : () => "lav" as const), [data]);
  const selected = people.find((person) => person.attendeeId === selectedId) ?? null;
  useEffect(() => { setMemo(selected?.memo ?? ""); setWhy(false); }, [selected?.attendeeId, selected?.memo]);

  const patchPerson = (attendeeId: string, patch: Partial<EventVenuePerson>) => setData((current) => {
    if (!current) return current;
    const apply = (person: EventVenuePerson) => (person.attendeeId === attendeeId ? { ...person, ...patch } : person);
    return { ...current, attendees: current.attendees.map(apply), nextOrder: current.nextOrder.map(apply), recommendations: current.recommendations.map(apply) };
  });
  const genericError = () => toast.error(locale.t("eventsV2.genericError"));
  const requestSwap = async (person: EventVenuePerson) => {
    if (!data?.sample) {
      const res = await client.post<unknown>(`/api/events/${encodeURIComponent(eventId)}/operations/contact-requests`, { body: { expectedRevision: null, targetParticipantId: person.participantId } }).catch(() => null);
      if (!res?.success) { genericError(); return; }
      void load();
    }
    patchPerson(person.attendeeId, { exchange: "requested" });
    toast.success(t("swapRequested"));
  };
  const swappedToast = (person: EventVenuePerson, keep = false) => {
    const stats = data?.stats;
    const met = (stats?.wantedMet ?? 0) + (person.wanted ? 1 : 0);
    // 交換在服务端已生效、没有撤回接口：不给「元に戻す」（只改本地会与服务端不一致）。
    toast.success(t("vSwappedToast", { name: person.name }), { keep, sub: t("vSwappedSub", { a: met, b: stats?.wantedTotal ?? 0 }) });
  };
  const respond = async (person: EventVenuePerson, accept: boolean) => {
    if (!data?.sample) {
      if (!person.requestId || person.requestRevision == null) return;
      const res = await client.post<unknown>(`/api/events/${encodeURIComponent(eventId)}/operations/contact-requests/${encodeURIComponent(person.requestId)}/respond`, { body: { accept, expectedRevision: person.requestRevision } }).catch(() => null);
      if (!res?.success) { genericError(); return; }
      void load();
    }
    patchPerson(person.attendeeId, accept ? { exchange: "exchanged", relation: "exchanged" } : { exchange: "none" });
    setSelectedId(null);
    if (accept) swappedToast(person);
  };
  // 开发回放 ⑩：承认后的 toast 常驻（画板是 toast 停住的那一帧）。
  const approveParam = dev ? params.approve : undefined;
  useEffect(() => {
    if (!approveParam || !data) return;
    const person = data.attendees.find((item) => item.attendeeId === approveParam);
    if (person) swappedToast(person, true);
  }, [approveParam, Boolean(data)]); // eslint-disable-line react-hooks/exhaustive-deps
  const saveMemo = async () => {
    if (!selected || (selected.memo ?? "") === memo.trim()) return;
    if (!data?.sample) {
      const res = await api.venueMemo(eventId, selected.attendeeId, memo);
      if (!res.ok) { genericError(); return; }
    }
    patchPerson(selected.attendeeId, { memo: memo.trim() || null });
    toast.success(t("memoSaved"));
  };
  const slotParts = (iso: string) => { const p = tokyo(iso); return p ? { date: `${p.month}/${p.day}(${weekday(language, p.weekday)})`, time: `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}` } : { date: "", time: "" }; };
  const shownSlots = slots ?? [...(data?.meetingSlots ?? [])];
  const shiftSlot = (index: number, minutes: number) => setSlots(shownSlots.map((slot, i) => (i === index ? new Date(Date.parse(slot) + minutes * 60_000).toISOString() : slot)));
  const draftMeeting = async () => {
    if (!selected || !shownSlots.length) return;
    const text = shownSlots.map((slot) => { const s = slotParts(slot); return `${s.date} ${s.time}`; }).join(t("listSep"));
    try { await Clipboard.setStringAsync(t("meetDraft", { name: surname(selected.name), slots: text })); toast.success(t("draftCopied")); } catch { genericError(); }
  };
  const toAfter = () => router.replace(`${base}/after` as Href);

  const back = { fallback: base, leftLabel: t("close"), leftIcon: "x" as const };
  if (!data) return <JourneyPage title={t("liveTitle")} {...back}>{missing ? <View style={vs.card}><UiText style={vs.sub}>{t("notFound")}</UiText></View> : null}</JourneyPage>;
  if (data.state === "before_check_in") {
    return <JourneyPage title={t("checkIn")} subtitle={data.title} {...back} testID="events-venue"><CheckInView data={data} t={t} /></JourneyPage>;
  }
  if (data.state !== "checked_in") {
    return (
      <JourneyPage title={t("liveTitle")} subtitle={data.title} {...back} testID="events-venue">
        <View style={vs.card}><UiText style={vs.sub}>{data.state === "ended" ? t("liveEnded") : t("liveNotRegistered")}</UiText></View>
        {data.state === "ended" ? <UiPressable accessibilityRole="button" accessibilityLabel={t("toAfter")} onPress={toAfter} style={[vs.btnSm, vs.primary, vs.gap]}><UiText style={[vs.btnSmText, { color: colors.bg }]}>{t("toAfter")}</UiText></UiPressable> : null}
      </JourneyPage>
    );
  }

  const nowMs = Date.parse(data.now);
  const line = data.round ? t("liveRound", { i: data.round.index, n: data.round.total, time: hm(new Date(nowMs).toISOString()) }) : hm(new Date(nowMs).toISOString());
  const openers = data.openers.length ? [...data.openers.slice(openerShift % data.openers.length), ...data.openers.slice(0, openerShift % data.openers.length)] : data.openers;
  const shown = { ...data, openers };
  const ago = selected?.requestedAt ? Math.max(0, Math.round((nowMs - Date.parse(selected.requestedAt)) / 60_000)) : null;

  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { paddingTop: topGap }]} testID="events-venue">
      <ShellBackground />
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <LiveTopBar title={shortTitle(data.title)} line={line} onClose={toAfter} onQr={() => toast.info(data.checkIn?.receptionNumber ? t("vReception", { n: data.checkIn.receptionNumber }) : t("checkInQr"))} t={t} />
        {tab === "now" ? <NowTab data={shown} t={t} toneOf={toneOf} onRecap={toAfter} onMoreOpeners={() => setOpenerShift((value) => value + 1)} /> : null}
        {tab === "recs" ? <RecsTab data={data} t={t} toneOf={toneOf} onRequest={(person) => void requestSwap(person)} onOpen={(person) => setSelectedId(person.attendeeId)}
          onDismiss={(person) => setData((current) => (current ? { ...current, recommendations: current.recommendations.filter((item) => item.attendeeId !== person.attendeeId) } : current))} /> : null}
        {tab === "people" ? <PeopleTab data={data} t={t} toneOf={toneOf} view={view} onView={setView} onOpen={(person) => setSelectedId(person.attendeeId)} /> : null}
        {tab === "groups" ? <GroupsTab data={data} t={t} toneOf={toneOf} /> : null}
        {tab === "agenda" ? <AgendaTab data={data} t={t} /> : null}
      </ScrollView>
      <LiveTabBar tab={tab} onTab={setTab} t={t} />
      <BottomSheet visible={Boolean(selected) && !meeting} onClose={() => { void saveMemo(); setSelectedId(null); }} accessibilityLabel={selected?.name ?? ""}>
        {selected ? (
          <View testID="events-venue-person-sheet">
            <View style={[vs.row, { gap: 12 }]}>
              <Avatar initial={selected.initial} tone={toneOf(selected)} size="lg" />
              <View style={vs.grow}><UiText style={styles.sheetName}>{selected.name}</UiText><UiText style={vs.lbl}>{[selected.org, selected.role, selected.table ? t("tableChip", { t: selected.table }) : null].filter(Boolean).join(" · ")}</UiText></View>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={() => { void saveMemo(); setSelectedId(null); }} style={vs.lbtn}><Icon name="x" size={16} color={colors.ink2} /></UiPressable>
            </View>
            {selected.exchange === "incoming" ? (
              <View style={[vs.card, vs.flat, styles.req]}>
                <View style={[vs.row, { gap: 8 }]}>
                  <View style={[vs.emoSm, { backgroundColor: colors.macLav }]}><UiText style={vs.emoSmText}>📇</UiText></View>
                  <UiText style={[vs.title13, vs.grow]}>{t("incomingTitle")}</UiText>
                  {ago !== null ? <UiText style={vs.lbl}>{t("vAgo", { n: ago })}</UiText> : null}
                </View>
                <View style={[vs.row, { gap: 8, marginTop: 10 }]}>
                  <UiPressable accessibilityRole="button" accessibilityLabel={t("acceptSwap")} onPress={() => void respond(selected, true)} style={[vs.btnSm, vs.primary, vs.grow]} testID="events-venue-accept"><UiText style={[vs.btnSmText, { color: colors.bg }]}>{t("acceptSwap")}</UiText></UiPressable>
                  <UiPressable accessibilityRole="button" accessibilityLabel={t("ignoreSwap")} onPress={() => void respond(selected, false)} style={[vs.btnSm, vs.grow]}><UiText style={vs.btnSmText}>{t("ignoreSwap")}</UiText></UiPressable>
                </View>
                <UiText style={[vs.lbl, { marginTop: 6 }]}>{t("vIgnoreNote")}</UiText>
              </View>
            ) : selected.exchange === "none" ? (
              <UiPressable accessibilityRole="button" accessibilityLabel={t("requestExchange")} onPress={() => void requestSwap(selected)} style={[vs.btnSm, vs.primary, { marginTop: 14 }]}><UiText style={[vs.btnSmText, { color: colors.bg }]}>{t("requestExchange")}</UiText></UiPressable>
            ) : <View style={{ marginTop: 14 }}>{selected.exchange === "exchanged" ? <Chip label={t("exExchanged")} tone="teal" /> : <Chip label={t("exRequested")} />}</View>}
            {selected.why ? (
              <View style={{ marginTop: 12 }}>
                <View style={[vs.row, { gap: 6 }]}>
                  <View style={[styles.whyChip, { backgroundColor: colors.macLav }]}><UiText style={[vs.chipText, { color: colors.macLavInk }]} numberOfLines={1}>{`🎯 ${selected.why}`}</UiText></View>
                  {selected.whyDetail ? <Why label={t("why")} open={why} onToggle={() => setWhy((value) => !value)} /> : null}
                </View>
                {why && selected.whyDetail ? <WhyBody text={selected.whyDetail} /> : null}
              </View>
            ) : null}
            <UiText style={[vs.lbl, { marginBottom: 6, marginTop: 14 }]}>{t("vMemoTitle")}</UiText>
            <View style={[vs.row, { gap: 8 }]}>
              <TextInput ref={memoRef} value={memo} onChangeText={setMemo} onEndEditing={() => void saveMemo()} onSubmitEditing={() => void saveMemo()} placeholder={t("vMemoPh")} placeholderTextColor={colors.ink3} showSoftInputOnFocus={!noKeyboard} accessibilityLabel={t("memoTitle")} maxLength={200} style={styles.input} />
              <UiPressable accessibilityRole="button" accessibilityLabel={t("voiceAnswer")} onPress={() => memoRef.current?.focus()} style={styles.mic}><Icon name="mic" size={16} color={colors.ink} /></UiPressable>
            </View>
            <UiText style={[vs.lbl, { marginTop: 6 }]}>{t("vVoiceNote")}</UiText>
            {data.meetingSlots?.length ? (
              <UiPressable accessibilityRole="button" accessibilityLabel={t("vProposeMeet")} onPress={() => setMeeting(true)} style={styles.blockBtn}><Icon name="calendar" size={16} color={colors.ink} /><UiText style={styles.blockText}>{t("vProposeMeet")}</UiText></UiPressable>
            ) : null}
          </View>
        ) : null}
      </BottomSheet>
      <BottomSheet visible={Boolean(selected) && meeting} onClose={() => setMeeting(false)} accessibilityLabel={selected ? t("vMeetTitle", { name: surname(selected.name) }) : ""}>
        {selected ? (
          <View testID="events-venue-meet-sheet">
            <View style={vs.row}>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("back")} onPress={() => setMeeting(false)} style={vs.lbtn}><Icon name="left" size={16} color={colors.ink2} /></UiPressable>
              <View style={vs.grow}><UiText style={styles.meetTitle}>{t("vMeetTitle", { name: surname(selected.name) })}</UiText><UiText style={vs.lbl}>{t("vMeetSub")}</UiText></View>
            </View>
            {shownSlots.map((slot, index) => {
              const s = slotParts(slot);
              const step = (icon: IconName | "minus-text", label: string, minutes: number) => (
                <UiPressable accessibilityRole="button" accessibilityLabel={label} onPress={() => shiftSlot(index, minutes)} style={[vs.lbtn, { backgroundColor: colors.surface }]}>
                  {icon === "minus-text" ? <UiText style={styles.minus}>−</UiText> : <Icon name={icon} size={16} color={colors.ink2} />}
                </UiPressable>
              );
              return (
                <View key={`slot-${index}`} style={styles.slot}>
                  <UiText style={styles.slotLbl}>{t("slotN", { n: index + 1 })}</UiText>
                  <View style={[vs.row, { gap: 4 }]}>{step("left", t("vPrevDay"), -1440)}<UiText style={styles.slotVal}>{s.date}</UiText>{step("right", t("vNextDay"), 1440)}</View>
                  <View style={[vs.row, { gap: 4 }]}>{step("minus-text", t("vEarlier"), -30)}<UiText style={styles.slotVal}>{s.time}</UiText>{step("plus", t("vLater"), 30)}</View>
                </View>
              );
            })}
            <View style={styles.meetFoot}>
              <View style={[vs.row, { gap: 8 }]}>
                <Avatar initial={selected.initial} tone={toneOf(selected)} size="sm" />
                <UiText style={[styles.meetName, vs.grow]}>{selected.name}</UiText>
                {selected.isOrbitUser ? <Chip label="Orbit" tone="teal" /> : null}
              </View>
              <UiText style={[vs.lbl, { marginTop: 8 }]}>{selected.isOrbitUser ? t("draftNoteOrbit") : t("draftNoteMail")}</UiText>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("makeDraft")} onPress={() => void draftMeeting()} style={styles.draftBtn}><Icon name="pen" size={16} color={colors.bg} /><UiText style={[styles.blockText, { color: colors.bg }]}>{t("makeDraft")}</UiText></UiPressable>
            </View>
          </View>
        ) : null}
      </BottomSheet>
    </SafeAreaView>
  );
}

// kit（b2 #27–#35）：.topbar · .livedot 7 coral · .tabbar.livebar 62 · .sheet 内 .input 44 r14 · 候补行 surface-2 r12 8 · .btn.block 44。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { backgroundColor: colors.bg, flex: 1 },
  pad: { paddingBottom: 130, paddingHorizontal: SHELL_GUTTER },
  bar: { alignItems: "center", flexDirection: "row", paddingBottom: 14, paddingTop: 6 },
  center: { alignItems: "center", flex: 1, minWidth: 0 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800", letterSpacing: 0.17, lineHeight: 25.5, textAlign: "center" },
  subRow: { alignItems: "center", flexDirection: "row", marginTop: 1 },
  liveDot: { backgroundColor: colors.coral, borderRadius: 3.5, height: 7, marginRight: 4, width: 7 },
  live: { color: colors.coral, fontSize: 11.5, fontWeight: "800", lineHeight: 17.25 },
  subtitle: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  dock: { left: 14, position: "absolute", right: 16 },
  frame: { borderRadius: 999, height: 62, ...floatShadow(colors) },
  glass: { flex: 1 },
  tabs: { flex: 1, flexDirection: "row", gap: 2, padding: 6 },
  tab: { alignItems: "center", borderRadius: 999, flex: 1, gap: 2, justifyContent: "center" },
  tabOn: { backgroundColor: colors === darkColors ? colors.surface3 : colors.surface },
  tabLabel: { color: colors.ink3, fontSize: 10, fontWeight: "700", lineHeight: 15, textAlign: "center" },
  sheetName: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25.5 },
  req: { marginTop: 14, padding: 14 },
  whyChip: { borderRadius: 999, flex: 1, paddingHorizontal: 9, paddingVertical: 3 },
  input: { backgroundColor: colors.surface2, borderRadius: 14, color: colors.ink, flex: 1, fontSize: 13, height: 44, paddingHorizontal: 14 },
  mic: { alignItems: "center", backgroundColor: colors.accentSoft, borderRadius: 999, height: 44, justifyContent: "center", width: 44 },
  blockBtn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 999, flexDirection: "row", gap: 6, height: 44, justifyContent: "center", marginTop: 14 },
  blockText: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  meetTitle: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 24 },
  slot: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 12, flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, padding: 8 },
  slotLbl: { color: colors.ink2, fontSize: 11.5, fontWeight: "700", lineHeight: 17.25, minWidth: 52 },
  slotVal: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21, minWidth: 64, textAlign: "center" },
  minus: { color: colors.ink2, fontSize: 16, fontWeight: "700", lineHeight: 20 },
  meetFoot: { borderTopColor: colors.line, borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  meetName: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  draftBtn: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 999, flexDirection: "row", gap: 6, height: 40, justifyContent: "center", marginTop: 8 },
}));
