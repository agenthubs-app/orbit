import { createHash, randomUUID } from "node:crypto";

import {
  AppointmentError,
  type AppointmentAggregate,
  type AppointmentCandidateTime,
  type AppointmentCommand,
  type AppointmentOutboxEvent,
  type AppointmentProposal,
  type AppointmentProposalInput,
} from "./contract";
import type { AppointmentMutationResult, AppointmentRepository } from "./repository";

export interface AppointmentService {
  createDraft(input: {
    actorId: string;
    appointmentId?: string | null;
    eventId?: string | null;
    idempotencyKey: string;
    authorityReference: string;
  }): Promise<AppointmentMutationResult>;
  get(input: { actorId: string; appointmentId: string }): Promise<AppointmentAggregate>;
  list(input: { actorId: string }): Promise<readonly AppointmentAggregate[]>;
  command(input: {
    actorId: string;
    appointmentId: string;
    candidateId?: string | null;
    command: AppointmentCommand;
    expectedVersion: number;
    idempotencyKey: string;
    proposal?: AppointmentProposalInput | null;
  }): Promise<AppointmentMutationResult>;
}

export interface AppointmentAuthorityVerifier {
  resolveAcceptedBilateralContact(input: {
    actorId: string;
    authorityReference: string;
    eventId: string | null;
  }): Promise<{
    authorityRequestId: string;
    contactIdsByActor: Readonly<Record<string, string>>;
    counterpartyActorId: string;
    relationshipPairId: string;
  } | null>;
}

const APPOINTMENT_ID_MAX = 256;
const APPOINTMENT_HISTORY_MAX = 100;

function required(value: string, label: string, maxLength = APPOINTMENT_ID_MAX): string {
  if (typeof value !== "string") throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", `${label} is required.`);
  const normalized = value.trim();
  if (!normalized) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", `${label} is required.`);
  if (normalized.length > maxLength) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", `${label} is too long.`);
  return normalized;
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function proposalFor(input: AppointmentProposalInput, actorId: string, revision: number, timestamp: string): AppointmentProposal {
  if (!input || typeof input !== "object" || !Array.isArray(input.candidateTimes)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "A structured appointment proposal is required.");
  if (typeof input.timezone !== "string" || input.timezone.length > 128) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Timezone is invalid.");
  const timezone = input.timezone.trim();
  if (!validTimezone(timezone)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "A valid IANA timezone is required.");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 15 || input.durationMinutes > 480) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Duration must be between 15 and 480 minutes.");
  if (input.candidateTimes.length < 3 || input.candidateTimes.length > 5) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "A proposal must include three to five candidate times.");
  const seen = new Set<string>();
  const earliestAllowed = Date.parse(timestamp) + 15 * 60_000;
  const candidateTimes: AppointmentCandidateTime[] = input.candidateTimes.map((candidate, index) => {
    if (!candidate || typeof candidate !== "object" || typeof candidate.startsAtUtc !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(candidate.startsAtUtc)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Every candidate time must be an RFC3339 UTC instant ending in Z.");
    if (candidate.candidateId !== undefined && candidate.candidateId !== null && (typeof candidate.candidateId !== "string" || candidate.candidateId.length > 128)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Candidate id is invalid.");
    const parsed = Date.parse(candidate.startsAtUtc);
    if (!Number.isFinite(parsed)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Every candidate time must be a valid UTC instant.");
    if (parsed <= earliestAllowed) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Candidate times must be at least fifteen minutes in the future.");
    const startsAtUtc = new Date(parsed).toISOString();
    if (seen.has(startsAtUtc)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Candidate times must be unique.");
    seen.add(startsAtUtc);
    return { candidateId: candidate.candidateId?.trim() || `candidate:${revision}:${index + 1}`, startsAtUtc };
  }).sort((left, right) => left.startsAtUtc.localeCompare(right.startsAtUtc));
  if (!input.medium || typeof input.medium !== "object") throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Meeting medium is required.");
  if (input.medium.kind === "in_person") {
    if (typeof input.medium.location !== "string" || input.medium.location.length > 500) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Location is invalid.");
    required(input.medium.location, "Location");
  } else if (input.medium.kind === "video") {
    if (input.medium.provider !== "google_meet" && input.medium.provider !== "other") throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Video provider is invalid.");
    if (input.medium.joinUrl !== null && (typeof input.medium.joinUrl !== "string" || input.medium.joinUrl.length > 2048)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Video join URL is invalid.");
    if (input.medium.joinUrl !== null) {
      let joinUrl: URL;
      try { joinUrl = new URL(input.medium.joinUrl); } catch { throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Video join URL must be a valid HTTPS URL."); }
      if (joinUrl.protocol !== "https:") throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Video join URL must use HTTPS.");
    }
  } else if (input.medium.kind === "phone") {
    if (input.medium.phoneHint !== null && (typeof input.medium.phoneHint !== "string" || input.medium.phoneHint.length > 128)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Phone hint is invalid.");
  } else throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Meeting medium is invalid.");
  if (input.note !== undefined && input.note !== null && (typeof input.note !== "string" || input.note.length > 2_000)) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Proposal note is too long.");
  return {
    candidateTimes,
    createdAt: timestamp,
    durationMinutes: input.durationMinutes,
    medium: input.medium,
    note: input.note?.trim() ?? "",
    proposedByActorId: actorId,
    revision,
    timezone,
  };
}

function history(current: AppointmentAggregate, actorId: string, command: AppointmentCommand, timestamp: string, detail: string, proposalRevision: number | null) {
  if (current.history.length >= APPOINTMENT_HISTORY_MAX) throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "This appointment has reached its negotiation history limit; create a new appointment.");
  return [...current.history, { actorId, at: timestamp, command, detail, proposalRevision, version: current.version + 1 }];
}

function outboxEvent(input: { appointment: AppointmentAggregate; eventType: AppointmentOutboxEvent["eventType"]; revision: number; timestamp: string; availableAt?: string; suffix?: string }): AppointmentOutboxEvent {
  const suffix = input.suffix ?? input.eventType;
  return {
    aggregateVersion: input.appointment.version,
    appointmentId: input.appointment.appointmentId,
    availableAt: input.availableAt ?? input.timestamp,
    createdAt: input.timestamp,
    dedupeKey: `${input.appointment.appointmentId}:${input.revision}:${suffix}`,
    eventId: `appointment-event:${randomUUID()}`,
    eventType: input.eventType,
    payload: {
      appointmentId: input.appointment.appointmentId,
      confirmed: input.appointment.confirmed,
      participantActorIds: [input.appointment.ownerActorId, input.appointment.inviteeActorId],
      revision: input.revision,
    },
  };
}

function confirmationEvents(appointment: AppointmentAggregate, previousRevision: number | null, timestamp: string): AppointmentOutboxEvent[] {
  const confirmed = appointment.confirmed!;
  const starts = Date.parse(confirmed.startsAtUtc);
  const ends = starts + confirmed.durationMinutes * 60_000;
  const events: AppointmentOutboxEvent[] = [];
  if (previousRevision !== null) {
    events.push(outboxEvent({ appointment, eventType: "appointment.reminders.invalidate", revision: previousRevision, suffix: "invalidate", timestamp }));
  }
  events.push(outboxEvent({ appointment, eventType: previousRevision === null ? "appointment.confirmed" : "appointment.rescheduled", revision: confirmed.proposalRevision, timestamp }));
  events.push(outboxEvent({ appointment, eventType: "appointment.calendar.requested", revision: confirmed.proposalRevision, suffix: "calendar-requested", timestamp }));
  events.push(outboxEvent({ appointment, eventType: "appointment.meeting.requested", revision: confirmed.proposalRevision, suffix: "meeting-requested", timestamp }));
  events.push(outboxEvent({ appointment, availableAt: new Date(starts - 24 * 60 * 60_000).toISOString(), eventType: "appointment.reminder.t24h", revision: confirmed.proposalRevision, suffix: "t24h", timestamp }));
  events.push(outboxEvent({ appointment, availableAt: new Date(starts - 60 * 60_000).toISOString(), eventType: "appointment.reminder.t1h", revision: confirmed.proposalRevision, suffix: "t1h", timestamp }));
  events.push(outboxEvent({ appointment, availableAt: new Date(ends + 15 * 60_000).toISOString(), eventType: "appointment.memo.t15m", revision: confirmed.proposalRevision, suffix: "t15m", timestamp }));
  return events;
}

export function createAppointmentService(input: { authorityVerifier: AppointmentAuthorityVerifier; now?: () => string; repository: AppointmentRepository }): AppointmentService {
  const now = input.now ?? (() => new Date().toISOString());
  function idempotencyKey(value: string): string {
    if (typeof value !== "string") throw new AppointmentError("APPOINTMENT_IDEMPOTENCY_REQUIRED", "An idempotency key is required.");
    const key = value.trim();
    if (!key) throw new AppointmentError("APPOINTMENT_IDEMPOTENCY_REQUIRED", "An idempotency key is required.");
    if (key.length > 96 || !/^[\x21-\x7e]+$/.test(key)) throw new AppointmentError("APPOINTMENT_IDEMPOTENCY_REQUIRED", "Idempotency keys must be at most 96 printable ASCII characters.");
    return key;
  }

  return {
    async createDraft(value) {
      const timestamp = now();
      const actorId = required(value.actorId, "Actor");
      const eventId = value.eventId ? required(value.eventId, "Event") : null;
      const authorityReference = required(value.authorityReference, "Appointment authority reference");
      const authority = await input.authorityVerifier.resolveAcceptedBilateralContact({ actorId, authorityReference, eventId });
      if (!authority) {
        throw new AppointmentError("APPOINTMENT_FORBIDDEN", "An accepted bilateral contact is required before creating an appointment.");
      }
      const inviteeActorId = required(authority.counterpartyActorId, "Invitee");
      if (actorId === inviteeActorId) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "An appointment needs two different participants.");
      const appointmentId = value.appointmentId ? required(value.appointmentId, "Appointment") : `appointment:${randomUUID()}`;
      const relationshipPairId = required(authority.relationshipPairId, "Relationship pair");
      const contactIdsByActor = Object.fromEntries(Object.entries(authority.contactIdsByActor).map(([key, contactId]) => [required(key, "Contact owner"), required(contactId, "Contact")])) as Record<string, string>;
      if (!contactIdsByActor[actorId] || !contactIdsByActor[inviteeActorId]) throw new AppointmentError("APPOINTMENT_FORBIDDEN", "Both canonical relationship sides are required before creating an appointment.");
      const appointment: AppointmentAggregate = {
        appointmentId,
        authorityRequestId: required(authority.authorityRequestId, "Authority request"),
        confirmed: null,
        contactIdsByActor,
        createdAt: timestamp,
        createdByActorId: actorId,
        eventId,
        history: [{ actorId, at: timestamp, command: "created", detail: "Appointment draft created.", proposalRevision: null, version: 1 }],
        inviteeActorId,
        ownerActorId: actorId,
        pendingProposalRevision: null,
        projection: { calendar: "not_synced", meeting: "not_synced", revision: null },
        proposals: [],
        relationshipPairId,
        reminders: { cancelled: false, currentRevision: null },
        status: "draft",
        updatedAt: timestamp,
        version: 1,
      };
      return input.repository.create({
        appointment,
        command: "create",
        idempotencyKey: idempotencyKey(value.idempotencyKey),
        requestHash: requestHash({ actorId, authorityReference, eventId, requestedAppointmentId: value.appointmentId?.trim() || null }),
      });
    },
    async get(value) {
      const appointment = await input.repository.getForActor(required(value.appointmentId, "Appointment"), required(value.actorId, "Actor"));
      if (!appointment) throw new AppointmentError("APPOINTMENT_NOT_FOUND", "The appointment does not exist for this actor.");
      return appointment;
    },
    list: (value) => input.repository.listForActor(required(value.actorId, "Actor")),
    async command(value) {
      return input.repository.mutate({
        actorId: required(value.actorId, "Actor"),
        appointmentId: required(value.appointmentId, "Appointment"),
        command: value.command,
        expectedVersion: value.expectedVersion,
        idempotencyKey: idempotencyKey(value.idempotencyKey),
        requestHash: requestHash({ candidateId: value.candidateId?.trim() || null, command: value.command, expectedVersion: value.expectedVersion, proposal: value.proposal ?? null }),
      }, (current) => {
        const timestamp = now();
        const nextVersion = current.version + 1;
        if (current.status === "cancelled" || current.status === "completed") throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", `Cannot ${value.command} a ${current.status} appointment.`);

        if (value.command === "propose" || value.command === "counter") {
          if (!value.proposal) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "A proposal is required.");
          const pending = current.pendingProposalRevision === null ? null : current.proposals.find((proposal) => proposal.revision === current.pendingProposalRevision) ?? null;
          if (value.command === "propose" && current.status === "draft" && current.ownerActorId !== value.actorId) throw new AppointmentError("APPOINTMENT_FORBIDDEN", "Only the draft owner can submit the first proposal.");
          if (value.command === "counter" && (!pending || pending.proposedByActorId === value.actorId)) throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "Only the proposal recipient can counter.");
          if (value.command === "propose" && current.status !== "draft" && current.status !== "confirmed") throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "A new proposal starts a draft or confirmed reschedule.");
          const revision = (current.proposals.at(-1)?.revision ?? 0) + 1;
          if (current.proposals.length >= APPOINTMENT_HISTORY_MAX) throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "This appointment has reached its proposal limit; create a new appointment.");
          const proposal = proposalFor(value.proposal, value.actorId, revision, timestamp);
          const status = current.confirmed ? "reschedule_pending" as const : value.command === "counter" ? "negotiating" as const : "awaiting_response" as const;
          const appointment: AppointmentAggregate = {
            ...current,
            history: history(current, value.actorId, value.command, timestamp, value.command === "counter" ? "Candidate times countered." : current.confirmed ? "Reschedule proposed; previous confirmation retained." : "Candidate times proposed.", revision),
            pendingProposalRevision: revision,
            proposals: [...current.proposals, proposal],
            status,
            updatedAt: timestamp,
            version: nextVersion,
          };
          return { appointment, outbox: [] };
        }

        if (value.command === "accept") {
          const proposal = current.proposals.find((item) => item.revision === current.pendingProposalRevision);
          if (!proposal || proposal.proposedByActorId === value.actorId) throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "Only the current proposal recipient can accept it.");
          const candidate = proposal.candidateTimes.find((item) => item.candidateId === value.candidateId);
          if (!candidate) throw new AppointmentError("APPOINTMENT_INVALID_PROPOSAL", "Select a candidate from the current proposal.");
          const previousRevision = current.confirmed?.proposalRevision ?? null;
          const appointment: AppointmentAggregate = {
            ...current,
            confirmed: { candidateId: candidate.candidateId, confirmedAt: timestamp, confirmedByActorId: value.actorId, durationMinutes: proposal.durationMinutes, medium: proposal.medium, proposalRevision: proposal.revision, startsAtUtc: candidate.startsAtUtc, timezone: proposal.timezone },
            history: history(current, value.actorId, "accept", timestamp, previousRevision === null ? "Proposal accepted." : "Reschedule accepted; previous confirmation replaced.", proposal.revision),
            pendingProposalRevision: null,
            projection: { calendar: "pending", meeting: "pending", revision: proposal.revision },
            reminders: { cancelled: false, currentRevision: proposal.revision },
            status: "confirmed",
            updatedAt: timestamp,
            version: nextVersion,
          };
          return { appointment, outbox: confirmationEvents(appointment, previousRevision, timestamp) };
        }

        if (value.command === "decline") {
          const proposal = current.proposals.find((item) => item.revision === current.pendingProposalRevision);
          if (!proposal || proposal.proposedByActorId === value.actorId) throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "Only the current proposal recipient can decline it.");
          const retainsConfirmation = current.confirmed !== null;
          const appointment: AppointmentAggregate = {
            ...current,
            history: history(current, value.actorId, "decline", timestamp, retainsConfirmation ? "Reschedule declined; prior confirmation retained." : "Appointment proposal declined.", proposal.revision),
            pendingProposalRevision: null,
            status: retainsConfirmation ? "confirmed" : "cancelled",
            updatedAt: timestamp,
            version: nextVersion,
          };
          return { appointment, outbox: [] };
        }

        if (value.command === "cancel") {
          const revision = current.confirmed?.proposalRevision ?? null;
          const appointment: AppointmentAggregate = { ...current, history: history(current, value.actorId, "cancel", timestamp, "Appointment cancelled; pending reminders and provider projections must be cancelled.", revision), pendingProposalRevision: null, projection: revision === null ? current.projection : { calendar: current.projection.calendar === "not_synced" ? "not_synced" : "pending", meeting: current.projection.meeting === "not_synced" ? "not_synced" : "pending", revision }, reminders: { cancelled: true, currentRevision: revision }, status: "cancelled", updatedAt: timestamp, version: nextVersion };
          const outbox = revision === null ? [] : [
            outboxEvent({ appointment, eventType: "appointment.reminders.invalidate", revision, suffix: "invalidate-on-cancel", timestamp }),
            outboxEvent({ appointment, eventType: "appointment.cancelled", revision, suffix: "cancelled", timestamp }),
            outboxEvent({ appointment, eventType: "appointment.calendar.cancel", revision, suffix: "calendar-cancel", timestamp }),
            outboxEvent({ appointment, eventType: "appointment.meeting.cancel", revision, suffix: "meeting-cancel", timestamp }),
          ];
          return { appointment, outbox };
        }
        if (value.command === "complete") {
          if (!current.confirmed) throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "Only a confirmed appointment can be completed.");
          const endsAt = Date.parse(current.confirmed.startsAtUtc) + current.confirmed.durationMinutes * 60_000;
          if (Date.parse(timestamp) < endsAt) throw new AppointmentError("APPOINTMENT_TIME_GATED", "An appointment can only be completed after its confirmed end time.");
          const appointment: AppointmentAggregate = { ...current, history: history(current, value.actorId, "complete", timestamp, "Appointment marked complete.", current.confirmed.proposalRevision), status: "completed", updatedAt: timestamp, version: nextVersion };
          return { appointment, outbox: [] };
        }
        throw new AppointmentError("APPOINTMENT_INVALID_TRANSITION", "Unsupported appointment command.");
      });
    },
  };
}
