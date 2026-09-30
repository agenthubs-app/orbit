export type SyncEntityKind =
  | "contact"
  | "note"
  | "task"
  | "relationship_followup"
  | "personal_schedule"
  | "inbox_item"
  // Sprint 0115: the registered attendee's event day (dedicated-table domains).
  | "event_registration"
  | "registered_event"
  | "event_published_result"
  // Sprint 0117: one stored record of the account's dashboard graph (sync domain dashboard-graph).
  | "dashboard_graph"
  // Sprint 0118: a typed inbox notification; an AI session (list row); a message of an opened AI session.
  | "inbox_notification"
  | "ai_session"
  | "ai_session_message"
  // Sprint 0119: a relationship conversation the account is a member of; one message of it (full history).
  | "relationship_conversation"
  | "relationship_message";

export type LocalSyncState = "synced" | "pending" | "conflicted" | "failed";
export type AiSyncVisibility = "available_when_synced" | "excluded";

export interface SyncRecord<TPayload = unknown> {
  actorId: string;
  workspaceId: string;
  kind: SyncEntityKind;
  id: string;
  revision: string;
  updatedAt: string;
  deletedAt: string | null;
  payload: TPayload | null;
  syncState: LocalSyncState;
  aiVisibility: AiSyncVisibility;
}

// Sprint 0116: "contact" — the contacts domain (a contact with its relationships, detail state and cited sources).
// Sprint 0117: "dashboard_graph" — one stored record of the account's dashboard graph.
// Sprint 0118: "inbox_notification", "ai_session", "ai_session_message" (sync domains inbox-notifications, ai-sessions, ai-session-messages).
// Sprint 0119: "relationship_conversation", "relationship_message" (sync domains relationship-conversations, relationship-messages).
export type SyncChangeKind = "note" | "task" | "personal_schedule" | "event_registration" | "registered_event" | "event_published_result" | "contact" | "dashboard_graph" | "inbox_notification" | "ai_session" | "ai_session_message" | "relationship_conversation" | "relationship_message";

export interface SyncChange<TPayload = unknown> {
  kind: SyncChangeKind;
  id: string;
  revision: string;
  operation: "upsert" | "delete";
  updatedAt: string;
  payload?: TPayload;
  aiVisibility: AiSyncVisibility;
}

export interface SyncPage {
  workspaceId: string;
  changes: readonly SyncChange[];
  nextCursor: string;
  hasMore: boolean;
  highWatermark: string;
  serverTime: string;
}
