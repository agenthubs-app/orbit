// 报名画像的自适应问答:每一题由模型根据「活动语境 + 此前全部回答」生成,
// 而不是固定问题列表;答完后再由模型生成面向本次活动的个人画像。
//
// 与 question-generator 同一套纪律:模型只负责措辞与追问方向(understanding
// in model),字段枚举、题数上限、敏感词、长度全部在代码里校验(deterministic
// validation in code)。模型不可用或输出不合规时显式失败，由客户端保留
// 已完成回答并重试；禁止用确定性内容冒充 AI 结果。
// 例外：报名访谈在模型用不了时（当天 AI 用量用完 / 不可用 / 输出不合规）可改问固定问题
// （fixedInterviewQuestion），provenance 记为 deterministic-fallback + orbit-fixed，保证报名一定能完成。
import {
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
} from "../../orbit-ai/gemini-provider";
import type { EventRecord } from "../event-crud-and-import/contract";
import {
  EVENT_PARTICIPANT_PROFILE_FIELDS,
  type EventParticipantProfileField,
} from "./contract";
import { EVENT_PROFILE_CORE_FIELDS } from "./interview-response-contract";

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
  /** R27 E4：参加用「自己紹介（下書き）」（≤200 字、第一人称）；旧版本 / 模型没给时缺省。 */
  selfIntroDraft?: string;
  /** 2026-11-26：用户说要聊的话题（≤5）；模型没给时缺省。 */
  topics?: readonly string[];
  promptVersion?: string;
}

export const ADAPTIVE_INTERVIEW_MAX_TURNS = 8;
/** R27（DESIGN §2.4）：报名访谈最多问 5 题（会社・役職・業界来自资料，不再问）。 */
export const ADAPTIVE_INTERVIEW_QUESTION_LIMIT = 5;
/** R27 E4：persona 提示词版本（加了 selfIntroDraft 与日文）。 */
export const EVENT_PERSONA_PROMPT_VERSION = "event-persona-2026-10-v2";

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

/**
 * 报名页（join facade）的出题计划。给了就按报名页的顺序：两道核心题 → 参会目的・想聊的话题 → 其它。
 * - `skipFields`：不要再问的字段（资料已有的 positioning / industry、主办方题已覆盖的项）。
 * - `focusFields`：满 5 题后确认页「追加」只针对缺的项追问；此时题数上限放宽到 ADAPTIVE_INTERVIEW_MAX_TURNS。
 */
export interface AdaptiveInterviewPlan {
  skipFields?: readonly EventParticipantProfileField[];
  focusFields?: readonly EventParticipantProfileField[];
  /** 报名页会把资料里已有的选项（会いたい人・提供できること・话题・目的）单独列出并预选；模型不要再生成同义项。 */
  knownOptions?: Partial<Record<EventParticipantProfileField, readonly string[]>>;
}

/** 读请求体里的 knownOptions（只留枚举内字段，每个字段最多 12 个、每个 ≤60 字）。 */
export function readInterviewKnownOptions(value: unknown): AdaptiveInterviewPlan["knownOptions"] | undefined {
  if (!isRecord(value)) return undefined;
  const out: Partial<Record<EventParticipantProfileField, readonly string[]>> = {};
  for (const field of EVENT_PARTICIPANT_PROFILE_FIELDS) {
    const list = value[field];
    if (!Array.isArray(list)) continue;
    const items = list.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter((item) => item && item.length <= 60).slice(0, 12);
    if (items.length) out[field] = items;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * 各字段问什么（写进提示词）。2026-11-26：experienceHighlight 在报名里问的是「这次想聊的话题」（参加者页面上本来就显示为「話せるトピック」），
 * 不再问经历；任何题的选项都不能替用户断言经历、成就、资质。
 */
const FIELD_MEANINGS = [
  "targetAttendees: which kinds of people they want to meet at this event. Options are kinds of people.",
  "valueOffered: what kind of help they can give others. Options are kinds of help (e.g. introductions, legal advice), never claims about their past work.",
  "desiredOutcome: what they want to get from this event. Options are goals.",
  "experienceHighlight: which topics they want to talk about at THIS event. Options are topics drawn from the event's theme. Never ask about their past experience or achievements.",
  "energyStyle: how they like to talk with people at events.",
  "followUpPreference: how they want to keep in touch afterwards.",
  "positioning / industry: their role and industry (usually already known; ask plainly if asked).",
].join("\n");

/** 提示词的问法规则（三语共用；模型按 language 写）。 */
const QUESTION_STYLE_RULES = [
  "The question is ONE short sentence that asks exactly ONE thing. No greeting, no welcome, no thanks, no preamble, no explanation of why you ask, no self-reference.",
  "Use plain everyday words an older reader understands at a glance. No jargon or service-speak such as 精准对接 / マッチング精度 / precise matching.",
  "Chinese: address the person as 你, never 您.",
  "The person registers before the event: never say today, tonight, 今天, 今晚 or 今日; say this event / 这次活动 / 当日.",
  "Options never state facts about the person (past experience, achievements, credentials, clients, years). Anything about the person's own experience is left for them to type themselves.",
].join("\n");

/** 选项里替用户断言经历 / 成就 / 资质的写法（「处理过…」「搭建过…」「携わった」「I have led…」）。 */
const EXPERIENCE_CLAIM = /(处理过|搭建过|协助过|帮助过|做过|负责过|主导过|参与过|曾经|曾在|多年|年经验|年以上经验|経験あり|経験がある|携わった|担当した|手がけた|支援した|実績|年の経験|\bI have\b|\bI've\b|\byears of\b|\bhave led\b|\bhave built\b|\bhandled\b)/iu;
/** 问题开头的寒暄、说明腔。 */
const QUESTION_PREAMBLE = /^(欢迎|歡迎|感谢|感謝|ようこそ|ご参加|ありがとう|welcome|thanks|thank you)|精准对接|精準対接|为了帮你|为了帮您|為了/iu;

/** 问法的轻量检查：一题一问、一句话、不寒暄、中文不用「您」、不问本人经历。不合规 → 无效（报名页改问固定题）。 */
export function questionTextAcceptable(prompt: string, options: readonly string[]): boolean {
  if ((prompt.match(/[?？]/gu) ?? []).length > 1) return false;
  if (/[。！!]\s*\S/u.test(prompt.replace(/[?？]\s*$/u, ""))) return false;
  if (/\.\s+\S.*[?？]/u.test(prompt)) return false;
  if (QUESTION_PREAMBLE.test(prompt.trim())) return false;
  if (/您/u.test(prompt) || options.some((option) => /您/u.test(option))) return false;
  if (/(经历|經歷|経験談|实战|実戦|past experience|achievement)/iu.test(prompt)) return false;
  return !options.some((option) => EXPERIENCE_CLAIM.test(option));
}

/** 报名在活动之前：模型还是写了「今天」时换成活动当天的说法（只换时间状语，「今天的市场」这类不动）。 */
export function withoutToday(prompt: string): string {
  const eventNamed = /\bevent\b/iu.test(prompt);
  return prompt
    .replace(/今[天晚]的(?=活动|聚会|交流会|论坛)/gu, "这次")
    .replace(/今[天晚](?!的)/gu, "当天")
    .replace(/(?:今日|今夜)の(?=イベント|会|交流会)/gu, "今回の")
    .replace(/(?:今日|今夜)(?!の)/gu, "当日")
    .replace(/\b(?:today|tonight)['’]s (?=event|meetup|gathering)/giu, "this ")
    .replace(/^(?:today|tonight),?\s+(\w)/iu, (_match, first: string) => first.toUpperCase())
    .replace(/\s+(?:today|tonight)\b(?!['’])/giu, eventNamed ? "" : " at the event");
}

interface AdaptiveInterviewInput {
  event: EventRecord;
  language?: "en" | "zh" | "ja";
  modelConfig?: GeminiOrbitAgentProviderConfig;
  modelRunner?: AdaptiveInterviewModelRunner;
  plan?: AdaptiveInterviewPlan;
  transcript: readonly AdaptiveInterviewTurn[];
}

/** 报名页在两道核心题之后优先问的字段。 */
const JOIN_SECOND_FIELDS: readonly EventParticipantProfileField[] = ["desiredOutcome", "experienceHighlight"];

/** 读请求体里的字段列表（只留枚举内的；不是数组 → undefined）。 */
export function readInterviewFieldList(value: unknown): readonly EventParticipantProfileField[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((field): field is EventParticipantProfileField => typeof field === "string" && (EVENT_PARTICIPANT_PROFILE_FIELDS as readonly string[]).includes(field));
}

function questionLimitFor(plan: AdaptiveInterviewPlan | undefined): number {
  return plan?.focusFields ? ADAPTIVE_INTERVIEW_MAX_TURNS : ADAPTIVE_INTERVIEW_QUESTION_LIMIT;
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
  plan?: AdaptiveInterviewPlan,
): readonly EventParticipantProfileField[] {
  const answered = new Set([...transcript.map((turn) => turn.field), ...(plan?.skipFields ?? [])]);
  const remaining = EVENT_PARTICIPANT_PROFILE_FIELDS.filter(
    (field) => !answered.has(field),
  );
  if (plan?.focusFields) return remaining.filter((field) => plan.focusFields!.includes(field));
  // 报名前只允许追问两项必答（想认识谁 / 能提供什么）；两项完成后，服务
  // 仍可为报名后的画像深化生成其它字段，但报名工作区不会再调用第三题。
  const coreRemaining = remaining.filter((field) =>
    (EVENT_PROFILE_CORE_FIELDS as readonly EventParticipantProfileField[]).includes(field),
  );
  if (coreRemaining.length > 0) return coreRemaining;
  // 报名页：核心题之后先问参会目的・想聊的话题（确认资料的两项），再是其它。
  const secondRemaining = plan ? remaining.filter((field) => JOIN_SECOND_FIELDS.includes(field)) : [];
  return secondRemaining.length > 0 ? secondRemaining : remaining;
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
  const prompt = typeof parsed.prompt === "string" ? withoutToday(parsed.prompt.trim()) : "";
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
    !questionTextAcceptable(prompt, options) ||
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
  // R27：日文界面的问题用日文写（标签 / 活动名仍是中英两版，由调用方处理）。
  const language = input.language === "en" ? "en" : input.language === "ja" ? "ja" : "zh";
  const transcript = input.transcript.slice(0, ADAPTIVE_INTERVIEW_MAX_TURNS);
  const remainingFields = remainingFieldsFor(transcript, input.plan);

  if (
    remainingFields.length === 0 ||
    transcript.length >= ADAPTIVE_INTERVIEW_MAX_TURNS ||
    transcript.length >= questionLimitFor(input.plan)
  ) {
    return { done: true, question: null };
  }

  const modelRunner = input.modelRunner ?? runOrbitAgentModelText;
  const modelResult = await modelRunner({
    config: input.modelConfig,
    systemInstruction: [
      "You conduct a short adaptive interview that builds an attendee's persona for one specific event.",
      "Generate exactly ONE next question. Return strict JSON only: {\"acknowledgment\", \"field\", \"prompt\", \"options\"}.",
      `Write everything in ${language === "zh" ? "Chinese" : language === "ja" ? "Japanese" : "English"}.`,
      "acknowledgment: one short sentence that reacts to the person's LATEST answer (empty string if there is no previous answer). Never repeat the answer verbatim; show you understood it.",
      "field: pick the most valuable unanswered field from remainingFields, informed by what the person just said. The persona feeds attendee matching, so cover diverse dimensions.",
      "What each field asks:",
      FIELD_MEANINGS,
      "prompt: the next question, following naturally from the latest answer. Keep it under 40 characters if possible.",
      QUESTION_STYLE_RULES,
      "options: 2 to 4 short answer chips (choices, not statements about the person), fitting this event and this person's answers.",
      "knownOptions lists options the page already shows (preselected from the person's profile) for a field: do not repeat them or generate synonyms of them; add only different choices.",
      "Never ask for sensitive identity, credential, financial, or health data.",
    ].join("\n"),
    userText: JSON.stringify({
      event: {
        description: input.event.description,
        relationshipContext: input.event.relationshipContext,
        title: input.event.title,
        venue: input.event.venue,
      },
      knownOptions: input.plan?.knownOptions ?? {},
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

/** Provider / model recorded on a fixed (non-AI) question, so stored answers say where the question came from. */
export const FIXED_INTERVIEW_QUESTION_PROVIDER = "orbit-fixed";
export const FIXED_INTERVIEW_QUESTION_MODEL = "fixed-questions-v1";

type FixedQuestionText = { prompt: string; options: readonly string[] };
/** The fixed questions, in asking order (the two core fields first). */
const FIXED_INTERVIEW_QUESTIONS: readonly { field: EventParticipantProfileField; zh: FixedQuestionText; en: FixedQuestionText; ja: FixedQuestionText }[] = [
  { field: "targetAttendees", zh: { prompt: "这次活动上，你最想认识哪类人？", options: ["潜在客户", "合作伙伴", "投资人", "同行交流"] }, en: { prompt: "Who would you most like to meet at this event?", options: ["Potential clients", "Partners", "Investors", "Peers"] }, ja: { prompt: "このイベントで一番会いたいのはどんな人ですか？", options: ["見込み顧客", "提携先", "投資家", "同業者"] } },
  { field: "valueOffered", zh: { prompt: "你能给认识的人带来什么帮助？", options: ["行业经验", "介绍人脉", "技术支持", "合作机会"] }, en: { prompt: "What can you offer the people you meet?", options: ["Industry experience", "Introductions", "Technical help", "Business opportunities"] }, ja: { prompt: "出会った人に何を提供できますか？", options: ["業界の知見", "人の紹介", "技術面の支援", "協業の機会"] } },
  { field: "desiredOutcome", zh: { prompt: "参加这次活动，你最希望有什么收获？", options: ["找到客户", "找到合作方", "了解行业动态", "认识新朋友"] }, en: { prompt: "What do you most hope to get from this event?", options: ["Find clients", "Find partners", "Learn what is new", "Meet new people"] }, ja: { prompt: "このイベントで一番得たいことは何ですか？", options: ["顧客を見つける", "提携先を見つける", "業界の動きを知る", "新しい知り合い"] } },
  { field: "experienceHighlight", zh: { prompt: "你想和别人聊哪些话题？", options: ["行业趋势", "产品与技术", "市场与销售", "创业与经营"] }, en: { prompt: "Which topics would you like to talk about?", options: ["Industry trends", "Product and tech", "Marketing and sales", "Running a business"] }, ja: { prompt: "どんな話題で話したいですか？", options: ["業界の動向", "製品と技術", "マーケと営業", "起業と経営"] } },
  { field: "energyStyle", zh: { prompt: "在交流活动上，你更习惯怎样和人聊？", options: ["主动搭话", "一对一深聊", "先听再说"] }, en: { prompt: "How do you usually talk with people at events?", options: ["I start conversations", "Deep one-to-one talks", "I listen first"] }, ja: { prompt: "交流の場では、どんなふうに話すことが多いですか？", options: ["自分から話しかける", "1対1でじっくり", "まず聞く"] } },
];

/** The fixed question for one field in a language (null when there is none), e.g. to sign an answer the join page got elsewhere. */
export function fixedInterviewQuestionText(field: EventParticipantProfileField, language: "en" | "zh" | "ja"): FixedQuestionText | null {
  return FIXED_INTERVIEW_QUESTIONS.find((item) => item.field === field)?.[language] ?? null;
}

/**
 * A fixed next question for when the model cannot be used (daily AI limit used up, AI unavailable, invalid output),
 * so registration can always finish. Same limits as the model path; done when nothing is left to ask.
 */
export function fixedInterviewQuestion(input: { language?: "en" | "zh" | "ja"; plan?: AdaptiveInterviewPlan; reason: string; transcript: readonly AdaptiveInterviewTurn[] }): AdaptiveInterviewStep {
  const language = input.language === "en" ? "en" : input.language === "ja" ? "ja" : "zh";
  const transcript = input.transcript.slice(0, ADAPTIVE_INTERVIEW_MAX_TURNS);
  // 同模型路：跳过已覆盖的字段；满 5 题后的追问只问缺的项（固定题的顺序本来就是核心题 → 目的 → 话题 → 其它）。
  const answered = new Set([...transcript.map((turn) => turn.field), ...(input.plan?.skipFields ?? [])]);
  const focus = input.plan?.focusFields;
  const next = FIXED_INTERVIEW_QUESTIONS.find((item) => !answered.has(item.field) && (!focus || focus.includes(item.field)));
  if (!next || transcript.length >= ADAPTIVE_INTERVIEW_MAX_TURNS || transcript.length >= questionLimitFor(input.plan)) return { done: true, question: null };
  const text = next[language];
  return {
    done: false,
    question: {
      acknowledgment: "",
      field: next.field,
      options: [...text.options],
      prompt: text.prompt,
      provenance: { fallbackReason: input.reason, generationMethod: "deterministic-fallback", model: FIXED_INTERVIEW_QUESTION_MODEL, provider: FIXED_INTERVIEW_QUESTION_PROVIDER },
    },
  };
}

function readModelPersona(text: string, sourceText = ""): Omit<EventPersona, "provenance"> | null {
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

  // R27 E4：可选字段；给了就校验长度，不合格只丢掉这一项（不让整份画像失败）。
  const selfIntroDraft = typeof parsed.selfIntroDraft === "string" ? withoutToday(parsed.selfIntroDraft.trim()) : "";
  const introOk = selfIntroDraft.length >= 10 && selfIntroDraft.length <= 200 && !sensitivePattern.test(selfIntroDraft) && !unsupportedClaim(selfIntroDraft, sourceText);
  const intro = introOk ? { selfIntroDraft } : {};
  // 2026-11-26：只放用户说要聊的话题（报名确认页的话题 chip 用它，不混入能提供的 / 目的）。
  const topicList = Array.isArray(parsed.topics) ? parsed.topics.filter((topic): topic is string => typeof topic === "string").map((topic) => topic.trim()).filter((topic) => topic && topic.length <= 16 && !sensitivePattern.test(topic)).slice(0, 5) : [];
  return { energyStyle, industryTags, offering, openers, seeking, tagline, tags, ...intro, ...(topicList.length ? { topics: topicList } : {}) };
}

/** 自我介绍里「专注… / 擅长… / 専門…」这类定位，原话里没有这个词就算编的（整句草稿丢掉，改用资料里的自我介绍）。 */
const POSITIONING_CLAIM = /(专注|專注|擅长|擅長|精通|专精|専門|得意|特化|specializ\w*|expert in|focus(?:es|ed)? on)/giu;
export function unsupportedClaim(text: string, sourceText: string): boolean {
  const source = sourceText.toLowerCase();
  return [...text.matchAll(POSITIONING_CLAIM)].some((match) => !source.includes(match[0].toLowerCase()));
}

/**
 * 基于完整问答生成「面向本次活动」的个人画像。只允许使用 transcript 与
 * 活动信息里的事实；模型失败或不合规时显式失败，不发布替代画像。
 */
export async function generateEventPersona(
  input: AdaptiveInterviewInput,
): Promise<EventPersona> {
  const language = input.language === "en" ? "en" : input.language === "ja" ? "ja" : "zh";
  const transcript = input.transcript.slice(0, ADAPTIVE_INTERVIEW_MAX_TURNS);
  const modelRunner = input.modelRunner ?? runOrbitAgentModelText;
  const systemInstruction = [
      "You write an event-facing attendee persona from an interview transcript. It powers attendee matching, so every dimension matters.",
      "Return strict JSON only: {\"tagline\", \"tags\", \"industryTags\", \"energyStyle\", \"seeking\", \"offering\", \"openers\", \"selfIntroDraft\", \"topics\"}.",
      `Write everything in ${language === "zh" ? "Chinese" : language === "ja" ? "Japanese" : "English"}.`,
      "selfIntroDraft: a first-person self-introduction for other attendees (60-200 chars): who I am, what I want to talk about at THIS event, what I can offer. No revenue or other numbers unless they appear in the transcript.",
      "selfIntroDraft uses ONLY facts stated in the transcript. Never add a specialty, focus or strength the person did not say themselves (no 专注… / 擅长… / 専門… / 得意… / specializes in… / expert in…), and never turn a chosen option into a claim about their past work.",
      "selfIntroDraft is written before the event: never say today, tonight, 今天, 今晚 or 今日; say this event / 这次活动 / 当日.",
      "topics: 1-5 short labels (<=16 chars each) — ONLY the subjects they said they want to talk about. Not what they offer, not their goals, not who they want to meet. Empty array if they named none.",
      "tagline: one line (<=60 chars) positioning this person for THIS event.",
      "tags: 3-5 short labels (<=16 chars each) covering their strongest matching signals.",
      "industryTags: 1-3 industry labels (<=16 chars each).",
      "energyStyle: one short phrase (<=60 chars) describing how they engage socially (e.g. opens conversations, deep 1:1s, listens first).",
      "seeking: one sentence — who they want to meet at this event and why (<=140 chars).",
      "offering: one sentence — what they can offer people they meet (<=140 chars).",
      "openers: 2-3 conversation openers others could use with this person (<=90 chars each).",
      "Ground every statement ONLY in the transcript and event context. Do not invent facts.",
    ].join("\n");
  const userText = JSON.stringify({
      event: {
        description: input.event.description,
        relationshipContext: input.event.relationshipContext,
        title: input.event.title,
        venue: input.event.venue,
      },
      language,
      transcript,
    });
  // R27 E4：同 R26 E1/E2，DeepSeek 关思考、单次 60 秒（思考模式 20 秒内回不来）；其他供应商忽略这两项。
  const personaConfig = { ...(input.modelConfig ?? {}), deepseekThinking: false, jsonOutput: true, requestTimeoutMs: 60_000 };
  let modelResult = await modelRunner({ config: personaConfig, systemInstruction, userText });

  if (modelResult.success !== true) {
    throw new AdaptiveInterviewGenerationError(
      "MODEL_REQUEST_FAILED",
      `The event persona model request failed: ${modelResult.error.code}.`,
      modelResult.error.provider,
    );
  }

  // 自我介绍只能用回答里明确出现的事实（readModelPersona 拿原话核对定位词）。
  const sourceText = transcript.map((turn) => `${turn.prompt}\n${turn.answer}`).join("\n");
  let persona = readModelPersona(modelResult.text, sourceText);
  if (!persona) {
    // R27 E4：不合格时带着原答案修复 1 次（DESIGN §5 共同规矩），还不过才失败。
    const repaired = await modelRunner({ config: personaConfig, systemInstruction: `${systemInstruction}\nYour previous answer was rejected (invalid JSON or a field outside its limits). Return the corrected JSON object only.`, userText: `${userText}\n\nPrevious answer:\n${modelResult.text.slice(0, 4000)}` });
    if (repaired.success === true) {
      modelResult = repaired;
      persona = readModelPersona(repaired.text, sourceText);
    }
  }

  if (!persona) {
    throw new AdaptiveInterviewGenerationError(
      "MODEL_SCHEMA_INVALID",
      "The event persona model returned an invalid result.",
      modelResult.provider,
    );
  }

  return {
    ...persona,
    promptVersion: EVENT_PERSONA_PROMPT_VERSION,
    provenance: {
      fallbackReason: null,
      generationMethod: "orbit-agent-model-adaptive",
      model: modelResult.model,
      provider: modelResult.provider,
    },
  };
}
