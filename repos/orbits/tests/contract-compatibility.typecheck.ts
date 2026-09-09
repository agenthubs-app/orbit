import type {
  ContactSourceFilterMatchesContract,
  ContactStatusFilterMatchesContract,
  ContactTagFilterMatchesContract,
  ContactValueFilterMatchesContract,
} from "../features/contacts/contract";
import type { ApiEnvelope } from "../shared/api/envelope";
import type {
  EventExperienceConfiguration,
  EventExperienceHead,
  EventExperienceQuestion,
  EventExperienceQuestionSetInput,
  EventExperienceSnapshot,
  EventExperienceVersion,
} from "../features/events/experience/contract";
import type {
  EventExperienceConfigurationContract,
  EventExperienceHeadContract,
  EventExperiencePreviewResponseContract,
  EventExperienceQuestionContract,
  EventExperienceQuestionSetContract,
  EventExperienceSnapshotContract,
  EventExperienceVersionContract,
} from "../shared/contract/event-experience";
import type { ContractMatches } from "../shared/contract-check";
import type { ContactsListPayloadContract } from "../shared/contract/contacts";
import type { ApiEnvelopeContract } from "../shared/contract/envelope";
import type { IndustryIdCode } from "../shared/contract/industries";
import type { OrbitLanguage } from "../shared/contract/language";
import type { INDUSTRY_IDS } from "../shared/domain/industries";
import type { ORBIT_LANGUAGES } from "../shared/domain/language";
import type {
  ConnectionStageMatchesContract,
  RelationshipStageMatchesContract,
  RelationshipValueTypeMatchesContract,
  SourceReferenceMatchesContract,
  SourceTypeMatchesContract,
} from "../shared/domain/source-types";
import type { AppErrorCodeMatchesContract } from "../shared/errors/app-error";
import type {
  BusinessCardBatchDTO,
  BusinessCardBatchItemDTO,
  BusinessCardBatchSourceFile,
} from "../features/acquisition/business-card-batch-contract";
import type {
  IngestBatchDTO,
  IngestBatchSummary,
  IngestItemDTO,
  IngestManifestEntry,
} from "../features/acquisition/business-card-ingest-v2/contract";
import type {
  BusinessCardCloudOcrUsage,
  BusinessCardContactPoint,
  BusinessCardLabeledValue,
  BusinessCardReviewIssue,
  BusinessCardStructuredExtraction,
} from "../features/acquisition/business-card-cloud-ocr";
import type {
  BusinessCardBatchContract,
  BusinessCardBatchItemContract,
  BusinessCardBatchSourceFileContract,
  BusinessCardCloudOcrUsageContract,
  BusinessCardContactPointContract,
  BusinessCardLabeledValueContract,
  BusinessCardReviewIssueContract,
  BusinessCardStructuredExtractionContract,
  IngestBatchContract,
  IngestBatchSummaryContract,
  IngestItemContract,
  IngestManifestEntryContract,
} from "../shared/contract/business-card-batch";

// A mismatched ContractMatches alias evaluates to never; assigning true makes
// the full-project typecheck reject drift instead of leaving that alias unused.
export const crossClientContractCompatibility = {
  businessCardBatch: true,
  businessCardBatchItem: true,
  businessCardBatchSourceFile: true,
  businessCardCloudOcrUsage: true,
  businessCardContactPoint: true,
  businessCardLabeledValue: true,
  businessCardReviewIssue: true,
  businessCardStructuredExtraction: true,
  ingestBatch: true,
  ingestBatchSummary: true,
  ingestItem: true,
  ingestManifestEntry: true,
  connectionStage: true,
  contactSource: true,
  contactStatus: true,
  contactTag: true,
  contactValue: true,
  envelope: true,
  errorCode: true,
  eventExperienceConfiguration: true,
  eventExperienceHead: true,
  eventExperiencePreviewResponse: true,
  eventExperienceQuestion: true,
  eventExperienceQuestionSet: true,
  eventExperienceSnapshot: true,
  eventExperienceVersion: true,
  industry: true,
  language: true,
  relationshipStage: true,
  relationshipValue: true,
  sourceReference: true,
  sourceType: true,
} satisfies {
  businessCardBatch: ContractMatches<BusinessCardBatchDTO, BusinessCardBatchContract>;
  businessCardBatchItem: ContractMatches<BusinessCardBatchItemDTO, BusinessCardBatchItemContract>;
  businessCardBatchSourceFile: ContractMatches<BusinessCardBatchSourceFile, BusinessCardBatchSourceFileContract>;
  businessCardCloudOcrUsage: ContractMatches<BusinessCardCloudOcrUsage, BusinessCardCloudOcrUsageContract>;
  businessCardContactPoint: ContractMatches<BusinessCardContactPoint, BusinessCardContactPointContract>;
  businessCardLabeledValue: ContractMatches<BusinessCardLabeledValue, BusinessCardLabeledValueContract>;
  businessCardReviewIssue: ContractMatches<BusinessCardReviewIssue, BusinessCardReviewIssueContract>;
  businessCardStructuredExtraction: ContractMatches<BusinessCardStructuredExtraction, BusinessCardStructuredExtractionContract>;
  ingestBatch: ContractMatches<IngestBatchDTO, IngestBatchContract>;
  ingestBatchSummary: ContractMatches<IngestBatchSummary, IngestBatchSummaryContract>;
  ingestItem: ContractMatches<IngestItemDTO, IngestItemContract>;
  ingestManifestEntry: ContractMatches<IngestManifestEntry, IngestManifestEntryContract>;
  connectionStage: ConnectionStageMatchesContract;
  contactSource: ContactSourceFilterMatchesContract;
  contactStatus: ContactStatusFilterMatchesContract;
  contactTag: ContactTagFilterMatchesContract;
  contactValue: ContactValueFilterMatchesContract;
  envelope: ContractMatches<
    ApiEnvelope<ContactsListPayloadContract>,
    ApiEnvelopeContract<ContactsListPayloadContract>
  >;
  errorCode: AppErrorCodeMatchesContract;
  eventExperienceConfiguration: ContractMatches<EventExperienceConfiguration, EventExperienceConfigurationContract>;
  eventExperienceHead: ContractMatches<EventExperienceHead, EventExperienceHeadContract>;
  eventExperiencePreviewResponse: ContractMatches<{ version: EventExperienceVersion }, EventExperiencePreviewResponseContract>;
  eventExperienceQuestion: ContractMatches<EventExperienceQuestion, EventExperienceQuestionContract>;
  eventExperienceQuestionSet: ContractMatches<EventExperienceQuestionSetInput, EventExperienceQuestionSetContract>;
  eventExperienceSnapshot: ContractMatches<EventExperienceSnapshot, EventExperienceSnapshotContract>;
  eventExperienceVersion: ContractMatches<EventExperienceVersion, EventExperienceVersionContract>;
  industry: ContractMatches<(typeof INDUSTRY_IDS)[number], IndustryIdCode>;
  language: ContractMatches<(typeof ORBIT_LANGUAGES)[number], OrbitLanguage>;
  relationshipStage: RelationshipStageMatchesContract;
  relationshipValue: RelationshipValueTypeMatchesContract;
  sourceReference: SourceReferenceMatchesContract;
  sourceType: SourceTypeMatchesContract;
};
