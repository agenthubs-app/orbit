import {
  AI_PROVIDER_ERROR_DEFINITIONS,
  AI_PROVIDER_PROMPT_TEMPLATE_IDS,
  mockAiProviderFailureProvenance,
  mockAiProviderFixture,
  mockAiProviderProvenance,
  mockAiProviderRuns,
  mockEmptyAiProviderFixture,
  mockPendingAiProviderFixture,
  type AiProviderErrorCode,
  type AiProviderFailure,
  type AiProviderMessageDraftInput,
  type AiProviderPayload,
  type AiProviderResult,
  type AiProviderRunLookupInput,
  type AiProviderRunRecord,
  type AiProviderRunResult,
  type AiProviderScenario,
  type AiProviderService,
  type PromptTemplateId,
} from "./provider";
import { buildMockAiRunProvenance, createMockInputHash } from "./provenance";

const supportedScenarios = new Set<AiProviderScenario>([
  "success",
  "empty",
  "pending",
  "failure",
]);

function clonePayload<TPayload>(payload: TPayload): TPayload {
  return JSON.parse(JSON.stringify(payload)) as TPayload;
}

function success(data: AiProviderPayload): AiProviderResult {
  return {
    success: true,
    data: clonePayload(data),
  };
}

function runSuccess(run: AiProviderRunRecord): AiProviderRunResult {
  return {
    success: true,
    data: {
      state: "success",
      run: clonePayload(run),
      summary:
        "Returned one deterministic mock AI run with prompt template id, input hash, output, fallback behavior, and provenance.",
      provenance: clonePayload(run.provenance),
      nextAction:
        "Review run provenance before replacing the mock provider boundary.",
    },
  };
}

function failure(code: AiProviderErrorCode): AiProviderFailure {
  const definition = AI_PROVIDER_ERROR_DEFINITIONS[code];

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance: mockAiProviderFailureProvenance,
      evidenceIds: mockAiProviderFailureProvenance.evidenceIds,
    },
  };
}

function normalizeScenario(
  scenario?:
    | AiProviderMessageDraftInput["scenario"]
    | AiProviderRunLookupInput["scenario"],
): AiProviderScenario {
  if (scenario && supportedScenarios.has(scenario as AiProviderScenario)) {
    return scenario as AiProviderScenario;
  }

  return "success";
}

function scenarioResult(
  scenario: AiProviderScenario,
): AiProviderResult | null {
  switch (scenario) {
    case "empty":
      return success(mockEmptyAiProviderFixture);
    case "pending":
      return success(mockPendingAiProviderFixture);
    case "failure":
      return failure("AI_PROVIDER_MOCK_FAILED");
    case "success":
    default:
      return null;
  }
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function hasExplicitBlankText(
  input: AiProviderMessageDraftInput,
  key: keyof Pick<AiProviderMessageDraftInput, "relationshipContext">,
): boolean {
  return (
    Object.prototype.hasOwnProperty.call(input, key) &&
    typeof input[key] === "string" &&
    !input[key]?.trim()
  );
}

function isPromptTemplateId(value: unknown): value is PromptTemplateId {
  return (
    typeof value === "string" &&
    AI_PROVIDER_PROMPT_TEMPLATE_IDS.includes(value as PromptTemplateId)
  );
}

function uniqueEvidenceIds(
  run: AiProviderRunRecord,
  input: AiProviderMessageDraftInput,
): readonly string[] {
  const inputEvidenceIds = Array.isArray(input.sourceEvidenceIds)
    ? input.sourceEvidenceIds.filter((item): item is string => Boolean(item))
    : [];

  return [...new Set([...run.evidenceIds, ...inputEvidenceIds])];
}

function messageDraftText(input: {
  desiredOutcome: string;
  recipientName: string;
  relationshipContext: string;
}): string {
  return `Hi ${input.recipientName}, following up on this context: ${input.relationshipContext} I can help with ${input.desiredOutcome}.`;
}

function generatedRun(input: AiProviderMessageDraftInput): AiProviderRunRecord {
  const requestedPromptTemplateId = readText(input.promptTemplateId);
  const fallbackUsed = Boolean(
    requestedPromptTemplateId &&
      !isPromptTemplateId(requestedPromptTemplateId),
  );
  const promptTemplateId = isPromptTemplateId(requestedPromptTemplateId)
    ? requestedPromptTemplateId
    : "orbit.message-draft.followup.v1";
  const recipientName = readText(input.recipientName) ?? "Maya Chen";
  const relationshipContext =
    readText(input.relationshipContext) ??
    "Maya asked for the pilot timing comparison after breakfast.";
  const desiredOutcome =
    readText(input.desiredOutcome) ??
    "Send the pilot timing comparison before the operator review.";
  const text = fallbackUsed
    ? `Hi ${recipientName}, I captured the source-backed context and prepared a conservative follow-up because the requested prompt template was not available.`
    : messageDraftText({
        desiredOutcome,
        recipientName,
        relationshipContext,
      });
  const baseRun = mockAiProviderRuns[0];
  const evidenceIds = uniqueEvidenceIds(baseRun, input);
  const inputHash = createMockInputHash({
    desiredOutcome,
    promptTemplateId,
    recipientName,
    relationshipContext,
  });

  return {
    ...baseRun,
    runId: "demo-ai-run-generated",
    promptTemplateId,
    inputHash,
    output: {
      kind: "message_draft",
      text,
      structured: {
        desiredOutcome,
        recipientName,
        relationshipContext,
      },
      fallbackUsed,
    },
    fallbackBehavior: {
      used: fallbackUsed,
      reason: fallbackUsed
        ? "Unsupported prompt template resolved to the local safe message-draft fallback."
        : "Supported prompt template matched relationship context.",
      output: fallbackUsed ? text : "",
    },
    evidenceIds,
    provenance: buildMockAiRunProvenance({
      source: mockAiProviderProvenance.source,
      runId: "demo-ai-run-generated",
      promptTemplateId,
      inputHash,
      outputPreview: text.slice(0, 120),
      evidenceIds,
      sourceLabel: fallbackUsed
        ? "Fallback AI provider mock message draft"
        : "Generated AI provider mock message draft",
      collectedAt: mockAiProviderProvenance.collectedAt,
      generationMethod: "rule-based-message-draft",
      fallbackUsed,
    }),
  };
}

function payloadForRun(run: AiProviderRunRecord): AiProviderPayload {
  return {
    ...mockAiProviderFixture,
    runs: [run],
    summary:
      "Local rules prepared one AI-shaped message draft with prompt template id, input hash, output, fallback behavior, and run provenance.",
    provenance: run.provenance,
    nextAction:
      "Review source evidence, prompt template id, input hash, output, and fallback behavior before wiring a live provider.",
  };
}

export function createMockAiProviderService(): AiProviderService {
  return {
    draftMessage(input = {}): AiProviderResult {
      const scenario = scenarioResult(normalizeScenario(input.scenario));

      if (scenario) {
        return scenario;
      }

      if (hasExplicitBlankText(input, "relationshipContext")) {
        return failure("AI_PROVIDER_INPUT_REQUIRED");
      }

      return success(payloadForRun(generatedRun(input)));
    },

    getRun(input): AiProviderRunResult {
      const scenario = normalizeScenario(input.scenario);

      if (scenario === "failure") {
        return failure("AI_PROVIDER_MOCK_FAILED");
      }

      const runId = readText(input.runId);

      if (!runId) {
        return failure("AI_PROVIDER_INPUT_REQUIRED");
      }

      const run = mockAiProviderRuns.find((item) => item.runId === runId);

      if (!run) {
        return failure("AI_PROVIDER_RUN_NOT_FOUND");
      }

      return runSuccess(run);
    },
  };
}

export type { AiProviderResult, AiProviderRunResult };
