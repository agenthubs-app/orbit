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
      nextAction: event.nextAction,
      sourceContext: `来源：${event.sourceLabel || "活动记录"}，证据 ${evidenceCountLabel(
        event.evidenceExcerpts.length
      )}`,
      statusLabel: event.status,
      timing: `活动时间：${event.startsAt}`,
      title: event.title,
      venue: `地点：${event.location || "待确认"}`
    },
    guardrail: "这个预览不会写入日历、报名、提醒或消息。",
    title: "活动安排预览"
  };
}
