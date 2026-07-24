import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  dashboardAggregatePath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import {
  dashboardToView,
  type DashboardActivityView,
  type DashboardGapView,
  type DashboardIndustryView,
  type DashboardMetricView,
  type DashboardPriorityView,
  type DashboardStrengthView,
  type DashboardValueTypeView
} from "../../view-models/dashboard";

export function DashboardScreen() {
  const aggregateState = useApiResource<unknown>(
    dashboardAggregatePath(4),
    (data) => dashboardToView({ aggregate: data }).metrics.every((item) => item.value === "0")
  );
  const summaryState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.dashboardSummary,
    () => false
  );
  const opportunitiesState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.dashboardOpportunities,
    () => false
  );
  const gapsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.dashboardNetworkGaps,
    () => false
  );
  const distributionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.dashboardDistributions,
    () => false
  );

  function refreshAll() {
    aggregateState.refresh();
    summaryState.refresh();
    opportunitiesState.refresh();
    gapsState.refresh();
    distributionsState.refresh();
  }

  return (
    <AppScreen
      eyebrow="关系经营"
      refreshControl={
        <RefreshControl
          onRefresh={refreshAll}
          refreshing={
            aggregateState.refreshing ||
            summaryState.refreshing ||
            opportunitiesState.refreshing ||
            gapsState.refreshing ||
            distributionsState.refreshing
          }
          tintColor={colors.accent}
        />
      }
      title="关系仪表盘"
    >
      {aggregateState.kind === "loading" ? <LoadingState /> : null}
      {aggregateState.kind === "offline" ? (
        <ErrorState message={aggregateState.error.message} title="服务器连不上" />
      ) : null}
      {aggregateState.kind === "failure" ? (
        <ErrorState message={aggregateState.error.message} />
      ) : null}
      {aggregateState.kind === "empty" ? (
        <EmptyState
          message="先补一条联系人或跟进记录，仪表盘会开始显示关系覆盖。"
          title="暂无关系数据"
        />
      ) : null}
      {aggregateState.kind === "success" ? (
        <DashboardContent
          aggregate={aggregateState.data}
          distributions={
            distributionsState.kind === "success" ? distributionsState.data : null
          }
          gaps={gapsState.kind === "success" ? gapsState.data : null}
          opportunities={
            opportunitiesState.kind === "success" ? opportunitiesState.data : null
          }
          summary={summaryState.kind === "success" ? summaryState.data : null}
        />
      ) : null}
    </AppScreen>
  );
}

function DashboardContent({
  aggregate,
  distributions,
  gaps,
  opportunities,
  summary
}: {
  aggregate: unknown;
  distributions: unknown;
  gaps: unknown;
  opportunities: unknown;
  summary: unknown;
}) {
  const router = useRouter();
  const view = dashboardToView({
    aggregate,
    distributions,
    gaps,
    opportunities,
    summary
  });

  return (
    <>
      <DataCard detail={view.summary} title="今天先看这三件事">
        <View style={styles.scoreRow}>
          <View style={styles.scoreDial}>
            <Text style={styles.scoreNumber}>{view.coverageScore}</Text>
            <Text style={styles.scoreSuffix}>%</Text>
          </View>
          <View style={styles.scoreCopy}>
            <Text style={styles.sectionLabel}>{view.coverageScoreLabel}</Text>
            <Text style={styles.bodyText}>{view.nextAction}</Text>
          </View>
        </View>
        <MetricGrid metrics={view.metrics} />
      </DataCard>

      {view.priority ? (
        <PriorityCard
          onOpenContact={() => {
            if (view.priority?.contactId) {
              router.push(
                `/contacts/${encodeURIComponent(view.priority.contactId)}` as Href
              );
            }
          }}
          priority={view.priority}
        />
      ) : null}

      {view.gaps.length > 0 ? <GapsCard gaps={view.gaps} /> : null}
      {view.industries.length > 0 ? (
        <DistributionCard industries={view.industries} />
      ) : null}
      {view.valueTypes.length > 0 || view.strengths.length > 0 ? (
        <RelationshipShapeCard
          strengths={view.strengths}
          valueTypes={view.valueTypes}
        />
      ) : null}
      {view.recentActivity.length > 0 ? (
        <ActivityCard activities={view.recentActivity} />
      ) : null}
    </>
  );
}

function MetricGrid({ metrics }: { metrics: DashboardMetricView[] }) {
  return (
    <View style={styles.metricGrid}>
      {metrics.map((metric) => (
        <View key={metric.id} style={styles.metricCell}>
          <Text style={styles.metricValue}>{metric.value}</Text>
          <Text numberOfLines={1} style={styles.metricLabel}>
            {metric.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PriorityCard({
  onOpenContact,
  priority
}: {
  onOpenContact: () => void;
  priority: DashboardPriorityView;
}) {
  return (
    <DataCard detail={`${priority.organization} · ${priority.dueLabel}`} title="优先推进">
      <View style={styles.priorityHeader}>
        <View style={styles.priorityText}>
          <Text style={styles.itemTitle}>{priority.title}</Text>
          <Text style={styles.bodyText}>{priority.detail}</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text style={styles.scoreBadgeText}>{priority.scoreLabel}</Text>
        </View>
      </View>
      <View style={styles.callout}>
        <Ionicons color={colors.accent} name="checkmark-circle-outline" size={18} />
        <Text style={styles.calloutText}>{priority.action}</Text>
      </View>
      {priority.contactId ? (
        <Pressable
          accessibilityRole="button"
          onPress={onOpenContact}
          style={({ pressed }) => [
            styles.contactAction,
            pressed ? styles.pressed : null
          ]}
        >
          <View>
            <Text style={styles.itemTitle}>{priority.contactName}</Text>
            <Text style={styles.metaText}>查看联系人背景</Text>
          </View>
          <Ionicons color={colors.text3} name="chevron-forward" size={18} />
        </Pressable>
      ) : null}
    </DataCard>
  );
}

function GapsCard({ gaps }: { gaps: DashboardGapView[] }) {
  return (
    <DataCard detail={`${gaps.length} 个需要补齐的方向`} title="覆盖缺口">
      <View style={styles.listStack}>
        {gaps.map((gap) => (
          <View key={gap.id} style={styles.listRow}>
            <View style={styles.rowTop}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {gap.label}
              </Text>
              <Text style={styles.severityBadge}>{gap.severityLabel}</Text>
            </View>
            <Text style={styles.metaText}>{gap.detail}</Text>
            <Text style={styles.bodyText}>{gap.action}</Text>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function DistributionCard({
  industries
}: {
  industries: DashboardIndustryView[];
}) {
  return (
    <DataCard detail="看哪些圈层已经够厚，哪些还薄" title="行业分布">
      <View style={styles.listStack}>
        {industries.map((industry) => (
          <View key={industry.id} style={styles.barRow}>
            <View style={styles.rowTop}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {industry.label}
              </Text>
              <Text style={styles.metaText}>{industry.countLabel}</Text>
            </View>
            <View style={styles.barTrack}>
              <View
                style={[
                  styles.barFill,
                  { width: `${Math.max(4, Math.min(100, industry.percentage))}%` }
                ]}
              />
            </View>
            {industry.organizations ? (
              <Text numberOfLines={1} style={styles.metaText}>
                {industry.organizations}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function RelationshipShapeCard({
  strengths,
  valueTypes
}: {
  strengths: DashboardStrengthView[];
  valueTypes: DashboardValueTypeView[];
}) {
  return (
    <DataCard detail="价值类型和关系强弱" title="关系结构">
      {valueTypes.length > 0 ? (
        <View style={styles.inlineSection}>
          <Text style={styles.sectionLabel}>价值类型</Text>
          <View style={styles.chipWrap}>
            {valueTypes.map((item) => (
              <View key={item.id} style={styles.chip}>
                <Text style={styles.chipText}>
                  {item.label} · {item.countLabel}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {strengths.length > 0 ? (
        <View style={styles.inlineSection}>
          <Text style={styles.sectionLabel}>关系强弱</Text>
          <View style={styles.listStack}>
            {strengths.map((item) => (
              <View key={item.id} style={styles.rowTop}>
                <Text style={styles.bodyText}>
                  {item.label} · {item.countLabel}
                </Text>
                <Text style={styles.metaText}>{item.riskLabel}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </DataCard>
  );
}

function ActivityCard({ activities }: { activities: DashboardActivityView[] }) {
  return (
    <DataCard detail="最近进入系统的关系变化" title="最近动态">
      <View style={styles.listStack}>
        {activities.map((activity) => (
          <View key={activity.id} style={styles.listRow}>
            <View style={styles.rowTop}>
              <Text numberOfLines={1} style={styles.itemTitle}>
                {activity.label}
              </Text>
              <Text style={styles.metaText}>{activity.time}</Text>
            </View>
            <Text style={styles.metaText}>
              {activity.typeLabel} · {activity.detail}
            </Text>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

const styles = StyleSheet.create({
  barFill: {
    backgroundColor: colors.sky,
    borderRadius: radius.pill,
    height: "100%"
  },
  barRow: {
    gap: spacing.sm
  },
  barTrack: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.pill,
    height: 8,
    overflow: "hidden"
  },
  bodyText: {
    color: colors.text,
    fontSize: typography.small,
    lineHeight: 20
  },
  callout: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  calloutText: {
    color: colors.text,
    flex: 1,
    fontSize: typography.small,
    lineHeight: 20
  },
  chip: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  chipText: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "600"
  },
  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  contactAction: {
    alignItems: "center",
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    paddingTop: spacing.md
  },
  inlineSection: {
    gap: spacing.sm
  },
  itemTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: typography.body,
    fontWeight: "600",
    lineHeight: 21
  },
  listRow: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingTop: spacing.md
  },
  listStack: {
    gap: spacing.md
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  metricCell: {
    borderColor: colors.border,
    borderTopWidth: 1,
    flexBasis: "48%",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 130,
    paddingTop: spacing.md
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  metricLabel: {
    color: colors.text3,
    fontSize: typography.caption,
    fontWeight: "600"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30
  },
  priorityHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: spacing.md
  },
  priorityText: {
    flex: 1,
    gap: spacing.xs
  },
  pressed: {
    opacity: 0.72
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  scoreBadge: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scoreBadgeText: {
    color: colors.amber,
    fontSize: typography.small,
    fontWeight: "700"
  },
  scoreCopy: {
    flex: 1,
    gap: spacing.xs
  },
  scoreDial: {
    alignItems: "baseline",
    backgroundColor: colors.ink,
    borderRadius: radius.lg,
    flexDirection: "row",
    minWidth: 94,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg
  },
  scoreNumber: {
    color: colors.bg,
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 38
  },
  scoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg
  },
  scoreSuffix: {
    color: colors.bg,
    fontSize: typography.title,
    fontWeight: "700"
  },
  sectionLabel: {
    color: colors.text2,
    fontSize: typography.caption,
    fontWeight: "700",
    textTransform: "uppercase"
  },
  severityBadge: {
    backgroundColor: colors.roseSoft,
    borderRadius: radius.pill,
    color: colors.rose,
    fontSize: typography.caption,
    fontWeight: "700",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  }
});
