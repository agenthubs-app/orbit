import { Ionicons } from "@expo/vector-icons";
import { type Href, useRouter } from "expo-router";
import { useEffect, useState } from "react";
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
import { OfflineNotice } from "../../components/OfflineNotice";
import { textStyles, radius, spacing } from "../../design/tokens";
import { createControlStyles } from "../../design/controls";
import { createThemedStyles, useOrbitTheme } from "../../design/theme";
import { useApiResource } from "../../hooks/useApiResource";
import { useLoadingDeadline } from "../../hooks/useLoadingDeadline";
import { useLocalDashboard } from "../../hooks/useLocalDashboard";
import { useOrbitLocale } from "../../i18n/OrbitLocaleContext";
import { useOrbitApiClient } from "../../hooks/useOrbitApiClient";
import { usePageCopySession } from "../../hooks/usePageCopySession";
import type { PageCopy } from "../../data/sync/page-copies";
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
  const { colors } = useOrbitTheme();
  const client = useOrbitApiClient();
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeResult, setRecomputeResult] =
    useState<DashboardOpportunitiesRecomputeView | null>(null);
  const [recomputeError, setRecomputeError] = useState<string | null>(null);
  const [auditing, setAuditing] = useState(false);
  const [auditRunResult, setAuditRunResult] =
    useState<DashboardAuditRunView | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  /**
   * Sprint 0117 (dashboard D3): the sections are computed on the device from
   * its copy of the dashboard graph (sync domain "dashboard-graph") with the
   * server's own code, so the five dashboard reads stay inert while the mirror
   * is this platform's source (always on native; in a browser when its mirror
   * is active). The source audit is not a dashboard computation and is still
   * read online.
   */
  const local = useLocalDashboard();
  const localMode = local.available;
  const localSections = localMode ? local.sections : null;
  const offline = localMode && local.freshness.offline;
  const aggregateState = useApiResource<unknown>(
    dashboardAggregatePath(4),
    (data) => isEmptyDashboard(data),
    { enabled: !localMode }
  );
  const summaryState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.dashboardSummary,
    () => false,
    { enabled: !localMode }
  );
  const opportunitiesState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.dashboardOpportunities,
    () => false,
    { enabled: !localMode }
  );
  const gapsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.dashboardNetworkGaps,
    () => false,
    { enabled: !localMode }
  );
  const distributionsState = useApiResource<unknown>(
    ORBIT_API_ENDPOINTS.dashboardDistributions,
    () => false,
    { enabled: !localMode }
  );
  // Sprint 0131 (coordinator item from 0117): the source audit reads every audited collection of the account,
  // so it is read only after the user runs it; opening the dashboard shows the last result (page copy
  // "provenance-audit") and its time.
  const [auditRequested, setAuditRequested] = useState(false);
  const auditState = useApiResource<unknown>(
    dashboardProvenanceAuditPath(),
    () => false,
    { cachePolicy: "network-only", enabled: auditRequested }
  );
  const auditCopySession = usePageCopySession();
  const [auditCopy, setAuditCopy] = useState<PageCopy | null>(null);
  useEffect(() => {
    if (!auditCopySession.session) return;
    let live = true;
    void auditCopySession.session.readPageCopy("provenance-audit", "main").then((copy) => { if (live && copy) setAuditCopy((current) => current ?? copy); }).catch(() => undefined);
    return () => { live = false; };
  }, [auditCopySession.session]);
  const freshAudit = auditRequested && (auditState.kind === "success" || auditState.kind === "empty") ? auditState.data : null;
  useEffect(() => {
    if (freshAudit === null) return;
    setAuditCopy({ data: freshAudit, syncedAt: new Date().toISOString() });
    void auditCopySession.whenReady().then((ready) => ready?.savePageCopy("provenance-audit", "main", freshAudit)).catch(() => undefined);
  }, [freshAudit]);
  const shownAudit = freshAudit ?? auditCopy?.data ?? null;
  const auditAsOf = freshAudit === null ? auditCopy?.syncedAt ?? null : null;
  /**
   * Sprint 0088: the six reads fire together and normally land within 20ms of
   * each other, so nothing here is worth staggering. What was missing is an
   * end: a read that never answers left the whole screen blank, because the
   * first paint waited on `aggregate` alone. Past the ceiling each unfinished
   * read says so and can be retried, and the sections that did land render.
   */
  const coverageOverdue = useLoadingDeadline(!localMode && aggregateState.kind === "loading", String(retryCount));
  const landed =
    aggregateState.kind !== "loading" ||
    [summaryState, opportunitiesState, gapsState, distributionsState]
      .some((state) => state.kind !== "loading");

  function refreshAll() {
    setRecomputeError(null);
    if (localMode) local.refresh();
    setAuditError(null);
    // Restarts the coverage ceiling: a retry must not inherit the timeout the
    // user just dismissed.
    setRetryCount((value) => value + 1);
    aggregateState.refresh();
    summaryState.refresh();
    opportunitiesState.refresh();
    gapsState.refresh();
    distributionsState.refresh();
    if (auditRequested) auditState.refresh();
  }

  async function recomputeDashboardOpportunities() {
    if (offline) return;
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
    if (offline) return;
    setAuditing(true);
    setAuditRunResult(null);
    setAuditError(null);

    try {
      const result = await client.post<unknown>(
        dashboardProvenanceAuditRunPath()
      );

      if (result.success) {
        setAuditRunResult(dashboardAuditRunToView(result.data));
        if (auditRequested) auditState.refresh();
        else setAuditRequested(true);
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
            (localMode && local.freshness.refreshing) ||
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
      {localMode ? (
        <>
          {offline ? <OfflineNotice lastSyncedAt={local.freshness.lastSyncedAt} /> : null}
          {local.freshness.failure ? (
            <ErrorState message={local.freshness.failure} title="服务器连不上" />
          ) : null}
          {local.error ? <ErrorState message={local.error} /> : null}
          {!local.freshness.failure && !local.error && !localSections ? <LoadingState /> : null}
          {!offline && auditRequested && auditState.kind === "failure" ? (
            <ErrorState message={auditState.error.message} title="来源审计不可用" />
          ) : null}
          {localSections && isEmptyDashboard(localSections.aggregate) ? (
            <EmptyState
              message="先补一位联系人或一项待办，仪表盘会开始显示关系覆盖。"
              title="暂无关系数据"
            />
          ) : null}
          {localSections && !isEmptyDashboard(localSections.aggregate) ? (
            <DashboardContent
              aggregate={localSections.aggregate}
              audit={shownAudit}
              auditAsOf={auditAsOf}
              auditError={auditError}
              auditRunResult={auditRunResult}
              auditing={auditing}
              coverageState="ready"
              distributions={localSections.distributions}
              gaps={localSections.gaps}
              offline={offline}
              onRetryCoverage={refreshAll}
              onRunAudit={runDashboardAudit}
              onRecompute={recomputeDashboardOpportunities}
              opportunities={localSections.opportunities}
              recomputeError={recomputeError}
              recomputeResult={recomputeResult}
              recomputing={recomputing}
              summary={localSections.summary}
            />
          ) : null}
        </>
      ) : null}
      {!localMode && !landed ? <LoadingState /> : null}
      {!localMode && aggregateState.kind === "offline" ? (
        <ErrorState message={aggregateState.error.message} title="服务器连不上" />
      ) : null}
      {!localMode && aggregateState.kind === "failure" ? (
        <ErrorState message={aggregateState.error.message} />
      ) : null}
      {!localMode && auditRequested && auditState.kind === "failure" ? (
        <ErrorState message={auditState.error.message} title="来源审计不可用" />
      ) : null}
      {!localMode && aggregateState.kind === "empty" ? (
        <EmptyState
          message="先补一位联系人或一项待办，仪表盘会开始显示关系覆盖。"
          title="暂无关系数据"
        />
      ) : null}
      {!localMode && landed && aggregateState.kind !== "empty" ? (
        <DashboardContent
          offline={false}
          aggregate={aggregateState.kind === "success" ? aggregateState.data : null}
          coverageState={
            aggregateState.kind === "success"
              ? "ready"
              : coverageOverdue
                ? "overdue"
                : aggregateState.kind === "loading"
                  ? "loading"
                  : "unavailable"
          }
          onRetryCoverage={refreshAll}
          audit={shownAudit}
          auditAsOf={auditAsOf}
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

/** The dashboard's own "nothing yet" rule: every metric is zero. */
function isEmptyDashboard(aggregate: unknown): boolean {
  return dashboardToView({ aggregate }).metrics.every((item) => item.value === "0");
}

/** Sprint 0088: the coverage card states its own outcome, so one unfinished read cannot blank the page. */
type CoverageState = "ready" | "loading" | "overdue" | "unavailable";

function DashboardContent({
  aggregate,
  audit,
  auditAsOf = null,
  auditError,
  auditRunResult,
  auditing,
  coverageState,
  distributions,
  gaps,
  onRetryCoverage,
  onRunAudit,
  onRecompute,
  offline,
  opportunities,
  recomputeError,
  recomputeResult,
  recomputing,
  summary
}: {
  aggregate: unknown;
  audit: unknown;
  /** Sprint 0131: when the audit shown is the last run kept on the device, when it ran. */
  auditAsOf?: string | null;
  coverageState: CoverageState;
  onRetryCoverage: () => void;
  auditError: string | null;
  auditRunResult: DashboardAuditRunView | null;
  auditing: boolean;
  distributions: unknown;
  gaps: unknown;
  onRunAudit: () => void;
  onRecompute: () => void;
  /** Sprint 0117: the device copy is shown offline; recomputing and the audit run need the server. */
  offline: boolean;
  opportunities: unknown;
  recomputeError: string | null;
  recomputeResult: DashboardOpportunitiesRecomputeView | null;
  recomputing: boolean;
  summary: unknown;
}) {
  const { colors, styles } = useStyles();
  const router = useRouter();
  const locale = useOrbitLocale();
  const needsNetwork = locale.t("sync.needsNetwork");
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
        {coverageState === "ready" ? (
          <>
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
          </>
        ) : (
          // Never a 0% dial: not having read the coverage is not the same as
          // having none, which is the rule 0087 settled for the task list.
          <View style={styles.coverageState}>
            <Text style={styles.bodyText}>
              {coverageState === "loading" ? "正在读取关系覆盖" : coverageState === "overdue" ? "读取关系覆盖超时" : "关系覆盖暂时不可用"}
            </Text>
            {coverageState === "loading" ? null : (
              <Pressable
                accessibilityRole="button"
                onPress={onRetryCoverage}
                style={({ pressed }) => [styles.recomputeButton, pressed ? styles.pressed : null]}
              >
                <Ionicons color={colors.onAccent} name="refresh-outline" size={17} />
                <Text style={styles.recomputeButtonText}>重试</Text>
              </Pressable>
            )}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: recomputing || offline }}
          disabled={recomputing || offline}
          onPress={onRecompute}
          style={({ pressed }) => [
            styles.recomputeButton,
            recomputing || offline ? styles.disabled : null,
            pressed ? styles.pressed : null
          ]}
        >
          <Ionicons color={colors.onAccent} name="refresh-outline" size={17} />
          <Text style={styles.recomputeButtonText}>
            {recomputing ? "计算中" : offline ? `重新计算机会 · ${needsNetwork}` : "重新计算机会"}
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

      {!auditView && !offline ? (
        <DataCard detail="按需运行" title="来源一致性审计">
          <Text style={styles.bodyText}>审计会检查各类记录的来源是否完整。点「运行来源审计」后才会读取，结果保存在这台设备上。</Text>
          {auditError ? <Text style={styles.errorText}>{auditError}</Text> : null}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: auditing }} disabled={auditing} onPress={onRunAudit}
            style={({ pressed }) => [styles.recomputeButton, auditing ? styles.disabled : null, pressed ? styles.pressed : null]}>
            <Ionicons color={colors.onAccent} name="refresh-outline" size={17} />
            <Text style={styles.recomputeButtonText}>{auditing ? "审计中" : "运行来源审计"}</Text>
          </Pressable>
        </DataCard>
      ) : null}
      {auditView ? (
        <DashboardAuditCard
          asOf={auditAsOf}
          audit={auditView}
          auditError={auditError}
          auditRunResult={auditRunResult}
          auditing={auditing}
          offline={offline}
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
  const { styles } = useStyles();
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
  asOf = null,
  audit,
  auditError,
  auditRunResult,
  auditing,
  offline,
  onRunAudit
}: {
  asOf?: string | null;
  audit: DashboardAuditView;
  auditError: string | null;
  auditRunResult: DashboardAuditRunView | null;
  auditing: boolean;
  offline: boolean;
  onRunAudit: () => void;
}) {
  const { colors, styles } = useStyles();
  const locale = useOrbitLocale();
  const collections = audit.collections.slice(0, 4);
  const findings = audit.findings.slice(0, 2);

  return (
    <DataCard
      detail={`${audit.statusLabel} · ${audit.coverageLabel}`}
      title={audit.title || "来源一致性审计"}
    >
      <Text style={styles.bodyText}>{audit.summary}</Text>
      {asOf ? <Text style={styles.metaText}>上次审计：{new Date(asOf).toLocaleString(locale.language === "en" ? "en-US" : locale.language === "ja" ? "ja-JP" : "zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text> : null}
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
        accessibilityState={{ disabled: auditing || offline }}
        disabled={auditing || offline}
        onPress={onRunAudit}
        style={({ pressed }) => [
          styles.recomputeButton,
          auditing || offline ? styles.disabled : null,
          pressed ? styles.pressed : null
        ]}
      >
        <Ionicons color={colors.onAccent} name="refresh-outline" size={17} />
        <Text style={styles.recomputeButtonText}>
          {auditing ? "审计中" : offline ? `运行来源审计 · ${locale.t("sync.needsNetwork")}` : "运行来源审计"}
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
  const { styles } = useStyles();
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
  const { styles } = useStyles();
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
  const { colors, styles } = useStyles();
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
  const { styles } = useStyles();
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
  const { styles } = useStyles();
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
  const { styles } = useStyles();
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
  const { styles } = useStyles();
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

const useStyles = createThemedStyles((colors) => StyleSheet.create({
  barFill: {
    backgroundColor: colors.sky,
    borderRadius: radius.pill,
    height: "100%"
  },
  barRow: { gap: spacing.sm },
  barTrack: {
    backgroundColor: colors.skySoft,
    borderRadius: radius.pill,
    height: 8,
    overflow: "hidden"
  },
  bodyText: {
    ...textStyles.body,
    color: colors.text
  },
  coverageState: {
    alignItems: "flex-start",
    gap: spacing.sm
  },
  auditResult: {
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    gap: spacing.xs,
    padding: spacing.md
  },
  callout: {
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    flexDirection: "row",
    gap: spacing.sm,
    padding: spacing.md
  },
  calloutText: {
    ...textStyles.small,
    color: colors.text,
    flex: 1
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
    ...textStyles.small,
    color: colors.text2,
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
  disabled: { opacity: 0.58 },
  errorText: {
    ...textStyles.small,
    color: colors.rose
  },
  inlineSection: { gap: spacing.sm },
  itemTitle: {
    ...textStyles.listTitle,
    color: colors.ink,
    flex: 1
  },
  listRow: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: spacing.xs,
    paddingTop: spacing.md
  },
  listStack: { gap: spacing.md },
  metaText: {
    ...textStyles.small,
    color: colors.text3
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
    ...textStyles.caption,
    color: colors.text3,
    fontWeight: "600"
  },
  metricValue: {
    ...textStyles.title,
    color: colors.ink
  },
  okBadge: {
    ...textStyles.caption,
    backgroundColor: colors.liveSoft,
    borderRadius: radius.pill,
    color: colors.live,
    fontWeight: "600",
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
  pressed: { opacity: 0.72 },
  rowTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between"
  },
  recomputeButton: {
    ...createControlStyles(colors).primaryButton,
    flexDirection: "row",
    gap: spacing.xs
  },
  recomputeButtonText: { ...createControlStyles(colors).primaryButtonText },
  recomputeStatus: {
    ...textStyles.small,
    color: colors.live,
    fontWeight: "600"
  },
  scoreBadge: {
    backgroundColor: colors.amberSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm
  },
  scoreBadgeText: {
    ...textStyles.small,
    color: colors.amber,
    fontWeight: "600"
  },
  scoreCopy: {
    flex: 1,
    gap: spacing.xs
  },
  scoreDial: {
    alignItems: "baseline",
    backgroundColor: colors.surface2,
    borderRadius: radius.card,
    flexDirection: "row",
    minWidth: 94,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg
  },
  scoreNumber: {
    ...textStyles.pageTitle,
    color: colors.accent
  },
  scoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.lg
  },
  scoreSuffix: {
    ...textStyles.small,
    color: colors.text3
  },
  sectionLabel: {
    ...textStyles.small,
    color: colors.text2,
    fontWeight: "600"
  },
  severityBadge: {
    ...textStyles.caption,
    backgroundColor: colors.roseSoft,
    borderRadius: radius.pill,
    color: colors.rose,
    fontWeight: "600",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  }
}));
