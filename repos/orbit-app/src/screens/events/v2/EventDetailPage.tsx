// R27 イベント詳細（App）：封面卡（facts）·「あなたに関係すること」· 2026-11-21 起一页读完（event-detail-structure-app-proposal.html，
// 用户拍板去掉 tab）：紹介（6 行折叠）→ アジェンダ（5 项折叠）→ 参加者预览（全名单 = /events/[id]/people）→ 主催 · 底部 CTA。
// 已报名时 CTA 位置换成 ⋯（カレンダーに追加 / 参加用プロフィールを編集 / 参加を取り消す，与 Web b12 378–381 §31 同位置）+ 会う準備へ。
// 数据：GET /api/events/[id]/overview（规则评估，不调 AI）。
// 2026-11-20（events-replay-cover-app-proposal ① ⑥ ⑩）：主办方的活动图片（coverUrl，2:1）取代色带；状态 chip 挪到标题下；
// 已结束且在公开分组里（venueRecord）→ 封面卡下「会場の記録」入口卡；参加者行点开 AttendeeSheet。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Image, Platform, ScrollView, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { EventOverviewResponse } from "../../../api/contract/event-overview";
import { eventOverviewResponseSchema } from "../../../api/schema/event-overview";
import { EventsOfflineNotice } from "./EventsOfflineNotice";
import { RetryCard } from "../../../components/ui/States";
import { useKeyedPageCopy } from "../../../hooks/useKeyedPageCopy";
import { ShellBackground } from "../../../components/ShellBackground";
import { EmailNotice } from "../../../email-verification/EmailNotice";
import { SHELL_GUTTER, ShellTopBar, useShellTopGap } from "../../../components/ShellTopBar";
import { ActionSheet, GlassSurface, Icon, IconButton, UiPressable, UiText, useToast, type IconName } from "../../../components/ui";
import Svg, { Defs, Path, RadialGradient, Rect, Stop } from "../../../components/ui/svg";
import { designIcons } from "../../../api/design/icons";
import { useHostApi } from "../../host/host-api";
import { LinearGradient } from "../../plan/plan-svg";
import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { radius, shadows } from "../../../design/tokens";
import { AttendeeSheet, type AttendeeSheetPerson } from "./AttendeeSheet";
import { GradientCard } from "./venue-ui";
import { useCoverUri } from "./event-cover";
import { CancelSheet } from "./CancelSheet";
import { HostContactCard, showHostContact } from "./HostContact";
import { newIdempotencyKey, useEventsApi } from "./events-api";
import { useJourneyApi } from "./journey-api";
import { eventRange, feeText, publicOrganizerName, subscribeEventChanged } from "./journey-model";
import { RelevanceCard, useRelevanceT } from "./Relevance";
import { Bone, Bones } from "./loading-ui";
import { useJourneyT } from "./useJourneyT";

type Tone = "lav" | "pink" | "blue" | "teal" | "apricot";
/** 头像色（b2 #15 / #16）：lav · blue · teal · pink · blue · apricot 轮换；知り合い叠头像 pink · teal · blue。 */
const AV_TONES: readonly Tone[] = ["lav", "blue", "teal", "pink", "blue", "apricot"];
const SPEAKER_TONES: readonly Tone[] = ["lav", "blue"];
/** 紹介 folds after 6 lines, アジェンダ after 5 items (both open in place; Luma / Meetup 「Read more」). */
const DESC_LINES = 6;
const AGENDA_ITEMS = 5;

function SectionHead({ title, right }: { title: string; right?: string | undefined }) {
  const { styles } = useStyles();
  return <View style={styles.secHead}><UiText accessibilityRole="header" style={styles.secTitle}>{title}</UiText>{right ? <UiText style={styles.lbl}>{right}</UiText> : null}</View>;
}

/** kit .cover：linear-gradient(135deg, mac-lav, mac-pink 70%, mac-apricot)。 */
function Cover({ children, style }: { children: ReactNode; style: object }) {
  const { colors } = useOrbitTheme();
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // CSS 角度渐变线：长度 = |w·sin| + |h·cos|，过中心。
  const half = size ? (size.w * Math.SQRT1_2 + size.h * Math.SQRT1_2) / 2 : 0;
  const d = half * Math.SQRT1_2;
  return (
    <View style={style} onLayout={(event) => setSize({ h: event.nativeEvent.layout.height, w: event.nativeEvent.layout.width })}>
      {size ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="eventCover" gradientUnits="userSpaceOnUse" x1={size.w / 2 - d} y1={size.h / 2 - d} x2={size.w / 2 + d} y2={size.h / 2 + d}>
              <Stop offset={0} stopColor={colors.macLav} /><Stop offset={0.7} stopColor={colors.macPink} /><Stop offset={1} stopColor={colors.macApricot} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size.w} height={size.h} fill="url(#eventCover)" />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}

/** ★ once saved: the kit star shape, filled. */
function FilledStar({ color }: { color: string }) {
  const shape = designIcons.star[0] as { d: string };
  return <Svg width={20} height={20} viewBox="0 0 24 24"><Path d={shape.d} fill={color} stroke={color} strokeWidth={1.7} strokeLinejoin="round" /></Svg>;
}

export function EventDetailPage() {
  const { styles, colors } = useStyles();
  const { scheme } = useOrbitTheme();
  const locale = useOrbitLocale();
  const rt = useRelevanceT();
  const { t, language } = useJourneyT();
  const router = useRouter();
  const toast = useToast();
  const api = useJourneyApi();
  const eventsApi = useEventsApi();
  const hostApi = useHostApi();
  const topGap = useShellTopGap();
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const eventId = String(params.id ?? "");
  const [data, setData] = useState<EventOverviewResponse | null>(null);
  const [missing, setMissing] = useState<"not_found" | "network" | null>(null);
  // LF2: the last answer for this event, shown at once and kept with 「截至」 when the server cannot be reached.
  const copy = useKeyedPageCopy<EventOverviewResponse>("event-overview", eventId, (value) => eventOverviewResponseSchema.safeParse(value).success);
  const [offlineAt, setOfflineAt] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  // Old ?tab= links (会場の記録 / notifications) scroll to that section once the page has laid out.
  const jumpTo = params.tab === "people" || params.tab === "agenda" ? params.tab : null;
  const scroller = useRef<ScrollView>(null);
  const sectionY = useRef<Partial<Record<"agenda" | "people", number>>>({});
  const jumpedAt = useRef<number | null>(null);
  const userScrolled = useRef(false);
  // Section y arrives from onLayout, before or after the content size changes, and moves again when 紹介 grows its
  // 「続きを読む」: align on every change for a short while after the first jump, unless the person has scrolled (as Web 4ef9cc8f8).
  const tryJump = () => {
    const y = jumpTo ? sectionY.current[jumpTo] : undefined;
    if (y === undefined || userScrolled.current) return;
    if (jumpedAt.current !== null && Date.now() - jumpedAt.current > 800) return;
    jumpedAt.current ??= Date.now();
    requestAnimationFrame(() => scroller.current?.scrollTo({ y: Math.max(0, y - 8), animated: false }));
  };
  const [descOpen, setDescOpen] = useState(false);
  const [descLong, setDescLong] = useState(false);
  const [agendaOpen, setAgendaOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetPerson, setSheetPerson] = useState<AttendeeSheetPerson | null>(null);
  const cover = useCoverUri(data?.coverUrl);
  // ★: saved = an assessment of this event exists (the overview's assessmentId), or saved just now.
  const [savedId, setSavedId] = useState<string | null>(null);
  // Host of this event: the overview says so (hosting); an older server without the field is asked through the host API.
  const [probedHost, setProbedHost] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      const saved = await copy.read();
      if (live && saved) setData(saved.data);
      const result = await api.overview(eventId);
      if (!live) return;
      if (result.ok) { setData(result.data); setOfflineAt(null); setMissing(null); void copy.save(result.data); return; }
      const unreachable = result.reason === "network" || result.reason === "unavailable";
      if (saved && unreachable) setOfflineAt(saved.syncedAt);
      else setMissing(unreachable ? "network" : "not_found");
    })();
    return () => { live = false; };
  }, [api, copy, eventId, reload]);
  useEffect(() => subscribeEventChanged((changed) => { if (changed === eventId) setReload((value) => value + 1); }), [eventId]);
  const hostingKnown = data ? data.hosting !== undefined || Boolean(data.signedOut) || Boolean(data.sample) : false;
  useEffect(() => {
    if (!data || hostingKnown || probedHost !== null) return;
    let live = true;
    void hostApi.event(eventId).then((res) => { if (live) setProbedHost(res.ok); });
    return () => { live = false; };
  }, [data, eventId, hostApi, hostingKnown, probedHost]);

  const tone = (key: Tone) => ({ apricot: [colors.macApricot, colors.macApricotInk], blue: [colors.macBlue, colors.macBlueInk], lav: [colors.macLav, colors.macLavInk], pink: [colors.macPink, colors.macPinkInk], teal: [colors.macTeal, colors.macTealInk] } as const)[key];
  const base = `/events/${encodeURIComponent(eventId)}`;
  const share = () => { if (data) Share.share({ message: data.title }).catch(() => undefined); };
  const status = data?.registration.status ?? "none";
  // attended = checked in: still theirs (it had no CTA at all); the main button opens 会场模式 and there is nothing to cancel.
  const attended = status === "attended";
  // 审核中 / 候补：名单要等审核通过（不再请他们「去报名」）。
  const inReview = status === "pending_review" || status === "waitlisted";
  const holding = status === "registered" || status === "pending_review" || status === "waitlisted" || attended;
  const menu = async (key: string) => {
    setMenuOpen(false);
    if (key === "calendar") {
      const result = await api.joinTentative(eventId);
      if (result.ok) toast.success(t("calendarAdded")); else toast.error(locale.t("eventsV2.genericError"));
    } else if (key === "profile") router.push(`${base}/register` as Href);
    else if (key === "cancel") setCancelOpen(true);
  };
  // ★ 保存 / 公開されたら知らせる = 记成 R26 的评估（出现在「評価」列表；名单首次公开时由重算任务通知；同 Web）。
  const save = async (done: "savedToAssess" | "notifyOn" = "savedToAssess") => {
    const existing = savedId ?? data?.assessment?.assessmentId ?? null;
    // Already saved: the star opens the saved assessment instead of saving again.
    if (existing && done === "savedToAssess") { router.push(`/events/assessments/${encodeURIComponent(existing)}` as Href); return; }
    const created = await eventsApi.create({ eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    if (created.ok) { setSavedId(created.data.id); toast.success(t(done)); } else toast.error(locale.t("eventsV2.genericError"));
  };
  const confirmCancel = async () => {
    setBusy(true);
    const result = await api.joinCancel(eventId);
    setBusy(false);
    setCancelOpen(false);
    if (!result.ok) { toast.error(t("cancelFailed")); return; }
    // The seat comes back at once (only a confirmed place held one), then the overview is read again for the server's count.
    const heldSeat = status === "registered" || status === "attended";
    setData((current) => {
      if (!current) return current;
      const next = { ...current, registration: { ...current.registration, status: "cancelled" as const }, ...(heldSeat && typeof current.remaining === "number" ? { remaining: Math.min(current.remaining + 1, current.capacity ?? Number.MAX_SAFE_INTEGER) } : {}) };
      void copy.save(next);
      return next;
    });
    setReload((value) => value + 1);
    toast.success(t("cancelled"));
  };

  const header = (
    <ShellTopBar title=""
      left={<IconButton icon="left" accessibilityLabel={t("back")} onPress={() => (router.canGoBack() ? router.back() : router.replace("/events?tab=discover" as Href))} />}
      right={<IconButton icon="share" accessibilityLabel={t("share")} onPress={share} />} />
  );
  if (!data) {
    return (
      <SafeAreaView edges={["top"]} style={[styles.page, { paddingTop: topGap }]}>
        <ShellBackground />
        <View style={styles.pad}><EmailNotice />{header}{missing === "network"
          ? <RetryCard title={locale.t("sync.needsNetwork")} message={locale.t("sync.needsNetworkBody")} onRetry={() => { setMissing(null); setReload((value) => value + 1); }} />
          : missing ? <View style={styles.card}><UiText style={styles.sub}>{t("notFound")}</UiText></View> : (
            // First open, no saved copy: the cover card's and the description's shapes, so the page does not jump when it fills.
            <Bones testID="events-detail-loading">
              <View style={[styles.card, styles.coverCard]}>
                <Bone h={96} r={0} />
                <View style={styles.coverBody}>
                  <Bone w="30%" h={11} /><Bone w="82%" h={20} style={{ marginTop: 8 }} /><Bone w={64} h={22} r={999} style={{ marginTop: 10 }} />
                  {[56, 48, 40].map((w) => <View key={w} style={[styles.fact, { marginTop: 10 }]}><Bone w={16} h={16} r={4} /><Bone w={`${w}%`} h={12} /></View>)}
                </View>
              </View>
              <View style={[styles.card, styles.gap]}><Bone w="90%" h={13} /><Bone w="96%" h={13} style={{ marginTop: 9 }} /><Bone w="60%" h={13} style={{ marginTop: 9 }} /></View>
            </Bones>
          )}</View>
      </SafeAreaView>
    );
  }

  const hosting = data.hosting ?? probedHost ?? false;
  // The host is not asked whether their own event is worth going to.
  const assessment = data.signedOut || hosting ? null : data.assessment ?? null;
  const relevance = assessment?.relevance ?? null;
  const facts: { icon: IconName; text: string }[] = [
    { icon: "calendar", text: eventRange(data.startsAt, data.endsAt, language) },
    { icon: "pin", text: data.venue ?? "—" },
    { icon: "ticket", text: [feeText(data.priceYen, t), data.capacity ? t("capacityN", { n: data.capacity }) : null, data.review ? t("reviewYes") : null].filter(Boolean).join(" · ") },
  ];
  // An event that is over no longer shows seats left or 报名 / 会面准备; a registered person goes to the 回顾 instead.
  const ended = Date.parse(data.endsAt ?? data.startsAt) < Date.now();
  // 2026-11-27（同 Web detail-timing）：受付期間内だけ申込できる；残り 0 で キャンセル待ちなし = 満席（押せない），ありなら「キャンセル待ちに並ぶ」。
  const closesAt = Date.parse(data.registrationClosesAt ?? "");
  const canRegister = !ended && (!Number.isFinite(closesAt) || Date.now() < closesAt);
  const soldOut = typeof data.capacity === "number" && data.capacity > 0 && data.remaining === 0;
  const full = soldOut && !data.waitlistEnabled;
  const waitlist = soldOut && Boolean(data.waitlistEnabled);
  const saved = Boolean(savedId ?? assessment?.assessmentId);
  // Someone who is already in sees where they stand, not 即将截止 · 剩N个名额.
  const holdingChip = { attended: "stCheckedIn", pending_review: "stPending", registered: "stRegistered", waitlisted: "stWaitlisted" } as const;
  const remainingChip = ended ? t("statusEnded") : holding && !hosting ? t(holdingChip[status as keyof typeof holdingChip]) : typeof data.remaining === "number" ? t(data.deadlineSoon ? "deadlineChip" : "openChip", { n: data.remaining }) : null;
  // Opens on 符合计划 when someone fits the plan, otherwise on 全部 (never on an empty list by default).
  const fit = data.attendees.filter((person) => person.planFit && !person.known).slice(0, 3);
  // 参加者 preview: up to 3 who fit my plan; with none, the first 3 public attendees.
  const preview = fit.length ? fit : data.attendees.slice(0, 3);
  const known = data.knownAttendees;
  const knownLine = known.map((person) => `${t("honorific", { name: person.name.split(/\s+/)[0] ?? person.name })}${person.speaker ? t("speakerTag") : ""}`)
    .reduce((line, item) => (line ? `${line}${/[）)]$/.test(line) ? "· " : " · "}${item}` : item), "");
  // 资料只给报名者看（服务端对其他人 404）：名单解锁 = 已报名，主办方看的是运营页名单。
  const canOpenPeople = holding && !hosting;
  const openPerson = (person: { attendeeId: string; name: string; initial: string; org?: string | null; role?: string | null }, index: number) =>
    setSheetPerson({ attendeeId: person.attendeeId, initial: person.initial, name: person.name, org: person.org ?? null, role: person.role ?? null, tone: AV_TONES[index % AV_TONES.length]! });
  const record = ended ? data.venueRecord ?? null : null;
  const Avatar = ({ initial, index, small, tones = AV_TONES }: { initial: string; index: number; small?: boolean; tones?: readonly Tone[] }) => {
    const [bg, ink] = tone(tones[index % tones.length]!);
    return <View style={[small ? styles.avSm : styles.av, { backgroundColor: bg }]}><UiText style={[small ? styles.avSmText : styles.avText, { color: ink }]}>{initial}</UiText></View>;
  };

  // The host is not asked to register to see people: their list is on the 运营 page.
  const hostRoster = (
    <View style={styles.card} testID="events-detail-host-roster">
      <View style={styles.cardH}><UiText style={styles.h3}>{t("tabPeople")}</UiText><UiText style={styles.lbl}>{t("rosterCountsOnly", { n: data.attendeeCounts.all })}</UiText></View>
      <UiText style={styles.sub}>{t("hostRosterHint")}</UiText>
      <UiPressable accessibilityRole="button" accessibilityLabel={t("hostRosterOpen")} onPress={() => router.push(`${base}/operations?seg=people` as Href)} style={[styles.gateBtn, { alignSelf: "flex-start", marginTop: 12 }]}><UiText style={styles.gateBtnText}>{t("hostRosterOpen")}</UiText></UiPressable>
    </View>
  );
  // 名单锁着（roster-policy A：报名确定前）：只给人数 · 知り合い人数 + 「参加登録すると…」（b12 #382 / #384）。
  const rosterGate = hosting ? hostRoster : (
    <View style={styles.card} testID="events-detail-roster-gate">
      <View style={styles.cardH}><UiText style={styles.h3}>{t("tabPeople")}</UiText><UiText style={styles.lbl}>{t("rosterCounts", { k: data.attendeeCounts.known, n: data.attendeeCounts.all })}</UiText></View>
      <View style={styles.gate}>
        <Svg width={220} height={220} style={styles.gateGlow}>
          <Defs><RadialGradient id="rosterGlow" cx="50%" cy="50%" r="50%"><Stop offset={0} stopColor={colors.macLav} /><Stop offset={0.7} stopColor={colors.macLav} stopOpacity={0} /></RadialGradient></Defs>
          <Rect x={0} y={0} width={220} height={220} fill="url(#rosterGlow)" opacity={0.9} />
        </Svg>
        <UiText style={styles.gateEmoji}>👥</UiText>
        <UiText style={styles.gateTitle}>{t(inReview ? "rosterGatePending" : "rosterGateBody")}</UiText>
        <UiText style={[styles.lbl, styles.gateNote]}>{t("rosterGateNote")}</UiText>
        {inReview ? null : <UiPressable accessibilityRole="button" accessibilityLabel={t("rosterGateCta")} onPress={() => router.push(`${base}/register` as Href)} style={styles.gateBtn}><UiText style={styles.gateBtnText}>{t("rosterGateCta")}</UiText></UiPressable>}
      </View>
    </View>
  );
  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { paddingTop: topGap }]} testID="events-detail">
      <ShellBackground />
      <ScrollView ref={scroller} contentContainerStyle={styles.pad} onContentSizeChange={tryJump} onScrollBeginDrag={() => { userScrolled.current = true; }}>
        <EmailNotice />
        {header}
        {offlineAt ? <EventsOfflineNotice lastSyncedAt={offlineAt} /> : null}
        <View style={[styles.card, styles.coverCard]}>
          {cover ? <Image source={{ uri: cover }} resizeMode="cover" style={styles.coverImage} accessibilityIgnoresInvertColors testID="events-detail-cover-image" /> : (
            <Cover style={styles.cover}>
              <View style={[styles.emo, { backgroundColor: colors.surface }]}><UiText style={styles.coverEmo}>{data.emoji}</UiText></View>
            </Cover>
          )}
          <View style={styles.coverBody}>
            {publicOrganizerName(data.organizer.name) ? <UiText style={styles.lbl}>{publicOrganizerName(data.organizer.name)}</UiText> : null}
            <UiText style={styles.title}>{data.title}</UiText>
            {remainingChip ? <View style={[styles.chip, styles.statusChip, ended || holding ? null : { backgroundColor: colors.macApricot }]} testID="events-detail-status"><UiText style={[styles.chipText, ended || holding ? null : { color: colors.macApricotInk }]} numberOfLines={1}>{remainingChip}</UiText></View> : null}
            <View style={styles.facts}>{facts.map((fact) => <View key={fact.icon} style={styles.fact}><Icon name={fact.icon} size={16} color={colors.ink3} /><UiText style={styles.factText}>{fact.text}</UiText></View>)}</View>
          </View>
        </View>
        {record ? (
          <GradientCard from={colors.macLav} style={styles.gap} testID="events-detail-record">
            <View style={styles.cardH}><UiText style={styles.h3}>{t("recordTitle")}</UiText><UiText style={styles.lbl}>{t("recordReadOnly")}</UiText></View>
            <View style={styles.mini3}>
              {([["recordTablemates", record.tablemates], ["recordRecommended", record.recommended], ["recordExchanged", record.exchanged]] as const).map(([label, n]) => (
                <View key={label} style={styles.miniCell}><UiText style={styles.lbl}>{t(label)}</UiText><UiText style={styles.miniNum}>{n}<UiText style={styles.lbl}>{t("recordPeopleUnit")}</UiText></UiText></View>
              ))}
            </View>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("recordOpen")} onPress={() => router.push(`${base}/live?record=1` as Href)} style={styles.recordBtn} testID="events-detail-record-open"><UiText style={styles.ctaMainText}>{t("recordOpen")}</UiText></UiPressable>
          </GradientCard>
        ) : null}
        {/* 一行一件事实；「会いたい人」点进去 = 参加者 tab 的「プランに合う」。原来评分条打开的「判定の内訳」不再从这里进。 */}
        <RelevanceCard relevance={relevance} t={rt} style={styles.gap}
          onPeople={() => router.push(`${base}/people${data.attendeeCounts.planFit > 0 ? "?filter=planFit" : ""}` as Href)} />
        {showHostContact(data) ? <HostContactCard contact={data.hostContact} t={t} status={data.registration.status} priceYen={data.priceYen} style={styles.gap} /> : null}
        {/* 2026-11-21 用户拍板：去掉 4 个 tab，一页读完 紹介 → アジェンダ → 参加者 → 主催（与 Web 同序）；参加者只放预览，全名单另开页。 */}
        <View>
          <SectionHead title={t("tabIntro")} />
          <View style={styles.card} testID="events-detail-intro">
            <UiText style={[styles.sub, styles.desc, data.description?.trim() ? null : { color: colors.ink3 }]} numberOfLines={descOpen ? undefined : DESC_LINES}
              onTextLayout={(event) => { if (!descOpen && event.nativeEvent.lines.length >= DESC_LINES) setDescLong(true); }}>{data.description?.trim() || t("noDescription")}</UiText>
            {descLong && !descOpen ? <UiPressable accessibilityRole="button" accessibilityLabel={t("readMore")} onPress={() => setDescOpen(true)} style={styles.moreLink} testID="events-detail-read-more"><UiText style={styles.moreLinkText}>{t("readMore")}</UiText><Icon name="down" size={13} color={colors.ink2} /></UiPressable> : null}
          </View>
        </View>
        {data.agenda.length ? (
          <View onLayout={(event) => { sectionY.current.agenda = event.nativeEvent.layout.y; tryJump(); }}>
            <SectionHead title={t("tabAgenda")} right={t("agendaItemsN", { n: data.agenda.length })} />
            <View style={styles.card} testID="events-detail-agenda">
              {(agendaOpen ? data.agenda : data.agenda.slice(0, AGENDA_ITEMS)).map((item, index) => (
                <View key={`${item.at}-${item.title}`} style={[styles.row, index ? { marginTop: 12 } : null, { alignItems: "flex-start" }]}>
                  <UiText style={styles.agendaAt}>{item.at}</UiText>
                  <View style={styles.grow}><UiText style={styles.metaTitle}>{item.title}</UiText>{item.detail ? <UiText style={styles.lbl}>{item.detail}</UiText> : null}</View>
                </View>
              ))}
              {!agendaOpen && data.agenda.length > AGENDA_ITEMS ? <UiPressable accessibilityRole="button" accessibilityLabel={t("agendaAll")} onPress={() => setAgendaOpen(true)} style={styles.moreLink} testID="events-detail-agenda-all"><UiText style={styles.moreLinkText}>{t("agendaAll")}</UiText><Icon name="down" size={13} color={colors.ink2} /></UiPressable> : null}
            </View>
          </View>
        ) : null}
        <View onLayout={(event) => { sectionY.current.people = event.nativeEvent.layout.y; tryJump(); }}>
          <SectionHead title={t("tabPeople")} right={data.rosterLocked || hosting ? undefined : t(ended ? "peopleAppliedN" : "peopleN", { n: data.attendeeCounts.all })} />
          {hosting ? hostRoster : data.rosterLocked && data.attendeeCounts.all > 0 ? rosterGate : data.assessmentPeopleUnknown && data.speakerCandidates?.length ? (
            <View style={styles.card} testID="events-detail-meet">
              <View style={styles.cardH}><UiText style={styles.h3}>{t("meetTitle")}</UiText><UiText style={styles.lbl}>{t("meetFromSpeakers")}</UiText></View>
              {data.speakerCandidates.map((speaker, index) => (
                <View key={speaker.name} style={styles.li}>
                  {index ? <View style={styles.liLine} /> : null}
                  <View style={[styles.emoSm, { backgroundColor: tone(SPEAKER_TONES[index % SPEAKER_TONES.length]!)[0] }]}><UiText style={styles.emoSmText}>{speaker.emoji}</UiText></View>
                  <View style={styles.grow}><UiText style={styles.metaTitle} numberOfLines={1}>{t("speakerWithRole", { label: speaker.label, name: speaker.name })}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{speaker.note}</UiText></View>
                </View>
              ))}
              <UiPressable accessibilityRole="button" accessibilityLabel={t("notifyWhenPublic")} onPress={() => void save("notifyOn")} style={styles.btnSm}><Icon name="bell" size={16} color={colors.ink} /><UiText style={styles.btnSmText}>{t("notifyWhenPublic")}</UiText></UiPressable>
            </View>
          ) : data.attendeeCounts.all === 0 || data.attendees.length === 0 ? (
            <View style={styles.card}><UiText style={[styles.sub, { color: colors.ink3 }]}>{holding && data.attendeeCounts.all === 1 ? t("onlyYou") : t("noPeopleHere")}</UiText></View>
          ) : (
            <View style={styles.card} testID="events-detail-people">
              <View style={[styles.row, { gap: 12 }]}>
                <View style={styles.avs}>{data.attendees.slice(0, 5).map((person, index) => <View key={person.attendeeId} style={[styles.avsItem, index ? styles.avsOverlap : null]}><Avatar initial={person.initial} index={index} small /></View>)}</View>
                <UiText style={[styles.lbl, styles.grow]}>{t("peopleFitKnown", { fit: data.attendeeCounts.planFit, known: data.attendeeCounts.known })}</UiText>
              </View>
              {preview.length ? <UiText style={[styles.lbl, { marginTop: 14 }]}>{t(fit.length ? "peopleFitTitle" : "peopleSomeTitle")}</UiText> : null}
              {preview.map((person, index) => (
                <UiPressable key={person.attendeeId} accessibilityRole={canOpenPeople ? "button" : undefined} accessibilityLabel={person.name} disabled={!canOpenPeople} onPress={() => openPerson(person, index)} style={styles.li} testID={`events-detail-person-${person.attendeeId}`}>
                  {index ? <View style={styles.liLine} /> : null}
                  <Avatar initial={person.initial} index={index} />
                  <View style={styles.grow}><UiText style={styles.metaTitle} numberOfLines={1}>{[person.name, person.org].filter(Boolean).join(" · ")}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{person.note ?? person.role ?? ""}</UiText></View>
                  {canOpenPeople ? <Icon name="right" size={16} color={colors.ink4} /> : null}
                </UiPressable>
              ))}
              {knownLine ? <UiText style={[styles.lbl, { marginTop: 8 }]} numberOfLines={2}>{t("peopleKnownLine", { names: knownLine })}</UiText> : null}
              <UiPressable accessibilityRole="button" accessibilityLabel={t("peopleSeeAllN", { n: data.attendeeCounts.all })} onPress={() => router.push(`${base}/people` as Href)} style={styles.allBtn} testID="events-detail-people-all"><UiText style={styles.btnSmText}>{t("peopleSeeAllN", { n: data.attendeeCounts.all })}</UiText></UiPressable>
            </View>
          )}
        </View>
        {publicOrganizerName(data.organizer.name) ? (
          <View>
            <SectionHead title={t("tabHost")} />
            <UiPressable accessibilityRole={data.organizer.slug ? "link" : undefined} disabled={!data.organizer.slug} onPress={() => { if (data.organizer.slug) router.push(`/o/${encodeURIComponent(data.organizer.slug)}` as Href); }} style={styles.card} testID="events-detail-organizer"><View style={[styles.row, { gap: 12 }]}>
              <View style={[styles.emo, { backgroundColor: colors.macLav }]}><UiText style={styles.emoText}>{data.organizer.emoji ?? data.emoji}</UiText></View>
              <View style={styles.grow}>
                <UiText style={styles.metaTitle}>{publicOrganizerName(data.organizer.name)}</UiText>
                {data.organizer.editions ? <UiText style={styles.lbl}>{t("hostEditions", { n: data.organizer.editions })}</UiText> : null}
              </View>
              {data.organizer.slug ? <Icon name="right" size={16} color={colors.ink3} /> : null}
            </View></UiPressable>
          </View>
        ) : null}
      </ScrollView>
      {/* After 取消参加 the person can register again (the server reactivates); no CTA left them stuck. */}
      {hosting ? (
        <View style={[styles.ctabar, scheme === "dark" ? shadows.floatDark : shadows.float]} testID="events-detail-cta">
          <GlassSurface radius={28} style={styles.ctaGlass}>
            {ended ? null : <UiPressable accessibilityRole="button" accessibilityLabel={t("hostCheckIn")} onPress={() => router.push(`${base}/operations/check-in` as Href)} style={styles.ctaSecondary} testID="events-detail-host-checkin"><UiText style={styles.ctaSecondaryText}>{t("hostCheckIn")}</UiText></UiPressable>}
            <UiPressable accessibilityRole="button" accessibilityLabel={t("hostManage")} onPress={() => router.push(`${base}/operations` as Href)} style={styles.ctaMain} testID="events-detail-host-manage"><UiText style={styles.ctaMainText}>{t("hostManage")}</UiText></UiPressable>
          </GlassSurface>
        </View>
      ) : ((status === "none" || status === "cancelled") && canRegister) || holding ? (
        <View style={[styles.ctabar, scheme === "dark" ? shadows.floatDark : shadows.float]} testID="events-detail-cta">
          <GlassSurface radius={28} style={styles.ctaGlass}>
            {holding ? (
              <>
                {/* 审核中 / 候补：画板没画这个状态的底栏 → 左侧一行不可点的状态，右侧「⋯」（2026-11-26 主会话定）。 */}
                {inReview && !ended ? <UiText style={[styles.lbl, styles.ctaStatus]} testID="events-detail-cta-status">{t(status === "waitlisted" ? "ctaWaitlistedNote" : "ctaPendingNote")}</UiText> : null}
                {ended || attended ? null : <UiPressable accessibilityRole="button" accessibilityLabel={t("moreActions")} onPress={() => setMenuOpen(true)} style={styles.lbtn} testID="events-detail-more"><Icon name="more" size={20} color={colors.ink2} /></UiPressable>}
                {/* 见面准备只给已确定参加的人（审核中 / 候补不显示，同 Web）。 */}
                {!ended && !attended && status !== "registered" ? null : <UiPressable accessibilityRole="button" accessibilityLabel={t(ended ? "goAfter" : attended ? "goVenue" : "goPrep")} onPress={() => router.push(`${base}/${ended ? "after" : attended ? "live" : "prep"}` as Href)} style={styles.ctaMain}><UiText style={styles.ctaMainText}>{t(ended ? "goAfter" : attended ? "goVenue" : "goPrep")}</UiText></UiPressable>}
              </>
            ) : (
              <>
                <UiPressable accessibilityRole="button" accessibilityLabel={t(saved ? "savedEvent" : "saveEvent")} accessibilityState={{ selected: saved }} onPress={() => void save()} style={styles.lbtn} testID="events-detail-save">{saved ? <FilledStar color={colors.macApricotInk} /> : <Icon name="star" size={20} color={colors.ink2} />}</UiPressable>
                {/* 取り消し済みも受付中ならもう一度申し込める；満席は押せない。 */}
                {full ? <UiPressable accessibilityRole="button" accessibilityLabel={t("spFull")} accessibilityState={{ disabled: true }} disabled style={[styles.ctaMain, styles.ctaFull]} testID="events-detail-full"><UiText style={[styles.ctaMainText, { color: colors.ink3Text }]}>{t("spFull")}</UiText></UiPressable>
                  : <UiPressable accessibilityRole="button" accessibilityLabel={t(waitlist ? "spWaitlist" : "ctaRegisterAi")} onPress={() => router.push(`${base}/register` as Href)} style={styles.ctaMain} testID="events-detail-register"><UiText style={styles.ctaMainText}>{t(waitlist ? "spWaitlist" : "ctaRegisterAi")}</UiText></UiPressable>}
              </>
            )}
          </GlassSurface>
        </View>
      ) : null}
      <ActionSheet visible={menuOpen} title={data.title} onClose={() => setMenuOpen(false)} onSelect={(key) => void menu(key)}
        options={[{ key: "calendar", label: t("addToCalendar") }, { key: "profile", label: t("editJoinProfile") }, { key: "cancel", label: t("cancelDo"), destructive: true }]} />
      <AttendeeSheet eventId={eventId} person={sheetPerson} onClose={() => setSheetPerson(null)} />
      <CancelSheet visible={cancelOpen} event={data} t={t} language={language} busy={busy} onKeep={() => setCancelOpen(false)} onCancel={() => void confirmCancel()} />
    </SafeAreaView>
  );
}

// kit（b2 #14–#16）：.scroll 0 18 130 · .cover 96 · .facts 12.5 gap 6 · .scorebar r20 10/14 · .utabs gap 20 · .li 11 0 · .ghost-row 46 · .ctabar bottom 26 r28 8。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  page: { backgroundColor: colors.bg, flex: 1 },
  pad: { paddingBottom: 130, paddingHorizontal: SHELL_GUTTER },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  grow: { flex: 1, minWidth: 0 },
  gap: { marginTop: 14 },
  // Section heads of the one-page detail (proposal .sec-h: 17/800, 22 above, 8 below).
  secHead: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginBottom: 8, marginTop: 22, paddingHorizontal: 2 },
  secTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  moreLink: { alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 4, marginTop: 8, paddingVertical: 4 },
  moreLinkText: { color: colors.ink2, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  allBtn: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 40, justifyContent: "center", marginTop: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  flat: { backgroundColor: colors.surface2 },
  coverCard: { overflow: "hidden", padding: 0 },
  cover: { alignItems: "flex-end", flexDirection: "row", height: 96, paddingBottom: 12, paddingHorizontal: 16 },
  emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoText: { fontSize: 23, lineHeight: 28 },
  coverEmo: { fontSize: 28, lineHeight: 35 },
  // 2:1 图片（主办方上传）：卡片满宽，上角跟卡片圆角（coverCard overflow hidden）。
  coverImage: { aspectRatio: 2, backgroundColor: colors.surface2, width: "100%" },
  statusChip: { marginTop: 8 },
  // 会場の記録 入口卡（提案 ①）：linear-gradient(150deg, mac-lav, surface 65%) · .mini3 三格 surface-2 r14 10/11 · 主按钮 40。
  mini3: { flexDirection: "row", gap: 8 },
  miniCell: { backgroundColor: colors.surface2, borderRadius: 14, flex: 1, paddingHorizontal: 11, paddingVertical: 10 },
  miniNum: { color: colors.ink, fontSize: 19, fontWeight: "800", lineHeight: 23 },
  recordBtn: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 40, justifyContent: "center", marginTop: 14 },
  coverBody: { paddingBottom: 16, paddingHorizontal: 16, paddingTop: 14 },
  title: { color: colors.ink, fontSize: 21, fontWeight: "700", lineHeight: 28, marginTop: 2 },
  facts: { gap: 6, marginTop: 10 },
  fact: { alignItems: "center", flexDirection: "row", gap: 8 },
  factText: { color: colors.ink2, fontSize: 15, lineHeight: 23 },
  chip: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: colors.ink2, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  sub: { color: colors.ink2, fontSize: 15, lineHeight: 23 },
  desc: { lineHeight: 21.875 },
  cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  h3: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
  metaTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
  metaSub: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
  emoSm: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  emoSmText: { fontSize: 19, lineHeight: 25 },
  av: { alignItems: "center", borderRadius: radius.pill, height: 38, justifyContent: "center", width: 38 },
  avText: { fontSize: 16, fontWeight: "800", lineHeight: 20 },
  avSm: { alignItems: "center", borderRadius: radius.pill, height: 26, justifyContent: "center", width: 26 },
  avSmText: { fontSize: 13, fontWeight: "800", lineHeight: 16 },
  avs: { flexDirection: "row" },
  avsItem: { borderColor: colors.surface, borderRadius: radius.pill, borderWidth: 2 },
  avsOverlap: { marginLeft: -8 },
  knownTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  ghostRow: { alignItems: "center", borderColor: colors.surface3, borderRadius: 14, borderStyle: "dashed", borderWidth: 1.5, flexDirection: "row", gap: 10, height: 46, paddingHorizontal: 14 },
  ghostDot: { backgroundColor: colors.surface2, borderRadius: radius.pill, height: 26, width: 26 },
  ghostText: { color: colors.ink4, flex: 1, fontSize: 14, lineHeight: 21 },
  btnSm: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 32, justifyContent: "center", marginTop: 12, paddingHorizontal: 12 },
  btnSmText: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  peopleCard: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 6 },
  agendaAt: { color: colors.ink3, fontSize: 14, fontWeight: "700", lineHeight: 25, width: 44 },
  // kit .guide（b12 #382）：surface-2 r18 18/14 居中 + 右上 220 lav 光晕。
  gate: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 18, overflow: "hidden", paddingHorizontal: 14, paddingVertical: 18 },
  gateGlow: { position: "absolute", right: -80, top: -90 },
  gateEmoji: { fontSize: 34, lineHeight: 34 },
  gateTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25, marginTop: 8, textAlign: "center" },
  gateNote: { marginBottom: 12, marginTop: 4, textAlign: "center" },
  gateBtn: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 40, justifyContent: "center", paddingHorizontal: 16 },
  gateBtnText: { color: colors.bg, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  ctabar: { borderRadius: 28, bottom: 26, left: 12, position: "absolute", right: 12 },
  ctaGlass: { alignItems: "center", flexDirection: "row", gap: 8, padding: 8 },
  lbtn: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, height: 46, justifyContent: "center", width: 46 },
  ctaStatus: { color: colors.ink2, flex: 1, fontSize: 14, fontWeight: "600", paddingLeft: 12 },
  ctaMain: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, flex: 1, height: 46, justifyContent: "center", paddingHorizontal: 16 },
  ctaMainText: { color: colors.bg, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  // 満席：同 Web 的 disabled .btn（浅底、ink-3 字），不可点。
  ctaFull: { backgroundColor: colors.surface2 },
  ctaSecondary: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, height: 46, justifyContent: "center", paddingHorizontal: 18 },
  ctaSecondaryText: { color: colors.ink, fontSize: 15, fontWeight: "600", lineHeight: 22 },
}));
