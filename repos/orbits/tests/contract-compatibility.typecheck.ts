import type {
  ContactSourceFilterMatchesContract,
  ContactStatusFilterMatchesContract,
  ContactTagFilterMatchesContract,
  ContactValueFilterMatchesContract,
} from "../features/contacts/contract";
import type { ApiEnvelope } from "../shared/api/envelope";
import type { ContractMatches } from "../shared/contract-check";
import type { ContactsListPayloadContract } from "../shared/contract/contacts";
import type { ApiEnvelopeContract } from "../shared/contract/envelope";
import type { IndustryIdCode } from "../shared/contract/industries";
import type { OrbitLanguage } from "../shared/contract/language";
import type { INDUSTRY_IDS } from "../shared/domain/industries";
import type { ORBIT_LANGUAGES } from "../shared/domain/language";
import type {
  RelationshipStageMatchesContract,
  RelationshipValueTypeMatchesContract,
  SourceReferenceMatchesContract,
  SourceTypeMatchesContract,
} from "../shared/domain/source-types";
import type { AppErrorCodeMatchesContract } from "../shared/errors/app-error";

// A mismatched ContractMatches alias evaluates to never; assigning true makes
// the full-project typecheck reject drift instead of leaving that alias unused.
export const crossClientContractCompatibility = {
  contactSource: true,
  contactStatus: true,
  contactTag: true,
  contactValue: true,
  envelope: true,
  errorCode: true,
  industry: true,
  language: true,
  relationshipStage: true,
  relationshipValue: true,
  sourceReference: true,
  sourceType: true,
} satisfies {
  contactSource: ContactSourceFilterMatchesContract;
  contactStatus: ContactStatusFilterMatchesContract;
  contactTag: ContactTagFilterMatchesContract;
  contactValue: ContactValueFilterMatchesContract;
  envelope: ContractMatches<
    ApiEnvelope<ContactsListPayloadContract>,
    ApiEnvelopeContract<ContactsListPayloadContract>
  >;
  errorCode: AppErrorCodeMatchesContract;
  industry: ContractMatches<(typeof INDUSTRY_IDS)[number], IndustryIdCode>;
  language: ContractMatches<(typeof ORBIT_LANGUAGES)[number], OrbitLanguage>;
  relationshipStage: RelationshipStageMatchesContract;
  relationshipValue: RelationshipValueTypeMatchesContract;
  sourceReference: SourceReferenceMatchesContract;
  sourceType: SourceTypeMatchesContract;
};
