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
  location?: string;
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
  sourceNoteId?: string;
  sourceNoteVersion?: number;
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
  relatedContactIds?: readonly string[];
  sourceNoteId?: string;
  sourceNoteVersion?: number;
}

export interface ScheduleItemContract {
  allDay?: boolean;
  timeZone?: string;
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

export interface PersonalScheduleContract extends ScheduleItemContract {
  recurrence?: { frequency: "daily" | "weekly" | "monthly"; until?: string };
  reminderMinutes?: 0 | 5 | 15 | 30 | 60 | 1440;
  seriesId?: string;
  occurrenceDate?: string;
  allDay?: boolean;
  timeZone?: string;
  meetingMethod?: "video" | "in_person" | "phone" | "unspecified";
  meetingUrl?: string;
  contactIds?: string[];
  noteIds?: string[];
  kind: "personal";
  category: "personal";
  accountId: string;
  ownerUserId: string;
  createdAt: string;
  updatedAt: string;
}
