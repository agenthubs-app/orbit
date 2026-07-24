import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type CancelEventRegistrationInput,
  type EventParticipantProfileAnswers,
  type EventRegistration,
  type RegisterForEventInput,
} from "./contract";

export interface EventRegistrationProvider {
  getRegistration: (
    eventId: string,
    userId: string,
  ) => Promise<EventRegistration | null>;
  saveRegistration: (
    registration: EventRegistration,
  ) => Promise<EventRegistration>;
}

export interface EventRegistrationService {
  cancel: (
    input: CancelEventRegistrationInput,
  ) => Promise<EventRegistration | null>;
  get: (
    input: CancelEventRegistrationInput,
  ) => Promise<EventRegistration | null>;
  register: (input: RegisterForEventInput) => Promise<EventRegistration>;
}

function clone<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

export function eventRegistrationId(eventId: string, userId: string): string {
  return `event-registration:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`;
}

function stableParticipantProfileId(eventId: string, userId: string): string {
  return `event-participant-profile:${encodeURIComponent(eventId)}:${encodeURIComponent(userId)}`;
}

function normalizeAnswers(
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
  return JSON.stringify(left) === JSON.stringify(right);
}

function noExternalSideEffects(): EventRegistration["sideEffects"] {
  return {
    calendarUpdateExecuted: false,
    emailSent: false,
    globalProfileWriteExecuted: false,
    notificationDelivered: false,
    organizerMessageSent: false,
    refundRequested: false,
  };
}

export function createMemoryEventRegistrationProvider(
  seed: readonly EventRegistration[] = [],
): EventRegistrationProvider {
  const registrations = new Map(
    seed.map((registration) => [
      eventRegistrationId(registration.eventId, registration.userId),
      clone(registration),
    ]),
  );

  return {
    async getRegistration(eventId, userId) {
      const registration = registrations.get(
        eventRegistrationId(eventId, userId),
      );

      return registration ? clone(registration) : null;
    },
    async saveRegistration(registration) {
      const next = clone(registration);

      registrations.set(
        eventRegistrationId(registration.eventId, registration.userId),
        next,
      );

      return clone(next);
    },
  };
}

export function createEventRegistrationService(input: {
  now?: () => string;
  provider: EventRegistrationProvider;
}): EventRegistrationService {
  const now = input.now ?? (() => new Date().toISOString());

  return {
    async cancel({ eventId, userId }) {
      const existing = await input.provider.getRegistration(eventId, userId);

      if (!existing || existing.status === "cancelled") {
        return existing;
      }

      const timestamp = now();

      return input.provider.saveRegistration({
        ...existing,
        cancelledAt: timestamp,
        sideEffects: noExternalSideEffects(),
        status: "cancelled",
        updatedAt: timestamp,
      });
    },
    get({ eventId, userId }) {
      return input.provider.getRegistration(eventId, userId);
    },
    async register({ answers, eventId, userId }) {
      const normalizedAnswers = normalizeAnswers(answers);
      const existing = await input.provider.getRegistration(eventId, userId);

      if (
        existing?.status === "rsvped" &&
        sameAnswers(existing.participantProfile.answers, normalizedAnswers)
      ) {
        return existing;
      }

      const timestamp = now();

      if (existing) {
        return input.provider.saveRegistration({
          ...existing,
          participantProfile: {
            ...existing.participantProfile,
            answers: normalizedAnswers,
            updatedAt: timestamp,
          },
          reactivatedAt:
            existing.status === "cancelled"
              ? timestamp
              : existing.reactivatedAt,
          sideEffects: noExternalSideEffects(),
          status: "rsvped",
          updatedAt: timestamp,
        });
      }

      const participantProfileId = stableParticipantProfileId(eventId, userId);

      return input.provider.saveRegistration({
        cancelledAt: null,
        eventId,
        id: eventRegistrationId(eventId, userId),
        participantProfile: {
          answers: normalizedAnswers,
          createdAt: timestamp,
          eventId,
          id: participantProfileId,
          updatedAt: timestamp,
          userId,
        },
        participantProfileId,
        reactivatedAt: null,
        registeredAt: timestamp,
        sideEffects: noExternalSideEffects(),
        status: "rsvped",
        updatedAt: timestamp,
        userId,
      });
    },
  };
}
