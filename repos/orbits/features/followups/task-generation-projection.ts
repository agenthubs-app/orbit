import type {
  ConnectionDTO,
  ContactDTO,
  TaskDTO,
} from "../../shared/domain/contracts";
import type {
  FollowupTask,
  FollowupTaskGenerationGenerateInput,
  FollowupTaskGenerationListInput,
  FollowupTaskGenerationScenario,
  FollowupTaskPriority,
  FollowupTaskTriggerKind,
} from "./contract";
import { tokyoCalendarDaysUntil } from "../../shared/utils/tokyo-calendar-days";

type FollowupTaskGenerationInput =
  | FollowupTaskGenerationListInput
  | FollowupTaskGenerationGenerateInput;

const supportedScenarios = new Set<FollowupTaskGenerationScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

const supportedTriggerKinds = new Set<FollowupTaskTriggerKind>([
  "new_connection",
  "event_encounter",
  "promised_action",
  "dormant_relationship",
]);

export function normalizeFollowupTaskGenerationScenario(
  scenario?: string | null,
): FollowupTaskGenerationScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as FollowupTaskGenerationScenario)
  ) {
    return scenario as FollowupTaskGenerationScenario;
  }

  return "success";
}

export function normalizeFollowupTaskGenerationLimit(
  limit?: number | null,
): number | null {
  if (!Number.isFinite(limit ?? Number.NaN)) {
    return null;
  }

  return Math.max(0, Math.floor(limit as number));
}

export function followupTriggerKindFor(task: TaskDTO): FollowupTaskTriggerKind {
  switch (task.source.type) {
    case "event_import":
      return "event_encounter";
    case "calendar_signal":
      return "dormant_relationship";
    case "agent_action":
    case "email_signal":
      return "promised_action";
    case "manual":
    default:
      return "new_connection";
  }
}

export function selectedFollowupTriggerKinds(
  input: FollowupTaskGenerationInput,
): readonly FollowupTaskTriggerKind[] | null {
  if ("triggerKinds" in input && Array.isArray(input.triggerKinds)) {
    const kinds = input.triggerKinds.filter(
      (kind): kind is FollowupTaskTriggerKind =>
        supportedTriggerKinds.has(kind as FollowupTaskTriggerKind),
    );

    return kinds.length > 0 ? kinds : null;
  }

  if (
    "triggerKind" in input &&
    input.triggerKind &&
    supportedTriggerKinds.has(input.triggerKind as FollowupTaskTriggerKind)
  ) {
    return [input.triggerKind as FollowupTaskTriggerKind];
  }

  return null;
}

export function followupConnectionIdFor(
  input: FollowupTaskGenerationInput,
): string | null {
  if (!("connectionId" in input)) {
    return null;
  }

  return input.connectionId?.trim() || null;
}

export function followupContactForTask(
  task: TaskDTO,
  contactsById: ReadonlyMap<string, ContactDTO>,
): ContactDTO | null {
  return task.contactId ? contactsById.get(task.contactId) ?? null : null;
}

export function followupConnectionForTask(
  task: TaskDTO,
  connectionsById: ReadonlyMap<string, ConnectionDTO>,
): ConnectionDTO | null {
  return task.connectionId
    ? connectionsById.get(task.connectionId) ?? null
    : null;
}

// W0044：到期天数 = 截止日与「现在」的东京日历日差，逾期为负（不再夹成 0）。
// `now` 由调用方注入：live 路径是每次请求取一次的真实时钟，hybrid 夹具路径是夹具时钟；
// 不得用任何记录的 updatedAt 代替。无 dueAt／时间非法时兜底 7（行为同改前）。
export function followupDaysUntil(
  dueAt: string | undefined,
  now: string,
): number {
  if (!dueAt) {
    return 7;
  }

  return tokyoCalendarDaysUntil(dueAt, now) ?? 7;
}

// 逾期（负数）仍归 "today"：不新增枚举值，逾期由展示层按 dueInDays < 0 推出（W44-1）。
export function followupPriorityFor(
  dueInDays: number,
): FollowupTaskPriority {
  if (dueInDays <= 1) {
    return "today";
  }

  if (dueInDays <= 7) {
    return "this_week";
  }

  return "nurture";
}

export function filterFollowupTasks(
  tasks: readonly FollowupTask[],
  input: FollowupTaskGenerationInput,
): readonly FollowupTask[] {
  const kinds = selectedFollowupTriggerKinds(input);
  const connectionId = followupConnectionIdFor(input);
  const limit = normalizeFollowupTaskGenerationLimit(input.limit);
  const filtered = tasks.filter((task) => {
    const matchesKind = kinds ? kinds.includes(task.triggerKind) : true;
    const matchesConnection = connectionId
      ? task.connectionId === connectionId
      : true;

    return matchesKind && matchesConnection;
  });

  return limit === null ? filtered : filtered.slice(0, limit);
}
