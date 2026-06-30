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

// Chat writing assist mock 用本地规则生成改写、跟进、约时间和问候建议。
// 它不调用模型，也不会发送消息；所有输出都必须先经过用户复核。
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
  // 只有调用方显式传了空字符串才算输入错误；缺省值会走 demo fixture。
  return (
    Object.prototype.hasOwnProperty.call(input, key) &&
    typeof input[key] === "string" &&
    !input[key]?.trim()
  );
}

function fixtureForKind(
  kind: ChatWritingAssistKind,
): ChatWritingAssistSuggestion {
  // 每种 writing assist 都必须有对应 fixture，缺失说明 mock 数据不完整。
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
  // participantName / organization 允许调用方覆盖，用于让 demo 文案看起来贴合当前上下文。
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
  // payload 保留 provenance 和 nextAction，强调草稿生成后仍需确认。
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
  // 显式空输入返回统一 required failure，避免生成无来源的建议。
  if (hasExplicitBlankText(input, key)) {
    return failure("CHAT_WRITING_ASSIST_INPUT_REQUIRED");
  }

  return null;
}

export function createMockChatWritingAssistService(): ChatWritingAssistService {
  return {
    rewritePolitely(input = {}): ChatWritingAssistResult {
      // 礼貌改写需要 sourceText；缺省时用 demo 文本，显式空文本失败。
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
      // 跟进草稿基于 contextNote；输出仍只是草稿，不发送外部消息。
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
      // 约时间建议基于 preferredWindow；显式空窗口返回 required failure。
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
      // 快速问候不要求额外文本，主要演示个性化字段覆盖。
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
