import {
  dashboardToView,
  type DashboardActivityView,
  type DashboardGapView,
  type DashboardIndustryView,
  type DashboardPriorityView,
  type DashboardStrengthView,
  type DashboardValueTypeView,
  type DashboardViewInput
} from "./dashboard";

export interface ContactsDashboardOverviewItem {
  detail: string;
  id: string;
  label: string;
  value: string;
}

export interface ContactsDashboardDiagnosisView {
  detail: string;
  label: string;
  scoreLabel: string;
}

export interface ContactsDashboardMapView {
  centerLabel: string;
  centerValue: string;
  rings: DashboardStrengthView[];
}

export interface ContactsDashboardView {
  diagnosis: ContactsDashboardDiagnosisView;
  gaps: DashboardGapView[];
  industries: DashboardIndustryView[];
  map: ContactsDashboardMapView;
  overview: ContactsDashboardOverviewItem[];
  priority: DashboardPriorityView | null;
  recentActivity: DashboardActivityView[];
  subtitle: string;
  summary: string;
  title: string;
  valueTypes: DashboardValueTypeView[];
}

const OVERVIEW_COPY = {
  "dormant-contacts": {
    detail: "超过一段时间没互动",
    label: "沉睡关系"
  },
  "high-value": {
    detail: "可优先推进",
    label: "高价值"
  },
  "pending-followups": {
    detail: "需要复核下一步",
    label: "待跟进"
  },
  "relationship-assets": {
    detail: "已确认联系人",
    label: "总人脉"
  }
} as const;

const OVERVIEW_ORDER = [
  "relationship-assets",
  "high-value",
  "pending-followups",
  "dormant-contacts"
] as const;

const RING_LABELS: Record<string, string> = {
  strong: "核心圈 · 强",
  warm: "进行圈 · 中",
  weak: "外圈 · 弱/待确认"
};

function metricValue(
  metrics: { id: string; value: string }[],
  id: string
): string {
  return metrics.find((metric) => metric.id === id)?.value ?? "0";
}

function overviewItems(
  metrics: { id: string; value: string }[]
): ContactsDashboardOverviewItem[] {
  return OVERVIEW_ORDER.map((id) => ({
    detail: OVERVIEW_COPY[id].detail,
    id,
    label: OVERVIEW_COPY[id].label,
    value: metricValue(metrics, id)
  }));
}

function mapRings(strengths: DashboardStrengthView[]): DashboardStrengthView[] {
  return strengths.map((ring) => ({
    ...ring,
    label: RING_LABELS[ring.id] ?? ring.label
  }));
}

export function contactsDashboardToView(
  input: DashboardViewInput
): ContactsDashboardView {
  const dashboard = dashboardToView(input);

  return {
    diagnosis: {
      detail: dashboard.nextAction,
      label: "当前诊断",
      scoreLabel: dashboard.coverageScoreLabel
    },
    gaps: dashboard.gaps,
    industries: dashboard.industries,
    map: {
      centerLabel: "已分类",
      centerValue: metricValue(dashboard.metrics, "relationship-assets"),
      rings: mapRings(dashboard.strengths)
    },
    overview: overviewItems(dashboard.metrics),
    priority: dashboard.priority,
    recentActivity: dashboard.recentActivity,
    subtitle: "你的关系资产 · 今天更新",
    summary: dashboard.summary,
    title: "人脉表盘",
    valueTypes: dashboard.valueTypes
  };
}
