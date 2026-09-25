// 跨客户端契约的公开出口。
// 网页版、API route 与 iOS App 都从这里（或它拷贝出去的副本）取响应形状。
// 新增领域时在这里补一行 export，并同步 repos/orbit-app 的契约副本。

export type { OrbitLanguage } from "./language";
export type {
  PortraitAnswerProof,
  PortraitField,
  PortraitGeneration,
  PortraitPersona,
  PortraitPreviewResult,
  PortraitQuestionSnapshot,
  PortraitReadResult,
  PortraitReceipt,
  PortraitRegistrationSource,
  PortraitSaveBody,
  PortraitSaveResult,
  PortraitSourceAnswer,
  SavedPortrait
} from "./event-registration-portrait";
export type { AiContactArtifactContract, AiContactArtifactItemContract, AiContactArtifactStatus, AiSessionArtifactRecoveryContract, AiSessionArtifactTurnContract } from "./ai-artifacts";

export type {
  IndustryDefinitionContract,
  IndustryIdCode
} from "./industries";

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
  EventExperienceConfigurationContract,
  EventExperienceHeadContract,
  EventExperiencePreviewResponseContract,
  EventExperienceQuestionContract,
  EventExperienceQuestionSetContract,
  EventExperienceSnapshotContract,
  EventExperienceVersionContract
} from "./event-experience";

export type { PasswordResetResponse } from "./password-reset";

export type {
  PersonalScheduleAssociationKind,
  PersonalScheduleAssociationOption,
  PersonalScheduleAssociationOptionsPage
} from "./personal-schedule-associations";

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
  AiSessionEntryPointId,
  AiSessionGroupContract,
  AiSessionGroupCreateContract,
  AiSessionGroupDeleteContract,
  AiSessionGroupMutationContract,
  AiSessionOrganizationContract,
  AiSessionOrganizationMutationContract,
  AiSessionOriginContract,
  AiSessionOriginInputContract,
  AiSessionReferenceContract,
  AiSessionReferenceType,
  LegacyAiSessionOriginContract,
  ReliableAiSendInputContract,
  ReliableAiSendReceiptContract,
  ReliableAiSendState,
  StoredAiSessionOriginContract
} from "./ai-sessions";

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

export type {
  ScheduleItemContract,
  TaskCategory,
  TaskItemContract,
  TaskStatus,
  TaskSuggestionContract
} from "./tasks";

export type {
  MeetingDetailsActorRole,
  MeetingDetailsContract,
  MeetingDetailsMedium,
  MeetingDetailsMutationContract
} from "./appointments";

export type {
  NoteContract,
  NoteDetailContract,
  NotesCollectionContract
} from "./notes";

export type {
  DevicePushTokenContract,
  NotificationPermission,
  ReminderChannel,
  ReminderPlanContract,
  ReminderTargetType
} from "./reminders";

export type {
  AgentReminderPreferencesContract,
  NotificationDeliveryChannelCode,
  NotificationDeliveryContract,
  NotificationDeliveryPhaseCode,
  NotificationDeliveryStatusCode,
  PushDeviceContract,
  PushDevicePlatformCode,
  PushPermissionStateCode
} from "./notifications";

export type {
  BusinessCardBatchConfirmationResponseContract,
  BusinessCardBatchContract,
  BusinessCardBatchDetailContract,
  BusinessCardBatchFinishResponseContract,
  BusinessCardBatchItemContract,
  BusinessCardBatchItemErrorCode,
  BusinessCardBatchItemStatus,
  BusinessCardBatchRetryResponseContract,
  BusinessCardBatchReviewInputContract,
  BusinessCardBatchSkipResponseContract,
  BusinessCardBatchSourceFileContract,
  BusinessCardBatchStatus,
  BusinessCardCloudOcrUsageContract,
  BusinessCardContactPointContract,
  BusinessCardContactPointType,
  BusinessCardLabeledValueContract,
  BusinessCardReviewIssueCode,
  BusinessCardReviewIssueContract,
  BusinessCardStructuredExtractionContract,
  IngestBatchActionResponseContract,
  IngestBatchCollectionResponseContract,
  IngestBatchContract,
  IngestBatchCreateResponseContract,
  IngestBatchDetailContract,
  IngestBatchStatus,
  IngestBatchSummaryContract,
  IngestConfirmationResponseContract,
  IngestFinalizeResponseContract,
  IngestItemActionResponseContract,
  IngestItemContract,
  IngestItemErrorCode,
  IngestItemErrorStage,
  IngestItemStatus,
  IngestManifestEntryContract,
  IngestUploadResponseContract
} from "./business-card-batch";
export type {
  RelationshipConversationDTO,
  RelationshipConversationListDTO,
  RelationshipDeliveryReceiptDTO,
  RelationshipEligibilityDTO,
  RelationshipEligibilityStatus,
  RelationshipInvitationDTO,
  RelationshipInvitationPreviewDTO,
  RelationshipMessageDTO,
  RelationshipReadReceiptDTO,
  RelationshipRemoteAccountDTO,
} from "./relationship-communication";
export type {
  AiSyncVisibility,
  LocalSyncState,
  SyncEntityKind,
  SyncRecord,
} from "./sync";

export type { InboxNotificationKind, InboxNotificationOrigin, InboxNotificationDisposition, InboxNotificationAction, InboxSourceKind, InboxNotificationSource, InboxNotificationTarget, InboxNotificationDTO, InboxNotificationListDTO, InboxNotificationActionInput, InboxNotificationActionReceipt, InboxNotificationReadBatchInput } from "./inbox-notifications";
export type { NotificationDiscoveryPreferencesDTO, NotificationDiscoveryPreferencesInput, NotificationDiscoveryStatusDTO } from "./notification-discovery";
export type { InboxDeliveryPreferencesDTO, InboxDeliveryPreferencesInput, InboxDeliveryOwnerDTO } from "./notification-delivery-policy";

// Sprint 0097: these六个契约文件一直没进出口，跨端只能各自深引用。
export type {
  AccountLanguagePreferenceSaveContract,
  AccountLanguagePreferenceSaveReceiptContract,
  OrbitLanguagePreferenceContract
} from "./account-language-preference";

export type {
  ContactNeedCriterionContract,
  ContactNeedCriterionMatchContract,
  ContactNeedCriterionTypeCode,
  ContactNeedDimensionCode,
  ContactNeedMatchContract,
  ContactNeedMatchStatusCode,
  ContactNeedScoreComponentContract,
  ContactNeedsMatchesPayloadContract,
  ContactNeedsStateCode,
  ContactNeedSummaryContract
} from "./contact-needs";

export type {
  CanonicalResult,
  Mutation,
  MutationKind,
  MutationOperation,
  MutationResult
} from "./offline-mutations";

export type {
  BinaryPolicy,
  MutationPolicy,
  OfflinePolicy,
  OfflinePolicyRegistration,
  ReadPersistence
} from "./offline-policy";

export type {
  RelationshipCompletionInput,
  RelationshipCompletionOutcome,
  RelationshipInitializationChoice,
  RelationshipInitializationInput,
  RelationshipInitializationRead,
  RelationshipLifecycleSnapshotDTO,
  RelationshipLifecycleStage,
  RelationshipTaskSummary
} from "./relationship-lifecycle";

export type {
  AssetManifest,
  CursorClaims,
  DomainChange,
  DomainManifest,
  DomainManifestEntry,
  DomainPage,
  OfflineReadEnvelope,
  OfflineReadGrant,
  ReadCompleteness,
  ReadGrant,
  ReadIdentityState,
  ReadScope,
  ReadSurface
} from "./universal-read";
export type {InboxSummaryDTO} from './inbox-summary';
export type { ContactCardDTO, ContactCardPageDTO, ContactCardSummaryDTO } from "./contact-card-page";
