import { createHash } from "node:crypto";

import {
  EventExperienceError,
  EVENT_EXPERIENCE_QUESTION_MAPPING,
  EVENT_EXPERIENCE_QUESTION_TRACKS,
  EVENT_EXPERIENCE_TEMPLATE_IDS,
  type EventExperienceConfiguration,
  type EventExperienceQuestion,
  type EventExperienceQuestionSetInput,
  type EventExperienceQuestionTrack,
} from "./contract";

const sensitiveText =
  /\b(password|passcode|credit card|bank account|social security|passport|身份证|银行卡|密码|护照)\b/i;
const unsafeMarkup = /[<>]|javascript\s*:|\bon[a-z]+\s*=/i;

function text(
  value: unknown,
  field: string,
  maximum: number,
  options: { allowEmpty?: boolean } = {},
): string {
  if (typeof value !== "string") {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      `${field} must be text.`,
    );
  }
  const normalized = value.normalize("NFC").trim();
  if ((!options.allowEmpty && !normalized) || normalized.length > maximum) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      `${field} is outside its allowed length.`,
    );
  }
  if (/https?:\/\//i.test(normalized) || sensitiveText.test(normalized)) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      `${field} contains a disallowed value.`,
    );
  }
  return normalized;
}

function coverAssetId(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  throw new EventExperienceError(
    "EVENT_EXPERIENCE_INVALID",
    "coverAssetId is not organizer-configurable until a trusted asset registry exists.",
  );
}

function introduction(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "introduction must be text.",
    );
  }
  const normalized = value.normalize("NFC").trim();
  if (!normalized) return null;
  if (
    normalized.length > 1000 ||
    unsafeMarkup.test(normalized) ||
    /https?:\/\//i.test(normalized) ||
    sensitiveText.test(normalized)
  ) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "introduction must be plain text without scripts, URLs, or sensitive data.",
    );
  }
  return normalized;
}

function accentColor(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value.trim())) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "accentColor must be a #RRGGBB color.",
    );
  }
  return value.trim().toUpperCase();
}

function question(value: EventExperienceQuestion): EventExperienceQuestion {
  if (!value || typeof value !== "object") {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "Each experience question must be an object.",
    );
  }
  const intent = value.intent;
  if (
    typeof intent !== "string" ||
    !(intent in EVENT_EXPERIENCE_QUESTION_MAPPING)
  ) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "Question intent is not supported.",
    );
  }
  const mappedField =
    EVENT_EXPERIENCE_QUESTION_MAPPING[
      intent as keyof typeof EVENT_EXPERIENCE_QUESTION_MAPPING
    ];
  if (
    value.id !== intent ||
    value.participantProfileField !== mappedField
  ) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "Question id, intent, and profile field must use the fixed mapping.",
    );
  }
  const prompt = text(value.prompt, "question.prompt", 240);
  if (!Array.isArray(value.options) || value.options.length < 2 || value.options.length > 5) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "Each question needs between two and five options.",
    );
  }
  const options = value.options.map((option, index) =>
    text(option, `question.options[${index}]`, 80),
  );
  if (new Set(options).size !== options.length) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "Question options must be unique.",
    );
  }
  return {
    id: intent as EventExperienceQuestion["id"],
    intent: intent as EventExperienceQuestion["intent"],
    options,
    participantProfileField: mappedField,
    prompt,
    required: value.required === true,
  };
}

export function normalizeQuestionSet(
  input: EventExperienceQuestionSetInput,
): EventExperienceQuestionSetInput {
  if (!input || !EVENT_EXPERIENCE_QUESTION_TRACKS.includes(input.track)) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "Question track is invalid.",
    );
  }
  if (!Array.isArray(input.questions)) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "Question set must contain an array.",
    );
  }
  if (input.questions.length > 4) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "V2 supports at most four optional questions.",
    );
  }
  const questions = input.questions.map(question);
  if (new Set(questions.map((item) => item.intent)).size !== questions.length) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "A question intent may only appear once.",
    );
  }
  if (input.track === "v1") {
    const expected = ["target_attendees", "value_offered"];
    if (
      questions.length !== expected.length ||
      questions.some(
        (item, index) => item.intent !== expected[index] || !item.required,
      )
    ) {
      throw new EventExperienceError(
        "EVENT_EXPERIENCE_INVALID",
        "V1 must keep the two required target/value questions.",
      );
    }
  } else if (questions.some((item) => item.required)) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "V2 questions are optional and cannot be required.",
    );
  }
  return { questions, track: input.track };
}

export function normalizeExperienceConfiguration(
  input: EventExperienceConfiguration,
): EventExperienceConfiguration {
  if (
    !input ||
    typeof input !== "object" ||
    !EVENT_EXPERIENCE_TEMPLATE_IDS.includes(input.templateId)
  ) {
    throw new EventExperienceError(
      "EVENT_EXPERIENCE_INVALID",
      "Only the default event experience template is supported.",
    );
  }
  return {
    accentColor: accentColor(input.accentColor),
    coverAssetId: coverAssetId(input.coverAssetId),
    introduction: introduction(input.introduction),
    questionSet: normalizeQuestionSet(input.questionSet),
    templateId: input.templateId,
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]),
  );
}

function hashStableValue(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

/**
 * Hash only the immutable matching input. Display-only fields (introduction,
 * accent, and the nullable cover compatibility slot) are deliberately outside
 * this identity so they can be edited after the profile-edit deadline without
 * changing matching semantics.
 */
export function questionSetHash(
  questionSet: EventExperienceQuestionSetInput,
): string {
  return hashStableValue(questionSet);
}

export function configurationHash(
  configuration: EventExperienceConfiguration,
): string {
  return hashStableValue(configuration);
}

export function publishedQuestionSetFromVersion(input: {
  configuration: EventExperienceConfiguration;
  hash: string;
  version: number;
}): {
  hash: string;
  questions: readonly EventExperienceQuestion[];
  questionSetVersion: number;
  track: EventExperienceQuestionTrack;
} {
  return {
    // An experience version also contains mutable display fields. Registration
    // metadata must identify only the immutable question set so changing an
    // introduction or accent color cannot make historical answers appear to
    // belong to a different set of questions.
    hash: questionSetHash(input.configuration.questionSet),
    questions: input.configuration.questionSet.questions,
    questionSetVersion: input.version,
    track: input.configuration.questionSet.track,
  };
}
