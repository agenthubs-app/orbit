import { Pressable, StyleSheet, Text, View } from "react-native";

import { DataCard } from "../../components/DataCard";
import { ErrorState } from "../../components/ErrorState";
import { radius, spacing, typography, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import type { EventAnalyticsKind, EventAnalyticsMetricView, EventAnalyticsView } from "../../view-models/event-analytics";

export type EventAnalyticsContentState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "failure"; message: string };

function MetricGrid({ metrics }: { metrics: EventAnalyticsMetricView[] }) {
  const { styles } = useStyles();
  return <View style={styles.metrics}>{metrics.map((metric) => <View key={metric.label} style={styles.metric}><Text style={styles.metricValue}>{metric.value}</Text><Text style={styles.metricLabel}>{metric.label}</Text></View>)}</View>;
}

export function EventAnalyticsContent({ activeKind, attendeeAvailable, onChangeKind, organizerAvailable, state, view }: {
  activeKind: EventAnalyticsKind;
  attendeeAvailable: boolean;
  onChangeKind: (kind: EventAnalyticsKind) => void;
  organizerAvailable: boolean;
  state: EventAnalyticsContentState;
  view: EventAnalyticsView | null;
}) {
  const { styles } = useStyles();
  if (state.kind === "loading") return <DataCard title="正在读取活动证据"><Text style={styles.detail}>正在确认你可查看的报告范围。</Text></DataCard>;
  if (state.kind === "failure" || !view) return <ErrorState message={state.kind === "failure" ? state.message : "当前没有可查看的活动报告。"} />;
  const canSwitch = organizerAvailable && attendeeAvailable;
  return (
    <View style={styles.content}>
      {canSwitch ? <View accessibilityLabel="活动报告视图" style={styles.segmented}>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: activeKind === "organizer_aggregate" }} onPress={() => onChangeKind("organizer_aggregate")} style={[styles.segment, activeKind === "organizer_aggregate" ? styles.segmentActive : null]}><Text style={[styles.segmentText, activeKind === "organizer_aggregate" ? styles.segmentTextActive : null]}>组织者汇总</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: activeKind === "attendee_report" }} onPress={() => onChangeKind("attendee_report")} style={[styles.segment, activeKind === "attendee_report" ? styles.segmentActive : null]}><Text style={[styles.segmentText, activeKind === "attendee_report" ? styles.segmentTextActive : null]}>我的报告</Text></Pressable>
      </View> : null}

      <View style={styles.privacy}><Text style={styles.privacyTitle}>{view.title}</Text><Text style={styles.privacyDetail}>{view.privacyLabel}</Text></View>

      <View style={styles.section}><Text style={styles.sectionTitle}>活动证据</Text><MetricGrid metrics={view.summaryMetrics} /><View style={styles.statusRows}>{view.statusRows.map((row) => <View key={row.label} style={styles.statusRow}><Text style={styles.statusLabel}>{row.label}</Text><Text style={styles.statusDetail}>{row.detail}</Text></View>)}</View></View>

      {view.rates.length > 0 ? <View style={styles.section}><Text style={styles.sectionTitle}>可解释比率</Text><Text style={styles.detail}>始终显示真实分子与分母；没有样本时不计算百分比。</Text><View style={styles.rates}>{view.rates.map((rate) => <View key={rate.label} style={styles.rate}><Text style={styles.rateValue}>{rate.value}</Text><Text style={styles.metricLabel}>{rate.label}</Text><Text style={styles.rateDetail}>{rate.detail}</Text></View>)}</View></View> : null}

      <View style={styles.cardSection}><Text style={styles.sectionTitle}>联系证据</Text><Text style={styles.detail}>{view.groupingLabel}</Text><MetricGrid metrics={view.contactMetrics} /></View>
      <View style={styles.cardSection}><Text style={styles.sectionTitle}>约谈进展</Text><MetricGrid metrics={view.appointmentMetrics} /></View>

      {view.aiStatusLabel ? <View style={styles.cardSection}><View style={styles.aiHeading}><Text style={styles.sectionTitle}>AI 会后产物</Text><Text style={styles.aiStatus}>{view.aiStatusLabel}</Text></View><Text style={styles.detail}>{view.aiDetail}</Text>{view.aiSummary ? <Text style={styles.artifact}>{view.aiSummary}</Text> : null}{view.aiDraft ? <View style={styles.draft}><Text style={styles.draftLabel}>消息草稿</Text><Text style={styles.artifact}>{view.aiDraft}</Text></View> : null}</View> : null}
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  aiHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    flexWrap: "wrap"
  },
  aiStatus: { backgroundColor: colors.accentSofter, borderRadius: radius.pill, color: colors.accent, fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  artifact: {
    color: colors.ink,
    ...textStyles.body
  },
  cardSection: {
    gap: spacing.md,
    backgroundColor: "transparent",
    paddingVertical: spacing.md
  },
  content: { gap: spacing.lg },
  detail: { color: colors.text3, fontSize: typography.caption, lineHeight: 18 },
  draft: { backgroundColor: colors.surface2, borderRadius: radius.control, gap: spacing.sm, padding: spacing.md },
  draftLabel: { color: colors.text2, fontSize: typography.caption, fontWeight: "800" },
  metric: {
    gap: spacing.xs,
    minHeight: 70,
    backgroundColor: "transparent",
    paddingVertical: spacing.md,
    flexBasis: "45%",
    flexGrow: 1,
    minWidth: 100
  },
  metricLabel: {
    color: colors.text3,
    ...textStyles.small
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metricValue: {
    color: colors.ink,
    ...textStyles.title
  },
  privacy: { backgroundColor: colors.liveSoft, borderRadius: radius.control, gap: spacing.xs, padding: spacing.md },
  privacyDetail: { color: colors.text2, fontSize: typography.caption, lineHeight: 18 },
  privacyTitle: { color: colors.live, fontSize: typography.small, fontWeight: "800" },
  rate: {
    gap: spacing.xxs,
    minHeight: 86,
    backgroundColor: "transparent",
    paddingVertical: spacing.md,
    width: "100%"
  },
  rateDetail: {
    color: colors.text4,
    ...textStyles.small
  },
  rates: {
    gap: spacing.sm
  },
  rateValue: { color: colors.accent, fontSize: typography.section, fontWeight: "800" },
  section: { gap: spacing.md },
  sectionTitle: {
    color: colors.ink,
    ...textStyles.section
  },
  segment: {
    ...createControlStyles(colors).chip,
    flex: 1
  },
  segmentActive: {
    ...createControlStyles(colors).selectedChip
  },
  segmented: { backgroundColor: colors.surface3, borderRadius: radius.control, flexDirection: "row", gap: spacing.xs, padding: spacing.xs },
  segmentText: {
    ...createControlStyles(colors).chipText
  },
  segmentTextActive: {
    ...createControlStyles(colors).selectedChipText
  },
  statusDetail: { color: colors.text2, flex: 1, fontSize: typography.caption, lineHeight: 18, textAlign: "right" },
  statusLabel: { color: colors.ink, fontSize: typography.caption, fontWeight: "800" },
  statusRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 44, paddingVertical: spacing.sm },
  statusRows: { gap: spacing.xs }
}));
