import {
  AI_PROVIDER_ERROR_DEFINITIONS,
  type AiProviderErrorCode,
  type AiProviderFailure,
  type AiProviderMessageDraftInput,
  type AiProviderRunLookupInput,
  type AiProviderRunResult,
  type AiProviderResult,
  type AiProviderService,
} from "./provider";
import { buildLiveAiProviderBoundaryProvenance } from "./provenance";

export interface LiveAiProviderEnv {
  ORBIT_AI_PROVIDER?: string;
}

export interface LiveAiProviderServiceOptions {
  env?: LiveAiProviderEnv;
}

const approvedProviderIds = new Set(["anthropic", "deepseek", "openai"]);

function providerIdFrom(env: LiveAiProviderEnv): string | null {
  const providerId = env.ORBIT_AI_PROVIDER?.trim().toLowerCase();

  return providerId && providerId.length > 0 ? providerId : null;
}

function codeForProvider(providerId: string | null): AiProviderErrorCode {
  return providerId && !approvedProviderIds.has(providerId)
    ? "AI_PROVIDER_LIVE_PROVIDER_UNSUPPORTED"
    : "AI_PROVIDER_LIVE_PROVIDER_UNCONFIGURED";
}

function evidenceIdsFrom(
  input?: AiProviderMessageDraftInput | AiProviderRunLookupInput,
): readonly string[] {
  if (input && "sourceEvidenceIds" in input && Array.isArray(input.sourceEvidenceIds)) {
    return input.sourceEvidenceIds.filter(
      (evidenceId): evidenceId is string =>
        typeof evidenceId === "string" && evidenceId.trim().length > 0,
    );
  }

  return [];
}

function failure(input: {
  code: AiProviderErrorCode;
  input?: AiProviderMessageDraftInput | AiProviderRunLookupInput;
  providerId: string | null;
  runId: string;
}): AiProviderFailure {
  const definition = AI_PROVIDER_ERROR_DEFINITIONS[input.code];
  const providerMode =
    input.code === "AI_PROVIDER_LIVE_PROVIDER_UNSUPPORTED"
      ? "live-provider-unsupported"
      : "live-provider-unconfigured";
  const provenance = buildLiveAiProviderBoundaryProvenance({
    evidenceIds: evidenceIdsFrom(input.input),
    outputPreview: "No live AI provider request was sent.",
    promptTemplateId:
      input.input && "promptTemplateId" in input.input
        ? input.input.promptTemplateId
        : null,
    providerId: input.providerId,
    providerMode,
    runId: input.runId,
  });

  return {
    success: false,
    error: {
      ...definition,
      state: "failure",
      provenance,
      evidenceIds: provenance.evidenceIds,
    },
  };
}

export function createLiveAiProviderService({
  env = process.env,
}: LiveAiProviderServiceOptions = {}): AiProviderService {
  return {
    draftMessage(input = {}): AiProviderResult {
      const providerId = providerIdFrom(env);

      return failure({
        code: codeForProvider(providerId),
        input,
        providerId,
        runId: "live-ai-provider-draft-blocked",
      });
    },

    getRun(input): AiProviderRunResult {
      const providerId = providerIdFrom(env);

      return failure({
        code: codeForProvider(providerId),
        input,
        providerId,
        runId: input.runId?.trim() || "live-ai-provider-run-blocked",
      });
    },
  };
}
