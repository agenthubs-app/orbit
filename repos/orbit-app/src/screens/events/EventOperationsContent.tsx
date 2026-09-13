import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";

import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { radius, spacing, typography, textStyles } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles } from "../../design/theme";
import type { EventOperationsGenerationView, EventOperationsView } from "../../view-models/event-operations";

export type EventOperationsContentState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "empty" }
  | { kind: "unconfigured" }
  | { kind: "forbidden"; message: string }
  | { kind: "offline"; message: string }
  | { kind: "failure"; message: string };

function Shortcut({ label, onPress }: { label: string; onPress: () => void }) {
  const { styles } = useStyles();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.shortcut, pressed ? styles.pressed : null]}>
      <Text style={styles.shortcutLabel}>{label}</Text>
    </Pressable>
  );
}

function GenerationRow({ busy, generation, onAction }: { busy: boolean; generation: EventOperationsGenerationView; onAction: () => void }) {
  const { styles } = useStyles();
  const { fontScale } = useWindowDimensions();
  return (
    <View style={styles.generationRow}>
      <View style={[styles.rowHeading, fontScale > 1.3 && styles.stackedRow]}>
        <View style={styles.flexCopy}>
          <Text style={styles.rowTitle}>{generation.title}</Text>
          <Text style={styles.rowDetail}>{generation.snapshotLabel}</Text>
        </View>
        <Text style={[styles.status, generation.status === "failed" ? styles.statusDanger : generation.status === "published" ? styles.statusLive : null]}>{generation.statusLabel}</Text>
      </View>
      <View accessibilityLabel={`${generation.title}进度`} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: generation.progress, text: generation.progressLabel }} aria-valuemin={0} aria-valuemax={100} aria-valuenow={generation.progress} aria-valuetext={generation.progressLabel} style={styles.progressTrack}><View style={[styles.progressValue, { width: `${generation.progress}%` }]} /></View>
      <Text style={styles.rowDetail}>{generation.progressLabel}</Text>
      {generation.errorLabel ? <Text style={styles.errorText}>{generation.errorLabel}</Text> : null}
      {generation.action ? (
        <Pressable accessibilityRole="button" disabled={busy} onPress={onAction} style={({ pressed }) => [generation.action === "publish" ? styles.primaryButton : styles.secondaryButton, pressed ? styles.pressed : null, busy ? styles.disabled : null]}>
          <Text style={generation.action === "publish" ? styles.primaryButtonText : styles.secondaryButtonText}>{busy ? "正在处理" : generation.actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EventOperationsContent({ busy, notice, onGenerationAction, onOpenAnalytics, onOpenCheckIn, onOpenEvent, onOpenExperience, onOpenRoles, onRefresh, onStartGeneration, state, view }: {
  busy: string | null;
  notice?: string | null;
  onGenerationAction: (generation: EventOperationsGenerationView) => void;
  onOpenAnalytics: () => void;
  onOpenCheckIn: () => void;
  onOpenEvent?: () => void;
  onOpenExperience: () => void;
  onOpenRoles: () => void;
  onRefresh?: () => void;
  onStartGeneration: () => void;
  state: EventOperationsContentState;
  view: EventOperationsView;
}) {
  const { colors, styles } = useStyles();
  const { width, fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  if (state.kind === "forbidden") return (
    <View style={[styles.permission, largeText && styles.permissionLarge]}>
      <View style={styles.permissionIcon}><Ionicons color={colors.ink} name="lock-closed-outline" size={26} /></View>
      <Text accessibilityLabel="需要运营权限" accessibilityRole="header" style={styles.permissionTitle}>{fontScale > 1.8 ? "需要\n运营权限" : "需要运营权限"}</Text>
      <Text accessibilityRole="alert" style={styles.permissionDetail}>{state.message}</Text>
      <Text style={styles.permissionDetail}>请联系活动主办方确认权限，或返回活动详情。</Text>
      <View style={styles.permissionActions}>
        {onOpenEvent ? <Pressable accessibilityRole="button" onPress={onOpenEvent} style={({ pressed }) => [styles.permissionPrimary, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>返回活动详情</Text></Pressable> : null}
        {onRefresh ? <Pressable accessibilityRole="button" onPress={onRefresh} style={({ pressed }) => [styles.permissionSecondary, pressed && styles.pressed]}><Text style={styles.secondaryButtonText}>重新检查权限</Text></Pressable> : null}
      </View>
    </View>
  );
  if (state.kind === "loading") return <DataCard title="正在读取运营状态"><Text style={styles.rowDetail}>正在同步指标、时间门禁与生成任务。</Text></DataCard>;
  if (state.kind === "offline" || state.kind === "failure") return <ErrorState message={state.message} />;
  if (state.kind === "unconfigured") return <EmptyState message="请先在 Web 运营台确认活动档期并设置时间门禁；保存后移动端会同步生成、发布与分桌状态。" title="尚未配置运营规则" />;
  if (!view.contractValid) return <ErrorState message="运营数据格式暂时无法确认，请刷新后重试。" />;

  return (
    <View style={styles.content}>
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      <View style={styles.section}>
        <Text accessibilityRole="header" style={styles.overviewTitle}>运营概览</Text>
        <View style={styles.metrics}>
          {view.metrics.map((metric, index) => <View key={metric.label} style={[styles.metric, index === 0 && styles.metricFirst, index === view.metrics.length - 1 && styles.metricLast, largeText && (width < 360 ? styles.metricSingle : styles.metricDouble)]}><Text style={styles.metricValue}>{metric.value}</Text><Text style={styles.metricLabel}>{metric.label}</Text></View>)}
        </View>
      </View>

      <View style={styles.shortcuts}>
        <Shortcut label="签到台" onPress={onOpenCheckIn} />
        <Shortcut label="活动分析" onPress={onOpenAnalytics} />
        <Shortcut label="角色" onPress={onOpenRoles} />
        <Shortcut label="报名体验" onPress={onOpenExperience} />
      </View>

      <View style={styles.cardSection}>
        <View style={styles.sectionHeading}>
          <View style={styles.flexCopy}><Text style={styles.sectionTitle}>AI 匹配与发布</Text><Text style={styles.sectionDetail}>完整生成后仍需主办方确认，结果不会自动公开。</Text></View>
          <Pressable accessibilityLabel="开始生成匹配" accessibilityRole="button" disabled={view.hasActiveGeneration || busy !== null} onPress={onStartGeneration} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null, view.hasActiveGeneration || busy !== null ? styles.disabled : null]}>
            <Ionicons color={colors.onAccent} name="sparkles-outline" size={19} />
          </Pressable>
        </View>
        {view.generations.length === 0 ? <Text style={styles.emptyText}>尚未创建匹配生成。</Text> : view.generations.map((generation) => <GenerationRow busy={busy === generation.generationId} generation={generation} key={generation.generationId} onAction={() => onGenerationAction(generation)} />)}
      </View>

      <View style={styles.cardSection}>
        <View style={styles.sectionHeading}><View style={styles.flexCopy}><Text style={styles.sectionTitle}>两轮分桌</Text><Text style={styles.sectionDetail}>{view.publishedLabel ?? "尚无已发布结果"}</Text></View></View>
        {view.rounds.length === 0 ? <Text style={styles.emptyText}>完成生成并确认发布后，分桌结果会显示在这里。</Text> : view.rounds.map((round) => <View key={round.key} style={styles.round}><Text style={styles.roundTitle}>{round.title}</Text>{round.tables.length === 0 ? <Text style={styles.emptyText}>本轮暂无分桌。</Text> : round.tables.map((table) => <View key={table.title} style={styles.tableRow}><Ionicons color={colors.live} name="people-circle-outline" size={20} /><View style={styles.flexCopy}><Text style={styles.rowTitle}>{table.title}</Text><Text style={styles.rowDetail}>{table.detail}</Text></View></View>)}</View>)}
      </View>

      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>时间门禁</Text>
        <Text style={styles.sectionDetail}>{view.configurationSummary}</Text>
        <View style={styles.gates}>{view.gates.map((gate) => <View key={gate.key} style={[styles.gate, largeText && styles.stackedRow]}><View style={styles.flexCopy}><Text style={styles.rowTitle}>{gate.label}</Text><Text style={styles.rowDetail}>{gate.atLabel}</Text></View><Text style={[styles.gateState, gate.tone === "active" ? styles.gateStateActive : null]}>{gate.stateLabel}</Text></View>)}</View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  cardSection: {
    gap: spacing.md,
    backgroundColor: "transparent",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border2
  },
  content: { gap: 16 },
  disabled: { opacity: 0.45 },
  emptyText: { color: colors.text3, fontSize: typography.small, lineHeight: 20 },
  errorText: { color: colors.rose, fontSize: typography.caption, lineHeight: 17 },
  flexCopy: { flexShrink: 1, flexGrow: 1, gap: spacing.xs, minWidth: 0 },
  gate: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 58, paddingVertical: spacing.sm },
  gates: { gap: spacing.xs },
  gateState: { backgroundColor: colors.surface3, borderRadius: radius.pill, color: colors.text3, fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  gateStateActive: { backgroundColor: colors.liveSoft, color: colors.live },
  generationRow: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, paddingTop: spacing.md },
  iconButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.control, height: 44, justifyContent: "center", width: 44 },
  metric: {
    gap: 6,
    backgroundColor: "transparent",
    paddingVertical: 12,
    paddingHorizontal: 12,
    width: "25%",
    borderRightWidth: 1,
    borderRightColor: colors.border,
    minWidth: 0
  },
  metricFirst: { paddingLeft: 0 },
  metricLast: { borderRightWidth: 0 },
  metricDouble: { width: "50%", paddingLeft: 12 },
  metricSingle: { width: "100%", borderRightWidth: 0, paddingLeft: 0 },
  metricLabel: {
    color: colors.text3,
    fontSize: 11,
    lineHeight: 16
  },
  metrics: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  metricValue: {
    color: colors.ink,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
    letterSpacing: -0.72
  },
  overviewTitle: { color: colors.ink, fontSize: 20, lineHeight: 28, fontWeight: "900", letterSpacing: -0.4 },
  permission: { alignItems: "center", marginHorizontal: 24, paddingTop: 118, paddingBottom: 24 },
  permissionLarge: { paddingTop: 40 },
  permissionIcon: { alignItems: "center", justifyContent: "center", width: 64, height: 64, borderRadius: 32, borderWidth: 1.5, borderColor: colors.ink },
  permissionTitle: { color: colors.ink, fontSize: 22, lineHeight: 30, fontWeight: "900", letterSpacing: -0.44, textAlign: "center", marginTop: 20, marginBottom: 8 },
  permissionDetail: { color: colors.text3, fontSize: 14, lineHeight: 22, textAlign: "center" },
  permissionActions: { width: "100%", gap: 8, marginTop: 28 },
  permissionPrimary: { ...createControlStyles(colors).primaryButton, minHeight: 50, width: "100%" },
  permissionSecondary: { ...createControlStyles(colors).secondaryButton, minHeight: 46, width: "100%" },
  notice: { backgroundColor: colors.surface2, borderRadius: radius.control, color: colors.text2, fontSize: typography.small, lineHeight: 20, padding: spacing.md },
  pressed: { opacity: 0.68 },
  primaryButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "100%"
  },
  primaryButtonText: {
    ...createControlStyles(colors).primaryButtonText
  },
  progressTrack: { backgroundColor: colors.surface3, borderRadius: radius.pill, height: 6, overflow: "hidden" },
  progressValue: { backgroundColor: colors.accent, borderRadius: radius.pill, height: 6 },
  round: { gap: spacing.sm },
  roundTitle: { color: colors.text2, fontSize: typography.caption, fontWeight: "800" },
  rowDetail: {
    color: colors.text3,
    ...textStyles.small
  },
  rowHeading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  stackedRow: { flexDirection: "column", alignItems: "flex-start" },
  rowTitle: {
    color: colors.ink,
    ...textStyles.listTitle
  },
  secondaryButton: {
    ...createControlStyles(colors).secondaryButton,
    flexDirection: "row",
    gap: spacing.sm,
    maxWidth: "100%"
  },
  secondaryButtonText: {
    ...createControlStyles(colors).secondaryButtonText
  },
  section: { gap: spacing.md },
  sectionDetail: { color: colors.text3, fontSize: typography.caption, lineHeight: 18 },
  sectionHeading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  sectionTitle: {
    color: colors.ink,
    ...textStyles.section
  },
  shortcut: {
    justifyContent: "center",
    minHeight: 44,
    paddingVertical: 10,
    maxWidth: "100%"
  },
  shortcutLabel: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600"
  },
  shortcuts: {
    flexDirection: "row",
    columnGap: 22,
    flexWrap: "wrap",
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  status: { backgroundColor: colors.surface3, borderRadius: radius.pill, color: colors.text2, fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusDanger: { backgroundColor: colors.roseSoft, color: colors.rose },
  statusLive: { backgroundColor: colors.liveSoft, color: colors.live },
  tableRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 58, paddingTop: spacing.sm }
}));
