export type TaskCategory =
  | "relationship"
  | "meeting"
  | "event"
  | "work"
  | "personal"
  | "other";

export type TaskStatus = "open" | "completed" | "cancelled";

export interface TaskItemContract {
  id: string;
  accountId: string;
  ownerUserId: string;
  title: string;
  notes?: string;
  status: TaskStatus;
  category: TaskCategory;
  plannedDate?: string;
  dueAt?: string;
  priority: "normal" | "high";
  source: "manual" | "ai_confirmed" | "contact" | "event" | "inbox";
  relatedContactId?: string;
  relatedEventId?: string;
  relatedMeetingId?: string;
  relatedConversationId?: string;
  suggestionId?: string;
  completedAt?: string;
  completedBy?: string;
  completionSource?: "user" | "agent_confirmed" | "notification_action";
  createdAt: string;
  updatedAt: string;
}

export interface TaskSuggestionContract {
  id: string;
  title: string;
  reason: string;
  category: TaskCategory;
  status: "pending" | "accepted" | "dismissed" | "snoozed" | "expired";
  suggestedPlannedDate?: string;
  suggestedDueAt?: string;
  relatedContactId?: string;
  relatedEventId?: string;
  relatedMeetingId?: string;
}

export interface ScheduleItemContract {
  id: string;
  kind: "meeting" | "event" | "personal";
  category: TaskCategory;
  state: "upcoming" | "ongoing" | "ended" | "cancelled";
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: string;
  sourceId: string;
}
