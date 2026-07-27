/**
 * 日程安排页真实 UI。
 *
 * 从 `page.tsx` 抽出的展示层：page.tsx 只负责组合 route view model，渲染逻辑
 * 都在这里，对齐仓库里其余 `orbit-real-*` 组件的分层方式。
 */
import { AccountTopNav } from "../orbit-account-shell";
import { Icon } from "../orbit-reference-primitives";
import { ScheduleArrangementCard } from "../today/orbit-today-arrangements";
import type {
  AppScheduleArrangementViewModel,
  AppScheduleRouteStateViewModel,
  AppScheduleRouteViewModel,
} from "./schedule-route-view-model";

// ScheduleArrangementCard used to be defined here. It now lives in
// today/orbit-today-arrangements.tsx so this page and the merged Today
// workspace's "可复核安排" section render from the exact same source — see
// T1 of the today-schedule merge plan.

function ScheduleMobileConstraints() {
  return (
    <style data-orbit-schedule-mobile-constraints>{`
      [data-orbit-route="app-schedule-route"] {
        overflow-x: clip;
      }

      [data-orbit-route="app-schedule-route"] .orbit-schedule-scroll,
      [data-orbit-route="app-schedule-route"] .orbit-schedule-grid,
      [data-orbit-route="app-schedule-route"] [data-orbit-schedule-arrangements],
      [data-orbit-route="app-schedule-route"] .orbit-schedule-arrangement-card {
        min-width: 0;
        max-width: 100%;
      }

      [data-orbit-route="app-schedule-route"] .orbit-schedule-arrangement-card {
        overflow: hidden;
      }

      [data-orbit-route="app-schedule-route"] .orbit-schedule-arrangement-title,
      [data-orbit-route="app-schedule-route"] .orbit-schedule-arrangement-subtitle,
      [data-orbit-route="app-schedule-route"] .orbit-schedule-arrangement-copy,
      [data-orbit-route="app-schedule-route"] .orbit-schedule-meta-line,
      [data-orbit-route="app-schedule-route"] .orbit-schedule-arrangement-action {
        overflow-wrap: anywhere;
      }

      [data-orbit-route="app-schedule-route"] .orbit-schedule-meta-line {
        align-items: flex-start !important;
      }

      @media (max-width: 900px) {
        [data-orbit-route="app-schedule-route"] .orbit-schedule-grid {
          grid-template-columns: minmax(0, 1fr) !important;
        }
      }

      @media (max-width: 760px) {
        [data-orbit-route="app-schedule-route"] .orbit-schedule-scroll {
          padding: 22px 16px 64px !important;
        }

        [data-orbit-route="app-schedule-route"] .orbit-schedule-header {
          align-items: flex-start !important;
          flex-direction: column;
          gap: 14px;
        }

        [data-orbit-route="app-schedule-route"] .orbit-schedule-add-source {
          align-self: flex-start;
          max-width: 100%;
        }

        [data-orbit-route="app-schedule-route"] .orbit-schedule-card-head {
          gap: 10px !important;
        }

        [data-orbit-route="app-schedule-route"] .orbit-schedule-status {
          margin-left: auto;
          max-width: 92px;
          white-space: normal;
        }
      }
    `}</style>
  );
}

function AppScheduleSuccessView({
  arrangements,
  evidenceIds,
  summary,
}: {
  arrangements: readonly AppScheduleArrangementViewModel[];
  evidenceIds: readonly string[];
  summary: string;
}) {
  return (
    <main
      className="orbit-personal-page"
      data-orbit-real-page="schedule"
      data-orbit-route="app-schedule-route"
    >
      <div style={{ background: "var(--bg)", minHeight: "100dvh" }}>
        <AccountTopNav active="schedule" />
        <ScheduleMobileConstraints />
        <div
          className="scroll orbit-schedule-scroll"
          data-appscroll
          style={{
            margin: "0 auto",
            maxWidth: 1180,
            padding: "36px 40px 90px",
          }}
        >
          <div
            className="orbit-schedule-header"
            style={{
              alignItems: "flex-end",
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 24,
            }}
          >
            <div>
              <div className="eyebrow">日程安排</div>
              <h1 className="h-display" style={{ margin: "2px 0 0" }}>
                关系安排
              </h1>
              <div
                style={{
                  color: "var(--text-3)",
                  fontSize: 14,
                  marginTop: 4,
                }}
              >
                {summary}
              </div>
            </div>
            <a
              className="btn btn-ghost orbit-schedule-add-source"
              href="/app/contacts/new"
            >
              <Icon name="plus" size={16} />
              添加来源
            </a>
          </div>
          <div
            className="orbit-schedule-grid"
            style={{
              alignItems: "start",
              display: "grid",
              gap: 24,
              gridTemplateColumns: "minmax(0,1fr) minmax(320px,420px)",
            }}
          >
            <section
              className="card"
              data-orbit-schedule-context="source-backed"
              style={{ display: "grid", gap: 16, padding: 22 }}
            >
              <div style={{ alignItems: "center", display: "flex", gap: 12 }}>
                <span
                  style={{
                    alignItems: "center",
                    background: "var(--accent-softer)",
                    borderRadius: 14,
                    color: "var(--accent)",
                    display: "inline-flex",
                    height: 44,
                    justifyContent: "center",
                    width: 44,
                  }}
                >
                  <Icon name="calendar" size={21} />
                </span>
                <div>
                  <h2 className="h-title" style={{ margin: 0 }}>
                    今日要判断的关系上下文
                  </h2>
                  <p
                    style={{
                      color: "var(--text-3)",
                      fontSize: 13,
                      lineHeight: 1.55,
                      margin: "4px 0 0",
                    }}
                  >
                    右侧安排来自联系人详情、活动详情和待跟进任务，不展示裸 id
                    或占位任务名。
                  </p>
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))",
                }}
              >
                <div className="card-flat" style={{ padding: 14 }}>
                  <div className="mono" style={{ color: "var(--ink)", fontSize: 22 }}>
                    {arrangements.length}
                  </div>
                  <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                    可复核安排
                  </div>
                </div>
                <div className="card-flat" style={{ padding: 14 }}>
                  <div className="mono" style={{ color: "var(--ink)", fontSize: 22 }}>
                    {evidenceIds.length}
                  </div>
                  <div style={{ color: "var(--text-3)", fontSize: 12 }}>
                    来源证据
                  </div>
                </div>
              </div>
            </section>
            <aside
              aria-label="关系安排列表"
              data-orbit-schedule-arrangements="right-side"
              style={{ display: "grid", gap: 12 }}
            >
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <h2 className="h-section" style={{ margin: 0 }}>
                  右侧安排
                </h2>
                <span className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>
                  {arrangements.length} 条
                </span>
              </div>
              {arrangements.map((arrangement) => (
                <ScheduleArrangementCard
                  arrangement={arrangement}
                  key={arrangement.id}
                />
              ))}
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

function ScheduleRouteStateView({
  routeState,
}: {
  routeState: AppScheduleRouteStateViewModel;
}) {
  return (
    <main
      data-orbit-route="app-schedule-route-state"
      style={{ background: "var(--bg)", minHeight: "100dvh", padding: 24 }}
    >
      <section
        className="card"
        style={{
          display: "grid",
          gap: 16,
          margin: "0 auto",
          maxWidth: 720,
          padding: 24,
        }}
      >
        <div>
          <div className="eyebrow">{routeState.copy.eyebrow}</div>
          <h1 className="h-title" style={{ margin: "4px 0 0" }}>
            {routeState.copy.title}
          </h1>
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 14, lineHeight: 1.65, margin: 0 }}>
          {routeState.copy.description}
        </p>
        <p
          className="card-flat"
          style={{
            color: "var(--text-2)",
            fontSize: 13,
            lineHeight: 1.6,
            margin: 0,
            padding: 14,
          }}
        >
          {routeState.copy.guardrail}
        </p>
        {routeState.evidenceIds.length > 0 ? (
          <div className="badge" style={{ justifySelf: "start" }}>
            来源证据 {routeState.evidenceIds.length} 条
          </div>
        ) : null}
        <div
          aria-label="恢复操作"
          style={{
            display: "grid",
            gap: 8,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))",
          }}
        >
          {routeState.recoveryActions.map((action, index) => (
            <a
              className={index === 0 ? "btn btn-primary" : "btn btn-ghost"}
              href={action.href}
              key={action.href}
            >
              {action.label}
            </a>
          ))}
        </div>
        <p style={{ color: "var(--text-3)", fontSize: 13, margin: 0 }}>
          {routeState.copy.nextStep}
        </p>
      </section>
    </main>
  );
}

export function OrbitRealSchedulePage({
  routeModel,
}: {
  routeModel: AppScheduleRouteViewModel;
}) {
  return routeModel.state === "success" ? (
    <AppScheduleSuccessView
      arrangements={routeModel.arrangements}
      evidenceIds={routeModel.evidenceIds}
      summary={routeModel.summary}
    />
  ) : (
    <ScheduleRouteStateView routeState={routeModel.routeState} />
  );
}
