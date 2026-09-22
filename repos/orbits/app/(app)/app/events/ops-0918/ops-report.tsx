/**
 * 数据报告屏（Orbit_0918 运营台 report 屏，设计 369–445 行；`/app/events/[id]/analytics`）：消费
 * `useEventAnalytics(event.id, activeView, setActiveView)`（`activeView` 留在屏内，照旧 event-analytics-route 用法）。
 * 视图 toggle（设计 372–375；装饰 `REPORT_VIEW_TONE` 内联）：「我的视图」仅 `canSwitchViews` 时渲染，否则只显示当前视图单 pill。
 * 整体视图 = organizer aggregate：四大数（`reportStats`，设计 378–381 背景逐字）；报名趋势 / 参会者来源 无字段 → 省略（网格自动收成两卡）；
 * 现场转化 = 签到率 / 联系方式交换率（`reportRate`，分母 0 → 「—」）；会后跟进 = 已生成 follow-up（`followupReminders`），
 * 「已完成跟进」无字段 → 该格省略；报表说明：统计时间 = `roi.snapshot.windowEndsAt`（`reportClock` JST），其余两行原样。
 * 我的视图 = attendee 接口：四大数（`attendeeStats`）+ 签到状态 / 分组状态 两卡 + AI 产物状态（report.tsx:253–266 文案原样，只读）。
 * `error` → 错误条 + 「重试」= `retry`；无数据无错误 → 「正在读取活动证据…」。
 */
"use client";

import { useState } from "react";

import type {
  EventAnalyticsAttendeeReport,
  EventAnalyticsOrganizerAggregate,
} from "../../../../../features/events/event-analytics/contract";
import type { EventOperationsPageEvent } from "../[id]/operations/event-operations-page-event";
import {
  attendeeAiStatus,
  attendeeCheckInLine,
  attendeeGroupingLine,
  attendeeStats,
  REPORT_VIEW_TONE,
  reportClock,
  reportFollowup,
  reportRate,
  reportStats,
  type ReportStat,
} from "./ops-model";
import { useEventAnalytics, type AnalyticsViewKind } from "./use-event-analytics";

const VIEWS: readonly { key: AnalyticsViewKind; label: string }[] = [
  { key: "organizer_aggregate", label: "整体视图" },
  { key: "attendee_report", label: "我的视图" },
];

export function OpsReport({ event }: { event: EventOperationsPageEvent }) {
  const [activeView, setActiveView] = useState<AnalyticsViewKind | null>(null);
  const { canSwitchViews, error, retry, value } = useEventAnalytics(event.id, activeView, setActiveView);
  const current = activeView ?? "organizer_aggregate";
  const pills = canSwitchViews ? VIEWS : VIEWS.filter((view) => view.key === current);

  return (
    <div className="op-screen" data-ops-screen="report">
      <div className="op-rbar">
        <span aria-label="活动报告视图" className="op-rviews" data-event-analytics-view-switch role="group">
          {pills.map((view) => {
            const on = view.key === current;
            const tone = on ? REPORT_VIEW_TONE.on : REPORT_VIEW_TONE.off;
            return (
              <button
                aria-pressed={on}
                className="btn op-rview"
                data-event-analytics-view={view.key}
                key={view.key}
                onClick={() => setActiveView(view.key)}
                style={{ background: tone.bg, color: tone.color, fontWeight: tone.weight }}
                type="button"
              >
                {view.label}
              </button>
            );
          })}
        </span>
      </div>

      {error ? (
        <div className="op-alert op-alert-row" role="alert">
          <strong>{error}</strong>
          <button className="btn op-btn-sm op-ghost" onClick={retry} type="button">重试</button>
        </div>
      ) : null}
      {!error && !value ? <div aria-live="polite" className="op-empty">正在读取活动证据…</div> : null}
      {value?.kind === "organizer_aggregate" ? <OrganizerView value={value} /> : null}
      {value?.kind === "attendee_report" ? <AttendeeView value={value} /> : null}
    </div>
  );
}

function StatCards({ stats }: { stats: readonly ReportStat[] }) {
  return (
    <div className="op-rstats">
      {stats.map((stat) => (
        <div className="op-rstat" data-ops-rstat={stat.key} key={stat.key} style={{ background: stat.bg }}>
          <span className="op-rstat-ico" style={{ background: stat.iconBg, color: stat.iconColor }}>{stat.icon}</span>
          <span className="op-stat-copy"><span className="op-stat-label">{stat.label}</span><strong className="op-rstat-n">{stat.value}</strong></span>
        </div>
      ))}
    </div>
  );
}

function Metric({ green, icon, label, sub, value }: { green?: boolean; icon: string; label: string; sub: string; value: string }) {
  return (
    <span className="op-rmetric">
      <span className={green ? "op-rmetric-ico op-rmetric-ico-green" : "op-rmetric-ico"}>{icon}</span>
      <span className="op-rmetric-copy">
        <span className="op-rmetric-label">{label}</span>
        <strong className="op-rmetric-n">{value}</strong>
        {sub ? <span className="op-rmetric-sub">{sub}</span> : null}
      </span>
    </span>
  );
}

function SectionHead({ sub, title }: { sub: string; title: string }) {
  return <span className="op-fsec-head"><strong className="op-sec-title-20">{title}</strong><span className="op-fsec-sub">{sub}</span></span>;
}

/** 设计 435–443 报表说明；统计时间行只在有 ROI 窗口时渲染。 */
function ReportNotes({ windowEndsAt }: { windowEndsAt?: string }) {
  return (
    <section className="op-rsec op-rsec-notes">
      <strong className="op-sec-title-20">报表说明</strong>
      <span className="op-rnotes">
        {windowEndsAt ? (
          <>
            <span className="op-rnote-k">数据统计时间</span><span className="op-rnote-v">{`本报告数据统计截至 ${reportClock(windowEndsAt)}（东京时间）。`}</span>
          </>
        ) : null}
        <span className="op-rnote-k">个人视图授权</span><span className="op-rnote-v">「我的视图」仅展示你有权限查看的部分数据，可能与整体数据存在差异。</span>
        <span className="op-rnote-k">数据不可用情况</span><span className="op-rnote-v">如因参会者未授权、现场未签到或信息不完整，部分数据可能无法统计。</span>
      </span>
    </section>
  );
}

function OrganizerView({ value }: { value: EventAnalyticsOrganizerAggregate }) {
  const attendance = reportRate(value.checkIns.checkedIn, value.registrations.active);
  const exchange = reportRate(value.contactRequests.accepted, value.registrations.active);
  const followup = reportFollowup(value);
  return (
    <div className="op-screen" data-event-analytics-kind="organizer_aggregate">
      <StatCards stats={reportStats(value)} />
      <div className="op-rgrid">
        <section className="op-rsec">
          <SectionHead sub="从报名到现场互动的关键转化指标。" title="现场转化" />
          <div className="op-rpair">
            <Metric icon="⚇" label="签到率" sub={attendance.detail} value={attendance.value} />
            <Metric icon="⇄" label="联系方式交换率" sub={exchange.detail} value={exchange.value} />
          </div>
        </section>
        <section className="op-rsec">
          <SectionHead sub="活动结束后的跟进情况。" title="会后跟进" />
          <div className="op-rpair">
            <Metric icon="▤" label="已生成 follow-up" sub="基于现场互动与交换信息" value={String(followup.generated)} />
          </div>
        </section>
      </div>
      <ReportNotes windowEndsAt={value.roi.snapshot.windowEndsAt} />
    </div>
  );
}

function AttendeeView({ value }: { value: EventAnalyticsAttendeeReport }) {
  const checkIn = attendeeCheckInLine(value);
  const ai = attendeeAiStatus(value.aiArtifact.status, Boolean(value.aiArtifact.artifact));
  const artifact = value.aiArtifact.artifact;
  return (
    <div className="op-screen" data-event-analytics-kind="attendee_report">
      <StatCards stats={attendeeStats(value)} />
      <div className="op-rgrid">
        <section className="op-rsec">
          <SectionHead sub="此报告仅汇总本人可见的活动证据。" title="签到状态" />
          <div className="op-rpair">
            <Metric green={checkIn.label === "已签到"} icon="✓" label="签到" sub={checkIn.sub} value={checkIn.label} />
          </div>
        </section>
        <section className="op-rsec">
          <SectionHead sub="分组发布后按可见时间展示桌号。" title="分组状态" />
          <div className="op-rpair">
            <Metric icon="▤" label="分组" sub="" value={attendeeGroupingLine(value)} />
          </div>
        </section>
      </div>
      <section className="op-rsec op-rsec-notes">
        <strong className="op-sec-title-20">AI 会后产物（只读）</strong>
        <span className="op-rnotes">
          <span className="op-rnote-k">状态</span><span className="op-rnote-v" data-event-analytics-ai-status={value.aiArtifact.status}>{ai.label}</span>
          <span className="op-rnote-k">说明</span><span className="op-rnote-v">{ai.description}</span>
          {value.aiArtifact.status === "failed" && value.aiArtifact.failureCode ? (
            <>
              <span className="op-rnote-k">失败代码</span><span className="op-rnote-v">{value.aiArtifact.failureCode}</span>
            </>
          ) : null}
          {value.aiArtifact.status === "ready" && artifact ? (
            <>
              <span className="op-rnote-k">摘要</span><span className="op-rnote-v op-fp-intro" data-event-analytics-ai-artifact>{artifact.summary}</span>
              {artifact.messageDraft ? (
                <>
                  <span className="op-rnote-k">消息草稿</span><span className="op-rnote-v op-fp-intro">{artifact.messageDraft}</span>
                </>
              ) : null}
              <span className="op-rnote-k">来源</span><span className="op-rnote-v">{`${artifact.provider} · ${artifact.model} · ${reportClock(artifact.generatedAt)}`}</span>
            </>
          ) : null}
        </span>
      </section>
      <ReportNotes />
    </div>
  );
}
