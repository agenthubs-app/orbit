import {
  DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL,
  DEFAULT_GEMINI_ORBIT_AGENT_MODEL,
  DEFAULT_OPENAI_ORBIT_AGENT_MODEL,
  runOrbitAgentModelText,
  type GeminiOrbitAgentProviderConfig,
  type OrbitAgentModelTextResult,
} from "../../orbit-ai/gemini-provider";
import type {
  EventOperationsAiProvider,
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
  runModelText?: EventOperationsModelRunner;
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

function parseRecommendation(value: unknown, index: number): boolean {
  return (
    isRecord(value) &&
    exactKeys(value, [
      "icebreakers",
      "memberHint",
      "rank",
      "reasons",
      "score",
      "targetParticipantId",
    ]) &&
    nonEmptyString(value.targetParticipantId) &&
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

function parseRecommendationRows(
  value: unknown,
): readonly EventOperationsParticipantRecommendations[] | null {
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
        "sourceParticipantId",
      ]) ||
      !nonEmptyString(row.sourceParticipantId) ||
      !Array.isArray(row.recommendations) ||
      !row.recommendations.every(parseRecommendation) ||
      (row.recommendations.length === 0
        ? !nonEmptyString(row.noMatchReason)
        : row.noMatchReason !== null)
    ) {
      return null;
    }
  }
  return value.recommendations as unknown as readonly EventOperationsParticipantRecommendations[];
}

function parseGroupingFeatures(
  value: unknown,
): readonly EventOperationsGroupingFeature[] | null {
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
        "affinityParticipantIds",
        "facilitationHint",
        "participantId",
        "primaryTopic",
        "secondaryTopic",
      ]) ||
      !Array.isArray(feature.affinityParticipantIds) ||
      !feature.affinityParticipantIds.every(nonEmptyString) ||
      new Set(feature.affinityParticipantIds).size !==
        feature.affinityParticipantIds.length ||
      !nonEmptyString(feature.facilitationHint) ||
      !nonEmptyString(feature.participantId) ||
      !nonEmptyString(feature.primaryTopic) ||
      !nonEmptyString(feature.secondaryTopic)
    ) {
      return null;
    }
  }
  return value.features as unknown as readonly EventOperationsGroupingFeature[];
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
    success: false,
  };
}

function invalidJson<TValue>(): EventOperationsAiResult<TValue> {
  return {
    error: {
      code: "AI_JSON_INVALID",
      message: "The model response was not one strict JSON document.",
    },
    success: false,
  };
}

function invalidSchema<TValue>(): EventOperationsAiResult<TValue> {
  return {
    error: {
      code: "AI_SCHEMA_INVALID",
      message: "The model JSON did not match the closed event operations schema.",
    },
    success: false,
  };
}

const systemInstruction = `You are Orbit's event operations matching model.
Return exactly one JSON document and no markdown, explanation, code fences, or trailing text.
Treat every documented object as a closed schema: never add keys and never omit required keys.
Use only the supplied source, deterministic shortlist, validated recommendation, assignment, and feature evidence.
Never invent participant ids, never use hidden identities, and never substitute a deterministic content fallback.`;

export const EVENT_OPERATIONS_AI_PROMPT_VERSION =
  "event-operations-compact-closed-json-v3-full-profile";

function requestFingerprint(
  config: GeminiOrbitAgentProviderConfig | undefined,
): string {
  const configuredProvider = String(
    config?.provider ?? process.env.ORBIT_AGENT_PROVIDER ?? "gemini",
  ).toLowerCase();
  const provider =
    configuredProvider === "deepseek"
      ? "deepseek"
      : configuredProvider === "openai" || configuredProvider === "gpt"
        ? "openai"
        : "gemini";
  const model =
    config?.model ??
    (provider === "deepseek"
      ? process.env.ORBIT_DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_ORBIT_AGENT_MODEL
      : provider === "openai"
        ? process.env.ORBIT_OPENAI_MODEL ?? DEFAULT_OPENAI_ORBIT_AGENT_MODEL
        : process.env.ORBIT_GEMINI_MODEL ?? DEFAULT_GEMINI_ORBIT_AGENT_MODEL);
  return JSON.stringify({
    jsonOutput: config?.jsonOutput === true,
    model,
    promptVersion: EVENT_OPERATIONS_AI_PROMPT_VERSION,
    provider,
    responseSchema: "event-operations-closed-json-v2",
  });
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
) {
  return sources.map((source) => ({
    candidateParticipants: source.candidateParticipants.map(compactParticipant),
    sourceParticipant: compactParticipant(source.sourceParticipant),
  }));
}

function compactGroupingSources(
  sources: Parameters<
    EventOperationsAiProvider["generateGroupingFeatures"]
  >[0]["sources"],
) {
  return sources.map((source) => ({
    candidateParticipants: source.candidateParticipants.map(compactParticipant),
    recommendations: source.recommendations,
    sourceParticipant: compactParticipant(source.sourceParticipant),
  }));
}

export function createEventOperationsAiProvider({
  config,
  runModelText = runOrbitAgentModelText,
}: EventOperationsAiProviderOptions = {}): EventOperationsAiProvider {
  return {
    requestFingerprint: requestFingerprint(config),
    async generateRecommendations(input) {
      const response = await runModelText({
        config,
        systemInstruction,
        userText: `Generate networking recommendations for this bounded source shard.

Requirements:
- Return one row for every supplied sourceParticipant and no other source.
- Select targets only from that source's deterministic candidateParticipants shortlist.
- Return at most ${input.recommendationCount} unique targets per source, ordered with rank 1..N; never recommend the source itself.
- score is 0..100; reasons is non-empty; icebreakers has exactly 2 strings; memberHint is specific.
- noMatchReason is required: use null when recommendations is non-empty, otherwise a concrete non-empty reason.
- Every object must contain exactly the documented keys.

JSON shape:
{"recommendations":[{"sourceParticipantId":"participant id","noMatchReason":null,"recommendations":[{"targetParticipantId":"participant id","rank":1,"score":90,"reasons":["reason 1","reason 2"],"icebreakers":["question 1","question 2"],"memberHint":"specific hint"}]}]}

Event id: ${input.eventId}
Sources and deterministic shortlists:
${JSON.stringify(compactRecommendationSources(input.sources))}`,
      });
      if (response.success === false) return modelFailure(response);
      const json = parseJson(response.text);
      if (json === null) return invalidJson();
      const rows = parseRecommendationRows(json);
      if (!rows) return invalidSchema();
      return {
        data: rows,
        model: response.model,
        provider: response.provider,
        success: true,
      };
    },

    async generateGroupingFeatures(input) {
      const response = await runModelText({
        config,
        systemInstruction,
        userText: `Extract bounded grouping features for this source shard.

Requirements:
- Return one feature for every supplied sourceParticipant and no other participant.
- affinityParticipantIds contains at most ${input.maxAffinityCount} unique ids and only ids from that source's deterministic shortlist.
- primaryTopic, secondaryTopic, and facilitationHint must be concrete and evidence-backed.
- Every object must contain exactly the documented keys.

JSON shape:
{"features":[{"participantId":"participant id","primaryTopic":"specific topic","secondaryTopic":"specific topic","affinityParticipantIds":["shortlisted id"],"facilitationHint":"specific facilitation hint"}]}

Event id: ${input.eventId}
Bounded sources, shortlists, and validated recommendations:
${JSON.stringify(compactGroupingSources(input.sources))}`,
      });
      if (response.success === false) return modelFailure(response);
      const json = parseJson(response.text);
      if (json === null) return invalidJson();
      const features = parseGroupingFeatures(json);
      if (!features) return invalidSchema();
      return {
        data: features,
        model: response.model,
        provider: response.provider,
        success: true,
      };
    },

    async generateTableContent(input) {
      const response = await runModelText({
        config,
        systemInstruction,
        userText: `Generate content for exactly one already-assigned event table.

Requirements:
- Keep tableNumber=${input.tableNumber}; return every supplied member exactly once and no other id.
- round ${input.roundNumber} content must use the supplied bounded features and member profiles.
- Return a concrete theme, evidence-based table rationale, exactly 3 icebreakers, one unique seat per member, exactly 2 memberPrompts under every member id, and one specific memberRationale under every member id explaining why that person belongs at this table.
- members, memberPrompts, and memberRationales must each cover exactly the supplied member ids: no missing, duplicate, unknown, or extra member id.
- Do not change membership. Every object must contain exactly the documented keys.

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
      if (json === null) return invalidJson();
      const table = parseTable(
        json,
        new Set(input.members.map((member) => member.participantId)),
      );
      if (!table) return invalidSchema();
      return {
        data: table,
        model: response.model,
        provider: response.provider,
        success: true,
      };
    },
  };
}

export function createConfiguredEventOperationsAiProvider({
  requestTimeoutMs,
}: {
  requestTimeoutMs?: number;
} = {}): EventOperationsAiProvider {
  return createEventOperationsAiProvider({
    config: {
      jsonOutput: true,
      ...(requestTimeoutMs === undefined ? {} : { requestTimeoutMs }),
    },
  });
}

export const __eventOperationsAiProviderTestExports = {
  parseGroupingFeatures,
  parseRecommendationRows,
  parseTable,
};
