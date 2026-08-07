import {
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
} from "../../orbit-ai/gemini-provider";
import type { EventRecord } from "../event-crud-and-import/contract";
import {
  EVENT_REGISTRATION_QUESTION_INTENTS,
  type EventParticipantProfileField,
  type EventRegistrationQuestion,
  type EventRegistrationQuestionIntent,
  type EventRegistrationQuestionSet,
} from "./contract";

export type EventRegistrationModelRunner = typeof runOrbitAgentModelText;

export interface CandidateQuestion {
  id: EventRegistrationQuestionIntent;
  intent: EventRegistrationQuestionIntent;
  options: readonly string[];
  participantProfileField: EventParticipantProfileField;
  prompt: string;
}

const fieldForIntent = {
  desired_outcome: "desiredOutcome",
  follow_up_preference: "followUpPreference",
  positioning: "positioning",
  target_attendees: "targetAttendees",
  value_offered: "valueOffered",
} as const satisfies Record<
  EventRegistrationQuestionIntent,
  EventParticipantProfileField
>;

const sensitivePromptPattern =
  /\b(password|passcode|credit card|bank account|social security|passport|身份证|银行卡|密码|护照)\b/i;

export function candidatesFor(
  event: EventRecord,
  language: "en" | "zh",
): readonly CandidateQuestion[] {
  const title = event.title;

  if (language === "en") {
    return [
      {
        id: "target_attendees",
        intent: "target_attendees",
        options: ["Founders", "Operators", "Investors or partners"],
        participantProfileField: "targetAttendees",
        prompt: `Who would make ${title} especially useful for you to attend?`,
      },
      {
        id: "value_offered",
        intent: "value_offered",
        options: ["Relevant introductions", "Operating experience", "Feedback or expertise"],
        participantProfileField: "valueOffered",
        prompt: `What could you most usefully offer people you meet at ${title}?`,
      },
    ];
  }

  return [
    {
      id: "target_attendees",
      intent: "target_attendees",
      options: ["创业者", "业务运营者", "投资人或合作伙伴"],
      participantProfileField: "targetAttendees",
      prompt: `在「${title}」中遇见哪类人，会让这次参加对你最有价值？`,
    },
    {
      id: "value_offered",
      intent: "value_offered",
      options: ["相关引荐", "实操经验", "反馈或专业能力"],
      participantProfileField: "valueOffered",
      prompt: `在「${title}」认识新朋友时，你最适合为对方提供什么？`,
    },
  ];
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return match?.[1]?.trim() ?? trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readQuestion(
  value: unknown,
  candidates: ReadonlyMap<EventRegistrationQuestionIntent, CandidateQuestion>,
  eventTitle: string,
): EventRegistrationQuestion | null {
  if (!isRecord(value)) {
    return null;
  }

  const id =
    typeof value.id === "string"
      ? (value.id as EventRegistrationQuestionIntent)
      : null;
  const intent =
    typeof value.intent === "string"
      ? (value.intent as EventRegistrationQuestionIntent)
      : null;
  const participantProfileField =
    typeof value.participantProfileField === "string"
      ? value.participantProfileField
      : null;
  const prompt = typeof value.prompt === "string" ? value.prompt.trim() : "";
  const options = Array.isArray(value.options)
    ? value.options
        .filter((option): option is string => typeof option === "string")
        .map((option) => option.trim())
        .filter(Boolean)
    : [];
  const candidate = id ? candidates.get(id) : null;

  if (
    !id ||
    !intent ||
    !EVENT_REGISTRATION_QUESTION_INTENTS.includes(id) ||
    intent !== id ||
    !candidate ||
    participantProfileField !== candidate.participantProfileField ||
    prompt.length < 12 ||
    prompt.length > 240 ||
    !prompt.includes(eventTitle) ||
    sensitivePromptPattern.test(prompt) ||
    options.length < 2 ||
    options.length > 5 ||
    options.some((option) => option.length > 80 || sensitivePromptPattern.test(option))
  ) {
    return null;
  }

  return {
    id,
    intent,
    options,
    participantProfileField: candidate.participantProfileField,
    prompt,
    required: true,
  };
}

function parseModelQuestions(
  text: string,
  candidates: readonly CandidateQuestion[],
  eventTitle: string,
): readonly EventRegistrationQuestion[] | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return null;
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.questions)) {
    return null;
  }

  const candidateMap = new Map(candidates.map((question) => [question.id, question]));
  const questions = parsed.questions
    .slice(0, 2)
    .map((question) => readQuestion(question, candidateMap, eventTitle));

  if (
    questions.length !== candidates.length ||
    questions.some((question) => question === null) ||
    new Set(questions.map((question) => question?.id)).size !== questions.length
  ) {
    return null;
  }

  return questions as readonly EventRegistrationQuestion[];
}

export async function generateEventRegistrationQuestions(input: {
  event: EventRecord;
  language?: "en" | "zh";
  modelConfig?: GeminiOrbitAgentProviderConfig;
  modelRunner?: EventRegistrationModelRunner;
}): Promise<EventRegistrationQuestionSet> {
  if (!["confirmed", "imported"].includes(input.event.status)) {
    return {
      provenance: {
        aiProviderRequested: false,
        externalNetworkRequested: false,
        fallbackReason: "EVENT_NOT_REGISTERABLE",
        generationMethod: "deterministic-not-registerable",
        model: null,
        provider: null,
      },
      questions: [],
    };
  }

  const language = input.language === "en" ? "en" : "zh";
  const candidates = candidatesFor(input.event, language);
  const modelRunner = input.modelRunner ?? runOrbitAgentModelText;
  const modelResult = await modelRunner({
    config: input.modelConfig,
    systemInstruction:
      "You customize Orbit's two required event-registration questions. Use the exact Orbit AI provider and model supplied by the shared model boundary. Return strict JSON only. Preserve every id, intent, and participantProfileField. Never ask for sensitive identity, credential, financial, or health data.",
    userText: JSON.stringify({
      event: {
        description: input.event.description,
        relationshipContext: input.event.relationshipContext,
        title: input.event.title,
        venue: input.event.venue,
      },
      instructions: {
        language,
        maxQuestions: 2,
        outputShape: {
          questions: [
            {
              id: "candidate id",
              intent: "candidate intent",
              options: ["2 to 5 concise options"],
              participantProfileField: "candidate participantProfileField",
              prompt: `must include the exact event title: ${input.event.title}`,
            },
          ],
        },
      },
      candidates,
    }),
  });

  if (modelResult.success === true) {
    const questions = parseModelQuestions(
      modelResult.text,
      candidates,
      input.event.title,
    );

    if (questions) {
      return {
        provenance: {
          aiProviderRequested: true,
          externalNetworkRequested: true,
          fallbackReason: null,
          generationMethod: "orbit-agent-model-customized",
          model: modelResult.model,
          provider: modelResult.provider,
        },
        questions,
      };
    }

    return {
      provenance: {
        aiProviderRequested: true,
        externalNetworkRequested: true,
        fallbackReason: "MODEL_SCHEMA_INVALID",
        generationMethod: "orbit-agent-model-failed",
        model: modelResult.model,
        provider: modelResult.provider,
      },
      questions: [],
    };
  }

  return {
    provenance: {
      aiProviderRequested: true,
      externalNetworkRequested: true,
      fallbackReason: modelResult.error.code,
      generationMethod: "orbit-agent-model-failed",
      model: null,
      provider: modelResult.error.provider,
    },
    questions: [],
  };
}
