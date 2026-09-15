export type SyncEntityKind =
  | "contact"
  | "note"
  | "task"
  | "relationship_followup"
  | "personal_schedule"
  | "inbox_item";

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

export type SyncChangeKind = "note" | "task" | "personal_schedule";

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
