import { offerAnswersNeed, topicsShare } from "./match-concepts";
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

/**
 * JSON whose only defect is missing closing brackets at the very end (the model stopped one or two `}` short;
 * seen in calibration with finish=stop). Appends exactly the missing closers — never changes or adds content —
 * and the strict shape checks still run on the result. Anything else stays unparseable.
 */
export function parseJsonClosingTail(text: string, finishReason?: string | null): unknown | null {
  const direct = parseJson(text);
  if (direct !== null) return direct;
  // Output cut by the length limit is truncated content, never completed.
  if (finishReason && /length|max_tokens|max_output/iu.test(finishReason)) return null;
  const body = text.trim();
  if (!body.startsWith("{")) return null;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const char of body) {
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{" || char === "[") stack.push(char === "{" ? "}" : "]");
    else if (char === "}" || char === "]") { if (stack.pop() !== char) return null; }
  }
  if (inString || stack.length === 0 || stack.length > 3) return null;
  return parseJson(body + stack.reverse().join(""));
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
      // Japanese: the server adds さん after a person's name (any さん/様 the model wrote is dropped first), so it is never missing or doubled.
      const honorific = language === "ja" ? normalized.replace(/(\{[A-Z][A-Z0-9]*\})(さん|様|氏)/gu, "$1") : normalized;
      const filled = honorific.replace(PLACEHOLDER_PATTERN, (match: string, key: string, company?: string) => {
        const participant = byKey.get(key);
        const value = company ? (participant ? registeredCompany(participant) : null) : participant?.displayName;
        if (!value?.trim()) { problems.push(match); return match; }
        return language === "ja" && !company ? `${value.trim()}さん` : value.trim();
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
    // Style (2026-11-22 review): Japanese-calque terms, 贵公司 for a person, and 你 (we address readers as 您).
    // 你 breaks the 您 convention and is repaired. 贵公司 is the right translation of 御社, so it is not failed (the
    // prompt forbids turning a person into a company). Calques (课题 …) are steered by the glossary, not failed.
    if (/你(?!们)/u.test(rest)) return true;
    const policy = collectChineseOutputPolicyViolations([rest], []);
    return policy.disallowedTokens.length > 0 || policy.untranslatedValues.length > 0;
  });
  const names = [...values.ja, ...values.zh, ...values.en].filter(writesName);
  return { chinese, english, japanese, names };
}

/** One model sentence plus the placeholders it may use (its row's source and target, or its table's members). */
/**
 * Who a text speaks to: "to_reader" (a reason, hint or no-match line addressed to the person reading it),
 * "to_target" (a question the reader asks the other person). Tables carry none (they speak about members).
 */
type TextVoice = "to_reader" | "to_target";
interface ScopedSentence { allowed: ReadonlySet<string>; sentence: TrilingualSentence; voice?: TextVoice }

/**
 * Person and voice rules of a translation (2026-11-22 calibration: a subject-less Japanese reason came back as
 * 「我…」/"I'm…", and people as 先生/女士/他/她). Gendered words are never allowed (the program has no gender);
 * a text spoken to the reader never opens with the writer as subject.
 */
export function voiceIssues(text: string, language: "zh" | "en", voice: TextVoice | undefined): string[] {
  const issues: string[] = [];
  const bare = text.replace(ANY_BRACES_PATTERN, " ");
  if (language === "zh") {
    if (/先生|女士|小姐|[他她]/u.test(bare.replace(/其[他它]|他人/gu, ""))) issues.push("gendered");
    if (voice === "to_reader" && /^[\s「“"]*我/u.test(bare)) issues.push("writer_voice");
  } else {
    if (/\b(he|she|his|him|her|hers|himself|herself|Mr|Mrs|Ms)\b/iu.test(bare)) issues.push("gendered");
    if (voice === "to_reader" && /^[\s"“]*(I|I'm|I am|I've|I'd|We|We're|We've|Our|My)\b/u.test(bare)) issues.push("writer_voice");
  }
  return issues;
}

const NUMBER_UNITS: Readonly<Record<string, number>> = { "万": 1e4, "萬": 1e4, "億": 1e8, "亿": 1e8, "千": 1e3, k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, bn: 1e9, billion: 1e9 };
/**
 * Arabic-digit numbers with their unit applied (100万 = 1 million = 1000000), as a set. A language that writes
 * no digits (one million / 百万 / a decade) has an empty set and is not compared — calibration showed that
 * comparing raw digit strings rejected only equivalent wordings. Digits inside a word (Web3, B2B, 5G) are part of
 * a name, not a number.
 */
function numericValues(text: string): string {
  const plain = stripPlaceholders(text).replace(/[０-９]/gu, (digit) => String.fromCharCode(digit.charCodeAt(0) - 0xfee0));
  const values = new Set<number>();
  for (const match of plain.matchAll(/(?<![A-Za-z\d.,])(\d+(?:[.,]\d+)?)\s*(万|萬|億|亿|千|billion|million|thousand|bn|[kKmMbB](?![a-zA-Z]))?/gu)) {
    if (!match[2] && /[A-Za-z]/u.test(plain[match.index! + match[1]!.length] ?? "")) continue; // 5G, 3D
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
/** Placeholder and identity problems of one text (any language). */
function textIssues(text: string, allowed: ReadonlySet<string>, language: TextLanguage, participants: readonly import("./contract").EventOperationsParticipant[]): string[] {
  const issues: string[] = [];
  const people = new Set<string>();
  const companies: string[] = [];
  for (const placeholder of text.match(ANY_BRACES_PATTERN) ?? []) {
    const match = CANONICAL_PLACEHOLDER_PATTERN.exec(placeholder);
    if (!match) { issues.push("malformed_placeholder"); continue; }
    if (!allowed.has(match[1]!)) issues.push("out_of_scope");
    if (match[2]) companies.push(match[1]!); else people.add(match[1]!);
  }
  if (companies.some((key) => !people.has(key))) issues.push("company_without_person");
  if (/[{}]/u.test(text.replace(ANY_BRACES_PATTERN, ""))) issues.push("stray_brace");
  const values = { en: language === "en" ? [text] : [], ja: language === "ja" ? [text] : [], zh: language === "zh" ? [text] : [] };
  const violations = collectTrilingualOutputViolations(values, participants);
  if (violations.names.length) issues.push("raw_name");
  if ((language === "ja" ? violations.japanese : language === "zh" ? violations.chinese : violations.english).length) issues.push("language");
  return [...new Set(issues)];
}
const placeholderSet = (text: string) => [...new Set(text.match(ANY_BRACES_PATTERN) ?? [])].sort().join(",");

/**
 * Full check of every sentence, run after translation and again after any repair. The Japanese base text is the
 * reference (it already passed its own check): a zh/en text whose placeholders or numbers differ from it, or that
 * breaks a placeholder, identity or language rule, is flagged for one repair from the Japanese. A problem in the
 * Japanese itself is structural (the batch fails).
 */
function checkScopedSentences(scoped: readonly ScopedSentence[], participants: readonly import("./contract").EventOperationsParticipant[]) {
  const structural: string[] = [];
  const flagged: Array<{ index: number; languages: TextLanguage[] }> = [];
  scoped.forEach(({ allowed, sentence, voice }, index) => {
    for (const language of TEXT_LANGUAGES) (sentence as Record<TextLanguage, string>)[language] = normalizePlaceholders(sentence[language]);
    const jaIssues = textIssues(sentence.ja, allowed, "ja", participants);
    if (jaIssues.length) { structural.push(...jaIssues.map((issue) => `${issue}@${index}`)); return; }
    const reference = { numbers: numericValues(sentence.ja), placeholders: placeholderSet(sentence.ja) };
    const languages = (["zh", "en"] as const).filter((language) => {
      const text = sentence[language];
      const numbers = numericValues(text);
      return textIssues(text, allowed, language, participants).length > 0
        || voiceIssues(text, language, voice).length > 0
        || placeholderSet(text) !== reference.placeholders
        // A translation may spell a number out (10年 → 十年 / a decade) but never add or change one.
        || (numbers !== "" && reference.numbers !== "" && numbers.split("|").some((value) => !reference.numbers.split("|").includes(value)));
    });
    if (languages.length) flagged.push({ index, languages: [...languages] });
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


type FactKind = "need" | "offer" | "topic" | "context";
interface ProfileFact { id: string; kind: FactKind; owner: string; text: string }
const FACT_PREFIX: Readonly<Record<FactKind, string>> = { context: "c", need: "n", offer: "o", topic: "t" };
/** A participant's profile as owned, typed facts: needs, offers (incl. the experience highlight), topics, context (industry, role). */
export { topicsShare };
export function profileFacts(key: string, participant: import("./contract").EventOperationsParticipant): ProfileFact[] {
  const facts: ProfileFact[] = [];
  const add = (kind: FactKind, text: string | null | undefined) => {
    const value = text?.trim();
    if (!value) return;
    const index = facts.filter((fact) => fact.kind === kind).length + 1;
    facts.push({ id: `${key}.${FACT_PREFIX[kind]}${index}`, kind, owner: key, text: value.slice(0, 200) });
  };
  for (const need of participant.needs) add("need", need);
  for (const offer of participant.offers) add("offer", offer);
  add("offer", participant.experienceHighlight);
  for (const topic of participant.topics) add("topic", topic);
  add("context", participant.industry);
  add("context", participant.role);
  return facts;
}
const factOwnerTag = (fact: { id: string }) => fact.id.slice(0, fact.id.lastIndexOf("."));
/**
 * A legal basis pair: a need of one person answered by an offer of the other, or a topic both people share —
 * both decided by the program's concept table (match-concepts.ts), never by the model (2026-11-22: two different
 * interests and unrelated need/offer pairs were presented as matches).
 */
function isLegalFactPair(left: { id: string; kind: FactKind; text?: string }, right: { id: string; kind: FactKind; text?: string }): boolean {
  if (factOwnerTag(left) === factOwnerTag(right)) return false;
  const kinds = [left.kind, right.kind].sort().join("+");
  if (left.text === undefined || right.text === undefined) return kinds === "need+offer" || kinds === "topic+topic";
  if (kinds === "need+offer") {
    const [need, offer] = left.kind === "need" ? [left, right] : [right, left];
    return offerAnswersNeed(need.text!, offer.text!);
  }
  return kinds === "topic+topic" && topicsShare(left.text, right.text);
}
/** Every legal pair among the cited facts, as sorted "a|b" ids. */
function legalPairsIn(cited: ReadonlyArray<{ id: string; kind: FactKind; text?: string }>): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < cited.length; i += 1) for (let j = i + 1; j < cited.length; j += 1) if (isLegalFactPair(cited[i]!, cited[j]!)) pairs.push([cited[i]!.id, cited[j]!.id].sort().join("|"));
  return pairs;
}
/** Every cited need/offer/topic is part of a legal pair in the same reason; context facts may only accompany one. */
function evidenceIsClosed(cited: ReadonlyArray<{ id: string; kind: FactKind; text?: string }>): boolean {
  return cited.every((fact) => fact.kind === "context" || cited.some((other) => other !== fact && isLegalFactPair(fact, other)));
}

/** One participant-facing text in three languages (assembled by the program from the base draft and its translations). */
export interface TrilingualSentence { ja: string; zh: string; en: string }

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
/**
 * Sources per recommendation shard in trilingual mode (2026-11-22 base-then-translate): the base draft is
 * Japanese only, so 3 sources x 4 picks x 5 texts stays well inside one bounded output.
 */
export const TRILINGUAL_MAX_RECOMMENDATION_SHARD = 3;

/** Trilingual calls: every invalid-JSON shape is retried (never trimmed or accepted), within the task's attempt limit. */
const TRILINGUAL_RETRYABLE_JSON_SHAPES: ReadonlySet<EventOperationsJsonFailureShape> = new Set(["empty", "fence_or_prefix", "trailing_text", "unterminated_envelope", "parse_syntax"]);

const BASE_DRAFT_INSTRUCTION = `Write every participant-facing text in natural, polite Japanese only. Each text is specific to the people involved and grounded in their supplied profiles; never use template sentences. Never write a participant's name or company name: refer to a person only by the placeholder the task defines for them, and to their company only by that placeholder with ":company" added inside the braces, only when that profile has hasCompany=true. Never write a generic word such as KEY inside braces. Profiles may be written in any language: express every profile term in Japanese, except upper-case abbreviations (AI, DX, VC, M&A …) which stay as written. Write numbers with Arabic digits. Return exactly one JSON document with exactly the documented keys.`;

const TRANSLATION_INSTRUCTION = (language: "zh" | "en") => `You translate Japanese event networking texts into ${language === "zh" ? "idiomatic Simplified Chinese as a native Chinese business writer would write it (no Japanese kana; address the reader as 您, never 你; never 贵公司 for a person; write natural mainland Chinese instead of Japanese calques (課題 → 挑战/难题/问题, 導入支援 → 落地支持/引入支持, 実績 → 经验/成果, not 课题/导入支持/实际业绩); keep upper-case abbreviations such as AI, DX, VC, M&A, IPO and the terms SaaS, Web3, EdTech, FinTech, PoC as written; translate every other English word)" : "natural, concise English (no Chinese or Japanese characters; address the reader as you; refer to a person as they, never it)"}. Each id may have a voice. "to_reader": the text speaks to the person reading it — the reader is 您 / you, the other person appears only as a {…} placeholder, and the writer never appears (never 我/我们 or I/We as the subject); a Japanese sentence without a subject is about the reader. "to_target": a question the reader asks the other person directly (您 / you is the person asked). A text without a voice describes the people by their placeholders. Never use a gendered word for anyone (no 先生, 女士, 他, 她; no he, she, his, her, Mr, Ms): repeat the placeholder or use 对方 / 您 / they / you instead. Never turn a person into a company. Translate only: never add, remove, or change a fact, a person, a direction (who needs and who offers), a negation, or a number. Keep every {…} placeholder exactly as it appears in the Japanese text, and keep numbers as Arabic digits with the same values. Return exactly {"items":{"<id>":"<translation>"}} (the translated text only, no voice) with exactly the same ids.`;

/** What a rejected recommendation draft broke, said back to the model on its one retry. */
const WRITE_PROBLEM_RULE: Readonly<Record<string, string>> = {
  evidence_no_legal_pair: "each reason's ev must contain a need of one person with the other person's offer, or a topic of each (a topic with an offer is not a pair)",
  evidence_off_basis: "one of the two reasons must rest on a supplied basis pair",
  evidence_target_unsupported: "a reason that mentions {TARGET} must cite at least one T.* fact",
  evidence_unknown_fact: "ev may contain only the fact ids supplied for that pair",
  evidence_unmatched_fact: "every need, offer, or topic in ev must be paired within the same reason (a context fact may only accompany a pair)",
  none: "the .none id needs exactly {\"none\": \"…\"}",
  pair_keys: "every pair id needs exactly hint, q1, q2, r1, r2 with non-empty text",
  reason_keys: "r1 and r2 are each exactly {\"ev\": [fact ids], \"text\": \"…\"}",
  rows: "return exactly the documented pair ids, no more and no fewer",
};

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
    ...(trilingual ? { participantTextLanguages: "ja-facts-choose-write-translate-v5" } : {}),
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
  const baseSystemInstruction = `${systemInstruction}\n${BASE_DRAFT_INSTRUCTION}`;
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
      return { ok: false, result: trilingualFailure({ kind: input.kind, stage: `check_${first.structural[0]!.split("@")[0]}`, text: JSON.stringify({ problems: first.structural, sentences: input.scoped.map((item) => item.sentence) }), result: trilingualRetryable<never>(`Trilingual output failed: ${[...new Set(first.structural.map((item) => item.split("@")[0]))].join(", ")}.`, input.metadata) }) };
    }
    if (first.flagged.length === 0) return { ok: true, metadata: input.metadata };
    const request = first.flagged.map(({ index, languages }, position) => {
      const sentence = input.scoped[index]!.sentence;
      // The Japanese base draft is the source of truth; translate a flagged language from it when it passed.
      const source = (["ja", "zh", "en"] as const).find((language) => !languages.includes(language));
      const voice = input.scoped[index]!.voice;
      return { id: `s${position + 1}`, index, rewrite: languages, source, ...(voice ? { voice } : {}), ...(source ? { source_text: sentence[source] } : {}), ...Object.fromEntries(languages.map((language) => [`current_${language}`, sentence[language]])) };
    });
    if (request.some((item) => !item.source)) {
      return { ok: false, result: trilingualFailure({ kind: input.kind, stage: "all_languages_flagged", text: input.text, result: invalidOutputLanguage<never>(input.metadata) }) };
    }
    const response = await runModelText({
      config,
      systemInstruction: `${systemInstruction}\nYou are performing one bounded AI-only language repair of event networking sentences. Rewrite only the requested languages of each sentence from its source_text, which is the same sentence in another language: ja in natural Japanese, zh in idiomatic Simplified Chinese, en in natural English with no Chinese or Japanese characters. Keep every {…} placeholder exactly as it appears in source_text, keep every number, and never write a person's or company's name. A sentence with voice "to_reader" speaks to its reader (您 / you; a Japanese sentence without a subject is about the reader) and never has the writer (我/我们, I/We) as its subject; voice "to_target" is a question asked directly to the other person. Never use a gendered word (先生, 女士, 他, 她, he, she, his, her, Mr, Ms): use the placeholder, 对方/您, or they/you. Never add, remove, or change facts.`,
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

  /** Base-draft texts: placeholder form, scope, company pairing, no written names, Japanese reads as Japanese; questions never name the person asked. */
  function baseTextIssues(items: ReadonlyArray<{ allowed: ReadonlySet<string>; asked?: string; reader?: string; text: string }>, participants: readonly import("./contract").EventOperationsParticipant[]): Map<number, string[]> {
    const issues = new Map<number, string[]>();
    items.forEach((item, index) => {
      const found = nonEmptyString(item.text) ? textIssues(item.text, item.allowed, "ja", participants) : ["empty"];
      // A recommendation is read by its source person: they are addressed, never named.
      if (item.reader && new RegExp(`\\{${item.reader}(:company)?\\}`, "u").test(item.text)) found.push("reader_named");
      // A question is said by the asker to the person asked: neither is named (no self-honorific, no third person).
      if (item.asked && /[{}]/u.test(item.text)) found.push("question_names_target");
      if (found.length) issues.set(index, found);
    });
    return issues;
  }

  const BASE_ISSUE_RULE: Readonly<Record<string, string>> = {
    company_without_person: "a {KEY:company} placeholder must appear together with the same person's {KEY}",
    empty: "the text is empty",
    language: "write natural, polite Japanese",
    malformed_placeholder: "placeholders must be exactly {KEY} or {KEY:company}",
    out_of_scope: "it mentions a person who is not allowed here",
    reader_named: "this text is read by the person it is written for: address them as あなた, never name them with a placeholder",
    question_names_target: "a question is asked directly to the person: write it without any placeholder or name (neither the person asked nor the asker)",
    raw_name: "never write a person's or company's name; use only the placeholders",
    stray_brace: "no braces outside placeholders",
  };

  /** Base texts with issues get one bounded rewrite (meaning kept, rules fixed); then the same check again. */
  async function checkAndRepairBase(input: {
    items: Array<{ aliases?: Readonly<Record<string, string>>; allowed: ReadonlySet<string>; asked?: string; id: string; reader?: string; text: string }>;
    kind: "recommendations" | "table";
    metadata: EventOperationsAiResponseMetadata | undefined;
    participants: readonly import("./contract").EventOperationsParticipant[];
    text: string;
  }): Promise<{ ok: true; metadata: EventOperationsAiResponseMetadata | undefined } | { ok: false; result: EventOperationsAiResult<never> }> {
    const first = baseTextIssues(input.items, input.participants);
    if (first.size === 0) return { ok: true, metadata: input.metadata };
    const request = [...first].map(([index, issues], position) => {
      const item = input.items[index]!;
      // The reader is addressed as あなた, so their own placeholder is never offered to the rewrite.
      return { allowedPlaceholders: [...item.allowed].filter((key) => key !== item.reader).map((key) => `{${key}}`), ...(item.reader ? { reader: "あなた (never a placeholder)" } : {}), ...(item.asked ? { personBeingAsked: `{${item.asked}}` } : {}), id: `t${position + 1}`, index, problems: issues.map((issue) => BASE_ISSUE_RULE[issue] ?? issue), text: item.text };
    });
    const response = await runModelText({
      config,
      systemInstruction: `${systemInstruction}\nYou fix single Japanese event networking texts. Keep the meaning and facts; change only what the listed problems require. Use only the allowed placeholders, exactly as written ({KEY} or {KEY:company}); the server inserts names and さん. Return exactly one json document {"texts":{"<id>":"<fixed text>"}} with exactly the given ids.`,
      userText: JSON.stringify({ texts: request.map(({ index: _index, ...item }) => item) }),
    });
    if (response.success === false) {
      const failure = modelFailure<never>(response);
      const merged = mergeEventOperationsResponseMetadata(input.metadata, failure.success === false ? failure.responseMetadata : undefined);
      return { ok: false, result: failure.success === false ? { ...failure, ...(merged ? { responseMetadata: merged } : {}) } : failure };
    }
    const metadata = mergeEventOperationsResponseMetadata(input.metadata, metadataOf(response));
    const json = parseJsonClosingTail(response.text, response.responseMetadata?.finishReason);
    const texts = isRecord(json) && exactKeys(json, ["texts"]) && isRecord(json.texts) ? json.texts : null;
    const repairText = JSON.stringify({ request: request.map(({ index: _index, ...item }) => item), response: response.text });
    if (!texts || Object.keys(texts).length !== request.length || !request.every((item) => nonEmptyString(texts[item.id]))) {
      return { ok: false, result: trilingualFailure({ kind: "repair", stage: "base_repair_schema", text: repairText, result: trilingualRetryable<never>("The base repair did not return exactly the requested texts.", metadata) }) };
    }
    for (const item of request) {
      const target = input.items[item.index]!;
      // A rewrite may use the pair's role names again ({TARGET}); bind them to the same keys as the draft.
      target.text = normalizePlaceholders(String(texts[item.id]).trim())
        .replace(/\{([A-Z]+)(:company)?\}/gu, (match, role: string, company?: string) => (target.aliases?.[role] ? `{${target.aliases[role]}${company ?? ""}}` : match));
    }
    const second = baseTextIssues(input.items, input.participants);
    if (second.size) {
      return { ok: false, result: trilingualFailure({ kind: "repair", stage: "base_after_repair", text: repairText, result: trilingualRetryable<never>(`The base draft still failed after repair: ${[...new Set([...second.values()].flat())].join(", ")}.`, metadata) }) };
    }
    process.stderr.write(`${JSON.stringify({ event: "event_operations_trilingual_base_repaired", kind: input.kind, texts: request.length })}\n`);
    return { ok: true, metadata };
  }

  /** One language's translation of the base texts; id set must match exactly. One retry of this call on a bad shape. */
  async function translateBase(language: "zh" | "en", items: Readonly<Record<string, string>>, voices: Readonly<Record<string, TextVoice>>, kind: "recommendations" | "table"): Promise<{ ok: true; texts: Record<string, string>; metadata: EventOperationsAiResponseMetadata | undefined } | { ok: false; result: EventOperationsAiResult<never> }> {
    let metadata: EventOperationsAiResponseMetadata | undefined;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const response = await runModelText({
        config,
        systemInstruction: `${systemInstruction}\n${TRANSLATION_INSTRUCTION(language)}`,
        userText: `Translate every Japanese text in items. voice tells who each text speaks to (ids not listed there describe people by their placeholders). JSON only.\n${JSON.stringify({ items, ...(Object.keys(voices).length ? { voice: voices } : {}) })}`,
      });
      if (response.success === false) {
        const failure = modelFailure<never>(response);
        const merged = mergeEventOperationsResponseMetadata(metadata, failure.success === false ? failure.responseMetadata : undefined);
        return { ok: false, result: failure.success === false ? { ...failure, ...(merged ? { responseMetadata: merged } : {}) } : failure };
      }
      metadata = mergeEventOperationsResponseMetadata(metadata, metadataOf(response));
      const json = parseJsonClosingTail(response.text, response.responseMetadata?.finishReason);
      const texts = isRecord(json) && exactKeys(json, ["items"]) && isRecord(json.items) ? json.items : null;
      const ids = Object.keys(items);
      if (texts && Object.keys(texts).length === ids.length && ids.every((id) => nonEmptyString(texts[id]))) {
        return { ok: true, metadata, texts: Object.fromEntries(ids.map((id) => [id, normalizePlaceholders(String(texts[id]).trim())])) };
      }
      trilingualFailure({ kind, stage: `translate_${language}_shape`, text: response.text, result: trilingualRetryable<never>("x") });
    }
    return { ok: false, result: trilingualRetryable<never>(`The ${language} translation did not return exactly the requested ids.`, metadata) };
  }

  /**
   * Base texts (ja) → zh and en in parallel → the full three-language check with at most one repair per
   * flagged language (from the Japanese text) → the same full check again. Returns the assembled sentences.
   */
  async function translateAndCheck(input: {
    base: ReadonlyArray<{ allowed: ReadonlySet<string>; asked?: string; id: string; reader?: string; text: string }>;
    kind: "recommendations" | "table";
    metadata: EventOperationsAiResponseMetadata | undefined;
    participants: readonly import("./contract").EventOperationsParticipant[];
    text: string;
  }): Promise<{ ok: true; metadata: EventOperationsAiResponseMetadata | undefined; sentences: Map<string, TrilingualSentence> } | { ok: false; result: EventOperationsAiResult<never> }> {
    const voiceOf = (item: { asked?: string; reader?: string }): TextVoice | undefined => (item.asked ? "to_target" : item.reader ? "to_reader" : undefined);
    // Items stay a flat id → text map (one shape in, one shape out); the voices ride alongside.
    const items = Object.fromEntries(input.base.map((item) => [item.id, item.text]));
    const voices = Object.fromEntries(input.base.flatMap((item) => (voiceOf(item) ? [[item.id, voiceOf(item)!]] : [])));
    const [zh, en] = await Promise.all([translateBase("zh", items, voices, input.kind), translateBase("en", items, voices, input.kind)]);
    type Translated = { ok: true; texts: Record<string, string>; metadata: EventOperationsAiResponseMetadata | undefined };
    type Failed = { ok: false; result: EventOperationsAiResult<never> };
    const usageOf = (value: Translated | Failed) => (value.ok === true ? (value as Translated).metadata : (value as Failed).result.responseMetadata);
    const metadata = mergeEventOperationsResponseMetadata(input.metadata, mergeEventOperationsResponseMetadata(usageOf(zh), usageOf(en)));
    for (const value of [zh, en]) {
      if (value.ok === false) return { ok: false, result: { ...(value as Failed).result, ...(metadata ? { responseMetadata: metadata } : {}) } as EventOperationsAiResult<never> };
    }
    const zhTexts = (zh as Translated).texts;
    const enTexts = (en as Translated).texts;
    const sentences = new Map<string, TrilingualSentence>();
    const scoped: ScopedSentence[] = input.base.map((item) => {
      const sentence: TrilingualSentence = { en: enTexts[item.id]!, ja: item.text, zh: zhTexts[item.id]! };
      sentences.set(item.id, sentence);
      const voice = voiceOf(item);
      return { allowed: item.allowed, sentence, ...(voice ? { voice } : {}) };
    });
    const checked = await checkAndRepair({ kind: input.kind, metadata, participants: input.participants, scoped, text: input.text });
    if (checked.ok === false) return checked;
    return { metadata: checked.metadata, ok: true, sentences };
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
    // Fact anchors (2026-11-22): every profile becomes owned, typed facts. The model must say which facts a
    // recommendation rests on; the program checks owners and types, so a need cannot be presented as an offer,
    // a topic as expertise, or one person's need as the other's.
    const factsByKey = new Map<string, readonly ProfileFact[]>();
    for (const [key, participant] of participantByKey) factsByKey.set(key, profileFacts(key, participant));
    // The program decides who can be recommended at all: a candidate with at least one legal pair with the source
    // (a need answered by an offer in either direction, or a shared topic — concept table, no model). Exactly
    // K = min(N, |E|) picks from that set E; fewer than N only ever means "not enough real matches", never a
    // model that gave up (2026-11-22: 12 people x N=5 forced unrelated pairs).
    const legalPairsBetween = (left: string, right: string) => factsByKey.get(left)!.flatMap((own) => factsByKey.get(right)!.filter((fact) => isLegalFactPair(own, fact)).map((fact) => [own.id, fact.id]));
    const matchable = new Map(tokenizedSources.tokenSources.map((token) => {
      const sourceFacts = factsByKey.get(token.sourceKey)!;
      return [token.sourceKey, [...token.candidateIdByKey.keys()].filter((key) => factsByKey.get(key)!.some((fact) => sourceFacts.some((own) => isLegalFactPair(own, fact))))];
    }));
    const pickCount = new Map(tokenizedSources.tokenSources.map((token) => [token.sourceKey, Math.min(Math.max(0, Math.floor(input.recommendationCount)), matchable.get(token.sourceKey)!.length)]));
    const pickKeys = (sourceKey: string) => Array.from({ length: pickCount.get(sourceKey)! }, (_, index) => `p${index + 1}`);
    const promptPerson = (key: string) => ({ facts: factsByKey.get(key)!.map(({ id, kind, text }) => ({ id, kind, text })), hasCompany: registeredCompany(participantByKey.get(key)!) !== null });
    // Step 1a — choose (small output): exactly K distinct shortlist targets per source, best first, with the fact pairs it rests on.
    const chooseShape = Object.fromEntries(tokenizedSources.tokenSources.map((token) => [token.sourceKey, pickKeys(token.sourceKey).map(() => ({ basis: [[`${token.sourceKey}.n1`, `${token.sourceKey}C?.o1`]], score: 80, target: `${token.sourceKey}C?` }))]));
    const chooseSources = tokenizedSources.tokenSources.map((token) => ({
      candidates: matchable.get(token.sourceKey)!.map((key) => ({ candidateKey: key, ...promptPerson(key), matchPairs: legalPairsBetween(token.sourceKey, key) })),
      sourceKey: token.sourceKey,
      ...promptPerson(token.sourceKey),
    }));
    const choose = await runModelText({
      config,
      systemInstruction: `${systemInstruction}\nYou choose who should meet whom at a networking event, from the supplied facts only. Return exactly one JSON document.`,
      userText: `For each sourceKey, choose exactly the number of different people shown in the JSON shape (an empty list when the source has no candidates) from that source's own candidates, best first. score is an integer 0..100.
Every candidate listed has at least one real match with the source; matchPairs lists all of them (a need answered by the other person's offer, or a topic both share), as decided by the server. For every pick, basis lists one or more pairs copied from that candidate's matchPairs — no other pair is accepted. Rank by how directly and how strongly those pairs connect the two people, not by list order.

JSON shape (exact keys and list lengths):
${JSON.stringify(chooseShape)}

Sources and their candidates:
${JSON.stringify(chooseSources)}`,
    });
    if (choose.success === false) return modelFailure(choose);
    let metadata = metadataOf(choose);
    const chosenJson = parseJsonClosingTail(choose.text, choose.responseMetadata?.finishReason);
    if (chosenJson === null) {
      const shapeName = classifyJsonFailureShape(choose.text);
      return trilingualFailure({ kind: "recommendations", stage: `choose_json_${shapeName}`, text: choose.text, result: invalidJson(shapeName, metadata, TRILINGUAL_RETRYABLE_JSON_SHAPES) });
    }
    const chooseProblem = (() => {
      if (!isRecord(chosenJson) || !exactKeys(chosenJson, tokenizedSources.tokenSources.map((token) => token.sourceKey))) return "rows";
      for (const token of tokenizedSources.tokenSources) {
        const list = chosenJson[token.sourceKey];
        if (!Array.isArray(list) || list.length !== pickCount.get(token.sourceKey)) return "count";
        const targets = new Set<string>();
        for (const item of list) {
          if (!isRecord(item) || !exactKeys(item, ["basis", "score", "target"])) return "item";
          if (typeof item.target !== "string" || !matchable.get(token.sourceKey)!.includes(item.target) || targets.has(item.target)) return "target";
          targets.add(item.target);
          if (typeof item.score !== "number" || !Number.isInteger(item.score) || item.score < 0 || item.score > 100) return "score";
          const known = new Map([...factsByKey.get(token.sourceKey)!, ...factsByKey.get(item.target)!].map((fact) => [fact.id, fact]));
          if (!Array.isArray(item.basis)) return "basis_missing";
          // The basis is internal evidence: unknown ids and illegal pairs are dropped; at least one legal pair must remain,
          // and only legal pairs ever reach the writer.
          item.basis = item.basis.filter((pair): pair is string[] => Array.isArray(pair) && pair.length === 2
            && pair.every((id) => typeof id === "string" && known.has(id)) && isLegalFactPair(known.get(pair[0])!, known.get(pair[1])!));
          if ((item.basis as unknown[]).length === 0) return "basis_no_legal_pair";
        }
      }
      return null;
    })();
    if (chooseProblem) return trilingualFailure({ kind: "recommendations", stage: `choose_${chooseProblem}`, text: choose.text, result: trilingualRetryable(`The choice did not match the required picks (${chooseProblem}).`, metadata) });
    const chosen = new Map(tokenizedSources.tokenSources.map((token) => [token.sourceKey, (chosenJson as Record<string, Array<{ basis: string[][]; score: number; target: string }>>)[token.sourceKey]!]));
    // Step 1b — write the Japanese base draft for exactly the chosen pairs, from the pair's facts (relabelled S.* / T.*).
    const relabel = (id: string, sourceKey: string, targetKey: string | null) => (id.startsWith(`${sourceKey}.`) ? `S.${id.slice(sourceKey.length + 1)}` : targetKey && id.startsWith(`${targetKey}.`) ? `T.${id.slice(targetKey.length + 1)}` : id);
    const pairFacts = (sourceKey: string, targetKey: string | null) => [
      ...factsByKey.get(sourceKey)!.map((fact) => ({ ...fact, id: relabel(fact.id, sourceKey, targetKey) })),
      ...(targetKey ? factsByKey.get(targetKey)!.map((fact) => ({ ...fact, id: relabel(fact.id, sourceKey, targetKey) })) : []),
    ];
    // One write call per source (1 person x K pairs), in parallel: a small output, and a broken one is re-asked
    // for that person only (calibration: one call for 3 x 5 pairs broke its JSON mid-document).
    const writeForSource = async (token: TokenizedRecommendationSource): Promise<{ ok: true; rows: Record<string, unknown>; metadata: EventOperationsAiResponseMetadata | undefined; text: string } | { ok: false; result: EventOperationsAiResult<never> }> => {
      const list = chosen.get(token.sourceKey)!;
      const pairs: Record<string, unknown> = {};
      const writeShape: Record<string, unknown> = {};
      if (list.length === 0) {
        pairs[`${token.sourceKey}.none`] = { sourceFacts: pairFacts(token.sourceKey, null).map(({ id, kind, text }) => ({ id, kind, text })) };
        writeShape[`${token.sourceKey}.none`] = { none: "…" };
      }
      list.forEach((item, index) => {
        const id = `${token.sourceKey}.p${index + 1}`;
        const facts = pairFacts(token.sourceKey, item.target);
        const topicsOf = (prefix: string) => facts.filter((fact) => fact.kind === "topic" && fact.id.startsWith(prefix));
        // Shared topics are found by the program; only these may carry a topic reason.
        const sharedTopics = topicsOf("S.").flatMap((left) => topicsOf("T.").filter((right) => topicsShare(left.text, right.text)).map((right) => [left.id, right.id]));
        const answered = facts.filter((fact) => fact.kind === "need").flatMap((need) => facts.filter((offer) => offer.kind === "offer" && isLegalFactPair(need, offer)).map((offer) => [need.id, offer.id]));
        pairs[id] = {
          basis: item.basis.map((pair) => pair.map((factId) => relabel(factId, token.sourceKey, item.target))),
          facts: facts.map(({ id: factId, kind, text }) => ({ id: factId, kind, text })),
          needAnswers: answered,
          sharedTopics,
          targetHasCompany: registeredCompany(participantByKey.get(item.target)!) !== null,
        };
        writeShape[id] = { hint: "…", q1: "…", q2: "…", r1: { ev: ["S.n1", "T.o1"], text: "…" }, r2: { ev: ["T.n1", "S.o1"], text: "…" } };
      });
      let where = "";
      const problemOf = (json: unknown): string | null => {
        where = "";
        if (!isRecord(json) || !exactKeys(json, Object.keys(writeShape))) return "rows";
        if (list.length === 0) {
          const row = json[`${token.sourceKey}.none`];
          if (!isRecord(row) || !exactKeys(row, ["none"]) || !nonEmptyString(row.none)) return "none";
        }
        for (const [index, item] of list.entries()) {
          const row = json[`${token.sourceKey}.p${index + 1}`];
          where = `${token.sourceKey}.p${index + 1}`;
          if (!isRecord(row) || !exactKeys(row, ["hint", "q1", "q2", "r1", "r2"]) || !["hint", "q1", "q2"].every((field) => nonEmptyString(row[field]))) return "pair_keys";
          const known = new Map(pairFacts(token.sourceKey, item.target).map((fact) => [fact.id, fact]));
          const basis = item.basis.map((pair) => pair.map((factId) => relabel(factId, token.sourceKey, item.target)).sort().join("|"));
          const usedPairs = new Set<string>();
          for (const field of ["r1", "r2"]) {
            const reason = row[field];
            where = `${token.sourceKey}.p${index + 1}.${field}`;
            if (!isRecord(reason) || !exactKeys(reason, ["ev", "text"]) || !nonEmptyString(reason.text) || !Array.isArray(reason.ev) || reason.ev.length === 0) return "reason_keys";
            if (!reason.ev.every((factId) => typeof factId === "string" && known.has(factId))) return "evidence_unknown_fact";
            const cited = (reason.ev as string[]).map((factId) => known.get(factId)!);
            const legal = legalPairsIn(cited);
            if (legal.length === 0) return "evidence_no_legal_pair";
            if (!evidenceIsClosed(cited)) return "evidence_unmatched_fact";
            if (/\{TARGET(:company)?\}/u.test(String(reason.text)) && !cited.some((fact) => fact.id.startsWith("T."))) return "evidence_target_unsupported";
            for (const pair of legal) usedPairs.add(pair);
          }
          where = `${token.sourceKey}.p${index + 1}`;
          if (!basis.some((pair) => usedPairs.has(pair))) return "evidence_off_basis";
        }
        return null;
      };
      let metadata: EventOperationsAiResponseMetadata | undefined;
      let lastProblem = "rows";
      let feedback = "";
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        const written = await runModelText({
          config,
          systemInstruction: baseSystemInstruction,
          userText: `Write the texts for these already-chosen networking pairs, in Japanese, from the supplied facts only (S.* are the reader's facts, T.* the target's).

These texts are shown to the reader (the source person) about themselves. Address the reader as あなた (あなたは… / あなたの…) whenever a sentence needs that subject, never leaving it ambiguous who is meant; never name the reader. Refer to the target only as {TARGET} (the server adds the name and さん), and to the target's company only as {TARGET:company} next to {TARGET}, only when targetHasCompany is true. No other placeholders exist; never add braces.

For every pair id:
- r1 and r2: two different reasons why あなた should meet {TARGET}. Each reason states only what its cited facts say and lists them in ev. A need belongs to its owner and is answered only by the other person's offer that answers it most directly (for a funding need, a funding or investor offer — not an unrelated one); a topic is an interest, never an ability or knowledge; never attribute one person's fact to the other. Build r1 on the strongest supplied basis pair. The server lists every real pair: needAnswers (a need answered by the other person's offer, either direction) and sharedTopics; a reason's ev must contain one of those pairs exactly — no other pairing is accepted. For r2, in this order: a second pair from needAnswers if it is equally direct; else a pair from sharedTopics; else r2 stays on r1's pair (same ev) and names one concrete thing to discuss or ask first. Never stretch an unrelated offer to fit a need.
Let the sentence shape follow what the reason rests on: a reason about a need and an offer may start from either person or from the need itself; a shared-topic reason may start from the topic; a concrete starting point may start from the action. Use a verb that fits the fact (knowledge is had, a service is offered, an introduction is made). Across the pairs of one person, no two reasons may share the same opening or the same sentence pattern; write each one fresh.
- q1 and q2: two questions あなた asks {TARGET} directly, in polite Japanese, without any placeholder or name.
- hint: one practical tip for あなた to start the conversation.
For an id ending in ".none": none is one sentence explaining to あなた why there is no match.

JSON shape (exact keys):
${JSON.stringify(writeShape)}

Pairs:
${JSON.stringify(pairs)}${feedback}`,
        });
        if (written.success === false) {
          const failure = modelFailure<never>(written);
          const merged = mergeEventOperationsResponseMetadata(metadata, failure.success === false ? failure.responseMetadata : undefined);
          return { ok: false, result: (failure.success === false ? { ...failure, ...(merged ? { responseMetadata: merged } : {}) } : failure) as EventOperationsAiResult<never> };
        }
        metadata = mergeEventOperationsResponseMetadata(metadata, metadataOf(written));
        const json = parseJsonClosingTail(written.text, written.responseMetadata?.finishReason);
        lastProblem = json === null ? `json_${classifyJsonFailureShape(written.text)}` : problemOf(json) ?? "";
        if (!lastProblem) return { metadata, ok: true, rows: json as Record<string, unknown>, text: written.text };
        trilingualFailure({ kind: "recommendations", stage: `write_${lastProblem}`, text: written.text, result: trilingualRetryable<never>("x") });
        // The second attempt is told what the first broke (where and which rule), not just asked again.
        feedback = `\n\nYour previous draft was rejected${where ? ` at ${where}` : ""}: ${WRITE_PROBLEM_RULE[lastProblem] ?? "return exactly one complete JSON document with exactly the documented keys"}. Write the whole document again.`;
      }
      return { ok: false, result: trilingualRetryable<never>(`The base draft for ${token.sourceKey} failed twice (${lastProblem}).`, metadata) };
    };
    const writes = await Promise.all(tokenizedSources.tokenSources.map(writeForSource));
    for (const write of writes) metadata = mergeEventOperationsResponseMetadata(metadata, write.ok === true ? (write as { metadata: EventOperationsAiResponseMetadata | undefined }).metadata : (write as { result: EventOperationsAiResult<never> }).result.responseMetadata);
    const failedWrite = writes.find((write) => write.ok === false) as { ok: false; result: EventOperationsAiResult<never> } | undefined;
    if (failedWrite) return { ...failedWrite.result, ...(metadata ? { responseMetadata: metadata } : {}) } as never;
    const json = Object.assign({}, ...writes.map((write) => (write as { rows: Record<string, unknown> }).rows)) as Record<string, unknown>;
    const response = { model: choose.model, provider: choose.provider, text: writes.map((write) => (write as { text: string }).text).join("\n") };
    // 2. Base texts, scoped to the pair; {SOURCE}/{TARGET} become that pair's keys (no other person can be named). ev is internal only.
    const written = json as Record<string, Record<string, unknown>>;
    const base: Array<{ aliases?: Readonly<Record<string, string>>; allowed: ReadonlySet<string>; asked?: string; id: string; reader?: string; text: string }> = [];
    const bind = (text: string, sourceKey: string, targetKey: string | null) => normalizePlaceholders(text)
      .replace(/\{(SOURCE|TARGET)(:company)?\}/gu, (match, role: string, company?: string) => (role === "SOURCE" ? `{${sourceKey}${company ?? ""}}` : targetKey ? `{${targetKey}${company ?? ""}}` : match));
    for (const token of tokenizedSources.tokenSources) {
      const list = chosen.get(token.sourceKey)!;
      if (list.length === 0) base.push({ aliases: { SOURCE: token.sourceKey }, allowed: new Set([token.sourceKey]), id: `${token.sourceKey}.none`, reader: token.sourceKey, text: bind(String(written[`${token.sourceKey}.none`]!.none), token.sourceKey, null) });
      list.forEach((item, index) => {
        const id = `${token.sourceKey}.p${index + 1}`;
        const row = written[id]!;
        const allowed = new Set([token.sourceKey, item.target]);
        const aliases = { SOURCE: token.sourceKey, TARGET: item.target };
        for (const field of ["r1", "r2"]) base.push({ aliases, allowed, id: `${id}.${field}`, reader: token.sourceKey, text: bind(String((row[field] as Record<string, unknown>).text), token.sourceKey, item.target) });
        for (const field of ["q1", "q2"]) base.push({ aliases, allowed, asked: item.target, id: `${id}.${field}`, reader: token.sourceKey, text: bind(String(row[field]), token.sourceKey, item.target) });
        base.push({ aliases, allowed, id: `${id}.hint`, reader: token.sourceKey, text: bind(String(row.hint), token.sourceKey, item.target) });
      });
    }
    const baseChecked = await checkAndRepairBase({ items: base, kind: "recommendations", metadata, participants, text: response.text });
    if (baseChecked.ok === false) return baseChecked.result as never;
    metadata = baseChecked.metadata;
    // 3. Translate (zh, en) → full check → at most one repair → full check.
    const translated = await translateAndCheck({ base, kind: "recommendations", metadata, participants, text: response.text });
    if (translated.ok === false) return translated.result as never;
    metadata = translated.metadata;
    // 4. Names last, by id.
    if (fillParticipantPlaceholders([...translated.sentences.values()], participantByKey).length) {
      return trilingualFailure({ kind: "recommendations", stage: "fill", text: response.text, result: trilingualRetryable("A placeholder had no registered value.", metadata) });
    }
    // 5. Original shape per language, original closed schema, merge (base fields = zh).
    const mapped = {} as Record<TextLanguage, readonly EventOperationsParticipantRecommendations[]>;
    for (const language of TEXT_LANGUAGES) {
      const text = (id: string) => translated.sentences.get(id)![language];
      const document = {
        recommendations: tokenizedSources.tokenSources.map((token) => ({
          noMatchReason: chosen.get(token.sourceKey)!.length === 0 ? text(`${token.sourceKey}.none`) : null,
          recommendations: chosen.get(token.sourceKey)!.map((item, index) => {
            const key = `p${index + 1}`;
            return {
              icebreakers: [text(`${token.sourceKey}.${key}.q1`), text(`${token.sourceKey}.${key}.q2`)],
              memberHint: text(`${token.sourceKey}.${key}.hint`),
              rank: index + 1,
              reasons: [text(`${token.sourceKey}.${key}.r1`), text(`${token.sourceKey}.${key}.r2`)],
              score: item.score,
              targetCandidateKey: item.target,
            };
          }),
          sourceKey: token.sourceKey,
        })),
      };
      const tokenRows = parseTokenRecommendationRows(document);
      const mappedRows = tokenRows ? mapTokenRecommendationRows(tokenRows, tokenizedSources.tokenSources) : null;
      if (!mappedRows) return trilingualFailure({ kind: "recommendations", stage: "closed_schema", text: response.text, result: trilingualRetryable("The recommendations did not match the closed schema.", metadata) });
      mapped[language] = mappedRows;
    }
    return { data: mergeTrilingualRecommendations(mapped), model: response.model, provider: response.provider, ...(metadata ? { responseMetadata: metadata } : {}), success: true };
  }

  async function trilingualTable(input: Parameters<EventOperationsAiProvider["generateTableContent"]>[0]): ReturnType<EventOperationsAiProvider["generateTableContent"]> {
    const memberIds = new Set(input.members.map((member) => member.participantId));
    const keyOf = new Map(input.members.map((member, index) => [member.participantId, `M${index + 1}`]));
    const keys = [...keyOf.values()];
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
    // Flat keys (2026-11-22): with a nested members object the model closed brackets early in 1 of 3 tables.
    const fields = ["theme", "rationale", "q1", "q2", "q3", ...keys.flatMap((key) => [`${key}.p1`, `${key}.p2`, `${key}.why`])];
    const shape = Object.fromEntries(fields.map((field) => [field, "…"]));
    let metadata: EventOperationsAiResponseMetadata | undefined;
    let feedback = "";
    let doc: Record<string, unknown> | null = null;
    let response!: Extract<Awaited<ReturnType<typeof runModelText>>, { success: true }>;
    for (let attempt = 1; attempt <= 2 && doc === null; attempt += 1) {
      const reply = await runModelText({
        config,
        systemInstruction: baseSystemInstruction,
        userText: `Write the texts for one already-assigned event table (round ${input.roundNumber}, table ${input.tableNumber}) in Japanese.

Requirements:
- theme: a concrete theme for this table. rationale: why these members work as a table. q1..q3: three icebreaker questions for the table.
- For every member key Mn: Mn.p1 and Mn.p2 are two questions for that person, addressed to them directly in polite Japanese (no names, no placeholders, no third person), and Mn.why is one sentence explaining why that person belongs at this table, stating only what the supplied profile says (a topic is an interest, not an ability).
- The only placeholders that exist are ${keys.map((key) => `{${key}}`).join(", ")} (the server adds the name and さん; company as {Mn:company} next to {Mn}, only when hasCompany=true). Use the supplied features and profiles.

JSON shape (exact keys):
${JSON.stringify(shape)}

Members:
${JSON.stringify(promptMembers)}
Bounded validated grouping features:
${JSON.stringify(promptFeatures)}${feedback}`,
      });
      if (reply.success === false) {
        const failure = modelFailure<never>(reply);
        const merged = mergeEventOperationsResponseMetadata(metadata, failure.success === false ? failure.responseMetadata : undefined);
        return (failure.success === false ? { ...failure, ...(merged ? { responseMetadata: merged } : {}) } : failure) as never;
      }
      response = reply;
      metadata = mergeEventOperationsResponseMetadata(metadata, metadataOf(reply));
      const json = parseJsonClosingTail(reply.text, reply.responseMetadata?.finishReason);
      const problem = json === null ? `json_${classifyJsonFailureShape(reply.text)}`
        : !(isRecord(json) && exactKeys(json, fields) && fields.every((field) => nonEmptyString(json[field]))) ? "base_shape" : "";
      if (!problem) { doc = json as Record<string, unknown>; break; }
      trilingualFailure({ kind: "table", stage: problem, text: reply.text, result: trilingualRetryable<never>("x") });
      feedback = `\n\nYour previous draft was rejected: return exactly one flat JSON object with exactly these keys, each a non-empty string, and nothing after it: ${fields.join(", ")}.`;
    }
    if (doc === null) return trilingualRetryable("The table base draft failed twice (shape).", metadata) as never;
    const allowed = new Set(keys);
    const normalize = (text: string) => normalizePlaceholders(text).replace(/\{(\d+)(:company)?\}/gu, (_match, key: string, company?: string) => `{M${key}${company ?? ""}}`);
    const base: Array<{ allowed: ReadonlySet<string>; asked?: string; id: string; text: string }> = [
      ...["theme", "rationale", "q1", "q2", "q3"].map((field) => ({ allowed, id: field, text: normalize(String(doc![field])) })),
      ...keys.flatMap((key) => [
        ...["p1", "p2"].map((field) => ({ allowed, asked: key, id: `${key}.${field}`, text: normalize(String(doc![`${key}.${field}`])) })),
        { allowed, id: `${key}.why`, text: normalize(String(doc![`${key}.why`])) },
      ]),
    ];
    const baseChecked = await checkAndRepairBase({ items: base, kind: "table", metadata, participants: input.members, text: response.text });
    if (baseChecked.ok === false) return baseChecked.result as never;
    metadata = baseChecked.metadata;
    const translated = await translateAndCheck({ base, kind: "table", metadata, participants: input.members, text: response.text });
    if (translated.ok === false) return translated.result as never;
    metadata = translated.metadata;
    const memberByKey = new Map(input.members.map((member) => [keyOf.get(member.participantId)!, member]));
    if (fillParticipantPlaceholders([...translated.sentences.values()], memberByKey).length) {
      return trilingualFailure({ kind: "table", stage: "fill", text: response.text, result: trilingualRetryable("A placeholder had no registered value.", metadata) });
    }
    const tables = {} as Record<TextLanguage, EventOperationsTable>;
    for (const language of TEXT_LANGUAGES) {
      const text = (id: string) => translated.sentences.get(id)![language];
      const table = parseTable({
        icebreakers: [text("q1"), text("q2"), text("q3")],
        memberPrompts: Object.fromEntries(input.members.map((member) => { const key = keyOf.get(member.participantId)!; return [member.participantId, [text(`${key}.p1`), text(`${key}.p2`)]]; })),
        memberRationales: Object.fromEntries(input.members.map((member) => [member.participantId, text(`${keyOf.get(member.participantId)!}.why`)])),
        // Seats are the program's: one per member in input order.
        members: input.members.map((member, index) => ({ participantId: member.participantId, seat: `R${input.roundNumber}-T${input.tableNumber}-S${index + 1}` })),
        rationale: text("rationale"),
        tableNumber: input.tableNumber,
        theme: text("theme"),
      }, memberIds);
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
