import type {
  ConnectionDTO,
  ContactDTO,
  RelationshipEvidenceDTO,
} from "../../../shared/domain/contracts";
import type { RelationshipRecordWriteProvider } from "../../contacts/contact-write-contract";
import type { EventRegistration } from "../registration/contract";
import {
  PROFILE_CONTRACT_REPAIR_EVENT_TYPE,
  parseProfileContractRepairAuditOutboxPayload,
} from "../registration/profile-contract-repair/audit-outbox-contract";
import type { EventRegistrationProvider } from "../registration/service";
import type { EventOperationsCheckIn } from "./contract";
import type { EventContactRequestNotificationWriter } from "./contact-request-notification-writer";
import type { EventOperationsOutboxMessage } from "./storage/postgres-outbox-repository";

export interface EventOperationsProjectionResult {
  policy: "canonical_only" | "in_app" | "legacy_projection";
  projectedIds: readonly string[];
  projection: "checkin_evidence" | "contact_relationship" | "contact_request_notification" | "registration" | "none";
}

export interface EventOperationsOutboxProjector {
  project(message: EventOperationsOutboxMessage): Promise<EventOperationsProjectionResult>;
}

export interface CreateEventOperationsOutboxProjectorOptions {
  contactRequestNotifications: EventContactRequestNotificationWriter | null;
  registrationProvider: EventRegistrationProvider;
  relationshipProvider: RelationshipRecordWriteProvider;
}

export class EventOperationsOutboxProjectionError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "EventOperationsOutboxProjectionError";
  }
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new EventOperationsOutboxProjectionError(
      "EVENT_OPERATIONS_OUTBOX_PAYLOAD_INVALID",
      `The ${label} outbox payload is not an object.`,
      false,
    );
  }
  return value as Readonly<Record<string, unknown>>;
}

function requiredString(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const item = value[key];
  if (typeof item !== "string" || !item.trim()) {
    throw new EventOperationsOutboxProjectionError(
      "EVENT_OPERATIONS_OUTBOX_PAYLOAD_INVALID",
      `The outbox payload is missing ${key}.`,
      false,
    );
  }
  return item;
}

function relationshipPayload(message: EventOperationsOutboxMessage): {
  connection: ConnectionDTO;
  contact: ContactDTO;
  evidence: RelationshipEvidenceDTO;
  ownerActorId: string;
} {
  const payload = record(message.payload, "relationship side");
  const contact = record(payload.contact, "relationship contact");
  const connection = record(payload.connection, "relationship connection");
  const evidence = record(payload.evidence, "relationship evidence");
  const ownerActorId = requiredString(payload, "ownerActorId");
  requiredString(contact, "id");
  requiredString(connection, "id");
  requiredString(evidence, "id");
  return {
    connection: connection as unknown as ConnectionDTO,
    contact: contact as unknown as ContactDTO,
    evidence: evidence as unknown as RelationshipEvidenceDTO,
    ownerActorId,
  };
}

function registrationPayload(message: EventOperationsOutboxMessage): EventRegistration {
  const payload = record(message.payload, "registration");
  requiredString(payload, "id");
  requiredString(payload, "eventId");
  requiredString(payload, "userId");
  requiredString(payload, "status");
  return payload as unknown as EventRegistration;
}

function checkInPayload(message: EventOperationsOutboxMessage): EventOperationsCheckIn {
  const payload = record(message.payload, "check-in");
  requiredString(payload, "actorId");
  requiredString(payload, "checkedInAt");
  requiredString(payload, "eventId");
  requiredString(payload, "evidenceId");
  requiredString(payload, "participantId");
  return payload as unknown as EventOperationsCheckIn;
}

function requiredRevision(value: Readonly<Record<string, unknown>>): number {
  const revision = Number(value.revision);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new EventOperationsOutboxProjectionError(
      "EVENT_OPERATIONS_OUTBOX_PAYLOAD_INVALID",
      "The contact-request outbox payload has an invalid revision.",
      false,
    );
  }
  return revision;
}

async function projectContactRequestNotification(input: {
  message: EventOperationsOutboxMessage;
  writer: EventContactRequestNotificationWriter;
}): Promise<EventOperationsProjectionResult> {
  const payload = record(input.message.payload, "contact request");
  const requesterActorId = requiredString(payload, "requesterActorId");
  const targetActorId = requiredString(payload, "targetActorId");
  const requestId = requiredString(payload, "requestId");
  const occurredAt = requiredString(payload, "updatedAt");
  const revision = requiredRevision(payload);
  if (
    input.message.aggregateType !== "event_contact_request" ||
    input.message.aggregateId !== requestId ||
    !Number.isFinite(Date.parse(occurredAt))
  ) {
    throw new EventOperationsOutboxProjectionError(
      "EVENT_OPERATIONS_OUTBOX_PAYLOAD_INVALID",
      "The contact-request outbox identity or timestamp is invalid.",
      false,
    );
  }
  const contactIdsByActor = payload.contactIdsByActor;
  const requesterContactId = contactIdsByActor && typeof contactIdsByActor === "object" && !Array.isArray(contactIdsByActor)
    ? (contactIdsByActor as Readonly<Record<string, unknown>>)[requesterActorId]
    : null;
  const transition = input.message.eventType.split(".").at(-1);
  const notification = input.message.eventType === "event.contact_request.created"
    ? { actorId: targetActorId, contactId: null, title: "收到新的名片交换申请" }
    : input.message.eventType === "event.contact_request.accepted"
      ? {
          actorId: requesterActorId,
          contactId: typeof requesterContactId === "string" && requesterContactId.trim() ? requesterContactId : null,
          title: "名片交换申请已接受",
        }
      : input.message.eventType === "event.contact_request.declined"
        ? { actorId: requesterActorId, contactId: null, title: "名片交换申请未被接受" }
        : { actorId: targetActorId, contactId: null, title: "名片交换申请已被撤回" };
  if (input.message.eventType === "event.contact_request.accepted" && !notification.contactId) {
    throw new EventOperationsOutboxProjectionError(
      "EVENT_OPERATIONS_OUTBOX_PAYLOAD_INVALID",
      "An accepted contact-request notification requires the requester's contact side.",
      false,
    );
  }
  // Deep-link straight to the counterpart's profile drawer so the recipient
  // can act on the request without hunting through the recommendation list.
  const focusParticipantKey =
    notification.actorId === targetActorId
      ? "requesterParticipantId"
      : "targetParticipantId";
  const focusParticipantValue = payload[focusParticipantKey];
  const focusParticipantId =
    typeof focusParticipantValue === "string" && focusParticipantValue.trim()
      ? focusParticipantValue
      : null;
  const actionHref = notification.contactId
    ? `/app/contacts/${encodeURIComponent(notification.contactId)}?eventId=${encodeURIComponent(input.message.eventId)}`
    : `/app/events/${encodeURIComponent(input.message.eventId)}${focusParticipantId ? `?participant=${encodeURIComponent(focusParticipantId)}` : ""}#event-matchmaking-title`;
  const notificationId = `notification:event-contact-request:${encodeURIComponent(requestId)}:${revision}:${transition}:${encodeURIComponent(notification.actorId)}`;
  await input.writer.createNotification({
    actionHref,
    actorId: notification.actorId,
    contactId: notification.contactId,
    eventId: input.message.eventId,
    evidenceIds: [`event-contact-request:${requestId}:revision:${revision}`],
    notificationId,
    occurredAt,
    title: notification.title,
  });
  return {
    policy: "in_app",
    projectedIds: [notificationId],
    projection: "contact_request_notification",
  };
}

function retryableProviderError(error: unknown): EventOperationsOutboxProjectionError {
  if (error instanceof EventOperationsOutboxProjectionError) return error;
  return new EventOperationsOutboxProjectionError(
    "EVENT_OPERATIONS_OUTBOX_PROVIDER_FAILED",
    error instanceof Error ? error.message : "The legacy projection provider failed.",
    true,
    error instanceof Error ? { cause: error } : undefined,
  );
}

export function createEventOperationsOutboxProjector({
  contactRequestNotifications,
  registrationProvider,
  relationshipProvider,
}: CreateEventOperationsOutboxProjectorOptions): EventOperationsOutboxProjector {
  return {
    async project(message) {
      try {
        if (
          message.eventType === "event.registration.upserted" ||
          message.eventType === "event.registration.cancelled"
        ) {
          const registration = registrationPayload(message);
          await registrationProvider.saveRegistration(registration);
          return {
            policy: "legacy_projection",
            projectedIds: [registration.id],
            projection: "registration",
          };
        }

        if (message.eventType === "event.checkin.created") {
          const checkIn = checkInPayload(message);
          const evidence: RelationshipEvidenceDTO = {
            confidence: 1,
            createdBy: checkIn.actorId,
            id: checkIn.evidenceId,
            occurredAt: checkIn.checkedInAt,
            sourceId: checkIn.eventId,
            sourceType: "event_import",
            summary: `Checked in to event ${checkIn.eventId}.`,
          };
          await relationshipProvider.saveEvidence(evidence, checkIn.actorId);
          return {
            policy: "legacy_projection",
            projectedIds: [evidence.id],
            projection: "checkin_evidence",
          };
        }

        if (message.eventType === "event.relationship_side.project") {
          const value = relationshipPayload(message);
          // Each upsert uses a deterministic canonical id. This order makes a
          // partial provider failure replay-safe: evidence and contact can be
          // overwritten with the same value before connection is retried.
          await relationshipProvider.saveEvidence(
            value.evidence,
            value.ownerActorId,
          );
          await relationshipProvider.saveContact(value.contact, value.ownerActorId);
          await relationshipProvider.saveConnection(
            value.connection,
            value.ownerActorId,
          );
          return {
            policy: "legacy_projection",
            projectedIds: [
              value.evidence.id,
              value.contact.id,
              value.connection.id,
            ],
            projection: "contact_relationship",
          };
        }

        if (
          message.eventType === "event.contact_request.created" ||
          message.eventType === "event.contact_request.accepted" ||
          message.eventType === "event.contact_request.declined" ||
          message.eventType === "event.contact_request.withdrawn"
        ) {
          if (contactRequestNotifications) {
            return await projectContactRequestNotification({
              message,
              writer: contactRequestNotifications,
            });
          }
          return {
            policy: "canonical_only",
            projectedIds: [],
            projection: "none",
          };
        }

        if (message.eventType === PROFILE_CONTRACT_REPAIR_EVENT_TYPE) {
          let parsed: ReturnType<
            typeof parseProfileContractRepairAuditOutboxPayload
          > | null = null;
          try {
            parsed = parseProfileContractRepairAuditOutboxPayload(
              message.payload,
            );
          } catch {
            // This branch intentionally normalizes all contract-boundary
            // failures to a terminal, non-identifying repair error.
          }
          if (
            !parsed?.ok ||
            parsed.value.eventId !== message.eventId ||
            message.aggregateType !== "event_participant_profile" ||
            message.aggregateId !== parsed.value.targetToken
          ) {
            throw new EventOperationsOutboxProjectionError(
              "EVENT_OPERATIONS_PROFILE_REPAIR_PAYLOAD_INVALID",
              "The profile repair outbox payload is invalid.",
              false,
            );
          }
          return {
            policy: "canonical_only",
            projectedIds: [],
            projection: "none",
          };
        }

        throw new EventOperationsOutboxProjectionError(
          "EVENT_OPERATIONS_OUTBOX_EVENT_UNSUPPORTED",
          "No explicit projection policy exists for this event type.",
          false,
        );
      } catch (error) {
        throw retryableProviderError(error);
      }
    },
  };
}
