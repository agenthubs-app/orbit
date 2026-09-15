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
