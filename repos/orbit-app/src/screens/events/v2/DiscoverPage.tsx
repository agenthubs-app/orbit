// R27 イベント › 探す（App；b2 #8 大量）：搜索 + 筛选按钮（件数）· 已选 chip（今月 ✕ / 東京 ✕ / テーマ ▾ / 参加費 ▾）·
// 📌 あなたのコミュニティ · プランに効くイベント（横滑卡 + 页点）· すべて（日付順）。数据：GET /api/events/discover（规则，不调 AI）。
import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";

import type { EventDiscoverQuery, EventDiscoverResponse, EventDiscoverRow } from "../../../api/contract/event-discover";
import { SHELL_GUTTER } from "../../../components/ShellTopBar";
import { BottomSheet, FilterOption, Icon, UiPressable, UiText } from "../../../components/ui";
import { createThemedStyles } from "../../../design/theme";
import { radius } from "../../../design/tokens";
import { useJourneyApi } from "./journey-api";
import { AREAS, PERIODS, THEMES, areaLabel, discoverWhen, feeText, periodLabel, rowTone, themeLabel, tokyo, type JourneyTone } from "./journey-model";
import { ringColor } from "./events-model";
import { ScoreRing } from "./ScoreRing";
import { useJourneyT } from "./useJourneyT";

export const APP_DISCOVER_QUERY: EventDiscoverQuery = { areas: ["tokyo"], period: "this_month", planFirst: true, sort: "date", themes: [] };
const CARD = 260;

export function DiscoverPage({ onSubtitle }: { onSubtitle?: (text: string) => void }) {
  const { styles, colors } = useStyles();
  const { t, language } = useJourneyT();
  const router = useRouter();
  const api = useJourneyApi();
  const [query, setQuery] = useState<EventDiscoverQuery>(APP_DISCOVER_QUERY);
  const [data, setData] = useState<EventDiscoverResponse | null>(null);
  const [search, setSearch] = useState("");
  const [sheet, setSheet] = useState(false);
  const [page, setPage] = useState(0);
  const [whyOpen, setWhyOpen] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void api.discover(query).then((result) => { if (live) setData(result.ok ? result.data : { all: [], community: [], planFit: [], planFitTotal: 0, popularityFallback: true, total: 0 }); });
    return () => { live = false; };
  }, [api, query]);
  useEffect(() => {
    if (!data || !onSubtitle) return;
    onSubtitle(data.popularityFallback ? t("dSubtitleEmpty") : t("dSubtitleMany", { n: data.planFitTotal, period: query.period ? periodLabel(query.period, t) : "", total: data.total }));
  }, [data, onSubtitle, query.period, t]);

  const open = useCallback((row: EventDiscoverRow) => router.push(row.href as Href), [router]);
  const patch = (next: Partial<EventDiscoverQuery>) => setQuery((current) => ({ ...current, ...next }));
  const clear = (key: keyof EventDiscoverQuery) => setQuery((current) => { const next = { ...current }; delete next[key]; return next; });
  const count = (query.period ? 1 : 0) + (query.areas?.length ?? 0) + (query.themes?.length ?? 0) + (query.freeOnly ? 1 : 0);
  const rows = useMemo(() => (data ? (query.sort === "recommended" ? data.all : [...data.all].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))) : []), [data, query.sort]);
  const toneBg = (tone: JourneyTone) => (tone === "teal" ? colors.macTeal : tone === "lav" ? colors.macLav : tone === "blue" ? colors.macBlue : tone === "apricot" ? colors.macApricot : colors.macPink);
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => setPage(Math.max(0, Math.round((event.nativeEvent.contentOffset.x - SHELL_GUTTER) / (CARD + 12))));

  const datebox = (iso: string) => { const p = tokyo(iso); return <View style={styles.datebox}><UiText style={styles.dateDay}>{p?.day ?? ""}</UiText><UiText style={styles.dateMonth}>{p ? t("monthLabel", { m: p.month }) : ""}</UiText></View>; };
  const chip = (label: string, onPress: () => void, on: boolean, key: string, caret = false) => (
    <UiPressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.chip, on ? { backgroundColor: colors.macLav } : null]}>
      <UiText style={[styles.chipText, on ? { color: colors.macLavInk } : null]}>{on ? `${label} ✕` : label}</UiText>
      {caret ? <View style={styles.caret}><View style={{ transform: [{ scale: 0.75 }] }}><Icon name="down" size={16} color={colors.ink2} /></View></View> : null}
    </UiPressable>
  );

  return (
    <ScrollView contentContainerStyle={styles.scroll} testID="events-discover">
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Icon name="search" size={16} color={colors.ink3Text} />
          <TextInput value={search} onChangeText={setSearch} placeholder={t("searchPlaceholder")} placeholderTextColor={colors.ink3Text} accessibilityLabel={t("searchPlaceholder")} returnKeyType="search" style={styles.searchInput} />
        </View>
        <UiPressable accessibilityRole="button" accessibilityLabel={t("filtersLbl")} onPress={() => setSheet(true)} style={styles.rbtn} testID="events-discover-filter">
          <Icon name="sliders" size={20} color={colors.ink2} />
          {count ? <View style={styles.badge}><UiText style={styles.badgeText}>{count}</UiText></View> : null}
        </UiPressable>
      </View>
      <View style={styles.chips}>
        {query.period ? chip(periodLabel(query.period, t), () => clear("period"), true, "period") : null}
        {(query.areas ?? []).map((a) => chip(areaLabel(a, t), () => patch({ areas: (query.areas ?? []).filter((x) => x !== a) }), true, `a-${a}`))}
        {(query.themes ?? []).map((x) => chip(themeLabel(x, t), () => patch({ themes: (query.themes ?? []).filter((v) => v !== x) }), true, `t-${x}`))}
        {query.freeOnly ? chip(t("freeOnly"), () => clear("freeOnly"), true, "free") : null}
        {query.themes?.length ? null : chip(t("filterTheme"), () => setSheet(true), false, "theme", true)}
        {query.freeOnly ? null : chip(t("feeLbl"), () => setSheet(true), false, "fee", true)}
      </View>

      {data && data.community.length ? (
        <View style={[styles.card, styles.comm]} testID="events-discover-community">
          <View style={[styles.cardH, { marginBottom: 4 }]}><UiText style={styles.h3}>{t("communityTitle")}</UiText><UiText style={styles.more}>{t("countN", { n: data.community.length })}</UiText></View>
          {data.community.map((row, index) => {
            const badge = row.badges?.includes("members_only") ? "members_only" : row.badges?.includes("early_access") ? "early_access" : null;
            return (
              <UiPressable key={row.eventId} accessibilityRole="button" accessibilityLabel={row.title} onPress={() => open(row)} style={styles.li}>
                {index > 0 ? <View style={styles.liLine} /> : null}
                {datebox(row.startsAt)}
                <View style={styles.meta}><UiText style={styles.metaTitle} numberOfLines={1}>{row.title}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[row.venue, row.communityReason === "following" ? t("following") : t("attended")].filter(Boolean).join(" · ")}</UiText></View>
                {badge ? <View style={[styles.chip, { backgroundColor: badge === "members_only" ? colors.macLav : colors.macTeal }]}><UiText style={[styles.chipText, { color: badge === "members_only" ? colors.macLavInk : colors.macTealInk }]}>{badge === "members_only" ? t("badgeMembers") : t("badgeEarly")}</UiText></View> : null}
              </UiPressable>
            );
          })}
        </View>
      ) : null}

      {data && data.planFit.length ? (
        <View style={styles.section} testID="events-discover-planfit">
          <View style={styles.cardH}><UiText style={styles.h3}>{t("planFitTitle")}</UiText><UiText style={styles.more}>{t("countN", { n: data.planFitTotal })}</UiText></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToOffsets={data.planFit.map((_row, index) => SHELL_GUTTER + index * (CARD + 12))} contentOffset={{ x: SHELL_GUTTER, y: 0 }} decelerationRate="fast" onScroll={onScroll} scrollEventThrottle={32} style={styles.carousel} contentContainerStyle={styles.carouselInner}>
            {data.planFit.map((row, index) => {
              const tone = rowTone(row, index);
              return (
                <UiPressable key={row.eventId} accessibilityRole="button" accessibilityLabel={row.title} onPress={() => open(row)} style={styles.evCard}>
                  <View style={[styles.row, { justifyContent: "space-between" }]}>
                    <View style={[styles.emo, { backgroundColor: toneBg(tone.emo) }]}><UiText style={styles.emoText}>{row.emoji}</UiText></View>
                    {typeof row.score === "number" ? <ScoreRing size={46} stroke={5} value={row.score} color={colors[ringColor(row.score)]} label={String(row.score)} fontSize={13} /> : null}
                  </View>
                  <UiText style={styles.evTitle}>{row.title}</UiText>
                  <UiText style={[styles.lbl, { marginTop: 3 }]}>{[discoverWhen(row.startsAt, language), row.venue].filter(Boolean).join(" · ")}</UiText>
                  {row.reason ? (
                    <View style={{ marginTop: 10 }}>
                      <View style={[styles.row, { gap: 6 }]}>
                        <View style={[styles.chip, styles.reasonChip, { backgroundColor: colors.macLav }]}><UiText style={[styles.chipText, { color: colors.macLavInk }]} numberOfLines={1}>{`🎯 ${row.reason}`}</UiText></View>
                        {row.reasonDetail ? <UiPressable accessibilityRole="button" accessibilityLabel={t("why")} onPress={() => setWhyOpen(whyOpen === row.eventId ? null : row.eventId)} style={styles.why}><UiText style={styles.whyText}>?</UiText></UiPressable> : null}
                      </View>
                      {whyOpen === row.eventId && row.reasonDetail ? <View style={styles.whyBody}><UiText style={styles.whyBodyText}>{row.reasonDetail}</UiText></View> : null}
                    </View>
                  ) : null}
                  <View style={[styles.row, styles.cardFoot]}>
                    {feeText(row.priceYen, t) ? <View style={styles.chip}><UiText style={styles.chipText}>{feeText(row.priceYen, t)}</UiText></View> : null}
                    <UiPressable accessibilityRole="button" accessibilityLabel={t("detailsBtn")} onPress={() => open(row)} style={styles.btnSm}><UiText style={styles.btnSmText}>{t("detailsBtn")}</UiText></UiPressable>
                  </View>
                </UiPressable>
              );
            })}
          </ScrollView>
          <View style={styles.dots}>{data.planFit.map((row, index) => <View key={row.eventId} style={[styles.dot, index === Math.min(page, data.planFit.length - 1) ? styles.dotOn : null]} />)}</View>
        </View>
      ) : null}

      {rows.length ? (
        <View style={[styles.card, styles.all]} testID="events-discover-all">
          <View style={[styles.cardH, { marginBottom: 0, marginTop: 8 }]}>
            <UiText style={styles.h3}>{t("allPlain")}</UiText>
            <UiPressable accessibilityRole="button" accessibilityLabel={t("byDate")} onPress={() => patch({ sort: query.sort === "recommended" ? "date" : "recommended" })} style={[styles.row, { gap: 2 }]}>
              <UiText style={styles.more}>{query.sort === "recommended" ? t("sortRecommended").split("：").pop() : t("byDate")}</UiText><Icon name="down" size={16} color={colors.ink3} />
            </UiPressable>
          </View>
          {rows.map((row, index) => (
            <UiPressable key={row.eventId} accessibilityRole="button" accessibilityLabel={row.title} onPress={() => open(row)} style={styles.li}>
              {index > 0 ? <View style={styles.liLine} /> : null}
              {datebox(row.startsAt)}
              <View style={styles.meta}><UiText style={styles.metaTitle} numberOfLines={1}>{row.title}</UiText><UiText style={styles.metaSub} numberOfLines={1}>{[row.venue, feeText(row.priceYen, t)].filter(Boolean).join(" · ")}</UiText></View>
              {typeof row.score === "number" ? <ScoreRing size={36} stroke={4} value={row.score} color={colors[ringColor(row.score)]} label={String(row.score)} fontSize={11} /> : null}
            </UiPressable>
          ))}
        </View>
      ) : null}

      <BottomSheet visible={sheet} onClose={() => setSheet(false)} accessibilityLabel={t("filtersLbl")}>
        <View style={styles.sheet}>
          <UiText style={styles.sheetLbl}>{t("periodLbl")}</UiText>
          <View style={styles.chips}>{PERIODS.map((p) => <FilterOption key={p} label={periodLabel(p, t)} selected={query.period === p} onToggle={() => patch({ period: p })} />)}</View>
          <UiText style={styles.sheetLbl}>{t("areaLbl")}</UiText>
          <View style={styles.chips}>{AREAS.map((a) => <FilterOption key={a} label={areaLabel(a, t)} selected={Boolean(query.areas?.includes(a))} onToggle={() => patch({ areas: query.areas?.includes(a) ? query.areas.filter((x) => x !== a) : [...(query.areas ?? []), a] })} />)}</View>
          <UiText style={styles.sheetLbl}>{t("themeLbl")}</UiText>
          <View style={styles.chips}>{THEMES.map((x) => <FilterOption key={x} label={themeLabel(x, t)} selected={Boolean(query.themes?.includes(x))} onToggle={() => patch({ themes: query.themes?.includes(x) ? query.themes.filter((v) => v !== x) : [...(query.themes ?? []), x] })} />)}</View>
          <UiText style={styles.sheetLbl}>{t("feeLbl")}</UiText>
          <View style={styles.chips}><FilterOption label={t("feeAny")} selected={!query.freeOnly} onToggle={() => patch({ freeOnly: false })} /><FilterOption label={t("freeOnly")} selected={Boolean(query.freeOnly)} onToggle={() => patch({ freeOnly: true })} /></View>
        </View>
      </BottomSheet>
    </ScrollView>
  );
}

// kit（b2 #8）：.search 44 r999 13.5 · .rbtn 40 + .badge 17 · .chip 3/9 11 700 · .card r24 · .li 11 0 + datebox 44 r13 · .ev-card 260 r22 16 · .dots。
const useStyles = createThemedStyles((colors) => StyleSheet.create({
  scroll: { paddingHorizontal: SHELL_GUTTER, paddingBottom: 130 },
  row: { alignItems: "center", flexDirection: "row", gap: 10 },
  searchRow: { alignItems: "center", flexDirection: "row", gap: 8 },
  search: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, flex: 1, flexDirection: "row", gap: 8, height: 44, paddingHorizontal: 16 },
  searchInput: { color: colors.ink, flex: 1, fontSize: 13.5, padding: 0 },
  rbtn: { alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.pill, height: 40, justifyContent: "center", width: 40 },
  badge: { alignItems: "center", backgroundColor: colors.ink, borderRadius: 9, height: 17, justifyContent: "center", minWidth: 17, paddingHorizontal: 4, position: "absolute", right: -2, top: -2 },
  badgeText: { color: colors.bg, fontSize: 10, fontWeight: "800", lineHeight: 12 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { alignItems: "center", alignSelf: "flex-start", backgroundColor: colors.surface2, borderRadius: radius.pill, flexDirection: "row", gap: 4, paddingHorizontal: 9, paddingVertical: 3 },
  chipText: { color: colors.ink2, fontSize: 11, fontWeight: "700", lineHeight: 16.5 },
  caret: { alignItems: "center", height: 12, justifyContent: "center", width: 12 },
  card: { backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18 },
  comm: { marginTop: 14, paddingHorizontal: 16, paddingVertical: 14 },
  cardH: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 12 },
  h3: { color: colors.ink, fontSize: 14.5, fontWeight: "800", lineHeight: 21.75 },
  more: { color: colors.ink3, fontSize: 12, fontWeight: "600", lineHeight: 18 },
  li: { alignItems: "center", flexDirection: "row", gap: 12, paddingVertical: 11 },
  liLine: { backgroundColor: colors.line, height: 1, left: 50, position: "absolute", right: 0, top: 0 },
  datebox: { backgroundColor: colors.surface2, borderRadius: 13, paddingVertical: 5, width: 44 },
  dateDay: { color: colors.ink, fontSize: 17, fontWeight: "800", lineHeight: 18.7, textAlign: "center" },
  dateMonth: { color: colors.ink3, fontSize: 10, fontWeight: "700", lineHeight: 13.2, textAlign: "center" },
  meta: { flex: 1, minWidth: 0 },
  metaTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 21 },
  metaSub: { color: colors.ink3, fontSize: 12, lineHeight: 18 },
  section: { marginTop: 18 },
  carousel: { marginHorizontal: -SHELL_GUTTER },
  carouselInner: { gap: 12, paddingBottom: 4, paddingHorizontal: SHELL_GUTTER, paddingTop: 2 },
  evCard: { backgroundColor: colors.surface, borderRadius: 22, padding: 16, width: CARD },
  emo: { alignItems: "center", borderRadius: 13, height: 40, justifyContent: "center", width: 40 },
  emoText: { fontSize: 21, lineHeight: 26 },
  evTitle: { color: colors.ink, fontSize: 14, fontWeight: "700", lineHeight: 18.9, marginTop: 12 },
  lbl: { color: colors.ink3, fontSize: 11.5, fontWeight: "500", lineHeight: 17.25 },
  reasonChip: { flex: 1 },
  why: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 18, justifyContent: "center", width: 18 },
  whyText: { color: colors.ink3, fontSize: 10.5, fontWeight: "800", lineHeight: 13 },
  whyBody: { backgroundColor: colors.surface2, borderRadius: 14, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10 },
  whyBodyText: { color: colors.ink2, fontSize: 12, lineHeight: 19.8 },
  cardFoot: { gap: 6, marginTop: "auto", paddingTop: 10 },
  btnSm: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.pill, height: 32, justifyContent: "center", marginLeft: "auto", paddingHorizontal: 12 },
  btnSmText: { color: colors.ink, fontSize: 12, fontWeight: "700", lineHeight: 18 },
  dots: { flexDirection: "row", gap: 5, justifyContent: "center", marginTop: 10 },
  dot: { backgroundColor: colors.ink4, borderRadius: 3, height: 6, width: 6 },
  dotOn: { backgroundColor: colors.ink2, width: 18 },
  all: { marginTop: 16, paddingHorizontal: 16, paddingVertical: 8 },
  sheet: { gap: 10, paddingBottom: 8 },
  sheetLbl: { color: colors.ink, fontSize: 13, fontWeight: "800", lineHeight: 19.5 },
}));
