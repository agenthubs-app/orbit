import {
  CHAT_WRITING_ASSIST_DEFAULT_SOURCE_TEXT,
  CHAT_WRITING_ASSIST_ERROR_DEFINITIONS,
  mockChatWritingAssistFailureProvenance,
  mockChatWritingAssistFixture,
  mockChatWritingAssistProvenance,
  mockChatWritingAssists,
  mockEmptyChatWritingAssistFixture,
  mockPendingChatWritingAssistFixture,
  type ChatWritingAssistFailure,
  type ChatWritingAssistInput,
  type ChatWritingAssistKind,
  type ChatWritingAssistPayload,
  type ChatWritingAssistProvenance,
  type ChatWritingAssistResult,
  type ChatWritingAssistScenario,
  type ChatWritingAssistService,
  type ChatWritingAssistSuggestion,
  type ChatWritingAssistErrorCode,
} from "./assist-contract";

const supportedScenarios = new Set<ChatWritingAssistScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(data: ChatWritingAssistPayload): ChatWritingAssistResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function failure(
  code: ChatWritingAssistErrorCode,
): ChatWritingAssistFailure {
  const definition = CHAT_WRITING_ASSIST_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockChatWritingAssistFailureProvenance,
      evidenceIds: mockChatWritingAssistFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?: ChatWritingAssistInput["scenario"],
): ChatWritingAssistScenario {
  if (
    scenario &&
    supportedScenarios.has(scenario as ChatWritingAssistScenario)
  ) {
    return scenario as ChatWritingAssistScenario;
  }

  return "success";
}

function scenarioResult(
  scenario: ChatWritingAssistScenario,
): ChatWritingAssistResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyChatWritingAssistFixture);
    case "pending":
      return success(mockPendingChatWritingAssistFixture);
    case "failure":
      return failure("CHAT_WRITING_ASSIST_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasExplicitBlankText(
  input: ChatWritingAssistInput,
  key: keyof Pick<
    ChatWritingAssistInput,
    "contextNote" | "preferredWindow" | "sourceText"
  >,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, key) &&
    typeof input[key] === "string" &&
    !input[key]?.trim()
  );
}

function fixtureForKind(
  kind: ChatWritingAssistKind,
): ChatWritingAssistSuggestion {
  const assist = mockChatWritingAssists.find((item) => item.kind === kind);

  if (!assist) {
    throw new Error(`Missing chat writing assist fixture for ${kind}`);
  }

  return assist;
}

function uniqueEvidenceIds(
  assists: readonly ChatWritingAssistSuggestion[],
): readonly string[] {
  if (assists.length === 0) {
    return ["evidence:chat-assist:empty"];
  }

  return [...new Set(assists.flatMap((assist) => assist.evidenceIds))];
}

function provenanceForAssists(input: {
  assists: readonly ChatWritingAssistSuggestion[];
  generationMethod: ChatWritingAssistProvenance["generationMethod"];
  sourceLabel: string;
}): ChatWritingAssistProvenance {
  return {
    ...mockChatWritingAssistProvenance,
    evidenceIds: uniqueEvidenceIds(input.assists),
    generationMethod: input.generationMethod,
    sourceLabel: input.sourceLabel,
  };
}

function personalizeCommon(
  assist: ChatWritingAssistSuggestion,
  input: ChatWritingAssistInput,
): ChatWritingAssistSuggestion {
  const participantName = readText(input.participantName);
  const organization = readText(input.organization);

  return {
    ...assist,
    participantName: participantName ?? assist.participantName,
    organization: organization ?? assist.organization,
  };
}

function politeRewrite(
  input: ChatWritingAssistInput,
): ChatWritingAssistSuggestion {
  const base = personalizeCommon(fixtureForKind("polite_rewrite"), input);
  const sourceText =
    readText(input.sourceText) ?? CHAT_WRITING_ASSIST_DEFAULT_SOURCE_TEXT;

  return {
    ...base,
    originalText: sourceText,
    suggestedText: `Hi ${base.participantName}, thanks for the context. I will send the pilot timing comparison with the operator-readiness notes attached.`,
  };
}

function followupDraft(
  input: ChatWritingAssistInput,
): ChatWritingAssistSuggestion {
  const base = personalizeCommon(fixtureForKind("follow_up_draft"), input);
  const contextNote =
    readText(input.contextNote) ??
    "Maya asked for the pilot timing comparison after breakfast.";

  return {
    ...base,
    originalText: contextNote,
    suggestedText: `Hi ${base.participantName}, following up from breakfast: I pulled together the pilot timing comparison from our last conversation. Which operator question should I prioritize for ${base.organization}?`,
  };
}

function appointmentSuggestion(
  input: ChatWritingAssistInput,
): ChatWritingAssistSuggestion {
  const base = personalizeCommon(
    fixtureForKind("appointment_suggestion"),
    input,
  );
  const preferredWindow =
    readText(input.preferredWindow) ?? "Tuesday afternoon";

  return {
    ...base,
    suggestedText: `Would ${preferredWindow} work for a 20-minute working session on the Japanese expansion case study?`,
  };
}

function quickGreeting(
  input: ChatWritingAssistInput,
): ChatWritingAssistSuggestion {
  const base = personalizeCommon(fixtureForKind("quick_greeting"), input);

  return {
    ...base,
    suggestedText: `Hi ${base.participantName}, good to reconnect after the operator breakfast with ${base.organization}.`,
  };
}

function buildPayload(input: {
  assists: readonly ChatWritingAssistSuggestion[];
  generationMethod: ChatWritingAssistProvenance["generationMethod"];
  sourceLabel: string;
  summary: string;
}): ChatWritingAssistPayload {
  return {
    ...mockChatWritingAssistFixture,
    state: "success",
    assists: input.assists,
    summary: input.summary,
    provenance: provenanceForAssists({
      assists: input.assists,
      generationMethod: input.generationMethod,
      sourceLabel: input.sourceLabel,
    }),
    nextAction:
      "Review source evidence and confirmation requirements before any external send action.",
  };
}

function resultFor(input: {
  assist: ChatWritingAssistSuggestion;
  generationMethod: ChatWritingAssistProvenance["generationMethod"];
  sourceLabel: string;
  summary: string;
}): ChatWritingAssistResult {
  return success(
    buildPayload({
      assists: [input.assist],
      generationMethod: input.generationMethod,
      sourceLabel: input.sourceLabel,
      summary: input.summary,
    }),
  );
}

function validateRequiredText(
  input: ChatWritingAssistInput,
  key: keyof Pick<
    ChatWritingAssistInput,
    "contextNote" | "preferredWindow" | "sourceText"
  >,
): ChatWritingAssistResult | null {
  if (hasExplicitBlankText(input, key)) {
    return failure("CHAT_WRITING_ASSIST_INPUT_REQUIRED");
  }

  return null;
}

export function createMockChatWritingAssistService(): ChatWritingAssistService {
  return {
    rewritePolitely(input = {}): ChatWritingAssistResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const validation = validateRequiredText(input, "sourceText");

      if (validation) {
        return validation;
      }

      return resultFor({
        assist: politeRewrite(input),
        generationMethod: "rule-based-politeness-rewrite",
        sourceLabel: "Mock chat polite rewrite rule",
        summary:
          "Local rules prepared one polite rewrite from source-backed chat context.",
      });
    },

    draftFollowup(input = {}): ChatWritingAssistResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const validation = validateRequiredText(input, "contextNote");

      if (validation) {
        return validation;
      }

      return resultFor({
        assist: followupDraft(input),
        generationMethod: "rule-based-follow-up-draft",
        sourceLabel: "Mock chat follow-up draft rule",
        summary:
          "Local rules prepared one follow-up draft from source-backed chat context.",
      });
    },

    suggestAppointment(input = {}): ChatWritingAssistResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      const validation = validateRequiredText(input, "preferredWindow");

      if (validation) {
        return validation;
      }

      return resultFor({
        assist: appointmentSuggestion(input),
        generationMethod: "rule-based-appointment-suggestion",
        sourceLabel: "Mock chat appointment suggestion rule",
        summary:
          "Local rules prepared one appointment suggestion from source-backed chat context.",
      });
    },

    createQuickGreeting(input = {}): ChatWritingAssistResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      return resultFor({
        assist: quickGreeting(input),
        generationMethod: "rule-based-quick-greeting",
        sourceLabel: "Mock chat quick greeting rule",
        summary:
          "Local rules prepared one quick greeting from source-backed chat context.",
      });
    },
  };
}

export type { ChatWritingAssistResult };
