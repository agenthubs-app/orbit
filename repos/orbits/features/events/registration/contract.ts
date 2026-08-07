export const EVENT_REGISTRATION_QUESTION_INTENTS = [
  "positioning",
  "target_attendees",
  "value_offered",
  "desired_outcome",
  "follow_up_preference",
] as const;

export type EventRegistrationQuestionIntent =
  (typeof EVENT_REGISTRATION_QUESTION_INTENTS)[number];

// 画像字段。前五个来自最初的固定问卷;后三个为参会者匹配补充的维度
// (行业、社交能量/风格、经验亮点)。normalizeAnswers 以此为白名单,
// 新增字段自动纳入存储,老记录缺字段不受影响(answers 是 Partial)。
export const EVENT_PARTICIPANT_PROFILE_FIELDS = [
  "positioning",
  "industry",
  "targetAttendees",
  "valueOffered",
  "desiredOutcome",
  "energyStyle",
  "experienceHighlight",
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
  options: readonly string[];
  participantProfileField: EventParticipantProfileField;
  prompt: string;
  required: true;
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
      | "orbit-agent-model-failed"
      | "orbit-agent-model-customized";
    model: string | null;
    provider: string | null;
  };
  questions: readonly EventRegistrationQuestion[];
}

export interface EventParticipantProfile {
  answers: EventParticipantProfileAnswers;
  createdAt: string;
  displayName?: string;
  eventId: string;
  id: string;
  /** Verified immutable AI question/answer snapshots scoped to this event. */
  interviewResponses?: readonly import("./interview-response-contract").EventProfileResponseSnapshot[];
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
  displayName?: string | null;
  eventId: string;
  /** Server-verified immutable question/answer snapshots. Never accept these directly from an untrusted client. */
  interviewResponses?: import("./interview-response-contract").EventProfileResponseSnapshot[] | null;
  userId: string;
}

export interface CancelEventRegistrationInput {
  eventId: string;
  userId: string;
}
