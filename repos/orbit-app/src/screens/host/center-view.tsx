// R17 運営センター（App）的画面本体与共用件（无数据加载、无路由，渲染测试直接用）：空 / 少 / 大、8 文字のコード格子。
import { StyleSheet, View } from "react-native";

import type { HostCenterFilter, HostCenterEventRow, HostCenterResponse } from "../../api/contract/host-events";
import { Segmented, UiPressable, UiText } from "../../components/ui";
import Svg, { Defs, RadialGradient, Rect, Stop } from "../../components/ui/svg";
import { createThemedStyles } from "../../design/theme";
import { radius } from "../../design/tokens";
import { type HostT } from "./host-model";
import { Btn, HostEventCard, PcCard, useHostStyles } from "./host-ui";
/** b6 #21 的示例行（空态「作成するとこう並びます」，淡化、不可点）。 */
export const SAMPLE_ROW: HostCenterEventRow = { action: "open_check_in", applied: 128, capacity: 150, checkedIn: 86, emoji: "🥂", endsAt: "2026-10-07T12:30:00.000Z", eventId: "sample-cfo-night-18", matched: 112, note: { count: 42, kind: "check_in_open" }, role: "owner", startsAt: "2026-10-07T10:00:00.000Z", status: "live", title: "CFO Night Tokyo vol.18", venue: null };

export type CenterSheet = null | "code" | "template";
export const TEMPLATES = [
  { emoji: "🥂", id: "mixer", sub: "appTplMixerSub", title: "tplMixer", tone: "lav" },
  { emoji: "📚", id: "study", sub: "appTplStudySub", title: "tplStudy", tone: "blue" },
  { emoji: "🪑", id: "roundtable", sub: "appTplRoundSub", title: "tplRound", tone: "pink" },
] as const;

export interface HostCenterViewProps {
  data: HostCenterResponse;
  filter: HostCenterFilter;
  t: HostT;
  language: string;
  onFilter: (filter: HostCenterFilter) => void;
  onCreate: () => void;
  onSendPc: () => void;
  onTemplate: () => void;
  onJoin: () => void;
  onCheckInOnly: () => void;
  onOpenRow: (row: HostCenterEventRow) => void;
  onRowAction: (row: HostCenterEventRow) => void;
}

/** 画面本体（无数据加载，渲染测试直接用）。空 = 没有任何活动；少 = 只有一场（不出筛选）；大 = 筛选 + 卡片。 */
export function HostCenterBody(props: HostCenterViewProps) {
  const { data, filter, t, language } = props;
  const { styles, colors } = useCenterStyles();
  const h = useHostStyles().styles;
  const empty = data.summary.eventCount === 0;
  if (empty) {
    return (
      <View testID="host-center-empty">
        <View style={styles.guide}>
          <Svg width={220} height={220} style={styles.guideGlow} pointerEvents="none">
            <Defs><RadialGradient id="hostGuideGlow" cx="50%" cy="50%" r="50%"><Stop offset={0} stopColor={colors.macLav} /><Stop offset={0.7} stopColor={colors.macLav} stopOpacity={0} /></RadialGradient></Defs>
            <Rect x={0} y={0} width={220} height={220} fill="url(#hostGuideGlow)" opacity={0.9} />
          </Svg>
          <UiText style={styles.guideTitle}>{t("appEmptyTitle")}</UiText>
          <UiText style={[h.sub, styles.guideSub]}>{t("appEmptySub")}</UiText>
          <Btn label={t("createEvent")} variant="primary" icon="plus" height={46} onPress={props.onCreate} testID="host-center-create" />
          <Btn label={t("appSendPc")} variant="ghost" onPress={props.onSendPc} style={styles.ghostGap} testID="host-center-send-pc" />
        </View>
        <View style={styles.tiles}>
          {([["📋", "appTileTemplate", "apricot", props.onTemplate], ["🎟️", "joinCohost", "teal", props.onJoin], ["📷", "appTileCheckIn", "blue", props.onCheckInOnly]] as const).map(([emoji, key, tone, onPress]) => (
            <UiPressable key={key} accessibilityRole="button" accessibilityLabel={t(key)} onPress={onPress} style={[styles.tile, styles[tone]]}>
              <UiText style={styles.tileEmoji}>{emoji}</UiText>
              <UiText style={styles.tileLabel}>{t(key)}</UiText>
            </UiPressable>
          ))}
        </View>
        <View style={[h.card, styles.previewCard]}>
          <View style={h.cardH}>
            <View style={styles.titleRow}><UiText style={h.h3}>{t("previewTitle")}</UiText><View style={h.sampleTag}><UiText style={h.sampleTagText}>{t("appSample")}</UiText></View></View>
          </View>
          <View style={styles.fadedWrap}><HostEventCard row={{ ...SAMPLE_ROW, venue: t("appSampleVenue") }} t={t} language={language} faded /></View>
        </View>
      </View>
    );
  }
  const inactive = data.filterCounts?.inactive ?? 0;
  const few = data.summary.eventCount === 1 && filter === "all" && data.events.length === 1;
  const segs: { key: HostCenterFilter; label: string }[] = [{ key: "all", label: t("fAll") }, { key: "upcoming", label: t("fUpcoming") }, { key: "live", label: t("fLive") }, { key: "ended", label: t("fEnded") }];
  return (
    <View testID={few ? "host-center-few" : "host-center-many"}>
      {few ? null : <Segmented segments={segs} value={filter === "inactive" ? "all" : filter} onChange={props.onFilter} accessibilityLabel={t("searchLabel")} />}
      <View style={[styles.list, few ? styles.listFew : null]}>
        {data.events.map((row) => <HostEventCard key={row.eventId} row={row} t={t} language={language} onOpen={() => props.onOpenRow(row)} onAction={() => props.onRowAction(row)} />)}
        {data.events.length === 0 ? <UiText style={[h.lbl, styles.none]}>{t("noResults")}</UiText> : null}
      </View>
      {/* Drafts / cancelled / archived are not in 全部; without this row a draft made on the computer was unreachable here. */}
      {inactive > 0 ? (
        <UiPressable accessibilityRole="button" accessibilityState={{ selected: filter === "inactive" }} onPress={() => props.onFilter(filter === "inactive" ? "all" : "inactive")} style={styles.inactiveRow} testID="host-center-inactive">
          <UiText style={[h.lbl, filter === "inactive" ? { color: colors.ink, fontWeight: "700" } : null]}>{`${t("fInactive")} · ${inactive}`}</UiText>
        </UiPressable>
      ) : null}
      {few ? <PcCard text={t("appPcCreate")} style={styles.pcGap} /> : null}
    </View>
  );
}

/** 8 文字のコード（XXXX-XXXX，b12 #418）。 */
export function CodeBoxes({ value }: { value: string }) {
  const { styles } = useCenterStyles();
  const chars = value.replace(/[^0-9A-Za-z]/g, "").toUpperCase().padEnd(8, " ").slice(0, 8).split("");
  return (
    <View style={styles.codeRow} pointerEvents="none">
      {chars.map((char, index) => (
        <View key={index} style={styles.codeCellWrap}>
          {index === 4 ? <UiText style={styles.codeDash}>-</UiText> : null}
          <View style={styles.codeCell}><UiText style={styles.codeChar}>{char.trim()}</UiText></View>
        </View>
      ))}
    </View>
  );
}

export function normalizeCode(text: string): string {
  const raw = text.replace(/[^0-9A-Za-z]/g, "").toUpperCase().slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}
// kit（b6 #21）：.guide r24 p20 + 右上 220 的 lav 光晕 · 标题 19/800 lh1.4 · .sub mt6 mb14 · .grid3 gap12 mt14 · .mac r16 p12 · 卡 mt14。
export const useCenterStyles = createThemedStyles((colors) => StyleSheet.create({
  guide: { backgroundColor: colors.surface, borderRadius: radius.xl, overflow: "hidden", padding: 20 },
  guideGlow: { position: "absolute", right: -80, top: -90 },
  guideTitle: { color: colors.ink, fontSize: 21, fontWeight: "800", lineHeight: 29 },
  guideSub: { marginBottom: 14, marginTop: 6 },
  ghostGap: { marginTop: 6 },
  tiles: { flexDirection: "row", gap: 12, marginTop: 14 },
  tile: { alignItems: "center", borderRadius: 16, flex: 1, padding: 12 },
  apricot: { backgroundColor: colors.macApricot },
  teal: { backgroundColor: colors.macTeal },
  blue: { backgroundColor: colors.macBlue },
  tileEmoji: { fontSize: 24, lineHeight: 36 },
  tileLabel: { color: colors.ink, fontSize: 13, fontWeight: "700", lineHeight: 20, marginTop: 4 },
  previewCard: { marginTop: 14 },
  titleRow: { alignItems: "center", flexDirection: "row", gap: 4 },
  fadedWrap: { opacity: 1 },
  list: { gap: 12, marginTop: 14 },
  listFew: { marginTop: 4 },
  none: { paddingVertical: 24, textAlign: "center" },
  inactiveRow: { alignItems: "center", minHeight: 44, justifyContent: "center", marginTop: 8 },
  pcGap: { marginTop: 12 },
  sheetTitle: { color: colors.ink, fontSize: 19, fontWeight: "700", lineHeight: 29 },
  codeRow: { flexDirection: "row", gap: 6, justifyContent: "center", marginTop: 14 },
  codeCellWrap: { alignItems: "center", flexDirection: "row", gap: 6 },
  codeCell: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: 10, height: 44, justifyContent: "center", width: 32 },
  codeChar: { color: colors.ink, fontSize: 20, fontWeight: "800", lineHeight: 24 },
  codeDash: { color: colors.ink4, fontWeight: "800" },
  hiddenInput: { height: 1, opacity: 0, position: "absolute", width: 1 },
  joinBtn: { marginTop: 16 },
  tplSub: { marginBottom: 12, marginTop: 4 },
  tplRow: { gap: 12, paddingVertical: 10 },
  center: { textAlign: "center" },
}));
