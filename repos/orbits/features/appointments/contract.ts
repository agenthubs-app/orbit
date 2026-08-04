export type AppointmentStatus =
  | "draft"
  | "awaiting_response"
  | "negotiating"
  | "confirmed"
  | "reschedule_pending"
  | "cancelled"
  | "completed";

export type AppointmentCommand =
  | "propose"
  | "counter"
  | "accept"
  | "decline"
  | "cancel"
  | "complete";

export type AppointmentMedium =
  | { kind: "in_person"; location: string }
  | { kind: "video"; provider: "google_meet" | "other"; joinUrl: string | null }
  | { kind: "phone"; phoneHint: string | null };

export interface AppointmentCandidateTime {
  candidateId: string;
  startsAtUtc: string;
}

export interface AppointmentProposal {
  candidateTimes: readonly AppointmentCandidateTime[];
  createdAt: string;
  durationMinutes: number;
  medium: AppointmentMedium;
  note: string;
  proposedByActorId: string;
  revision: number;
  timezone: string;
}

export interface AppointmentConfirmation {
  candidateId: string;
  confirmedAt: string;
  confirmedByActorId: string;
  durationMinutes: number;
  medium: AppointmentMedium;
  proposalRevision: number;
  startsAtUtc: string;
  timezone: string;
}

export interface AppointmentHistoryEntry {
  actorId: string;
  at: string;
  command: "created" | AppointmentCommand | "reminders_invalidated";
  detail: string;
  proposalRevision: number | null;
  version: number;
}

export interface AppointmentProjectionState {
  calendar: "pending" | "not_synced" | "synced" | "failed";
  meeting: "pending" | "not_synced" | "synced" | "failed";
  revision: number | null;
}

export interface AppointmentAggregate {
  appointmentId: string;
  authorityRequestId: string;
  contactIdsByActor: Readonly<Record<string, string>>;
  createdAt: string;
  createdByActorId: string;
  eventId: string | null;
  history: readonly AppointmentHistoryEntry[];
  inviteeActorId: string;
  ownerActorId: string;
  pendingProposalRevision: number | null;
  proposals: readonly AppointmentProposal[];
  confirmed: AppointmentConfirmation | null;
  projection: AppointmentProjectionState;
  relationshipPairId: string;
  reminders: { cancelled: boolean; currentRevision: number | null };
  status: AppointmentStatus;
  updatedAt: string;
  version: number;
}

export interface AppointmentProposalInput {
  candidateTimes: readonly { candidateId?: string | null; startsAtUtc: string }[];
  durationMinutes: number;
  medium: AppointmentMedium;
  note?: string | null;
  timezone: string;
}

export interface AppointmentOutboxEvent {
  aggregateVersion: number;
  appointmentId: string;
  availableAt: string;
  createdAt: string;
  dedupeKey: string;
  eventId: string;
  eventType:
    | "appointment.confirmed"
    | "appointment.rescheduled"
    | "appointment.reminders.invalidate"
    | "appointment.reminder.t24h"
    | "appointment.reminder.t1h"
    | "appointment.memo.t15m"
    | "appointment.cancelled"
    | "appointment.calendar.requested"
    | "appointment.calendar.cancel"
    | "appointment.meeting.requested"
    | "appointment.meeting.cancel";
  payload: Readonly<Record<string, unknown>>;
}

export const APPOINTMENT_ERROR_CODES = [
  "APPOINTMENT_NOT_FOUND",
  "APPOINTMENT_FORBIDDEN",
  "APPOINTMENT_CONFLICT",
  "APPOINTMENT_INVALID_TRANSITION",
  "APPOINTMENT_TIME_GATED",
  "APPOINTMENT_INVALID_PROPOSAL",
  "APPOINTMENT_IDEMPOTENCY_REQUIRED",
] as const;

export type AppointmentErrorCode = (typeof APPOINTMENT_ERROR_CODES)[number];

export class AppointmentError extends Error {
  constructor(readonly code: AppointmentErrorCode, message: string) {
    super(message);
    this.name = "AppointmentError";
  }
}
