// shared/ai/provenance 记录旧 AI mock provider 和 live provider 边界的可审计运行信息。
// live provider 尚未配置或不受支持时，也必须返回显式 provenance，而不是静默回退 mock。
export interface AiRunProvenanceRecord {
  source: string;
  runId: string;
  providerMode:
    | "mock-local-rules"
    | "live-provider-unconfigured"
    | "live-provider-unsupported";
  promptTemplateId: string;
  inputHash: string;
  outputPreview: string;
  evidenceIds: readonly string[];
  sourceLabel: string;
  collectedAt: string;
  privacy: "demo-ai-provider-mock-only" | "live-ai-provider-boundary";
  generationMethod:
    | "fixture"
    | "rule-based-message-draft"
    | "rule-based-summary"
    | "rule-based-state"
    | "live-provider-state";
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
  // 当前 mock 和 fail-closed live boundary 都必须继承这组 false 标记。
  // 未来真正 provider 接入时需要单独的 execution ledger，不得伪装成未请求 provider。
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
  // inputHash 需要跨运行稳定，所以对象 key 按字典序序列化。
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
  // 这里用轻量 FNV 风格哈希，只用于 mock 可重复标识，不用于安全校验。
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
  // provenance builder 是唯一创建 AiRunProvenanceRecord 的出口，确保 mock-only flags 不漏字段。
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

export function buildLiveAiProviderBoundaryProvenance(input: {
  evidenceIds: readonly string[];
  inputHash?: string;
  outputPreview: string;
  promptTemplateId?: string | null;
  providerId?: string | null;
  providerMode:
    | "live-provider-unconfigured"
    | "live-provider-unsupported";
  runId: string;
}): AiRunProvenanceRecord {
  const providerId = input.providerId?.trim();

  return {
    source: providerId
      ? `live-ai-provider:${providerId}:blocked`
      : "live-ai-provider:unconfigured",
    runId: input.runId,
    providerMode: input.providerMode,
    promptTemplateId: input.promptTemplateId?.trim() || "unselected",
    inputHash: input.inputHash ?? "live-provider-input-not-sent",
    outputPreview: input.outputPreview,
    evidenceIds:
      input.evidenceIds.length > 0
        ? input.evidenceIds
        : ["evidence:ai-provider:live-boundary"],
    sourceLabel:
      input.providerMode === "live-provider-unsupported"
        ? "Unsupported live AI provider boundary"
        : "Unconfigured live AI provider boundary",
    collectedAt: new Date(0).toISOString(),
    privacy: "live-ai-provider-boundary",
    generationMethod: "live-provider-state",
    fallbackUsed: false,
    ...mockOnlyExecutionFlags,
  };
}
