import {
  DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL,
  DEFAULT_GEMINI_ORBIT_AGENT_MODEL,
  DEFAULT_OPENAI_ORBIT_AGENT_MODEL,
  resolveOrbitAgentModelProviderSelection,
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
  type OrbitAgentModelTextResult,
} from "../../orbit-ai/gemini-provider";
import type {
  EventOperationsAiProvider,
  EventOperationsJsonFailureShape,
  EventOperationsAiResponseMetadata,
  EventOperationsAiResult,
  EventOperationsGroupingFeature,
  EventOperationsParticipantRecommendations,
  EventOperationsTable,
} from "./contract";

export interface EventOperationsModelRunner {
  (input: {
    config?: GeminiOrbitAgentProviderConfig;
    systemInstruction: string;
    userText: string;
  }): Promise<OrbitAgentModelTextResult>;
}

export interface EventOperationsAiProviderOptions {
  config?: GeminiOrbitAgentProviderConfig;
  enforceOutputLanguage?: boolean;
  outputLanguage?: "en" | "zh-CN";
  recommendationPromptEncoding?: "expanded" | "deduplicated";
  retryableJsonFailureShapes?: readonly EventOperationsJsonFailureShape[];
  runModelText?: EventOperationsModelRunner;
  /** 2026-11-22: write participant-facing text in ja/zh/en in one output (base fields = zh, plus `i18n`). */
  trilingual?: boolean;
  /**
   * Receives the raw model text of a failed trilingual output (calibration only). Production does not
   * pass it: attendee profile text must not reach logs; production logs only the failure shape.
   */
  onTrilingualFailureText?: (detail: { kind: "recommendations" | "table" | "repair"; stage: string; text: string }) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringList(value: unknown, exactLength?: number): value is string[] {
  return (
    Array.isArray(value) &&
    (exactLength === undefined || value.length === exactLength) &&
    value.every(nonEmptyString)
  );
}

interface TokenRecommendation {
  icebreakers: readonly [string, string];
  memberHint: string;
  rank: number;
  reasons: readonly [string, ...string[]];
  score: number;
  targetCandidateKey: string;
}

interface TokenRecommendationRow {
  noMatchReason: string | null;
  recommendations: readonly TokenRecommendation[];
  sourceKey: string;
}

interface TokenizedRecommendationSource {
  candidateIdByKey: ReadonlyMap<string, string>;
  sourceParticipantId: string;
  sourceKey: string;
}

function parseTokenRecommendation(value: unknown, index: number): value is TokenRecommendation {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "icebreakers",
      "memberHint",
      "rank",
      "reasons",
      "score",
      "targetCandidateKey",
    ]) &&
    nonEmptyString(value.targetCandidateKey) &&
    value.rank === index + 1 &&
    typeof value.score === "number" &&
    Number.isFinite(value.score) &&
    value.score >= 0 &&
    value.score <= 100 &&
    stringList(value.reasons) &&
    value.reasons.length > 0 &&
    stringList(value.icebreakers, 2) &&
    nonEmptyString(value.memberHint)
  );
}

function parseTokenRecommendationRows(
  value: unknown,
): readonly TokenRecommendationRow[] | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["recommendations"]) ||
    !Array.isArray(value.recommendations)
  ) {
    return null;
  }
  for (const row of value.recommendations) {
    if (
      !isRecord(row) ||
      !exactKeys(row, [
        "noMatchReason",
        "recommendations",
        "sourceKey",
      ]) ||
      !nonEmptyString(row.sourceKey) ||
      !Array.isArray(row.recommendations) ||
      !row.recommendations.every(parseTokenRecommendation) ||
      (row.recommendations.length === 0
        ? !nonEmptyString(row.noMatchReason)
        : row.noMatchReason !== null)
    ) {
      return null;
    }
  }
  return value.recommendations as unknown as readonly TokenRecommendationRow[];
}

interface TokenGroupingFeature {
  affinityCandidateKeys: readonly string[];
  facilitationHint: string;
  primaryTopic: string;
  secondaryTopic: string;
  sourceKey: string;
}

interface TokenizedGroupingSource {
  candidateIdByKey: ReadonlyMap<string, string>;
  sourceParticipantId: string;
  sourceKey: string;
}

function parseTokenGroupingFeatures(value: unknown): readonly TokenGroupingFeature[] | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["features"]) ||
    !Array.isArray(value.features)
  ) {
    return null;
  }
  for (const feature of value.features) {
    if (
      !isRecord(feature) ||
      !exactKeys(feature, [
        "affinityCandidateKeys",
        "facilitationHint",
        "primaryTopic",
        "secondaryTopic",
        "sourceKey",
      ]) ||
      !Array.isArray(feature.affinityCandidateKeys) ||
      !feature.affinityCandidateKeys.every(nonEmptyString) ||
      new Set(feature.affinityCandidateKeys).size !== feature.affinityCandidateKeys.length ||
      !nonEmptyString(feature.facilitationHint) ||
      !nonEmptyString(feature.sourceKey) ||
      !nonEmptyString(feature.primaryTopic) ||
      !nonEmptyString(feature.secondaryTopic)
    ) {
      return null;
    }
  }
  return value.features as unknown as readonly TokenGroupingFeature[];
}

function parseMemberPrompts(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every((prompts) => stringList(prompts, 2))
  );
}

function parseMemberRationales(value: unknown): boolean {
  return (
    isRecord(value) &&
    Object.keys(value).length > 0 &&
    Object.values(value).every(nonEmptyString)
  );
}

function hasExactMemberKeys(
  value: Record<string, unknown>,
  expectedMemberIds: ReadonlySet<string>,
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === expectedMemberIds.size &&
    keys.every((participantId) => expectedMemberIds.has(participantId))
  );
}

function parseTable(
  value: unknown,
  expectedMemberIds: ReadonlySet<string>,
): EventOperationsTable | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      "icebreakers",
      "memberPrompts",
      "memberRationales",
      "members",
      "rationale",
      "tableNumber",
      "theme",
    ]) ||
    typeof value.tableNumber !== "number" ||
    !Number.isInteger(value.tableNumber) ||
    value.tableNumber < 1 ||
    !nonEmptyString(value.theme) ||
    !nonEmptyString(value.rationale) ||
    !stringList(value.icebreakers, 3) ||
    !Array.isArray(value.members) ||
    value.members.length === 0 ||
    !value.members.every(
      (member) =>
        isRecord(member) &&
        exactKeys(member, ["participantId", "seat"]) &&
        nonEmptyString(member.participantId) &&
        nonEmptyString(member.seat),
    ) ||
    !parseMemberPrompts(value.memberPrompts) ||
    !parseMemberRationales(value.memberRationales)
  ) {
    return null;
  }
  const responseMemberIds = new Set(
    value.members.map((member) => (member as Record<string, unknown>).participantId as string),
  );
  if (
    responseMemberIds.size !== value.members.length ||
    responseMemberIds.size !== expectedMemberIds.size ||
    [...responseMemberIds].some((participantId) => !expectedMemberIds.has(participantId)) ||
    !hasExactMemberKeys(value.memberPrompts as Record<string, unknown>, expectedMemberIds) ||
    !hasExactMemberKeys(value.memberRationales as Record<string, unknown>, expectedMemberIds)
  ) {
    return null;
  }
  return value as unknown as EventOperationsTable;
}

function parseJson(text: string): unknown | null {
  try {
    return JSON.parse(text.trim()) as unknown;
  } catch {
    return null;
  }
}

function classifyJsonFailureShape(text: string): EventOperationsJsonFailureShape {
  const value = text.trim();
  if (!value) return "empty";
  if (value[0] !== "{" && value[0] !== "[") return "fence_or_prefix";

  const expectedClosing = new Map<string, string>([["{", "}"], ["[", "]"]]);
  const stack: string[] = [];
  let escaped = false;
  let inString = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    const closing = expectedClosing.get(character);
    if (closing) {
      stack.push(closing);
      continue;
    }
    if (character !== "}" && character !== "]") continue;
    if (stack.pop() !== character) return "parse_syntax";
    if (stack.length === 0) {
      return value.slice(index + 1).trim() ? "trailing_text" : "parse_syntax";
    }
  }
  return "unterminated_envelope";
}

function modelFailure<TValue>(
  result: Extract<OrbitAgentModelTextResult, { success: false }>,
): EventOperationsAiResult<TValue> {
  const timeout = /timed out|timeout|aborted/iu.test(result.error.message);
  return {
    error: {
      code:
        result.error.code === "MODEL_API_KEY_MISSING"
          ? "AI_UNAVAILABLE"
          : timeout
            ? "AI_TIMEOUT"
            : "AI_REQUEST_FAILED",
      message: result.error.message,
    },
    ...(result.responseMetadata
      ? { responseMetadata: toEventOperationsMetadata(result.responseMetadata) }
      : {}),
    retryable: result.retryable === true,
    success: false,
  };
}

function toEventOperationsMetadata(
  value: import("../../orbit-ai/gemini-provider").OrbitAgentModelResponseMetadata,
): EventOperationsAiResponseMetadata {
  return {
    finishReason: value.finishReason,
    providerResponseBytes: value.providerResponseBytes,
    usage: value.usage ? { ...value.usage } : null,
  };
}

function addUsageComponent(
  first: number | null,
  second: number | null,
): number | null {
  return first === null && second === null ? null : (first ?? 0) + (second ?? 0);
}

/**
 * Accounting for a repaired output must cover both model calls: the original
 * generation call and the bounded language-repair call. Bytes and token usage
 * are summed; the finish reason stays the final call's reason.
 */
function mergeEventOperationsResponseMetadata(
  first: EventOperationsAiResponseMetadata | undefined,
  second: EventOperationsAiResponseMetadata | undefined,
): EventOperationsAiResponseMetadata | undefined {
  if (!first) return second;
  if (!second) return first;
  return {
    finishReason: second.finishReason ?? first.finishReason,
    providerResponseBytes:
      first.providerResponseBytes + second.providerResponseBytes,
    usage:
      first.usage === null && second.usage === null
        ? null
        : {
            cacheHitTokens: addUsageComponent(
              first.usage?.cacheHitTokens ?? null,
              second.usage?.cacheHitTokens ?? null,
            ),
            completionTokens: addUsageComponent(
              first.usage?.completionTokens ?? null,
              second.usage?.completionTokens ?? null,
            ),
            promptTokens: addUsageComponent(
              first.usage?.promptTokens ?? null,
              second.usage?.promptTokens ?? null,
            ),
            reasoningTokens: addUsageComponent(
              first.usage?.reasoningTokens ?? null,
              second.usage?.reasoningTokens ?? null,
            ),
          },
  };
}

function invalidJson<TValue>(
  jsonFailureShape: EventOperationsJsonFailureShape,
  responseMetadata?: EventOperationsAiResponseMetadata,
  retryableJsonFailureShapes: ReadonlySet<EventOperationsJsonFailureShape> = new Set(),
): EventOperationsAiResult<TValue> {
  return {
    error: {
      code: "AI_JSON_INVALID",
      jsonFailureShape,
      message: "The model response was not one strict JSON document.",
    },
    ...(responseMetadata ? { responseMetadata } : {}),
    retryable: retryableJsonFailureShapes.has(jsonFailureShape),
    success: false,
  };
}

function invalidSchema<TValue>(
  responseMetadata?: EventOperationsAiResponseMetadata,
): EventOperationsAiResult<TValue> {
  return {
    error: {
      code: "AI_SCHEMA_INVALID",
      message: "The model JSON did not match the closed event operations schema.",
    },
    ...(responseMetadata ? { responseMetadata } : {}),
    retryable: false,
    success: false,
  };
}

const CHINESE_OUTPUT_TECHNICAL_TOKENS = new Set(
  ["AI", "SaaS", "KPI", "API", "B2B", "LP", "IP", "CEO", "Scope"].map(
    (token) => token.toLocaleLowerCase("en-US"),
  ),
);
/**
 * 2026-11-22 calibration with real attendee data: Chinese business writing keeps upper-case abbreviations
 * (DX, VC, IPO, M&A, LLM, ESG …) and a few mixed-case terms as written. Ordinary English words still have
 * to be translated.
 */
const CHINESE_OUTPUT_MIXED_CASE_TERMS = new Set(["saas", "web3", "edtech", "fintech", "healthtech", "deeptech", "poc", "tiktok", "iot", "ipo", "pre-a"]);
function isChineseOutputTechnicalToken(token: string): boolean {
  const lower = token.toLocaleLowerCase("en-US");
  return CHINESE_OUTPUT_TECHNICAL_TOKENS.has(lower) || CHINESE_OUTPUT_MIXED_CASE_TERMS.has(lower) || /^[A-Z][A-Z0-9]{0,5}$/u.test(token)
    // short mixed-case scientific / product abbreviations: iPS, mRNA, eKYC
    || /^[a-z]?[A-Z]{2,4}[a-z]?$/u.test(token);
}
/** Only the explicit term lists (not the generic abbreviation shapes) may stand alone without any Han. */
const isListedChineseTerm = (token: string) => CHINESE_OUTPUT_TECHNICAL_TOKENS.has(token.toLocaleLowerCase("en-US")) || CHINESE_OUTPUT_MIXED_CASE_TERMS.has(token.toLocaleLowerCase("en-US"));
const LATIN_TOKEN_PATTERN =
  /\p{Script=Latin}[\p{Script=Latin}\p{Mark}\p{Number}]*(?:[-'’]\p{Script=Latin}[\p{Script=Latin}\p{Mark}\p{Number}]*)*/gu;
const HAN_CHARACTER_PATTERN = /\p{Script=Han}/u;

function latinTokens(value: string): readonly string[] {
  return value.match(LATIN_TOKEN_PATTERN) ?? [];
}

function allowedChineseOutputLatinTokens(
  participants: readonly import("./contract").EventOperationsParticipant[],
): ReadonlySet<string> {
  const allowed = new Set(CHINESE_OUTPUT_TECHNICAL_TOKENS);
  for (const participant of participants) {
    for (const properName of [participant.displayName, participant.company]) {
      if (typeof properName !== "string") continue;
      for (const token of latinTokens(properName)) {
        allowed.add(token.toLocaleLowerCase("en-US"));
      }
    }
  }
  return allowed;
}

export interface ChineseOutputPolicyViolations {
  disallowedTokens: readonly string[];
  untranslatedValues: readonly string[];
}

export function collectChineseOutputPolicyViolations(
  values: readonly string[],
  participants: readonly import("./contract").EventOperationsParticipant[],
): ChineseOutputPolicyViolations {
  const allowed = allowedChineseOutputLatinTokens(participants);
  const disallowedTokens = new Set<string>();
  const untranslatedValues: string[] = [];
  for (const value of values) {
    const tokens = latinTokens(value);
    for (const token of tokens) {
      if (!allowed.has(token.toLocaleLowerCase("en-US")) && !isChineseOutputTechnicalToken(token)) {
        disallowedTokens.add(token);
      }
    }
    // A value without Han is untranslated unless it is only listed terms (e.g. "SaaS"); "HELLO WORLD" is not.
    // Kana outside participant / company names means Japanese text in the zh slot.
    const withoutNames = withoutProperNames(value, properNamesOf(participants));
    if (
      (!HAN_CHARACTER_PATTERN.test(value) && tokens.length > 0 && !tokens.every(isListedChineseTerm)) ||
      KANA_PATTERN.test(withoutNames)
    ) {
      untranslatedValues.push(value);
    }
  }
  return {
    disallowedTokens: [...disallowedTokens],
    untranslatedValues,
  };
}

function followsChineseOutputLanguagePolicy(
  values: readonly string[],
  participants: readonly import("./contract").EventOperationsParticipant[],
): boolean {
  const violations = collectChineseOutputPolicyViolations(values, participants);
  return (
    violations.disallowedTokens.length === 0 &&
    violations.untranslatedValues.length === 0
  );
}

function invalidOutputLanguage<TValue>(
  responseMetadata?: EventOperationsAiResponseMetadata,
): EventOperationsAiResult<TValue> {
  return {
    error: {
      code: "AI_SCHEMA_INVALID",
      message:
        "The model output violated the configured natural-language policy.",
    },
    ...(responseMetadata ? { responseMetadata } : {}),
    retryable: true,
    success: false,
  };
}

function strictChineseOutputRequirement(
  participants: readonly import("./contract").EventOperationsParticipant[],
): string {
  const allowedTokens = [...allowedChineseOutputLatinTokens(participants)].sort();
  return `- Every natural-language value must be idiomatic Simplified Chinese. The only allowed Latin tokens are this exact case-insensitive list of participant/company proper-name tokens and technical terms: ${JSON.stringify(allowedTokens)}. Translate every other Latin word.`;
}

function describeChineseOutputPolicyViolations(
  violations: ChineseOutputPolicyViolations,
): string {
  const tokens = violations.disallowedTokens.slice(0, 30);
  const values = violations.untranslatedValues
    .slice(0, 6)
    .map((value) => (value.length > 160 ? `${value.slice(0, 160)}…` : value));
  return [
    ...(tokens.length > 0
      ? [
          `These exact Latin tokens in the original document are NOT allowed and each one must be translated into Chinese: ${JSON.stringify(tokens)}.`,
        ]
      : []),
    ...(values.length > 0
      ? [
          `These string values contain no Chinese and must be rewritten as idiomatic Simplified Chinese: ${JSON.stringify(values)}.`,
        ]
      : []),
  ].join("\n");
}

async function repairChineseNaturalLanguage<TValue>(input: {
  config: GeminiOrbitAgentProviderConfig | undefined;
  naturalLanguageFields: string;
  originalJson: unknown;
  originalResponseMetadata: EventOperationsAiResponseMetadata | undefined;
  parseValue(value: unknown): TValue | null;
  participants: readonly import("./contract").EventOperationsParticipant[];
  runModelText: EventOperationsModelRunner;
  values(value: TValue): readonly string[];
  violations: ChineseOutputPolicyViolations;
}): Promise<EventOperationsAiResult<TValue>> {
  const allowedTokens = [...allowedChineseOutputLatinTokens(input.participants)].sort();
  const violationSummary = describeChineseOutputPolicyViolations(input.violations);
  const response = await input.runModelText({
    config: input.config,
    systemInstruction: `${systemInstruction}\nYou are performing one bounded AI-only language repair. Preserve every object key, array boundary, id, token key, number, boolean, and null exactly. Translate only the documented natural-language string values into idiomatic Simplified Chinese. Inside those string values, Latin numeric abbreviations must be rewritten as Chinese numerals with the exact same value (for example 80k becomes 8万 and 1.2M becomes 120万); that rewrite is required and does not count as changing a number. Never add, remove, reorder, summarize, or locally substitute data.`,
    userText: `Repair only these natural-language fields: ${input.naturalLanguageFields}.
The only allowed Latin tokens are this exact case-insensitive list of participant/company proper-name tokens and technical terms: ${JSON.stringify(allowedTokens)}.
Translate every other Latin word. Return the same closed JSON document with no markdown or trailing text.
${violationSummary ? `\n${violationSummary}\n` : ""}
Original closed JSON:
${JSON.stringify(input.originalJson)}`,
  });
  if (response.success === false) {
    const failure = modelFailure<TValue>(response);
    if (failure.success === false) {
      const merged = mergeEventOperationsResponseMetadata(
        input.originalResponseMetadata,
        failure.responseMetadata,
      );
      return { ...failure, ...(merged ? { responseMetadata: merged } : {}) };
    }
    return failure;
  }
  const metadata = mergeEventOperationsResponseMetadata(
    input.originalResponseMetadata,
    response.responseMetadata
      ? toEventOperationsMetadata(response.responseMetadata)
      : undefined,
  );
  const json = parseJson(response.text);
  const value = json === null ? null : input.parseValue(json);
  if (!value) {
    writeChineseRepairDiagnostic({
      failureMode:
        json === null ? "repair_output_not_json" : "repair_output_schema_mismatch",
    });
    return invalidOutputLanguage(metadata);
  }
  const repairedViolations = collectChineseOutputPolicyViolations(
    input.values(value),
    input.participants,
  );
  if (
    repairedViolations.disallowedTokens.length > 0 ||
    repairedViolations.untranslatedValues.length > 0
  ) {
    writeChineseRepairDiagnostic({
      disallowedTokens: repairedViolations.disallowedTokens.slice(0, 20),
      failureMode: "language_violation",
      untranslatedValueCount: repairedViolations.untranslatedValues.length,
    });
    return invalidOutputLanguage(metadata);
  }
  return {
    data: value,
    model: response.model,
    provider: response.provider,
    ...(metadata ? { responseMetadata: metadata } : {}),
    success: true,
  };
}

/**
 * Operator-facing stderr diagnostic for a failed bounded language repair.
 * Persisted task errors stay generic on purpose; this stream-only event is
 * what tells an operator why a shard keeps failing the Chinese gate.
 */
function writeChineseRepairDiagnostic(detail: Record<string, unknown>): void {
  try {
    process.stderr.write(
      `${JSON.stringify({ event: "event_operations_chinese_repair_failed", ...detail })}\n`,
    );
  } catch {
    // Diagnostics must never break the generation pipeline.
  }
}

function recommendationNaturalLanguageValues(
  rows: readonly EventOperationsParticipantRecommendations[],
): readonly string[] {
  return rows.flatMap((row) => [
    ...(row.noMatchReason ? [row.noMatchReason] : []),
    ...row.recommendations.flatMap((recommendation) => [
      ...recommendation.reasons,
      ...recommendation.icebreakers,
      recommendation.memberHint,
    ]),
  ]);
}

function groupingNaturalLanguageValues(
  features: readonly EventOperationsGroupingFeature[],
): readonly string[] {
  return features.flatMap((feature) => [
    feature.primaryTopic,
    feature.secondaryTopic,
    feature.facilitationHint,
  ]);
}

function tableNaturalLanguageValues(
  table: EventOperationsTable,
): readonly string[] {
  return [
    table.theme,
    table.rationale,
    ...table.icebreakers,
    ...Object.values(table.memberPrompts).flat(),
    ...Object.values(table.memberRationales),
  ];
}


// ---------------------------------------------------------------------------
// 2026-11-22 三语：一次输出 ja/zh/en，同一次推理写三种语言（选人、排名、分数、分桌只有一份）。
// 模型返回的三语文档先拆成三份「原有形状」的单语文档，各自走原有的封闭 schema 解析，
// 再合并：原字段 = zh（旧读者照旧），三语进 `i18n`。
// ---------------------------------------------------------------------------

const TEXT_LANGUAGES = ["ja", "zh", "en"] as const;
type TextLanguage = (typeof TEXT_LANGUAGES)[number];
const KANA_PATTERN = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;

function properNamesOf(participants: readonly import("./contract").EventOperationsParticipant[]): readonly string[] {
  return [...new Set(participants.flatMap((participant) => [participant.displayName, participant.company]).filter((name): name is string => typeof name === "string" && name.trim().length > 0).map((name) => name.trim()))]
    .sort((left, right) => right.length - left.length);
}

function withoutProperNames(value: string, names: readonly string[]): string {
  let rest = value;
  for (const name of names) rest = rest.split(name).join(" ");
  return rest;
}

const HAN_CHAR_PATTERN = /^\p{Script=Han}$/u;
const PLACEHOLDER_PATTERN = /\{\s*([A-Z][A-Z0-9]*)\s*(:\s*company)?\s*\}/gu;

/**
 * Names are never written by the model (2026-11-22): it refers to people as {KEY} and to their company
 * as {KEY:company}; this inserts the registered name / company of the participant behind that key, so
 * attendees always see the exact record. Returns the placeholders that could not be filled (unknown key,
 * no company on record) or stray braces — a retryable batch failure.
 */
export function fillParticipantPlaceholders(
  sentences: readonly TrilingualSentence[],
  byKey: ReadonlyMap<string, import("./contract").EventOperationsParticipant>,
): string[] {
  const problems: string[] = [];
  for (const sentence of sentences) {
    for (const language of TEXT_LANGUAGES) {
      // Look-alike letters inside braces (Cyrillic М/С seen in calibration) are the Latin key letters.
      const normalized = sentence[language].replace(/\{[^{}]{1,24}\}/gu, (inner) => inner.replace(/[МмΜ]/gu, "M").replace(/[СсϹ]/gu, "S"));
      const filled = normalized.replace(PLACEHOLDER_PATTERN, (match: string, key: string, company?: string) => {
        const participant = byKey.get(key);
        const value = company ? (participant ? registeredCompany(participant) : null) : participant?.displayName;
        if (!value?.trim()) { problems.push(match); return match; }
        return value.trim();
      });
      if (/[{}]/u.test(filled)) problems.push("stray-brace");
      (sentence as Record<TextLanguage, string>)[language] = filled;
    }
  }
  return problems;
}

export interface TrilingualOutputViolations {
  /** ja values that read as another language: no kana in a sentence (ends with 。！？ or 12+ characters). */
  japanese: readonly string[];
  /** en values with any Han / kana outside placeholders. */
  english: readonly string[];
  /** zh values with no Han, with kana, or with Latin words outside the abbreviation rules. */
  chinese: readonly string[];
  /** values (any language) that write a registered name or company instead of a placeholder. */
  names: readonly string[];
}

/** Values people type into the company field when they have none; never shown as a company. */
const NON_ENTITY_COMPANIES = new Set(["无", "暂无", "無", "無し", "なし", "ナシ", "省略", "调整中", "調整中", "未定", "未定义", "個人", "个人", "-", "—", "n/a", "na", "none", "null", "🈚"]);
/** The registered company, or null when the field is blank or a "none" placeholder value. */
export function registeredCompany(participant: import("./contract").EventOperationsParticipant): string | null {
  const value = participant.company?.trim() ?? "";
  return value && !NON_ENTITY_COMPANIES.has(value.toLocaleLowerCase("en-US")) ? value : null;
}

const ANY_BRACES_PATTERN = /\{[^{}]{0,40}\}/gu;
const CANONICAL_PLACEHOLDER_PATTERN = /^\{([A-Z][A-Z0-9]*)(:company)?\}$/u;

/** Look-alike letters and spaces inside braces → canonical `{KEY}` / `{KEY:company}`. Text outside braces is untouched. */
export function normalizePlaceholders(text: string): string {
  return text.replace(ANY_BRACES_PATTERN, (inner) => inner.replace(/\s+/gu, "").replace(/[МмΜ]/gu, "M").replace(/[СсϹ]/gu, "S").replace(/:COMPANY\}$/u, ":company}"));
}
const stripPlaceholders = (text: string) => text.replace(ANY_BRACES_PATTERN, " ");

/**
 * Character-level language rules on placeholder text (names are never in it). They are diagnostics, not a
 * proof of meaning: they catch untranslated text and text written in the wrong language.
 */
export function collectTrilingualOutputViolations(
  values: Readonly<Record<TextLanguage, readonly string[]>>,
  participants: readonly import("./contract").EventOperationsParticipant[],
): TrilingualOutputViolations {
  // Names of 2+ characters; companies of 3+ (short company values collide with ordinary words).
  const registered = [...new Set([
    ...participants.map((participant) => participant.displayName).filter((name) => name.trim().length >= 2),
    ...participants.map(registeredCompany).filter((name): name is string => name !== null && name.length >= 3),
  ].flatMap((name) => [name.trim(), name.replace(/\s+/gu, "")]))];
  const writesName = (value: string) => { const text = stripPlaceholders(value); return registered.some((name) => text.includes(name)); };
  const japanese = values.ja.filter((value) => {
    const rest = stripPlaceholders(value).trim();
    return !KANA_PATTERN.test(rest) && (/[。！？]/u.test(rest) || rest.length >= 12);
  });
  const english = values.en.filter((value) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(stripPlaceholders(value)));
  const chinese = values.zh.filter((value) => {
    const rest = stripPlaceholders(value).trim();
    if (!rest) return false;
    if (!HAN_CHARACTER_PATTERN.test(rest) || KANA_PATTERN.test(rest)) return true;
    const policy = collectChineseOutputPolicyViolations([rest], []);
    return policy.disallowedTokens.length > 0 || policy.untranslatedValues.length > 0;
  });
  const names = [...values.ja, ...values.zh, ...values.en].filter(writesName);
  return { chinese, english, japanese, names };
}

/** One model sentence plus the placeholders it may use (its row's source and target, or its table's members). */
interface ScopedSentence { allowed: ReadonlySet<string>; sentence: TrilingualSentence }

const NUMBER_UNITS: Readonly<Record<string, number>> = { "万": 1e4, "萬": 1e4, "億": 1e8, "亿": 1e8, "千": 1e3, k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };
/**
 * Arabic-digit numbers with their unit applied (100万 = 1 million = 1000000), as a set. A language that writes
 * no digits (one million / 百万 / a decade) has an empty set and is not compared — calibration showed that
 * comparing raw digit strings rejected only equivalent wordings.
 */
function numericValues(text: string): string {
  const plain = stripPlaceholders(text).replace(/[０-９]/gu, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  const values = new Set<number>();
  for (const match of plain.matchAll(/(\d+(?:[.,]\d+)?)\s*(万|萬|億|亿|千|billion|million|thousand|bn|[kKmMbB](?![a-zA-Z]))?/gu)) {
    const base = Number(match[1]!.replace(/,(?=\d{3}\b)/gu, "").replace(",", "."));
    values.add(Math.round(base * (match[2] ? NUMBER_UNITS[match[2].toLocaleLowerCase("en-US")] ?? 1 : 1) * 1000) / 1000);
  }
  return [...values].sort((left, right) => left - right).join("|");
}

/**
 * Full check of every sentence, run after generation and again after any repair:
 * placeholders well-formed and in scope, a company only with its person, the same placeholders and the
 * same numbers in all three languages, no registered name written by hand (structural: the batch fails);
 * then the language rules (flagged languages may get one repair).
 */
function checkScopedSentences(scoped: readonly ScopedSentence[], participants: readonly import("./contract").EventOperationsParticipant[]) {
  const structural: string[] = [];
  const flagged: Array<{ index: number; languages: TextLanguage[] }> = [];
  scoped.forEach(({ allowed, sentence }, index) => {
    const sets: string[] = [];
    for (const language of TEXT_LANGUAGES) {
      const text = normalizePlaceholders(sentence[language]);
      (sentence as Record<TextLanguage, string>)[language] = text;
      const found = text.match(ANY_BRACES_PATTERN) ?? [];
      const people = new Set<string>();
      const companies: string[] = [];
      for (const placeholder of found) {
        const match = CANONICAL_PLACEHOLDER_PATTERN.exec(placeholder);
        if (!match) { structural.push(`malformed_placeholder@${index}`); continue; }
        if (!allowed.has(match[1]!)) structural.push(`out_of_scope@${index}`);
        if (match[2]) companies.push(match[1]!); else people.add(match[1]!);
      }
      if (companies.some((key) => !people.has(key))) structural.push(`company_without_person@${index}`);
      if (/[{}]/u.test(text.replace(ANY_BRACES_PATTERN, ""))) structural.push(`stray_brace@${index}`);
      sets.push([...new Set(found)].sort().join(","));
    }
    if (new Set(sets).size !== 1) structural.push(`placeholder_mismatch@${index}`);
    const numberSets = TEXT_LANGUAGES.map((language) => numericValues(sentence[language])).filter((set) => set !== "");
    if (new Set(numberSets).size > 1) structural.push(`number_mismatch@${index}`);
    const violations = collectTrilingualOutputViolations({ en: [sentence.en], ja: [sentence.ja], zh: [sentence.zh] }, participants);
    if (violations.names.length) structural.push(`raw_name@${index}`);
    const languages = TEXT_LANGUAGES.filter((language) => (language === "ja" ? violations.japanese : language === "zh" ? violations.chinese : violations.english).length > 0);
    if (languages.length) flagged.push({ index, languages });
  });
  return { flagged, structural };
}

function trilingualRetryable<TValue>(message: string, responseMetadata?: EventOperationsAiResponseMetadata): EventOperationsAiResult<TValue> {
  return {
    error: { code: "AI_SCHEMA_INVALID", message },
    ...(responseMetadata ? { responseMetadata } : {}),
    retryable: true,
    success: false,
  };
}

function isTrilingualString(value: unknown): value is Record<TextLanguage, string> {
  return isRecord(value) && exactKeys(value, [...TEXT_LANGUAGES]) && TEXT_LANGUAGES.every((language) => nonEmptyString(value[language]));
}

/**
 * A sentence the model wrote in three languages: `{ja, zh, en}` (2026-11-22 v2: paired per sentence,
 * so the languages cannot drift apart in count or order). Splitting keeps a reference to each one so
 * a bounded repair can patch exactly the flagged languages before the per-language documents are built.
 */
export interface TrilingualSentence { ja: string; zh: string; en: string }

const pick = (sentence: unknown, language: TextLanguage) => (sentence as Record<TextLanguage, string>)[language];
const sentenceList = (value: unknown, exactLength?: number): value is TrilingualSentence[] =>
  Array.isArray(value) && value.length > 0 && (exactLength === undefined || value.length === exactLength) && value.every(isTrilingualString);

/** Every trilingual sentence of a recommendations document (null = not the documented paired shape). */
export function trilingualRecommendationSentences(value: unknown): TrilingualSentence[] | null {
  if (!isRecord(value) || !exactKeys(value, ["recommendations"]) || !Array.isArray(value.recommendations)) return null;
  const sentences: TrilingualSentence[] = [];
  for (const row of value.recommendations) {
    if (!isRecord(row) || !exactKeys(row, ["noMatchReason", "recommendations", "sourceKey"]) || !Array.isArray(row.recommendations)) return null;
    if (row.noMatchReason !== null) {
      if (!isTrilingualString(row.noMatchReason)) return null;
      sentences.push(row.noMatchReason as TrilingualSentence);
    }
    for (const item of row.recommendations) {
      if (!isRecord(item) || !exactKeys(item, ["icebreakers", "memberHint", "rank", "reasons", "score", "targetCandidateKey"])) return null;
      if (!sentenceList(item.reasons) || !sentenceList(item.icebreakers, 2) || !isTrilingualString(item.memberHint)) return null;
      sentences.push(...item.reasons, ...item.icebreakers, item.memberHint as TrilingualSentence);
    }
  }
  return sentences;
}

/** Paired recommendations document → one single-language document per language, in the original shape. */
export function splitTrilingualRecommendations(value: unknown): Record<TextLanguage, unknown> | null {
  if (!trilingualRecommendationSentences(value)) return null;
  const rows = (value as { recommendations: Record<string, unknown>[] }).recommendations;
  return Object.fromEntries(TEXT_LANGUAGES.map((language) => [language, {
    recommendations: rows.map((row) => ({
      noMatchReason: row.noMatchReason === null ? null : pick(row.noMatchReason, language),
      recommendations: (row.recommendations as Record<string, unknown>[]).map((item) => ({
        icebreakers: (item.icebreakers as unknown[]).map((sentence) => pick(sentence, language)),
        memberHint: pick(item.memberHint, language),
        rank: item.rank,
        reasons: (item.reasons as unknown[]).map((sentence) => pick(sentence, language)),
        score: item.score,
        targetCandidateKey: item.targetCandidateKey,
      })),
      sourceKey: row.sourceKey,
    })),
  }])) as Record<TextLanguage, unknown>;
}

export function mergeTrilingualRecommendations(
  rows: Readonly<Record<TextLanguage, readonly EventOperationsParticipantRecommendations[]>>,
): readonly EventOperationsParticipantRecommendations[] {
  return rows.zh.map((row, rowIndex) => ({
    ...row,
    ...(row.noMatchReason !== null ? { noMatchReasonI18n: { en: rows.en[rowIndex]!.noMatchReason!, ja: rows.ja[rowIndex]!.noMatchReason!, zh: row.noMatchReason } } : {}),
    recommendations: row.recommendations.map((item, itemIndex) => ({
      ...item,
      i18n: Object.fromEntries(TEXT_LANGUAGES.map((language) => {
        const text = rows[language][rowIndex]!.recommendations[itemIndex]!;
        return [language, { icebreakers: text.icebreakers, memberHint: text.memberHint, reasons: text.reasons }];
      })) as NonNullable<EventOperationsParticipantRecommendations["recommendations"][number]["i18n"]>,
    })),
  }));
}

/** Every trilingual sentence of a table document (null = not the documented paired shape). */
export function trilingualTableSentences(value: unknown): TrilingualSentence[] | null {
  if (!isRecord(value) || !exactKeys(value, ["icebreakers", "memberPrompts", "memberRationales", "members", "rationale", "tableNumber", "theme"])) return null;
  if (!isTrilingualString(value.theme) || !isTrilingualString(value.rationale) || !sentenceList(value.icebreakers, 3)) return null;
  if (!isRecord(value.memberPrompts) || !Object.values(value.memberPrompts).every((prompts) => sentenceList(prompts, 2))) return null;
  if (!isRecord(value.memberRationales) || !Object.values(value.memberRationales).every(isTrilingualString)) return null;
  return [
    value.theme as TrilingualSentence, value.rationale as TrilingualSentence, ...(value.icebreakers as TrilingualSentence[]),
    ...Object.values(value.memberPrompts).flatMap((prompts) => prompts as TrilingualSentence[]),
    ...(Object.values(value.memberRationales) as TrilingualSentence[]),
  ];
}

/**
 * Table output keyed by memberKey (M1..Mn) → the same document keyed by participantId. Null when the
 * keys are not exactly the supplied ones (missing, unknown, or duplicated) — a retryable batch failure.
 */
export function tableFromMemberKeys(value: unknown, idOfKey: ReadonlyMap<string, string>): Record<string, unknown> | null {
  // 2026-11-22 calibration: per-member text lives in each members[] row ({memberKey, seat, prompts,
  // rationale}); the earlier memberKey→list maps made the model drop closing braces.
  if (!isRecord(value) || !exactKeys(value, ["icebreakers", "members", "rationale", "tableNumber", "theme"]) || !Array.isArray(value.members)) return null;
  const rows = value.members;
  if (!rows.every((row) => isRecord(row) && exactKeys(row, ["memberKey", "prompts", "rationale", "seat"]) && typeof row.memberKey === "string")) return null;
  const keys = rows.map((row) => (row as Record<string, unknown>).memberKey as string);
  if (keys.length !== idOfKey.size || new Set(keys).size !== keys.length || !keys.every((key) => idOfKey.has(key))) return null;
  const byId = (pickField: (row: Record<string, unknown>) => unknown) =>
    Object.fromEntries((rows as Record<string, unknown>[]).map((row) => [idOfKey.get(row.memberKey as string)!, pickField(row)]));
  return {
    icebreakers: value.icebreakers,
    memberPrompts: byId((row) => row.prompts),
    memberRationales: byId((row) => row.rationale),
    members: (rows as Record<string, unknown>[]).map((row) => ({ participantId: idOfKey.get(row.memberKey as string)!, seat: row.seat })),
    rationale: value.rationale,
    tableNumber: value.tableNumber,
    theme: value.theme,
  };
}

/** Paired table document → one single-language table per language, in the original shape. */
export function splitTrilingualTable(value: unknown): Record<TextLanguage, unknown> | null {
  if (!trilingualTableSentences(value)) return null;
  const table = value as Record<string, unknown>;
  return Object.fromEntries(TEXT_LANGUAGES.map((language) => [language, {
    icebreakers: (table.icebreakers as unknown[]).map((sentence) => pick(sentence, language)),
    memberPrompts: Object.fromEntries(Object.entries(table.memberPrompts as Record<string, unknown[]>).map(([id, prompts]) => [id, prompts.map((sentence) => pick(sentence, language))])),
    memberRationales: Object.fromEntries(Object.entries(table.memberRationales as Record<string, unknown>).map(([id, sentence]) => [id, pick(sentence, language)])),
    members: table.members,
    rationale: pick(table.rationale, language),
    tableNumber: table.tableNumber,
    theme: pick(table.theme, language),
  }])) as Record<TextLanguage, unknown>;
}

export function mergeTrilingualTable(tables: Readonly<Record<TextLanguage, EventOperationsTable>>): EventOperationsTable {
  return {
    ...tables.zh,
    i18n: Object.fromEntries(TEXT_LANGUAGES.map((language) => {
      const table = tables[language];
      return [language, { icebreakers: table.icebreakers, memberPrompts: table.memberPrompts, memberRationales: table.memberRationales, rationale: table.rationale, theme: table.theme }];
    })) as NonNullable<EventOperationsTable["i18n"]>,
  };
}

/** Two sources x 4 recommendations x three languages stays well under the 8192-token output cap. */
export const TRILINGUAL_MAX_RECOMMENDATION_SHARD = 2;

const TRILINGUAL_INSTRUCTION = `Every natural-language sentence is one object {"ja":"...","zh":"...","en":"..."}: ja natural Japanese, zh idiomatic Simplified Chinese, en natural English. The three are the same sentence in three languages: decide once, then write that one sentence three times. Never write a participant's name or company name yourself, in any language: refer to a person only as {KEY} and to their company only as {KEY:company}, using the supplied keys exactly (for example {S1C2} or {M3:company}); the server inserts the registered name. Participant profiles may be written in any language: translate every profile term (needs, offers, industry, topics, roles, highlights) into the language of the value you are writing, so an en value contains no Chinese or Japanese characters and a ja value reads as Japanese. Write every number with Arabic digits in all three languages (for example 100万 / 100万 / 1 million, 3社 / 3家 / 3 companies). Keep keys, ids, numbers, and JSON syntax unchanged.`;

const systemInstruction = `You are Orbit's event operations matching model.
Return exactly one JSON document and no markdown, explanation, code fences, or trailing text.
Treat every documented object as a closed schema: never add keys and never omit required keys.
Use only the supplied source, deterministic shortlist, validated recommendation, assignment, and feature evidence.
Never invent participant ids, never use hidden identities, and never substitute a deterministic content fallback.`;

export const EVENT_OPERATIONS_AI_PROMPT_VERSION =
  "event-operations-tokenized-recommendations-v11-chinese-ai-repair";
const DEDUPLICATED_RECOMMENDATION_PROMPT_VERSION =
  "event-operations-tokenized-recommendations-v12-chinese-ai-repair";

function requestFingerprint(
  config: GeminiOrbitAgentProviderConfig | undefined,
  recommendationPromptEncoding: "expanded" | "deduplicated" = "expanded",
  retryableJsonFailureShapes: readonly EventOperationsJsonFailureShape[] = [],
  outputLanguage: "en" | "zh-CN" = "zh-CN",
  enforceOutputLanguage = false,
  trilingual = false,
): string {
  // 与 runOrbitAgentModelText 内部的 provider 选择保持一致（含未设置
  // ORBIT_AGENT_PROVIDER 时按已配置 key 自动选择），否则缓存 fingerprint 会记错 provider。
  const { provider } = resolveOrbitAgentModelProviderSelection({
    configuredProvider: config?.provider,
  });
  const model =
    config?.model ??
    (provider === "deepseek"
      ? process.env.ORBIT_DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL
      : provider === "openai"
        ? process.env.ORBIT_OPENAI_MODEL ?? DEFAULT_OPENAI_ORBIT_AGENT_MODEL
        : process.env.ORBIT_GEMINI_MODEL ?? DEFAULT_GEMINI_ORBIT_AGENT_MODEL);
  const temperature =
    provider === "deepseek" &&
    typeof config?.temperature === "number" &&
    Number.isFinite(config.temperature) &&
    config.temperature >= 0 &&
    config.temperature <= 2
      ? config.temperature
      : null;
  const fingerprint = {
    groupingPromptVersion: "event-operations-tokenized-grouping-v7-chinese-ai-repair",
    jsonOutput: config?.jsonOutput === true,
    maxTokens: config?.maxTokens ?? null,
    model,
    naturalLanguagePolicy: enforceOutputLanguage
      ? "strict-zh-latin-ai-repair-v2"
      : "prompt-only",
    outputLanguage,
    promptVersion: recommendationPromptEncoding === "deduplicated"
      ? DEDUPLICATED_RECOMMENDATION_PROMPT_VERSION
      : EVENT_OPERATIONS_AI_PROMPT_VERSION,
    provider,
    thinking: config?.deepseekThinking ?? null,
    temperature,
    responseSchema: "event-operations-tokenized-recommendations-v1",
    // 2026-11-22: only present when on, so single-language fingerprints are unchanged.
    ...(trilingual ? { participantTextLanguages: "ja-zh-en-v8-scoped" } : {}),
  };
  return JSON.stringify(
    recommendationPromptEncoding === "deduplicated" ||
      retryableJsonFailureShapes.length > 0
      ? {
          ...fingerprint,
          ...(recommendationPromptEncoding === "deduplicated"
            ? { recommendationPromptEncoding }
            : {}),
          ...(retryableJsonFailureShapes.length > 0
            ? { retryableJsonFailureShapes }
            : {}),
        }
      : fingerprint,
  );
}

const supportedRetryableJsonFailureShapes = new Set<EventOperationsJsonFailureShape>([
  "empty",
  "parse_syntax",
  "unterminated_envelope",
]);

function normalizeRetryableJsonFailureShapes(
  shapes: readonly EventOperationsJsonFailureShape[],
): readonly EventOperationsJsonFailureShape[] {
  return [...new Set(shapes)]
    .filter((shape) => supportedRetryableJsonFailureShapes.has(shape))
    .sort();
}

function compactParticipant(
  participant: import("./contract").EventOperationsParticipant,
) {
  return {
    company: participant.company,
    displayName: participant.displayName,
    energyStyle: participant.energyStyle,
    experienceHighlight: participant.experienceHighlight,
    industry: participant.industry,
    languages: participant.languages,
    needs: participant.needs,
    offers: participant.offers,
    participantId: participant.participantId,
    profileCompleteness: participant.profileCompleteness,
    profileAnswers: participant.profileAnswers ?? {},
    role: participant.role,
    seniority: participant.seniority,
    topics: participant.topics,
  };
}

function compactRecommendationSources(
  sources: Parameters<
    EventOperationsAiProvider["generateRecommendations"]
  >[0]["sources"],
  recommendationPromptEncoding: "expanded" | "deduplicated" = "expanded",
  omitNames = false,
): {
  promptSources: unknown;
  tokenSources: readonly TokenizedRecommendationSource[];
} {
  // Trilingual (2026-11-22): the model never sees names, so it cannot write a variant of one;
  // it refers to people as {S1} / {S1C1} and the server inserts the registered name by id.
  const compactParticipantWithoutId = (participant: import("./contract").EventOperationsParticipant) => {
    const profile = compactParticipantWithoutIdFull(participant);
    if (!omitNames) return profile;
    const { company: _company, displayName: _name, ...rest } = profile;
    return { ...rest, hasCompany: registeredCompany(participant) !== null };
  };
  const tokenSources: TokenizedRecommendationSource[] = [];
  const promptSources = sources.map((source, sourceIndex) => {
    const sourceKey = `S${sourceIndex + 1}`;
    const candidateIdByKey = new Map<string, string>();
    const candidateParticipants = source.candidateParticipants.map((candidate, candidateIndex) => {
      const candidateKey = `${sourceKey}C${candidateIndex + 1}`;
      candidateIdByKey.set(candidateKey, candidate.participantId);
      return {
        candidateKey,
        profile: compactParticipantWithoutId(candidate),
      };
    });
    tokenSources.push({
      candidateIdByKey,
      sourceKey,
      sourceParticipantId: source.sourceParticipant.participantId,
    });
    return {
      candidateParticipants,
      sourceKey,
      sourceProfile: compactParticipantWithoutId(source.sourceParticipant),
    };
  });
  if (recommendationPromptEncoding === "expanded") return { promptSources, tokenSources };
  const profileKeyByParticipantId = new Map<string, string>();
  const profiles: unknown[] = [];
  const profileKey = (participant: import("./contract").EventOperationsParticipant) => {
    const existing = profileKeyByParticipantId.get(participant.participantId);
    if (existing) return existing;
    const key = `P${profileKeyByParticipantId.size + 1}`;
    profileKeyByParticipantId.set(participant.participantId, key);
    profiles.push({ profile: compactParticipantWithoutId(participant), profileKey: key });
    return key;
  };
  for (const source of sources) profileKey(source.sourceParticipant);
  for (const source of sources) {
    for (const candidate of source.candidateParticipants) profileKey(candidate);
  }
  return {
    promptSources: {
      profiles,
      sources: sources.map((source, sourceIndex) => {
        const sourceKey = `S${sourceIndex + 1}`;
        return {
          candidateParticipants: source.candidateParticipants.map((candidate, candidateIndex) => ({
            candidateKey: `${sourceKey}C${candidateIndex + 1}`,
            profileKey: profileKeyByParticipantId.get(candidate.participantId)!,
          })),
          sourceKey,
          sourceProfileKey: profileKeyByParticipantId.get(source.sourceParticipant.participantId)!,
        };
      }),
    },
    tokenSources,
  };
}

function compactParticipantWithoutIdFull(
  participant: import("./contract").EventOperationsParticipant,
) {
  const { participantId: _participantId, ...profile } = compactParticipant(participant);
  return profile;
}

function mapTokenRecommendationRows(
  rows: readonly TokenRecommendationRow[],
  tokenSources: readonly TokenizedRecommendationSource[],
): readonly EventOperationsParticipantRecommendations[] | null {
  if (rows.length !== tokenSources.length) return null;
  const sourceByKey = new Map(tokenSources.map((source) => [source.sourceKey, source]));
  const seenSources = new Set<string>();
  const mapped: EventOperationsParticipantRecommendations[] = [];
  for (const row of rows) {
    const source = sourceByKey.get(row.sourceKey);
    if (!source || seenSources.has(row.sourceKey)) return null;
    seenSources.add(row.sourceKey);
    const seenTargets = new Set<string>();
    const recommendations = [];
    for (const recommendation of row.recommendations) {
      const targetParticipantId = source.candidateIdByKey.get(recommendation.targetCandidateKey);
      if (!targetParticipantId || seenTargets.has(recommendation.targetCandidateKey)) return null;
      seenTargets.add(recommendation.targetCandidateKey);
      recommendations.push({
        icebreakers: recommendation.icebreakers,
        memberHint: recommendation.memberHint,
        rank: recommendation.rank,
        reasons: recommendation.reasons,
        score: recommendation.score,
        targetParticipantId,
      });
    }
    mapped.push({
      noMatchReason: row.noMatchReason,
      recommendations,
      sourceParticipantId: source.sourceParticipantId,
    });
  }
  if (seenSources.size !== sourceByKey.size) return null;
  return mapped;
}

function compactGroupingSources(
  sources: Parameters<
    EventOperationsAiProvider["generateGroupingFeatures"]
  >[0]["sources"],
): { prompt: unknown; tokenSources: readonly TokenizedGroupingSource[] } {
  const profileKeyByParticipantId = new Map<string, string>();
  const profiles: unknown[] = [];
  const profileKey = (participant: import("./contract").EventOperationsParticipant) => {
    const existing = profileKeyByParticipantId.get(participant.participantId);
    if (existing) return existing;
    const key = `P${profileKeyByParticipantId.size + 1}`;
    profileKeyByParticipantId.set(participant.participantId, key);
    profiles.push({ profile: compactParticipantWithoutIdFull(participant), profileKey: key });
    return key;
  };
  const tokenSources: TokenizedGroupingSource[] = [];
  const promptSources = sources.map((source, sourceIndex) => {
    const sourceKey = `S${sourceIndex + 1}`;
    const candidateKeyByParticipantId = new Map<string, string>();
    const candidateIdByKey = new Map<string, string>();
    const candidateParticipants = source.candidateParticipants.map((candidate, candidateIndex) => {
      const candidateKey = `${sourceKey}C${candidateIndex + 1}`;
      candidateKeyByParticipantId.set(candidate.participantId, candidateKey);
      candidateIdByKey.set(candidateKey, candidate.participantId);
      return { candidateKey, profileKey: profileKey(candidate) };
    });
    tokenSources.push({ candidateIdByKey, sourceKey, sourceParticipantId: source.sourceParticipant.participantId });
    return {
      candidateParticipants,
      recommendations: {
        noMatchReason: source.recommendations.noMatchReason,
        recommendations: source.recommendations.recommendations.map((recommendation) => ({
          ...recommendation,
          targetCandidateKey: candidateKeyByParticipantId.get(recommendation.targetParticipantId),
          targetParticipantId: undefined,
        })),
      },
      sourceKey,
      sourceProfileKey: profileKey(source.sourceParticipant),
    };
  });
  return { prompt: { profiles, sources: promptSources }, tokenSources };
}

function mapTokenGroupingFeatures(
  features: readonly TokenGroupingFeature[],
  tokenSources: readonly TokenizedGroupingSource[],
  maxAffinityCount: number,
): readonly EventOperationsGroupingFeature[] | null {
  if (features.length !== tokenSources.length) return null;
  const sourceByKey = new Map(tokenSources.map((source) => [source.sourceKey, source]));
  const seenSources = new Set<string>();
  const mapped: EventOperationsGroupingFeature[] = [];
  for (const feature of features) {
    const source = sourceByKey.get(feature.sourceKey);
    if (!source || seenSources.has(feature.sourceKey) || feature.affinityCandidateKeys.length > maxAffinityCount) return null;
    seenSources.add(feature.sourceKey);
    const affinityParticipantIds: string[] = [];
    const seenAffinity = new Set<string>();
    for (const candidateKey of feature.affinityCandidateKeys) {
      const participantId = source.candidateIdByKey.get(candidateKey);
      if (!participantId || seenAffinity.has(candidateKey)) return null;
      seenAffinity.add(candidateKey);
      affinityParticipantIds.push(participantId);
    }
    mapped.push({ affinityParticipantIds, facilitationHint: feature.facilitationHint, participantId: source.sourceParticipantId, primaryTopic: feature.primaryTopic, secondaryTopic: feature.secondaryTopic });
  }
  return seenSources.size === sourceByKey.size ? mapped : null;
}

export function createEventOperationsAiProvider({
  config,
  enforceOutputLanguage = false,
  outputLanguage = "zh-CN",
  recommendationPromptEncoding = "expanded",
  retryableJsonFailureShapes = [],
  runModelText = runOrbitAgentModelText,
  trilingual = false,
  onTrilingualFailureText,
}: EventOperationsAiProviderOptions = {}): EventOperationsAiProvider {
  const effectiveRetryableJsonFailureShapes =
    normalizeRetryableJsonFailureShapes(retryableJsonFailureShapes);
  const retryableJsonFailureShapeSet = new Set(
    effectiveRetryableJsonFailureShapes,
  );
  const effectiveSystemInstruction = `${systemInstruction}\n${outputLanguage === "zh-CN"
    ? "Write every natural-language output value in idiomatic Simplified Chinese, including reasons, hints, topics, themes, rationales, icebreakers, member prompts, and no-match explanations. Translate ordinary source wording into natural Chinese instead of copying English fragments. Latin text is allowed only for participant names, organization or product proper names, ids, and this exact technical whitelist: AI, SaaS, KPI, API, B2B, LP, IP, CEO, Scope 3. Translate every other English common noun; for example, translate copilot as 智能助手 and investment-ready as 具备投资条件. Keep keys, numbers, and JSON syntax unchanged."
    : "Write every natural-language output value in English. Keep ids, keys, numbers, and JSON syntax unchanged."}`;
  const trilingualSystemInstruction = `${systemInstruction}\n${TRILINGUAL_INSTRUCTION}\nFor the zh values: keep upper-case abbreviations as written (for example AI, DX, VC, IPO, M&A, LLM, ESG) and these terms: SaaS, Web3, EdTech, FinTech, PoC; translate every other English word into natural Chinese.`;
  const metadataOf = (response: { responseMetadata?: Parameters<typeof toEventOperationsMetadata>[0] }) =>
    response.responseMetadata ? toEventOperationsMetadata(response.responseMetadata) : undefined;
  /** Shape-only stderr line (no model text); the raw text goes only to the opt-in calibration hook. */
  function trilingualFailure<TValue>(input: { kind: "recommendations" | "table" | "repair"; stage: string; text: string; result: EventOperationsAiResult<TValue> }): EventOperationsAiResult<TValue> {
    process.stderr.write(`${JSON.stringify({ event: "event_operations_trilingual_failure", kind: input.kind, stage: input.stage, textLength: input.text.length })}\n`);
    onTrilingualFailureText?.({ kind: input.kind, stage: input.stage, text: input.text });
    return input.result;
  }

  /**
   * Check → (at most one repair of the flagged languages of flagged sentences) → the same full check again.
   * The repair rewrites a flagged language from a language of the same sentence that passed, keeps every
   * placeholder, and can never touch structure, people, ranks, or scores. Anything still wrong fails the batch.
   */
  async function checkAndRepair(input: {
    kind: "recommendations" | "table";
    metadata: EventOperationsAiResponseMetadata | undefined;
    participants: readonly import("./contract").EventOperationsParticipant[];
    scoped: readonly ScopedSentence[];
    text: string;
  }): Promise<{ ok: true; metadata: EventOperationsAiResponseMetadata | undefined } | { ok: false; result: EventOperationsAiResult<never> }> {
    const first = checkScopedSentences(input.scoped, input.participants);
    if (first.structural.length) {
      return { ok: false, result: trilingualFailure({ kind: input.kind, stage: `check_${first.structural[0]!.split("@")[0]}`, text: input.text, result: trilingualRetryable<never>(`Trilingual output failed: ${[...new Set(first.structural.map((item) => item.split("@")[0]))].join(", ")}.`, input.metadata) }) };
    }
    if (first.flagged.length === 0) return { ok: true, metadata: input.metadata };
    const request = first.flagged.map(({ index, languages }, position) => {
      const sentence = input.scoped[index]!.sentence;
      const source = (["zh", "ja", "en"] as const).find((language) => !languages.includes(language));
      return { id: `s${position + 1}`, index, rewrite: languages, source, ...(source ? { source_text: sentence[source] } : {}), ...Object.fromEntries(languages.map((language) => [`current_${language}`, sentence[language]])) };
    });
    if (request.some((item) => !item.source)) {
      return { ok: false, result: trilingualFailure({ kind: input.kind, stage: "all_languages_flagged", text: input.text, result: invalidOutputLanguage<never>(input.metadata) }) };
    }
    const response = await runModelText({
      config,
      systemInstruction: `${systemInstruction}\nYou are performing one bounded AI-only language repair of event networking sentences. Rewrite only the requested languages of each sentence from its source_text, which is the same sentence in another language: ja in natural Japanese, zh in idiomatic Simplified Chinese, en in natural English with no Chinese or Japanese characters. Keep every {…} placeholder exactly as it appears in source_text, keep every number, and never write a person's or company's name. Never add, remove, or change facts.`,
      userText: `Return exactly {"sentences":{"<id>":{<each requested language>:"..."}}} for every id below, with exactly the requested language keys and nothing else.\n${JSON.stringify(request.map(({ index: _index, ...item }) => item))}`,
    });
    if (response.success === false) {
      const failure = modelFailure<never>(response);
      const merged = mergeEventOperationsResponseMetadata(input.metadata, failure.success === false ? failure.responseMetadata : undefined);
      return { ok: false, result: failure.success === false ? { ...failure, ...(merged ? { responseMetadata: merged } : {}) } : failure };
    }
    const metadata = mergeEventOperationsResponseMetadata(input.metadata, metadataOf(response));
    const json = parseJson(response.text);
    const rows = isRecord(json) && exactKeys(json, ["sentences"]) && isRecord(json.sentences) ? json.sentences : null;
    const valid = rows !== null && Object.keys(rows).length === request.length && request.every((item) => {
      const row = rows[item.id];
      return isRecord(row) && exactKeys(row, [...item.rewrite]) && item.rewrite.every((language) => nonEmptyString(row[language]));
    });
    const repairText = JSON.stringify({ request: request.map(({ index: _index, ...item }) => item), response: response.text });
    if (!valid) return { ok: false, result: trilingualFailure({ kind: "repair", stage: "repair_schema", text: repairText, result: invalidOutputLanguage<never>(metadata) }) };
    for (const item of request) {
      const row = rows![item.id] as Record<string, string>;
      for (const language of item.rewrite) (input.scoped[item.index]!.sentence as Record<TextLanguage, string>)[language] = row[language]!.trim();
    }
    const second = checkScopedSentences(input.scoped, input.participants);
    if (second.structural.length || second.flagged.length) {
      return { ok: false, result: trilingualFailure({ kind: "repair", stage: "after_repair", text: repairText, result: invalidOutputLanguage<never>(metadata) }) };
    }
    process.stderr.write(`${JSON.stringify({ event: "event_operations_trilingual_repaired", kind: input.kind, sentences: request.length })}\n`);
    return { ok: true, metadata };
  }

  async function trilingualRecommendations(input: Parameters<EventOperationsAiProvider["generateRecommendations"]>[0]): ReturnType<EventOperationsAiProvider["generateRecommendations"]> {
    const tokenizedSources = compactRecommendationSources(input.sources, recommendationPromptEncoding, true);
    const participants = input.sources.flatMap((source) => [source.sourceParticipant, ...source.candidateParticipants]);
    const participantByKey = new Map<string, import("./contract").EventOperationsParticipant>();
    tokenizedSources.tokenSources.forEach((token, index) => {
      const source = input.sources[index]!;
      participantByKey.set(token.sourceKey, source.sourceParticipant);
      const candidateById = new Map(source.candidateParticipants.map((candidate) => [candidate.participantId, candidate]));
      for (const [key, id] of token.candidateIdByKey) participantByKey.set(key, candidateById.get(id)!);
    });
    const response = await runModelText({
      config,
      systemInstruction: trilingualSystemInstruction,
      userText: `Generate networking recommendations for this bounded source shard. Every sentence is a {"ja","zh","en"} object.

Requirements:
- Return one row for every supplied sourceKey and no other sourceKey; use every sourceKey exactly once.
- Select targetCandidateKey only from that sourceKey's deterministic candidateParticipants shortlist; never reuse a targetCandidateKey within a source.
- Return at most ${input.recommendationCount} unique targets per source, ordered with rank 1..N; never recommend the source itself.
- score is 0..100; reasons is a non-empty list of sentences; icebreakers is exactly 2 sentences; memberHint is one specific sentence.
- noMatchReason is required: null when recommendations is non-empty, otherwise one concrete sentence.
- In a recommendation, the only people you may refer to are that row's person {<sourceKey>} (for example {S1}) and that recommendation's target {<targetCandidateKey>} (for example {S1C2}); a company only as {<same key>:company} next to that person, and only when that profile has hasCompany=true. noMatchReason may refer only to {<sourceKey>}.
- The three languages of a sentence use exactly the same placeholders and the same numbers.
- Every object must contain exactly the documented keys.
${strictChineseOutputRequirement(participants).replace("Every natural-language value", "Every zh value")}
${recommendationPromptEncoding === "deduplicated" ? "- Resolve sourceProfileKey and each candidate profileKey from the supplied profiles lookup before making a recommendation.\n" : ""}
JSON shape:
{"recommendations":[{"sourceKey":"S1","noMatchReason":null,"recommendations":[{"targetCandidateKey":"S1C1","rank":1,"score":90,"reasons":[{"ja":"理由","zh":"理由","en":"reason"}],"icebreakers":[{"ja":"質問1","zh":"问题1","en":"question 1"},{"ja":"質問2","zh":"问题2","en":"question 2"}],"memberHint":{"ja":"{S1}さんは{S1C1}さんと…","zh":"{S1}可以和{S1C1}…","en":"{S1} could ask {S1C1} …"}}]}]}

Event id: ${input.eventId}
Sources and deterministic shortlists:
${JSON.stringify(tokenizedSources.promptSources)}`,
    });
    if (response.success === false) return modelFailure(response);
    let metadata = metadataOf(response);
    const json = parseJson(response.text);
    if (json === null) {
      const shape = classifyJsonFailureShape(response.text);
      return trilingualFailure({ kind: "recommendations", stage: `json_${shape}`, text: response.text, result: invalidJson(shape, metadata, retryableJsonFailureShapeSet) });
    }
    // 1. Structure first (every row and item is a well-formed record) — nothing below touches unchecked values.
    if (!trilingualRecommendationSentences(json)) return trilingualFailure({ kind: "recommendations", stage: "paired_schema", text: response.text, result: trilingualRetryable("The model JSON did not match the trilingual recommendation schema.", metadata) });
    const rows = (json as { recommendations: Array<Record<string, unknown>> }).recommendations;
    // 2. A target recommended twice in one row: keep the first, renumber ranks ("at most N" contract; no text invented).
    for (const row of rows) {
      const seen = new Set<unknown>();
      row.recommendations = (row.recommendations as Array<Record<string, unknown>>)
        .filter((item) => (seen.has(item.targetCandidateKey) ? false : (seen.add(item.targetCandidateKey), true)))
        .map((item, index) => ({ ...item, rank: index + 1 }));
    }
    // 3. Scope every sentence to its row's source and its own target; {SOURCE} is the row's source.
    const scoped: ScopedSentence[] = [];
    for (const row of rows) {
      const sourceKey = String(row.sourceKey);
      const own = (sentence: TrilingualSentence, allowed: ReadonlySet<string>) => {
        // Only S-keys exist here, so a key that lost its prefix ({2C11}, {1}) is unambiguous; scope is still checked.
        for (const language of TEXT_LANGUAGES) (sentence as Record<TextLanguage, string>)[language] = normalizePlaceholders(sentence[language])
          .replace(/\{SOURCE(:company)?\}/gu, (_match, company?: string) => `{${sourceKey}${company ?? ""}}`)
          .replace(/\{(\d+(?:C\d+)?)(:company)?\}/gu, (_match, key: string, company?: string) => `{S${key}${company ?? ""}}`);
        scoped.push({ allowed, sentence });
      };
      if (row.noMatchReason !== null) own(row.noMatchReason as TrilingualSentence, new Set([sourceKey]));
      for (const item of row.recommendations as Array<Record<string, unknown>>) {
        const allowed = new Set([sourceKey, String(item.targetCandidateKey)]);
        for (const sentence of [...(item.reasons as TrilingualSentence[]), ...(item.icebreakers as TrilingualSentence[]), item.memberHint as TrilingualSentence]) own(sentence, allowed);
      }
    }
    // 4. Full check → at most one repair → full check again.
    const checked = await checkAndRepair({ kind: "recommendations", metadata, participants, scoped, text: response.text });
    if (checked.ok === false) return checked.result as never;
    metadata = checked.metadata;
    // 5. Names last: every placeholder is now known and in scope; insert the registered name / company by id.
    if (fillParticipantPlaceholders(scoped.map((item) => item.sentence), participantByKey).length) {
      return trilingualFailure({ kind: "recommendations", stage: "fill", text: response.text, result: trilingualRetryable("A placeholder had no registered value.", metadata) });
    }
    // 6. The original closed schema per language (shortlist membership, ranks, counts), then merge (base = zh).
    const split = splitTrilingualRecommendations(json)!;
    const mapped = {} as Record<TextLanguage, readonly EventOperationsParticipantRecommendations[]>;
    for (const language of TEXT_LANGUAGES) {
      const tokenRows = parseTokenRecommendationRows(split[language]);
      const mappedRows = tokenRows ? mapTokenRecommendationRows(tokenRows, tokenizedSources.tokenSources) : null;
      if (!mappedRows) return trilingualFailure({ kind: "recommendations", stage: "closed_schema", text: response.text, result: trilingualRetryable("The recommendations did not match the closed schema.", metadata) });
      mapped[language] = mappedRows;
    }
    return { data: mergeTrilingualRecommendations(mapped), model: response.model, provider: response.provider, ...(metadata ? { responseMetadata: metadata } : {}), success: true };
  }

  async function trilingualTable(input: Parameters<EventOperationsAiProvider["generateTableContent"]>[0]): ReturnType<EventOperationsAiProvider["generateTableContent"]> {
    const memberIds = new Set(input.members.map((member) => member.participantId));
    // Short member keys (M1..Mn) instead of long participant ids; the server maps them back.
    const keyOf = new Map(input.members.map((member, index) => [member.participantId, `M${index + 1}`]));
    const idOfKey = new Map([...keyOf].map(([id, key]) => [key, id]));
    const promptMembers = input.members.map((member) => {
      const { company: _company, displayName: _name, participantId: _id, ...rest } = compactParticipant(member);
      return { hasCompany: registeredCompany(member) !== null, memberKey: keyOf.get(member.participantId)!, ...rest };
    });
    // Feature text came from the recommendation stage and may mention its keys (S5, S5C1); removed here.
    const withoutStageKeys = (text: string) => text.replace(/\{?\bS\d+(?:C\d+)?\b\}?/gu, "").replace(/\s{2,}/gu, " ").trim();
    const promptFeatures = input.features.map((feature) => ({
      ...feature,
      affinityParticipantIds: feature.affinityParticipantIds.flatMap((id) => (keyOf.has(id) ? [keyOf.get(id)!] : [])),
      facilitationHint: withoutStageKeys(feature.facilitationHint),
      participantId: keyOf.get(feature.participantId) ?? feature.participantId,
      primaryTopic: withoutStageKeys(feature.primaryTopic),
      secondaryTopic: withoutStageKeys(feature.secondaryTopic),
    }));
    const keys = [...idOfKey.keys()];
    const response = await runModelText({
      config,
      systemInstruction: trilingualSystemInstruction,
      userText: `Generate content for exactly one already-assigned event table. Every sentence is a {"ja","zh","en"} object.

Requirements:
- Keep tableNumber=${input.tableNumber}. members has exactly one row for each supplied memberKey (${keys.join(", ")}) and no other key, each with a unique seat.
- round ${input.roundNumber} content must use the supplied bounded features and member profiles.
- A concrete theme, an evidence-based table rationale, and exactly 3 icebreakers for the table; in every member row, exactly 2 prompts for that person and one specific rationale explaining why that person belongs at this table.
- The only placeholders that exist here are ${keys.map((key) => `{${key}}`).join(", ")}; a company only as {Mn:company} next to {Mn}, and only when that member has hasCompany=true. The three languages of a sentence use exactly the same placeholders and the same numbers.
- Do not change membership. Every object must contain exactly the documented keys.
${strictChineseOutputRequirement(input.members).replace("Every natural-language value", "Every zh value")}

JSON shape:
{"tableNumber":${input.tableNumber},"theme":{"ja":"具体的なテーマ","zh":"具体主题","en":"specific theme"},"rationale":{"ja":"この卓の理由","zh":"同桌理由","en":"why these members work as a table"},"icebreakers":[{"ja":"一","zh":"一","en":"one"},{"ja":"二","zh":"二","en":"two"},{"ja":"三","zh":"三","en":"three"}],"members":[{"memberKey":"M1","seat":"R${input.roundNumber}-T${input.tableNumber}-S1","prompts":[{"ja":"問い1","zh":"问题1","en":"prompt one"},{"ja":"問い2","zh":"问题2","en":"prompt two"}],"rationale":{"ja":"{M1}さんがこの卓にいる理由","zh":"{M1}为何在这一桌","en":"why {M1} belongs here"}}]}

Event id: ${input.eventId}
Round: ${input.roundNumber}
Assigned members:
${JSON.stringify(promptMembers)}
Bounded validated grouping features:
${JSON.stringify(promptFeatures)}`,
    });
    if (response.success === false) return modelFailure(response);
    let metadata = metadataOf(response);
    const json = parseJson(response.text);
    if (json === null) {
      const shape = classifyJsonFailureShape(response.text);
      return trilingualFailure({ kind: "table", stage: `json_${shape}`, text: response.text, result: invalidJson(shape, metadata, retryableJsonFailureShapeSet) });
    }
    const keyed = tableFromMemberKeys(json, idOfKey);
    if (!keyed) return trilingualFailure({ kind: "table", stage: "member_keys", text: response.text, result: trilingualRetryable("The model table did not use exactly the supplied member keys.", metadata) });
    const sentences = trilingualTableSentences(keyed);
    if (!sentences) return trilingualFailure({ kind: "table", stage: "paired_schema", text: response.text, result: trilingualRetryable("The model JSON did not match the trilingual table schema.", metadata) });
    const allowed = new Set(keys);
    // Only M-keys exist at a table, so {3} is {M3}; scope is still checked.
    for (const sentence of sentences) for (const language of TEXT_LANGUAGES) (sentence as Record<TextLanguage, string>)[language] = normalizePlaceholders(sentence[language]).replace(/\{(\d+)(:company)?\}/gu, (_match, key: string, company?: string) => `{M${key}${company ?? ""}}`);
    const scoped = sentences.map((sentence) => ({ allowed, sentence }));
    const checked = await checkAndRepair({ kind: "table", metadata, participants: input.members, scoped, text: response.text });
    if (checked.ok === false) return checked.result as never;
    metadata = checked.metadata;
    const memberByKey = new Map(input.members.map((member) => [keyOf.get(member.participantId)!, member]));
    if (fillParticipantPlaceholders(sentences, memberByKey).length) {
      return trilingualFailure({ kind: "table", stage: "fill", text: response.text, result: trilingualRetryable("A placeholder had no registered value.", metadata) });
    }
    const split = splitTrilingualTable(keyed)!;
    const tables = {} as Record<TextLanguage, EventOperationsTable>;
    for (const language of TEXT_LANGUAGES) {
      const table = parseTable(split[language], memberIds);
      if (!table) return trilingualFailure({ kind: "table", stage: "closed_schema", text: response.text, result: trilingualRetryable("The table did not match the closed schema.", metadata) });
      tables[language] = table;
    }
    return { data: mergeTrilingualTable(tables), model: response.model, provider: response.provider, ...(metadata ? { responseMetadata: metadata } : {}), success: true };
  }

  return {
    requestFingerprint: requestFingerprint(
      config,
      recommendationPromptEncoding,
      effectiveRetryableJsonFailureShapes,
      outputLanguage,
      enforceOutputLanguage,
      trilingual,
    ),
    ...(trilingual ? { maxRecommendationShardSize: TRILINGUAL_MAX_RECOMMENDATION_SHARD } : {}),
    async generateRecommendations(input) {
      if (trilingual) return trilingualRecommendations(input);
      const tokenizedSources = compactRecommendationSources(input.sources, recommendationPromptEncoding);
      const participants = input.sources.flatMap((source) => [
        source.sourceParticipant,
        ...source.candidateParticipants,
      ]);
      const response = await runModelText({
        config,
        systemInstruction: effectiveSystemInstruction,
        userText: `Generate networking recommendations for this bounded source shard.

Requirements:
- Return one row for every supplied sourceKey and no other sourceKey; use every sourceKey exactly once.
- Select targetCandidateKey only from that sourceKey's deterministic candidateParticipants shortlist; never reuse a targetCandidateKey within a source.
- Return at most ${input.recommendationCount} unique targets per source, ordered with rank 1..N; never recommend the source itself.
- score is 0..100; reasons is non-empty; icebreakers has exactly 2 strings; memberHint is specific.
- noMatchReason is required: use null when recommendations is non-empty, otherwise a concrete non-empty reason.
- Every object must contain exactly the documented keys.
${enforceOutputLanguage && outputLanguage === "zh-CN" ? `${strictChineseOutputRequirement(participants)}\n` : ""}
${recommendationPromptEncoding === "deduplicated" ? "- Resolve sourceProfileKey and each candidate profileKey from the supplied profiles lookup before making a recommendation.\n" : ""}

JSON shape:
{"recommendations":[{"sourceKey":"S1","noMatchReason":null,"recommendations":[{"targetCandidateKey":"S1C1","rank":1,"score":90,"reasons":["reason 1","reason 2"],"icebreakers":["question 1","question 2"],"memberHint":"specific hint"}]}]}

Event id: ${input.eventId}
Sources and deterministic shortlists:
${JSON.stringify(tokenizedSources.promptSources)}`,
      });
      if (response.success === false) return modelFailure(response);
      const json = parseJson(response.text);
      if (json === null) return invalidJson(classifyJsonFailureShape(response.text), response.responseMetadata ? toEventOperationsMetadata(response.responseMetadata) : undefined, retryableJsonFailureShapeSet);
      const tokenRows = parseTokenRecommendationRows(json);
      if (!tokenRows) return invalidSchema(response.responseMetadata ? toEventOperationsMetadata(response.responseMetadata) : undefined);
      const rows = mapTokenRecommendationRows(tokenRows, tokenizedSources.tokenSources);
      if (!rows) return invalidSchema(response.responseMetadata ? toEventOperationsMetadata(response.responseMetadata) : undefined);
      const recommendationViolations =
        enforceOutputLanguage && outputLanguage === "zh-CN"
          ? collectChineseOutputPolicyViolations(
              recommendationNaturalLanguageValues(rows),
              participants,
            )
          : null;
      if (
        recommendationViolations &&
        (recommendationViolations.disallowedTokens.length > 0 ||
          recommendationViolations.untranslatedValues.length > 0)
      ) {
        return repairChineseNaturalLanguage({
          config,
          naturalLanguageFields:
            "noMatchReason, reasons, icebreakers, and memberHint",
          originalJson: json,
          originalResponseMetadata: response.responseMetadata
            ? toEventOperationsMetadata(response.responseMetadata)
            : undefined,
          participants,
          parseValue(value) {
            const repairedRows = parseTokenRecommendationRows(value);
            return repairedRows
              ? mapTokenRecommendationRows(
                  repairedRows,
                  tokenizedSources.tokenSources,
                )
              : null;
          },
          runModelText,
          values: recommendationNaturalLanguageValues,
          violations: recommendationViolations,
        });
      }
      return {
        data: rows,
        model: response.model,
        provider: response.provider,
        ...(response.responseMetadata
          ? { responseMetadata: toEventOperationsMetadata(response.responseMetadata) }
          : {}),
        success: true,
      };
    },

    async generateGroupingFeatures(input) {
      const tokenizedSources = compactGroupingSources(input.sources);
      const participants = input.sources.flatMap((source) => [
        source.sourceParticipant,
        ...source.candidateParticipants,
      ]);
      const response = await runModelText({
        config,
        systemInstruction: effectiveSystemInstruction,
        userText: `Extract bounded grouping features for this source shard.

Requirements:
- Return one feature for every supplied sourceKey and no other sourceKey.
- affinityCandidateKeys contains at most ${input.maxAffinityCount} unique keys and only keys from that sourceKey's deterministic shortlist.
- Resolve sourceProfileKey and candidate profileKey from the profiles lookup; never output participant ids.
- primaryTopic, secondaryTopic, and facilitationHint must be concrete and evidence-backed.
- Every object must contain exactly the documented keys.
${enforceOutputLanguage && outputLanguage === "zh-CN" ? `${strictChineseOutputRequirement(participants)}\n` : ""}

JSON shape:
{"features":[{"sourceKey":"S1","primaryTopic":"specific topic","secondaryTopic":"specific topic","affinityCandidateKeys":["S1C1"],"facilitationHint":"specific facilitation hint"}]}

Event id: ${input.eventId}
Bounded sources, shortlists, and validated recommendations:
${JSON.stringify(tokenizedSources.prompt)}`,
      });
      if (response.success === false) return modelFailure(response);
      const json = parseJson(response.text);
      if (json === null) return invalidJson(classifyJsonFailureShape(response.text), response.responseMetadata ? toEventOperationsMetadata(response.responseMetadata) : undefined, retryableJsonFailureShapeSet);
      const tokenFeatures = parseTokenGroupingFeatures(json);
      if (!tokenFeatures) return invalidSchema(response.responseMetadata ? toEventOperationsMetadata(response.responseMetadata) : undefined);
      const features = mapTokenGroupingFeatures(tokenFeatures, tokenizedSources.tokenSources, input.maxAffinityCount);
      if (!features) return invalidSchema(response.responseMetadata ? toEventOperationsMetadata(response.responseMetadata) : undefined);
      const groupingViolations =
        enforceOutputLanguage && outputLanguage === "zh-CN"
          ? collectChineseOutputPolicyViolations(
              groupingNaturalLanguageValues(features),
              participants,
            )
          : null;
      if (
        groupingViolations &&
        (groupingViolations.disallowedTokens.length > 0 ||
          groupingViolations.untranslatedValues.length > 0)
      ) {
        return repairChineseNaturalLanguage({
          config,
          naturalLanguageFields:
            "primaryTopic, secondaryTopic, and facilitationHint",
          originalJson: json,
          originalResponseMetadata: response.responseMetadata
            ? toEventOperationsMetadata(response.responseMetadata)
            : undefined,
          participants,
          parseValue(value) {
            const repairedFeatures = parseTokenGroupingFeatures(value);
            return repairedFeatures
              ? mapTokenGroupingFeatures(
                  repairedFeatures,
                  tokenizedSources.tokenSources,
                  input.maxAffinityCount,
                )
              : null;
          },
          runModelText,
          values: groupingNaturalLanguageValues,
          violations: groupingViolations,
        });
      }
      return {
        data: features,
        model: response.model,
        provider: response.provider,
        ...(response.responseMetadata
          ? { responseMetadata: toEventOperationsMetadata(response.responseMetadata) }
          : {}),
        success: true,
      };
    },

    async generateTableContent(input) {
      if (trilingual) return trilingualTable(input);
      const response = await runModelText({
        config,
        systemInstruction: effectiveSystemInstruction,
        userText: `Generate content for exactly one already-assigned event table.

Requirements:
- Keep tableNumber=${input.tableNumber}; return every supplied member exactly once and no other id.
- round ${input.roundNumber} content must use the supplied bounded features and member profiles.
- Return a concrete theme, evidence-based table rationale, exactly 3 icebreakers, one unique seat per member, exactly 2 memberPrompts under every member id, and one specific memberRationale under every member id explaining why that person belongs at this table.
- members, memberPrompts, and memberRationales must each cover exactly the supplied member ids: no missing, duplicate, unknown, or extra member id.
- Do not change membership. Every object must contain exactly the documented keys.
${enforceOutputLanguage && outputLanguage === "zh-CN" ? `${strictChineseOutputRequirement(input.members)}\n` : ""}

JSON shape:
{"tableNumber":${input.tableNumber},"theme":"specific theme","rationale":"why these assigned members work as a table","icebreakers":["one","two","three"],"members":[{"participantId":"id","seat":"R${input.roundNumber}-T${input.tableNumber}-S1"}],"memberPrompts":{"id":["prompt one","prompt two"]},"memberRationales":{"id":"why this specific member belongs at this table, grounded in supplied profile and grouping features"}}

Event id: ${input.eventId}
Round: ${input.roundNumber}
Assigned members:
${JSON.stringify(input.members.map(compactParticipant))}
Bounded validated grouping features:
${JSON.stringify(input.features)}`,
      });
      if (response.success === false) return modelFailure(response);
      const json = parseJson(response.text);
      if (json === null) return invalidJson(classifyJsonFailureShape(response.text), response.responseMetadata ? toEventOperationsMetadata(response.responseMetadata) : undefined, retryableJsonFailureShapeSet);
      const table = parseTable(
        json,
        new Set(input.members.map((member) => member.participantId)),
      );
      if (!table) return invalidSchema(response.responseMetadata ? toEventOperationsMetadata(response.responseMetadata) : undefined);
      const tableViolations =
        enforceOutputLanguage && outputLanguage === "zh-CN"
          ? collectChineseOutputPolicyViolations(
              tableNaturalLanguageValues(table),
              input.members,
            )
          : null;
      if (
        tableViolations &&
        (tableViolations.disallowedTokens.length > 0 ||
          tableViolations.untranslatedValues.length > 0)
      ) {
        return repairChineseNaturalLanguage({
          config,
          naturalLanguageFields:
            "theme, rationale, icebreakers, memberPrompts, and memberRationales",
          originalJson: json,
          originalResponseMetadata: response.responseMetadata
            ? toEventOperationsMetadata(response.responseMetadata)
            : undefined,
          participants: input.members,
          parseValue(value) {
            return parseTable(
              value,
              new Set(input.members.map((member) => member.participantId)),
            );
          },
          runModelText,
          values: tableNaturalLanguageValues,
          violations: tableViolations,
        });
      }
      return {
        data: table,
        model: response.model,
        provider: response.provider,
        ...(response.responseMetadata
          ? { responseMetadata: toEventOperationsMetadata(response.responseMetadata) }
          : {}),
        success: true,
      };
    },
  };
}

export function createConfiguredEventOperationsAiProvider({
  onTrilingualFailureText,
  requestTimeoutMs,
}: {
  /** Calibration only (fake attendees); production never passes it. */
  onTrilingualFailureText?: EventOperationsAiProviderOptions["onTrilingualFailureText"];
  requestTimeoutMs?: number;
} = {}): EventOperationsAiProvider {
  return createEventOperationsAiProvider({
    ...(onTrilingualFailureText ? { onTrilingualFailureText } : {}),
    config: {
      deepseekThinking: false,
      jsonOutput: true,
      maxTokens: 8192,
      temperature: 0.2,
      ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
    },
    enforceOutputLanguage: true,
    outputLanguage: "zh-CN",
    recommendationPromptEncoding: "deduplicated",
    retryableJsonFailureShapes: ["empty", "parse_syntax", "unterminated_envelope"],
    // 2026-11-22: participant-facing text is generated once in ja/zh/en.
    trilingual: true,
  });
}

export const __eventOperationsAiProviderTestExports = {
  parseTokenGroupingFeatures,
  classifyJsonFailureShape,
  parseTokenRecommendationRows,
  parseTable,
  followsChineseOutputLanguagePolicy,
};
