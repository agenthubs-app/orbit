"use client";

import { AccountTopNav } from "../orbit-account-shell";
import { useOrbitLanguage } from "../orbit-language-context";
import { Icon } from "../orbit-reference-primitives";
import type {
  OrbitDashboardActivityView,
  OrbitDashboardCoverageView,
  OrbitDashboardIndustryView,
  OrbitDashboardMetricView,
  OrbitDashboardPriorityView,
  OrbitDashboardViewModel,
} from "./compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-view-model-adapter";

type Translate = (copy: { en: string; zh: string }) => string;

interface OrbitRealDashboardProps {
  viewModel: OrbitDashboardViewModel;
}

const dashboardStyles = `
.orbit-dashboard-page {
  background: var(--bg);
  color: var(--ink);
  min-height: 100vh;
}

.orbit-dashboard-main {
  margin: 0 auto;
  max-width: 1120px;
  padding: 56px 24px 96px;
}

.orbit-dashboard-hero {
  align-items: end;
  display: grid;
  gap: 28px;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  margin-bottom: 28px;
}

.orbit-dashboard-title {
  font-family: var(--ff-tight);
  font-size: 34px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1.1;
  margin: 0;
}

.orbit-dashboard-subtitle {
  color: var(--text-3);
  font-size: 15px;
  line-height: 1.55;
  margin: 12px 0 0;
  max-width: 680px;
}

.orbit-dashboard-score {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
  display: grid;
  gap: 14px;
  padding: 18px;
}

.orbit-dashboard-score-row {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 18px;
}

.orbit-dashboard-score-value {
  font-family: var(--ff-tight);
  font-size: 44px;
  font-weight: 780;
  letter-spacing: 0;
  line-height: 1;
}

.orbit-dashboard-progress {
  background: var(--surface-2);
  border-radius: 999px;
  height: 10px;
  overflow: hidden;
}

.orbit-dashboard-progress span {
  background: linear-gradient(90deg, var(--accent), var(--live));
  border-radius: inherit;
  display: block;
  height: 100%;
}

.orbit-dashboard-grid {
  display: grid;
  gap: 18px;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.orbit-dashboard-source-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.orbit-dashboard-card,
.orbit-dashboard-panel {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: var(--shadow-soft);
}

.orbit-dashboard-card {
  display: grid;
  gap: 6px;
  min-height: 112px;
  padding: 17px;
}

.orbit-dashboard-card span,
.orbit-dashboard-kicker {
  color: var(--text-3);
  font-size: 12px;
  font-weight: 650;
}

.orbit-dashboard-card strong {
  font-family: var(--ff-tight);
  font-size: 30px;
  font-weight: 760;
  letter-spacing: 0;
  line-height: 1;
}

.orbit-dashboard-card p,
.orbit-dashboard-panel p {
  color: var(--text-3);
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}

.orbit-dashboard-section-grid {
  display: grid;
  gap: 20px;
  grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
  margin-top: 22px;
}

.orbit-dashboard-panel {
  min-width: 0;
  padding: 22px;
}

.orbit-dashboard-panel h2 {
  font-family: var(--ff-tight);
  font-size: 22px;
  font-weight: 740;
  letter-spacing: 0;
  line-height: 1.15;
  margin: 4px 0 14px;
}

.orbit-dashboard-priority {
  align-items: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: grid;
  gap: 14px;
  grid-template-columns: minmax(0, 1fr) auto;
  margin-top: 16px;
  padding: 16px;
}

.orbit-dashboard-priority h3,
.orbit-dashboard-list h3 {
  font-size: 16px;
  font-weight: 720;
  line-height: 1.3;
  margin: 0;
}

.orbit-dashboard-score-pill {
  align-items: center;
  background: var(--accent-soft);
  border-radius: 999px;
  color: var(--accent);
  display: inline-flex;
  font-size: 13px;
  font-weight: 760;
  height: 34px;
  justify-content: center;
  min-width: 54px;
  padding: 0 12px;
}

.orbit-dashboard-list {
  display: grid;
  gap: 12px;
}

.orbit-dashboard-list article {
  border: 1px solid var(--border);
  border-radius: 8px;
  display: grid;
  gap: 8px;
  padding: 14px;
}

.orbit-dashboard-row {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  min-width: 0;
}

.orbit-dashboard-row h3,
.orbit-dashboard-row p {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.orbit-dashboard-chip {
  align-items: center;
  background: var(--surface-2);
  border-radius: 999px;
  color: var(--text-3);
  display: inline-flex;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 650;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
}

.orbit-dashboard-industries {
  display: grid;
  gap: 12px;
}

.orbit-dashboard-industry-line {
  display: grid;
  gap: 8px;
}

.orbit-dashboard-industry-track {
  background: var(--surface-2);
  border-radius: 999px;
  height: 8px;
  overflow: hidden;
}

.orbit-dashboard-industry-track span {
  background: var(--sky);
  border-radius: inherit;
  display: block;
  height: 100%;
}

.orbit-dashboard-activity {
  display: grid;
  gap: 12px;
}

.orbit-dashboard-activity article {
  align-items: start;
  display: grid;
  gap: 10px;
  grid-template-columns: 34px minmax(0, 1fr);
}

.orbit-dashboard-activity-icon {
  align-items: center;
  background: var(--surface-2);
  border-radius: 8px;
  color: var(--accent);
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;
}

@media (max-width: 900px) {
  .orbit-dashboard-main {
    padding: 36px 18px 84px;
  }

  .orbit-dashboard-hero,
  .orbit-dashboard-section-grid {
    grid-template-columns: 1fr;
  }

  .orbit-dashboard-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 560px) {
  .orbit-dashboard-main {
    padding: 28px 18px 72px;
  }

  .orbit-dashboard-title {
    font-size: 28px;
  }

  .orbit-dashboard-grid {
    grid-template-columns: 1fr;
  }

  .orbit-dashboard-source-grid {
    grid-template-columns: 1fr;
  }

  .orbit-dashboard-priority {
    align-items: start;
    grid-template-columns: 1fr;
  }
}
`;

function formatPercent(value: number) {
  return `${Math.max(0, Math.min(100, Math.round(value)))}%`;
}

function dashboardMetricLabel(
  metric: OrbitDashboardMetricView,
  t: Translate,
): string {
  const labels: Record<string, { en: string; zh: string }> = {
    "collections-checked": { en: "Checked", zh: "已检查" },
    "dormant-contacts": { en: "Dormant", zh: "沉睡联系人" },
    "evidence-backed": { en: "Backed", zh: "有来源" },
    "high-value": { en: "High-value", zh: "高价值关系" },
    "new-contacts": { en: "New contacts", zh: "新增人脉" },
    "open-warnings": { en: "Warnings", zh: "警告" },
    "pending-followups": { en: "Follow-ups", zh: "待跟进" },
    "relationship-assets": { en: "Relationship assets", zh: "关系资产" },
  };

  return labels[metric.id] ? t(labels[metric.id]) : metric.label;
}

function dashboardMetricCaption(
  metric: OrbitDashboardMetricView,
  t: Translate,
): string {
  const captions: Record<string, { en: string; zh: string }> = {
    "collections-checked": { en: "Collections checked", zh: "已检查集合" },
    "dormant-contacts": { en: "Needs reactivation", zh: "需要重新激活" },
    "evidence-backed": { en: "Relationships with sources", zh: "带来源的关系" },
    "high-value": { en: "Source-backed signal", zh: "来源支持的信号" },
    "new-contacts": { en: "Source-backed signal", zh: "来源支持的信号" },
    "open-warnings": { en: "Open source warnings", zh: "来源警告" },
    "pending-followups": { en: "Needs review", zh: "需要复核" },
    "relationship-assets": { en: "Evidence-backed network", zh: "有来源网络" },
  };

  return captions[metric.id] ? t(captions[metric.id]) : metric.caption;
}

function MetricCard({
  metric,
  t,
}: {
  metric: OrbitDashboardMetricView;
  t: Translate;
}) {
  return (
    <article className="orbit-dashboard-card">
      <span>{dashboardMetricLabel(metric, t)}</span>
      <strong>{metric.value}</strong>
      <p>{dashboardMetricCaption(metric, t)}</p>
    </article>
  );
}

function PriorityPanel({
  priority,
  t,
}: {
  priority: OrbitDashboardPriorityView | null;
  t: Translate;
}) {
  return (
    <section className="orbit-dashboard-panel">
      <span className="orbit-dashboard-kicker">
        {t({ en: "Current Priority", zh: "当前优先级" })}
      </span>
      <h2>{t({ en: "Relationship health", zh: "关系健康" })}</h2>
      {priority ? (
        <div className="orbit-dashboard-priority">
          <div>
            <h3>{priority.title}</h3>
            <p>
              {priority.contactName} · {priority.organization}
            </p>
            <p>{priority.action}</p>
          </div>
          <span className="orbit-dashboard-score-pill">{priority.score}</span>
          <span className="orbit-dashboard-chip">
            <Icon name="clock" size={14} />
            {priority.dueLabel}
          </span>
        </div>
      ) : (
        <p>{t({ en: "No urgent relationship action is currently queued.", zh: "当前没有紧急关系动作。" })}</p>
      )}
    </section>
  );
}

function GapCard({ gap }: { gap: OrbitDashboardCoverageView }) {
  return (
    <article>
      <div className="orbit-dashboard-row">
        <h3>{gap.label}</h3>
        <span className="orbit-dashboard-chip">{gap.severity}</span>
      </div>
      <p>
        {gap.currentCount}/{gap.targetCount}
      </p>
      <p>{gap.action}</p>
    </article>
  );
}

function CoveragePanel({
  gaps,
  t,
}: {
  gaps: readonly OrbitDashboardCoverageView[];
  t: Translate;
}) {
  return (
    <section className="orbit-dashboard-panel">
      <span className="orbit-dashboard-kicker">
        {t({ en: "Coverage", zh: "覆盖缺口" })}
      </span>
      <h2>{t({ en: "Where to build next", zh: "下一步补哪里" })}</h2>
      <div className="orbit-dashboard-list">
        {gaps.map((gap) => (
          <GapCard gap={gap} key={gap.label} />
        ))}
      </div>
    </section>
  );
}

function IndustryLine({ industry }: { industry: OrbitDashboardIndustryView }) {
  return (
    <div className="orbit-dashboard-industry-line">
      <div className="orbit-dashboard-row">
        <p>{industry.label}</p>
        <span className="orbit-dashboard-chip">
          {industry.count} · {industry.percentage}%
        </span>
      </div>
      <div className="orbit-dashboard-industry-track">
        <span style={{ width: formatPercent(industry.percentage) }} />
      </div>
      <p>{industry.organizations.slice(0, 3).join(", ")}</p>
    </div>
  );
}

function IndustryPanel({
  industries,
  t,
}: {
  industries: readonly OrbitDashboardIndustryView[];
  t: Translate;
}) {
  return (
    <section className="orbit-dashboard-panel">
      <span className="orbit-dashboard-kicker">
        {t({ en: "Network Mix", zh: "网络分布" })}
      </span>
      <h2>{t({ en: "Industry concentration", zh: "行业集中度" })}</h2>
      <div className="orbit-dashboard-industries">
        {industries.map((industry) => (
          <IndustryLine industry={industry} key={industry.label} />
        ))}
      </div>
    </section>
  );
}

function ActivityIcon({ type }: { type: string }) {
  const icon = type === "followup_due" ? "clock" : type === "new_contact" ? "user" : "sparkle";

  return (
    <span className="orbit-dashboard-activity-icon">
      <Icon name={icon} size={17} />
    </span>
  );
}

function RecentActivityPanel({
  activity,
  t,
}: {
  activity: readonly OrbitDashboardActivityView[];
  t: Translate;
}) {
  return (
    <section className="orbit-dashboard-panel">
      <span className="orbit-dashboard-kicker">
        {t({ en: "Recent Movement", zh: "最近动态" })}
      </span>
      <h2>{t({ en: "What changed", zh: "发生了什么" })}</h2>
      <div className="orbit-dashboard-activity">
        {activity.map((item) => (
          <article key={item.id}>
            <ActivityIcon type={item.type} />
            <div>
              <h3>{item.label}</h3>
              <p>
                {item.sourceLabel} · {item.occurredAt}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function OrbitRealDashboard({ viewModel }: OrbitRealDashboardProps) {
  const { t } = useOrbitLanguage();
  const progressWidth = formatPercent(viewModel.coverageScore);

  return (
    <div className="orbit-dashboard-page" data-orbit-real-page="dashboard">
      <style>{dashboardStyles}</style>
      <AccountTopNav active="me" />
      <main className="orbit-dashboard-main">
        <section className="orbit-dashboard-hero">
          <div>
            <span className="orbit-dashboard-kicker">
              {t({ en: "Relationship Dashboard", zh: "关系仪表盘" })}
            </span>
            <h1 className="orbit-dashboard-title">
              {t({ en: "Keep the right relationships moving.", zh: "让关键关系持续推进。" })}
            </h1>
            <p className="orbit-dashboard-subtitle">{viewModel.nextAction}</p>
          </div>
          <aside className="orbit-dashboard-score" aria-label={t({ en: "Network coverage score", zh: "网络覆盖评分" })}>
            <div className="orbit-dashboard-score-row">
              <div>
                <span className="orbit-dashboard-kicker">
                  {t({ en: "Coverage Score", zh: "覆盖评分" })}
                </span>
                <p>{viewModel.currentGoal}</p>
              </div>
              <strong className="orbit-dashboard-score-value">
                {viewModel.coverageScore}
              </strong>
            </div>
            <div className="orbit-dashboard-progress">
              <span style={{ width: progressWidth }} />
            </div>
          </aside>
        </section>

        <section className="orbit-dashboard-grid" aria-label={t({ en: "Dashboard metrics", zh: "仪表盘指标" })}>
          {viewModel.metrics.map((metric) => (
            <MetricCard key={metric.id} metric={metric} t={t} />
          ))}
        </section>

        <section className="orbit-dashboard-section-grid">
          <PriorityPanel priority={viewModel.priority} t={t} />
          <section className="orbit-dashboard-panel">
            <span className="orbit-dashboard-kicker">
              {t({ en: "Source Readiness", zh: "来源状态" })}
            </span>
            <h2>{t({ en: "Review state", zh: "复核状态" })}</h2>
            <div className="orbit-dashboard-grid orbit-dashboard-source-grid">
              <MetricCard
                metric={{
                  caption: t({ en: "Relationships with sources", zh: "带来源的关系" }),
                  id: "evidence-backed",
                  label: t({ en: "Backed", zh: "有来源" }),
                  value: viewModel.totals.evidenceBackedRelationships,
                }}
                t={t}
              />
              <MetricCard
                metric={{
                  caption: t({ en: "Collections checked", zh: "已检查集合" }),
                  id: "collections-checked",
                  label: t({ en: "Checked", zh: "已检查" }),
                  value: viewModel.audit.checkedCollections,
                }}
                t={t}
              />
              <MetricCard
                metric={{
                  caption: t({ en: "Open source warnings", zh: "来源警告" }),
                  id: "open-warnings",
                  label: t({ en: "Warnings", zh: "警告" }),
                  value: viewModel.audit.openWarnings,
                }}
                t={t}
              />
            </div>
          </section>
        </section>

        <section className="orbit-dashboard-section-grid">
          <CoveragePanel gaps={viewModel.topGaps} t={t} />
          <IndustryPanel industries={viewModel.industries} t={t} />
        </section>

        <section className="orbit-dashboard-section-grid">
          <RecentActivityPanel activity={viewModel.recentActivity} t={t} />
          <section className="orbit-dashboard-panel">
            <span className="orbit-dashboard-kicker">
              {t({ en: "Assets", zh: "关系资产" })}
            </span>
            <h2>{t({ en: "Current workspace", zh: "当前工作区" })}</h2>
            <div className="orbit-dashboard-list">
              <article>
                <div className="orbit-dashboard-row">
                  <h3>{t({ en: "Contacts", zh: "联系人" })}</h3>
                  <span className="orbit-dashboard-chip">{viewModel.totals.contacts}</span>
                </div>
              </article>
              <article>
                <div className="orbit-dashboard-row">
                  <h3>{t({ en: "Connections", zh: "关系" })}</h3>
                  <span className="orbit-dashboard-chip">{viewModel.totals.connections}</span>
                </div>
              </article>
              <article>
                <div className="orbit-dashboard-row">
                  <h3>{t({ en: "Events represented", zh: "关联活动" })}</h3>
                  <span className="orbit-dashboard-chip">{viewModel.totals.eventsRepresented}</span>
                </div>
              </article>
            </div>
          </section>
        </section>
      </main>
    </div>
  );
}
