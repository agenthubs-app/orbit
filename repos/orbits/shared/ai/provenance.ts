// shared/ai/provenance 记录旧 AI mock provider 的可审计运行信息。
// 这里的 providerMode 固定为 mock-local-rules，明确说明没有真实模型、网络或数据库调用。
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

  // 所有 mock AI run 都必须继承这组 false 标记。
  // live provider 接入时不能复用这些 provenance 字段来伪装安全账本。
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
