import type { ApiErrorContext } from "../../shared/api/envelope";
import { RUNTIME_BOUNDARY_HEADER_VALUES } from "../../shared/api/envelope";
import type { FeatureMode } from "../../shared/config/feature-mode";
import { AppError, type AppErrorCode } from "../../shared/errors/app-error";

export const CONTACT_INVITATION_ERROR_CODES = [
  "CONTACT_INVITATION_INPUT_INVALID",
  "CONTACT_INVITATION_NOT_FOUND",
  "CONTACT_INVITATION_CONFIRMATION_REQUIRED",
] as const;

export type ContactInvitationErrorCode =
  (typeof CONTACT_INVITATION_ERROR_CODES)[number];

export type ContactInvitationStatus = "draft" | "ready_for_delivery";

export interface PrepareContactInvitationInput {
  contactId: string;
  recipientEmail: string;
  recipientName: string;
}

export interface ConfirmContactInvitationInput {
  body: string;
  confirmed: boolean;
  invitationId: string;
  subject: string;
}

export interface ContactInvitationPayload {
  invitationId: string;
  contactId: string;
  recipientEmail: string;
  recipientName: string;
  status: ContactInvitationStatus;
  subject: string;
  body: string;
  preparedAt: string;
  updatedAt: string;
  externalSendRequested: false;
  emailProviderRequested: false;
  messageSent: false;
  nextAction: string;
}

export interface ContactInvitationSuccess {
  success: true;
  data: ContactInvitationPayload;
}

export interface ContactInvitationErrorDefinition {
  appCode: AppErrorCode;
  code: ContactInvitationErrorCode;
  message: string;
  recovery: string;
}

export const CONTACT_INVITATION_ERROR_DEFINITIONS = {
  CONTACT_INVITATION_INPUT_INVALID: {
    appCode: "VALIDATION_ERROR",
    code: "CONTACT_INVITATION_INPUT_INVALID",
    message: "A contact, recipient name, valid email, subject, and body are required.",
    recovery:
      "Review the invitation recipient and editable copy before continuing.",
  },
  CONTACT_INVITATION_NOT_FOUND: {
    appCode: "NOT_FOUND",
    code: "CONTACT_INVITATION_NOT_FOUND",
    message: "The staged contact invitation could not be found.",
    recovery:
      "Prepare a fresh invitation preview before confirming edited copy.",
  },
  CONTACT_INVITATION_CONFIRMATION_REQUIRED: {
    appCode: "VALIDATION_ERROR",
    code: "CONTACT_INVITATION_CONFIRMATION_REQUIRED",
    message: "Explicit confirmation is required before staging this invitation.",
    recovery:
      "Keep the invitation as an editable draft until the operator confirms it.",
  },
} as const satisfies Record<
  ContactInvitationErrorCode,
  ContactInvitationErrorDefinition
>;

export interface ContactInvitationFailure {
  success: false;
  error: ContactInvitationErrorDefinition & {
    externalSendRequested: false;
    emailProviderRequested: false;
    messageSent: false;
  };
}

export type ContactInvitationResult =
  | ContactInvitationSuccess
  | ContactInvitationFailure;

export interface ContactInvitationService {
  prepareInvitation(
    input: PrepareContactInvitationInput,
  ): Promise<ContactInvitationResult>;
  confirmInvitation(
    input: ConfirmContactInvitationInput,
  ): Promise<ContactInvitationResult>;
}

export function contactInvitationFailureToAppError(
  failure: ContactInvitationFailure,
): AppError {
  return new AppError(failure.error.appCode, failure.error.message);
}

export function contactInvitationFailureContext(
  failure: ContactInvitationFailure,
  mode: FeatureMode,
): ApiErrorContext {
  return {
    boundary: RUNTIME_BOUNDARY_HEADER_VALUES.runtimeBoundary,
    contactInvitationErrorCode: failure.error.code,
    mode,
    privacy: RUNTIME_BOUNDARY_HEADER_VALUES.privacy,
    provenance:
      "The invitation remained inside the staged review boundary; no email provider or external send was requested.",
    service: "contact-invitation-staged",
  };
}
