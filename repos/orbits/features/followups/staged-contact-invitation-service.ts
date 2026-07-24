import { createHash } from "node:crypto";

import {
  CONTACT_INVITATION_ERROR_DEFINITIONS,
  type ContactInvitationErrorCode,
  type ContactInvitationFailure,
  type ContactInvitationPayload,
  type ContactInvitationResult,
  type ContactInvitationService,
} from "./contact-invitation-contract";
import { createLiveMessageDraftGeneratorService } from "./live-message-draft-service";

export interface StagedContactInvitationServiceOptions {
  now?: () => string;
}

function nonEmpty(value: string): string | null {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function invitationIdFor(contactId: string, recipientEmail: string): string {
  const digest = createHash("sha256")
    .update(`${contactId}:${recipientEmail.toLowerCase()}`)
    .digest("hex")
    .slice(0, 24);

  return `contact-invitation:${digest}`;
}

function failure(code: ContactInvitationErrorCode): ContactInvitationFailure {
  return {
    success: false,
    error: {
      ...CONTACT_INVITATION_ERROR_DEFINITIONS[code],
      externalSendRequested: false,
      emailProviderRequested: false,
      messageSent: false,
    },
  };
}

function success(
  payload: ContactInvitationPayload,
): ContactInvitationResult {
  return {
    success: true,
    data: { ...payload },
  };
}

export function createStagedContactInvitationService({
  now = () => new Date().toISOString(),
}: StagedContactInvitationServiceOptions = {}): ContactInvitationService {
  const invitations = new Map<string, ContactInvitationPayload>();
  const messageDraftService = createLiveMessageDraftGeneratorService();

  return {
    async prepareInvitation(input) {
      const contactId = nonEmpty(input.contactId);
      const recipientEmail = nonEmpty(input.recipientEmail)?.toLowerCase();
      const recipientName = nonEmpty(input.recipientName);

      if (
        !contactId ||
        !recipientEmail ||
        !validEmail(recipientEmail) ||
        !recipientName
      ) {
        return failure("CONTACT_INVITATION_INPUT_INVALID");
      }

      const generated = messageDraftService.createDraft({
        contextNote:
          "I would like to invite you to join Orbit, a private workspace for preserving the context behind meaningful professional relationships.",
        draftKind: "invitation",
        organization: "Orbit",
        recipientName,
      });
      const draft = generated.success ? generated.data.drafts[0] : null;

      if (!draft) {
        return failure("CONTACT_INVITATION_INPUT_INVALID");
      }

      const preparedAt = now();
      const invitationId = invitationIdFor(contactId, recipientEmail);
      const payload: ContactInvitationPayload = {
        invitationId,
        contactId,
        recipientEmail,
        recipientName,
        status: "draft",
        subject: draft.subject,
        body: draft.body,
        preparedAt,
        updatedAt: preparedAt,
        externalSendRequested: false,
        emailProviderRequested: false,
        messageSent: false,
        nextAction:
          "Review and edit the invitation, then confirm it separately from contact creation.",
      };

      invitations.set(invitationId, payload);

      return success(payload);
    },

    async confirmInvitation(input) {
      if (!input.confirmed) {
        return failure("CONTACT_INVITATION_CONFIRMATION_REQUIRED");
      }

      const invitationId = nonEmpty(input.invitationId);
      const subject = nonEmpty(input.subject);
      const body = nonEmpty(input.body);

      if (!invitationId || !subject || !body) {
        return failure("CONTACT_INVITATION_INPUT_INVALID");
      }

      const prepared = invitations.get(invitationId);

      if (!prepared) {
        return failure("CONTACT_INVITATION_NOT_FOUND");
      }

      const payload: ContactInvitationPayload = {
        ...prepared,
        status: "ready_for_delivery",
        subject,
        body,
        updatedAt: now(),
        externalSendRequested: false,
        emailProviderRequested: false,
        messageSent: false,
        nextAction:
          "Configure an email delivery provider before sending this invitation.",
      };

      invitations.set(invitationId, payload);

      return success(payload);
    },
  };
}
