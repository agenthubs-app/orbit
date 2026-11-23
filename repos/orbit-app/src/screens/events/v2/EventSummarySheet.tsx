// 2026-11-23 活动 › 探す：点卡片先出的底部简介面板（docs/designs/redesign-2026-10/event-side-panel-proposal.html ④ M1 / M2，② S1–S6）。
// 面板最高到屏幕 76%，往上拖到全屏；往下拖、点暗处、✕ 关闭。内容可滚，「查看详情」和主按钮固定在面板底部。
// 不用共用的 BottomSheet（37 处调用，最高 80%、没有上拖和固定底栏）：同样的 kit .sheet 外形、同一套关闭判定（sheet-logic）。
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Chip, Icon, UiPressable, UiText, useReducedMotion } from "../../../components/ui";
import { durations } from "../../../components/ui/motion";
import { UiPortal } from "../../../components/ui/Portal";
import { Scrim } from "../../../components/ui/Scrim";
import { shouldDismissSheet } from "../../../components/ui/sheet-logic";
import { useBackHandler } from "../../../components/ui/useBackHandler";
import { createThemedStyles } from "../../../design/theme";
import { useOrbitApiBaseUrl } from "../../../api/ApiBaseUrlProvider";
import { coverUri } from "./event-cover";
import type { EventSummaryResponse } from "../../../api/contract/event-summary";
import { useOrbitAuthSession } from "../../../api/AuthSessionProvider";
import { eventSummary, nextEventLine, rowWithSummary, type EventSummaryNext, type EventSummaryPerson, type EventSummaryRow } from "./event-summary-model";
import { Bone, Bones } from "./loading-ui";
import { useJourneyApi } from "./journey-api";
import { useRelevanceT } from "./Relevance";
import { useJourneyT } from "./useJourneyT";

export const SUMMARY_SHEET_RATIO = 0.76;

// 2026-11-23 先出布局再填内容：同一活动再次打开先用上次的摘要（按 服务器 + 账号 + 语言 + 活动 区分），后台再刷新。
const lastSummary = new Map<string, EventSummaryResponse>();
const LAST_SUMMARY_MAX = 40;
/** Tests: forget the remembered summaries. */
export function clearSummaryCache(): void { lastSummary.clear(); }
/** 往上拖超过这么多就展开到全屏。 */
const EXPAND_DRAG = 60;

export function EventSummarySheet({ row, tone, onClose, now = Date.now() }: { row: EventSummaryRow | null; tone: string; onClose: () => void; now?: number }) {
  const { styles, colors } = useStyles();
  const router = useRouter();
  const api = useJourneyApi();
  const { baseUrl } = useOrbitApiBaseUrl();
  const { language } = useJourneyT();
  const t = useRelevanceT();
  const reduced = useReducedMotion();
  const { height } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  // S5「看下一场」：面板换成那一场；关掉再点卡片时回到卡片自己的活动。
  const [shown, setShown] = useState<EventSummaryRow | null>(row);
  const [expanded, setExpanded] = useState(false);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  useEffect(() => { setShown(row); setExpanded(false); }, [row]);
  const visible = shown !== null;
  const auth = useOrbitAuthSession();
  const keyOf = useCallback((eventId: string) => `${baseUrl}\n${auth.actorId ?? ""}\n${language}\n${eventId}`, [auth.actorId, baseUrl, language]);
  // The summary answer for the shown event: the remembered one at once, then the fresh one in place. `failed` = keep the
  // list facts and decide the button from them (as before the summary existed).
  const [answer, setAnswer] = useState<{ key: string; data: EventSummaryResponse | null } | null>(null);
  const shownId = shown?.eventId ?? null;
  useEffect(() => {
    if (!shownId) return;
    const key = keyOf(shownId);
    let live = true;
    setAnswer(lastSummary.has(key) ? { data: lastSummary.get(key)!, key } : null);
    void api.summary(shownId).then((result) => {
      if (!live) return;
      if (result.ok) {
        lastSummary.delete(key); lastSummary.set(key, result.data);
        if (lastSummary.size > LAST_SUMMARY_MAX) lastSummary.delete(lastSummary.keys().next().value!);
        setAnswer({ data: result.data, key });
      } else setAnswer((current) => (current?.key === key && current.data ? current : { data: null, key }));
    });
    return () => { live = false; };
  }, [api, keyOf, shownId]);
  const merged = useMemo<EventSummaryRow | null>(() => {
    if (!shown) return null;
    if (!answer || answer.key !== keyOf(shown.eventId)) return shown;
    return answer.data ? rowWithSummary(shown, answer.data, now) : { ...shown, summaryLoaded: true };
  }, [answer, keyOf, now, shown]);
  const summary = useMemo(() => (merged ? eventSummary(merged, { language, now, t }) : null), [language, merged, now, t]);

  const offset = useSharedValue(reduced ? 0 : height);
  useEffect(() => {
    if (!visible) { offset.value = reduced ? 0 : height; return; }
    offset.value = reduced ? 0 : withTiming(0, { duration: durations.sheet });
  }, [height, offset, reduced, visible]);
  const close = useCallback(() => onClose(), [onClose]);
  useBackHandler(visible, close);
  const maxHeight = expanded ? Math.max(0, height - top - 8) : Math.round(height * SUMMARY_SHEET_RATIO);
  const [sheetHeight, setSheetHeight] = useState(maxHeight);
  const expand = useCallback(() => setExpanded(true), []);
  const drag = useMemo(() => Gesture.Pan()
    .onUpdate((event) => { offset.value = event.translationY >= 0 ? event.translationY : event.translationY / 6; })
    .onEnd((event) => {
      if (shouldDismissSheet(event.translationY, event.velocityY, sheetHeight)) { runOnJS(close)(); return; }
      if (event.translationY < -EXPAND_DRAG || event.velocityY < -900) runOnJS(expand)();
      offset.value = reduced ? 0 : withTiming(0, { duration: durations.sheet });
    }), [close, expand, offset, reduced, sheetHeight]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));

  if (!shown || !summary) return null;
  const cover = coverUri(shown.coverUrl, baseUrl);
  const go = (href: string) => { onClose(); router.push(href as Href); };
  const action = summary.action;
  const isFollowing = action.kind === "follow" && (following[shown.eventId] ?? action.following);
  const primary = (() => {
    switch (action.kind) {
      case "register": return { label: t("eventsV2.panelJoin"), onPress: () => go(action.href) };
      case "myRegistration": return { label: t("eventsV2.panelMyRegistration"), onPress: () => go(action.href) };
      case "waitlist": return { label: t("eventsV2.panelWaitlist"), onPress: () => go(action.href) };
      case "venueRecord": return { label: t("eventsV2.panelVenueRecord"), onPress: () => go(action.href) };
      case "nextEvent": return { label: t("eventsV2.panelNextEvent"), onPress: () => setShown({ area: null, emoji: action.next.emoji ?? "", ...action.next } as EventSummaryRow) };
      case "disabled": return { disabled: true, label: t(action.reason === "full" ? "eventsV2.panelFull" : "eventsV2.panelClosed") };
      case "follow": return isFollowing || !action.organizerId
        ? { disabled: true, label: t(isFollowing ? "eventsV2.panelFollowing" : "eventsV2.panelFollowOrganizer") }
        : { label: t("eventsV2.panelFollowOrganizer"), onPress: () => { const id = shown.eventId; setFollowing((current) => ({ ...current, [id]: true })); void api.follow(action.organizerId!, true).then((result) => { if (!result.ok) setFollowing((current) => ({ ...current, [id]: false })); }); } };
      case "pending": return null;
    }
  })();
  const markLabel = (key: (typeof summary.marks)[number]["key"]) => t(key === "ended" ? "eventsV2.panelEnded" : key === "registered" ? "eventsV2.panelRegistered" : key === "attended" ? "eventsV2.panelAttended" : key === "pending_review" ? "eventsV2.panelPendingReview" : "eventsV2.panelWaitlisted");
  const people = summary.people;

  return (
    <UiPortal>
      <View accessibilityViewIsModal onAccessibilityEscape={close} style={StyleSheet.absoluteFill} testID="events-summary">
        <Scrim onPress={close} />
        <View pointerEvents="box-none" style={styles.anchor}>
          <Animated.View accessibilityLabel={summary.title} onLayout={(event) => setSheetHeight(event.nativeEvent.layout.height)} style={[styles.sheet, { height: maxHeight }, sheetStyle]} testID={`events-summary-${summary.eventId}`}>
            <GestureDetector gesture={drag}>
              <View accessibilityRole="adjustable" accessibilityLabel={summary.title} style={styles.grabArea}><View style={styles.grab} /></View>
            </GestureDetector>
            <ScrollView bounces={false} style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              <View style={styles.top}>
                <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.close")} onPress={close} style={styles.close} testID="events-summary-close"><Icon name="x" size={20} color={colors.ink2} /></UiPressable>
              </View>
              {cover ? <Image source={{ uri: cover }} resizeMode="cover" style={styles.cover} accessibilityIgnoresInvertColors />
                : <View style={[styles.cover, styles.band, { backgroundColor: tone }]}><View style={styles.emo}><UiText style={styles.emoText}>{shown.emoji}</UiText></View></View>}
              <UiText accessibilityRole="header" style={styles.title} numberOfLines={2}>{summary.title}</UiText>
              {summary.organizer ? (
                <View style={styles.org}>
                  <View style={[styles.orgAv, { backgroundColor: colors.macBlue }]}><UiText style={[styles.orgAvText, { color: colors.macBlueInk }]}>{summary.organizerInitial}</UiText></View>
                  <UiText style={styles.orgText} numberOfLines={1}>{summary.organizer}</UiText>
                </View>
              ) : null}
              {summary.marks.length ? (
                <View style={styles.marks} testID="events-summary-marks">
                  {summary.marks.map((mark) => <Chip key={mark.key} label={markLabel(mark.key)} tone={mark.tone === "teal" ? "teal" : "neutral"} {...(mark.tone === "teal" ? { icon: "check" as const } : {})} />)}
                </View>
              ) : null}
              <View style={styles.facts}>
                {summary.facts.map((fact) => (
                  <View key={fact.icon} style={styles.fact}>
                    <View style={styles.factIcon}><Icon name={fact.icon} size={16} color={colors.ink3} /></View>
                    <View style={styles.grow}>
                      <UiText style={styles.factMain}>{fact.main}</UiText>
                      {fact.sub === "pending" ? <Bones testID="events-summary-seats-pending"><Bone w="58%" h={12} style={styles.subBone} /></Bones>
                        : fact.sub ? <UiText style={styles.factSub}>{fact.sub}</UiText> : null}
                    </View>
                  </View>
                ))}
              </View>
              {summary.intro === "pending" ? (
                // 4 lines at the intro's own line height, so the text replaces it in place.
                <Section title={t("eventsV2.panelIntro")} testID="events-summary-intro-pending">
                  <Bones>{[100, 96, 92, 64].map((w) => <View key={w} style={styles.introLine}><Bone w={`${w}%`} h={12} /></View>)}</Bones>
                </Section>
              ) : summary.intro ? <Section title={t("eventsV2.panelIntro")}><UiText style={styles.intro} numberOfLines={4}>{summary.intro}</UiText></Section> : null}
              {summary.relevance.length ? (
                <Section title={t("eventsV2.relTitle")} testID="events-summary-relevance">
                  <View style={styles.rel}>
                    {summary.relevance.map((line) => (
                      <View key={line.key} style={styles.relRow}>
                        <Chip label={line.chip} tone={line.tone} />
                        {line.text ? <UiText style={styles.relText}>{line.text}</UiText> : null}
                      </View>
                    ))}
                  </View>
                </Section>
              ) : null}
              {people && "pending" in people ? (
                // One avatar row (28 tall), the same height as the filled row.
                <Section title={people.title ? t("eventsV2.panelAttendees") : null} testID="events-summary-people-pending">
                  <Bones style={styles.ppl}><Bone w={28} h={28} r={14} /><Bone w="40%" h={12} /></Bones>
                </Section>
              ) : people ? (
                <Section title={t(people.title === "met" ? "eventsV2.panelMet" : "eventsV2.panelAttendees")} testID="events-summary-people">
                  <View style={styles.ppl}>
                    {people.preview.length ? <Avatars people={people.preview} /> : null}
                    {people.text ? <UiText style={styles.pplText}>{people.text}</UiText> : null}
                  </View>
                </Section>
              ) : null}
              {summary.next ? <Section title={t("eventsV2.panelNextTitle")} testID="events-summary-next"><NextRow next={summary.next} language={language} /></Section> : null}
            </ScrollView>
            <View style={styles.foot}>
              <UiPressable accessibilityRole="button" accessibilityLabel={t("eventsV2.panelSeeDetail")} onPress={() => go(summary.detailHref)} style={[styles.btn, styles.btnSoft]} testID="events-summary-detail">
                <UiText style={styles.btnText} numberOfLines={1}>{t("eventsV2.panelSeeDetail")}</UiText>
              </UiPressable>
              {primary ? (
                <UiPressable accessibilityRole="button" accessibilityLabel={primary.label} accessibilityState={{ disabled: Boolean(primary.disabled) }} disabled={Boolean(primary.disabled)} onPress={primary.onPress} style={[styles.btn, primary.disabled ? styles.btnSoft : styles.btnPrimary]} testID="events-summary-primary">
                  <UiText style={[styles.btnText, primary.disabled ? { color: colors.ink3 } : { color: colors.bg }]} numberOfLines={1}>{primary.label}</UiText>
                </UiPressable>
              ) : <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.btn, styles.btnSoft]} testID="events-summary-primary-pending" />}
            </View>
          </Animated.View>
        </View>
      </View>
    </UiPortal>
  );
}

function Section({ title, children, testID }: { title: string | null; children: React.ReactNode; testID?: string }) {
  const { styles } = useStyles();
  // title null = not known yet (an ended event: 参加者 or 你在这场见过的人): a bone at the title's height.
  return <View style={styles.sec} {...(testID ? { testID } : {})}>{title ? <UiText style={styles.secTitle}>{title}</UiText> : <Bones style={styles.secTitleBone}><Bone w={72} h={12} /></Bones>}{children}</View>;
}

/** kit .avs：28 圆、2px 白边、互相压 8；颜色按位置 c1 c3 c5 c1。 */
function Avatars({ people }: { people: readonly EventSummaryPerson[] }) {
  const { styles, colors } = useStyles();
  const tones = [[colors.macLav, colors.macLavInk], [colors.macBlue, colors.macBlueInk], [colors.macApricot, colors.macApricotInk]] as const;
  return (
    <View style={styles.avs}>
      {people.map((person, index) => {
        const [bg, ink] = tones[index % 3]!;
        return <View key={`${index}-${person.initial}`} style={[styles.av, index > 0 ? { marginLeft: -8 } : null, { backgroundColor: bg }]}><UiText style={[styles.avText, { color: ink }]}>{person.initial}</UiText></View>;
      })}
    </View>
  );
}

function NextRow({ next, language }: { next: EventSummaryNext; language: string }) {
  const { styles, colors } = useStyles();
  const { baseUrl } = useOrbitApiBaseUrl();
  const t = useRelevanceT();
  const cover = coverUri(next.coverUrl, baseUrl);
  return (
    <View style={styles.next}>
      {cover ? <Image source={{ uri: cover }} resizeMode="cover" style={styles.nextTh} accessibilityIgnoresInvertColors />
        : <View style={[styles.nextTh, { alignItems: "center", backgroundColor: colors.macTeal, justifyContent: "center" }]}><UiText style={styles.nextEmoji}>{next.emoji ?? ""}</UiText></View>}
      <View style={styles.grow}>
        <UiText style={styles.nextTitle} numberOfLines={1}>{next.title}</UiText>
        <UiText style={styles.nextSub} numberOfLines={1}>{nextEventLine(next, language, t)}</UiText>
      </View>
    </View>
  );
}

// 设计稿 ④（390 底部面板）实测：.sheet 8 边距 r34 内边距 10/18/22 · grab 38×5 下 14 · ✕ 40 圆 soft 下 10 · 封面 5:2 r18 ·
// 标题 17/800 行高 23.8 上 14 · 主办方 24 圆 + 12.5 ink2 上 8 · 状态 上 12 · 事实 上 14 间 9（图标 16 ink3 上 2，列间 10；13/19.5，小字 12/18 ink3）·
// 区块 上 18 线上 16 · 小标题 12/800 ink3 下 8 · 介绍 13/22.1 ink2 4 行 · 和你有关 行间 8 列间 8 · 参加者 头像 28 列间 10 13 ·
// 底栏 上 14 线 · 两键各半 间 8 高 44 13/700。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  anchor: { flex: 1, justifyContent: "flex-end" },
  sheet: { backgroundColor: colors.surface, borderRadius: 34, marginBottom: 8, marginHorizontal: 8, overflow: "hidden", paddingBottom: 22, paddingHorizontal: 18 },
  grabArea: { alignItems: "center", paddingBottom: 14, paddingTop: 10 },
  grab: { backgroundColor: colors.surface3, borderRadius: 3, height: 5, width: 38 },
  // 不展开时面板跟内容一样高（≤76%）；展开到全屏时滚动区撑满，底栏贴在面板底部。
  scroll: { flexGrow: 1, flexShrink: 1 },
  scrollContent: { paddingBottom: 16, paddingHorizontal: 2 },
  top: { alignItems: "flex-end", marginBottom: 10 },
  close: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  cover: { aspectRatio: 5 / 2, borderRadius: 18, width: "100%" },
  band: { alignItems: "flex-start", justifyContent: "flex-end", paddingBottom: 12, paddingHorizontal: 14 },
  emo: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoText: { fontSize: 23, lineHeight: 28 },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 23.8, marginTop: 14 },
  org: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 8 },
  orgAv: { alignItems: "center", borderRadius: 12, height: 24, justifyContent: "center", width: 24 },
  orgAvText: { fontSize: 10.5, fontWeight: "800", lineHeight: 15.75 },
  orgText: { color: colors.ink2, flexShrink: 1, fontSize: 12.5, lineHeight: 18.75 },
  marks: { flexDirection: "row", gap: 6, marginTop: 12 },
  facts: { gap: 9, marginTop: 14 },
  fact: { alignItems: "flex-start", flexDirection: "row", gap: 10 },
  factIcon: { marginTop: 2, width: 18 },
  grow: { flex: 1, minWidth: 0 },
  factMain: { color: colors.ink, fontSize: 13, lineHeight: 19.5 },
  factSub: { color: colors.ink3, fontSize: 12, lineHeight: 18 },
  sec: { borderTopColor: colors.line, borderTopWidth: 1, marginTop: 18, paddingTop: 16 },
  secTitle: { color: colors.ink3, fontSize: 12, fontWeight: "800", lineHeight: 18, marginBottom: 8 },
  intro: { color: colors.ink2, fontSize: 13, lineHeight: 22.1 },
  rel: { gap: 8 },
  relRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  relText: { color: colors.ink, flex: 1, fontSize: 13, lineHeight: 19.5 },
  ppl: { alignItems: "center", flexDirection: "row", gap: 10 },
  pplText: { color: colors.ink, flexShrink: 1, fontSize: 13, lineHeight: 19.5 },
  avs: { flexDirection: "row" },
  av: { alignItems: "center", borderColor: colors.surface, borderRadius: 14, borderWidth: 2, height: 28, justifyContent: "center", width: 28 },
  avText: { fontSize: 11, fontWeight: "800", lineHeight: 16.5 },
  next: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, flexDirection: "row", gap: 10, padding: 8 },
  nextTh: { borderRadius: 10, height: 44, width: 44 },
  nextEmoji: { fontSize: 20, lineHeight: 26 },
  nextTitle: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  nextSub: { color: colors.ink3, fontSize: 12, lineHeight: 18 },
  foot: { borderTopColor: colors.line, borderTopWidth: 1, flexDirection: "row", gap: 8, paddingTop: 14 },
  btn: { alignItems: "center", borderRadius: 999, flex: 1, height: 44, justifyContent: "center", paddingHorizontal: 16 },
  btnSoft: { backgroundColor: colors.surface2 },
  btnPrimary: { backgroundColor: colors.ink },
  btnText: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 19.5 },
  // Skeletons keep the filled block's height: sub line 18 · intro line 22.1 · title 18 + 8; the primary's placeholder is the button's own box.
  subBone: { marginVertical: 3 },
  introLine: { height: 22.1, justifyContent: "center" },
  secTitleBone: { height: 18, justifyContent: "center", marginBottom: 8 },
}));
