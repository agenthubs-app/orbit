// 跨客户端契约的公开出口。
// 网页版、API route 与 iOS App 都从这里（或它拷贝出去的副本）取响应形状。
// 新增领域时在这里补一行 export，并同步 repos/orbit-app 的契约副本。

export type {
  ApiEnvelopeContract,
  ApiErrorBodyContract,
  ApiErrorCodeContract,
  ApiFailureEnvelopeContract,
  ApiSuccessEnvelopeContract
} from "./envelope";

export type {
  RelationshipStageCode,
  RelationshipValueTypeCode,
  SourceReferenceContract,
  SourceTypeCode
} from "./source";

export type {
  EventCaptureMethodCode,
  EventEvidenceContract,
  EventOriginContract,
  EventRecordContract,
  EventStatusCode
} from "./events";

export type {
  FollowupAuditContract,
  FollowupPriorityCode,
  FollowupSourceReferenceContract,
  FollowupTaskContract,
  FollowupTriggerContract,
  FollowupTriggerKindCode
} from "./followups";

export type {
  ContactHandlesContract,
  ManualProfileContract,
  ProfileCompletenessContract,
  ProfileCompletenessFieldCode,
  ProfileCompletenessStatusCode,
  ProfileEditorStateContract,
  ProfileViewStateCode,
  SeniorityLevelCode
} from "./profile";

export type {
  OrbitAiConversationSummaryContract,
  OrbitAiMessageContract,
  OrbitAiMessageRoleCode,
  OrbitAiProposedToolIntentContract,
  OrbitAiToolFamilyCode
} from "./orbit-ai";

export type {
  ContactEvidenceContract,
  ContactFilterOptionContract,
  ContactListItemContract,
  ContactRelationshipValueContract,
  ContactSourceFilterCode,
  ContactSourceReferenceContract,
  ContactStatusFilterCode,
  ContactTagFilterCode,
  ContactValueFilterCode,
  ContactsAppliedFiltersContract,
  ContactsAvailableFiltersContract,
  ContactsListPayloadContract,
  ContactsListProvenanceContract,
  ContactsListStateCode
} from "./contacts";
