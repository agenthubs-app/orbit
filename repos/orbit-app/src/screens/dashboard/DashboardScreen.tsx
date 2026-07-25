import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View
} from "react-native";
import {
  dashboardAggregatePath,
  dashboardOpportunitiesRecomputePath,
  dashboardProvenanceAuditPath,
  dashboardProvenanceAuditRunPath,
  ORBIT_API_ENDPOINTS
} from "../../api/endpoints";
import { AppScreen } from "../../components/AppScreen";
import { DataCard } from "../../components/DataCard";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { LoadingState } from "../../components/LoadingState";
import { colors, radius, spacing, typography } from "../../design/tokens";
import { useApiResource } from "../../hooks/useApiResource";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import {
  dashboardAuditRunToView,
  dashboardAuditToView,
  dashboardOpportunitiesRecomputeToView,
  dashboardToView,
  type DashboardActivityView,
  type DashboardAuditCollectionView,
  type DashboardAuditFindingView,
  type DashboardAuditRunView,
  type DashboardAuditView,
  type DashboardGapView,
  type DashboardIndustryView,
  type DashboardMetricView,
  type DashboardOpportunitiesRecomputeView,
  type DashboardPriorityView,
  type DashboardStrengthView,
  type DashboardValueTypeView
} from "../../view-models/dashboard";

export function DashboardScreen() {
  const client = useOrbitApiClient();
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] =
    useState<DashboardOpportunitiesRecomputeView | null>(null);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditRunResult, setAuditRunResult] =
    useState<DashboardAuditRunView | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
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
  const auditState = useApiResource<unknown>(
    dashboardProvenanceAuditPath(),
    () => false
  );

  function refreshAll() {
    setRecomputeError(null);
    setAuditError(null);
    aggregateState.refresh();
    summaryState.refresh();
    opportunitiesState.refresh();
    gapsState.refresh();
    distributionsState.refresh();
    auditState.refresh();
  }

  async function recomputeDashboardOpportunities() {
    setRecomputing(true);
    setRecomputeResult(null);
    setRecomputeError(null);

    try {
      const result = await client.post<unknown>(
        dashboardOpportunitiesRecomputePath()
      );

      if (result.success) {
        setRecomputeResult(
          dashboardOpportunitiesRecomputeToView(result.data)
        );
        aggregateState.refresh();
        opportunitiesState.refresh();
        gapsState.refresh();
      } else {
        setRecomputeError(result.error.message);
      }
    } catch {
      setRecomputeError("机会提醒暂时不能重新计算。请稍后再试。");
    } finally {
      setRecomputing(false);
    }
  }

  async function runDashboardAudit() {
    setAuditing(true);
    setAuditRunResult(null);
    setAuditError(null);

    try {
      const result = await client.post<unknown>(
        dashboardProvenanceAuditRunPath()
      );

      if (result.success) {
        setAuditRunResult(dashboardAuditRunToView(result.data));
        auditState.refresh();
      } else {
        setAuditError(result.error.message);
      }
    } catch {
      setAuditError("来源审计暂时不能运行。请稍后再试。");
    } finally {
      setAuditing(false);
    }
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
            distributionsState.refreshing ||
            auditState.refreshing
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
      {auditState.kind === "failure" ? (
        <ErrorState message={auditState.error.message} title="来源审计不可用" />
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
          audit={
            auditState.kind === "success" || auditState.kind === "empty"
              ? auditState.data
              : null
          }
          auditError={auditError}
          auditRunResult={auditRunResult}
          auditing={auditing}
          distributions={
            distributionsState.kind === "success" ? distributionsState.data : null
          }
          gaps={gapsState.kind === "success" ? gapsState.data : null}
          opportunities={
            opportunitiesState.kind === "success" ? opportunitiesState.data : null
          }
          onRunAudit={runDashboardAudit}
          onRecompute={recomputeDashboardOpportunities}
          recomputeError={recomputeError}
          recomputeResult={recomputeResult}
          recomputing={recomputing}
          summary={summaryState.kind === "success" ? summaryState.data : null}
        />
      ) : null}
    </AppScreen>
  );
}

function DashboardContent({
  aggregate,
  audit,
  auditError,
  auditRunResult,
  auditing,
  distributions,
  gaps,
  onRunAudit,
  onRecompute,
  opportunities,
  recomputeError,
  recomputeResult,
  recomputing,
  summary
}: {
  aggregate: unknown;
  audit: unknown;
  auditError: string | null;
  auditRunResult: DashboardAuditRunView | null;
  auditing: boolean;
  distributions: unknown;
  gaps: unknown;
  onRunAudit: () => void;
  onRecompute: () => void;
  opportunities: unknown;
  recomputeError: string | null;
  recomputeResult: DashboardOpportunitiesRecomputeView | null;
  recomputing: boolean;
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
  const auditView = audit ? dashboardAuditToView(audit) : null;

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
        <Pressable
          accessibilityRole="button"
          disabled={recomputing}
          onPress={onRecompute}
          style={({ pressed }) => [
            styles.recomputeButton,
            recomputing ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="refresh-outline" size={17} />
          <Text style={styles.recomputeButtonText}>
            {recomputing ? "计算中" : "重新计算机会"}
          </Text>
        </Pressable>
      </DataCard>

      {recomputeResult ? (
        <DataCard
          detail={recomputeResult.statusLabel}
          title={recomputeResult.title}
        >
          <Text style={styles.bodyText}>{recomputeResult.detail}</Text>
          <Text style={styles.recomputeStatus}>
            {recomputeResult.nextAction}
          </Text>
        </DataCard>
      ) : null}
      {recomputeError ? (
        <Text style={styles.errorText}>{recomputeError}</Text>
      ) : null}

      {auditView ? (
        <DashboardAuditCard
          audit={auditView}
          auditError={auditError}
          auditRunResult={auditRunResult}
          auditing={auditing}
          onRunAudit={onRunAudit}
        />
      ) : null}

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

function DashboardAuditCard({
  audit,
  auditError,
  auditRunResult,
  auditing,
  onRunAudit
}: {
  audit: DashboardAuditView;
  auditError: string | null;
  auditRunResult: DashboardAuditRunView | null;
  auditing: boolean;
  onRunAudit: () => void;
}) {
  const collections = audit.collections.slice(0, 4);
  const findings = audit.findings.slice(0, 2);

  return (
    <DataCard
      detail={`${audit.statusLabel} · ${audit.coverageLabel}`}
      title={audit.title || "来源一致性审计"}
    >
      <Text style={styles.bodyText}>{audit.summary}</Text>
      <View style={styles.callout}>
        <Ionicons color={colors.accent} name="shield-checkmark-outline" size={18} />
        <Text style={styles.calloutText}>{audit.nextAction}</Text>
      </View>
      {collections.length > 0 ? (
        <View style={styles.listStack}>
          {collections.map((collection) => (
            <AuditCollectionRow collection={collection} key={collection.id} />
          ))}
        </View>
      ) : null}
      {findings.length > 0 ? (
        <View style={styles.inlineSection}>
          <Text style={styles.sectionLabel}>待复核</Text>
          <View style={styles.listStack}>
            {findings.map((finding) => (
              <AuditFindingRow finding={finding} key={finding.id} />
            ))}
          </View>
        </View>
      ) : null}
      <Text style={styles.metaText}>{audit.safetyText}</Text>
      {auditRunResult ? (
        <View style={styles.auditResult}>
          <View style={styles.rowTop}>
            <Text style={styles.itemTitle}>{auditRunResult.title}</Text>
            <Text style={styles.okBadge}>{auditRunResult.statusLabel}</Text>
          </View>
          <Text style={styles.bodyText}>{auditRunResult.detail}</Text>
          <Text style={styles.metaText}>{auditRunResult.nextAction}</Text>
        </View>
      ) : null}
      {auditError ? <Text style={styles.errorText}>{auditError}</Text> : null}
      <Pressable
        accessibilityRole="button"
        disabled={auditing}
        onPress={onRunAudit}
        style={({ pressed }) => [
          styles.recomputeButton,
          auditing ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.onAccent} name="refresh-outline" size={17} />
        <Text style={styles.recomputeButtonText}>
          {auditing ? "审计中" : "运行来源审计"}
        </Text>
      </Pressable>
    </DataCard>
  );
}

function AuditCollectionRow({
  collection
}: {
  collection: DashboardAuditCollectionView;
}) {
  const statusStyle =
    collection.statusLabel === "来源完整" ? styles.okBadge : styles.severityBadge;

  return (
    <View style={styles.listRow}>
      <View style={styles.rowTop}>
        <Text numberOfLines={1} style={styles.itemTitle}>
          {collection.label}
        </Text>
        <Text style={statusStyle}>{collection.statusLabel}</Text>
      </View>
      <Text style={styles.metaText}>
        {collection.countLabel} · {collection.evidenceLabel}
      </Text>
    </View>
  );
}

function AuditFindingRow({ finding }: { finding: DashboardAuditFindingView }) {
  return (
    <View style={styles.listRow}>
      <View style={styles.rowTop}>
        <Text numberOfLines={1} style={styles.itemTitle}>
          {finding.title}
        </Text>
        <Text style={styles.severityBadge}>{finding.severityLabel}</Text>
      </View>
      <Text style={styles.bodyText}>{finding.detail}</Text>
      <Text style={styles.metaText}>
        {finding.remediation} · {finding.evidenceLabel}
      </Text>
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
  auditResult: {
    backgroundColor: colors.surface2,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
    padding: spacing.md
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
  disabled: {
    opacity: 0.58
  },
  errorText: {
    color: colors.rose,
    fontSize: typography.small,
    lineHeight: 20
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
  okBadge: {
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontSize: typography.caption,
    fontWeight: "700",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
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
  recomputeButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    flexDirection: "row",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  recomputeButtonText: {
    color: colors.onAccent,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 18
  },
  recomputeStatus: {
    color: colors.live,
    fontSize: typography.small,
    fontWeight: "700",
    lineHeight: 20
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
