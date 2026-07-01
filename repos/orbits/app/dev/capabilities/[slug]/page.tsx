/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
/**
 * 单个 capability demo 的动态路由。
 *
 * 这个文件把 slug 映射到对应 debug-view 组件，让每个 mock capability
 * 都能通过 `/dev/capabilities/[slug]` 独立查看、测试和复核。
 */
import "../../../globals.css";
import { CapabilityDemoRoute } from "../../../../shared/dev/app-scaffold/capability-demo-view";
import {
  CapabilityDebugDashboardDemo,
  CAPABILITY_DEBUG_DASHBOARD_SLUG,
} from "../debug-dashboard";
import {
  MockAccountSessionCapabilityDemo,
  MOCK_ACCOUNT_SESSION_CAPABILITY_SLUG,
} from "../../../../features/account/mock-account-session/debug-view";
import {
  ProfileOnboardingCapabilityDemo,
  PROFILE_ONBOARDING_CAPABILITY_SLUG,
} from "../../../../features/profile/profile-onboarding-and-manual-profile-editor/debug-view";
import {
  ProfileDocumentExtractionCapabilityDemo,
  PROFILE_DOCUMENT_EXTRACTION_CAPABILITY_SLUG,
} from "../../../../features/profile/profile-document-extraction-mock/debug-view";
import {
  ProfileSignalReviewQueueCapabilityDemo,
  PROFILE_SIGNAL_REVIEW_QUEUE_CAPABILITY_SLUG,
} from "../../../../features/profile/profile-signal-review-queue/debug-view";
import {
  PermissionStateCapabilityDemo,
  PERMISSION_STATE_CAPABILITY_SLUG,
} from "../../../../features/permissions/permission-state-and-staged-authorization-mock/debug-view";
import {
  SensitiveActionConfirmationGuardDemo,
  SENSITIVE_ACTION_CONFIRMATION_GUARD_SLUG,
} from "../../../../features/permissions/sensitive-action-confirmation-guard/debug-view";
import {
  ContactAcquisitionDraftPipelineDemo,
  CONTACT_ACQUISITION_DRAFT_PIPELINE_SLUG,
} from "../../../../features/acquisition/contact-acquisition-draft-pipeline/debug-view";
import {
  ManualContactCreationMockDemo,
  MANUAL_CONTACT_CREATION_MOCK_SLUG,
} from "../../../../features/acquisition/manual-contact-creation-mock/debug-view";
import {
  BusinessCardScanOcrMockDemo,
  BUSINESS_CARD_SCAN_OCR_MOCK_SLUG,
} from "../../../../features/acquisition/business-card-scan-ocr-mock/debug-view";
import {
  BusinessCardReviewAndConfirmFlowDemo,
  BUSINESS_CARD_REVIEW_AND_CONFIRM_FLOW_SLUG,
} from "../../../../features/acquisition/business-card-review-and-confirm-flow/debug-view";
import {
  QrScanConnectMockDemo,
  QR_SCAN_CONNECT_MOCK_SLUG,
} from "../../../../features/acquisition/qr-scan-connect-mock/debug-view";
import {
  EventAttendeeImportMockDemo,
  EVENT_ATTENDEE_IMPORT_MOCK_SLUG,
} from "../../../../features/acquisition/event-attendee-import-mock/debug-view";
import {
  EventCrudAndImportMockDemo,
  EVENT_CRUD_AND_IMPORT_MOCK_SLUG,
} from "../../../../features/events/event-crud-and-import/debug-view";
import {
  EventAttendeeRosterMockDemo,
  EVENT_ATTENDEE_ROSTER_MOCK_SLUG,
} from "../../../../features/events/event-attendee-roster-mock/debug-view";
import {
  OnSiteWantToConnectMockDemo,
  ON_SITE_WANT_TO_CONNECT_MOCK_SLUG,
} from "../../../../features/events/on-site-want-to-connect-mock/debug-view";
import {
  EventEncounterNoteCaptureMockDemo,
  EVENT_ENCOUNTER_NOTE_CAPTURE_MOCK_SLUG,
} from "../../../../features/events/event-encounter-note-capture-mock/debug-view";
import {
  EventGoalAndReadinessMockDemo,
  EVENT_GOAL_AND_READINESS_MOCK_SLUG,
} from "../../../../features/events/event-goal-and-readiness-mock/debug-view";
import {
  ExternalContactsImportMockDemo,
  EXTERNAL_CONTACTS_IMPORT_MOCK_SLUG,
} from "../../../../features/acquisition/external-contacts-import-mock/debug-view";
import {
  EmailCalendarRelationshipSignalMockDemo,
  EMAIL_CALENDAR_SIGNAL_MOCK_SLUG,
} from "../../../../features/acquisition/email-and-calendar-relationship-signal-mock/debug-view";
import {
  ReferralRecommendationMockDemo,
  REFERRAL_RECOMMENDATION_MOCK_SLUG,
} from "../../../../features/acquisition/referral-and-recommended-contact-confirm-mock/debug-view";
import {
  DuplicateDetectionAndMergeMockDemo,
  DUPLICATE_DETECTION_AND_MERGE_MOCK_SLUG,
} from "../../../../features/acquisition/duplicate-detection-and-merge-mock/debug-view";
import {
  ContactsListSearchAndFilterMockDemo,
  CONTACTS_LIST_SEARCH_AND_FILTER_MOCK_SLUG,
} from "../../../../features/contacts/contacts-list-search-and-filter-mock/debug-view";
import {
  ContactDetailTagAndStatusMockDemo,
  CONTACT_DETAIL_TAG_AND_STATUS_MOCK_SLUG,
} from "../../../../features/contacts/contact-detail-tag-and-status-mock/debug-view";
import {
  ConnectionEvidenceServiceMockDemo,
  CONNECTION_EVIDENCE_SERVICE_MOCK_SLUG,
} from "../../../../features/connections/connection-and-evidence-service-mock/debug-view";
import {
  RelationshipStageAndProfileMockDemo,
  RELATIONSHIP_STAGE_AND_PROFILE_MOCK_SLUG,
} from "../../../../features/connections/relationship-stage-and-profile-mock/debug-view";
import {
  RelationshipValueScoringMockDemo,
  RELATIONSHIP_VALUE_SCORING_MOCK_SLUG,
} from "../../../../features/analysis/relationship-value-scoring-mock/debug-view";
import {
  RelationshipNaturalSearchMockDemo,
  RELATIONSHIP_NATURAL_SEARCH_MOCK_SLUG,
} from "../../../../features/search/relationship-natural-search-mock/debug-view";
import {
  EventRecommendationOpeningLineMockDemo,
  EVENT_RECOMMENDATION_OPENING_LINE_MOCK_SLUG,
} from "../../../../features/recommendations/event-recommendation-and-opening-line-mock/debug-view";
import {
  EventValueRecommendationMockDemo,
  EVENT_VALUE_RECOMMENDATION_MOCK_SLUG,
} from "../../../../features/recommendations/event-value-recommendation-mock/debug-view";
import {
  PostEventContactReviewMockDemo,
  POST_EVENT_CONTACT_REVIEW_MOCK_SLUG,
} from "../../../../features/events/post-event-contact-review-mock/debug-view";
import {
  FollowupTaskGenerationMockDemo,
  FOLLOWUP_TASK_GENERATION_MOCK_SLUG,
} from "../../../../features/followups/followup-task-generation-mock/debug-view";
import {
  MessageDraftGeneratorMockDemo,
  MESSAGE_DRAFT_GENERATOR_MOCK_SLUG,
} from "../../../../features/followups/message-draft-generator-mock/debug-view";
import {
  ReminderScheduleNotificationMockDemo,
  REMINDER_SCHEDULE_NOTIFICATION_MOCK_SLUG,
} from "../../../../features/notifications/reminder-schedule-and-notification-mock/debug-view";
import {
  ChatConversationAndMessageMockDemo,
  CHAT_CONVERSATION_AND_MESSAGE_MOCK_SLUG,
} from "../../../../features/chat/chat-conversation-and-message-mock/debug-view";
import {
  ChatWritingAssistMockDemo,
  CHAT_WRITING_ASSIST_MOCK_SLUG,
} from "../../../../features/chat/chat-writing-assist-mock/debug-view";
import {
  ChatSummaryExtractionMockDemo,
  CHAT_SUMMARY_EXTRACTION_MOCK_SLUG,
} from "../../../../features/chat/chat-summary-and-extraction-mock/debug-view";
import {
  ChatPrivacyControlsMockDemo,
  CHAT_PRIVACY_CONTROLS_MOCK_SLUG,
} from "../../../../features/chat/chat-privacy-controls-mock/debug-view";
import {
  DashboardAggregateMockDemo,
  DASHBOARD_AGGREGATE_MOCK_SLUG,
} from "../../../../features/dashboard/dashboard-aggregate-mock/debug-view";
import {
  NetworkDistributionAnalyticsMockDemo,
  NETWORK_DISTRIBUTION_ANALYTICS_MOCK_SLUG,
} from "../../../../features/dashboard/network-distribution-analytics-mock/debug-view";
import {
  OpportunityReminderAnalyticsMockDemo,
  OPPORTUNITY_REMINDER_ANALYTICS_MOCK_SLUG,
} from "../../../../features/dashboard/opportunity-reminder-analytics-mock/debug-view";
import {
  AgentActionQueueMockDemo,
  AGENT_ACTION_QUEUE_MOCK_SLUG,
} from "../../../../features/agent/agent-action-queue-mock/debug-view";
import {
  AgentAutonomySettingsMockDemo,
  AGENT_AUTONOMY_SETTINGS_MOCK_SLUG,
} from "../../../../features/agent/agent-autonomy-settings-mock/debug-view";
import {
  ExternalActionSandboxMockDemo,
  EXTERNAL_ACTION_SANDBOX_MOCK_SLUG,
} from "../../../../features/agent/external-action-sandbox-mock/debug-view";
import {
  SourceConsistencyProvenanceAuditDemo,
  SOURCE_CONSISTENCY_PROVENANCE_AUDIT_SLUG,
} from "../../../../features/audit/source-consistency-and-provenance-audit/debug-view";
import {
  AppBootstrapMockAggregatorDemo,
  APP_BOOTSTRAP_MOCK_AGGREGATOR_SLUG,
} from "../../../../features/bootstrap/app-bootstrap-mock-aggregator/debug-view";
import {
  AiProviderMockProvenanceDemo,
  AI_PROVIDER_MOCK_PROVENANCE_SLUG,
} from "../../../../shared/ai/ai-provider-mock-and-provenance-boundary/debug-view";
import {
  MockDataScenarioSwitcherDemo,
  MOCK_DATA_SCENARIO_SWITCHER_SLUG,
} from "../../../../shared/mock/mock-data-mutation-reset-and-scenario-switcher/debug-view";

interface CapabilityDemoPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default async function CapabilityDemoPage({
  params,
}: CapabilityDemoPageProps) {
  const { slug } = await params;

  if (slug === CAPABILITY_DEBUG_DASHBOARD_SLUG) {
    return <CapabilityDebugDashboardDemo />;
  }

  if (slug === MOCK_ACCOUNT_SESSION_CAPABILITY_SLUG) {
    return <MockAccountSessionCapabilityDemo />;
  }

  if (slug === PROFILE_ONBOARDING_CAPABILITY_SLUG) {
    return <ProfileOnboardingCapabilityDemo />;
  }

  if (slug === PROFILE_DOCUMENT_EXTRACTION_CAPABILITY_SLUG) {
    return <ProfileDocumentExtractionCapabilityDemo />;
  }

  if (slug === PROFILE_SIGNAL_REVIEW_QUEUE_CAPABILITY_SLUG) {
    return <ProfileSignalReviewQueueCapabilityDemo />;
  }

  if (slug === PERMISSION_STATE_CAPABILITY_SLUG) {
    return <PermissionStateCapabilityDemo />;
  }

  if (slug === SENSITIVE_ACTION_CONFIRMATION_GUARD_SLUG) {
    return <SensitiveActionConfirmationGuardDemo />;
  }

  if (slug === CONTACT_ACQUISITION_DRAFT_PIPELINE_SLUG) {
    return <ContactAcquisitionDraftPipelineDemo />;
  }

  if (slug === MANUAL_CONTACT_CREATION_MOCK_SLUG) {
    return <ManualContactCreationMockDemo />;
  }

  if (slug === BUSINESS_CARD_SCAN_OCR_MOCK_SLUG) {
    return <BusinessCardScanOcrMockDemo />;
  }

  if (slug === BUSINESS_CARD_REVIEW_AND_CONFIRM_FLOW_SLUG) {
    return <BusinessCardReviewAndConfirmFlowDemo />;
  }

  if (slug === QR_SCAN_CONNECT_MOCK_SLUG) {
    return <QrScanConnectMockDemo />;
  }

  if (slug === EVENT_ATTENDEE_IMPORT_MOCK_SLUG) {
    return <EventAttendeeImportMockDemo />;
  }

  if (slug === EVENT_CRUD_AND_IMPORT_MOCK_SLUG) {
    return <EventCrudAndImportMockDemo />;
  }

  if (slug === EVENT_ATTENDEE_ROSTER_MOCK_SLUG) {
    return <EventAttendeeRosterMockDemo />;
  }

  if (slug === ON_SITE_WANT_TO_CONNECT_MOCK_SLUG) {
    return <OnSiteWantToConnectMockDemo />;
  }

  if (slug === EVENT_ENCOUNTER_NOTE_CAPTURE_MOCK_SLUG) {
    return <EventEncounterNoteCaptureMockDemo />;
  }

  if (slug === EVENT_GOAL_AND_READINESS_MOCK_SLUG) {
    return <EventGoalAndReadinessMockDemo />;
  }

  if (slug === EXTERNAL_CONTACTS_IMPORT_MOCK_SLUG) {
    return <ExternalContactsImportMockDemo />;
  }

  if (slug === EMAIL_CALENDAR_SIGNAL_MOCK_SLUG) {
    return <EmailCalendarRelationshipSignalMockDemo />;
  }

  if (slug === REFERRAL_RECOMMENDATION_MOCK_SLUG) {
    return <ReferralRecommendationMockDemo />;
  }

  if (slug === DUPLICATE_DETECTION_AND_MERGE_MOCK_SLUG) {
    return <DuplicateDetectionAndMergeMockDemo />;
  }

  if (slug === CONTACTS_LIST_SEARCH_AND_FILTER_MOCK_SLUG) {
    return <ContactsListSearchAndFilterMockDemo />;
  }

  if (slug === CONTACT_DETAIL_TAG_AND_STATUS_MOCK_SLUG) {
    return <ContactDetailTagAndStatusMockDemo />;
  }

  if (slug === CONNECTION_EVIDENCE_SERVICE_MOCK_SLUG) {
    return <ConnectionEvidenceServiceMockDemo />;
  }

  if (slug === RELATIONSHIP_STAGE_AND_PROFILE_MOCK_SLUG) {
    return <RelationshipStageAndProfileMockDemo />;
  }

  if (slug === RELATIONSHIP_VALUE_SCORING_MOCK_SLUG) {
    return <RelationshipValueScoringMockDemo />;
  }

  if (slug === RELATIONSHIP_NATURAL_SEARCH_MOCK_SLUG) {
    return <RelationshipNaturalSearchMockDemo />;
  }

  if (slug === EVENT_RECOMMENDATION_OPENING_LINE_MOCK_SLUG) {
    return <EventRecommendationOpeningLineMockDemo />;
  }

  if (slug === EVENT_VALUE_RECOMMENDATION_MOCK_SLUG) {
    return <EventValueRecommendationMockDemo />;
  }

  if (slug === POST_EVENT_CONTACT_REVIEW_MOCK_SLUG) {
    return <PostEventContactReviewMockDemo />;
  }

  if (slug === FOLLOWUP_TASK_GENERATION_MOCK_SLUG) {
    return <FollowupTaskGenerationMockDemo />;
  }

  if (slug === MESSAGE_DRAFT_GENERATOR_MOCK_SLUG) {
    return <MessageDraftGeneratorMockDemo />;
  }

  if (slug === REMINDER_SCHEDULE_NOTIFICATION_MOCK_SLUG) {
    return <ReminderScheduleNotificationMockDemo />;
  }

  if (slug === CHAT_CONVERSATION_AND_MESSAGE_MOCK_SLUG) {
    return <ChatConversationAndMessageMockDemo />;
  }

  if (slug === CHAT_WRITING_ASSIST_MOCK_SLUG) {
    return <ChatWritingAssistMockDemo />;
  }

  if (slug === CHAT_SUMMARY_EXTRACTION_MOCK_SLUG) {
    return <ChatSummaryExtractionMockDemo />;
  }

  if (slug === CHAT_PRIVACY_CONTROLS_MOCK_SLUG) {
    return <ChatPrivacyControlsMockDemo />;
  }

  if (slug === DASHBOARD_AGGREGATE_MOCK_SLUG) {
    return <DashboardAggregateMockDemo />;
  }

  if (slug === NETWORK_DISTRIBUTION_ANALYTICS_MOCK_SLUG) {
    return <NetworkDistributionAnalyticsMockDemo />;
  }

  if (slug === OPPORTUNITY_REMINDER_ANALYTICS_MOCK_SLUG) {
    return <OpportunityReminderAnalyticsMockDemo />;
  }

  if (slug === AGENT_ACTION_QUEUE_MOCK_SLUG) {
    return <AgentActionQueueMockDemo />;
  }

  if (slug === AGENT_AUTONOMY_SETTINGS_MOCK_SLUG) {
    return <AgentAutonomySettingsMockDemo />;
  }

  if (slug === EXTERNAL_ACTION_SANDBOX_MOCK_SLUG) {
    return <ExternalActionSandboxMockDemo />;
  }

  if (slug === SOURCE_CONSISTENCY_PROVENANCE_AUDIT_SLUG) {
    return <SourceConsistencyProvenanceAuditDemo />;
  }

  if (slug === APP_BOOTSTRAP_MOCK_AGGREGATOR_SLUG) {
    return <AppBootstrapMockAggregatorDemo />;
  }

  if (slug === AI_PROVIDER_MOCK_PROVENANCE_SLUG) {
    return <AiProviderMockProvenanceDemo />;
  }

  if (slug === MOCK_DATA_SCENARIO_SWITCHER_SLUG) {
    return <MockDataScenarioSwitcherDemo />;
  }

  return <CapabilityDemoRoute slug={slug} />;
}
