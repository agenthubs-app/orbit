export const EVENT_REGISTRATION_QUESTION_INTENTS = [
  "positioning",
  "target_attendees",
  "value_offered",
  "desired_outcome",
  "follow_up_preference",
] as const;

export type EventRegistrationQuestionIntent =
  (typeof EVENT_REGISTRATION_QUESTION_INTENTS)[number];

export const EVENT_PARTICIPANT_PROFILE_FIELDS = [
  "positioning",
  "targetAttendees",
  "valueOffered",
  "desiredOutcome",
  "followUpPreference",
] as const;

export type EventParticipantProfileField =
  (typeof EVENT_PARTICIPANT_PROFILE_FIELDS)[number];

export type EventParticipantProfileAnswers = Partial<
  Record<EventParticipantProfileField, string>
>;

export interface EventRegistrationQuestion {
  id: EventRegistrationQuestionIntent;
  intent: EventRegistrationQuestionIntent;
  optional: true;
  options: readonly string[];
  participantProfileField: EventParticipantProfileField;
  prompt: string;
}

export interface EventRegistrationQuestionSet {
  provenance: {
    aiProviderRequested: boolean;
    externalNetworkRequested: boolean;
    fallbackReason: string | null;
    generationMethod:
      | "deterministic-fallback"
      | "deterministic-not-registerable"
      | "deterministic-not-requested"
      | "orbit-agent-model-customized";
    model: string | null;
    provider: string | null;
  };
  questions: readonly EventRegistrationQuestion[];
}

export interface EventParticipantProfile {
  answers: EventParticipantProfileAnswers;
  createdAt: string;
  eventId: string;
  id: string;
  updatedAt: string;
  userId: string;
}

export interface EventRegistration {
  cancelledAt: string | null;
  eventId: string;
  id: string;
  participantProfile: EventParticipantProfile;
  participantProfileId: string;
  reactivatedAt: string | null;
  registeredAt: string;
  sideEffects: {
    calendarUpdateExecuted: false;
    emailSent: false;
    globalProfileWriteExecuted: false;
    notificationDelivered: false;
    organizerMessageSent: false;
    refundRequested: false;
  };
  status: "cancelled" | "rsvped";
  updatedAt: string;
  userId: string;
}

export interface RegisterForEventInput {
  answers?: EventParticipantProfileAnswers | null;
  eventId: string;
  userId: string;
}

export interface CancelEventRegistrationInput {
  eventId: string;
  userId: string;
}
