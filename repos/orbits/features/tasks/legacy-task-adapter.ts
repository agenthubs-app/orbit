import type { TaskDTO as LegacyTaskDTO } from "../../shared/domain/contracts";
import type { TaskItemDTO, TaskSource, TaskStatus } from "./contract";

function legacyStatus(status: LegacyTaskDTO["status"]): TaskStatus {
  if (status === "completed") {
    return "completed";
  }
  if (status === "dismissed") {
    return "cancelled";
  }
  return "open";
}

function legacySource(sourceType: string): TaskSource {
  if (sourceType === "manual") {
    return "manual";
  }
  if (sourceType === "event" || sourceType.startsWith("event_")) {
    return "event";
  }
  if (sourceType === "inbox" || sourceType === "email") {
    return "inbox";
  }
  return "ai_confirmed";
}

export function legacyTaskToTaskItem(
  legacyTask: LegacyTaskDTO,
  actorId: string,
): TaskItemDTO {
  const status = legacyStatus(legacyTask.status);

  return {
    id: legacyTask.id,
    accountId: actorId,
    ownerUserId: actorId,
    title: legacyTask.title,
    status,
    category: "relationship",
    ...(legacyTask.dueAt ? { dueAt: legacyTask.dueAt } : {}),
    priority: "normal",
    source: legacySource(legacyTask.source.type),
    ...(legacyTask.contactId
      ? { relatedContactId: legacyTask.contactId }
      : {}),
    ...(status === "completed"
      ? {
          completedAt: legacyTask.updatedAt,
          completedBy: actorId,
          completionSource: "user" as const,
        }
      : {}),
    createdAt: legacyTask.createdAt,
    updatedAt: legacyTask.updatedAt,
  };
}
