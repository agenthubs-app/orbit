export const TASK_CATEGORIES = [
  "relationship",
  "meeting",
  "event",
  "work",
  "personal",
  "other",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_STATUSES = ["open", "completed", "cancelled"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = "normal" | "high";
export type TaskSource =
  | "manual"
  | "ai_confirmed"
  | "contact"
  | "event"
  | "inbox";
export type TaskCompletionSource =
  | "user"
  | "agent_confirmed"
  | "notification_action";

export interface TaskItemDTO {
  id: string;
  accountId: string;
  ownerUserId: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  category: TaskCategory;
  plannedDate?: string;
  dueAt?: string;
  priority: TaskPriority;
  source: TaskSource;
  relatedContactId?: string;
  relatedEventId?: string;
  relatedMeetingId?: string;
  relatedConversationId?: string;
  suggestionId?: string;
  completedAt?: string;
  completedBy?: string;
  completionSource?: TaskCompletionSource;
  createdAt: string;
  updatedAt: string;
}

export type TaskActivityType =
  | "created"
  | "updated"
  | "rescheduled"
  | "completed"
  | "reopened"
  | "cancelled"
  | "deleted";

export type TaskActivityActorType =
  | "user"
  | "agent"
  | "system"
  | "notification_action";

export interface TaskActivityDTO {
  id: string;
  accountId: string;
  ownerUserId: string;
  taskId: string;
  type: TaskActivityType;
  actorType: TaskActivityActorType;
  actorId?: string;
  occurredAt: string;
  taskSnapshot: {
    title: string;
    category: TaskCategory;
    relatedContactId?: string;
    relatedEventId?: string;
  };
  changes?: Readonly<Record<string, unknown>>;
}

export type TaskSuggestionStatus =
  | "pending"
  | "accepted"
  | "dismissed"
  | "snoozed"
  | "expired";

export interface TaskSuggestionDTO {
  id: string;
  accountId: string;
  ownerUserId: string;
  title: string;
  reason: string;
  category: TaskCategory;
  status: TaskSuggestionStatus;
  suggestedPlannedDate?: string;
  suggestedDueAt?: string;
  relatedContactId?: string;
  relatedEventId?: string;
  relatedMeetingId?: string;
  relatedConversationId?: string;
  evidenceIds: readonly string[];
  confidence: number;
  deduplicationKey: string;
  nextVisibleAt?: string;
  expiresAt?: string;
  acceptedTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TaskRecordPayload {
  version: 1;
  task: TaskItemDTO;
  activities: readonly TaskActivityDTO[];
}
