// R27 イベント › 探す（App；b2 #8 大量）：搜索 + 筛选按钮（件数）· 已选 chip（今月 ✕ / 東京 ✕ / テーマ ▾ / 参加費 ▾）·
// 📌 あなたのコミュニティ · 会いたい人が来る（横滑卡 + 页点）· すべて（日付順）。2026-11-15 去分数：卡片 / 行只出「跟你有关」的标签，
// 报名 ≥10 时卡片右上出「申込 N名」。数据：GET /api/events/discover（规则，不调 AI）。
// 2026-11-20（events-replay-cover-app-proposal ⑧ ⑧b，D2）：有 coverUrl 的卡顶部 2:1 图（260×130），「申込 N名」毛玻璃叠在图右上；
// 同一排里只要有一张有图，没图的卡用自己的 emoji + 色带补成同高；整排都没图保持原样。「すべて」/ コミュニティ行不放图。
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image, ScrollView, StyleSheet, TextInput, View } from "react-native";

import type { EventDiscoverArea, EventDiscoverFormat, EventDiscoverPeriod, EventDiscoverQuery, EventDiscoverResponse, EventDiscoverRow, EventDiscoverTheme } from "../../../api/contract/event-discover";
import type { EventSearchResponse } from "../../../api/contract/event-search";
import { EmailNotice } from "../../../email-verification/EmailNotice";
import { SHELL_GUTTER } from "../../../components/ShellTopBar";
import { openMainTab } from "../../../components/shell-navigation";
import { planNewGoalHref } from "../../../api/compute/plan-href";
import { firstProfileGoalForPlan, type ProfileGoalPlanKind } from "../../../api/compute/profile-onboarding-goal";
import { useOrbitApiClient } from "../../../hooks/useOrbitApiClient";
import { BottomSheet, FilterOption, FullScreenSearch, Icon, Toggle, UiPressable, UiText } from "../../../components/ui";
import Svg, { Defs, RadialGradient, Rect, Stop } from "../../../components/ui/svg";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { designColors } from "../../../api/design/tokens";

// The 「已结束」 tag sits on the cover photo, so it is the same in light and dark (kit .endtag): the light palette on purpose.
const photoColors = designColors.light;
import { addDesignMock } from "../../add/add-design-mock";
import { useJourneyApi } from "./journey-api";
import { AREAS, PERIODS, THEMES, areaLabel, discoverWhen, feeText, periodLabel, rowTone, themeLabel, tokyo, type JourneyTone } from "./journey-model";
import { RelevanceChips, registrationChipLabel, relevanceChips, useRelevanceT } from "./Relevance";
import { PersonalScheduleDateTimePicker } from "../../schedule/PersonalScheduleDateTimePicker";
import { useJourneyT } from "./useJourneyT";
import { Bone, BoneCard, Bones } from "./loading-ui";
import { useOrbitLocale } from "../../../i18n/OrbitLocaleContext";
import { useOrbitAuthSession } from "../../../api/AuthSessionProvider";
import { recentSearchKey } from "../../../data/account-local-caches";
import { useOrbitApiBaseUrl } from "../../../api/ApiBaseUrlProvider";
import { coverUri } from "./event-cover";
import { EventSummarySheet } from "./EventSummarySheet";

// 2026-10-29 探す 时期规则（同 Web DEFAULT_DISCOVER_QUERY）：默认 これから · 场所不限 · 推荐顺；開催済み = 过去 1 年。
export const APP_DISCOVER_QUERY: EventDiscoverQuery = { areas: [], period: "upcoming", planFirst: true, sort: "recommended", themes: [] };
const FORMATS: readonly EventDiscoverFormat[] = ["speakers", "networking", "small"];

/** 路由参数里的条件（`/events?tab=discover&period=this_week&areas=tokyo&themes=manufacturing_dx&q=CFO&filters=1`）。 */
export function discoverQueryFromParams(params: Record<string, string | string[] | undefined>): EventDiscoverQuery {
  const one = (key: string) => { const value = params[key]; return Array.isArray(value) ? value[0] : value; };
  const list = <T extends string>(key: string, allowed: readonly T[]) => (one(key) ?? "").split(",").filter((value): value is T => (allowed as readonly string[]).includes(value));
  const period = one("period");
  const areas = list<EventDiscoverArea>("areas", AREAS);
  const themes = list<EventDiscoverTheme>("themes", THEMES);
  return {
    ...APP_DISCOVER_QUERY,
    ...(period && (PERIODS as readonly string[]).includes(period) ? { period: period as EventDiscoverPeriod } : {}),
    ...(one("areas") !== undefined ? { areas } : {}),
    ...(one("themes") !== undefined ? { themes } : {}),
  };
}

// 2026-11-21 手机扫描（加载慢）：本次运行内记住每个筛选条件的上次结果，回到探す 时先出上次的列表、后台再刷新。
// 按 服务器 + 账号 + 条件 区分；只存成功的答复。
const lastDiscover = new Map<string, EventDiscoverResponse>();
const LAST_DISCOVER_MAX = 20;

export function DiscoverPage({ onSubtitle, initialQuery = APP_DISCOVER_QUERY, initialSearch = "", openFilters = false }: { onSubtitle?: (text: string) => void; initialQuery?: EventDiscoverQuery; initialSearch?: string; openFilters?: boolean }) {
  const { styles, colors } = useStyles();
  const { t, language } = useJourneyT();
  const locale = useOrbitLocale();
  const rt = useRelevanceT();
  const router = useRouter();
  const api = useJourneyApi();
  const { baseUrl } = useOrbitApiBaseUrl();
  const [query, setQuery] = useState<EventDiscoverQuery>(initialQuery);
  const auth = useOrbitAuthSession();
  const cacheKey = `${baseUrl}\n${auth.actorId ?? ""}\n${JSON.stringify(query)}`;
  const [data, setData] = useState<EventDiscoverResponse | null>(() => lastDiscover.get(cacheKey) ?? null);
  const [search, setSearch] = useState(initialSearch);
  const [searching, setSearching] = useState(Boolean(initialSearch));
  const [results, setResults] = useState<EventSearchResponse | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [sheet, setSheet] = useState(openFilters);
  // The design-review deep link captures selections in the sheet before they are applied to the results.
  const [draft, setDraft] = useState<EventDiscoverQuery>((): EventDiscoverQuery => openFilters && addDesignMock("open-path")
    ? { ...initialQuery, themes: ["funding", "saas"], formats: ["networking"] }
    : initialQuery);
  // 2026-11-27（同 Web de28c836a）：没计划时的引导卡——文案随资料里的目标（有目标且对得上计划类型时服务端已按目标粗排）；
  // 右上角可关，按账号记在本机。undefined = 目标还没读到（卡片先出骨架）。
  const client = useOrbitApiClient();
  const [goal, setGoal] = useState<{ text: string; suggestedKind: ProfileGoalPlanKind | null } | null | undefined>(undefined);
  const goalWanted = Boolean(data?.popularityFallback);
  useEffect(() => {
    if (!goalWanted || goal !== undefined) return;
    let live = true;
    void client.get<{ profile?: { relationshipGoal?: string | null } | null }>("/api/profile").then((res) => {
      if (!live) return;
      const saved = res.success ? firstProfileGoalForPlan(res.data?.profile?.relationshipGoal ?? "") : null;
      setGoal(saved && saved.text.trim() ? { text: saved.text.trim(), suggestedKind: saved.suggestedKind } : null);
    }).catch(() => { if (live) setGoal(null); });
    return () => { live = false; };
  }, [client, goalWanted, goal]);
  const guideKey = `orbit:discover:plan-guide-closed:${auth.actorId ?? "anon"}`;
  const [guideClosed, setGuideClosed] = useState(false);
  useEffect(() => { let live = true; void AsyncStorage.getItem(guideKey).then((v) => { if (live) setGuideClosed(v === "1"); }).catch(() => undefined); return () => { live = false; }; }, [guideKey]);
  const closeGuide = () => { setGuideClosed(true); void AsyncStorage.setItem(guideKey, "1").catch(() => undefined); };
  const goalRanked = Boolean(goal?.suggestedKind);
  // 门禁开发开关：聚焦不弹软键盘（画板从不画系统键盘）。
  const noKeyboard = addDesignMock("no-keyboard");

  useEffect(() => {
    let live = true;
    setData(lastDiscover.get(cacheKey) ?? null);
    void api.discover(query).then((result) => {
      if (result.ok) {
        lastDiscover.delete(cacheKey);
        lastDiscover.set(cacheKey, result.data);
        if (lastDiscover.size > LAST_DISCOVER_MAX) lastDiscover.delete(lastDiscover.keys().next().value!);
      }
      if (live) setData(result.ok ? result.data : lastDiscover.get(cacheKey) ?? { all: [], community: [], planFit: [], planFitTotal: 0, popularityFallback: true, total: 0 });
    });
    return () => { live = false; };
  }, [api, query, cacheKey]);
  // LF5: the account's own recent event searches (the list used to be shared by every account on the device).
  const recentKey = recentSearchKey("events", auth.actorId);
  useEffect(() => {
    let live = true;
    if (recentKey) void AsyncStorage.getItem(recentKey).then((value) => { if (live && value) { try { const parsed = JSON.parse(value) as unknown; if (Array.isArray(parsed)) setRecent(parsed.filter((item): item is string => typeof item === "string").slice(0, 5)); } catch { /* ignore */ } } }).catch(() => undefined);
    return () => { live = false; };
  }, [recentKey]);
  useEffect(() => {
    const q = search.trim();
    if (!q) { setResults(null); return; }
    let live = true;
    const timer = setTimeout(() => { void api.search(q).then((result) => { if (live) setResults(result.ok ? result.data : null); }); }, 250);
    return () => { live = false; clearTimeout(timer); };
  }, [api, search]);
  const remember = (q: string) => {
    const value = q.trim();
    if (!value) return;
    const next = [value, ...recent.filter((item) => item !== value)].slice(0, 5);
    setRecent(next);
    if (recentKey) void AsyncStorage.setItem(recentKey, JSON.stringify(next)).catch(() => undefined);
  };
  const [draftCount, setDraftCount] = useState<number | null>(null);
  useEffect(() => {
    if (!sheet) return;
    let live = true;
    void api.discover(draft).then((result) => { if (live) setDraftCount(result.ok ? result.data.total : null); });
    return () => { live = false; };
  }, [api, draft, sheet]);
  useEffect(() => {
    if (!data || !onSubtitle) return;
    onSubtitle(query.period === "past" ? t("dSubtitlePast", { n: data.total }) : data.popularityFallback ? t("dSubtitleEmpty") : data.total <= 5 && data.all.length > 0 ? t("dSubtitleFewLong", { n: data.total }) : t("dSubtitleMany", { n: data.planFitTotal, period: query.period ? periodLabel(query.period, t) : "", total: data.total }));
  }, [data, onSubtitle, query.period, t]);

  // 2026-11-23 event-side-panel-proposal ④：点卡片 / 行先出底部简介面板；进详情靠面板里的「查看详情」。
  const [selected, setSelected] = useState<{ row: EventDiscoverRow; tone: string } | null>(null);
  const open = useCallback((row: EventDiscoverRow, tone?: string) => setSelected({ row, tone: tone ?? colors.macTeal }), [colors.macTeal]);
  const closeSummary = useCallback(() => setSelected(null), []);
  const patch = (next: Partial<EventDiscoverQuery>) => setQuery((current) => ({ ...current, ...next }));
  // 时期清掉 = 回到默认 これから（同 Web）。
  const clear = (key: keyof EventDiscoverQuery) => setQuery((current) => { const next = { ...current }; delete next[key]; if (key === "period") { delete next.from; delete next.to; next.period = "upcoming"; } return next; });
  const past = query.period === "past";
  const flat = data !== null && !past && !data.popularityFallback && data.total <= 5 && data.all.length > 0;
  const count = (query.period && query.period !== "upcoming" ? 1 : 0) + (query.areas?.length ?? 0) + (query.themes?.length ?? 0) + (query.freeOnly ? 1 : 0);
  // すべて is always by date (2026-11-15: no score order any more). Without a plan the server order stays: a profile goal puts matching events first (Web de28c836a).
  const rows = useMemo(() => (data ? (data.popularityFallback ? data.all : [...data.all].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) : []), [data]);
  const toneBg = (tone: JourneyTone) => (tone === "teal" ? colors.macTeal : tone === "lav" ? colors.macLav : tone === "blue" ? colors.macBlue : tone === "apricot" ? colors.macApricot : colors.macPink);
  const openSheet = () => { setDraft(query); setSheet(true); };
  // 指定日期: a start day, then an end day (Tokyo dates; the server's custom period reads from / to).
  const [pickDay, setPickDay] = useState<"from" | "to" | null>(null);
  const customRange = (value: EventDiscoverQuery) => [value.from, value.to].filter(Boolean).map((day) => `${Number(day!.slice(5, 7))}/${Number(day!.slice(8, 10))}`).join("–");
  const toggleIn = <T extends string>(list: readonly T[] | undefined, value: T) => (list?.includes(value) ? list.filter((item) => item !== value) : [...(list ?? []), value]);

  // 已结束（2026-11-23 ④ M2）：封面保持原色，左上角「已结束」角标；不放费用和标签。
  const pastRow = (row: EventDiscoverRow, index: number) => {
    const cover = coverUri(row.coverUrl, baseUrl);
    const tone = toneBg(rowTone(index));
    return (
      <UiPressable key={row.eventId} accessibilityRole="button" accessibilityLabel={row.title} onPress={() => open(row, tone)} style={styles.ecRow} testID={`events-discover-past-${row.eventId}`}>
        {selected?.row.eventId === row.eventId ? <View pointerEvents="none" style={styles.ecSel} /> : null}
        <View>
          {cover ? <Image source={{ uri: cover }} resizeMode="cover" style={styles.ecThumb} accessibilityIgnoresInvertColors />
            : <View style={[styles.ecThumb, styles.ecThumbEmoji, { backgroundColor: tone }]}><UiText style={styles.ecEmoji}>{row.emoji}</UiText></View>}
          <View style={styles.endTag} testID={`events-discover-ended-${row.eventId}`}><View style={styles.endTagBg} /><UiText style={styles.endTagText}>{rt("eventsV2.panelEnded")}</UiText></View>
        </View>
        <View style={styles.ecText}>
          <UiText style={styles.ecTitle} numberOfLines={2}>{row.title}</UiText>
          <UiText style={styles.ecMeta} numberOfLines={1}>{[discoverWhen(row.startsAt, language), row.venue].filter(Boolean).join(" · ")}</UiText>
        </View>
      </UiPressable>
    );
  };
  const datebox = (iso: string, tall = false) => { const p = tokyo(iso); return <View style={styles.datebox}><UiText style={styles.dateDay}>{p?.day ?? ""}</UiText><UiText style={[styles.dateMonth, tall ? { lineHeight: 15.4 } : null]}>{p ? t("monthLabel", { m: p.month }) : ""}</UiText></View>; };
  const chip = (label: string, onPress: () => void, on: boolean, key: string, caret = false) => (
    <UiPressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.chip, on ? { backgroundColor: colors.macLav } : null]}>
      <UiText style={[styles.chipText, on ? { color: colors.macLavInk } : null]}>{on ? `${label} ✕` : label}</UiText>
      {caret ? <View style={styles.caret}><View style={{ transform: [{ scale: 0.75 }] }}><Icon name="down" size={16} color={colors.ink2} /></View></View> : null}
    </UiPressable>
  );

  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="events-discover">
      <EmailNotice />
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Icon name="search" size={16} color={colors.ink3Text} />
          <TextInput value={search} onChangeText={setSearch} onFocus={() => setSearching(true)} placeholder={t("searchPlaceholder")} placeholderTextColor={colors.ink3Text} accessibilityLabel={t("searchPlaceholder")} returnKeyType="search" style={styles.searchInput} />
        </View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("filtersLbl")} onPress={openSheet} style={styles.rbtn} testID="events-discover-filter">
          <Icon name="sliders" size={20} color={colors.ink2} />
          {count && data ? <View style={styles.badge}><UiText style={styles.badgeText}>{count}</UiText></View> : null}
        </UiPressable>
      </View>
      {/* 2026-11-21 手机扫描：数据未到时不知道是否走「人気順」引导，先只出骨架，不画筛选块（之前先画「今月 ✕」再整体换掉）。 */}
      {data === null ? (
        <Bones testID="events-discover-loading" style={styles.loadingBones}><BoneCard rows={2} /><BoneCard rows={3} /></Bones>
      ) : <View style={styles.chips}>
        {query.period && query.period !== "upcoming" ? chip(query.period === "custom" && query.from ? customRange(query) : periodLabel(query.period, t), () => clear("period"), true, "period") : null}
        {(query.areas ?? []).map((a) => chip(areaLabel(a, t), () => patch({ areas: (query.areas ?? []).filter((x) => x !== a) }), true, `a-${a}`))}
        {(query.themes ?? []).map((x) => chip(themeLabel(x, t), () => patch({ themes: (query.themes ?? []).filter((v) => v !== x) }), true, `t-${x}`))}
        {query.freeOnly ? chip(t("freeOnly"), () => clear("freeOnly"), true, "free") : null}
        {query.themes?.length ? null : chip(t("filterTheme"), openSheet, false, "theme", true)}
        {flat || query.freeOnly ? null : chip(t("feeLbl"), openSheet, false, "fee", true)}
      </View>}

      {data?.popularityFallback && !past ? (
        <>
          {guideClosed ? null : (
          <View style={[styles.card, styles.guide]} testID="events-discover-empty">
            <View pointerEvents="none" style={styles.guideGlow}>
              <Svg width={220} height={220}>
                {/* CSS radial-gradient(circle) uses the farthest corner of this 220px square. */}
                <Defs><RadialGradient id="events-discover-guide-glow" cx={110} cy={110} r={156} gradientUnits="userSpaceOnUse"><Stop offset={0} stopColor={colors.macLav} /><Stop offset={0.7} stopColor={colors.macLav} stopOpacity={0} /></RadialGradient></Defs>
                <Rect x={0} y={0} width={220} height={220} fill="url(#events-discover-guide-glow)" />
              </Svg>
            </View>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("close")} onPress={closeGuide} style={styles.guideClose} testID="events-discover-guide-close"><Icon name="x" size={16} color={colors.ink3Text} /></UiPressable>
            <UiText style={styles.lbl}>{t("noPlanLbl")}</UiText>
            {goal === undefined ? (
              <Bones testID="events-discover-goal-pending"><Bone w="70%" h={18} style={{ marginTop: 8 }} /><Bone w="80%" h={14} style={{ marginTop: 10 }} /></Bones>
            ) : (
              <>
                <UiText style={styles.guideTitle}>{goalRanked ? t("noPlanTitleRanked") : goal ? t("noPlanTitleGoal") : `${t("noPlanTitleShort")}\n${t("noPlanTitleRest")}`}</UiText>
                <UiText style={styles.guideSub}>{t(goalRanked ? "noPlanSubRanked" : goal ? "noPlanSubGoal" : "noPlanSubShort")}</UiText>
              </>
            )}
            <UiPressable accessibilityRole="button" accessibilityLabel={t(goal ? "planFromGoal" : "setGoal")} onPress={() => openMainTab(router, planNewGoalHref("app"))} style={styles.btnBlock46} testID="events-discover-plan-button"><Icon name="target" size={16} color={colors.bg} /><UiText style={styles.btnPrimaryText}>{t(goal ? "planFromGoal" : "setGoal")}</UiText></UiPressable>
          </View>
          )}
          <View style={styles.grid3}>
            {([["🔗", "tileUrl", colors.macBlue, "/events/assess?mode=url"], ["🎟️", "tileCode", colors.macTeal, "/events?code=1"], ["👥", "tileCommunity", colors.macPink, "/events?tab=discover"]] as const).map(([emoji, key, bg, href]) => (
              <UiPressable key={key} accessibilityRole="button" accessibilityLabel={t(key)} onPress={() => router.push(href as Href)} style={styles.tile}>
                <View style={[styles.emo, { backgroundColor: bg }]}><UiText style={styles.emoText}>{emoji}</UiText></View>
                <UiText style={styles.tileText}>{t(key)}</UiText>
              </UiPressable>
            ))}
          </View>
          {/* 2026-11-27（同 Web 手机 8d537213c / de28c836a）：没有计划也直接列真实活动；只有一场都没有时才画「有了计划后」示例。 */}
          {data.all.length ? null : <View style={[styles.card, { marginTop: 14 }]} testID="events-discover-sample">
            <View style={styles.cardH}><View style={[styles.row, { gap: 8 }]}><UiText style={styles.h3}>{t("samplePreview")}</UiText><View style={styles.sampleTag}><UiText style={styles.sampleText}>{t("sampleTag")}</UiText></View></View></View>
            {/* 2026-11-21：示例也用新的左图右文行（与真卡一致，无「詳細」按钮）。 */}
            <View style={[styles.ecRow, styles.ecSample]}>
              <View style={[styles.ecThumb, styles.ecThumbEmoji, { backgroundColor: colors.macTeal }]}><UiText style={styles.ecEmoji}>🎤</UiText></View>
              <View style={styles.ecText}>
                <UiText style={styles.ecTitle} numberOfLines={2}>{t("sample1Title")}</UiText>
                <UiText style={styles.ecMeta} numberOfLines={1}>{t("sample1Meta").split(" · ").slice(0, 2).join(" · ")}</UiText>
                <View style={styles.ecFoot}>
                  <View style={styles.ecChips}><RelevanceChips style={styles.ecChipRow} chips={relevanceChips({ group: "people", known: { count: 2, names: [] }, people: [{ count: 3, emoji: "", label: rt("eventsV2.relExampleType"), source: "registrants", typeKey: "sample" }], topic: null, warnings: [] }, rt)} /></View>
                  <UiText style={styles.ecReg} numberOfLines={1}>{rt("eventsV2.relChipRegistered", { n: 128 })}</UiText>
                  <UiText style={styles.ecFee} numberOfLines={1}>¥15,000</UiText>
                </View>
              </View>
            </View>
            <View style={[styles.ghostRow, { marginTop: 12 }]}><View style={styles.ghostDot} /><UiText style={styles.ghostText}>{t("sampleCommunityLine")}</UiText></View>
            <View style={[styles.ghostRow, { marginTop: 8 }]}><View style={styles.ghostDot} /><UiText style={styles.ghostText}>{t("sampleKnownLine")}</UiText></View>
          </View>}
        </>
      ) : null}

      {flat && data ? (
        <>
          <View style={[styles.card, styles.all, { marginTop: 14, paddingVertical: 6 }]} testID="events-discover-few">
            {data.all.map((row, index) => (
              <UiPressable key={row.eventId} accessibilityRole="button" accessibilityLabel={row.title} onPress={() => open(row)} style={styles.li}>
                {index > 0 ? <View style={styles.liLine} /> : null}
                {datebox(row.startsAt)}
                <View style={styles.meta}><UiText style={styles.metaTitle} numberOfLines={2}>{row.title}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[row.venue, feeText(row.priceYen, t)].filter(Boolean).join(" · ")}</UiText><RelevanceChips style={styles.rowChips} chips={relevanceChips(row.relevance, rt)} /></View>
              </UiPressable>
            ))}
          </View>
          {data.widen?.length ? (
            <View style={[styles.card, styles.flat, { marginTop: 14 }]} testID="events-discover-widen">
              <View style={[styles.row, { gap: 8 }]}><View style={[styles.emo, styles.emoSm, { backgroundColor: colors.macApricot }]}><UiText style={styles.emoTextSm}>💡</UiText></View><UiText style={styles.widenTitle}>{t("widenTitle")}</UiText></View>
              <View style={{ gap: 8, marginTop: 10 }}>
                {data.widen.map((item) => (
                  <UiPressable key={`${item.kind}:${item.value}`} accessibilityRole="button" accessibilityLabel={item.value} onPress={() => patch(item.kind === "period" ? { period: item.value as EventDiscoverPeriod } : item.kind === "area" ? { areas: [...(query.areas ?? []), item.value as EventDiscoverArea] } : { themes: [...(query.themes ?? []), item.value as EventDiscoverTheme] })} style={styles.widenRow}>
                    <UiText style={styles.widenText}>{item.kind === "period" ? t("widenPeriod", { v: periodLabel(item.value as EventDiscoverPeriod, t) }) : item.kind === "area" ? t("widenAddArea", { v: areaLabel(item.value as EventDiscoverArea, t) }) : t("widenAddTheme", { v: themeLabel(item.value as EventDiscoverTheme, t) })}</UiText>
                    <View style={[styles.chip, { backgroundColor: colors.macTeal }]}><UiText style={[styles.chipText, { color: colors.macTealInk }]}>{t("plusN", { n: item.extra })}</UiText></View>
                  </UiPressable>
                ))}
              </View>
            </View>
          ) : null}
          <View style={styles.macNote}><UiText style={styles.macNoteText}>{t("communityNote")}</UiText></View>
        </>
      ) : null}

      {/* 開催済み：结果全是已结束的，同一灰卡片样式平铺，最近的在前；没有时说去掉条件试试。 */}
      {past && data ? (data.all.length ? (
        <View testID="events-discover-past-all">
          <View style={styles.lh}><UiText style={styles.lhTitle}>{t("pastTitle", { n: data.total })}</UiText><UiText style={styles.lhLbl}>{t("byNewest")}</UiText></View>
          <View style={styles.ecList}>{data.all.map(pastRow)}</View>
        </View>
      ) : (
        <View style={[styles.card, styles.noMatch]} testID="events-discover-past-empty">
          <UiText style={styles.noMatchTitle}>{t("pastEmpty")}</UiText>
          <UiText style={[styles.lhLbl, { marginTop: 6 }]}>{t("pastEmptySub")}</UiText>
        </View>
      )) : null}

      {!past && !flat && data && data.community.length ? (
        <View style={[styles.card, styles.comm]} testID="events-discover-community">
          <View style={[styles.cardH, { marginBottom: 4 }]}><UiText style={styles.h3}>{t("communityTitle")}</UiText><UiText style={styles.more}>{t("countN", { n: data.community.length })}</UiText></View>
          {data.community.map((row, index) => {
            const badge = row.badges?.includes("members_only") ? "members_only" : row.badges?.includes("early_access") ? "early_access" : null;
            return (
              <UiPressable key={row.eventId} accessibilityRole="button" accessibilityLabel={row.title} onPress={() => open(row)} style={styles.li}>
                {index > 0 ? <View style={styles.liLine} /> : null}
                {datebox(row.startsAt)}
                <View style={styles.meta}><UiText style={styles.metaTitle} numberOfLines={2}>{row.title}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[row.venue, row.communityReason === "following" ? t("following") : t("attended")].filter(Boolean).join(" · ")}</UiText></View>
                {badge ? <View style={[styles.chip, { backgroundColor: badge === "members_only" ? colors.macLav : colors.macTeal }]}><UiText style={[styles.chipText, { color: badge === "members_only" ? colors.macLavInk : colors.macTealInk }]}>{badge === "members_only" ? t("badgeMembers") : t("badgeEarly")}</UiText></View> : null}
              </UiPressable>
            );
          })}
        </View>
      ) : null}

      {!past && !flat && data && data.planFit.length ? (
        <View style={styles.section} testID="events-discover-planfit">
          <View style={styles.cardH}><UiText style={styles.h3}>{rt("eventsV2.relDiscoverPeople")}</UiText><UiText style={styles.more}>{t("countN", { n: data.planFitTotal })}</UiText></View>
          {/* 2026-11-21 event-card-compact-proposal 推荐案 B（用户确认）：手机用左图右文列表行——88×88 缩略图（封面居中裁方 / 没封面 = emoji 色块），
              右边 标题 ≤2 行 · 日期 · 地点 1 行 · 标签 · 报名人数 · 费用 1 行；有封面 / 无封面同高 112；整行可点，不放「詳細」按钮（取代 260 宽横滑卡）。 */}
          <View style={styles.ecList}>
            {data.planFit.map((row, index) => {
              const registered = registrationChipLabel(row.registrationCount, rt);
              const cover = coverUri(row.coverUrl, baseUrl);
              const fee = feeText(row.priceYen, t);
              return (
                <UiPressable key={row.eventId} accessibilityRole="button" accessibilityLabel={row.title} onPress={() => open(row, toneBg(rowTone(index)))} style={styles.ecRow} testID={`events-discover-card-${row.eventId}`}>
                  {selected?.row.eventId === row.eventId ? <View pointerEvents="none" style={styles.ecSel} /> : null}
                  {cover ? <Image source={{ uri: cover }} resizeMode="cover" style={styles.ecThumb} accessibilityIgnoresInvertColors testID={`events-discover-cover-${row.eventId}`} />
                    : <View style={[styles.ecThumb, styles.ecThumbEmoji, { backgroundColor: toneBg(rowTone(index)) }]}><UiText style={styles.ecEmoji}>{row.emoji}</UiText></View>}
                  <View style={styles.ecText}>
                    <UiText style={styles.ecTitle} numberOfLines={2}>{row.title}</UiText>
                    <UiText style={styles.ecMeta} numberOfLines={1}>{[discoverWhen(row.startsAt, language), row.venue].filter(Boolean).join(" · ")}</UiText>
                    <View style={styles.ecFoot}>
                      <View style={styles.ecChips}><RelevanceChips style={styles.ecChipRow} chips={relevanceChips(row.relevance, rt)} /></View>
                      {registered ? <UiText style={styles.ecReg} numberOfLines={1}>{registered}</UiText> : null}
                      {fee ? <UiText style={styles.ecFee} numberOfLines={1}>{fee}</UiText> : null}
                    </View>
                  </View>
                </UiPressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {!past && !flat && rows.length ? (
        <View style={[styles.card, styles.all]} testID="events-discover-all">
          <View style={[styles.cardH, { marginBottom: 0, marginTop: 8 }]}>
            <UiText style={styles.h3}>{t("allPlain")}</UiText>
            <View style={[styles.row, { gap: 10 }]}>
              {data?.popularityFallback && guideClosed ? <UiPressable accessibilityRole="button" accessibilityLabel={t(goal === null ? "setGoal" : "makePlanShort")} onPress={() => openMainTab(router, planNewGoalHref("app"))} testID="events-discover-reopen-plan"><UiText style={styles.more}>{t(goal === null ? "setGoal" : "makePlanShort")}</UiText></UiPressable> : null}
              <UiText style={styles.more}>{t("byDate")}</UiText>
            </View>
          </View>
          {rows.map((row, index) => (
            <UiPressable key={row.eventId} accessibilityRole="button" accessibilityLabel={row.title} onPress={() => open(row)} style={styles.li}>
              {index > 0 ? <View style={styles.liLine} /> : null}
              {datebox(row.startsAt)}
              <View style={styles.meta}><UiText style={styles.metaTitle} numberOfLines={2}>{row.title}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[row.venue, feeText(row.priceYen, t)].filter(Boolean).join(" · ")}</UiText><RelevanceChips style={styles.rowChips} chips={relevanceChips(row.relevance, rt)} /></View>
            </UiPressable>
          ))}
        </View>
      ) : null}

      {/* 已结束（2026-11-23 ④ M2）：封面保持原色，左上角「已结束」角标；不放费用和标签。最近的在前。 */}
      {!past && data && data.past?.length ? (
        <View testID="events-discover-past">
          <View style={styles.lh}>
            <UiText style={styles.lhTitle}>{rt("eventsV2.pastTitle", { n: data.pastTotal ?? data.past.length })}</UiText>
            {/* 超过列出的条数（50）时「すべて見る」= 切到 開催済み（同 Web）。 */}
            {(data.pastTotal ?? 0) > data.past.length
              ? <UiPressable accessibilityRole="button" accessibilityLabel={t("pastSeeAll")} onPress={() => patch({ period: "past" })} testID="events-discover-past-all-link"><UiText style={styles.more}>{t("pastSeeAll")}</UiText></UiPressable>
              : <UiText style={styles.lhLbl}>{rt("eventsV2.pastNewest")}</UiText>}
          </View>
          <View style={styles.ecList}>{data.past.map(pastRow)}</View>
        </View>
      ) : null}

      {!past && data && !data.popularityFallback && !flat && rows.length === 0 && data.community.length === 0 && data.planFit.length === 0 ? (
        <View style={[styles.card, styles.noMatch]} testID="events-discover-no-match">
          <UiText style={styles.noMatchTitle}>{t("noMatchTitle")}</UiText>
          {count ? <UiPressable accessibilityRole="button" accessibilityLabel={t("noMatchClear")} onPress={() => setQuery({ ...APP_DISCOVER_QUERY, ...(query.sort ? { sort: query.sort } : {}) })} style={[styles.btnSm, styles.noMatchBtn]} testID="events-discover-clear"><UiText style={styles.btnSmText}>{t("noMatchClear")}</UiText></UiPressable> : null}
        </View>
      ) : null}

      {pickDay ? (
        // Shown after the filter sheet closes (two stacked iOS modals do not present reliably); the sheet comes back after.
        <PersonalScheduleDateTimePicker kind="date" zone="Asia/Tokyo" disabled={false} value={(pickDay === "from" ? draft.from : draft.to) ?? ""}
          title={locale.t(pickDay === "from" ? "schedule.fieldStartDate" : "schedule.fieldEndDate")}
          onCancel={() => { setPickDay(null); setTimeout(() => setSheet(true), 350); }}
          onConfirm={(day) => {
            if (pickDay === "from") { setDraft(({ to, ...d }) => ({ ...d, from: day, period: "custom", ...(to && to >= day ? { to } : {}) })); setPickDay("to"); }
            else { setDraft((d) => ({ ...d, period: "custom", to: d.from && day < d.from ? d.from : day })); setPickDay(null); setTimeout(() => setSheet(true), 350); }
          }} />
      ) : null}
      <BottomSheet visible={sheet} onClose={() => setSheet(false)} accessibilityLabel={t("filtersLbl")}>
        <View style={styles.sheet} testID="events-discover-sheet">
          <View style={[styles.row, { justifyContent: "space-between", marginBottom: 2 }]}>
            <UiText style={styles.sheetTitle}>{t("filtersLbl")}</UiText>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("clear")} onPress={() => setDraft({ ...APP_DISCOVER_QUERY })} style={styles.ghostBtn}><UiText style={styles.ghostBtnText}>{t("clear")}</UiText></UiPressable>
          </View>
          <View style={styles.fgrp}><UiText style={styles.lbl}>{t("periodLbl")}</UiText><View style={styles.fchips}>{PERIODS.map((p) => <FilterOption key={p} label={periodLabel(p, t)} selected={draft.period === p} onToggle={() => setDraft(({ from: _from, to: _to, ...d }) => ({ ...d, period: p }))} />)}<FilterOption label={draft.period === "custom" && draft.from ? `📅 ${customRange(draft)}` : `📅 ${t("pCustom")}`} selected={draft.period === "custom"} onToggle={() => { setSheet(false); setTimeout(() => setPickDay("from"), 350); }} /></View></View>
          <View style={styles.fgrp}><UiText style={styles.lbl}>{t("areaLbl")}</UiText><View style={styles.fchips}>{AREAS.map((a) => <FilterOption key={a} label={areaLabel(a, t)} selected={Boolean(draft.areas?.includes(a))} onToggle={() => setDraft((d) => ({ ...d, areas: toggleIn(d.areas, a) }))} />)}</View></View>
          <View style={styles.fgrp}><UiText style={styles.lbl}>{t("themeLbl")}</UiText><View style={styles.fchips}>{THEMES.slice(0, 5).map((x) => <FilterOption key={x} label={themeLabel(x, t)} selected={Boolean(draft.themes?.includes(x))} onToggle={() => setDraft((d) => ({ ...d, themes: toggleIn(d.themes, x) }))} />)}</View></View>
          <View style={styles.fgrp}><UiText style={styles.lbl}>{t("formatLbl")}</UiText><View style={styles.fchips}>{FORMATS.map((f) => <FilterOption key={f} label={t(f === "speakers" ? "fSpeakers" : f === "networking" ? "fNetworking" : "fSmall")} selected={Boolean(draft.formats?.includes(f))} onToggle={() => setDraft((d) => ({ ...d, formats: toggleIn(d.formats, f) }))} />)}</View></View>
          <View style={[styles.row, styles.toggleRow]}><UiText style={styles.toggleText}>{t("freeOnly")}</UiText><Toggle value={Boolean(draft.freeOnly)} onValueChange={(value: boolean) => setDraft((d) => ({ ...d, freeOnly: value }))} accessibilityLabel={t("freeOnly")} /></View>
          <View style={[styles.row, styles.toggleRow, { marginTop: 10 }]}><UiText style={styles.toggleText}>{t("planFirst")}</UiText><Toggle value={draft.planFirst !== false} onValueChange={(value: boolean) => setDraft((d) => ({ ...d, planFirst: value }))} accessibilityLabel={t("planFirst")} /></View>
          <UiPressable accessibilityRole="button" accessibilityLabel={t("showN", { n: draftCount ?? data?.total ?? 0 })} onPress={() => { setQuery(draft); setSheet(false); }} style={styles.showBtn}><UiText style={styles.btnPrimaryText}>{t("showN", { n: draftCount ?? data?.total ?? 0 })}</UiText></UiPressable>
        </View>
      </BottomSheet>
      {/* R31a (R27-04): the library's full-screen search page (kit b2 探す search) in the root portal, not an RN <Modal>. */}
      <FullScreenSearch overlay kind="events" visible={searching} testID="events-discover-search"
        value={search} onChangeText={setSearch} onSubmitEditing={() => remember(search)} showSoftInputOnFocus={!noKeyboard}
        placeholder={t("searchPlaceholder")} clearLabel={t("clear")} cancelLabel={t("cancel")} onCancel={() => { setSearching(false); setSearch(""); }}>
        {results?.events.length ? (
          <View style={[styles.card, styles.resultCard]}>
            <View style={[styles.cardH, styles.resultH]}><UiText style={styles.h3}>{t("searchEvents")}</UiText><UiText style={styles.more}>{t("countN", { n: results.eventsTotal })}</UiText></View>
            {results.events.map((hit, index) => (
              <UiPressable key={hit.eventId} accessibilityRole="button" accessibilityLabel={hit.title} onPress={() => { remember(search); setSearching(false); router.push(hit.href as Href); }} style={styles.li}>
                {index > 0 ? <View style={styles.liLine} /> : null}
                {datebox(hit.startsAt, true)}
                <View style={styles.meta}><Highlight text={hit.title} q={search} style={styles.metaTitle} mark={styles.mark} /><UiText style={styles.metaSub} numberOfLines={1}>{[hit.venue, hit.myStatus === "registered" ? t("stRegistered") : hit.badges?.includes("early_access") ? t("badgeEarly") : feeText(hit.priceYen, t)].filter(Boolean).join(" · ")}</UiText></View>
              </UiPressable>
            ))}
          </View>
        ) : null}
        {results?.organizers.length ? (
          <View style={[styles.card, styles.resultCard]}>
            <View style={[styles.cardH, styles.resultH]}><UiText style={styles.h3}>{t("searchOrganizers")}</UiText></View>
            {results.organizers.map((org, index) => (
              <View key={org.organizerId} style={styles.li}>
                {index > 0 ? <View style={styles.liLine} /> : null}
                <View style={[styles.emo, styles.emoSm, { backgroundColor: colors.macLav }]}><UiText style={styles.emoTextSm}>{org.emoji}</UiText></View>
                <View style={styles.meta}><Highlight text={org.name} q={search} style={styles.metaTitle} mark={styles.mark} /><UiText style={styles.metaSub} numberOfLines={1}>{[t("orgEditions", { n: org.eventCount }), org.following ? t("youFollow") : null].filter(Boolean).join(" · ")}</UiText></View>
                {org.following ? <View style={[styles.chip, { backgroundColor: colors.macTeal }]}><UiText style={[styles.chipText, { color: colors.macTealInk }]}>{t("following")}</UiText></View> : null}
              </View>
            ))}
          </View>
        ) : null}
        {results?.people.length ? (
          <View style={[styles.card, styles.resultCard]}>
            <View style={[styles.cardH, styles.resultH]}><UiText style={styles.h3}>{t("searchPeople")}</UiText></View>
            {results.people.map((person, index) => (
              <UiPressable key={person.contactId} accessibilityRole="button" accessibilityLabel={person.name} onPress={() => { setSearching(false); router.push(`/contacts/${encodeURIComponent(person.contactId)}` as Href); }} style={styles.li}>
                {index > 0 ? <View style={styles.liLine} /> : null}
                <View style={[styles.av, { backgroundColor: colors.macTeal }]}><UiText style={[styles.avText, { color: colors.macTealInk }]}>{person.initial}</UiText></View>
                <View style={styles.meta}><Highlight text={[person.name, person.org && person.role ? `${person.org} ${person.role}` : person.org ?? person.role].filter(Boolean).join(" · ")} q={search} style={styles.metaTitle} mark={styles.mark} /><UiText style={styles.metaSub} numberOfLines={1}>{t("personEvents", { n: person.eventCount })}</UiText></View>
                <Icon name="right" size={16} color={colors.ink} />
              </UiPressable>
            ))}
          </View>
        ) : null}
        {recent.length ? (
          <>
            <UiText style={[styles.lbl, { marginBottom: 6, marginTop: 0 }]}>{t("searchRecent")}</UiText>
            <View style={[styles.chips, { marginTop: 0 }]}>{recent.map((item) => <UiPressable key={item} accessibilityRole="button" accessibilityLabel={item} onPress={() => setSearch(item)} style={styles.chip}><View style={styles.caret}><View style={{ transform: [{ scale: 0.75 }] }}><Icon name="clock" size={16} color={colors.ink2} /></View></View><UiText style={styles.chipText}>{item}</UiText></UiPressable>)}</View>
          </>
        ) : null}
        <View style={[styles.card, styles.flat, { marginTop: 14 }]}>
          <View style={styles.row}>
            <View style={[styles.emo, styles.emoSm, { backgroundColor: colors.macBlue }]}><UiText style={styles.emoTextSm}>🔗</UiText></View>
            <View style={styles.meta}><UiText style={styles.widenTitle}>{t("searchNotFound")}</UiText><UiText style={styles.lbl}>{t("searchPasteUrl")}</UiText></View>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("paste")} onPress={() => { setSearching(false); router.push("/events/assess?mode=url" as Href); }} style={[styles.btnSm, { marginLeft: 0 }]}><UiText style={styles.btnSmText}>{t("paste")}</UiText></UiPressable>
          </View>
        </View>
      </FullScreenSearch>
      <EventSummarySheet row={selected?.row ?? null} tone={selected?.tone ?? colors.macTeal} onClose={closeSummary} />
    </ScrollView>
  );
}

/** 搜索命中词加底色（kit mark：左右各约 2px 内边距，RN 嵌套文字不能 padding，用窄空格撑开）。 */
function Highlight({ text, q, style, mark }: { text: string; q: string; style: object; mark: object }) {
  const needle = q.trim();
  const index = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (index < 0) return <UiText style={style} numberOfLines={1}>{text}</UiText>;
  return <UiText style={style} numberOfLines={1}>{text.slice(0, index)}<UiText style={[style, mark]}>{`\u2009${text.slice(index, index + needle.length)}\u2009`}</UiText>{text.slice(index + needle.length)}</UiText>;
}

// kit（b2 #8）：.search 44 r999 13.5 · .rbtn 40 + .badge 17 · .chip 3/9 11 700 · .card r24 · .li 11 0 + datebox 44 r13 · .ev-card 260 r22 16 · .dots。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  scroll: { paddingHorizontal: SHELL_GUTTER, paddingBottom: 130 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  searchRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  search: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, flex: 1, flexDirection: "row", gap: 8, height: 44, paddingHorizontal: 16 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 16, padding: 0 },
  rbtn: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  badge: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 9, height: 17, justifyContent: "center", minWidth: 17, paddingHorizontal: 4, position: "absolute", right: -2, top: -2 },
  badgeText: { color: colors.bg, fontSize: 12, fontWeight: "800", lineHeight: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  loadingBones: { marginTop: 14 },
  chip: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 4, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: colors.ink2, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  caret: { alignItems: "center", height: 12, justifyContent: "center", width: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  comm: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 14 },
  cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  h3: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 25 },
  more: { color: colors.ink3, fontSize: 14, fontWeight: "600", lineHeight: 21 },
  li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
  datebox: { backgroundColor: colors.surface2, borderRadius: 13, paddingVertical: 5, width: 44 },
  dateDay: { color: colors.ink, fontSize: 19, fontWeight: "800", lineHeight: 21, textAlign: "center" },
  dateMonth: { color: colors.ink3, fontSize: 12, fontWeight: "700", lineHeight: 16, textAlign: "center" },
  meta: { flex: 1, minWidth: 0 },
  rowChips: { marginTop: 6 },
  metaTitle: { color: colors.ink, fontSize: 17, fontWeight: "700", lineHeight: 25 },
  metaSub: { color: colors.ink3, fontSize: 14, lineHeight: 21 },
  section: { marginTop: 18 },
  ecList: { gap: 12 },
  // 示例在卡片里：不再画第二层卡面（根因 B 卡中卡）。
  ecSample: { backgroundColor: "transparent", opacity: 0.5, padding: 0 },
  ecRow: { backgroundColor: colors.surface, borderRadius: 20, flexDirection: "row", gap: 12, minHeight: 112, padding: 12 },
  ecThumb: { borderRadius: 14, height: 88, width: 88 },
  // 面板开着时被选中的卡：kit .sel = 0 0 0 2px ink（外圈，不占位）。
  ecSel: { borderColor: colors.ink, borderRadius: 22, borderWidth: 2, bottom: -2, left: -2, position: "absolute", right: -2, top: -2 },
  // kit .cb .endtag：左上 6 · 高 20 · 左右 7 · 10.5/700 白字 · 深色 62%。叠在照片上，深浅主题同一个：取浅色主题的 ink / onAccent。
  endTag: { alignItems: "center", borderRadius: 999, height: 20, justifyContent: "center", left: 6, overflow: "hidden", paddingHorizontal: 7, position: "absolute", top: 6 },
  endTagBg: { bottom: 0, left: 0, position: "absolute", right: 0, top: 0, backgroundColor: photoColors.ink, opacity: 0.62 },
  endTagText: { color: photoColors.onAccent, fontSize: 10.5, fontWeight: "700", lineHeight: 15.75 },
  // kit .lh：上 18 下 10 左右 2 · 15/800 · 右「最近的在前」11.5/500 ink3。
  lh: { alignItems: "baseline", flexDirection: "row", justifyContent: "space-between", marginBottom: 10, marginHorizontal: 2, marginTop: 18 },
  lhTitle: { color: colors.ink, fontSize: 15, fontWeight: "800", lineHeight: 22.5 },
  lhLbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  ecThumbEmoji: { alignItems: "center", justifyContent: "center" },
  ecEmoji: { fontSize: 34, lineHeight: 42 },
  ecText: { flex: 1, minWidth: 0 },
  ecTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 19.6 },
  ecMeta: { color: colors.ink3, fontSize: 12, lineHeight: 17, marginTop: 2 },
  ecFoot: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: "auto", minWidth: 0, paddingTop: 6 },
  ecChips: { flex: 1, minWidth: 0, overflow: "hidden" },
  ecChipRow: { flexWrap: "nowrap" },
  ecReg: { color: colors.ink3, flexShrink: 0, fontSize: 12 },
  ecFee: { color: colors.ink, flexShrink: 0, fontSize: 13, fontWeight: "800" },
  // 有图的一排：卡片不留内边距，图满宽贴上沿（圆角跟卡片），正文 14 / 16 / 16。
  // 毛玻璃 chip：rgba(255,255,255,.78)，深浅模式同一个（叠在照片上）。
  emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoText: { fontSize: 23, lineHeight: 28 },
  lbl: { color: colors.ink3, fontSize: 13, fontWeight: "500", lineHeight: 20 },
  btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 32, justifyContent: "center", marginLeft: "auto", paddingHorizontal: 12 },
  btnSmText: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  noMatch: { alignItems: "center", gap: 12, marginTop: 14, paddingVertical: 28 },
  noMatchTitle: { color: colors.ink2, fontSize: 15, fontWeight: "600", lineHeight: 22, textAlign: "center" },
  noMatchBtn: { marginLeft: 0 },
  all: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 8 },
  sheet: { paddingBottom: 0 },
  sheetTitle: { color: colors.ink, fontSize: 18, fontWeight: "700", lineHeight: 27 },
  fgrp: { gap: 8, marginTop: 12 },
  fchips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  toggleRow: { justifyContent: "space-between", marginTop: 6 },
  toggleText: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  showBtn: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, height: 48, justifyContent: "center", marginTop: 16 },
  ghostBtn: { alignItems: "center", borderRadius: radius.pill, height: 32, justifyContent: "center", paddingHorizontal: 12 },
  ghostBtnText: { color: colors.ink2, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  btnPrimaryText: { color: colors.bg, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  btnBlock46: { alignItems: "center", backgroundColor: colors.ink, borderRadius: radius.pill, flexDirection: "row", gap: 6, height: 46, justifyContent: "center" },
  guide: { marginTop: 14, overflow: "hidden", padding: 20 },
  // 引导卡右上角关闭（同 Web .pGuideClose）；关掉后留一个小入口。
  guideClose: { alignItems: "center", height: 32, justifyContent: "center", position: "absolute", right: 10, top: 10, width: 32, zIndex: 1 },
  guideGlow: { height: 220, opacity: 0.9, position: "absolute", right: -80, top: -90, width: 220 },
  guideTitle: { color: colors.ink, fontSize: 21, fontWeight: "800", lineHeight: 29, marginVertical: 4 },
  guideSub: { color: colors.ink2, fontSize: 15, lineHeight: 23, marginBottom: 14 },
  grid3: { flexDirection: "row", gap: 10, marginTop: 14 },
  tile: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.xl, flex: 1, gap: 7, paddingHorizontal: 6, paddingVertical: 14 },
  tileText: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 20 },
  sampleTag: { backgroundColor: colors.macApricot, borderRadius: radius.tag, paddingHorizontal: 6, paddingVertical: 1 },
  sampleText: { color: colors.macApricotInk, fontSize: 12, fontWeight: "800", lineHeight: 18 },
  ghostRow: { alignItems: "center", borderColor: colors.surface3, borderRadius: 14, borderStyle: "dashed", borderWidth: 1.5, flexDirection: "row", gap: 10, height: 46, paddingHorizontal: 14 },
  ghostDot: { backgroundColor: colors.surface2, borderRadius: radius.pill, height: 26, width: 26 },
  ghostText: { color: colors.ink4, fontSize: 14, lineHeight: 21 },
  flat: { backgroundColor: colors.surface2 },
  emoSm: { borderRadius: 10, height: 32, width: 32 },
  emoTextSm: { fontSize: 19, lineHeight: 25 },
  widenTitle: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 22 },
  widenRow: { alignItems: "center", backgroundColor: colors.surface, borderRadius: 14, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 10 },
  widenText: { color: colors.ink, fontSize: 15, fontWeight: "700", lineHeight: 23 },
  macNote: { backgroundColor: colors.macLav, borderRadius: 16, marginTop: 14, padding: 12 },
  macNoteText: { color: colors.ink, fontSize: 14, lineHeight: 21 },
  // kit：聚焦时 0 0 0 2px plum-300 外圈（框本身 44，外圈让可见高度 48）。
  resultCard: { marginBottom: 14, paddingHorizontal: 16, paddingVertical: 8 },
  resultH: { marginBottom: 0, marginTop: 8 },
  mark: { backgroundColor: colors.macLav },
  av: { alignItems: "center", borderRadius: radius.pill, height: 38, justifyContent: "center", width: 38 },
  avText: { fontSize: 16, fontWeight: "800", lineHeight: 20 },
}));
