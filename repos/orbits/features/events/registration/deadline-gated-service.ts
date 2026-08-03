import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileAnswers,
  type EventRegistration,
  type RegisterForEventInput,
} from "./contract";
import type {
  EventRegistrationProvider,
  EventRegistrationService,
} from "./service";

export interface EventRegistrationWindow {
  eventId: string;
  profileEditDeadlineAt: string;
  registrationCutoffAt: string;
}

export type EventRegistrationWindowEnrollment =
  | { state: "legacy_unenrolled" }
  | {
      state: "enrolled";
      statementTimestamp: string;
      window: EventRegistrationWindow;
    }
  | { state: "enrolled_misconfigured" };

export interface EventRegistrationWindowProvider {
  getEnrollment(eventId: string): Promise<EventRegistrationWindowEnrollment>;
}

export const EVENT_REGISTRATION_WINDOW_ERROR_CODES = [
  "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
  "EVENT_REGISTRATION_WINDOW_INVALID",
  "EVENT_REGISTRATION_PROFILE_EDIT_DEADLINE_PASSED",
  "EVENT_REGISTRATION_CUTOFF_PASSED",
] as const;

export type EventRegistrationWindowErrorCode =
  (typeof EVENT_REGISTRATION_WINDOW_ERROR_CODES)[number];

export class EventRegistrationWindowError extends Error {
  readonly code: EventRegistrationWindowErrorCode;

  constructor(code: EventRegistrationWindowErrorCode, message: string) {
    super(message);
    this.name = "EventRegistrationWindowError";
    this.code = code;
  }
}

function normalizedAnswers(
  value?: EventParticipantProfileAnswers | null,
): EventParticipantProfileAnswers {
  const answers: EventParticipantProfileAnswers = {};
  for (const field of EVENT_PARTICIPANT_PROFILE_FIELDS) {
    const answer = value?.[field];
    if (typeof answer === "string" && answer.trim()) {
      answers[field] = answer.trim().slice(0, 1_000);
    }
  }
  return answers;
}

function sameAnswers(
  left: EventParticipantProfileAnswers,
  right: EventParticipantProfileAnswers,
): boolean {
  return EVENT_PARTICIPANT_PROFILE_FIELDS.every(
    (field) => left[field] === right[field],
  );
}

function displayNameChanged(
  existing: EventRegistration,
  displayName?: string | null,
): boolean {
  const next = displayName?.trim();
  return Boolean(next && next !== existing.participantProfile.displayName);
}

function isIdempotentActiveRegistration(input: {
  existing: EventRegistration | null;
  registration: RegisterForEventInput;
}): input is {
  existing: EventRegistration;
  registration: RegisterForEventInput;
} {
  return Boolean(
    input.existing?.status === "rsvped" &&
      sameAnswers(
        input.existing.participantProfile.answers,
        normalizedAnswers(input.registration.answers),
      ) &&
      !displayNameChanged(input.existing, input.registration.displayName),
  );
}

function profileWriteRequested(input: {
  existing: EventRegistration | null;
  registration: RegisterForEventInput;
}): boolean {
  const answers = normalizedAnswers(input.registration.answers);
  if (!input.existing) {
    // A late RSVP may create the required empty event-scoped profile shell, but
    // it must not smuggle a display name or matching answers into a frozen
    // participant snapshot.
    return (
      Object.keys(answers).length > 0 ||
      Boolean(input.registration.displayName?.trim())
    );
  }
  return (
    !sameAnswers(input.existing.participantProfile.answers, answers) ||
    displayNameChanged(input.existing, input.registration.displayName)
  );
}

function validWindow(window: EventRegistrationWindow): {
  profileEditDeadlineMs: number;
  registrationCutoffMs: number;
} {
  const profileEditDeadlineMs = Date.parse(window.profileEditDeadlineAt);
  const registrationCutoffMs = Date.parse(window.registrationCutoffAt);
  if (
    !Number.isFinite(profileEditDeadlineMs) ||
    !Number.isFinite(registrationCutoffMs) ||
    profileEditDeadlineMs > registrationCutoffMs
  ) {
    throw new EventRegistrationWindowError(
      "EVENT_REGISTRATION_WINDOW_INVALID",
      "The event registration window is invalid and registration writes are unavailable.",
    );
  }
  return { profileEditDeadlineMs, registrationCutoffMs };
}

export function createDeadlineGatedEventRegistrationService(input: {
  baseService: EventRegistrationService;
  canonicalService?: EventRegistrationService | null;
  projectionProvider?: Pick<EventRegistrationProvider, "saveRegistration"> | null;
  windowProvider: EventRegistrationWindowProvider;
}): EventRegistrationService {
  async function project(registration: EventRegistration | null) {
    if (!registration || !input.projectionProvider) return;
    try {
      await input.projectionProvider.saveRegistration(registration);
    } catch {
      // Canonical state and its outbox commit together. A legacy read-model
      // projection failure must not roll back or disguise the accepted write.
    }
  }

  return {
    async cancel(registration) {
      if (!input.canonicalService) {
        return input.baseService.cancel(registration);
      }
      const enrollment = await input.windowProvider.getEnrollment(
        registration.eventId,
      );
      if (enrollment.state === "legacy_unenrolled") {
        return input.baseService.cancel(registration);
      }
      if (enrollment.state === "enrolled_misconfigured") {
        throw new EventRegistrationWindowError(
          "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
          "The enrolled event registration window is not configured; registration writes are unavailable.",
        );
      }
      const value = await input.canonicalService.cancel(registration);
      await project(value);
      return value;
    },
    async get(registration) {
      if (!input.canonicalService) return input.baseService.get(registration);
      const enrollment = await input.windowProvider.getEnrollment(
        registration.eventId,
      );
      return enrollment.state === "enrolled"
        ? input.canonicalService.get(registration)
        : input.baseService.get(registration);
    },
    async list(registration) {
      if (!input.canonicalService) return input.baseService.list(registration);
      const enrollment = await input.windowProvider.getEnrollment(
        registration.eventId,
      );
      return enrollment.state === "enrolled"
        ? input.canonicalService.list(registration)
        : input.baseService.list(registration);
    },
    async register(registration) {
      const [enrollment, existing] = await Promise.all([
        input.windowProvider.getEnrollment(registration.eventId),
        input.canonicalService
          ? Promise.resolve(null)
          : input.baseService.get(registration),
      ]);
      if (enrollment.state === "legacy_unenrolled") {
        return input.baseService.register(registration);
      }
      if (enrollment.state === "enrolled_misconfigured") {
        throw new EventRegistrationWindowError(
          "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
          "The enrolled event registration window is not configured; registration writes are unavailable.",
        );
      }
      if (input.canonicalService) {
        const value = await input.canonicalService.register(registration);
        await project(value);
        return value;
      }
      const { window } = enrollment;
      if (window.eventId !== registration.eventId) {
        throw new EventRegistrationWindowError(
          "EVENT_REGISTRATION_CONFIGURATION_REQUIRED",
          "The enrolled event registration window does not match this event; registration writes are unavailable.",
        );
      }

      const currentMs = Date.parse(enrollment.statementTimestamp);
      const { profileEditDeadlineMs, registrationCutoffMs } =
        validWindow(window);
      if (!Number.isFinite(currentMs)) {
        throw new EventRegistrationWindowError(
          "EVENT_REGISTRATION_WINDOW_INVALID",
          "The registration clock is invalid and registration writes are unavailable.",
        );
      }

      if (isIdempotentActiveRegistration({ existing, registration })) {
        return existing;
      }

      if (
        currentMs >= profileEditDeadlineMs &&
        profileWriteRequested({ existing, registration })
      ) {
        throw new EventRegistrationWindowError(
          "EVENT_REGISTRATION_PROFILE_EDIT_DEADLINE_PASSED",
          "The event profile editing deadline has passed; matching-profile answers can no longer be changed.",
        );
      }

      if (currentMs >= registrationCutoffMs) {
        throw new EventRegistrationWindowError(
          "EVENT_REGISTRATION_CUTOFF_PASSED",
          "The event registration cutoff has passed; new registrations and reactivations are closed.",
        );
      }

      return input.baseService.register(registration);
    },
  };
}
