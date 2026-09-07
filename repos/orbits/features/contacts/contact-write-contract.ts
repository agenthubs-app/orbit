import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../shared/domain/contracts";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const BUSINESS_CARD_CONTACT_WRITE_ERROR_CODES = [
  "BUSINESS_CARD_CONTACT_ACTOR_REQUIRED",
  "BUSINESS_CARD_CONTACT_CONFIRMATION_REQUIRED",
  "BUSINESS_CARD_CONTACT_INPUT_INVALID",
  "BUSINESS_CARD_CONTACT_WRITE_UNCONFIGURED",
  "BUSINESS_CARD_CONTACT_WRITE_FAILED",
] as const;

export type BusinessCardContactWriteErrorCode =
  (typeof BUSINESS_CARD_CONTACT_WRITE_ERROR_CODES)[number];

export interface ConfirmBusinessCardContactInput {
  actorId: string;
  actorLabel: string;
  allowDuplicate?: boolean;
  confirmed: boolean;
  displayName: string;
  draftId: string;
  email: string;
  evidenceIds: readonly string[];
  imageDigest: string;
  notes?: string;
  organization: string;
  phone: string;
  relationshipContext: string;
  role: string;
}

export type BusinessCardContactWriteState =
  | "created"
  | "already_confirmed"
  | "duplicate_review";

export interface BusinessCardContactWritePayload {
  state: BusinessCardContactWriteState;
  contactId: string;
  duplicateContactId: string | null;
  contactWriteExecuted: boolean;
  evidenceIds: readonly string[];
  confirmedAt: string;
}

export interface BusinessCardContactWriteSuccess {
  success: true;
  data: BusinessCardContactWritePayload;
}

export interface BusinessCardContactWriteErrorDefinition {
  appCode: AppErrorCode;
  code: BusinessCardContactWriteErrorCode;
  message: string;
  recovery: string;
}

export const BUSINESS_CARD_CONTACT_WRITE_ERROR_DEFINITIONS = {
  BUSINESS_CARD_CONTACT_ACTOR_REQUIRED: {
    appCode: "UNAUTHORIZED",
    code: "BUSINESS_CARD_CONTACT_ACTOR_REQUIRED",
    message: "An authenticated actor is required before creating this contact.",
    recovery:
      "Sign in before confirming the reviewed business card contact.",
  },
  BUSINESS_CARD_CONTACT_CONFIRMATION_REQUIRED: {
    appCode: "VALIDATION_ERROR",
    code: "BUSINESS_CARD_CONTACT_CONFIRMATION_REQUIRED",
    message: "Explicit confirmation is required before creating this contact.",
    recovery:
      "Keep the reviewed draft unchanged until the operator confirms the contact.",
  },
  BUSINESS_CARD_CONTACT_INPUT_INVALID: {
    appCode: "VALIDATION_ERROR",
    code: "BUSINESS_CARD_CONTACT_INPUT_INVALID",
    message: "The reviewed business card contact fields are incomplete.",
    recovery:
      "Provide a display name, draft id, image digest, actor label, and evidence before confirming.",
  },
  BUSINESS_CARD_CONTACT_WRITE_UNCONFIGURED: {
    appCode: "SERVICE_UNAVAILABLE",
    code: "BUSINESS_CARD_CONTACT_WRITE_UNCONFIGURED",
    message: "Business card contact storage is not configured.",
    recovery:
      "Configure the live contact record store before confirming this contact.",
  },
  BUSINESS_CARD_CONTACT_WRITE_FAILED: {
    appCode: "SERVICE_UNAVAILABLE",
    code: "BUSINESS_CARD_CONTACT_WRITE_FAILED",
    message: "The reviewed business card contact could not be saved.",
    recovery:
      "Keep the reviewed draft unchanged and retry after the contact store recovers.",
  },
} as const satisfies Record<
  BusinessCardContactWriteErrorCode,
  BusinessCardContactWriteErrorDefinition
>;

export interface BusinessCardContactWriteFailure {
  success: false;
  error: BusinessCardContactWriteErrorDefinition & {
    contactWriteExecuted: false;
  };
}

export type BusinessCardContactWriteResult =
  | BusinessCardContactWriteSuccess
  | BusinessCardContactWriteFailure;

export interface BusinessCardContactWriteService {
  confirmBusinessCardContact(
    input: ConfirmBusinessCardContactInput,
  ): Promise<BusinessCardContactWriteResult>;
}

export interface BusinessCardContactWriteProvider {
  getContact(contactId: string, actorId: string): Promise<ContactDTO | null>;
  listContacts(actorId: string): Promise<readonly ContactDTO[]>;
  saveContact(contact: ContactDTO, actorId: string): Promise<ContactDTO>;
}

// Contact persistence is source-agnostic. Keep the business-card name as a
// compatibility alias while other reviewed acquisition sources share the same
// actor-scoped record boundary.
export type ContactRecordWriteProvider = BusinessCardContactWriteProvider;

export interface RelationshipRecordWriteProvider
  extends ContactRecordWriteProvider {
  getConnection(
    connectionId: string,
    actorId: string,
  ): Promise<ConnectionDTO | null>;
  saveConnection(
    connection: ConnectionDTO,
    actorId: string,
  ): Promise<ConnectionDTO>;
  saveEvidence(
    evidence: RelationshipEvidenceDTO,
    actorId: string,
  ): Promise<RelationshipEvidenceDTO>;
}

export function businessCardContactWriteFailureToAppError(
  failure: BusinessCardContactWriteFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function businessCardContactWriteFailureContext(
  failure: BusinessCardContactWriteFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    businessCardContactWriteErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "Business card contact confirmation failed closed without creating or updating a contact.",
    service: "business-card-contact-write-live",
  };
}
