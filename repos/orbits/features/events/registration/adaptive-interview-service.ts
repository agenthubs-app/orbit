// 报名画像的自适应问答:每一题由模型根据「活动语境 + 此前全部回答」生成,
// 而不是固定问题列表;答完后再由模型生成面向本次活动的个人画像。
//
// 与 question-generator 同一套纪律:模型只负责措辞与追问方向(understanding
// in model),字段枚举、题数上限、敏感词、长度全部在代码里校验(deterministic
// validation in code);模型不可用或输出不合规时,回退到确定性题库/模板,
// 流程永不中断。provenance 如实标注是模型生成还是回退。
import {
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
} from "../../orbit-ai/gemini-provider";
import type { EventRecord } from "../event-crud-and-import/contract";
import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileField,
} from "./contract";
import { candidatesFor, type CandidateQuestion } from "./question-generator";

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
  offering: string;
  openers: readonly string[];
  provenance: AdaptiveGenerationProvenance;
  seeking: string;
  tagline: string;
  tags: readonly string[];
}

export const ADAPTIVE_INTERVIEW_MAX_TURNS = 5;

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

// followUpPreference 不在共享题库里(固定流程只出 4 题);自适应流程需要
// 完整五题的回退覆盖,在这里补上。
function followUpPreferenceCandidate(
  event: EventRecord,
  language: "en" | "zh",
): CandidateQuestion {
  return language === "en"
    ? {
        id: "follow_up_preference",
        intent: "follow_up_preference",
        options: ["Message first", "Coffee chat", "Straight to a working session"],
        participantProfileField: "followUpPreference",
        prompt: `After ${event.title}, how do you prefer promising conversations to continue?`,
      }
    : {
        id: "follow_up_preference",
        intent: "follow_up_preference",
        options: ["先线上聊聊", "约杯咖啡", "直接进入正题合作"],
        participantProfileField: "followUpPreference",
        prompt: `「${event.title}」结束后,你希望有价值的交流以什么方式继续?`,
      };
}

function fallbackQuestionFor(
  event: EventRecord,
  language: "en" | "zh",
  field: EventParticipantProfileField,
  fallbackReason: string,
): AdaptiveNextQuestion {
  const bank = [
    ...candidatesFor(event, language),
    followUpPreferenceCandidate(event, language),
  ];
  const candidate =
    bank.find((question) => question.participantProfileField === field) ??
    bank[0];

  return {
    acknowledgment: "",
    field: candidate.participantProfileField,
    options: candidate.options,
    prompt: candidate.prompt,
    provenance: {
      fallbackReason,
      generationMethod: "deterministic-fallback",
      model: null,
      provider: null,
    },
  };
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
      "field: pick the most valuable unanswered field from remainingFields, informed by what the person just said.",
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
    return {
      done: false,
      question: fallbackQuestionFor(
        input.event,
        language,
        remainingFields[0],
        modelResult.error.code,
      ),
    };
  }

  const question = readModelQuestion(modelResult.text, remainingFields);

  if (!question) {
    return {
      done: false,
      question: fallbackQuestionFor(
        input.event,
        language,
        remainingFields[0],
        "MODEL_SCHEMA_INVALID",
      ),
    };
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
  const openers = Array.isArray(parsed.openers)
    ? parsed.openers
        .filter((opener): opener is string => typeof opener === "string")
        .map((opener) => opener.trim())
        .filter(Boolean)
    : [];
  const texts = [tagline, seeking, offering, ...tags, ...openers];

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
    openers.length < 2 ||
    openers.length > 3 ||
    openers.some((opener) => opener.length > 90) ||
    texts.some((value) => sensitivePattern.test(value))
  ) {
    return null;
  }

  return { offering, openers, seeking, tagline, tags };
}

function fallbackPersona(
  event: EventRecord,
  language: "en" | "zh",
  transcript: readonly AdaptiveInterviewTurn[],
  fallbackReason: string,
): EventPersona {
  const answerFor = (field: EventParticipantProfileField) =>
    transcript.find((turn) => turn.field === field)?.answer.trim() ?? "";
  const positioning = answerFor("positioning");
  const target = answerFor("targetAttendees");
  const value = answerFor("valueOffered");
  const outcome = answerFor("desiredOutcome");
  const zh = language === "zh";

  const tags = [positioning, target, value]
    .filter(Boolean)
    .map((text) => (text.length > 16 ? `${text.slice(0, 15)}…` : text));

  while (tags.length < 3) {
    tags.push(zh ? "现场交流" : "Open to talk");
  }

  return {
    offering:
      value ||
      (zh ? "愿意分享自己的经验与资源。" : "Happy to share experience and resources."),
    openers: [
      zh
        ? `聊聊你为什么来「${event.title}」?`
        : `What brought you to ${event.title}?`,
      zh
        ? `最近在${positioning || "做的事"}上有什么进展?`
        : `How is ${positioning || "your current work"} going lately?`,
    ],
    provenance: {
      fallbackReason,
      generationMethod: "deterministic-fallback",
      model: null,
      provider: null,
    },
    seeking: target
      ? zh
        ? `想认识:${target}${outcome ? `,目标是${outcome}` : ""}`
        : `Wants to meet: ${target}${outcome ? `, aiming for ${outcome}` : ""}`
      : zh
        ? "希望认识与自己方向相关的参与者。"
        : "Hoping to meet aligned attendees.",
    tagline:
      positioning ||
      (zh ? `「${event.title}」参与者` : `${event.title} attendee`),
    tags: tags.slice(0, 5),
  };
}

/**
 * 基于完整问答生成「面向本次活动」的个人画像。只允许使用 transcript 与
 * 活动信息里的事实,模型不合规时回退为答案的确定性重组。
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
      "You write an event-facing attendee persona from an interview transcript.",
      "Return strict JSON only: {\"tagline\", \"tags\", \"seeking\", \"offering\", \"openers\"}.",
      `Write everything in ${language === "zh" ? "Chinese" : "English"}.`,
      "tagline: one line (<=60 chars) positioning this person for THIS event.",
      "tags: 3-5 short labels (<=16 chars each).",
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
    return fallbackPersona(
      input.event,
      language,
      transcript,
      modelResult.error.code,
    );
  }

  const persona = readModelPersona(modelResult.text);

  if (!persona) {
    return fallbackPersona(
      input.event,
      language,
      transcript,
      "MODEL_SCHEMA_INVALID",
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
