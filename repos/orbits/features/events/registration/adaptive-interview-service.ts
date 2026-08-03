// 报名画像的自适应问答:每一题由模型根据「活动语境 + 此前全部回答」生成,
// 而不是固定问题列表;答完后再由模型生成面向本次活动的个人画像。
//
// 与 question-generator 同一套纪律:模型只负责措辞与追问方向(understanding
// in model),字段枚举、题数上限、敏感词、长度全部在代码里校验(deterministic
// validation in code)。模型不可用或输出不合规时显式失败，由客户端保留
// 已完成回答并重试；禁止用确定性内容冒充 AI 结果。
import {
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
} from "../../orbit-ai/gemini-provider";
import type { EventRecord } from "../event-crud-and-import/contract";
import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileField,
} from "./contract";

export type AdaptiveInterviewModelRunner = typeof runOrbitAgentModelText;

// 一次已完成的问答轮。prompt 一并保留,让模型看到"当时问的是什么"。
export interface AdaptiveInterviewTurn {
  answer: string;
  field: EventParticipantProfileField;
  prompt: string;
}

export interface AdaptiveGenerationProvenance {
  fallbackReason: string | null;
  generationMethod: "orbit-agent-model-adaptive" | "deterministic-fallback";
  model: string | null;
  provider: string | null;
}

export interface AdaptiveNextQuestion {
  /** 承接上一答的一句话;第一题或回退时为空串。 */
  acknowledgment: string;
  field: EventParticipantProfileField;
  options: readonly string[];
  prompt: string;
  provenance: AdaptiveGenerationProvenance;
}

export interface AdaptiveInterviewStep {
  done: boolean;
  question: AdaptiveNextQuestion | null;
}

export interface EventPersona {
  /** 社交能量/风格,一句话(用于匹配相容的交流方式)。 */
  energyStyle: string;
  /** 行业标签 1-3 个(用于参会者行业匹配)。 */
  industryTags: readonly string[];
  offering: string;
  openers: readonly string[];
  provenance: AdaptiveGenerationProvenance;
  seeking: string;
  tagline: string;
  tags: readonly string[];
}

export const ADAPTIVE_INTERVIEW_MAX_TURNS = 8;

export class AdaptiveInterviewGenerationError extends Error {
  constructor(
    readonly code: "MODEL_REQUEST_FAILED" | "MODEL_SCHEMA_INVALID",
    message: string,
    readonly provider: string | null,
  ) {
    super(message);
    this.name = "AdaptiveInterviewGenerationError";
  }
}

// transcript 完全来自客户端,按白名单校验:字段必须在枚举内、字符串截断、
// 轮数封顶,不合规的轮直接丢弃。供 interview/persona 两个 route 共用。
export function readInterviewTranscript(
  value: unknown,
): readonly AdaptiveInterviewTurn[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isRecord)
    .map((turn) => ({
      answer:
        typeof turn.answer === "string" ? turn.answer.trim().slice(0, 1000) : "",
      field:
        typeof turn.field === "string"
          ? (turn.field as EventParticipantProfileField)
          : null,
      prompt:
        typeof turn.prompt === "string" ? turn.prompt.trim().slice(0, 240) : "",
    }))
    .filter(
      (turn): turn is AdaptiveInterviewTurn =>
        turn.field !== null &&
        EVENT_PARTICIPANT_PROFILE_FIELDS.includes(turn.field) &&
        turn.answer.length > 0,
    )
    .slice(0, ADAPTIVE_INTERVIEW_MAX_TURNS);
}

const sensitivePattern =
  /\b(password|passcode|credit card|bank account|social security|passport|身份证|银行卡|密码|护照)\b/i;

interface AdaptiveInterviewInput {
  event: EventRecord;
  language?: "en" | "zh";
  modelConfig?: GeminiOrbitAgentProviderConfig;
  modelRunner?: AdaptiveInterviewModelRunner;
  transcript: readonly AdaptiveInterviewTurn[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

  return match?.[1]?.trim() ?? trimmed;
}

function remainingFieldsFor(
  transcript: readonly AdaptiveInterviewTurn[],
): readonly EventParticipantProfileField[] {
  const answered = new Set(transcript.map((turn) => turn.field));

  return EVENT_PARTICIPANT_PROFILE_FIELDS.filter(
    (field) => !answered.has(field),
  );
}

function readModelQuestion(
  text: string,
  remainingFields: readonly EventParticipantProfileField[],
): Omit<AdaptiveNextQuestion, "provenance"> | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const field =
    typeof parsed.field === "string"
      ? (parsed.field as EventParticipantProfileField)
      : null;
  const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
  const acknowledgment =
    typeof parsed.acknowledgment === "string"
      ? parsed.acknowledgment.trim()
      : "";
  const options = Array.isArray(parsed.options)
    ? parsed.options
        .filter((option): option is string => typeof option === "string")
        .map((option) => option.trim())
        .filter(Boolean)
    : [];

  if (
    !field ||
    !remainingFields.includes(field) ||
    prompt.length < 8 ||
    prompt.length > 240 ||
    sensitivePattern.test(prompt) ||
    acknowledgment.length > 120 ||
    sensitivePattern.test(acknowledgment) ||
    options.length < 2 ||
    options.length > 4 ||
    options.some(
      (option) => option.length > 60 || sensitivePattern.test(option),
    )
  ) {
    return null;
  }

  return { acknowledgment, field, options, prompt };
}

/**
 * 生成下一题。transcript 为空时返回第一题;所有字段已覆盖或轮数达到上限时
 * 返回 done。第一题也走模型(带活动语境),失败回退到确定性题库。
 */
export async function nextAdaptiveInterviewQuestion(
  input: AdaptiveInterviewInput,
): Promise<AdaptiveInterviewStep> {
  const language = input.language === "en" ? "en" : "zh";
  const transcript = input.transcript.slice(0, ADAPTIVE_INTERVIEW_MAX_TURNS);
  const remainingFields = remainingFieldsFor(transcript);

  if (
    remainingFields.length === 0 ||
    transcript.length >= ADAPTIVE_INTERVIEW_MAX_TURNS
  ) {
    return { done: true, question: null };
  }

  const modelRunner = input.modelRunner ?? runOrbitAgentModelText;
  const modelResult = await modelRunner({
    config: input.modelConfig,
    systemInstruction: [
      "You conduct a short adaptive interview that builds an attendee's persona for one specific event.",
      "Generate exactly ONE next question. Return strict JSON only: {\"acknowledgment\", \"field\", \"prompt\", \"options\"}.",
      `Write everything in ${language === "zh" ? "Chinese" : "English"}.`,
      "acknowledgment: one short sentence that reacts to the person's LATEST answer (empty string if there is no previous answer). Never repeat the answer verbatim; show you understood it.",
      "field: pick the most valuable unanswered field from remainingFields, informed by what the person just said. The persona feeds attendee matching, so cover diverse dimensions: positioning, industry, who to meet, value offered, desired outcome, social energy style, experience highlight, follow-up preference.",
      "prompt: the next question. Make it follow naturally from the latest answer — reference what they said. Keep it under 90 characters if possible.",
      "options: 2 to 4 short answer chips tailored to THIS person's situation (from their answers), not generic placeholders.",
      "Never ask for sensitive identity, credential, financial, or health data.",
    ].join("\n"),
    userText: JSON.stringify({
      event: {
        description: input.event.description,
        relationshipContext: input.event.relationshipContext,
        title: input.event.title,
        venue: input.event.venue,
      },
      language,
      remainingFields,
      transcript,
    }),
  });

  if (modelResult.success !== true) {
    throw new AdaptiveInterviewGenerationError(
      "MODEL_REQUEST_FAILED",
      `The adaptive interview model request failed: ${modelResult.error.code}.`,
      modelResult.error.provider,
    );
  }

  const question = readModelQuestion(modelResult.text, remainingFields);

  if (!question) {
    throw new AdaptiveInterviewGenerationError(
      "MODEL_SCHEMA_INVALID",
      "The adaptive interview model returned an invalid question.",
      modelResult.provider,
    );
  }

  return {
    done: false,
    question: {
      ...question,
      provenance: {
        fallbackReason: null,
        generationMethod: "orbit-agent-model-adaptive",
        model: modelResult.model,
        provider: modelResult.provider,
      },
    },
  };
}

function readModelPersona(text: string): Omit<EventPersona, "provenance"> | null {
  let parsed: unknown;

  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const tagline =
    typeof parsed.tagline === "string" ? parsed.tagline.trim() : "";
  const seeking =
    typeof parsed.seeking === "string" ? parsed.seeking.trim() : "";
  const offering =
    typeof parsed.offering === "string" ? parsed.offering.trim() : "";
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const industryTags = Array.isArray(parsed.industryTags)
    ? parsed.industryTags
        .filter((tag): tag is string => typeof tag === "string")
        .map((tag) => tag.trim())
        .filter(Boolean)
    : [];
  const energyStyle =
    typeof parsed.energyStyle === "string" ? parsed.energyStyle.trim() : "";
  const openers = Array.isArray(parsed.openers)
    ? parsed.openers
        .filter((opener): opener is string => typeof opener === "string")
        .map((opener) => opener.trim())
        .filter(Boolean)
    : [];
  const texts = [
    tagline,
    seeking,
    offering,
    energyStyle,
    ...tags,
    ...industryTags,
    ...openers,
  ];

  if (
    tagline.length < 4 ||
    tagline.length > 60 ||
    seeking.length < 4 ||
    seeking.length > 140 ||
    offering.length < 4 ||
    offering.length > 140 ||
    tags.length < 3 ||
    tags.length > 5 ||
    tags.some((tag) => tag.length > 16) ||
    industryTags.length < 1 ||
    industryTags.length > 3 ||
    industryTags.some((tag) => tag.length > 16) ||
    energyStyle.length < 2 ||
    energyStyle.length > 60 ||
    openers.length < 2 ||
    openers.length > 3 ||
    openers.some((opener) => opener.length > 90) ||
    texts.some((value) => sensitivePattern.test(value))
  ) {
    return null;
  }

  return { energyStyle, industryTags, offering, openers, seeking, tagline, tags };
}

/**
 * 基于完整问答生成「面向本次活动」的个人画像。只允许使用 transcript 与
 * 活动信息里的事实；模型失败或不合规时显式失败，不发布替代画像。
 */
export async function generateEventPersona(
  input: AdaptiveInterviewInput,
): Promise<EventPersona> {
  const language = input.language === "en" ? "en" : "zh";
  const transcript = input.transcript.slice(0, ADAPTIVE_INTERVIEW_MAX_TURNS);
  const modelRunner = input.modelRunner ?? runOrbitAgentModelText;
  const modelResult = await modelRunner({
    config: input.modelConfig,
    systemInstruction: [
      "You write an event-facing attendee persona from an interview transcript. It powers attendee matching, so every dimension matters.",
      "Return strict JSON only: {\"tagline\", \"tags\", \"industryTags\", \"energyStyle\", \"seeking\", \"offering\", \"openers\"}.",
      `Write everything in ${language === "zh" ? "Chinese" : "English"}.`,
      "tagline: one line (<=60 chars) positioning this person for THIS event.",
      "tags: 3-5 short labels (<=16 chars each) covering their strongest matching signals.",
      "industryTags: 1-3 industry labels (<=16 chars each).",
      "energyStyle: one short phrase (<=60 chars) describing how they engage socially (e.g. opens conversations, deep 1:1s, listens first).",
      "seeking: one sentence — who they want to meet at this event and why (<=140 chars).",
      "offering: one sentence — what they can offer people they meet (<=140 chars).",
      "openers: 2-3 conversation openers others could use with this person (<=90 chars each).",
      "Ground every statement ONLY in the transcript and event context. Do not invent facts.",
    ].join("\n"),
    userText: JSON.stringify({
      event: {
        description: input.event.description,
        relationshipContext: input.event.relationshipContext,
        title: input.event.title,
        venue: input.event.venue,
      },
      language,
      transcript,
    }),
  });

  if (modelResult.success !== true) {
    throw new AdaptiveInterviewGenerationError(
      "MODEL_REQUEST_FAILED",
      `The event persona model request failed: ${modelResult.error.code}.`,
      modelResult.error.provider,
    );
  }

  const persona = readModelPersona(modelResult.text);

  if (!persona) {
    throw new AdaptiveInterviewGenerationError(
      "MODEL_SCHEMA_INVALID",
      "The event persona model returned an invalid result.",
      modelResult.provider,
    );
  }

  return {
    ...persona,
    provenance: {
      fallbackReason: null,
      generationMethod: "orbit-agent-model-adaptive",
      model: modelResult.model,
      provider: modelResult.provider,
    },
  };
}
