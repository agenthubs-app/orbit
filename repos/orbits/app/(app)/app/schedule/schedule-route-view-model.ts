import type {
  ContactListItem,
  ContactsListSearchResult,
} from "../../../../features/contacts/contract";
import type { ContactsListSearchAndFilterService } from "../../../../features/contacts/service";
import { createContactsListSearchAndFilterService } from "../../../../features/contacts/service-factory";
import type {
  EventListResult,
  EventRecord,
} from "../../../../features/events/event-crud-and-import/contract";
import type { EventCrudAndImportService } from "../../../../features/events/event-crud-and-import/service";
import { createEventCrudAndImportService } from "../../../../features/events/service-factory";
import {
  listConfiguredOrbitScheduleItems,
  type OrbitScheduleItem,
} from "../../../../features/events/orbit-schedule-reader";
import type {
  FollowupTask,
  FollowupTaskGenerationResult,
} from "../../../../features/followups/contract";
import { contactIdFromConnectionIdentity } from "../../../../shared/relationship-identity";
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

export type AppScheduleRouteScenario = "empty" | "pending" | "failure";
export interface AppScheduleRouteControls {
  scenario?: AppScheduleRouteScenario;
}

export interface AppScheduleRouteServices {
  contacts: ContactsListSearchAndFilterService;
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
  ContactsListSearchResult | EventListResult | FollowupTaskGenerationResult;

interface ScheduleSourceResults {
  contactResult: ContactsListSearchResult;
  eventResult: EventListResult;
  followupResult: FollowupTaskGenerationResult;
  results: readonly [
    ContactsListSearchResult,
    EventListResult,
    FollowupTaskGenerationResult,
  ];
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

  if (
    results.some((result) => result.success && result.data.state === "pending")
  ) {
    return "pending";
  }

  if (
    results.some((result) => result.success && result.data.state === "empty")
  ) {
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
    { href: "/app/today#arrangements", label: "查看已有安排" },
  ],
  failure: [
    { href: "/app/today#arrangements", label: "重新加载日程" },
    { href: "/app/settings", label: "检查来源设置" },
  ],
  pending: [{ href: "/app/today#arrangements", label: "返回可用安排" }],
};

function routeStateCopy(scenario: AppScheduleRouteScenario) {
  if (scenario === "empty") {
    return {
      description:
        "还没有可用于安排的关系、活动或跟进来源。先补充来源，再判断下一步约见。",
      eyebrow: "日程安排",
      guardrail: "没有来源证据时，Orbit 不会创建日历、提醒、消息或外部同步。",
      nextStep: "添加关系来源，或返回查看已有安排。",
      title: "暂无可安排的关系事项",
    };
  }

  if (scenario === "pending") {
    return {
      description: "关系、活动和跟进来源仍在复核中，暂时不展示未确认的安排。",
      eyebrow: "日程安排",
      guardrail: "复核完成前，Orbit 不会写入日历、发送通知或触发外部服务。",
      nextStep: "来源复核完成后返回日程安排。",
      title: "日程来源仍在复核",
    };
  }

  return {
    description: "日程来源暂时不可用，联系人、活动或跟进边界返回了受控失败。",
    eyebrow: "日程安排",
    guardrail:
      "服务恢复前，Orbit 不会自动改动你的日历，也不会替你发出任何消息。",
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
  actorId?: string | null;
  scenario?: AppScheduleRouteScenario;
  services: AppScheduleRouteServices;
}): Promise<ScheduleSourceResults> {
  const [contactResult, eventResult, followupResult] = await Promise.all([
    input.services.contacts.listContacts({
      actorId: input.actorId,
      scenario: input.scenario,
    }),
    input.services.events.listEvents({
      actorId: input.actorId,
      scenario: input.scenario,
    }),
    input.services.followups.listTasks({
      actorId: input.actorId,
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

function sourceLabelForContact(contact: ContactListItem): string {
  const labels: Record<ContactListItem["source"]["type"], string> = {
    business_card_ocr: "名片识别",
    calendar_signal: "日历信号",
    email_signal: "邮件信号",
    event_import: "活动导入",
    external_contacts: "外部联系人",
    manual: "手动记录",
    qr_scan: "二维码扫描",
    referral: "引荐来源",
  };

  return labels[contact.source.type] ?? "关系来源";
}

function statusLabelForContact(status: ContactListItem["status"]): string {
  const labels: Record<ContactListItem["status"], string> = {
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

function normalizedEntityIdentity(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/^(?:contact|connection)[:_-]/, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function taskMatchesContact(
  task: FollowupTask,
  contact: ContactListItem,
): boolean {
  const targetContactId = contactIdFromConnectionIdentity(task.connectionId);

  if (targetContactId) {
    return targetContactId === contact.id;
  }

  const contactIdentities = [
    contact.id,
    contact.displayName,
    `${contact.displayName}${contact.organization}`,
  ].map(normalizedEntityIdentity);
  const taskIdentities = [
    task.connectionId,
    task.contactName,
    `${task.contactName}${task.organization}`,
  ].map(normalizedEntityIdentity);

  return contactIdentities.some((identity) =>
    taskIdentities.includes(identity),
  );
}

function followupTaskForContact(
  contact: ContactListItem,
  tasks: readonly FollowupTask[],
): FollowupTask | null {
  return tasks.find((task) => taskMatchesContact(task, contact)) ?? null;
}

function selectScheduleContact(
  contacts: readonly ContactListItem[],
  tasks: readonly FollowupTask[],
): ContactListItem | null {
  return (
    [...contacts].sort((left, right) => {
      const score = (contact: ContactListItem) => {
        const taskScore = followupTaskForContact(contact, tasks) ? 100 : 0;
        const statusScore =
          contact.status === "needs_follow_up"
            ? 30
            : contact.status === "active"
              ? 20
              : contact.status === "nurture"
                ? 10
                : 0;
        return taskScore + statusScore + contact.value.score / 100;
      };

      return score(right) - score(left);
    })[0] ?? null
  );
}

function selectScheduleEvent(
  events: readonly EventRecord[],
  now = new Date(),
): EventRecord | null {
  const candidates = events.filter(
    (event) => event.status === "confirmed" || event.status === "imported",
  );
  const nowValue = now.getTime();
  const priorityFor = (event: EventRecord) =>
    event.status === "confirmed" ? 0 : 1;
  const upcoming = candidates
    .filter((event) => Date.parse(event.endsAt || event.startsAt) >= nowValue)
    .sort(
      (left, right) =>
        priorityFor(left) - priorityFor(right) ||
        Date.parse(left.startsAt) - Date.parse(right.startsAt),
    );

  if (upcoming[0]) {
    return upcoming[0];
  }

  return (
    candidates.sort(
      (left, right) =>
        priorityFor(left) - priorityFor(right) ||
        Date.parse(right.startsAt) - Date.parse(left.startsAt),
    )[0] ?? null
  );
}

function contactReasonForSchedule(input: {
  contact: ContactListItem;
  followupTask: FollowupTask | null;
}): string {
  const followupSignal = input.followupTask
    ? `跟进任务已确认 ${dueLabelForTask(input.followupTask)} 需要复核。`
    : "跟进任务仍待来源确认。";

  return `关系原因：${input.contact.displayName} 当前标记为${statusLabelForContact(input.contact.status)}，有 ${input.contact.evidence.length} 条关系来源可供复核。${followupSignal}下一步先打开联系人详情核对记录，再决定是否安排会面或准备引荐。`;
}

function eventReasonForSchedule(event: EventRecord): string {
  return `${scheduleEventTitle(event)} ${statusLabelForEvent(event.status)}（来源：${scheduleEventSourceLabel(event)}）。出发前可以先看看这场有谁值得认识。`;
}

function buildContactArrangement(input: {
  contact: ContactListItem;
  followupTask: FollowupTask | null;
}): AppScheduleArrangementViewModel {
  const followupLabel = dueLabelForTask(input.followupTask);

  return {
    actionLabel: "打开联系人详情",
    evidenceIds: [
      ...input.contact.evidence.map((item) => item.evidenceId),
      ...(input.followupTask?.evidenceIds ?? []),
    ],
    href: `/app/contacts/${encodeURIComponent(input.contact.id)}`,
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
      id: input.contact.id,
      kind: "contact",
    },
    targetNote:
      "打开联系人详情只是查看，不会自动改动你的日历，也不会替你发出任何消息。",
    targetState: "ready",
    timing: `跟进时机：${followupLabel}`,
  };
}

function buildEventArrangement(input: {
  event: EventRecord;
}): AppScheduleArrangementViewModel {
  const evidenceIds = input.event.evidence.map((item) => item.evidenceId);
  const title = scheduleEventTitle(input.event);

  return {
    actionLabel: "打开活动详情",
    evidenceIds,
    href: `/app/events/${encodeURIComponent(input.event.id)}`,
    id: `schedule-arrangement-event-${input.event.id}`,
    primaryName: title,
    reason: eventReasonForSchedule(input.event),
    secondaryName: `地点：${scheduleEventVenue(input.event)}`,
    sourceContext: `来源：${scheduleEventSourceLabel(input.event)}，证据 ${evidenceIds.length} 条`,
    statusLabel: statusLabelForEvent(input.event.status),
    target: {
      id: input.event.id,
      kind: "event",
    },
    targetNote: `打开 ${title} 的活动详情只是查看，不会自动改动你的日历，也不会替你发出任何消息。`,
    targetState: "ready",
    timing: `活动时间：${formatScheduleEventWindow(input.event)}`,
  };
}

function scheduleDateParts(value: string): Record<string, string> {
  return Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(value))
      .map((part) => [part.type, part.value]),
  );
}

function buildAgentScheduleArrangement(
  item: OrbitScheduleItem,
): AppScheduleArrangementViewModel {
  const start = scheduleDateParts(item.startsAt);
  const end = scheduleDateParts(
    item.endsAt ??
      new Date(Date.parse(item.startsAt) + 60 * 60_000).toISOString(),
  );
  return {
    actionLabel: "查看活动",
    evidenceIds: item.evidenceIds,
    href: `/app/events/${encodeURIComponent(item.eventId)}`,
    id: `agent-schedule-${item.id}`,
    primaryName: item.title,
    reason: "你已确认把这场活动加入 Orbit Schedule。",
    secondaryName: `地点：${item.location ?? "待定"}`,
    sourceContext: `来源：Orbit Agent，证据 ${item.evidenceIds.length} 条`,
    statusLabel: "已确认",
    target: { id: item.eventId, kind: "event" },
    targetState: "ready",
    timing: `活动时间：${start.year}年${start.month}月${start.day}日 ${start.hour}:${start.minute}-${end.hour}:${end.minute}`,
  };
}

export function createAppScheduleRouteServices(
  mode?: ModuleMode | string,
): AppScheduleRouteServices {
  return {
    contacts: createContactsListSearchAndFilterService(mode),
    events: createEventCrudAndImportService(mode),
    followups: createFollowupTaskGenerationService(mode),
  };
}

export async function loadAppScheduleRouteViewModel(
  controls: AppScheduleRouteControls = {},
  services?: AppScheduleRouteServices,
  actorId?: string | null,
): Promise<AppScheduleRouteViewModel> {
  const requestedScenario = controls.scenario;
  const scenario = requestedScenario ?? undefined;
  const servicesWereProvided = services !== undefined;
  const sourceResults = await loadScheduleSourceResults({
    actorId,
    scenario,
    services: services ?? createAppScheduleRouteServices(),
  });

  const { contactResult, eventResult, followupResult, results } = sourceResults;
  const agentScheduleItems =
    requestedScenario || servicesWereProvided
      ? []
      : await listConfiguredOrbitScheduleItems(actorId);

  if (requestedScenario) {
    return {
      routeState: routeStateViewModel({
        results,
        scenario: requestedScenario,
      }),
      state: "route-state",
    };
  }

  const contacts = contactResult.success ? contactResult.data.contacts : [];
  const events = eventResult.success ? eventResult.data.events : [];
  const followupTasks = followupResult.success ? followupResult.data.tasks : [];
  const contact = selectScheduleContact(contacts, followupTasks);
  const event = selectScheduleEvent(events);
  const contactTask = contact
    ? followupTaskForContact(contact, followupTasks)
    : null;
  const arrangements = [
    ...(contact
      ? [
          buildContactArrangement({
            contact,
            followupTask: contactTask,
          }),
        ]
      : []),
    ...(event ? [buildEventArrangement({ event })] : []),
    ...agentScheduleItems.map(buildAgentScheduleArrangement),
  ];

  if (arrangements.length === 0) {
    const routeScenario = routeScenarioForResults(results) ?? "empty";

    return {
      routeState: routeStateViewModel({
        results,
        scenario: routeScenario,
      }),
      state: "route-state",
    };
  }

  return {
    arrangements,
    evidenceIds: [
      ...new Set([
        ...uniqueEvidenceIds(results),
        ...agentScheduleItems.flatMap((item) => item.evidenceIds),
      ]),
    ],
    state: "success",
    summary: `已从当前可用的联系人、活动和跟进来源整理 ${arrangements.length} 条可复核安排。`,
  };
}

export const __internal = {
  followupTaskForContact,
  normalizedEntityIdentity,
  selectScheduleContact,
  selectScheduleEvent,
};
