import type {
  EventAnalyticsAppointmentCounts,
  EventAnalyticsAttendeeReport,
  EventAnalyticsOrganizerAggregate,
} from "./contract";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="card-flat" style={{ minWidth: 0, padding: 12 }}>
      <strong style={{ fontSize: 20 }}>{value}</strong>
      <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function explainedRate(numerator: number, denominator: number): {
  detail: string;
  value: string;
} {
  if (denominator === 0) {
    return { detail: "暂无可计算样本", value: "暂无样本" };
  }
  return {
    detail: `${numerator} / ${denominator}`,
    value: `${Math.round((numerator * 100) / denominator)}%`,
  };
}

function RateMetric({
  detail,
  label,
  value,
}: {
  detail: string;
  label: string;
  value: string;
}) {
  return (
    <div className="card-flat" style={{ minWidth: 0, padding: 12 }}>
      <strong style={{ fontSize: 20 }}>{value}</strong>
      <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 4 }}>
        {label}
      </div>
      <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 2 }}>
        {detail}
      </div>
    </div>
  );
}

function AppointmentMetrics({ value }: { value: EventAnalyticsAppointmentCounts }) {
  return (
    <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))" }}>
      <Metric label="草稿约谈" value={value.draft} />
      <Metric label="等待回复" value={value.awaitingResponse} />
      <Metric label="协商中" value={value.negotiating} />
      <Metric label="已确认" value={value.confirmed} />
      <Metric label="待改期" value={value.reschedulePending} />
      <Metric label="已完成" value={value.completed} />
      <Metric label="已取消" value={value.cancelled} />
    </div>
  );
}

function Section({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="card-flat" style={{ display: "grid", gap: 10, padding: 14 }}>
      <h3 style={{ fontSize: 15, margin: 0 }}>{title}</h3>
      {children}
    </section>
  );
}

function OrganizerAggregate({ value }: { value: EventAnalyticsOrganizerAggregate }) {
  const contactRequestTotal =
    value.contactRequests.accepted +
    value.contactRequests.awaitingTargetConsent +
    value.contactRequests.declined +
    value.contactRequests.withdrawn;
  const appointmentTotal = Object.values(value.appointments).reduce(
    (total, count) => total + count,
    0,
  );
  const attendanceRate = explainedRate(
    value.checkIns.checkedIn,
    value.registrations.active,
  );
  const contactAcceptanceRate = explainedRate(
    value.contactRequests.accepted,
    contactRequestTotal,
  );
  const appointmentCompletionRate = explainedRate(
    value.appointments.completed,
    appointmentTotal,
  );
  const mutualConnectionParticipationRate = explainedRate(
    value.roi.metrics.mutualConnections.participationRate.numerator,
    value.roi.metrics.mutualConnections.participationRate.denominator,
  );
  const attributionCoverageRate = explainedRate(
    value.roi.metrics.attributionCoverage.rate.numerator,
    value.roi.metrics.attributionCoverage.rate.denominator,
  );
  const effectiveConnectionRate = explainedRate(
    value.roi.metrics.effectiveConnectionRate.numerator,
    value.roi.metrics.effectiveConnectionRate.denominator,
  );
  return (
    <div data-event-analytics-kind="organizer_aggregate" style={{ display: "grid", gap: 12 }}>
      <Section title="活动聚合分析">
        <div style={{ color: "var(--text-3)", fontSize: 12 }}>
          仅展示活动级汇总；不含参会者身份、档案或单条互动内容。
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))" }}>
          <Metric label="有效报名" value={value.registrations.active} />
          <Metric label="已取消报名" value={value.registrations.cancelled} />
          <Metric label="已签到" value={value.checkIns.checkedIn} />
          <Metric label="已同意联系" value={value.contactRequests.accepted} />
          <Metric label="人工交流证据" value={value.encounters.captured} />
          <Metric label="已投影交流" value={value.encounters.projected} />
        </div>
      </Section>
      <Section title="联系与分组证据">
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))" }}>
          <Metric label="等待同意" value={value.contactRequests.awaitingTargetConsent} />
          <Metric label="已拒绝联系" value={value.contactRequests.declined} />
          <Metric label="已撤回联系" value={value.contactRequests.withdrawn} />
          <Metric label="第一轮桌数" value={value.grouping.roundOne.tables} />
          <Metric label="第一轮座位" value={value.grouping.roundOne.assignedParticipants} />
          <Metric label="第二轮桌数" value={value.grouping.roundTwo.tables} />
          <Metric label="第二轮座位" value={value.grouping.roundTwo.assignedParticipants} />
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 12 }}>
          分组发布状态：{value.grouping.published ? "已发布" : "尚未发布"}
        </div>
      </Section>
      <Section title="可解释比率">
        <div style={{ color: "var(--text-3)", fontSize: 12 }}>
          百分比仅为整数四舍五入，始终同时给出真实分子/分母；分母为零时不显示伪精度。
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(152px, 1fr))" }}>
          <RateMetric label="签到率" value={attendanceRate.value} detail={attendanceRate.detail} />
          <RateMetric label="联系同意率" value={contactAcceptanceRate.value} detail={contactAcceptanceRate.detail} />
          <RateMetric label="完成约谈率" value={appointmentCompletionRate.value} detail={appointmentCompletionRate.detail} />
        </div>
      </Section>
      <Section title="双向连接与后续行动">
        <div style={{ color: "var(--text-3)", fontSize: 12 }}>
          双向连接参与仅统计已接受关系中双方均签到的参会者；后续行动仅统计完成账本中带完整强 eventOrigin 的操作，不按标题或联系人反推活动。
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(152px, 1fr))" }}>
          <Metric
            label="已接受双向关系"
            value={value.roi.metrics.mutualConnections.acceptedRelationshipPairs}
          />
          <Metric
            label="双方均签到关系"
            value={value.roi.metrics.mutualConnections.mutuallyCheckedInPairs}
          />
          <Metric
            label="强归因完成行动"
            value={value.roi.metrics.completedAttributedAgentOperations}
          />
          <Metric
            label="有效连接关系"
            value={value.roi.metrics.effectiveConnectionPairs}
          />
          <Metric
            label="有效连接参与者"
            value={value.roi.metrics.effectiveConnectionParticipants}
          />
          <RateMetric
            label="双向连接参与率"
            value={mutualConnectionParticipationRate.value}
            detail={mutualConnectionParticipationRate.detail}
          />
          <RateMetric
            label="行动归因覆盖率"
            value={attributionCoverageRate.value}
            detail={attributionCoverageRate.detail}
          />
          <RateMetric
            label="有效连接率"
            value={effectiveConnectionRate.value}
            detail={effectiveConnectionRate.detail}
          />
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(152px, 1fr))" }}>
          <Metric label="强行动·交流记录" value={value.roi.metrics.strongActions.humanEncounterNotes} />
          <Metric label="强行动·消息草稿" value={value.roi.metrics.strongActions.messageDrafts} />
          <Metric label="强行动·跟进提醒" value={value.roi.metrics.strongActions.followupReminders} />
          <Metric label="强行动·非取消约谈" value={value.roi.metrics.strongActions.appointments} />
        </div>
        <div style={{ color: "var(--text-3)", fontSize: 12 }}>
          ROI 窗口截止：{new Date(value.roi.snapshot.windowEndsAt).toLocaleString()} · {value.roi.snapshot.status === "finalized"
            ? `不可变快照 revision ${value.roi.snapshot.revision}`
            : "当前为实时值，活动结束 7 天后才可固化"}
        </div>
      </Section>
      <Section title="约谈进展">
        <AppointmentMetrics value={value.appointments} />
      </Section>
    </div>
  );
}

function AttendeeReport({ value }: { value: EventAnalyticsAttendeeReport }) {
  const artifact = value.aiArtifact.artifact;
  const aiStatus = value.aiArtifact.status;
  const aiDescription =
    aiStatus === "queued"
      ? "AI 产物正在排队，尚无可展示内容。"
      : aiStatus === "running"
        ? "AI 产物正在生成，存储并 ready 前不会展示草稿。"
        : aiStatus === "failed"
          ? "AI 产物生成失败；不会以模板或推测内容替代。"
          : aiStatus === "unconfigured"
            ? "尚无可读取的 AI 产物；不会触发生成或返回替代文案。"
            : artifact
              ? "已读取基于本人许可证据生成的现有 AI 产物。"
              : "AI 产物状态为 ready，但没有可显示的已验证内容。";

  return (
    <div data-event-analytics-kind="attendee_report" style={{ display: "grid", gap: 12 }}>
      <Section title="我的活动报告">
        <div style={{ color: "var(--text-3)", fontSize: 12 }}>
          此报告仅汇总本人可见的活动证据。
        </div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))" }}>
          <Metric label="已同意联系" value={value.contactRequests.accepted} />
          <Metric label="本人交流记录" value={value.encounters.captured} />
          <Metric label="已投影交流" value={value.encounters.projected} />
          <Metric label="已完成约谈" value={value.appointments.completed} />
        </div>
        <div style={{ color: "var(--text-2)", fontSize: 13 }}>
          签到：{value.checkIn.status === "checked_in" ? "已签到" : "未签到"}
          {value.checkIn.checkedInAt ? ` · ${new Date(value.checkIn.checkedInAt).toLocaleString()}` : ""}
        </div>
        <div style={{ color: "var(--text-2)", fontSize: 13 }}>
          分组：{value.grouping.status === "available"
            ? `已可见${value.grouping.roundOneTableNumber ? ` · 第一轮第 ${value.grouping.roundOneTableNumber} 桌` : ""}${value.grouping.roundTwoTableNumber ? ` · 第二轮第 ${value.grouping.roundTwoTableNumber} 桌` : ""}`
            : value.grouping.status === "locked"
              ? "已发布，暂未到可见时间"
              : "尚未发布"}
        </div>
      </Section>
      <Section title="我的联系与约谈">
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(132px, 1fr))" }}>
          <Metric label="等待同意" value={value.contactRequests.awaitingTargetConsent} />
          <Metric label="已拒绝" value={value.contactRequests.declined} />
          <Metric label="已撤回" value={value.contactRequests.withdrawn} />
        </div>
        <AppointmentMetrics value={value.appointments} />
      </Section>
      <Section title="AI 会后产物（只读）">
        <div data-event-analytics-ai-status={aiStatus} style={{ color: "var(--text-2)", fontSize: 13 }}>
          状态：{aiStatus === "queued"
            ? "排队中"
            : aiStatus === "running"
              ? "生成中"
              : aiStatus === "failed"
                ? "生成失败"
                : aiStatus === "unconfigured"
                  ? "未启用"
                  : "已生成"}
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 13, margin: 0 }}>{aiDescription}</p>
        {aiStatus === "failed" && value.aiArtifact.failureCode ? (
          <small style={{ color: "var(--text-3)" }}>失败代码：{value.aiArtifact.failureCode}</small>
        ) : null}
        {aiStatus === "ready" && artifact ? (
          <div data-event-analytics-ai-artifact style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{artifact.summary}</p>
            {artifact.messageDraft ? (
              <div className="card-flat" style={{ padding: 10 }}>
                <strong style={{ fontSize: 12 }}>消息草稿</strong>
                <p style={{ margin: "5px 0 0", whiteSpace: "pre-wrap" }}>{artifact.messageDraft}</p>
              </div>
            ) : null}
            <small style={{ color: "var(--text-3)" }}>
              {artifact.provider} · {artifact.model} · {new Date(artifact.generatedAt).toLocaleString()}
            </small>
          </div>
        ) : null}
      </Section>
    </div>
  );
}

/**
 * Pure presentational component: product pages can compose it later without
 * importing a service, provider, or API route.
 */
export function EventAnalyticsReport({
  value,
}: {
  value: EventAnalyticsAttendeeReport | EventAnalyticsOrganizerAggregate;
}) {
  return value.kind === "organizer_aggregate" ? (
    <OrganizerAggregate value={value} />
  ) : (
    <AttendeeReport value={value} />
  );
}
