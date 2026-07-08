import type {
  ContactDetail,
  ContactDetailTagStatusResult,
  ContactDetailTagStatusService,
} from "../../../../features/contacts/detail-contract";
import { createContactDetailTagStatusService } from "../../../../features/contacts/service-factory";
import type {
  EventDetailResult,
  EventRecord,
} from "../../../../features/events/event-crud-and-import/contract";
import type { EventCrudAndImportService } from "../../../../features/events/event-crud-and-import/service";
import { createEventCrudAndImportService } from "../../../../features/events/service-factory";
import type {
  FollowupTask,
  FollowupTaskGenerationResult,
} from "../../../../features/followups/contract";
import type { FollowupTaskGenerationService } from "../../../../features/followups/service";
import { createFollowupTaskGenerationService } from "../../../../features/followups/service-factory";
import type { ModuleMode } from "../../../../shared/services/module-mode";
import {
  formatScheduleEventWindow,
  scheduleEventSourceLabel,
  scheduleEventStatusLabel,
  scheduleEventTitle,
  scheduleEventVenue,
} from "./schedule-event-display";

const scheduleContactId = "demo-contact-1";
const scheduleEventId = "event_001";
const scheduleProbeMode: ModuleMode = "mock";

export type AppScheduleSearchParams = Record<
  string,
  string | string[] | undefined
>;
export type AppScheduleRouteScenario = "empty" | "pending" | "failure";

export interface AppScheduleRouteServices {
  contactDetail: ContactDetailTagStatusService;
  events: EventCrudAndImportService;
  followups: FollowupTaskGenerationService;
}

export interface AppScheduleArrangementTargetViewModel {
  id: string;
  kind: "contact" | "event";
}

export interface AppScheduleArrangementViewModel {
  actionLabel: string;
  evidenceIds: readonly string[];
  href: string;
  id: string;
  primaryName: string;
  reason: string;
  secondaryName: string;
  sourceContext: string;
  statusLabel: string;
  target: AppScheduleArrangementTargetViewModel;
  targetNote?: string;
  targetState: "ready" | "detail-unavailable";
  timing: string;
}

export interface AppScheduleRouteStateViewModel {
  copy: {
    description: string;
    eyebrow: string;
    guardrail: string;
    nextStep: string;
    title: string;
  };
  errorCode: string | null;
  evidenceIds: readonly string[];
  recoveryActions: readonly { href: string; label: string }[];
  scenario: AppScheduleRouteScenario;
}

export type AppScheduleRouteViewModel =
  | {
      arrangements: readonly AppScheduleArrangementViewModel[];
      evidenceIds: readonly string[];
      state: "success";
      summary: string;
    }
  | {
      routeState: AppScheduleRouteStateViewModel;
      state: "route-state";
    };

type ScheduleSourceResult =
  | ContactDetailTagStatusResult
  | EventDetailResult
  | FollowupTaskGenerationResult;

interface ScheduleSourceResults {
  contactResult: ContactDetailTagStatusResult;
  eventResult: EventDetailResult;
  followupResult: FollowupTaskGenerationResult;
  results: readonly [
    ContactDetailTagStatusResult,
    EventDetailResult,
    FollowupTaskGenerationResult,
  ];
}

function readSearchParam(
  searchParams: AppScheduleSearchParams | undefined,
  key: string,
): string | null {
  const value = searchParams?.[key];

  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function readRouteScenario(
  searchParams: AppScheduleSearchParams | undefined,
): AppScheduleRouteScenario | null {
  const scenario = readSearchParam(searchParams, "scenario");

  if (scenario === "empty" || scenario === "pending" || scenario === "failure") {
    return scenario;
  }

  return null;
}

function isFailure(result: ScheduleSourceResult) {
  return result.success === false;
}

function evidenceIdsForResult(result: ScheduleSourceResult): readonly string[] {
  if (result.success === false) {
    return result.error.evidenceIds;
  }

  return result.data.provenance.evidenceIds;
}

function uniqueEvidenceIds(results: readonly ScheduleSourceResult[]): string[] {
  return Array.from(
    new Set(results.flatMap((result) => evidenceIdsForResult(result))),
  );
}

function routeScenarioForResults(
  results: readonly ScheduleSourceResult[],
): AppScheduleRouteScenario | null {
  if (results.some(isFailure)) {
    return "failure";
  }

  if (results.some((result) => result.success && result.data.state === "pending")) {
    return "pending";
  }

  if (results.some((result) => result.success && result.data.state === "empty")) {
    return "empty";
  }

  return null;
}

const routeRecoveryActions: Record<
  AppScheduleRouteScenario,
  readonly { href: string; label: string }[]
> = {
  empty: [
    { href: "/app/contacts/new", label: "添加关系来源" },
    { href: "/app/schedule", label: "查看已有安排" },
  ],
  failure: [
    { href: "/app/schedule", label: "重新加载日程" },
    { href: "/app/schedule?scenario=pending", label: "检查来源状态" },
  ],
  pending: [{ href: "/app/schedule", label: "返回可用安排" }],
};

function routeStateCopy(scenario: AppScheduleRouteScenario) {
  if (scenario === "empty") {
    return {
      description:
        "还没有可用于安排的关系、活动或跟进来源。先补充来源，再判断下一步约见。",
      eyebrow: "日程安排",
      guardrail:
        "没有来源证据时，Orbit 不会创建日历、提醒、消息或外部同步。",
      nextStep: "添加关系来源，或返回查看已有安排。",
      title: "暂无可安排的关系事项",
    };
  }

  if (scenario === "pending") {
    return {
      description:
        "关系、活动和跟进来源仍在复核中，暂时不展示未确认的安排。",
      eyebrow: "日程安排",
      guardrail:
        "复核完成前，Orbit 不会写入日历、发送通知或触发外部服务。",
      nextStep: "来源复核完成后返回日程安排。",
      title: "日程来源仍在复核",
    };
  }

  return {
    description:
      "日程来源暂时不可用，联系人、活动或跟进边界返回了受控失败。",
    eyebrow: "日程安排",
    guardrail:
      "不可用期间，Orbit 只显示恢复入口，不会写入日历、提醒、消息或外部系统。",
    nextStep: "重新加载日程，或先检查来源状态。",
    title: "日程安排无法加载",
  };
}

function routeStateViewModel(input: {
  results: readonly ScheduleSourceResult[];
  scenario: AppScheduleRouteScenario;
}): AppScheduleRouteStateViewModel {
  const failure = input.results.find(isFailure);

  return {
    copy: routeStateCopy(input.scenario),
    errorCode: failure?.success === false ? failure.error.code : null,
    evidenceIds: uniqueEvidenceIds(input.results),
    recoveryActions: routeRecoveryActions[input.scenario],
    scenario: input.scenario,
  };
}

async function loadScheduleSourceResults(input: {
  scenario?: AppScheduleRouteScenario;
  services: AppScheduleRouteServices;
}): Promise<ScheduleSourceResults> {
  const [contactResult, eventResult, followupResult] = await Promise.all([
    input.services.contactDetail.getContactDetail({
      contactId: scheduleContactId,
      scenario: input.scenario,
    }),
    input.services.events.getEvent({
      eventId: scheduleEventId,
      scenario: input.scenario,
    }),
    input.services.followups.listTasks({
      limit: 4,
      scenario: input.scenario,
    }),
  ]);

  return {
    contactResult,
    eventResult,
    followupResult,
    results: [contactResult, eventResult, followupResult] as const,
  };
}

function shouldUseScheduleProbeFallback(input: {
  requestedScenario: AppScheduleRouteScenario | null;
  results: readonly ScheduleSourceResult[];
  servicesWereProvided: boolean;
}): boolean {
  return (
    input.requestedScenario === null &&
    !input.servicesWereProvided &&
    input.results.some(isFailure)
  );
}

function sourceLabelForContact(contact: ContactDetail): string {
  const labels: Record<ContactDetail["source"]["type"], string> = {
    calendar_signal: "日历信号",
    email_signal: "邮件信号",
    event_import: "活动导入",
    manual: "手动记录",
    qr_scan: "二维码扫描",
    referral: "引荐来源",
  };

  return labels[contact.source.type] ?? "关系来源";
}

function statusLabelForContact(status: ContactDetail["status"]): string {
  const labels: Record<ContactDetail["status"], string> = {
    active: "进行中",
    archived: "已归档",
    needs_follow_up: "待跟进",
    nurture: "保持联系",
  };

  return labels[status];
}

function statusLabelForEvent(status: EventRecord["status"]): string {
  return scheduleEventStatusLabel(status);
}

function dueLabelForTask(task: FollowupTask | null): string {
  if (!task) {
    return "待来源确认";
  }

  if (task.dueInDays === 0) {
    return "今天";
  }

  if (task.dueInDays === 1) {
    return "明天";
  }

  return `${task.dueInDays} 天内`;
}

function localizedContactRole(role: string): string {
  const roles: Record<string, string> = {
    Founder: "创始人",
  };

  return roles[role] ?? role;
}

function contactReasonForSchedule(input: {
  contact: ContactDetail;
  followupTask: FollowupTask | null;
}): string {
  const followupSignal = input.followupTask
    ? `跟进任务已确认 ${dueLabelForTask(input.followupTask)} 需要复核。`
    : "跟进任务仍待来源确认。";

  return `关系原因：${input.contact.displayName} 与 ${input.contact.organization} 的关系证据显示有明确后续需求。${followupSignal}下一步先在联系人详情中复核来源，再决定是否安排会面或准备引荐。`;
}

function eventReasonForSchedule(event: EventRecord): string {
  return `活动原因：${scheduleEventTitle(event)} 已由${scheduleEventSourceLabel(event)}标记为${statusLabelForEvent(event.status)}，适合在登记、预留时间或联系参会人前复核关系机会。`;
}

function buildContactArrangement(input: {
  contact: ContactDetail;
  followupTask: FollowupTask | null;
  targetRoutesMayNeedRecovery: boolean;
}): AppScheduleArrangementViewModel {
  const followupLabel = dueLabelForTask(input.followupTask);
  const targetRoutesMayNeedRecovery = input.targetRoutesMayNeedRecovery;

  return {
    actionLabel: targetRoutesMayNeedRecovery
      ? "查看联系人详情状态"
      : "打开联系人详情",
    evidenceIds: [
      ...input.contact.evidence.map((item) => item.evidenceId),
      ...(input.followupTask?.evidenceIds ?? []),
    ],
    href: `/app/contacts/${scheduleContactId}`,
    id: `schedule-arrangement-contact-${input.contact.id}`,
    primaryName: input.contact.displayName,
    reason: contactReasonForSchedule({
      contact: input.contact,
      followupTask: input.followupTask,
    }),
    secondaryName: `${localizedContactRole(input.contact.role)} · ${input.contact.organization}`,
    sourceContext: `来源：${sourceLabelForContact(input.contact)}，证据 ${input.contact.evidence.length} 条`,
    statusLabel: statusLabelForContact(input.contact.status),
    target: {
      id: scheduleContactId,
      kind: "contact",
    },
    targetNote: targetRoutesMayNeedRecovery
      ? "联系人详情来源仍在接入中；打开后可能先显示受控恢复页，不会写入日历、提醒、消息或外部系统。"
      : undefined,
    targetState: targetRoutesMayNeedRecovery ? "detail-unavailable" : "ready",
    timing: `跟进时机：${followupLabel}`,
  };
}

function buildEventArrangement(input: {
  event: EventRecord;
}): AppScheduleArrangementViewModel {
  const evidenceIds = input.event.evidence.map((item) => item.evidenceId);
  const title = scheduleEventTitle(input.event);

  return {
    actionLabel: "查看活动安排预览",
    evidenceIds,
    href: `/app/schedule/events/${scheduleEventId}`,
    id: `schedule-arrangement-event-${input.event.id}`,
    primaryName: title,
    reason: eventReasonForSchedule(input.event),
    secondaryName: `地点：${scheduleEventVenue(input.event)}`,
    sourceContext: `来源：${scheduleEventSourceLabel(input.event)}，证据 ${evidenceIds.length} 条`,
    statusLabel: statusLabelForEvent(input.event.status),
    target: {
      id: scheduleEventId,
      kind: "event",
    },
    targetNote:
      `安排预览保留活动名称、时间、来源和下一步；活动详情仍在接入中。打开 ${title} 不会写入日历、提醒、消息或外部系统。`,
    targetState: "detail-unavailable",
    timing: `活动时间：${formatScheduleEventWindow(input.event)}`,
  };
}

export function createAppScheduleRouteServices(
  mode?: ModuleMode | string,
): AppScheduleRouteServices {
  return {
    contactDetail: createContactDetailTagStatusService(mode),
    events: createEventCrudAndImportService(mode),
    followups: createFollowupTaskGenerationService(mode),
  };
}

export async function loadAppScheduleRouteViewModel(
  searchParams?: AppScheduleSearchParams,
  services?: AppScheduleRouteServices,
): Promise<AppScheduleRouteViewModel> {
  const requestedScenario = readRouteScenario(searchParams);
  const scenario = requestedScenario ?? undefined;
  const servicesWereProvided = services !== undefined;
  let usedProbeFallback = false;
  let sourceResults = await loadScheduleSourceResults({
    scenario,
    services: services ?? createAppScheduleRouteServices(),
  });

  if (
    shouldUseScheduleProbeFallback({
      requestedScenario,
      results: sourceResults.results,
      servicesWereProvided,
    })
  ) {
    usedProbeFallback = true;
    sourceResults = await loadScheduleSourceResults({
      services: createAppScheduleRouteServices(scheduleProbeMode),
    });
  }

  const { contactResult, eventResult, followupResult, results } = sourceResults;
  const routeScenario = requestedScenario ?? routeScenarioForResults(results);

  if (routeScenario) {
    return {
      routeState: routeStateViewModel({
        results,
        scenario: routeScenario,
      }),
      state: "route-state",
    };
  }

  if (
    contactResult.success === false ||
    eventResult.success === false ||
    followupResult.success === false ||
    !contactResult.data.contact
  ) {
    return {
      routeState: routeStateViewModel({
        results,
        scenario: "failure",
      }),
      state: "route-state",
    };
  }

  const arrangements = [
    buildContactArrangement({
      contact: contactResult.data.contact,
      followupTask: followupResult.data.tasks[0] ?? null,
      targetRoutesMayNeedRecovery: usedProbeFallback,
    }),
    buildEventArrangement({
      event: eventResult.data.event,
    }),
  ];

  return {
    arrangements,
    evidenceIds: uniqueEvidenceIds(results),
    state: "success",
    summary: `已从联系人、活动和跟进来源整理 ${arrangements.length} 条可复核安排。`,
  };
}
