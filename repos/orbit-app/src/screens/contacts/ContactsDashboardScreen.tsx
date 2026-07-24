import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
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
  contactsDashboardToView,
  type ContactsDashboardOverviewItem,
  type ContactsDashboardView
} from "../../view-models/contacts-dashboard";
import type {
  DashboardActivityView,
  DashboardGapView,
  DashboardIndustryView,
  DashboardPriorityView,
  DashboardStrengthView,
  DashboardValueTypeView
} from "../../view-models/dashboard";

export function ContactsDashboardScreen() {
  const aggregateState = useApiResource<unknown>(
    dashboardAggregatePath(4),
    (data) =>
      contactsDashboardToView({ aggregate: data }).overview.every(
        (item) => item.value === "0"
      )
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
      eyebrow="名片夹"
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
      title="人脉表盘"
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
          message="先确认联系人，表盘会开始显示关系覆盖和下一步。"
          title="暂无人脉资产"
        />
      ) : null}
      {aggregateState.kind === "success" ? (
        <ContactsDashboardContent
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

function ContactsDashboardContent({
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
  const view = contactsDashboardToView({
    aggregate,
    distributions,
    gaps,
    opportunities,
    summary
  });

  return (
    <>
      <DataCard detail={view.subtitle} title="人脉星图">
        <OrbitMap view={view} />
        <OverviewGrid items={view.overview} />
      </DataCard>

      <DataCard detail={view.summary} title={view.diagnosis.label}>
        <View style={styles.scoreRow}>
          <View style={styles.scoreBadge}>
            <Ionicons color={colors.accent} name="pulse-outline" size={18} />
            <Text style={styles.scoreText}>{view.diagnosis.scoreLabel}</Text>
          </View>
          <Text style={styles.bodyText}>{view.diagnosis.detail}</Text>
        </View>
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

      {view.gaps.length > 0 ? <GapCard gaps={view.gaps} /> : null}
      {view.industries.length > 0 ? (
        <IndustryCard industries={view.industries} />
      ) : null}
      {view.valueTypes.length > 0 ? (
        <ValueTypeCard valueTypes={view.valueTypes} />
      ) : null}
      {view.recentActivity.length > 0 ? (
        <ActivityCard activities={view.recentActivity} />
      ) : null}
    </>
  );
}

function OrbitMap({ view }: { view: ContactsDashboardView }) {
  return (
    <View style={styles.mapSection}>
      <View style={styles.orbitStage}>
        <View style={[styles.ring, styles.ringOuter]} />
        <View style={[styles.ring, styles.ringMiddle]} />
        <View style={[styles.ring, styles.ringInner]} />
        <View style={[styles.dot, styles.dotLive]} />
        <View style={[styles.dot, styles.dotSky]} />
        <View style={[styles.dot, styles.dotAccent]} />
        <View style={[styles.dot, styles.dotAmber]} />
        <View style={styles.mapCenter}>
          <Text adjustsFontSizeToFit numberOfLines={1} style={styles.mapValue}>
            {view.map.centerValue}
          </Text>
          <Text style={styles.mapLabel}>{view.map.centerLabel}</Text>
        </View>
      </View>
      {view.map.rings.length > 0 ? <RingLegend rings={view.map.rings} /> : null}
    </View>
  );
}

function RingLegend({ rings }: { rings: DashboardStrengthView[] }) {
  return (
    <View style={styles.ringLegend}>
      {rings.map((ring) => (
        <View key={ring.id} style={styles.ringRow}>
          <Text numberOfLines={1} style={styles.itemTitle}>
            {ring.label}
          </Text>
          <Text style={styles.metaText}>{ring.countLabel}</Text>
          <Text style={styles.metaText}>{ring.riskLabel}</Text>
        </View>
      ))}
    </View>
  );
}

function OverviewGrid({ items }: { items: ContactsDashboardOverviewItem[] }) {
  return (
    <View style={styles.overviewGrid}>
      {items.map((item) => (
        <View key={item.id} style={styles.overviewCell}>
          <Text style={styles.metricValue}>{item.value}</Text>
          <Text numberOfLines={1} style={styles.metricLabel}>
            {item.label}
          </Text>
          <Text numberOfLines={2} style={styles.metaText}>
            {item.detail}
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
      <View style={styles.listStack}>
        <View style={styles.rowTop}>
          <View style={styles.flexText}>
            <Text style={styles.itemTitle}>{priority.title}</Text>
            <Text style={styles.bodyText}>{priority.detail}</Text>
          </View>
          <View style={styles.scorePill}>
            <Text style={styles.scorePillText}>{priority.scoreLabel}</Text>
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
            <View style={styles.flexText}>
              <Text style={styles.itemTitle}>{priority.contactName}</Text>
              <Text style={styles.metaText}>查看联系人背景</Text>
            </View>
            <Ionicons color={colors.text3} name="chevron-forward" size={18} />
          </Pressable>
        ) : null}
      </View>
    </DataCard>
  );
}

function GapCard({ gaps }: { gaps: DashboardGapView[] }) {
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

function IndustryCard({
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

function ValueTypeCard({
  valueTypes
}: {
  valueTypes: DashboardValueTypeView[];
}) {
  return (
    <DataCard detail="每段关系到底能帮什么忙" title="价值类型">
      <View style={styles.chipWrap}>
        {valueTypes.map((item) => (
          <View key={item.id} style={styles.chip}>
            <Text style={styles.chipText}>
              {item.label} · {item.countLabel}
            </Text>
          </View>
        ))}
      </View>
    </DataCard>
  );
}

function ActivityCard({
  activities
}: {
  activities: DashboardActivityView[];
}) {
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
    backgroundColor: colors.live,
    borderRadius: radius.pill,
    height: "100%"
  },
  barRow: {
    gap: spacing.sm
  },
  barTrack: {
    backgroundColor: colors.liveSoft,
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
  dot: {
    borderColor: colors.bg,
    borderRadius: 999,
    borderWidth: 2,
    height: 14,
    position: "absolute",
    width: 14
  },
  dotAccent: {
    backgroundColor: colors.accent,
    right: 48,
    top: 96
  },
  dotAmber: {
    backgroundColor: colors.amber,
    bottom: 50,
    left: 54
  },
  dotLive: {
    backgroundColor: colors.live,
    right: 70,
    top: 42
  },
  dotSky: {
    backgroundColor: colors.sky,
    left: 62,
    top: 74
  },
  flexText: {
    flex: 1,
    gap: spacing.xs
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
  mapCenter: {
    alignItems: "center",
    backgroundColor: colors.ink,
    borderColor: colors.bg,
    borderRadius: 48,
    borderWidth: 3,
    height: 96,
    justifyContent: "center",
    width: 96
  },
  mapLabel: {
    color: colors.text4,
    fontSize: typography.caption,
    fontWeight: "700"
  },
  mapSection: {
    alignItems: "center",
    gap: spacing.md
  },
  mapValue: {
    color: colors.bg,
    fontSize: 30,
    fontWeight: "700",
    lineHeight: 34,
    maxWidth: 76
  },
  metaText: {
    color: colors.text3,
    fontSize: typography.small,
    lineHeight: 19
  },
  metricLabel: {
    color: colors.text2,
    fontSize: typography.small,
    fontWeight: "700"
  },
  metricValue: {
    color: colors.ink,
    fontSize: 26,
    fontWeight: "700",
    lineHeight: 30
  },
  orbitStage: {
    alignItems: "center",
    aspectRatio: 1,
    backgroundColor: colors.bgSunken,
    borderColor: colors.border,
    borderRadius: 118,
    borderWidth: 1,
    height: 236,
    justifyContent: "center",
    overflow: "hidden"
  },
  overviewCell: {
    borderColor: colors.border,
    borderTopWidth: 1,
    flexBasis: "46%",
    flexGrow: 1,
    gap: spacing.xs,
    minWidth: 132,
    paddingTop: spacing.md
  },
  overviewGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  pressed: {
    opacity: 0.72
  },
  ring: {
    borderColor: colors.borderStrong,
    borderRadius: 999,
    borderWidth: 1,
    position: "absolute"
  },
  ringInner: {
    height: 100,
    width: 100
  },
  ringLegend: {
    alignSelf: "stretch",
    gap: spacing.sm
  },
  ringMiddle: {
    height: 156,
    width: 156
  },
  ringOuter: {
    height: 214,
    width: 214
  },
  ringRow: {
    alignItems: "center",
    borderColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.sm
  },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  scoreBadge: {
    alignItems: "center",
    backgroundColor: colors.accentSofter,
    borderColor: colors.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scorePill: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scorePillText: {
    color: colors.amber,
    fontSize: typography.small,
    fontWeight: "700"
  },
  scoreRow: {
    gap: spacing.md
  },
  scoreText: {
    color: colors.accent,
    fontSize: typography.small,
    fontWeight: "700"
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
