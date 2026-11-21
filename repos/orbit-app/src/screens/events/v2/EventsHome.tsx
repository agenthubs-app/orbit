// R26 イベント (App; events DESIGN §2.1, app.html #13 / #14 / #15): 🔍 · イベント + 「10月 · 参加予定 N件」 · 📅, then
// 評価 / 参加予定 N / 探す. 評価: 「このイベントで、誰に会える？」 (URL / poster), the 参加予定 carousel and 調べたイベント
// (newest first, the facts as chips — 2026-11-15 no scores); empty: the three angles, a sample and the 参加コード card.
// 参加予定: events/mine. 探す: R27 DiscoverPage (b2 #8). Nothing here calls AI.
// 2026-11-20（events-replay-cover-app-proposal ⑨，D2）：参加予定卡有 coverUrl 时顶部 2:1 图；評価 顶部的横滑一排里有图时，没图的卡用 emoji 色带补齐。
import { useFocusEffect, useGlobalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { KitGradient } from "../../plan/plan-kit";
import { eventEmoji } from "../../../api/compute/event-emoji";
import type { EventAssessmentContract } from "../../../api/contract/event-assessment";
import type { MyEventItem } from "../../../api/contract/events-mine";
import { ShellBackground } from "../../../components/ShellBackground";
import { SHELL_GUTTER, ShellTopBar, useShellTopGap } from "../../../components/ShellTopBar";
import { TabPageBar } from "../../../components/TabPageBar";
import { ConfirmDialog, Icon, IconButton, Segmented, SwipeRow, UiPressable, UiText, useToast } from "../../../components/ui";
import { SwipeSegments } from "../../../components/ui/Segmented";
import Svg, { Defs, RadialGradient, Rect, Stop } from "../../../components/ui/svg";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { DiscoverPage, discoverQueryFromParams } from "./DiscoverPage";
import { eventAssessmentListSchema, useEventsApi } from "./events-api";
import { myEventsResponseSchema } from "../../../api/schema/events-mine";
import { EventsOfflineNotice } from "./EventsOfflineNotice";
import { useCoverUri } from "./event-cover";
import { usePageCopyResource } from "../../../hooks/usePageCopyResource";
import { EVENTS_COPY_FRESH_MS, EVENTS_MINE_UPCOMING_PATH } from "./events-copies";

import { RelevanceChips, relevanceChips, useRelevanceT } from "./Relevance";
import { appCardLine, appEventWhen, monthOf, orderAssessed, relativeDay } from "./events-model";

type Tab = "assess" | "going" | "discover";

export function EventsHome({ scopeKey: _scopeKey }: { scopeKey?: string } = {}) {
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const params = useGlobalSearchParams<{ tab?: string; period?: string; areas?: string; themes?: string; q?: string; filters?: string }>();
  // 探す 的条件也走路由参数（可分享；门禁用来打开筛选弹层 / 搜索中）。
  const discoverQuery = useMemo(() => discoverQueryFromParams(params), [params.period, params.areas, params.themes]); // eslint-disable-line react-hooks/exhaustive-deps
  const topGap = useShellTopGap();
  const [tab, setTab] = useState<Tab>(params.tab === "going" || params.tab === "assess" ? params.tab : "discover");
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
  // Delete from the assessment history (swipe left → 删除, confirmed): hidden at once, put back if the server refuses.
  const eventsApi = useEventsApi();
  const toast = useToast();
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const deleteAssessment = async (id: string) => {
    setConfirmDelete(null);
    setRemoved((current) => new Set([...current, id]));
    const result = await eventsApi.remove(id);
    if (!result.ok) {
      setRemoved((current) => { const next = new Set(current); next.delete(id); return next; });
      toast.error(t("eventsV2.genericError"));
      return;
    }
    toast.success(t("eventsV2.assessmentDeleted"));
    listCopy.refresh();
  };

  const ordered = useMemo(() => orderAssessed((items ?? []).filter((item) => !removed.has(item.id) && (item.status === "ready" || item.status === "needs_input" || item.status === "reading"))), [items, removed]);
  const empty = items !== null && ordered.length === 0 && upcoming.length === 0;
  const month = monthOf(now);
  // app.html #13 空：判定说明；b12 画板 308 有评估但没参加予定：「参加予定はまだありません」。
  const subtitle = tab === "discover" && discoverSubtitle ? discoverSubtitle : empty ? t("eventsV2.subtitleEmpty") : goingCount === 0 ? t("eventsV2.goingEmptyTitle") : t("eventsV2.subtitleGoing", { going: goingCount, month });
  const segments = useMemo(() => [
    { key: "discover" as const, label: t("eventsV2.tabDiscover") },
    { key: "going" as const, label: goingCount > 0 && tab !== "discover" ? t("eventsV2.tabMyEventsCount", { n: goingCount }) : t("eventsV2.tabMyEvents") },
    { key: "assess" as const, label: t("eventsV2.tabAssess") },
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
          ? <AssessPage items={ordered} upcoming={upcoming} empty={empty} now={now} language={language} onDelete={setConfirmDelete} />
          : key === "going" ? <GoingPage upcoming={upcoming} past={past} now={now} language={language} onDiscover={() => setTab("discover")} />
            : <DiscoverPage onSubtitle={setDiscoverSubtitle} initialQuery={discoverQuery} initialSearch={typeof params.q === "string" ? params.q : ""} openFilters={params.filters === "1"} />}
      />
      <TabPageBar tab="events" />
      <ConfirmDialog visible={confirmDelete !== null} destructive title={t("eventsV2.deleteAssessmentTitle")} message={t("eventsV2.deleteAssessmentBody")}
        confirmLabel={t("eventsV2.deleteAssessment")} cancelLabel={t("eventsV2.keepAssessment")}
        onConfirm={() => { if (confirmDelete) void deleteAssessment(confirmDelete); }} onCancel={() => setConfirmDelete(null)} />
    </SafeAreaView>
  );
}

function AssessPage({ items, upcoming, empty, now, language, onDelete }: { items: EventAssessmentContract[]; upcoming: MyEventItem[]; empty: boolean; now: Date; language: string; onDelete: (id: string) => void }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const openAssess = (mode: "url" | "poster") => router.push(`/events/assess?mode=${mode}` as Href);
  const coming = upcoming.filter((item) => item.status !== "cancelled" && item.status !== "rejected");
  const fullCard = useFullCardWidth();
  const rt = useRelevanceT();
  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="events-assess">
      <View style={[styles.card, empty ? styles.cardBig : null]}>
        <View style={[styles.row, { gap: 10, marginBottom: 12 }]}>
          <View style={[styles.emo, { backgroundColor: colors.macLav }]}><UiText style={styles.emoText}>🔍</UiText></View>
          <View style={styles.grow}>
            <UiText style={[styles.cardTitle, empty ? { fontSize: 19, lineHeight: 29 } : null]}>{t("eventsV2.assessTitle")}</UiText>
            <UiText style={styles.lbl}>{t("eventsV2.assessSubApp")}</UiText>
          </View>
        </View>
        <View style={styles.drop}>
          {/* 背景 color-mix(accent-soft 60%, transparent)：同色铺底 + 0.6 不透明度。 */}
          <View pointerEvents="none" style={styles.dropFill} />
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.pasteUrl")} onPress={() => openAssess("url")} style={styles.dropHalf} testID="events-paste-url">
            <Icon name="link" size={16} color={colors.ink2} /><UiText style={styles.dropText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t("eventsV2.pasteUrl")}</UiText>
          </UiPressable>
          {/* 2026-11-21 手机扫描：375 宽日文时整行放不下（左图标被切、「ぶ」被框裁掉）。两半各占一半、放不下时缩字；分隔改细线（全角空格「　|　」占约 40pt）。 */}
          <View style={styles.dropSep} />
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.pickPoster")} onPress={() => openAssess("poster")} style={styles.dropHalf} testID="events-pick-poster">
            <Icon name="image" size={16} color={colors.ink2} /><UiText style={styles.dropText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t("eventsV2.pickPoster")}</UiText>
          </UiPressable>
        </View>
        {empty ? (
          <View style={{ gap: 8, marginTop: 14 }}>
            {([["👥", "guideGoal", "guideGoalSubNone"], ["🤝", "guidePeople", "guidePeopleSubApp"], ["⏱️", "guideTime", "guideTimeSub"]] as const).map(([emoji, title, sub]) => (
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
            {...(coming.length > 1 ? { decelerationRate: "fast" as const, snapToOffsets: coming.map((_, index) => index * (300 + 12)) } : {})}>
            {coming.map((item) => <GoingCard key={item.eventId} item={item} now={now} language={language} width={coming.length > 1 ? 300 : fullCard} gradientKey="carousel" band={coming.some((other) => other.coverUrl) ? (item.coverUrl ? "image" : "emoji") : null} />)}
          </ScrollView>
          {coming.length > 1 ? <View style={styles.dots}>{coming.map((item, index) => <View key={item.eventId} style={[styles.dot, index === 0 ? styles.dotOn : null]} />)}</View> : null}
        </View>
      ) : null}
      {!empty && items.length ? (
        // Rows sit in SwipeRow (its face pads 14), so the card pads 2 and the header 14: the same 16 as before.
        <View style={[styles.card, { marginTop: 18, paddingHorizontal: 2, paddingVertical: 8 }]}>
          <View style={[styles.cardH, { marginBottom: 0, marginHorizontal: 14, marginTop: 8 }]}><UiText style={styles.h3}>{t("eventsV2.assessedTitle")}</UiText><UiText style={styles.more}>{t("eventsV2.relNewestFirst")}</UiText></View>
          {items.map((item, index) => (
            <SwipeRow key={item.id} actions={[{ icon: "trash", key: "delete", label: t("eventsV2.deleteAssessment"), onPress: () => onDelete(item.id), tone: "coral" }]}>
            <UiPressable accessibilityRole="button" accessibilityLabel={item.facts.title || item.sourceLabel || (item.sourceKind === "poster" ? t("eventsV2.posterImage") : "")} onPress={() => router.push(`/events/assessments/${encodeURIComponent(item.id)}` as Href)} style={styles.li} testID={`events-assessed-${item.id}`}>
              {index > 0 ? <View style={styles.liLine} /> : null}
              <View style={[styles.emo, styles.emoSm, { backgroundColor: colors.macLav }]}><UiText style={styles.emoTextSm}>{eventEmoji({ title: item.facts.title ?? "" })}</UiText></View>
              <View style={styles.meta}>
                <UiText style={styles.metaTitle} numberOfLines={2}>{item.facts.title || item.sourceLabel || (item.sourceKind === "poster" ? t("eventsV2.posterImage") : "")}</UiText>
                <UiText style={styles.metaSub} numberOfLines={1}>{item.status === "reading" ? t("eventsV2.assessingTitle") : appCardLine(item, language, t("eventsV2.free"))}</UiText>
                <RelevanceChips style={{ marginTop: 6 }} chips={relevanceChips(item.relevance, rt)} />
              </View>
            </UiPressable>
            </SwipeRow>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function EmptyExtras() {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const rt = useRelevanceT();
  const router = useRouter();
  return (
    <>
      <View style={[styles.card, { marginTop: 14 }]}>
        <View style={styles.cardH}><View style={styles.row}><UiText style={styles.h3}>{t("eventsV2.exampleTitle")}</UiText><View style={styles.sampleTag}><UiText style={styles.sampleText}>{t("eventsV2.sample")}</UiText></View></View></View>
        <View style={{ opacity: 0.5 }}>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <View style={[styles.emo, { backgroundColor: colors.macTeal }]}><UiText style={styles.emoText}>🎤</UiText></View>
          </View>
          <UiText style={[styles.metaTitle, { fontSize: 17, lineHeight: 23, marginTop: 12 }]}>{t("eventsV2.exampleName")}</UiText>
          <UiText style={[styles.lbl, { marginTop: 4 }]}>{t("eventsV2.exampleSub")}</UiText>
          <RelevanceChips style={{ marginTop: 12, paddingTop: 10 }} chips={relevanceChips({ group: "people", known: { count: 2, names: [] }, people: [{ count: 3, emoji: "", label: rt("eventsV2.relExampleType"), source: "registrants", typeKey: "sample" }], topic: null, warnings: [] }, rt)} />
        </View>
      </View>
      <View style={[styles.card, styles.flat, { marginTop: 14 }]}>
        <View style={styles.row}>
          <View style={[styles.emo, styles.emoSm, { backgroundColor: colors.macTeal }]}><UiText style={styles.emoTextSm}>🗓️</UiText></View>
          <View style={styles.grow}><UiText style={[styles.guideTitle, { fontSize: 15 }]}>{t("eventsV2.invitedTitle")}</UiText><UiText style={styles.lbl}>{t("eventsV2.invitedSub")}</UiText></View>
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

/** band：顶部 2:1 图（image）/ 用 emoji 色带补齐（emoji，同一排里别的卡有图时）/ 不出（null）。 */
function GoingCard({ item, now, language, width, style, gradientKey, band = null }: { item: MyEventItem; now: Date; language: string; width?: number; style?: object; gradientKey: string; band?: "image" | "emoji" | null }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const day = relativeDay(item.startsAt, now);
  const fullWidth = useFullCardWidth();
  const cover = useCoverUri(item.coverUrl);
  const bandWidth = width ?? fullWidth;
  return (
    <View style={[styles.evCard, width ? { width } : null, band ? styles.evCardBand : null, style]} testID={`events-going-${item.eventId}`}>
      {band === "image" && cover ? <Image source={{ uri: cover }} resizeMode="cover" style={{ height: bandWidth / 2, width: bandWidth }} accessibilityIgnoresInvertColors testID={`events-going-cover-${item.eventId}`} />
        : band === "emoji" ? <View style={[styles.bandEmoji, { height: bandWidth / 2, width: bandWidth }]}><UiText style={styles.bandEmojiText}>{item.emoji || eventEmoji({ title: item.title })}</UiText></View> : null}
      {band ? null : <KitGradient id={`events-going-bg-${gradientKey}-${item.eventId}`} from={colors.macLav} to={colors.surface} stop={0.6} angle={160} />}
      <View style={band ? styles.bandBody : null}>
      {band ? <KitGradient id={`events-going-bg-${gradientKey}-${item.eventId}`} from={colors.macLav} to={colors.surface} stop={0.6} angle={160} /> : null}
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
    </View>
  );
}

function avTone(index: number, styles: ReturnType<typeof useStyles>["styles"]) {
  return [styles.av0, styles.av1, styles.av2, styles.av3][index % 4];
}
function avInk(index: number, styles: ReturnType<typeof useStyles>["styles"]) {
  return [styles.avInk0, styles.avInk1, styles.avInk2, styles.avInk3][index % 4];
}

// 2026-11-21 参加イベント（与 Web 同构，对标 Luma Upcoming / Past、Peatix 今後 / 過去、connpass 参加イベント）：段内顶部
// 「これから N / 過去 N」二选一，默认これから（これから 0 件也停在这里显示空状态，不自动跳到過去）；两边都空时只出空状态卡。
function GoingPage({ upcoming, past, now, language, onDiscover }: { upcoming: MyEventItem[]; past: MyEventItem[]; now: Date; language: string; onDiscover: () => void }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const [side, setSide] = useState<"upcoming" | "past">("upcoming");
  const coming = upcoming.filter((item) => item.status !== "cancelled" && item.status !== "rejected");
  const emptyCard = (
    <View style={[styles.card, styles.guide]} testID="events-going-upcoming-empty">
      <GuideGlow id="events-going-empty-glow" color={colors.macLav} />
      <UiText style={styles.guideEmoji}>🗓️</UiText>
      <UiText style={styles.guideBig}>{t("eventsV2.myUpcomingEmptyTitle")}</UiText>
      <UiText style={styles.guideSub}>{t("eventsV2.goingEmptySub")}</UiText>
      <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.tabDiscover")} onPress={onDiscover} style={styles.btnPrimary} testID="events-going-discover"><Icon name="search" size={16} color={colors.bg} /><UiText style={styles.btnPrimaryText}>{t("eventsV2.tabDiscover")}</UiText></UiPressable>
    </View>
  );
  if (coming.length === 0 && past.length === 0) return <ScrollView contentContainerStyle={styles.scroll} testID="events-going-empty">{emptyCard}</ScrollView>;
  // Past: what happened, as a fact — checked in / cancelled / registered but never checked in.
  const pastChip = (item: MyEventItem) => item.status === "attended" ? <Chip label={t("eventsV2.attended")} tone="teal" />
    : item.status === "cancelled" ? <Chip label={t("eventsV2.pastCancelled")} tone="neutral" />
    : item.status === "registered" || item.status === "pending_review" ? <Chip label={t("eventsV2.pastNoCheckIn")} tone="neutral" /> : null;
  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="events-going">
      <Segmented<"upcoming" | "past"> accessibilityLabel={t("eventsV2.tabMyEvents")} value={side} onChange={setSide}
        segments={[{ key: "upcoming", label: t("eventsV2.segUpcomingN", { n: coming.length }) }, { key: "past", label: t("eventsV2.segPastN", { n: past.length }) }]} />
      <View style={{ height: 14 }} />
      {side === "upcoming" ? (coming.length === 0 ? emptyCard
        : coming.map((item) => <GoingCard key={item.eventId} item={item} now={now} language={language} style={{ marginBottom: 12 }} gradientKey="list" band={item.coverUrl ? "image" : null} />)) : null}
      {side === "past" ? (past.length === 0 ? <UiText style={[styles.lbl, { paddingHorizontal: 4 }]} testID="events-going-past-empty">{t("eventsV2.pastEmpty")}</UiText> : (
        <View style={[styles.card, { paddingHorizontal: 16, paddingVertical: 8 }]} testID="events-going-past">
          {past.map((item, index) => (
            <UiPressable key={item.eventId} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(item.href as Href)} style={styles.li}>
              {index > 0 ? <View style={styles.liLine} /> : null}
              <View style={[styles.emo, styles.emoSm, { backgroundColor: item.status === "attended" ? colors.macTeal : colors.macLav }]}><UiText style={styles.emoTextSm}>{item.emoji || eventEmoji({ title: item.title })}</UiText></View>
              <View style={styles.meta}><UiText style={styles.metaTitle} numberOfLines={2}>{item.title}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[appEventWhen(item.startsAt, language), item.venue].filter(Boolean).join(" · ")}</UiText></View>
              {pastChip(item)}
            </UiPressable>
          ))}
        </View>
      )) : null}
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
    emoText: { fontSize: 23, lineHeight: 28 },
    emoTextSm: { fontSize: 19, lineHeight: 25 },
    cardTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
    lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
    // <div><b style="font-size:12.5px">…：行内 b 的行盒仍按外层 14px · 1.5 = 21。
    guideTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 25 },
    // .drop：背景 color-mix(accent-soft 60%, transparent)，行内 gap 8。
    // 边框 1.6：Chrome 在 3x 屏按整设备像素画成 4px（4/3pt），这里照画出来的宽度；高 = 上下 16 + 行高 18.75 + 边框。
    drop: { alignItems: "center", overflow: "hidden", borderColor: colors.plum300, borderRadius: 18, borderStyle: "dashed", borderWidth: DROP_BORDER, flexDirection: "row", gap: 8, height: 16 * 2 + 18.75 + DROP_BORDER * 2, justifyContent: "center", paddingHorizontal: 12 },
    dropFill: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, backgroundColor: colors.accentSoft, opacity: 0.6 },
    dropHalf: { alignItems: "center", flex: 1, flexDirection: "row", gap: 8, justifyContent: "center", minWidth: 0 },
    dropSep: { backgroundColor: colors.plum300, height: 18, width: StyleSheet.hairlineWidth * 2 },
    dropText: { color: colors.ink2, flexShrink: 1, fontSize: 15, lineHeight: 23 },
    cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
    h3: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
    more: { color: colors.ink3, fontSize: 14, fontWeight: "600", lineHeight: 21 },
    sampleTag: { backgroundColor: colors.macApricot, borderRadius: radius.tag, marginLeft: -6, paddingHorizontal: 6, paddingVertical: 1 },
    sampleText: { color: colors.macApricotInk, fontSize: 12, fontWeight: "800", lineHeight: 18 },
    carousel: { marginHorizontal: -SHELL_GUTTER },
    carouselInner: { gap: 12, paddingBottom: 4, paddingHorizontal: SHELL_GUTTER, paddingTop: 2 },
    evCard: { borderRadius: 22, overflow: "hidden", padding: 16 },
    // 有图：卡片不留内边距，图满宽贴上沿；下面的淡紫渐变与正文照旧（16）。
    evCardBand: { padding: 0 },
    bandBody: { overflow: "hidden", padding: 16 },
    bandEmoji: { alignItems: "center", backgroundColor: colors.macLav, justifyContent: "center" },
    bandEmojiText: { fontSize: 46, lineHeight: 54 },
    evName: { color: colors.ink, fontSize: 18, fontWeight: "700", lineHeight: 27, marginTop: 10 },
    avs: { flexDirection: "row" },
    av: { alignItems: "center", borderColor: colors.surface, borderRadius: radius.pill, borderWidth: 2, height: 30, justifyContent: "center", width: 30 },
    avText: { fontSize: 13, fontWeight: "800", lineHeight: 17 },
    av0: { backgroundColor: colors.macPink }, av1: { backgroundColor: colors.macBlue }, av2: { backgroundColor: colors.macTeal }, av3: { backgroundColor: colors.macApricot },
    avInk0: { color: colors.macPinkInk }, avInk1: { color: colors.macBlueInk }, avInk2: { color: colors.macTealInk }, avInk3: { color: colors.macApricotInk },
    btnBlock: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 32, justifyContent: "center", marginTop: 12 },
    btnPrimary: { alignItems: "center", alignSelf: "center", backgroundColor: colors.ink, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 40, justifyContent: "center", paddingHorizontal: 16 },
    btnPrimaryText: { color: colors.bg, fontSize: 15, fontWeight: "700", lineHeight: 22 },
    guide: { alignItems: "center", overflow: "hidden", paddingHorizontal: 20, paddingVertical: 26 },
    // 44px emoji、行高 1：iOS 的 Apple Color Emoji 字形比 Chrome 高 4pt，只下移字形，不动下面的标题。
    guideEmoji: { fontSize: 44, lineHeight: 44, marginBottom: -4, marginTop: 4 },
    guideBig: { color: colors.ink, fontSize: 19, fontWeight: "700", lineHeight: 29, marginTop: 8, textAlign: "center" },
    guideSub: { color: colors.ink2, fontSize: 15, lineHeight: 23, marginBottom: 14, marginTop: 6, textAlign: "center" },
    btnBlockText: { color: colors.bg, fontSize: 14, fontWeight: "700", lineHeight: 21 },
    btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 32, justifyContent: "center", marginLeft: "auto", paddingHorizontal: 12 },
    btnSmText: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
    dots: { flexDirection: "row", gap: 5, justifyContent: "center", marginTop: 10 },
    dot: { backgroundColor: colors.ink4, borderRadius: 3, height: 6, width: 6 },
    dotOn: { backgroundColor: colors.ink2, width: 18 },
    li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
    // .li + .li::before：1px 线，从 50 起到右边。
    liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
    meta: { flex: 1, minWidth: 0 },
    metaTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
    metaSub: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
    chip: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
    chipText: { fontSize: 13, fontWeight: "700", lineHeight: 20 },
}));
