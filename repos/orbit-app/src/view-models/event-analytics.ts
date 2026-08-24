export type EventAnalyticsKind = "organizer_aggregate" | "attendee_report";

export interface EventAnalyticsMetricView {
  label: string;
  value: string;
}

export interface EventAnalyticsRateView extends EventAnalyticsMetricView {
  detail: string;
}

export interface EventAnalyticsView {
  aiDetail: string | null;
  aiDraft: string | null;
  aiStatusLabel: string | null;
  aiSummary: string | null;
  appointmentMetrics: EventAnalyticsMetricView[];
  contactMetrics: EventAnalyticsMetricView[];
  eventId: string;
  groupingLabel: string;
  kind: EventAnalyticsKind;
  privacyLabel: string;
  rates: EventAnalyticsRateView[];
  statusRows: { detail: string; label: string }[];
  summaryMetrics: EventAnalyticsMetricView[];
  title: string;
}

const appointmentKeys = ["draft", "awaitingResponse", "negotiating", "confirmed", "reschedulePending", "completed", "cancelled"] as const;
const appointmentLabels = ["草稿约谈", "等待回复", "协商中", "已确认", "待改期", "已完成", "已取消"] as const;
const contactKeys = ["accepted", "awaitingTargetConsent", "declined", "withdrawn"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseCounts<T extends readonly string[]>(value: unknown, keys: T): Record<T[number], number> | null {
  if (!isRecord(value) || !keys.every((key) => isCount(value[key]))) return null;
  return value as Record<T[number], number>;
}

function metrics(keys: readonly string[], labels: readonly string[], values: Record<string, number>): EventAnalyticsMetricView[] {
  return keys.map((key, index) => ({ label: labels[index] ?? key, value: String(values[key]) }));
}

function rate(label: string, numerator: number, denominator: number): EventAnalyticsRateView {
  return denominator === 0
    ? { detail: "暂无可计算样本", label, value: "暂无样本" }
    : { detail: `${numerator} / ${denominator}`, label, value: `${Math.round((numerator * 100) / denominator)}%` };
}

function organizerView(payload: Record<string, unknown>): EventAnalyticsView | null {
  if (typeof payload.eventId !== "string") return null;
  const appointments = parseCounts(payload.appointments, appointmentKeys);
  const contacts = parseCounts(payload.contactRequests, contactKeys);
  const registrations = parseCounts(payload.registrations, ["active", "cancelled"] as const);
  const encounters = parseCounts(payload.encounters, ["captured", "projected"] as const);
  if (!appointments || !contacts || !registrations || !encounters || !isRecord(payload.checkIns) || !isCount(payload.checkIns.checkedIn) || !isRecord(payload.grouping) || typeof payload.grouping.published !== "boolean" || !isRecord(payload.grouping.roundOne) || !isRecord(payload.grouping.roundTwo)) return null;
  const roundOne = parseCounts(payload.grouping.roundOne, ["assignedParticipants", "tables"] as const);
  const roundTwo = parseCounts(payload.grouping.roundTwo, ["assignedParticipants", "tables"] as const);
  if (!roundOne || !roundTwo) return null;
  const contactTotal = contactKeys.reduce((total, key) => total + contacts[key], 0);
  const appointmentTotal = appointmentKeys.reduce((total, key) => total + appointments[key], 0);
  return {
    aiDetail: null, aiDraft: null, aiStatusLabel: null, aiSummary: null,
    appointmentMetrics: metrics(appointmentKeys, appointmentLabels, appointments),
    contactMetrics: metrics(["awaitingTargetConsent", "declined", "withdrawn"], ["等待同意", "已拒绝联系", "已撤回联系"], contacts),
    eventId: payload.eventId,
    groupingLabel: payload.grouping.published ? `已发布 · 两轮各 ${roundOne.tables} 桌 / ${roundOne.assignedParticipants} 席` : "尚未发布分桌结果",
    kind: "organizer_aggregate",
    privacyLabel: "仅活动级汇总，不含参会者身份与单条互动内容",
    rates: [rate("签到率", payload.checkIns.checkedIn, registrations.active), rate("联系同意率", contacts.accepted, contactTotal), rate("完成约谈率", appointments.completed, appointmentTotal)],
    statusRows: [
      { detail: `${roundOne.tables} 桌 · ${roundOne.assignedParticipants} 席`, label: "第一轮分组" },
      { detail: `${roundTwo.tables} 桌 · ${roundTwo.assignedParticipants} 席`, label: "第二轮分组" }
    ],
    summaryMetrics: metrics(["active", "cancelled", "checkedIn", "accepted", "captured", "projected"], ["有效报名", "取消报名", "已签到", "同意联系", "人工交流", "投影交流"], { ...registrations, ...contacts, ...encounters, checkedIn: payload.checkIns.checkedIn }),
    title: "组织者汇总"
  };
}

function attendeeView(payload: Record<string, unknown>): EventAnalyticsView | null {
  if (typeof payload.eventId !== "string") return null;
  const appointments = parseCounts(payload.appointments, appointmentKeys);
  const contacts = parseCounts(payload.contactRequests, contactKeys);
  const encounters = parseCounts(payload.encounters, ["captured", "projected"] as const);
  if (!appointments || !contacts || !encounters || !isRecord(payload.checkIn) || !["checked_in", "not_checked_in"].includes(String(payload.checkIn.status)) || !(payload.checkIn.checkedInAt === null || typeof payload.checkIn.checkedInAt === "string") || !isRecord(payload.grouping) || !["available", "locked", "not_published"].includes(String(payload.grouping.status)) || !isRecord(payload.aiArtifact) || !["queued", "running", "ready", "failed", "unconfigured"].includes(String(payload.aiArtifact.status))) return null;
  const groupingStatus = String(payload.grouping.status);
  const roundOne = isCount(payload.grouping.roundOneTableNumber) ? `第一轮第 ${payload.grouping.roundOneTableNumber} 桌` : null;
  const roundTwo = isCount(payload.grouping.roundTwoTableNumber) ? `第二轮第 ${payload.grouping.roundTwoTableNumber} 桌` : null;
  const groupingLabel = groupingStatus === "available" ? [roundOne, roundTwo].filter(Boolean).join(" · ") || "分组已开放" : groupingStatus === "locked" ? "分组已发布，尚未到可见时间" : "尚未发布分桌结果";
  const aiStatus = String(payload.aiArtifact.status);
  const aiStatusLabels: Record<string, string> = { failed: "生成失败", queued: "排队中", ready: "已生成", running: "生成中", unconfigured: "尚未启用" };
  const artifact = isRecord(payload.aiArtifact.artifact) ? payload.aiArtifact.artifact : null;
  return {
    aiDetail: aiStatus === "ready" ? "只显示已经验证并保存的会后产物。" : aiStatus === "failed" ? "生成失败，不会用模板内容代替。" : aiStatus === "unconfigured" ? "尚未启用 AI 会后产物，不会触发临时生成。" : "会后产物尚未完成。",
    aiDraft: artifact && (artifact.messageDraft === null || typeof artifact.messageDraft === "string") ? artifact.messageDraft : null,
    aiStatusLabel: aiStatusLabels[aiStatus] ?? aiStatus,
    aiSummary: artifact && typeof artifact.summary === "string" ? artifact.summary : null,
    appointmentMetrics: metrics(appointmentKeys, appointmentLabels, appointments),
    contactMetrics: metrics(["awaitingTargetConsent", "declined", "withdrawn"], ["等待同意", "已拒绝", "已撤回"], contacts),
    eventId: payload.eventId,
    groupingLabel,
    kind: "attendee_report",
    privacyLabel: "仅汇总本人可见的活动证据",
    rates: [],
    statusRows: [
      { detail: payload.checkIn.status === "checked_in" ? "已签到" : "未签到", label: "签到" },
      { detail: groupingLabel, label: "分组" }
    ],
    summaryMetrics: metrics(["accepted", "captured", "projected", "completed"], ["同意联系", "本人交流", "投影交流", "完成约谈"], { ...contacts, ...encounters, ...appointments }),
    title: "我的活动报告"
  };
}

export function eventAnalyticsToView(payload: unknown): EventAnalyticsView | null {
  if (!isRecord(payload)) return null;
  if (payload.kind === "organizer_aggregate") return organizerView(payload);
  if (payload.kind === "attendee_report") return attendeeView(payload);
  return null;
}
