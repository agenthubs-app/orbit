import type {
  AiAnalysisType,
  InteractionMemoryType,
  MatchRecommendationType,
  PermissionState,
  PreferredLanguage,
  RecommendationTestCaseType,
  RecommendationTestExpectedOutcome,
  RelationshipStage,
  RelationshipTargetType,
  RelationshipTrustLevel,
  RelationshipValueType,
  SourceReferenceDTO,
  SourceType,
} from "./source-types";

// shared/domain/contracts 放核心 DTO，表示 Orbit 领域对象的最小稳定形状。
// feature mock payload 可以更丰富，但跨模块共享时应能落回这些 DTO 概念。
export type OrbitId = string;
export type IsoDateTimeString = string;
// EvidenceIdList 至少包含一个 evidence id，强制关键对象可追溯来源。
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
  location?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  profileSnippet?: string;
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
  relationshipStrength?: number;
  trustLevel?: RelationshipTrustLevel;
  businessRelevanceScore?: number;
  sharedTopics?: readonly string[];
  suggestedActions?: readonly string[];
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

export interface RelationshipTargetReferenceDTO {
  type: RelationshipTargetType;
  id: OrbitId;
}

export interface EventParticipantIntentDTO {
  id: OrbitId;
  eventId: OrbitId;
  attendeeId: OrbitId;
  contactId?: OrbitId;
  lookingFor: readonly string[];
  canOffer: readonly string[];
  preferredLanguage: PreferredLanguage;
  confidence: number;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface AiAnalysisDTO {
  id: OrbitId;
  analysisType: AiAnalysisType;
  target: RelationshipTargetReferenceDTO;
  resultJson: Readonly<Record<string, unknown>>;
  confidence: number;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
}

export interface MatchRecommendationDTO {
  id: OrbitId;
  eventId: OrbitId;
  attendeeId?: OrbitId;
  contactId: OrbitId;
  connectionId?: OrbitId;
  recommendationType: MatchRecommendationType;
  score: number;
  businessRelevanceScore: number;
  sharedTopics: readonly string[];
  suggestedActions: readonly string[];
  reason: string;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface InteractionMemoryDTO {
  id: OrbitId;
  contactId: OrbitId;
  connectionId?: OrbitId;
  conversationId?: OrbitId;
  messageId?: OrbitId;
  memoryType: InteractionMemoryType;
  summary: string;
  occurredAt: IsoDateTimeString;
  confidence: number;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
}

export interface RecommendationTestRecordDTO {
  id: OrbitId;
  caseType: RecommendationTestCaseType;
  eventId: OrbitId;
  attendeeId?: OrbitId;
  contactId?: OrbitId;
  connectionId?: OrbitId;
  recommendationId?: OrbitId;
  expectedOutcome: RecommendationTestExpectedOutcome;
  reason: string;
  confidence: number;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
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
