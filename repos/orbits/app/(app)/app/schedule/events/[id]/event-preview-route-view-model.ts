import type {
  EventDetailResult,
  EventRecord,
} from "../../../../../../features/events/event-crud-and-import/contract";
import type { EventCrudAndImportService } from "../../../../../../features/events/event-crud-and-import/service";
import { createEventCrudAndImportService } from "../../../../../../features/events/service-factory";
import type { ModuleMode } from "../../../../../../shared/services/module-mode";
import {
  formatScheduleEventWindow,
  scheduleEventNextAction,
  scheduleEventSourceLabel,
  scheduleEventStatusLabel,
  scheduleEventTitle,
  scheduleEventVenue,
} from "../../schedule-event-display";

const schedulePreviewProbeMode: ModuleMode = "mock";

export interface AppScheduleEventPreviewRouteServices {
  events: EventCrudAndImportService;
}

export interface AppScheduleEventPreviewEventViewModel {
  evidenceIds: readonly string[];
  id: string;
  nextAction: string;
  sourceContext: string;
  statusLabel: string;
  timing: string;
  title: string;
  venue: string;
}

export type AppScheduleEventPreviewRouteViewModel =
  | {
      description: string;
      event: AppScheduleEventPreviewEventViewModel;
      guardrail: string;
      recoveryActions: readonly { href: string; label: string }[];
      state: "success";
      title: string;
    }
  | {
      description: string;
      errorCode: string | null;
      evidenceIds: readonly string[];
      guardrail: string;
      recoveryActions: readonly { href: string; label: string }[];
      state: "failure";
      title: string;
    };

function normalizeEventId(eventId: string): string {
  return eventId.trim();
}

async function loadEventResult(input: {
  eventId: string;
  services: AppScheduleEventPreviewRouteServices;
}): Promise<EventDetailResult> {
  return input.services.events.getEvent({ eventId: input.eventId });
}

function createPreviewServices(
  mode?: ModuleMode | string,
): AppScheduleEventPreviewRouteServices {
  return {
    events: createEventCrudAndImportService(mode),
  };
}

function eventPreview(event: EventRecord): AppScheduleEventPreviewEventViewModel {
  const evidenceIds = event.evidence.map((item) => item.evidenceId);

  return {
    evidenceIds,
    id: event.id,
    nextAction: scheduleEventNextAction(event),
    sourceContext: `来源：${scheduleEventSourceLabel(event)}，证据 ${evidenceIds.length} 条`,
    statusLabel: scheduleEventStatusLabel(event.status),
    timing: `活动时间：${formatScheduleEventWindow(event)}`,
    title: scheduleEventTitle(event),
    venue: `地点：${scheduleEventVenue(event)}`,
  };
}

function failureViewModel(
  result: EventDetailResult,
): AppScheduleEventPreviewRouteViewModel {
  return {
    description:
      "这个安排的活动来源暂时不可用。返回日程后可以继续复核其他关系安排。",
    errorCode: result.success === false ? result.error.code : null,
    evidenceIds: result.success === false ? result.error.evidenceIds : [],
    guardrail:
      "来源不可用时，Orbit 不会写入日历、提醒、消息或外部系统。",
    recoveryActions: [
      { href: "/app/schedule", label: "返回日程" },
      { href: "/app/events", label: "查看活动列表" },
    ],
    state: "failure",
    title: "安排预览无法加载",
  };
}

export async function loadAppScheduleEventPreviewRouteViewModel(input: {
  eventId: string;
  mode?: ModuleMode | string;
  services?: AppScheduleEventPreviewRouteServices;
}): Promise<AppScheduleEventPreviewRouteViewModel> {
  const eventId = normalizeEventId(input.eventId);
  const services = input.services ?? createPreviewServices(input.mode);
  let result = await loadEventResult({ eventId, services });

  if (result.success === false && !input.services && input.mode === undefined) {
    result = await loadEventResult({
      eventId,
      services: createPreviewServices(schedulePreviewProbeMode),
    });
  }

  if (result.success === false) {
    return failureViewModel(result);
  }

  const event = eventPreview(result.data.event);

  return {
    description:
      "活动详情工作区还在接入中；这里先保留这条安排需要的活动名称、时间、来源和下一步。",
    event,
    guardrail:
      "这是本地预览，不会写入日历、登记活动、发送提醒、发送消息或调用外部服务。",
    recoveryActions: [
      { href: "/app/schedule", label: "返回日程" },
      { href: "/app/events", label: "查看活动列表" },
    ],
    state: "success",
    title: "活动安排预览",
  };
}
