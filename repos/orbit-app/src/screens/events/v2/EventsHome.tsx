// R26 イベント (App; events DESIGN §2.1, app.html #13 / #14 / #15): 🔍 · イベント + 「10月 · 参加予定 N件」 · 📅, then
// 評価 / 参加予定 N / 探す. 評価: 「このイベント、行く価値ある？」 (URL / poster), the 参加予定 carousel and 評価したイベント
// (score order); empty: the three angles, a sample and the 参加コード card. 参加予定: events/mine. 探す: R27 builds it —
// until then the existing list is shown. Scores come from the server (rule-based); nothing here calls AI.
import { useFocusEffect, useGlobalSearchParams, useRouter, type Href } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { eventEmoji } from "../../../api/compute/event-emoji";
import type { EventAssessmentContract } from "../../../api/contract/event-assessment";
import type { MyEventItem } from "../../../api/contract/events-mine";
import { ShellBackground } from "../../../components/ShellBackground";
import { SHELL_GUTTER, ShellTopBar, useShellTopGap } from "../../../components/ShellTopBar";
import { TabPageBar } from "../../../components/TabPageBar";
import { Icon, IconButton, RingChart, UiPressable, UiText } from "../../../components/ui";
import { SwipeSegments } from "../../../components/ui/Segmented";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { EventsScreen as LegacyEventsList } from "../EventsScreen";
import { useEventsApi } from "./events-api";
import { appCardLine, appEventWhen, monthOf, orderAssessed, relativeDay, ringColor, verdictKey, verdictTone } from "./events-model";

type Tab = "assess" | "going" | "discover";

export function EventsHome({ scopeKey: _scopeKey }: { scopeKey?: string } = {}) {
  const { styles } = useStyles();
  const { t, language } = useOrbitLocale();
  const router = useRouter();
  const params = useGlobalSearchParams<{ tab?: string }>();
  const api = useEventsApi();
  const topGap = useShellTopGap();
  const [tab, setTab] = useState<Tab>(params.tab === "going" || params.tab === "discover" ? params.tab : "assess");
  const [items, setItems] = useState<EventAssessmentContract[] | null>(null);
  const [upcoming, setUpcoming] = useState<MyEventItem[]>([]);
  const [past, setPast] = useState<MyEventItem[]>([]);
  const [goingCount, setGoingCount] = useState(0);
  const [now] = useState(() => new Date());

  useFocusEffect(useCallback(() => {
    let live = true;
    void Promise.all([api.list(), api.mine("upcoming", 10), api.mine("past", 10)]).then(([list, up, before]) => {
      if (!live) return;
      setItems(list.ok ? list.data : []);
      if (up.ok) { setUpcoming([...up.data.items]); setGoingCount(up.data.upcomingCount); }
      if (before.ok) setPast([...before.data.items]);
    });
    return () => { live = false; };
  }, [api]));

  const ordered = useMemo(() => orderAssessed((items ?? []).filter((item) => item.status === "ready" || item.status === "needs_input" || item.status === "reading")), [items]);
  const empty = items !== null && ordered.length === 0 && upcoming.length === 0;
  const month = monthOf(now);
  const subtitle = empty ? t("eventsV2.subtitleEmpty") : t("eventsV2.subtitleGoing", { going: goingCount, month });
  const segments = useMemo(() => [
    { key: "assess" as const, label: t("eventsV2.tabAssess") },
    { key: "going" as const, label: goingCount > 0 ? t("eventsV2.tabGoingCount", { n: goingCount }) : t("eventsV2.tabGoing") },
    { key: "discover" as const, label: t("eventsV2.tabDiscover") },
  ], [t, goingCount]);

  return (
    <SafeAreaView edges={["top"]} style={[styles.page, { paddingTop: topGap }]} testID="events-home">
      <ShellBackground />
      <View style={styles.header}>
        <ShellTopBar title={t("eventsV2.title")} subtitle={subtitle}
          left={<IconButton icon="search" accessibilityLabel={t("eventsV2.searchEvents")} onPress={() => setTab("discover")} />}
          right={<IconButton icon="calendar" accessibilityLabel={t("eventsV2.calendar")} onPress={() => router.push("/task?seg=calendar" as Href)} />} />
      </View>
      <SwipeSegments
        segments={segments}
        value={tab}
        onChange={setTab}
        accessibilityLabel={t("eventsV2.tabsLabel")}
        renderPage={(key) => key === "assess"
          ? <AssessPage items={ordered} upcoming={upcoming} empty={empty} now={now} language={language} />
          : key === "going" ? <GoingPage upcoming={upcoming} past={past} now={now} language={language} />
            : <LegacyEventsList />}
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
  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="events-assess">
      <View style={[styles.card, empty ? styles.cardBig : null]}>
        <View style={[styles.row, { gap: 10, marginBottom: 12 }]}>
          <View style={[styles.emo, { backgroundColor: colors.macLav }]}><UiText style={styles.emoText}>🔍</UiText></View>
          <View style={styles.grow}>
            <UiText style={[styles.cardTitle, empty ? { fontSize: 17, lineHeight: 25 } : null]}>{t("eventsV2.assessTitle")}</UiText>
            <UiText style={styles.lbl}>{t("eventsV2.assessSubApp")}</UiText>
          </View>
        </View>
        <View style={styles.drop}>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.pasteUrl")} onPress={() => openAssess("url")} style={styles.dropHalf} testID="events-paste-url">
            <View style={[styles.row, { gap: 6 }]}><Icon name="link" size={16} color={colors.ink2} /><UiText style={styles.dropText}>{t("eventsV2.pasteUrl")}</UiText></View>
          </UiPressable>
          <UiText style={styles.dropText}>{"　|　"}</UiText>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.pickPoster")} onPress={() => openAssess("poster")} style={styles.dropHalf} testID="events-pick-poster">
            <View style={[styles.row, { gap: 6 }]}><Icon name="image" size={16} color={colors.ink2} /><UiText style={styles.dropText}>{t("eventsV2.pickPoster")}</UiText></View>
          </UiPressable>
        </View>
        {empty ? (
          <View style={{ gap: 8, marginTop: 14 }}>
            {([["🎯", "guideGoal", "guideGoalSubNone"], ["🤝", "guidePeople", "guidePeopleSubApp"], ["⏱️", "guideTime", "guideTimeSub"]] as const).map(([emoji, title, sub]) => (
              <View key={title} style={[styles.row, { gap: 10 }]}>
                <View style={[styles.emo, styles.emoSm, { backgroundColor: colors.macApricot }]}><UiText style={styles.emoTextSm}>{emoji}</UiText></View>
                <View><UiText style={styles.guideTitle}>{t(`eventsV2.${title}`)}</UiText><UiText style={styles.lbl}>{t(`eventsV2.${sub}`)}</UiText></View>
              </View>
            ))}
          </View>
        ) : null}
      </View>
      {empty ? <EmptyExtras /> : null}
      {!empty && coming.length ? (
        <View style={{ marginTop: 20 }}>
          <View style={styles.cardH}><UiText style={styles.h3}>{t("eventsV2.tabGoing")}</UiText><UiText style={styles.more}>{t("eventsV2.countItems", { n: coming.length })}</UiText></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }} testID="events-going-carousel">
            {coming.map((item) => <GoingCard key={item.eventId} item={item} now={now} language={language} />)}
          </ScrollView>
          <View style={styles.dots}>{coming.map((item, index) => <View key={item.eventId} style={[styles.dot, index === 0 ? styles.dotOn : null]} />)}</View>
        </View>
      ) : null}
      {!empty && items.length ? (
        <View style={[styles.card, { marginTop: 18, paddingHorizontal: 16, paddingVertical: 8 }]}>
          <View style={[styles.cardH, { marginBottom: 0, marginTop: 8 }]}><UiText style={styles.h3}>{t("eventsV2.assessedTitle")}</UiText><UiText style={styles.more}>{t("eventsV2.byScore")}</UiText></View>
          {items.map((item, index) => (
            <UiPressable key={item.id} accessibilityRole="button" accessibilityLabel={item.facts.title ?? ""} onPress={() => router.push(`/events/assessments/${encodeURIComponent(item.id)}` as Href)} style={[styles.li, index > 0 ? styles.liLine : null]} testID={`events-assessed-${item.id}`}>
              <View style={styles.ringWrap}>
                <RingChart size={44} stroke={5} segments={[{ color: colors[ringColor(item.total)], value: item.total / 100 }]} accessibilityLabel={`${item.total}`} />
                <UiText style={styles.ringNum}>{item.status === "reading" ? "…" : item.total}</UiText>
              </View>
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
        <View style={styles.cardH}><UiText style={styles.h3}>{t("eventsV2.exampleTitle")}</UiText><View style={styles.sampleTag}><UiText style={styles.sampleText}>{t("eventsV2.sample")}</UiText></View></View>
        <View style={{ opacity: 0.6 }}>
          <View style={[styles.row, { justifyContent: "space-between" }]}>
            <View style={[styles.emo, { backgroundColor: colors.macTeal }]}><UiText style={styles.emoText}>🎤</UiText></View>
            <View style={styles.ringWrap}><RingChart size={46} stroke={5} segments={[{ color: colors.plum700, value: 0.82 }]} accessibilityLabel="82" /><UiText style={[styles.ringNum, { fontSize: 13 }]}>82</UiText></View>
          </View>
          <UiText style={[styles.metaTitle, { fontSize: 14, lineHeight: 19, marginTop: 12 }]}>{t("eventsV2.exampleName")}</UiText>
          <UiText style={[styles.lbl, { marginTop: 4 }]}>{t("eventsV2.exampleSub")}</UiText>
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

function GoingCard({ item, now, language }: { item: MyEventItem; now: Date; language: string }) {
  const { styles } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const day = relativeDay(item.startsAt, now);
  return (
    <View style={styles.evCard} testID={`events-going-${item.eventId}`}>
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

function GoingPage({ upcoming, past, now, language }: { upcoming: MyEventItem[]; past: MyEventItem[]; now: Date; language: string }) {
  const { styles, colors } = useStyles();
  const { t } = useOrbitLocale();
  const router = useRouter();
  const coming = upcoming.filter((item) => item.status !== "cancelled" && item.status !== "rejected");
  if (coming.length === 0 && past.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} testID="events-going-empty">
        <View style={[styles.card, { alignItems: "center", paddingVertical: 28 }]}>
          <View style={[styles.emo, { backgroundColor: colors.macLav }]}><UiText style={styles.emoText}>🗓️</UiText></View>
          <UiText style={[styles.cardTitle, { marginTop: 10 }]}>{t("eventsV2.goingEmptyTitle")}</UiText>
          <UiText style={styles.lbl}>{t("eventsV2.goingEmptySub")}</UiText>
        </View>
      </ScrollView>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="events-going">
      <View style={styles.cardH}><UiText style={styles.h3}>{t("eventsV2.upcoming")}</UiText><UiText style={styles.more}>{t("eventsV2.countItems", { n: coming.length })}</UiText></View>
      <View style={{ gap: 12 }}>{coming.map((item) => <GoingCard key={item.eventId} item={item} now={now} language={language} />)}</View>
      {past.length ? (
        <View style={[styles.card, { marginTop: 18, paddingHorizontal: 16, paddingVertical: 8 }]}>
          <View style={[styles.cardH, { marginBottom: 0, marginTop: 8 }]}><UiText style={styles.h3}>{t("eventsV2.past")}</UiText><UiText style={styles.more}>{t("eventsV2.countItems", { n: past.length })}</UiText></View>
          {past.map((item, index) => (
            <UiPressable key={item.eventId} accessibilityRole="button" accessibilityLabel={item.title} onPress={() => router.push(item.href as Href)} style={[styles.li, index > 0 ? styles.liLine : null]}>
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

// kit values (app.html .card 18 / r20, .emo 40 r13 21, .drop dashed plum-300 r18, .ev-card 300, .li 44 ring …).
const useStyles = createThemedStyles((colors) => StyleSheet.create({
    page: { flex: 1, backgroundColor: colors.bg },
    header: { paddingHorizontal: SHELL_GUTTER },
    scroll: { paddingHorizontal: SHELL_GUTTER, paddingTop: 14, paddingBottom: 120 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
    cardBig: { padding: 22 },
    flat: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.line },
    row: { alignItems: "center", flexDirection: "row", gap: 10 },
    grow: { flex: 1, minWidth: 0 },
    emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
    emoSm: { borderRadius: 10, height: 32, width: 32 },
    emoText: { fontSize: 21, lineHeight: 26 },
    emoTextSm: { fontSize: 17, lineHeight: 22 },
    cardTitle: { color: colors.ink, fontSize: 14.5, fontWeight: "800", lineHeight: 21 },
    lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17 },
    guideTitle: { color: colors.ink, fontSize: 12.5, fontWeight: "700", lineHeight: 18 },
    drop: { alignItems: "center", backgroundColor: colors.accentSoft, borderColor: colors.plum300, borderRadius: 18, borderStyle: "dashed", borderWidth: 1.6, flexDirection: "row", justifyContent: "center", padding: 18 },
    dropHalf: { paddingVertical: 2 },
    dropText: { color: colors.ink2, fontSize: 12.5, lineHeight: 18 },
    cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
    h3: { color: colors.ink, fontSize: 14.5, fontWeight: "800", lineHeight: 21 },
    more: { color: colors.ink3, fontSize: 12, fontWeight: "600", lineHeight: 18 },
    sampleTag: { backgroundColor: colors.macApricot, borderRadius: radius.tag, marginLeft: 6, paddingHorizontal: 6, paddingVertical: 1 },
    sampleText: { color: colors.macApricotInk, fontSize: 10, fontWeight: "800", lineHeight: 15 },
    evCard: { backgroundColor: colors.macLav, borderRadius: radius.lg, padding: 18, width: 300 },
    evName: { color: colors.ink, fontSize: 16, fontWeight: "700", lineHeight: 22, marginTop: 10 },
    avs: { flexDirection: "row" },
    av: { alignItems: "center", borderColor: colors.surface, borderRadius: radius.pill, borderWidth: 2, height: 30, justifyContent: "center", width: 30 },
    avText: { fontSize: 11.5, fontWeight: "800", lineHeight: 15 },
    av0: { backgroundColor: colors.macPink }, av1: { backgroundColor: colors.macBlue }, av2: { backgroundColor: colors.macTeal }, av3: { backgroundColor: colors.macApricot },
    avInk0: { color: colors.macPinkInk }, avInk1: { color: colors.macBlueInk }, avInk2: { color: colors.macTealInk }, avInk3: { color: colors.macApricotInk },
    btnBlock: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 32, justifyContent: "center", marginTop: 12 },
    btnBlockText: { color: colors.bg, fontSize: 12, fontWeight: "700", lineHeight: 18 },
    btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 32, justifyContent: "center", marginLeft: "auto", paddingHorizontal: 12 },
    btnSmText: { color: colors.ink, fontSize: 12, fontWeight: "700", lineHeight: 18 },
    dots: { flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 10 },
    dot: { backgroundColor: colors.surface3, borderRadius: radius.pill, height: 6, width: 6 },
    dotOn: { backgroundColor: colors.ink, width: 18 },
    li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
    liLine: { borderTopColor: colors.line, borderTopWidth: StyleSheet.hairlineWidth },
    ringWrap: { alignItems: "center", height: 44, justifyContent: "center", width: 44 },
    ringNum: { color: colors.ink, fontSize: 12, fontWeight: "800", lineHeight: 16, position: "absolute" },
    meta: { flex: 1, minWidth: 0 },
    metaTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 20 },
    metaSub: { color: colors.ink3, fontSize: 12, lineHeight: 17 },
    chip: { borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 3 },
    chipText: { fontSize: 11, fontWeight: "700", lineHeight: 16 },
}));
