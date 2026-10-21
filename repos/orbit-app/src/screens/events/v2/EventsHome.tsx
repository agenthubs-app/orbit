// R26 イベント (App; events DESIGN §2.1, app.html #13 / #14 / #15): 🔍 · イベント + 「10月 · 参加予定 N件」 · 📅, then
// 評価 / 参加予定 N / 探す. 評価: 「このイベント、行く価値ある？」 (URL / poster), the 参加予定 carousel and 評価したイベント
// (score order); empty: the three angles, a sample and the 参加コード card. 参加予定: events/mine. 探す: R27 DiscoverPage
// (b2 #8). Scores come from the server (rule-based); nothing here calls AI.
import { useFocusEffect, useGlobalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KitGradient } from "../../plan/plan-kit";
import { eventEmoji } from "../../../api/compute/event-emoji";
import type { EventAssessmentContract } from "../../../api/contract/event-assessment";
import type { MyEventItem } from "../../../api/contract/events-mine";
import { ShellBackground } from "../../../components/ShellBackground";
import { SHELL_GUTTER, ShellTopBar, useShellTopGap } from "../../../components/ShellTopBar";
import { TabPageBar } from "../../../components/TabPageBar";
import { Icon, IconButton, UiPressable, UiText } from "../../../components/ui";
import { SwipeSegments } from "../../../components/ui/Segmented";
import Svg, { Defs, RadialGradient, Rect, Stop } from "../../../components/ui/svg";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { DiscoverPage, discoverQueryFromParams } from "./DiscoverPage";
import { eventAssessmentListSchema } from "./events-api";
import { myEventsResponseSchema } from "../../../api/schema/events-mine";
import { EventsOfflineNotice } from "./EventsOfflineNotice";
import { usePageCopyResource } from "../../../hooks/usePageCopyResource";
import { EVENTS_COPY_FRESH_MS, EVENTS_MINE_UPCOMING_PATH } from "./events-copies";

import { ScoreRing } from "./ScoreRing";
import { appCardLine, appEventWhen, monthOf, orderAssessed, relativeDay, ringColor, verdictKey, verdictTone } from "./events-model";

type Tab = "assess" | "going" | "discover";

export function EventsHome({ scopeKey: _scopeKey }: { scopeKey?: string } = {}) {
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const params = useGlobalSearchParams<{ tab?: string; period?: string; areas?: string; themes?: string; q?: string; filters?: string }>();
  // 探す 的条件也走路由参数（可分享；门禁用来打开筛选弹层 / 搜索中）。
  const discoverQuery = useMemo(() => discoverQueryFromParams(params), [params.period, params.areas, params.themes]); // eslint-disable-line react-hooks/exhaustive-deps
  const topGap = useShellTopGap();
  const [tab, setTab] = useState<Tab>(params.tab === "going" || params.tab === "discover" ? params.tab : "assess");
  const [discoverSubtitle, setDiscoverSubtitle] = useState<string | null>(null);
  // LF2: the three lists are page copies — shown at once, re-read after their fresh window or a write (switching
  // tabs no longer re-reads them), and kept with 「截至」 when the server cannot be reached (not an empty list).
  const listCopy = usePageCopyResource<unknown>("/api/events/assessments", () => false, { copy: { id: "event-assessments" },
    freshForMs: EVENTS_COPY_FRESH_MS, accept: (value) => Array.isArray(value) });
  const upCopy = usePageCopyResource<unknown>(EVENTS_MINE_UPCOMING_PATH, () => false, { copy: { id: "events-mine", variant: "upcoming" },
    freshForMs: EVENTS_COPY_FRESH_MS, accept: (value) => myEventsResponseSchema.safeParse(value).success });
  const pastCopy = usePageCopyResource<unknown>("/api/events/mine?range=past&limit=10&platform=app", () => false, { copy: { id: "events-mine", variant: "past" },
    freshForMs: EVENTS_COPY_FRESH_MS, accept: (value) => myEventsResponseSchema.safeParse(value).success });
  const answered = (state: typeof listCopy) => state.kind === "success" || state.kind === "empty";
  const items = useMemo<EventAssessmentContract[] | null>(() => {
    if (listCopy.kind === "loading") return null;
    const parsed = answered(listCopy) ? eventAssessmentListSchema.safeParse(listCopy.data) : null;
    return parsed?.success ? parsed.data : [];
  }, [listCopy]); // eslint-disable-line react-hooks/exhaustive-deps
  const up = useMemo(() => { const parsed = answered(upCopy) ? myEventsResponseSchema.safeParse(upCopy.data) : null; return parsed?.success ? parsed.data : null; }, [upCopy]); // eslint-disable-line react-hooks/exhaustive-deps
  const before = useMemo(() => { const parsed = answered(pastCopy) ? myEventsResponseSchema.safeParse(pastCopy.data) : null; return parsed?.success ? parsed.data : null; }, [pastCopy]); // eslint-disable-line react-hooks/exhaustive-deps
  const upcoming = useMemo<MyEventItem[]>(() => [...(up?.items ?? [])], [up]);
  const past = useMemo<MyEventItem[]>(() => [...(before?.items ?? [])], [before]);
  const goingCount = up?.upcomingCount ?? 0;
  // 服务端时钟（events-mine `asOf`）：今夜 / 「10月」与参加予定的划分一致（设计稿 fixture 固定时钟）。
  const now = useMemo(() => { const asOf = up?.asOf ? new Date(up.asOf) : null; return asOf && Number.isFinite(asOf.getTime()) ? asOf : new Date(); }, [up]);
  const offlineCopy = [listCopy.copy, upCopy.copy, pastCopy.copy].find((copy) => copy?.offline) ?? null;

  const ordered = useMemo(() => orderAssessed((items ?? []).filter((item) => item.status === "ready" || item.status === "needs_input" || item.status === "reading")), [items]);
  const empty = items !== null && ordered.length === 0 && upcoming.length === 0;
  const month = monthOf(now);
  // app.html #13 空：判定说明；b12 画板 308 有评估但没参加予定：「参加予定はまだありません」。
  const subtitle = tab === "discover" && discoverSubtitle ? discoverSubtitle : empty ? t("eventsV2.subtitleEmpty") : goingCount === 0 ? t("eventsV2.goingEmptyTitle") : t("eventsV2.subtitleGoing", { going: goingCount, month });
  const segments = useMemo(() => [
    { key: "assess" as const, label: t("eventsV2.tabAssess") },
    { key: "going" as const, label: goingCount > 0 && tab !== "discover" ? t("eventsV2.tabGoingCount", { n: goingCount }) : t("eventsV2.tabGoing") },
    { key: "discover" as const, label: t("eventsV2.tabDiscover") },
  ], [t, goingCount, tab]);

  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { paddingTop: topGap }]} testID="events-home">
      <ShellBackground />
      <View style={styles.header}>
        <ShellTopBar title={t("eventsV2.title")} subtitle={subtitle}
          left={<IconButton icon="search" accessibilityLabel={t("eventsV2.searchEvents")} onPress={() => setTab("discover")} />}
          right={<IconButton icon="calendar" accessibilityLabel={t("eventsV2.calendar")} onPress={() => router.push("/task?seg=calendar" as Href)} />} />
      </View>
      {offlineCopy ? <EventsOfflineNotice lastSyncedAt={offlineCopy.lastSyncedAt} reason={offlineCopy.reason} /> : null}
      <SwipeSegments
        variant="seg"
        dots={false}
        segments={segments}
        value={tab}
        onChange={setTab}
        accessibilityLabel={t("eventsV2.tabsLabel")}
        renderPage={(key) => key === "assess"
          ? <AssessPage items={ordered} upcoming={upcoming} empty={empty} now={now} language={language} />
          : key === "going" ? <GoingPage upcoming={upcoming} past={past} now={now} language={language} onDiscover={() => setTab("discover")} />
            : <DiscoverPage onSubtitle={setDiscoverSubtitle} initialQuery={discoverQuery} initialSearch={typeof params.q === "string" ? params.q : ""} openFilters={params.filters === "1"} />}
      />
      <TabPageBar tab="events" />
    </SafeAreaView>
  );
}

function AssessPage({ items, upcoming, empty, now, language }: { items: EventAssessmentContract[]; upcoming: MyEventItem[]; empty: boolean; now: Date; language: string }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const openAssess = (mode: "url" | "poster") => router.push(`/events/assess?mode=${mode}` as Href);
  const coming = upcoming.filter((item) => item.status !== "cancelled" && item.status !== "rejected");
  const fullCard = useFullCardWidth();
  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="events-assess">
      <View style={[styles.card, empty ? styles.cardBig : null]}>
        <View style={[styles.row, { gap: 10, marginBottom: 12 }]}>
          <View style={[styles.emo, { backgroundColor: colors.macLav }]}><UiText style={styles.emoText}>🔍</UiText></View>
          <View style={styles.grow}>
            <UiText style={[styles.cardTitle, empty ? { fontSize: 17, lineHeight: 25.5 } : null]}>{t("eventsV2.assessTitle")}</UiText>
            <UiText style={styles.lbl}>{t("eventsV2.assessSubApp")}</UiText>
          </View>
        </View>
        <View style={styles.drop}>
          {/* 背景 color-mix(accent-soft 60%, transparent)：同色铺底 + 0.6 不透明度。 */}
          <View pointerEvents="none" style={styles.dropFill} />
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.pasteUrl")} onPress={() => openAssess("url")} style={styles.dropHalf} testID="events-paste-url">
            <Icon name="link" size={16} color={colors.ink2} /><UiText style={styles.dropText}>{t("eventsV2.pasteUrl")}</UiText>
          </UiPressable>
          <UiText style={[styles.dropText, { marginLeft: -8 }]}>{"　|　"}</UiText>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.pickPoster")} onPress={() => openAssess("poster")} style={styles.dropHalf} testID="events-pick-poster">
            <Icon name="image" size={16} color={colors.ink2} /><UiText style={styles.dropText}>{t("eventsV2.pickPoster")}</UiText>
          </UiPressable>
        </View>
        {empty ? (
          <View style={{ gap: 8, marginTop: 14 }}>
            {([["🎯", "guideGoal", "guideGoalSubNone"], ["🤝", "guidePeople", "guidePeopleSubApp"], ["⏱️", "guideTime", "guideTimeSub"]] as const).map(([emoji, title, sub]) => (
              <View key={title} style={[styles.row, { gap: 10 }]}>
                <View style={[styles.emo, styles.emoSm, { backgroundColor: colors.macApricot }]}><UiText style={styles.emoTextSm}>{emoji}</UiText></View>
                <View style={styles.grow}><UiText style={styles.guideTitle}>{t(`eventsV2.${title}`)}</UiText><UiText style={styles.lbl}>{t(`eventsV2.${sub}`)}</UiText></View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {empty ? <EmptyExtras /> : null}
      {!empty && coming.length ? (
        <View style={{ marginTop: 20 }}>
          <View style={styles.cardH}><UiText style={styles.h3}>{t("eventsV2.tabGoing")}</UiText><UiText style={styles.more}>{t("eventsV2.countItems", { n: coming.length })}</UiText></View>
          {/* .carousel scroll-snap-type: x mandatory · snap-align start：多张时首张贴左缘（同 kit 在 Chrome 的落点）。 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.carousel} contentContainerStyle={styles.carouselInner} testID="events-going-carousel"
            {...(coming.length > 1 ? { contentOffset: { x: SHELL_GUTTER, y: 0 }, decelerationRate: "fast" as const, snapToOffsets: coming.map((_, index) => SHELL_GUTTER + index * (300 + 12)) } : {})}>
            {coming.map((item) => <GoingCard key={item.eventId} item={item} now={now} language={language} width={coming.length > 1 ? 300 : fullCard} gradientKey="carousel" />)}
          </ScrollView>
          {coming.length > 1 ? <View style={styles.dots}>{coming.map((item, index) => <View key={item.eventId} style={[styles.dot, index === 0 ? styles.dotOn : null]} />)}</View> : null}
        </View>
      ) : null}
      {!empty && items.length ? (
        <View style={[styles.card, { marginTop: 18, paddingHorizontal: 16, paddingVertical: 8 }]}>
          <View style={[styles.cardH, { marginBottom: 0, marginTop: 8 }]}><UiText style={styles.h3}>{t("eventsV2.assessedTitle")}</UiText><UiText style={styles.more}>{t("eventsV2.byScore")}</UiText></View>
          {items.map((item, index) => (
            <UiPressable key={item.id} accessibilityRole="button" accessibilityLabel={item.facts.title ?? ""} onPress={() => router.push(`/events/assessments/${encodeURIComponent(item.id)}` as Href)} style={styles.li} testID={`events-assessed-${item.id}`}>
              {index > 0 ? <View style={styles.liLine} /> : null}
              <ScoreRing size={44} stroke={5} value={item.status === "reading" ? 0 : item.total} color={colors[ringColor(item.total)]} label={item.status === "reading" ? "…" : String(item.total)} fontSize={12} />
              <View style={styles.meta}>
                <UiText style={styles.metaTitle} numberOfLines={1}>{item.facts.title ?? item.sourceLabel ?? ""}</UiText>
                <UiText style={styles.metaSub} numberOfLines={1}>{appCardLine(item, language, t("eventsV2.free"))}</UiText>
              </View>
              <Chip label={item.userDecision === "dismissed" ? t("eventsV2.dismissed") : t(`eventsV2.${verdictKey(item.verdict)}`)} tone={item.userDecision === "dismissed" ? "neutral" : verdictTone(item.verdict)} />
            </UiPressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function EmptyExtras() {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  return (
    <>
      <View style={[styles.card, { marginTop: 14 }]}>
        <View style={styles.cardH}><View style={styles.row}><UiText style={styles.h3}>{t("eventsV2.exampleTitle")}</UiText><View style={styles.sampleTag}><UiText style={styles.sampleText}>{t("eventsV2.sample")}</UiText></View></View></View>
        <View style={{ opacity: 0.5 }}>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <View style={[styles.emo, { backgroundColor: colors.macTeal }]}><UiText style={styles.emoText}>🎤</UiText></View>
            <ScoreRing size={46} stroke={5} value={82} color={colors.plum700} label="82" fontSize={13} />
          </View>
          <UiText style={[styles.metaTitle, { fontSize: 14, lineHeight: 18.9, marginTop: 12 }]}>{t("eventsV2.exampleName")}</UiText>
          <UiText style={[styles.lbl, { marginTop: 4 }]}>{t("eventsV2.exampleSub")}</UiText>
          <View style={[styles.row, { gap: 6, marginTop: 12, paddingTop: 10 }]}><Chip label={t("eventsV2.verdictRecommend")} tone="teal" /><Chip label={t("eventsV2.meetCount", { n: 14 })} tone="neutral" /></View>
        </View>
      </View>
      <View style={[styles.card, styles.flat, { marginTop: 14 }]}>
        <View style={styles.row}>
          <View style={[styles.emo, styles.emoSm, { backgroundColor: colors.macTeal }]}><UiText style={styles.emoTextSm}>🗓️</UiText></View>
          <View style={styles.grow}><UiText style={[styles.guideTitle, { fontSize: 13 }]}>{t("eventsV2.invitedTitle")}</UiText><UiText style={styles.lbl}>{t("eventsV2.invitedSub")}</UiText></View>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.codeDialogTitle")} onPress={() => router.push("/events/assess?mode=code" as Href)} style={styles.btnSm} testID="events-enter-code"><UiText style={styles.btnSmText}>{t("eventsV2.enterShort")}</UiText></UiPressable>
        </View>
      </View>
    </>
  );
}

function Chip({ label, tone }: { label: string; tone: "teal" | "apricot" | "pink" | "neutral" }) {
  const { styles, colors } = useStyles();
  const palette = tone === "teal" ? [colors.macTeal, colors.macTealInk] : tone === "apricot" ? [colors.macApricot, colors.macApricotInk] : [colors.surface2, colors.ink2];
  return <View style={[styles.chip, { backgroundColor: palette[0] }]}><UiText style={[styles.chipText, { color: palette[1] }]} numberOfLines={1}>{label}</UiText></View>;
}

// .ev-card：一张时占满内容宽（390 屏 = 354），多张时 300 宽横滑；背景 linear-gradient(160deg, mac-lav, surface 60%)。
function useFullCardWidth(): number {
  return useWindowDimensions().width - 2 * SHELL_GUTTER;
}

function GoingCard({ item, now, language, width, style, gradientKey }: { item: MyEventItem; now: Date; language: string; width?: number; style?: object; gradientKey: string }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const day = relativeDay(item.startsAt, now);
  return (
    <View style={[styles.evCard, width ? { width } : null, style]} testID={`events-going-${item.eventId}`}>
      <KitGradient id={`events-going-bg-${gradientKey}-${item.eventId}`} from={colors.macLav} to={colors.surface} stop={0.6} angle={160} />
      <View style={[styles.row, { justifyContent: "space-between" }]}>
        <Chip label={appEventWhen(item.startsAt, language)} tone="neutral" />
        {day ? <Chip label={t(`eventsV2.${day}`)} tone="apricot" /> : null}
      </View>
      <UiText style={styles.evName}>{item.title}</UiText>
      <UiText style={styles.lbl}>{item.venue ?? ""}</UiText>
      {item.meetCount ? (
        <View style={[styles.row, { marginTop: 14 }]}>
          <View style={styles.avs}>{(item.meetInitials ?? []).slice(0, 4).map((letter, index) => <View key={`${letter}-${index}`} style={[styles.av, index > 0 ? { marginLeft: -8 } : null, avTone(index, styles)]}><UiText style={[styles.avText, avInk(index, styles)]}>{letter}</UiText></View>)}</View>
          <UiText style={styles.lbl}>{t("eventsV2.meetCount", { n: item.meetCount })}</UiText>
        </View>
      ) : null}
      <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.prepare")} onPress={() => router.push(item.href as Href)} style={[styles.btnBlock]}><UiText style={styles.btnBlockText}>{t("eventsV2.prepare")}</UiText></UiPressable>
    </View>
  );
}

function avTone(index: number, styles: ReturnType<typeof useStyles>["styles"]) {
  return [styles.av0, styles.av1, styles.av2, styles.av3][index % 4];
}
function avInk(index: number, styles: ReturnType<typeof useStyles>["styles"]) {
  return [styles.avInk0, styles.avInk1, styles.avInk2, styles.avInk3][index % 4];
}

function GoingPage({ upcoming, past, now, language, onDiscover }: { upcoming: MyEventItem[]; past: MyEventItem[]; now: Date; language: string; onDiscover: () => void }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const coming = upcoming.filter((item) => item.status !== "cancelled" && item.status !== "rejected");
  if (coming.length === 0 && past.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} testID="events-going-empty">
        <View style={[styles.card, styles.guide]}>
          <GuideGlow id="events-going-empty-glow" color={colors.macLav} />
          <UiText style={styles.guideEmoji}>🗓️</UiText>
          <UiText style={styles.guideBig}>{t("eventsV2.goingEmptyTitle")}</UiText>
          <UiText style={styles.guideSub}>{t("eventsV2.goingEmptySub")}</UiText>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.tabDiscover")} onPress={onDiscover} style={styles.btnPrimary} testID="events-going-discover"><Icon name="search" size={16} color={colors.bg} /><UiText style={styles.btnPrimaryText}>{t("eventsV2.tabDiscover")}</UiText></UiPressable>
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="events-going">
      <View style={styles.cardH}><UiText style={styles.h3}>{t("eventsV2.upcoming")}</UiText><UiText style={styles.more}>{t("eventsV2.countItems", { n: coming.length })}</UiText></View>
      {coming.map((item) => <GoingCard key={item.eventId} item={item} now={now} language={language} style={{ marginBottom: 12 }} gradientKey="list" />)}
      {past.length ? (
        <View style={[styles.card, { marginTop: 6, paddingHorizontal: 16, paddingVertical: 8 }]}>
          <View style={[styles.cardH, { marginBottom: 0, marginTop: 8 }]}><UiText style={styles.h3}>{t("eventsV2.past")}</UiText><UiText style={styles.more}>{t("eventsV2.countItems", { n: past.length })}</UiText></View>
          {past.map((item, index) => (
            <UiPressable key={item.eventId} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(item.href as Href)} style={styles.li}>
              {index > 0 ? <View style={styles.liLine} /> : null}
              <View style={[styles.emo, styles.emoSm, { backgroundColor: item.status === "attended" ? colors.macTeal : colors.macLav }]}><UiText style={styles.emoTextSm}>{item.emoji || eventEmoji({ title: item.title })}</UiText></View>
              <View style={styles.meta}><UiText style={styles.metaTitle} numberOfLines={1}>{item.title}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[appEventWhen(item.startsAt, language), item.venue].filter(Boolean).join(" · ")}</UiText></View>
              <Chip label={item.status === "attended" ? t("eventsV2.attended") : item.status === "cancelled" ? t("eventsV2.statusCancelled") : t("eventsV2.notCheckedIn")} tone={item.status === "attended" ? "teal" : "neutral"} />
            </UiPressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const DROP_BORDER = 4 / 3;


// .guide::before：右上 220 圆、radial-gradient(circle, mac-lav, transparent 70%)，opacity .9。
function GuideGlow({ id, color }: { id: string; color: string }) {
  return (
    <View pointerEvents="none" style={{ height: 220, opacity: 0.9, position: "absolute", right: -80, top: -90, width: 220 }}>
      <Svg width={220} height={220}>
        <Defs><RadialGradient id={id} cx={110} cy={110} r={110} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={color} /><Stop offset={0.7} stopColor={color} stopOpacity={0} /></RadialGradient></Defs>
        <Rect x={0} y={0} width={220} height={220} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

// kit values (app.html .card 18 / r20, .emo 40 r13 21, .drop dashed plum-300 r18, .ev-card 300, .li 44 ring …).
const useStyles = createThemedStyles((colors) => StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: SHELL_GUTTER },
    // 段控件下方的 14 由 SwipeSegments 给（.seg margin-bottom 14），页内不再加。
    scroll: { paddingHorizontal: SHELL_GUTTER, paddingBottom: 130 },
    card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
    cardBig: { padding: 22 },
    flat: { backgroundColor: colors.surface2 },
    row: { alignItems: "center", flexDirection: "row", gap: 10 },
    grow: { flex: 1, minWidth: 0 },
    emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
    emoSm: { borderRadius: 10, height: 32, width: 32 },
    emoText: { fontSize: 21, lineHeight: 26 },
    emoTextSm: { fontSize: 17, lineHeight: 22 },
    cardTitle: { color: colors.ink, fontSize: 14.5, fontWeight: "800", lineHeight: 21.75 },
    lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
    // <div><b style="font-size:12.5px">…：行内 b 的行盒仍按外层 14px · 1.5 = 21。
    guideTitle: { color: colors.ink, fontSize: 12.5, fontWeight: "700", lineHeight: 21 },
    // .drop：背景 color-mix(accent-soft 60%, transparent)，行内 gap 8。
    // 边框 1.6：Chrome 在 3x 屏按整设备像素画成 4px（4/3pt），这里照画出来的宽度；高 = 上下 16 + 行高 18.75 + 边框。
    drop: { alignItems: "center", overflow: "hidden", borderColor: colors.plum300, borderRadius: 18, borderStyle: "dashed", borderWidth: DROP_BORDER, flexDirection: "row", gap: 8, height: 16 * 2 + 18.75 + DROP_BORDER * 2, justifyContent: "center", paddingHorizontal: 16 },
    dropFill: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, backgroundColor: colors.accentSoft, opacity: 0.6 },
    dropHalf: { alignItems: "center", flexDirection: "row", gap: 8 },
    dropText: { color: colors.ink2, fontSize: 12.5, lineHeight: 18.75 },
    cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
    h3: { color: colors.ink, fontSize: 14.5, fontWeight: "800", lineHeight: 21.75 },
    more: { color: colors.ink3, fontSize: 12, fontWeight: "600", lineHeight: 18 },
    sampleTag: { backgroundColor: colors.macApricot, borderRadius: radius.tag, marginLeft: -6, paddingHorizontal: 6, paddingVertical: 1 },
    sampleText: { color: colors.macApricotInk, fontSize: 9.5, fontWeight: "800", lineHeight: 14.25 },
    carousel: { marginHorizontal: -SHELL_GUTTER },
    carouselInner: { gap: 12, paddingBottom: 4, paddingHorizontal: SHELL_GUTTER, paddingTop: 2 },
    evCard: { borderRadius: 22, overflow: "hidden", padding: 16 },
    evName: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 24, marginTop: 10 },
    avs: { flexDirection: "row" },
    av: { alignItems: "center", borderColor: colors.surface, borderRadius: radius.pill, borderWidth: 2, height: 30, justifyContent: "center", width: 30 },
    avText: { fontSize: 11.5, fontWeight: "800", lineHeight: 15 },
    av0: { backgroundColor: colors.macPink }, av1: { backgroundColor: colors.macBlue }, av2: { backgroundColor: colors.macTeal }, av3: { backgroundColor: colors.macApricot },
    avInk0: { color: colors.macPinkInk }, avInk1: { color: colors.macBlueInk }, avInk2: { color: colors.macTealInk }, avInk3: { color: colors.macApricotInk },
    btnBlock: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 32, justifyContent: "center", marginTop: 12 },
    btnPrimary: { alignItems: "center", alignSelf: "center", backgroundColor: colors.ink, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 40, justifyContent: "center", paddingHorizontal: 16 },
    btnPrimaryText: { color: colors.bg, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
    guide: { alignItems: "center", overflow: "hidden", paddingHorizontal: 20, paddingVertical: 26 },
    // 44px emoji、行高 1：iOS 的 Apple Color Emoji 字形比 Chrome 高 4pt，只下移字形，不动下面的标题。
    guideEmoji: { fontSize: 44, lineHeight: 44, marginBottom: -4, marginTop: 4 },
    guideBig: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25.5, marginTop: 8, textAlign: "center" },
    guideSub: { color: colors.ink2, fontSize: 12.5, lineHeight: 18.75, marginBottom: 14, marginTop: 6, textAlign: "center" },
    btnBlockText: { color: colors.bg, fontSize: 12, fontWeight: "700", lineHeight: 18 },
    btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 32, justifyContent: "center", marginLeft: "auto", paddingHorizontal: 12 },
    btnSmText: { color: colors.ink, fontSize: 12, fontWeight: "700", lineHeight: 18 },
    dots: { flexDirection: "row", gap: 5, justifyContent: "center", marginTop: 10 },
    dot: { backgroundColor: colors.ink4, borderRadius: 3, height: 6, width: 6 },
    dotOn: { backgroundColor: colors.ink2, width: 18 },
    li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
    // .li + .li::before：1px 线，从 50 起到右边。
    liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
    meta: { flex: 1, minWidth: 0 },
    metaTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
    metaSub: { color: colors.ink3, fontSize: 12, lineHeight: 18 },
    chip: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
    chipText: { fontSize: 11, fontWeight: "700", lineHeight: 16.5 },
}));
