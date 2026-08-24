import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import type { EventOperationsGenerationView, EventOperationsView } from "../../view-models/event-operations";

export type EventOperationsContentState =
  | { kind: "loading" }
  | { kind: "success" }
  | { kind: "empty" }
  | { kind: "unconfigured" }
  | { kind: "offline"; message: string }
  | { kind: "failure"; message: string };

function Shortcut({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.shortcut, pressed ? styles.pressed : null]}>
      <Ionicons color={colors.accent} name={icon} size={18} />
      <Text style={styles.shortcutLabel}>{label}</Text>
    </Pressable>
  );
}

function GenerationRow({ busy, generation, onAction }: { busy: boolean; generation: EventOperationsGenerationView; onAction: () => void }) {
  return (
    <View style={styles.generationRow}>
      <View style={styles.rowHeading}>
        <View style={styles.flexCopy}>
          <Text style={styles.rowTitle}>{generation.title}</Text>
          <Text style={styles.rowDetail}>{generation.snapshotLabel}</Text>
        </View>
        <Text style={[styles.status, generation.status === "failed" ? styles.statusDanger : generation.status === "published" ? styles.statusLive : null]}>{generation.statusLabel}</Text>
      </View>
      <View style={styles.progressTrack}><View style={[styles.progressValue, { width: `${Math.max(3, generation.progress)}%` }]} /></View>
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

export function EventOperationsContent({ busy, notice, onGenerationAction, onOpenAnalytics, onOpenCheckIn, onOpenRoles, onStartGeneration, state, view }: {
  busy: string | null;
  notice?: string | null;
  onGenerationAction: (generation: EventOperationsGenerationView) => void;
  onOpenAnalytics: () => void;
  onOpenCheckIn: () => void;
  onOpenRoles: () => void;
  onStartGeneration: () => void;
  state: EventOperationsContentState;
  view: EventOperationsView;
}) {
  if (state.kind === "loading") return <DataCard title="正在读取运营状态"><Text style={styles.rowDetail}>正在同步指标、时间门禁与生成任务。</Text></DataCard>;
  if (state.kind === "offline" || state.kind === "failure") return <ErrorState message={state.message} />;
  if (state.kind === "unconfigured") return <EmptyState message="请先在 Web 运营台确认活动档期并设置时间门禁；保存后移动端会同步生成、发布与分桌状态。" title="尚未配置运营规则" />;
  if (!view.contractValid) return <ErrorState message="运营数据格式暂时无法确认，请刷新后重试。" />;

  return (
    <View style={styles.content}>
      {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      <View style={styles.shortcuts}>
        <Shortcut icon="checkmark-circle-outline" label="签到台" onPress={onOpenCheckIn} />
        <Shortcut icon="stats-chart-outline" label="活动分析" onPress={onOpenAnalytics} />
        <Shortcut icon="people-outline" label="角色" onPress={onOpenRoles} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>运营概览</Text>
        <View style={styles.metrics}>
          {view.metrics.map((metric) => <View key={metric.label} style={styles.metric}><Text style={styles.metricValue}>{metric.value}</Text><Text style={styles.metricLabel}>{metric.label}</Text></View>)}
        </View>
      </View>

      <View style={styles.cardSection}>
        <View style={styles.sectionHeading}>
          <View style={styles.flexCopy}><Text style={styles.sectionTitle}>AI 匹配与发布</Text><Text style={styles.sectionDetail}>完整生成后仍需主办方确认，结果不会自动公开。</Text></View>
          <Pressable accessibilityRole="button" disabled={view.hasActiveGeneration || busy !== null} onPress={onStartGeneration} style={({ pressed }) => [styles.iconButton, pressed ? styles.pressed : null, view.hasActiveGeneration || busy !== null ? styles.disabled : null]}>
            <Ionicons color={colors.onAccent} name="sparkles-outline" size={19} />
          </Pressable>
        </View>
        {view.generations.length === 0 ? <Text style={styles.emptyText}>尚未创建匹配生成。</Text> : view.generations.map((generation) => <GenerationRow busy={busy === generation.generationId} generation={generation} key={generation.generationId} onAction={() => onGenerationAction(generation)} />)}
      </View>

      <View style={styles.cardSection}>
        <View style={styles.sectionHeading}><View style={styles.flexCopy}><Text style={styles.sectionTitle}>两轮分桌</Text><Text style={styles.sectionDetail}>{view.publishedLabel ?? "尚无已发布结果"}</Text></View></View>
        {view.rounds.length === 0 ? <Text style={styles.emptyText}>完成生成并确认发布后，分桌结果会显示在这里。</Text> : view.rounds.map((round) => <View key={round.key} style={styles.round}><Text style={styles.roundTitle}>{round.title}</Text>{round.tables.length === 0 ? <Text style={styles.emptyText}>本轮暂无分桌。</Text> : round.tables.map((table) => <View key={table.title} style={styles.tableRow}><Ionicons color={colors.live} name="people-circle-outline" size={20} /><View style={styles.flexCopy}><Text style={styles.rowTitle}>{table.title}</Text><Text numberOfLines={2} style={styles.rowDetail}>{table.detail}</Text></View></View>)}</View>)}
      </View>

      <View style={styles.cardSection}>
        <Text style={styles.sectionTitle}>时间门禁</Text>
        <Text style={styles.sectionDetail}>{view.configurationSummary}</Text>
        <View style={styles.gates}>{view.gates.map((gate) => <View key={gate.key} style={styles.gate}><View style={styles.flexCopy}><Text style={styles.rowTitle}>{gate.label}</Text><Text style={styles.rowDetail}>{gate.atLabel}</Text></View><Text style={[styles.gateState, gate.tone === "active" ? styles.gateStateActive : null]}>{gate.stateLabel}</Text></View>)}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cardSection: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.card, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  content: { gap: spacing.lg },
  disabled: { opacity: 0.45 },
  emptyText: { color: colors.text3, fontSize: typography.small, lineHeight: 20 },
  errorText: { color: colors.rose, fontSize: typography.caption, lineHeight: 17 },
  flexCopy: { flex: 1, gap: spacing.xs, minWidth: 0 },
  gate: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 58, paddingVertical: spacing.sm },
  gates: { gap: spacing.xs },
  gateState: { backgroundColor: colors.surface3, borderRadius: radius.pill, color: colors.text3, fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  gateStateActive: { backgroundColor: colors.liveSoft, color: colors.live },
  generationRow: { borderTopColor: colors.border, borderTopWidth: 1, gap: spacing.sm, paddingTop: spacing.md },
  iconButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.control, height: 44, justifyContent: "center", width: 44 },
  metric: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, gap: spacing.xs, minHeight: 72, padding: spacing.md, width: "48%" },
  metricLabel: { color: colors.text3, fontSize: typography.caption },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metricValue: { color: colors.ink, fontSize: 24, fontWeight: "800" },
  notice: { backgroundColor: colors.liveSoft, borderRadius: radius.control, color: colors.live, fontSize: typography.small, lineHeight: 20, padding: spacing.md },
  pressed: { opacity: 0.68 },
  primaryButton: { alignItems: "center", backgroundColor: colors.accent, borderRadius: radius.control, justifyContent: "center", minHeight: 44 },
  primaryButtonText: { color: colors.onAccent, fontSize: typography.small, fontWeight: "800" },
  progressTrack: { backgroundColor: colors.surface3, borderRadius: radius.pill, height: 6, overflow: "hidden" },
  progressValue: { backgroundColor: colors.accent, borderRadius: radius.pill, height: 6 },
  round: { gap: spacing.sm },
  roundTitle: { color: colors.text2, fontSize: typography.caption, fontWeight: "800" },
  rowDetail: { color: colors.text3, fontSize: typography.caption, lineHeight: 17 },
  rowHeading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  rowTitle: { color: colors.ink, fontSize: typography.small, fontWeight: "800", lineHeight: 18 },
  secondaryButton: { alignItems: "center", borderColor: colors.accent, borderRadius: radius.control, borderWidth: 1, justifyContent: "center", minHeight: 44 },
  secondaryButtonText: { color: colors.accent, fontSize: typography.small, fontWeight: "800" },
  section: { gap: spacing.md },
  sectionDetail: { color: colors.text3, fontSize: typography.caption, lineHeight: 18 },
  sectionHeading: { alignItems: "flex-start", flexDirection: "row", gap: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: typography.section, fontWeight: "800", lineHeight: 22 },
  shortcut: { alignItems: "center", backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.control, borderWidth: 1, flex: 1, gap: spacing.xs, justifyContent: "center", minHeight: 64 },
  shortcutLabel: { color: colors.ink, fontSize: typography.caption, fontWeight: "800" },
  shortcuts: { flexDirection: "row", gap: spacing.sm },
  status: { backgroundColor: colors.surface3, borderRadius: radius.pill, color: colors.text2, fontSize: 10, fontWeight: "800", overflow: "hidden", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  statusDanger: { backgroundColor: colors.roseSoft, color: colors.rose },
  statusLive: { backgroundColor: colors.liveSoft, color: colors.live },
  tableRow: { alignItems: "center", borderTopColor: colors.border, borderTopWidth: 1, flexDirection: "row", gap: spacing.md, minHeight: 58, paddingTop: spacing.sm }
});
