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
export type { AiSessionSummaryItemContract, AiSessionSummaryPageContract } from "./ai-session-page";

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
  TaskPlanLink,
  TaskStatus,
  TaskSuggestionContract
} from "./tasks";
export type { TaskCardContract, TaskPageContract } from "./task-page";
export type {
  TodayActionSummaryContract,
  TodayScheduleActionSummaryContract,
  TodayTaskActionSummaryContract,
  TodayTaskCategoryContract,
  TodayTaskModeContract,
  TodayTaskPageModeContract,
  TodayTaskSummaryModeContract
} from "./today";

export type {
  MeetingDetailsActorRole,
  MeetingDetailsContract,
  MeetingDetailsMedium,
  MeetingDetailsMutationContract,
  MeetingProposalDetailsContract,
  MeetingInitialProposalRequestContract,
  MeetingInitialProposalAvailabilityContract
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
  RelationshipConversationSummaryDTO,
  RelationshipConversationSummaryPageDTO,
  RelationshipMessagePageDTO,
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
export type { SecretaryCardKind, SecretaryPreviewItemDTO, SecretaryPreviewDTO } from "./secretary-preview";
export type { NotificationDiscoveryPreferencesDTO, NotificationDiscoveryPreferencesInput, NotificationDiscoveryStatusDTO } from "./notification-discovery";
export type { InboxDeliveryPreferencesDTO, InboxDeliveryPreferencesInput, InboxDeliveryOwnerDTO } from "./notification-delivery-policy";

// Sprint 0097: these六个契约文件一直没进出口，跨端只能各自深引用。
export type {
  AccountLanguagePreferenceSaveContract,
  AccountLanguagePreferenceSaveReceiptContract,
  OrbitLanguagePreferenceContract
} from "./account-language-preference";

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
export type { InboxSummaryDTO } from "./inbox-summary";
export type { LegacyNotificationUnreadSummaryDTO } from "./legacy-notification-unread-summary";
export type { ContactCardDTO, ContactCardPageDTO, ContactCardSummaryDTO } from "./contact-card-page";
export type { ContactLabelsContract } from "./contact-labels";
export type { TaskSuggestionCardContract, TaskSuggestionPageContract } from "./task-suggestion-page";
export type { NoteTaskCardContract, NoteTaskPageContract } from "./note-task-page";
export type { ContactSyncPayload, ContactSyncSearch, LocalContactDirectoryQuery } from "./contact-local-directory";
export type {
  ContactMemoNoteInputContract,
  MemoEventType,
  RelationshipTimelineCaptureMethod,
  RelationshipTimelineItem,
  RelationshipTimelineRefStore,
  RelationshipTimelineResult,
  RelationshipTimelineSource
} from "./relationship-timeline";
export type {
  RelationshipStrength,
  RelationshipStrengthSignal,
  RelationshipStrengthState,
  RelationshipTier,
  RelationshipTierCounts,
  RelationshipTierGroup
} from "./relationship-strength";
export type {
  ContactInsight,
  ContactInsightEvidence,
  ContactInsightEvidenceSource,
  ContactInsightState,
  ContactInsightText
} from "./contact-insight";
// R08 redesign contracts (owners and users in each file).
export type { HomeLayoutContract, HomeLayoutUpdateInput, HomeWidgetKey, HomeWidgetSlot } from "./home-layout";
export type { ContactCompletionAnswerInput, ContactCompletionQuestion, ContactCompletionResult } from "./contact-completion";
// R16：每天一问的题型（契约 3 追加）。
export type { ContactCompletionQuestionKind } from "./contact-completion";
export type { InviteCodeContract, InviteCodePreview, InviteCodeRedeemResult, InviteSharedFields } from "./invite-codes";
// R15：招待コード契约补全（共享项目只传键、预览状态、兑换请求体、历史、连接与解除）。
export type {
  InviteCodeCreateInput, InviteCodeFailureReason, InviteCodeHistoryItem, InviteCodeHistoryJoined, InviteCodeHistoryResponse, InviteCodeHistoryStatus,
  InviteCodeRedeemInput, InviteConnectionView, InviteSharedFieldKey, InviteShareUpdateInput, InviteUnlinkInput, InviteUnlinkResult,
} from "./invite-codes";
// R15 P1：改当前码的共享项目（PUT /api/invite-codes/current/share）。
export type { InviteCodeShareUpdateInput } from "./invite-codes";
export type {
  EventAssessmentContract,
  EventAssessmentCreateInput,
  EventAssessmentCriterion,
  EventAssessmentFacts,
  EventAssessmentPatchInput,
  EventAssessmentScoreItem,
  EventAssessmentSourceKind,
  EventAssessmentStatus,
  EventAssessmentVerdict,
  // R26
  EventAssessmentAgendaItem,
  EventAssessmentAvailability,
  EventAssessmentCaution,
  EventAssessmentDismissResult,
  EventAssessmentDisplay,
  EventAssessmentDisplayValue,
  EventAssessmentFactBasis,
  EventAssessmentFailureReason,
  EventAssessmentFormat,
  EventAssessmentMeetCandidate,
  EventAssessmentPageCandidate,
  EventAssessmentSpeaker
} from "./event-assessment";
export type { MyEventItem, MyEventStatus, MyEventsRange, MyEventsResponse } from "./events-mine";
export type { EventRecommendationDismissInput, EventRecommendationDismissReason, EventRecommendationDismissResult } from "./event-recommendation-feedback";
export type { EventDiscoverArea, EventDiscoverBadge, EventDiscoverCommunityReason, EventDiscoverFormat, EventDiscoverPeriod, EventDiscoverQuery, EventDiscoverResponse, EventDiscoverRow, EventDiscoverSort, EventDiscoverTheme, EventDiscoverWidenSuggestion } from "./event-discover";
export type { EventSearchEventHit, EventSearchOrganizerHit, EventSearchPersonHit, EventSearchResponse } from "./event-search";
export type { EventCodeResolveResponse } from "./event-code";
export type { EventPrepAgendaItem, EventPrepChecklistItem, EventPrepChecklistKey, EventPrepChecklistPatch, EventPrepPerson, EventPrepRelation, EventPrepResponse } from "./event-prep";
export type { OrganizerFollowResult } from "./organizer-follow";
export type { EventOverviewAttendee, EventOverviewRegistrationStatus, EventOverviewResponse } from "./event-overview";
export type { EventVenueExchangeState, EventVenuePerson, EventVenueRelation, EventVenueResponse, EventVenueState } from "./event-venue";
export type { EventAfterConfirmInput, EventAfterConfirmResult, EventAfterHighlight, EventAfterNextStep, EventAfterResponse, EventAfterScoreSlot } from "./event-after";
export type { EventJoinAnswer, EventJoinProfile, EventJoinProfileItemKey, EventJoinQuestion, EventJoinResult, EventJoinStep, EventJoinTentativeResult } from "./event-join";
export type { AccountDeletionRequestContract, AccountExportContract, AccountExportScope, AppVersionContract, AccountDeletionCreateInput, AccountExportCreateInput, AccountExportMode, AccountContactsFormat } from "./account";
export type {
  PlanAwardBasis,
  PlanAwardPart,
  PlanAwardRequest,
  PlanAwardResult,
  PlanBasisRef,
  PlanCitation,
  PlanCommandResult,
  PlanFlowCell,
  PlanGoalKind,
  PlanGoalKindRead,
  PlanGoalListItem,
  PlanGoalListResponse,
  PlanGoalStatus,
  PlanIntakeSource,
  PlanIntroRoute,
  PlanOpenResult,
  PlanPremiseRow,
  PlanPremiseSource,
  PlanQuotaView,
  PlanScoreSegment,
  PlanScoreView,
  PlanSkipRequest,
  PlanStepRequest,
  PlanTodayChance,
  PlanUndoRequest,
  PlanV2Content,
  PlanV2Detail,
  PlanV2EventBlock,
  PlanV2HomeSummary,
  PlanV2PersonType,
  PlanV2Step,
  PlanV2SummaryResponse,
  PlanAiLimitKind,
  PlanAiStepState,
  PlanAiStepView,
  PlanBackgroundMe,
  PlanBackgroundPurpose,
  PlanBackgroundTeam,
  PlanCitationView,
  PlanConfirmResult,
  PlanDraftChange,
  PlanDraftFixRequest,
  PlanDraftManualEditRequest,
  PlanDraftTurn,
  PlanDraftView,
  PlanFlowStepRequest,
  PlanGoalKindRequest,
  PlanGoalKindResult,
  PlanIntakeAnswer,
  PlanIntakeAnswersRequest,
  PlanIntakeBlock,
  PlanIntakeBlockRequest,
  PlanIntakeCreateRequest,
  PlanIntakeLadderRequest,
  PlanIntakeLimits,
  PlanIntakeListItem,
  PlanIntakeListResponse,
  PlanIntakeMembersRequest,
  PlanIntakePremiseRequest,
  PlanIntakeQuestion,
  PlanIntakeStatus,
  PlanIntakeView,
  PlanLadderRung,
  PlanMemberRelation,
  PlanMemberSource,
  PlanReadingItem,
  PlanStance,
  PlanTeamMember,
  PlanCandidateDecisionRequest,
  PlanCandidateDecisionResult,
  PlanCandidateView,
  PlanContactFit,
  PlanContactFitStatus,
  PlanEventOption,
  PlanEventScore,
  PlanIntroDraftRequest,
  PlanIntroDraftResult,
  PlanIntroRouteView,
  PlanPendingDecisionRequest,
  PlanPendingDecisionResult,
  PlanPendingItem,
  PlanPendingKind,
  PlanPendingListResponse,
  PlanPersonTypeDetail,
  PlanProposalRequest,
  PlanProposalResult,
  PlanRecentAward,
  PlanStepProgress,
  PlanStepSuggestion,
  PlanTalkedOfflineRequest,
  PlanTalkedOfflineResult,
  PlanTalkedView,
  PlanTaskLinkView,
  PlanTypeStats,
  PlanAchieveRequest,
  PlanAchievementView,
  PlanGoalEditRequest,
  PlanGoalEditResult,
  PlanLegacyDetail,
  PlanLegacyItem,
  PlanLegacyListResponse,
  PlanNextGoalCandidate,
  PlanNextGoalsResponse,
  PlanPremiseMark,
  PlanQuotaResponse,
  PlanReviewFixRequest,
  PlanReviewStartRequest,
  PlanReviewToggleRequest,
  PlanReviewView,
} from "./plan-v2";

// R12 手入力（DESIGN §4.1）。Owner: 甲 (R12).
export type {
  ManualContactCreateInput,
  ManualContactCreateResult,
  ManualContactDuplicateCheckInput,
  ManualContactDuplicateCheckResult,
  ManualContactFieldChoice,
  ManualContactMergeField,
  ManualContactMetContext,
  ManualContactOrganizationSuggestion,
  ManualContactOrganizationSuggestionsResult,
  ManualContactUndoResult,
} from "./manual-contact";

// R16 导入（DESIGN add-and-invite §4.3）。Owner: 甲 (R16).
export type {
  ContactImportBatchListResponse,
  ContactImportBatchResponse,
  ContactImportBatchResult,
  ContactImportBatchStatus,
  ContactImportBatchView,
  ContactImportCommitInput,
  ContactImportCounts,
  ContactImportDecision,
  ContactImportDecisionsResult,
  ContactImportEventInput,
  ContactImportEventListResponse,
  ContactImportEventSummary,
  ContactImportFailureReason,
  ContactImportFieldsView,
  ContactImportFollowUpState,
  ContactImportFormat,
  ContactImportKind,
  ContactImportMappableField,
  ContactImportMapping,
  ContactImportMappingInput,
  ContactImportMergeConfirmation,
  ContactImportParseIssue,
  ContactImportReview,
  ContactImportRowDecisionInput,
  ContactImportRowFilter,
  ContactImportRowStatus,
  ContactImportRowView,
  ContactImportRowsPage,
  ContactImportUploadHeaders,
} from "./contact-import";
// R17 主催（host/DESIGN.md §4）
export type { HostAdmissionMode, HostCenterEventRow, HostCenterFilter, HostCenterFilterCounts, HostCenterKpi, HostCenterResponse, HostCenterSpotlight, HostCenterSummary, HostCohostAvatar, HostDesktopLinkResult, HostEventArchiveInput, HostEventCancelInput, HostEventChangePreview, HostEventCodeReissueInput, HostEventFeeKind, HostEventInput, HostEventLifecycle, HostEventPublishInput, HostEventStatus, HostEventUpdateInput, HostEventView, HostEventWriteResult, HostNextStep, HostNextSteps, HostRole, HostRowAction, HostRowNote, HostRowNoteKind, HostTodoItem, HostTodoKind } from "./host-events";
export type { HostAdmissionDecision, HostAdmitOnSiteInput, HostCheckInResult, HostCheckInScanInput, HostCheckInUndoInput, HostKioskHeartbeatInput, HostKioskHeartbeatResult, HostKioskRecent, HostKioskResponse, HostKioskRosterResponse, HostKioskRow, HostKioskStatus, HostMatchingConditions, HostMatchingGenerateInput, HostMatchingMember, HostMatchingMove, HostMatchingOverridesInput, HostMatchingPublishInput, HostMatchingResponse, HostMatchingRound, HostMatchingState, HostMatchingTable, HostNoticeTemplate, HostNoticeTemplateKind, HostOverviewMatchingCard, HostOverviewResponse, HostOverviewTodo, HostPeopleBucket, HostPeopleCounts, HostPeopleDecisionInput, HostPeopleDecisionResult, HostPeopleResponse, HostPeopleRow, HostProgressStep, HostQuestionKind, HostQuestionSuggestion, HostReportAll, HostReportFunnel, HostReportMine, HostReportPerson, HostReportResponse, HostReportStandingItem, HostReportSummary, HostReportTableCell, HostSetupDraftInput, HostSetupHostNoteInput, HostSetupPublishInput, HostSetupQuestion, HostSetupResponse } from "./host-console";
export type { HostCheckInEventItem, HostCheckInEventsResponse, HostCohostAcceptResult, HostCohostHistoryItem, HostCohostInvite, HostCohostInviteInput, HostCohostInvitePreview, HostCohostInviteResult, HostCohostMember, HostCohostRemoveInput, HostCohostRole, HostCohostRoleInput, HostCohostsResponse } from "./host-cohosts";
export type { HostNoticeChannel, HostNoticeKind, HostNoticePreview, HostNoticePreviewInput, HostNoticeSendInput, HostNoticeSendResult, HostSendableNoticeKind } from "./host-notices";
export type { OrganizerProfile, OrganizerProfileInput, OrganizerProfileListResponse, OrganizerProfileStats, OrganizerProfileVisibility, OrganizerPublicPast, OrganizerPublicResponse, OrganizerPublicUpcoming } from "./organizer-profile";

// R30 全局搜索（search/DESIGN.md §3.1）
export type { GlobalSearchAlternative, GlobalSearchConversationHit, GlobalSearchEventHit, GlobalSearchGroup, GlobalSearchPersonHit, GlobalSearchQuery, GlobalSearchResponse, GlobalSearchSemantic, GlobalSearchSuggestion, GlobalSearchType, SearchHighlight } from "./global-search";
// R11a 人脈（列表卡片新字段、目標に関係）
export type { ContactCardMetKind, ContactCardSourceChip } from "./contact-card-page";
export type { ContactGoalRelatedIdsDTO, ContactGoalRelatedLinkDTO } from "./contact-goal-related";
export type { ContactDeleteResult, ContactRestoreResult } from "./contact-delete";
export type { ContactEditableField, ContactFieldsUpdateInput, ContactFieldsUpdateResult } from "./contact-fields";
export type { TodoDecisionAction, TodoDecisionItem, TodoFollowupItem, TodoItemBase, TodoNextMoveItem, TodoPageContract, TodoSection, TodoSectionKey, TodoSourceKey } from "./todo-page";
export type { CalendarExternalEventContract, CalendarExternalEventsContract } from "./calendar-external-events";
// R11b 人脈分析（構造 / 機会 / インサイト、下钻名单；GET /api/network/analysis、…/people）
export type { NetworkAnalysisBucket, NetworkAnalysisDimension, NetworkAnalysisDistribution, NetworkAnalysisGap, NetworkAnalysisInsight, NetworkAnalysisInsightKind, NetworkAnalysisLock, NetworkAnalysisOpportunity, NetworkAnalysisOpportunityKind, NetworkAnalysisPeopleDTO, NetworkAnalysisPeopleSort, NetworkAnalysisPersonRef, NetworkAnalysisPersonRow, NetworkAnalysisViewDTO } from "./network-analysis-view";
export type { ProfileCardCompletenessContract, ProfilePublicFieldsContract } from "./profile";
