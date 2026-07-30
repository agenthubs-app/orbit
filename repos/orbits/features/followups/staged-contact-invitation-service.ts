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
import type {
  LiveRecord,
  LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";

export interface StagedContactInvitationServiceOptions {
  actorId: string;
  now?: () => string;
  store: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

const CONTACT_INVITATION_COLLECTION = "contact_invitations";

function nonEmpty(value: string): string | null {
  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function invitationIdFor(
  actorId: string,
  contactId: string,
  recipientEmail: string,
): string {
  const digest = createHash("sha256")
    .update(`${actorId}\u0000${contactId}\u0000${recipientEmail.toLowerCase()}`)
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

function payloadFromRecord(
  record: LiveRecord<Record<string, unknown>> | null,
  actorId: string,
): ContactInvitationPayload | null {
  if (
    !record ||
    record.userId !== actorId ||
    record.payload.actorId !== actorId
  ) {
    return null;
  }

  const payload = record.payload;
  const status =
    payload.status === "draft" || payload.status === "ready_for_delivery"
      ? payload.status
      : null;

  if (
    typeof payload.invitationId !== "string" ||
    typeof payload.contactId !== "string" ||
    typeof payload.recipientEmail !== "string" ||
    typeof payload.recipientName !== "string" ||
    !status ||
    typeof payload.subject !== "string" ||
    typeof payload.body !== "string" ||
    typeof payload.preparedAt !== "string" ||
    typeof payload.updatedAt !== "string" ||
    payload.externalSendRequested !== false ||
    payload.emailProviderRequested !== false ||
    payload.messageSent !== false ||
    typeof payload.nextAction !== "string"
  ) {
    return null;
  }

  return {
    invitationId: payload.invitationId,
    contactId: payload.contactId,
    recipientEmail: payload.recipientEmail,
    recipientName: payload.recipientName,
    status,
    subject: payload.subject,
    body: payload.body,
    preparedAt: payload.preparedAt,
    updatedAt: payload.updatedAt,
    externalSendRequested: false,
    emailProviderRequested: false,
    messageSent: false,
    nextAction: payload.nextAction,
  };
}

function invitationRecord(input: {
  actorId: string;
  payload: ContactInvitationPayload;
  workspaceId: string;
}): LiveRecord<Record<string, unknown>> {
  return {
    workspaceId: input.workspaceId,
    collectionName: CONTACT_INVITATION_COLLECTION,
    recordId: input.payload.invitationId,
    userId: input.actorId,
    sourceType: "manual",
    sourceId: input.payload.invitationId,
    sourceLabel: "contact-invitation-staged",
    evidenceIds: [`evidence:${input.payload.invitationId}`],
    targetType: "contact",
    targetId: input.payload.contactId,
    occurredAt: input.payload.updatedAt,
    createdAt: input.payload.preparedAt,
    updatedAt: input.payload.updatedAt,
    lifecycleState: "active",
    searchText: [
      input.payload.recipientName,
      input.payload.recipientEmail,
      input.payload.subject,
    ].join(" "),
    payload: {
      ...input.payload,
      actorId: input.actorId,
    },
  };
}

export function createStagedContactInvitationService({
  actorId,
  now = () => new Date().toISOString(),
  store,
  workspaceId,
}: StagedContactInvitationServiceOptions): ContactInvitationService {
  const messageDraftService = createLiveMessageDraftGeneratorService();

  return {
    async getInvitation(invitationIdInput) {
      const invitationId = nonEmpty(invitationIdInput);

      if (!invitationId) {
        return failure("CONTACT_INVITATION_INPUT_INVALID");
      }

      const payload = payloadFromRecord(
        await store.getRecord({
          collectionName: CONTACT_INVITATION_COLLECTION,
          recordId: invitationId,
          workspaceId,
        }),
        actorId,
      );

      return payload
        ? success(payload)
        : failure("CONTACT_INVITATION_NOT_FOUND");
    },

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

      const invitationId = invitationIdFor(
        actorId,
        contactId,
        recipientEmail,
      );
      const existing = payloadFromRecord(
        await store.getRecord({
          collectionName: CONTACT_INVITATION_COLLECTION,
          recordId: invitationId,
          workspaceId,
        }),
        actorId,
      );
      const preparedAt = existing?.preparedAt ?? now();
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

      await store.upsertRecord(
        invitationRecord({ actorId, payload, workspaceId }),
      );

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

      const prepared = payloadFromRecord(
        await store.getRecord({
          collectionName: CONTACT_INVITATION_COLLECTION,
          recordId: invitationId,
          workspaceId,
        }),
        actorId,
      );

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

      await store.upsertRecord(
        invitationRecord({ actorId, payload, workspaceId }),
      );

      return success(payload);
    },
  };
}

export function createUnavailableContactInvitationService(): ContactInvitationService {
  const unavailable = async (): Promise<ContactInvitationResult> =>
    failure("CONTACT_INVITATION_STORAGE_UNAVAILABLE");

  return {
    confirmInvitation: unavailable,
    getInvitation: unavailable,
    prepareInvitation: unavailable,
  };
}
