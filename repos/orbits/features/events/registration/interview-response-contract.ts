import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileAnswers,
  type EventParticipantProfileField,
} from "./contract";
import type { AdaptiveNextQuestion } from "./adaptive-interview-service";

export const EVENT_PROFILE_CORE_FIELDS = [
  "targetAttendees",
  "valueOffered",
] as const satisfies readonly EventParticipantProfileField[];

export type EventProfileResponseVisibility =
  | "event_attendees"
  | "matching_only"
  | "private";

export interface EventInterviewResponseSubmission {
  answer: string;
  questionToken: string;
}

export interface SignedAdaptiveInterviewQuestion {
  question: AdaptiveNextQuestion;
  questionToken: string;
}

export interface SignedAdaptiveInterviewStep {
  done: boolean;
  signedQuestion: SignedAdaptiveInterviewQuestion | null;
}

export interface EventProfileQuestionSnapshot {
  fieldLabel: { en: string; zh: string };
  inputKind: "single_choice_with_custom";
  language: "en" | "zh";
  options: readonly { id: string; label: string }[];
  prompt: string;
}

export interface EventProfileAnswerSnapshot {
  customText: string | null;
  displayText: string;
  selectedOptionIds: readonly string[];
}

export interface EventProfileResponseSnapshot {
  answer: EventProfileAnswerSnapshot;
  answerSource: "participant";
  answeredAt: string;
  field: EventParticipantProfileField;
  generation: {
    method: "orbit-agent-model-adaptive";
    model: string;
    promptVersion: number;
    provider: string;
  } | null;
  question: EventProfileQuestionSnapshot | null;
  questionId: string | null;
  questionSource: "ai_adaptive" | "legacy_unknown";
  responseId: string;
  visibility: EventProfileResponseVisibility;
}

export const EVENT_PROFILE_FIELD_LABELS: Readonly<
  Record<EventParticipantProfileField, { en: string; zh: string }>
> = {
  desiredOutcome: { en: "Desired outcome", zh: "期待结果" },
  energyStyle: { en: "Conversation style", zh: "交流风格" },
  experienceHighlight: { en: "Experience highlight", zh: "经历亮点" },
  followUpPreference: { en: "Follow-up preference", zh: "后续沟通偏好" },
  industry: { en: "Industry", zh: "行业" },
  positioning: { en: "Positioning", zh: "个人定位" },
  targetAttendees: { en: "Who to meet", zh: "希望认识的人" },
  valueOffered: { en: "Value offered", zh: "能够提供的价值" },
};

export function answersFromProfileResponses(
  responses: readonly EventProfileResponseSnapshot[],
): EventParticipantProfileAnswers {
  const answers: EventParticipantProfileAnswers = {};
  for (const response of responses) {
    if (
      EVENT_PARTICIPANT_PROFILE_FIELDS.includes(response.field) &&
      response.answer.displayText.trim()
    ) {
      answers[response.field] = response.answer.displayText.trim().slice(0, 1_000);
    }
  }
  return answers;
}

export function missingCoreProfileFields(
  responses: readonly Pick<EventProfileResponseSnapshot, "field">[],
): readonly EventParticipantProfileField[] {
  const answered = new Set(responses.map((response) => response.field));
  return EVENT_PROFILE_CORE_FIELDS.filter((field) => !answered.has(field));
}

export function legacyResponsesFromAnswers(
  answers: EventParticipantProfileAnswers,
  answeredAt: string,
): readonly EventProfileResponseSnapshot[] {
  return EVENT_PARTICIPANT_PROFILE_FIELDS.flatMap((field) => {
    // 与 answersFromProfileResponses 的持久化上限一致：快照文本也不超过
    // 1000 字符，避免"answers 已截断、审计快照未截断"的不一致。
    const value = answers[field]?.trim().slice(0, 1_000);
    if (!value) return [];
    return [
      {
        answer: {
          customText: value,
          displayText: value,
          selectedOptionIds: [],
        },
        answerSource: "participant" as const,
        answeredAt,
        field,
        generation: null,
        question: null,
        questionId: null,
        questionSource: "legacy_unknown" as const,
        responseId: `legacy:${field}`,
        visibility: "event_attendees" as const,
      },
    ];
  });
}
