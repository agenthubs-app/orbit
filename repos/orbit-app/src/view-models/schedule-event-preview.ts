import { eventDetailToSummary } from "./events";

export interface ScheduleEventPreviewAction {
  href: "/events" | "/schedule";
  label: string;
}

export interface ScheduleEventPreviewEventView {
  id: string;
  nextAction: string;
  sourceContext: string;
  statusLabel: string;
  timing: string;
  title: string;
  venue: string;
}

export interface ScheduleEventPreviewView {
  actions: ScheduleEventPreviewAction[];
  description: string;
  event?: ScheduleEventPreviewEventView;
  guardrail: string;
  title: string;
}

const RECOVERY_ACTIONS: ScheduleEventPreviewAction[] = [
  { href: "/schedule", label: "返回日程" },
  { href: "/events", label: "查看活动列表" }
];

function failureView(): ScheduleEventPreviewView {
  return {
    actions: RECOVERY_ACTIONS,
    description: "这条活动安排暂时不可用。",
    guardrail: "来源不可用时，Orbit 不会写入日历、提醒、消息或外部系统。",
    title: "安排预览无法加载"
  };
}

function evidenceCountLabel(count: number): string {
  return `${count} 条`;
}

function hasChinese(value: string): boolean {
  return /[\u3400-\u9fff]/u.test(value);
}

function previewStatusLabel(value: string): string {
  const labels: Record<string, string> = {
    cancelled: "已取消",
    completed: "已结束",
    confirmed: "已确认",
    imported: "待复核",
    live: "进行中",
    upcoming: "即将开始"
  };

  return labels[value.trim().toLowerCase()] ?? value;
}

function previewSourceLabel(value: string): string {
  if (!value || /\b(?:event-core|postgres|mock|fixture|generated)\b/iu.test(value)) {
    return "活动记录";
  }

  return value;
}

function previewNextAction(value: string): string {
  return hasChinese(value)
    ? value
    : "先查看活动详情，再决定报名或准备事项。";
}

export function scheduleEventPreviewToView(
  data: unknown
): ScheduleEventPreviewView {
  if (!data) {
    return failureView();
  }

  const event = eventDetailToSummary(data);

  if (!event.id || event.id === "event") {
    return failureView();
  }

  return {
    actions: RECOVERY_ACTIONS,
    description: event.description || "这条安排来自活动记录，可先复核再行动。",
    event: {
      id: event.id,
      nextAction: previewNextAction(event.nextAction),
      sourceContext: `来源：${previewSourceLabel(event.sourceLabel)}，证据 ${evidenceCountLabel(
        event.evidenceExcerpts.length
      )}`,
      statusLabel: previewStatusLabel(event.status),
      timing: `活动时间：${event.startsAt}`,
      title: event.title,
      venue: `地点：${event.location || "待确认"}`
    },
    guardrail: "这个预览不会写入日历、报名、提醒或消息。",
    title: "活动安排预览"
  };
}
