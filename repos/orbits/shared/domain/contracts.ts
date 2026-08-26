import type {
  AiAnalysisType,
  InteractionMemoryType,
  MatchRecommendationType,
  MeetingMode,
  MeetingStatus,
  NetworkCategory,
  PermissionState,
  PreferredLanguage,
  RecommendationTestCaseType,
  RecommendationTestExpectedOutcome,
  RelationshipStage,
  RelationshipTargetType,
  RelationshipTrustLevel,
  RelationshipValueType,
  SeniorityLevel,
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
  // 名片档案扩展（全部可选，容忍稀疏数据）。
  headline?: string;
  organization?: string;
  handles?: ContactHandlesDTO;
  publicProfile?: PublicProfileDTO;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

// ContactHandlesDTO 收拢社交联系方式；供用户档案与联系人复用。
// email/phone 已在 ContactDTO 有 primary* 字段，这里补社媒句柄。
export interface ContactHandlesDTO {
  email?: string;
  phone?: string;
  wechatId?: string;
  lineId?: string;
  website?: string;
}

// PublicProfileDTO 是「名片社交档案」共享形状，
// 由 features/contacts 的 ContactDetailPublicProfile 提升为跨模块复用。
// offering/seeking/topics 是档案级自我价值标签，
// 与活动级 EventParticipantIntentDTO.canOffer/lookingFor 区分。
export interface PublicProfileDTO {
  bio?: string;
  selfIntroduction?: string;
  industry?: string;
  seniorityLevel?: SeniorityLevel;
  offering?: readonly string[];
  seeking?: readonly string[];
  topics?: readonly string[];
  conversationPrompts?: readonly string[];
}

export type NetworkPersonKind = "platform_user" | "external_contact";

export type PersonRelationshipConnectionMethod =
  | "offline_meeting"
  | "business_card"
  | "qr_scan"
  | "referral"
  | "shared_event";

export interface NetworkPersonDTO {
  id: OrbitId;
  personKind: NetworkPersonKind;
  platformUserId?: OrbitId;
  displayName: string;
  organization?: string;
  role?: string;
  location?: string;
  primaryEmail?: string;
  profileSnippet?: string;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface PersonRelationshipEdgeDTO {
  id: OrbitId;
  fromPersonId: OrbitId;
  toPersonId: OrbitId;
  relationshipType: string;
  connectionMethod: PersonRelationshipConnectionMethod;
  introducedByPersonId?: OrbitId;
  relationshipStrength: number;
  trustLevel?: RelationshipTrustLevel;
  sharedTopics: readonly string[];
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
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

// NextActionDTO 是结构化的「下一步行动」：正文 + 理由 + 可追溯证据。
// 此前联系人上的 nextAction 只是一个裸字符串。
export interface NextActionDTO {
  text: string;
  reason?: string;
  evidenceId?: OrbitId;
}

export interface ContactDTO {
  id: OrbitId;
  personId?: OrbitId;
  displayName: string;
  organization?: string;
  role?: string;
  location?: string;
  primaryEmail?: string;
  primaryPhone?: string;
  profileSnippet?: string;
  /** 名片确认时未进固定字段的抽取信息聚合（逐行、带原标签）。 */
  notes?: string;
  stage: RelationshipStage;
  // 名片夹扩展（全部可选，容忍稀疏数据）。
  handles?: ContactHandlesDTO;
  publicProfile?: PublicProfileDTO;
  networkCategory?: NetworkCategory;
  nextAction?: NextActionDTO;
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

// GeoCoordinateDTO 为真实地图视图提供经纬度；缺失时 UI 回退示意坐标。
export interface GeoCoordinateDTO {
  lat: number;
  lng: number;
}

// EventAgendaItemDTO 是活动日程条目；活动详情与派对页会渲染真实日程。
export interface EventAgendaItemDTO {
  id: OrbitId;
  time: string;
  startsAt?: IsoDateTimeString;
  label: string;
  description?: string;
}

export interface EventDTO {
  id: OrbitId;
  name: string;
  location?: string;
  startsAt: IsoDateTimeString;
  endsAt?: IsoDateTimeString;
  // 内容/功能扩展（全部可选，缺失即隐藏对应 UI）。
  description?: string;
  tags?: readonly string[];
  industry?: string;
  capacity?: number;
  address?: string;
  geo?: GeoCoordinateDTO;
  agenda?: readonly EventAgendaItemDTO[];
  organizerId?: OrbitId;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
}

// SeatAssignmentDTO 承载派对座位/桌次分配，也解决联系人 encounter 的桌号。
export interface SeatAssignmentDTO {
  tableLabel: string;
  tableNumber?: number;
  seatLabel: string;
}

// OrganizerDTO 是独立主办方实体；此前主办方只是活动上的字符串标签。
export interface OrganizerDTO {
  id: OrbitId;
  slug: string;
  name: string;
  accountId?: OrbitId;
  handle?: string;
  avatarAssetUrl?: string;
  bio?: string;
  verified?: boolean;
  rating?: number;
  ratingCount?: number;
  eventsHostedCount?: number;
  cumulativeAttendees?: number;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

// MeetingDTO 是「有具体时刻的会面」；区别于 TaskDTO（提醒/待办）。
// 承载日程页需要的时刻、时长、地点与确认状态。
export interface MeetingDTO {
  id: OrbitId;
  title: string;
  startsAt: IsoDateTimeString;
  status: MeetingStatus;
  contactId?: OrbitId;
  connectionId?: OrbitId;
  eventId?: OrbitId;
  endsAt?: IsoDateTimeString;
  durationMinutes?: number;
  mode?: MeetingMode;
  location?: string;
  notes?: string;
  source: SourceReferenceDTO;
  evidenceIds: EvidenceIdList;
  createdAt: IsoDateTimeString;
  updatedAt: IsoDateTimeString;
}

export interface RelationshipTargetReferenceDTO {
  type: RelationshipTargetType;
  id: OrbitId;
}

export interface EventParticipantIntentDTO {
  id: OrbitId;
  eventId: OrbitId;
  attendeeId: OrbitId;
  personId?: OrbitId;
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
  targetPersonId?: OrbitId;
  contactId?: OrbitId;
  connectionId?: OrbitId;
  introducedByPersonId?: OrbitId;
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
  targetPersonId?: OrbitId;
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
  subject?: string;
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
