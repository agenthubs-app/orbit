export interface AiRunProvenanceRecord {
  source: string;
  runId: string;
  providerMode: "mock-local-rules";
  promptTemplateId: string;
  inputHash: string;
  outputPreview: string;
  evidenceIds: readonly string[];
  sourceLabel: string;
  collectedAt: string;
  privacy: "demo-ai-provider-mock-only";
  generationMethod:
    | "fixture"
    | "rule-based-message-draft"
    | "rule-based-summary"
    | "rule-based-state";
  fallbackUsed: boolean;
  modelCallExecuted: false;
  liveAiProviderRequested: false;
  externalNetworkRequested: false;
  emailProviderRequested: false;
  calendarProviderRequested: false;
  notificationProviderRequested: false;
  deviceRequested: false;
  liveDatabaseReadExecuted: false;
  liveDatabaseWriteExecuted: false;
  productionAuditLogWriteExecuted: false;
}

const mockOnlyExecutionFlags = {
  modelCallExecuted: false,
  liveAiProviderRequested: false,
  externalNetworkRequested: false,
  emailProviderRequested: false,
  calendarProviderRequested: false,
  notificationProviderRequested: false,
  deviceRequested: false,
  liveDatabaseReadExecuted: false,
  liveDatabaseWriteExecuted: false,
  productionAuditLogWriteExecuted: false,
} as const;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => {
        const record = value as Record<string, unknown>;

        return `${JSON.stringify(key)}:${stableStringify(record[key])}`;
      })
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

export function createMockInputHash(input: unknown): `mock-sha256-${string}` {
  const serialized = stableStringify(input);
  let hash = 2166136261;

  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `mock-sha256-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function buildMockAiRunProvenance(input: {
  source: string;
  runId: string;
  promptTemplateId: string;
  inputHash: string;
  outputPreview: string;
  evidenceIds: readonly string[];
  sourceLabel: string;
  collectedAt: string;
  generationMethod: AiRunProvenanceRecord["generationMethod"];
  fallbackUsed: boolean;
}): AiRunProvenanceRecord {
  return {
    source: input.source,
    runId: input.runId,
    providerMode: "mock-local-rules",
    promptTemplateId: input.promptTemplateId,
    inputHash: input.inputHash,
    outputPreview: input.outputPreview,
    evidenceIds: input.evidenceIds,
    sourceLabel: input.sourceLabel,
    collectedAt: input.collectedAt,
    privacy: "demo-ai-provider-mock-only",
    generationMethod: input.generationMethod,
    fallbackUsed: input.fallbackUsed,
    ...mockOnlyExecutionFlags,
  };
}
