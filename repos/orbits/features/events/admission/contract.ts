export const EVENT_ADMISSION_MODES = ["instant", "approval_required"] as const;
export type EventAdmissionMode = (typeof EVENT_ADMISSION_MODES)[number];

export const EVENT_ADMISSION_APPLICATION_STATUSES = [
  "pending_review",
  "waitlisted",
  "admitted",
  "rejected",
  "withdrawn",
] as const;
export type EventAdmissionApplicationStatus =
  (typeof EVENT_ADMISSION_APPLICATION_STATUSES)[number];

export type EventAdmissionErrorCode =
  | "NOT_CONFIGURED"
  | "WINDOW_CLOSED"
  | "CAPACITY_FULL"
  | "INVALID_TRANSITION"
  | "FORBIDDEN"
  | "DATA_INVALID";

export class EventAdmissionError extends Error {
  constructor(
    readonly code: EventAdmissionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "EventAdmissionError";
  }
}

export interface EventAdmissionPolicy {
  admissionMode: EventAdmissionMode;
  capacity: number | null;
  eventId: string;
  policyVersion: number;
  profileEditDeadlineAt: string;
  registrationClosesAt: string;
  registrationOpensAt: string;
  updatedAt: string;
  waitlistEnabled: boolean;
}

export interface EventAdmissionApplication {
  actorId: string;
  applicationVersion: number;
  decidedAt: string | null;
  decisionActorId: string | null;
  eventId: string;
  policyVersion: number;
  profilePayload: EventAdmissionProfileSnapshot;
  status: EventAdmissionApplicationStatus;
  submittedAt: string;
  updatedAt: string;
}

export interface ConfigureEventAdmissionPolicyInput {
  admissionMode: EventAdmissionMode;
  capacity: number | null;
  eventId: string;
  profileEditDeadlineAt: string;
  registrationClosesAt: string;
  registrationOpensAt: string;
  waitlistEnabled: boolean;
}

export interface SubmitEventAdmissionApplicationInput {
  actorId: string;
  eventId: string;
  profilePayload: EventAdmissionProfileSnapshot;
}

export interface EventAdmissionProfileSnapshot {
  answers: EventParticipantProfileAnswers;
  displayName?: string;
  interviewResponses?: readonly EventProfileResponseSnapshot[];
}

export interface DecideEventAdmissionApplicationInput {
  actorId: string;
  decision: "approve" | "reject";
  decisionActorId: string;
  eventId: string;
}

export interface WithdrawEventAdmissionApplicationInput {
  actorId: string;
  eventId: string;
}
import type { EventParticipantProfileAnswers } from "../registration/contract";
import type { EventProfileResponseSnapshot } from "../registration/interview-response-contract";
