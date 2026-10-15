// R27 イベント詳細（App；b2 #14 参加者 0 / #15 少 / #16 多 · 参加者 tab）：封面卡（facts）· 评分条（吸顶）· 下划线 tab ·
// 紹介（会えそうな人：未公开时按登壇者推定）/ 参加者（プランに合う / 知り合い / 全員）· 底部 CTA。
// 已报名时 CTA 位置换成 ⋯（カレンダーに追加 / 参加用プロフィールを編集 / 参加を取り消す，与 Web b12 378–381 §31 同位置）+ 会う準備へ。
// 数据：GET /api/events/[id]/overview（规则评估，不调 AI）。
import { useLocalSearchParams, useRouter, type Href } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { Platform, ScrollView, Share, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import type { EventOverviewResponse } from "../../../api/contract/event-overview";
import { ShellBackground } from "../../../components/ShellBackground";
import { SHELL_GUTTER, ShellTopBar, useShellTopGap } from "../../../components/ShellTopBar";
import { ActionSheet, GlassSurface, Icon, IconButton, Segmented, UiPressable, UiText, useToast, type IconName } from "../../../components/ui";
import Svg, { Defs, Rect, Stop } from "../../../components/ui/svg";
import { LinearGradient } from "../../plan/plan-svg";
import { createThemedStyles, useOrbitTheme } from "../../../design/theme";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { radius, shadows } from "../../../design/tokens";
import { CancelSheet } from "./CancelSheet";
import { newIdempotencyKey, useEventsApi } from "./events-api";
import { useJourneyApi } from "./journey-api";
import { eventRange, feeText, rowTone } from "./journey-model";
import { ringColor, verdictKey } from "./events-model";
import { ScoreRing } from "./ScoreRing";
import { useJourneyT } from "./useJourneyT";

type Tab = "intro" | "agenda" | "host" | "people";
type Filter = "planFit" | "known" | "all";
type Tone = "lav" | "pink" | "blue" | "teal" | "apricot";
/** 头像色（b2 #15 / #16）：lav · blue · teal · pink · blue · apricot 轮换；知り合い叠头像 pink · teal · blue。 */
const AV_TONES: readonly Tone[] = ["lav", "blue", "teal", "pink", "blue", "apricot"];
const KNOWN_TONES: readonly Tone[] = ["pink", "teal", "blue"];
const SPEAKER_TONES: readonly Tone[] = ["lav", "blue"];

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

export function EventDetailPage() {
  const { styles, colors } = useStyles();
  const { scheme } = useOrbitTheme();
  const locale = useOrbitLocale();
  const { t, language } = useJourneyT();
  const router = useRouter();
  const toast = useToast();
  const api = useJourneyApi();
  const eventsApi = useEventsApi();
  const topGap = useShellTopGap();
  const params = useLocalSearchParams<{ id?: string; tab?: string }>();
  const eventId = String(params.id ?? "");
  const [data, setData] = useState<EventOverviewResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>(params.tab === "people" || params.tab === "agenda" || params.tab === "host" ? params.tab : "intro");
  const [filter, setFilter] = useState<Filter>("planFit");
  const [whyOpen, setWhyOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    void api.overview(eventId).then((result) => { if (!live) return; if (result.ok) setData(result.data); else setMissing(true); });
    return () => { live = false; };
  }, [api, eventId]);

  const tone = (key: Tone) => ({ apricot: [colors.macApricot, colors.macApricotInk], blue: [colors.macBlue, colors.macBlueInk], lav: [colors.macLav, colors.macLavInk], pink: [colors.macPink, colors.macPinkInk], teal: [colors.macTeal, colors.macTealInk] } as const)[key];
  const base = `/events/${encodeURIComponent(eventId)}`;
  const share = () => { if (data) Share.share({ message: data.title }).catch(() => undefined); };
  const status = data?.registration.status ?? "none";
  const holding = status === "registered" || status === "pending_review" || status === "waitlisted";
  const menu = async (key: string) => {
    setMenuOpen(false);
    if (key === "calendar") {
      const result = await api.joinTentative(eventId);
      if (result.ok) toast.success(t("calendarAdded")); else toast.error(t("cancelFailed"));
    } else if (key === "profile") router.push(`${base}/register` as Href);
    else if (key === "cancel") setCancelOpen(true);
  };
  // ★ 保存 / 公開されたら知らせる = 记成 R26 的评估（出现在「評価」列表；名单首次公开时由重算任务通知；同 Web）。
  const save = async (done: "savedToAssess" | "notifyOn" = "savedToAssess") => {
    const created = await eventsApi.create({ eventId, idempotencyKey: newIdempotencyKey(), sourceKind: "orbit_event" });
    if (created.ok) toast.success(t(done)); else toast.error(locale.t("eventsV2.genericError"));
  };
  const confirmCancel = async () => {
    setBusy(true);
    const result = await api.joinCancel(eventId);
    setBusy(false);
    setCancelOpen(false);
    if (!result.ok) { toast.error(t("cancelFailed")); return; }
    setData((current) => (current ? { ...current, registration: { ...current.registration, status: "cancelled" } } : current));
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
        <View style={styles.pad}>{header}{missing ? <View style={styles.card}><UiText style={styles.sub}>{t("notFound")}</UiText></View> : null}</View>
      </SafeAreaView>
    );
  }

  const assessment = data.signedOut ? null : data.assessment ?? null;
  const verdictTone = assessment ? rowTone({ verdict: assessment.verdict }, 0).chip : null;
  const facts: { icon: IconName; text: string }[] = [
    { icon: "calendar", text: eventRange(data.startsAt, data.endsAt, language) },
    { icon: "pin", text: data.venue ?? "—" },
    { icon: "ticket", text: [feeText(data.priceYen, t), data.capacity ? t("capacityN", { n: data.capacity }) : null, data.review ? t("reviewYes") : null].filter(Boolean).join(" · ") },
  ];
  const remainingChip = typeof data.remaining === "number" ? t(data.deadlineSoon ? "deadlineChip" : "openChip", { n: data.remaining }) : null;
  const people = data.attendees.filter((person) => (filter === "planFit" ? person.planFit : filter === "known" ? person.known : true));
  const fit = data.attendees.filter((person) => person.planFit && !person.known).slice(0, 3);
  const known = data.knownAttendees;
  const knownLine = known.map((person) => `${t("honorific", { name: person.name.split(/\s+/)[0] ?? person.name })}${person.speaker ? t("speakerTag") : ""}`)
    .reduce((line, item) => (line ? `${line}${/[）)]$/.test(line) ? "· " : " · "}${item}` : item), "");
  const Avatar = ({ initial, index, small, tones = AV_TONES }: { initial: string; index: number; small?: boolean; tones?: readonly Tone[] }) => {
    const [bg, ink] = tone(tones[index % tones.length]!);
    return <View style={[small ? styles.avSm : styles.av, { backgroundColor: bg }]}><UiText style={[small ? styles.avSmText : styles.avText, { color: ink }]}>{initial}</UiText></View>;
  };
  const knownCard = (title: string, detail: string, avatars: readonly { initial: string }[], tones: readonly Tone[]) => (
    <View style={[styles.card, styles.flat, styles.gap]}>
      <View style={styles.row}>
        <View style={styles.avs}>{avatars.map((person, index) => <View key={`${person.initial}-${index}`} style={[styles.avsItem, index ? styles.avsOverlap : null]}><Avatar initial={person.initial} index={index} small tones={tones} /></View>)}</View>
        <View style={styles.grow}><UiText style={styles.knownTitle}>{title}</UiText><UiText style={styles.lbl}>{detail}</UiText></View>
      </View>
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { paddingTop: topGap }]} testID="events-detail">
      <ShellBackground />
      <ScrollView contentContainerStyle={styles.pad} stickyHeaderIndices={assessment ? [2] : undefined}>
        {header}
        <View style={[styles.card, styles.coverCard]}>
          <Cover style={styles.cover}>
            <View style={[styles.emo, { backgroundColor: colors.surface }]}><UiText style={styles.coverEmo}>{data.emoji}</UiText></View>
            {remainingChip ? <View style={[styles.chip, styles.coverChip]}><UiText style={styles.chipText} numberOfLines={1}>{remainingChip}</UiText></View> : null}
          </Cover>
          <View style={styles.coverBody}>
            <UiText style={styles.lbl}>{data.organizer.name}</UiText>
            <UiText style={styles.title}>{data.title}</UiText>
            <View style={styles.facts}>{facts.map((fact) => <View key={fact.icon} style={styles.fact}><Icon name={fact.icon} size={16} color={colors.ink3} /><UiText style={styles.factText}>{fact.text}</UiText></View>)}</View>
          </View>
        </View>
        {assessment ? (
          <View style={styles.scorebar} testID="events-detail-score">
            <View style={styles.scoreRow}>
              <ScoreRing size={50} stroke={6} value={assessment.score} color={colors[ringColor(assessment.score)]} label={String(assessment.score)} fontSize={15} />
              <View style={styles.grow}>
                <View style={[styles.row, { gap: 6 }]}>
                  <View style={[styles.chip, verdictTone ? { backgroundColor: tone(verdictTone)[0] } : null]}><UiText style={[styles.chipText, verdictTone ? { color: tone(verdictTone)[1] } : null]}>{locale.t(`eventsV2.${verdictKey(assessment.verdict)}`)}</UiText></View>
                  <UiPressable accessibilityRole="button" accessibilityLabel={t("why")} accessibilityState={{ expanded: whyOpen }} onPress={() => setWhyOpen((value) => !value)} style={styles.why}><UiText style={styles.whyText}>?</UiText></UiPressable>
                </View>
                <UiText style={[styles.lbl, { marginTop: 3 }]} numberOfLines={1}>{t("critLine", { g: assessment.display.goalFit, p: data.assessmentPeopleUnknown ? "—" : assessment.display.people, t: assessment.display.timeCost })}</UiText>
              </View>
              <Icon name="right" size={16} color={colors.ink} />
            </View>
            {whyOpen ? <View style={styles.whyBody}><UiText style={styles.whyBodyText}>{assessment.basis}</UiText></View> : null}
          </View>
        ) : null}
        <View style={styles.utabs} accessibilityRole="tablist">
          {(["intro", "agenda", "host", "people"] as const).map((key) => (
            <UiPressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={styles.utab} testID={`events-detail-tab-${key}`}>
              <UiText style={[styles.utabText, tab === key ? styles.utabOn : null]}>{t(key === "intro" ? "tabIntro" : key === "agenda" ? "tabAgenda" : key === "host" ? "tabHost" : "tabPeople")}{key === "people" ? <UiText style={styles.utabCount}>{` ${data.attendeeCounts.all}`}</UiText> : null}</UiText>
              {tab === key ? <View style={styles.utabLine} /> : null}
            </UiPressable>
          ))}
        </View>
        {tab === "intro" ? (
          <>
            <View style={styles.card}><UiText style={[styles.sub, styles.desc]}>{data.description}</UiText></View>
            {data.assessmentPeopleUnknown && data.speakerCandidates?.length ? (
              <View style={[styles.card, styles.gap]} testID="events-detail-meet">
                <View style={styles.cardH}><UiText style={styles.h3}>{t("meetTitle")}</UiText><UiText style={styles.lbl}>{t("meetFromSpeakers")}</UiText></View>
                {data.speakerCandidates.map((speaker, index) => (
                  <View key={speaker.name} style={styles.li}>
                    {index ? <View style={styles.liLine} /> : null}
                    <View style={[styles.emoSm, { backgroundColor: tone(SPEAKER_TONES[index % SPEAKER_TONES.length]!)[0] }]}><UiText style={styles.emoSmText}>{speaker.emoji}</UiText></View>
                    <View style={styles.grow}><UiText style={styles.metaTitle} numberOfLines={1}>{t("speakerWithRole", { label: speaker.label, name: speaker.name })}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{speaker.note}</UiText></View>
                  </View>
                ))}
                <View style={[styles.ghostRow, { marginTop: 6 }]}><View style={styles.ghostDot} /><UiText style={styles.ghostText}>{t("ghostMeet")}</UiText></View>
                <View style={[styles.ghostRow, { marginTop: 8 }]}><View style={styles.ghostDot} /><UiText style={styles.ghostText}>{t("ghostKnown")}</UiText></View>
                <UiPressable accessibilityRole="button" accessibilityLabel={t("notifyWhenPublic")} onPress={() => void save("notifyOn")} style={styles.btnSm}><Icon name="bell" size={16} color={colors.ink} /><UiText style={styles.btnSmText}>{t("notifyWhenPublic")}</UiText></UiPressable>
              </View>
            ) : fit.length ? (
              <View style={[styles.card, styles.gap]} testID="events-detail-meet">
                <View style={styles.cardH}><UiText style={styles.h3}>{t("meetTitle")}</UiText><UiText style={styles.lbl}>{t("meetFromAttendees", { n: data.attendeeCounts.all })}</UiText></View>
                {fit.map((person, index) => (
                  <View key={person.attendeeId} style={styles.li}>
                    {index ? <View style={styles.liLine} /> : null}
                    <Avatar initial={person.initial} index={index} />
                    <View style={styles.grow}><UiText style={styles.metaTitle} numberOfLines={1}>{[person.name, person.org].filter(Boolean).join(" · ")}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{person.note ?? ""}</UiText></View>
                  </View>
                ))}
              </View>
            ) : null}
            {data.knownNote ? knownCard(data.knownNote.text, data.knownNote.detail ?? "", known.slice(0, 1), ["teal"]) : null}
          </>
        ) : null}
        {tab === "agenda" ? (
          <View style={styles.card}>{data.agenda.map((item, index) => (
            <View key={`${item.at}-${item.title}`} style={[styles.row, index ? { marginTop: 12 } : null, { alignItems: "flex-start" }]}>
              <UiText style={styles.agendaAt}>{item.at}</UiText>
              <View style={styles.grow}><UiText style={styles.metaTitle}>{item.title}</UiText>{item.detail ? <UiText style={styles.lbl}>{item.detail}</UiText> : null}</View>
            </View>
          ))}</View>
        ) : null}
        {tab === "host" ? (
          <View style={styles.card}><View style={[styles.row, { gap: 12 }]}>
            <View style={[styles.emo, { backgroundColor: colors.macLav }]}><UiText style={styles.emoText}>{data.organizer.emoji ?? data.emoji}</UiText></View>
            <View style={styles.grow}><UiText style={styles.metaTitle}>{data.organizer.name}</UiText><UiText style={styles.lbl}>{t("hostEditions", { n: data.organizer.editions ?? 0 })}</UiText></View>
          </View></View>
        ) : null}
        {tab === "people" ? (
          <>
            <Segmented<Filter> accessibilityLabel={t("tabPeople")} value={filter} onChange={setFilter}
              segments={[{ key: "planFit", label: t("segPlanFit", { n: data.attendeeCounts.planFit }) }, { key: "known", label: t("segKnown", { n: data.attendeeCounts.known }) }, { key: "all", label: t("segAll", { n: data.attendeeCounts.all }) }]} />
            {people.length ? (
              <View style={[styles.card, styles.peopleCard]} testID="events-detail-people">
                {people.map((person, index) => (
                  <View key={person.attendeeId} style={styles.li}>
                    {index ? <View style={styles.liLine} /> : null}
                    <Avatar initial={person.initial} index={index} />
                    <View style={styles.grow}>
                      <UiText style={styles.metaTitle} numberOfLines={1}>{person.name}</UiText>
                      <UiText style={styles.metaSub} numberOfLines={1}>{[person.org, person.role].filter(Boolean).join(" · ")}</UiText>
                      {person.note ? <UiText style={[styles.metaSub, { color: colors.ink2 }]} numberOfLines={1}>{person.note}</UiText> : null}
                    </View>
                    {person.wanted ? <View style={[styles.chip, { alignSelf: "center", backgroundColor: colors.macLav }]}><UiText style={[styles.chipText, { color: colors.macLavInk }]}>{t("legendWanted")}</UiText></View> : null}
                  </View>
                ))}
              </View>
            ) : null}
            {known.length ? knownCard(t("knownAlsoN", { n: known.length }), knownLine, known.slice(0, 3), KNOWN_TONES) : null}
          </>
        ) : null}
      </ScrollView>
      {status === "none" || holding ? (
        <View style={[styles.ctabar, scheme === "dark" ? shadows.floatDark : shadows.float]} testID="events-detail-cta">
          <GlassSurface radius={28} style={styles.ctaGlass}>
            {holding ? (
              <>
                <UiPressable accessibilityRole="button" accessibilityLabel={t("moreActions")} onPress={() => setMenuOpen(true)} style={styles.lbtn} testID="events-detail-more"><Icon name="more" size={20} color={colors.ink2} /></UiPressable>
                <UiPressable accessibilityRole="button" accessibilityLabel={t("goPrep")} onPress={() => router.push(`${base}/prep` as Href)} style={styles.ctaMain}><UiText style={styles.ctaMainText}>{t("goPrep")}</UiText></UiPressable>
              </>
            ) : (
              <>
                <UiPressable accessibilityRole="button" accessibilityLabel={t("saveEvent")} onPress={() => void save()} style={styles.lbtn}><Icon name="star" size={20} color={colors.ink2} /></UiPressable>
                <UiPressable accessibilityRole="button" accessibilityLabel={t("ctaRegisterAi")} onPress={() => router.push(`${base}/register` as Href)} style={styles.ctaMain} testID="events-detail-register"><UiText style={styles.ctaMainText}>{t("ctaRegisterAi")}</UiText></UiPressable>
              </>
            )}
          </GlassSurface>
        </View>
      ) : null}
      <ActionSheet visible={menuOpen} title={data.title} onClose={() => setMenuOpen(false)} onSelect={(key) => void menu(key)}
        options={[{ key: "calendar", label: t("addToCalendar") }, { key: "profile", label: t("editJoinProfile") }, { key: "cancel", label: t("cancelDo"), destructive: true }]} />
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
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  flat: { backgroundColor: colors.surface2 },
  coverCard: { overflow: "hidden", padding: 0 },
  cover: { alignItems: "flex-end", flexDirection: "row", height: 96, paddingBottom: 12, paddingHorizontal: 16 },
  emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoText: { fontSize: 21, lineHeight: 26 },
  coverEmo: { fontSize: 24, lineHeight: 30 },
  coverChip: { backgroundColor: colors.surface, position: "absolute", right: 12, top: 12 },
  coverBody: { paddingBottom: 16, paddingHorizontal: 16, paddingTop: 14 },
  title: { color: colors.ink, fontSize: 19, fontWeight: "700", lineHeight: 25.65, marginTop: 2 },
  facts: { gap: 6, marginTop: 10 },
  fact: { alignItems: "center", flexDirection: "row", gap: 8 },
  factText: { color: colors.ink2, fontSize: 12.5, lineHeight: 18.75 },
  chip: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: colors.ink2, fontSize: 11, fontWeight: "700", lineHeight: 16.5 },
  lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  sub: { color: colors.ink2, fontSize: 12.5, lineHeight: 18.75 },
  desc: { lineHeight: 21.875 },
  scorebar: { backgroundColor: colors.surface, borderRadius: 20, marginTop: 14, paddingHorizontal: 14, paddingVertical: 10 },
  scoreRow: { alignItems: "center", flexDirection: "row", gap: 12 },
  why: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 18, justifyContent: "center", width: 18 },
  whyText: { color: colors.ink3, fontSize: 10.5, fontWeight: "800", lineHeight: 13 },
  whyBody: { backgroundColor: colors.surface2, borderRadius: 14, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  whyBodyText: { color: colors.ink2, fontSize: 12, lineHeight: 19.8 },
  utabs: { borderBottomColor: colors.line, borderBottomWidth: 1, flexDirection: "row", gap: 20, marginBottom: 12, marginTop: 14 },
  utab: { paddingVertical: 9 },
  utabText: { color: colors.ink3, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  utabOn: { color: colors.ink },
  utabCount: { color: colors.ink3, fontFamily: Platform.OS === "ios" ? "ui-rounded" : undefined, fontSize: 10.8, fontWeight: "700" },
  utabLine: { backgroundColor: colors.ink, borderRadius: 2, bottom: -1, height: 2.5, left: 0, position: "absolute", right: 0 },
  cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  h3: { color: colors.ink, fontSize: 14.5, fontWeight: "800", lineHeight: 21.75 },
  li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
  metaTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  metaSub: { color: colors.ink3, fontSize: 12, lineHeight: 18 },
  emoSm: { alignItems: "center", borderRadius: 10, height: 32, justifyContent: "center", width: 32 },
  emoSmText: { fontSize: 17, lineHeight: 22 },
  av: { alignItems: "center", borderRadius: radius.pill, height: 38, justifyContent: "center", width: 38 },
  avText: { fontSize: 13.5, fontWeight: "800", lineHeight: 17 },
  avSm: { alignItems: "center", borderRadius: radius.pill, height: 26, justifyContent: "center", width: 26 },
  avSmText: { fontSize: 11.5, fontWeight: "800", lineHeight: 14 },
  avs: { flexDirection: "row" },
  avsItem: { borderColor: colors.surface, borderRadius: radius.pill, borderWidth: 2 },
  avsOverlap: { marginLeft: -8 },
  knownTitle: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  ghostRow: { alignItems: "center", borderColor: colors.surface3, borderRadius: 14, borderStyle: "dashed", borderWidth: 1.5, flexDirection: "row", gap: 10, height: 46, paddingHorizontal: 14 },
  ghostDot: { backgroundColor: colors.surface2, borderRadius: radius.pill, height: 26, width: 26 },
  ghostText: { color: colors.ink4, flex: 1, fontSize: 12, lineHeight: 18 },
  btnSm: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 32, justifyContent: "center", marginTop: 12, paddingHorizontal: 12 },
  btnSmText: { color: colors.ink, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  peopleCard: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 6 },
  agendaAt: { color: colors.ink3, fontSize: 12, fontWeight: "700", lineHeight: 21, width: 44 },
  ctabar: { borderRadius: 28, bottom: 26, left: 12, position: "absolute", right: 12 },
  ctaGlass: { alignItems: "center", flexDirection: "row", gap: 8, padding: 8 },
  lbtn: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, height: 46, justifyContent: "center", width: 46 },
  ctaMain: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, flex: 1, height: 46, justifyContent: "center", paddingHorizontal: 16 },
  ctaMainText: { color: colors.bg, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
}));
