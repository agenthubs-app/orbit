import type {
  PermissionState,
  RelationshipStage,
  RelationshipValueType,
  SourceReferenceDTO,
  SourceType,
} from "./source-types";

export type OrbitId = string;
export type IsoDateTimeString = string;
export type EvidenceIdList = readonly [OrbitId, ...OrbitId[]];

export interface AccountDTO {
  id: OrbitId;
  name: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface UserProfileDTO {
  id: OrbitId;
  accountId: OrbitId;
  displayName: string;
  role?: string;
  timezone?: string;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface RelationshipEvidenceDTO {
  id: OrbitId;
  sourceType: SourceType;
  sourceId: string;
  summary: string;
  occurredAt: IsoDateTimeString;
  confidence: number;
  createdBy: OrbitId;
}

export interface ContactDTO {
  id: OrbitId;
  displayName: string;
  organization?: string;
  role?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  stage: RelationshipStage;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface ConnectionDTO {
  id: OrbitId;
  accountId: OrbitId;
  contactId: OrbitId;
  stage: RelationshipStage;
  valueTypes: readonly RelationshipValueType[];
  summary: string;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface EventDTO {
  id: OrbitId;
  name: string;
  location?: string;
  startsAt: IsoDateTimeString;
  endsAt?: IsoDateTimeString;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
}

export interface TaskDTO {
  id: OrbitId;
  title: string;
  status: "open" | "scheduled" | "completed" | "dismissed";
  contactId?: OrbitId;
  connectionId?: OrbitId;
  dueAt?: IsoDateTimeString;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface ConversationDTO {
  id: OrbitId;
  participantContactIds: readonly OrbitId[];
  channel: "email" | "calendar" | "chat" | "note";
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  updatedAt: IsoDateTimeString;
}

export interface MessageDTO {
  id: OrbitId;
  conversationId: OrbitId;
  direction: "inbound" | "outbound" | "internal_note";
  body: string;
  occurredAt: IsoDateTimeString;
  createdBy: OrbitId;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
}

export interface DashboardDTO {
  id: OrbitId;
  accountId: OrbitId;
  generatedAt: IsoDateTimeString;
  items: readonly DashboardItemDTO[];
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
}

export interface DashboardItemDTO {
  id: OrbitId;
  title: string;
  summary: string;
  valueType?: RelationshipValueType;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
}

export interface AgentActionDTO {
  id: OrbitId;
  type: "draft_message" | "schedule_reminder" | "prepare_intro" | "summarize_context";
  status: "queued" | "awaiting_confirmation" | "approved" | "rejected" | "completed";
  confirmationRequired: boolean;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface PermissionStateDTO {
  id: OrbitId;
  capability: string;
  state: PermissionState;
  updatedAt: IsoDateTimeString;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
}

export interface NotificationDTO {
  id: OrbitId;
  channel: "in_app" | "email" | "calendar" | "system";
  title: string;
  body: string;
  status: "pending" | "sent" | "failed" | "dismissed";
  scheduledFor?: IsoDateTimeString;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
}
