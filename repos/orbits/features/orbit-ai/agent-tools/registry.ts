import type {
  OrbitAgentArtifactKind,
  OrbitAgentArtifactPayload,
  OrbitAgentArtifactSourceModule,
} from "../artifact-contract";
import type { OrbitAiTraceRenderHint } from "../trace-contract";
import type { ModuleMode } from "../../../shared/services/module-mode";
import {
  AGENT_READ_TOOL_NAMES,
  type AgentReadToolName,
} from "../../agent/capabilities/contract";

export type OrbitAgentToolRiskLevel = "read" | "draft" | "write" | "external";

export const ORBIT_AGENT_TOOL_NAMES = AGENT_READ_TOOL_NAMES;

export type OrbitAgentToolName = AgentReadToolName;

export interface ValidatorResult<TValue> {
  success: boolean;
  data?: TValue;
  error?: string;
}

export interface Validator<TValue> {
  parse: (value: unknown) => ValidatorResult<TValue>;
  jsonSchema: Readonly<Record<string, unknown>>;
}

export interface OrbitAgentToolInput {
  query: string;
  locale?: "zh" | "en";
  searchTerms?: string;
  domains?: readonly string[];
  limit?: number;
}

export interface OrbitAgentToolExecutionContext {
  mode: ModuleMode;
  executeArtifactTool: (
    toolName: OrbitAgentToolName,
    input: OrbitAgentToolInput,
  ) => Promise<OrbitAgentArtifactPayload>;
}

export interface ToolAuditPolicy {
  recordInput: boolean;
  recordOutput: boolean;
  redactFields: readonly string[];
}

export interface OrbitAgentToolMetadata {
  artifactKind: OrbitAgentArtifactKind;
  descriptionZh: string;
  inputSpecZh: string;
  inputSchema: Validator<OrbitAgentToolInput>;
  outputSchema: Validator<OrbitAgentArtifactPayload>;
  outputSpecZh: string;
  renderHint: OrbitAiTraceRenderHint | string;
  requiresConfirmation: boolean;
  riskLevel: OrbitAgentToolRiskLevel;
  allowedModes: readonly ModuleMode[];
  timeoutMs: number;
  sourceModules: readonly OrbitAgentArtifactSourceModule[];
  specificationZh: string;
  toolFamily: "events" | "contacts" | "followups" | "relationship_chat";
  toolName: OrbitAgentToolName;
  execute: (
    input: OrbitAgentToolInput,
    context: OrbitAgentToolExecutionContext,
  ) => Promise<OrbitAgentArtifactPayload>;
  redactObservation: (output: OrbitAgentArtifactPayload) => unknown;
  auditPolicy: ToolAuditPolicy;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const toolInputSchema: Validator<OrbitAgentToolInput> = {
  jsonSchema: {
    type: "object",
    required: ["query"],
    additionalProperties: false,
    properties: {
      query: { type: "string", minLength: 1, maxLength: 2_000 },
      locale: { type: "string", enum: ["zh", "en"] },
      searchTerms: { type: "string", maxLength: 500 },
      domains: {
        type: "array",
        maxItems: 5,
        items: { type: "string", maxLength: 64 },
      },
      limit: { type: "integer", minimum: 1, maximum: 10 },
    },
  },
  parse(value) {
    if (!isRecord(value) || typeof value.query !== "string") {
      return { success: false, error: "query is required" };
    }
    const query = value.query.trim();
    if (!query || query.length > 2_000) {
      return { success: false, error: "query must contain 1-2000 characters" };
    }
    const locale =
      value.locale === "zh" || value.locale === "en"
        ? value.locale
        : undefined;
    const searchTerms =
      typeof value.searchTerms === "string"
        ? value.searchTerms.trim().slice(0, 500)
        : undefined;
    const domains = Array.isArray(value.domains)
      ? value.domains
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim().slice(0, 64))
          .filter(Boolean)
          .slice(0, 5)
      : undefined;
    const limit =
      typeof value.limit === "number" && Number.isFinite(value.limit)
        ? Math.min(10, Math.max(1, Math.floor(value.limit)))
        : undefined;

    return {
      success: true,
      data: { query, locale, searchTerms, domains, limit },
    };
  },
};

const artifactOutputSchema: Validator<OrbitAgentArtifactPayload> = {
  jsonSchema: {
    type: "object",
    required: ["task", "result"],
    additionalProperties: true,
  },
  parse(value) {
    if (
      !isRecord(value) ||
      !isRecord(value.task) ||
      !isRecord(value.result)
    ) {
      return {
        success: false,
        error: "tool output must contain task and result objects",
      };
    }
    return { success: true, data: value as unknown as OrbitAgentArtifactPayload };
  },
};

const commonToolFields = {
  inputSchema: toolInputSchema,
  outputSchema: artifactOutputSchema,
  allowedModes: ["mock", "hybrid", "live"] as const,
  timeoutMs: 12_000,
  auditPolicy: {
    recordInput: true,
    recordOutput: true,
    redactFields: ["messageBody", "rawEmail", "privateMemo", "audio"],
  },
  redactObservation(output: OrbitAgentArtifactPayload) {
    return {
      artifactId: output.task.artifactId,
      kind: output.task.kind,
      status: output.result.status,
      evidenceIds: output.result.provenance.evidenceIds,
    };
  },
} satisfies Partial<OrbitAgentToolMetadata>;

function executeTool(
  toolName: OrbitAgentToolName,
  input: OrbitAgentToolInput,
  context: OrbitAgentToolExecutionContext,
): Promise<OrbitAgentArtifactPayload> {
  return context.executeArtifactTool(toolName, input);
}

export const ORBIT_AGENT_TOOL_CATALOG = [
  {
    ...commonToolFields,
    artifactKind: "event_recommendations",
    descriptionZh:
      "根据活动上下文推荐值得复核的活动、参会目标和下一步准备事项。",
    inputSpecZh:
      "输入：query 用户请求；locale zh/en；可选活动主题、时间窗口或关系目标。",
    outputSpecZh:
      "输出：event_recommendations artifact，包含推荐理由、来源模块、证据 ID、可复核 action。",
    renderHint: "artifact_panel",
    requiresConfirmation: true,
    riskLevel: "read",
    sourceModules: ["orbit-ai", "events"],
    specificationZh:
      "只读取活动和关系上下文并生成推荐视图；不会报名、发消息、写日历或修改数据库。任何外部动作必须另走确认。",
    toolFamily: "events",
    toolName: "events.recommend",
    execute: (input, context) =>
      executeTool("events.recommend", input, context),
  },
  {
    ...commonToolFields,
    artifactKind: "contact_recommendations",
    descriptionZh:
      "根据关系图谱和已确认来源推荐可联系的人脉或介绍路径。",
    inputSpecZh:
      "输入：query 用户目标；locale zh/en；可选行业、主题、联系人姓名或关系范围。",
    outputSpecZh:
      "输出：contact_recommendations artifact，包含联系人、匹配理由、来源模块、证据 ID、待确认 action。",
    renderHint: "artifact_panel",
    requiresConfirmation: true,
    riskLevel: "read",
    sourceModules: ["orbit-ai", "contacts"],
    specificationZh:
      "只读取联系人和关系证据并生成推荐；不能发明联系人事实，不能写联系人资料，不能外发联系方式。",
    toolFamily: "contacts",
    toolName: "contacts.recommend",
    execute: (input, context) =>
      executeTool("contacts.recommend", input, context),
  },
  {
    ...commonToolFields,
    artifactKind: "followup_queue",
    descriptionZh:
      "复核跟进队列，找出本周、逾期或沉睡关系中的下一步机会。",
    inputSpecZh:
      "输入：query 用户请求；locale zh/en；可选时间范围、优先级或跟进类型。",
    outputSpecZh:
      "输出：followup_queue artifact，包含跟进候选、排序理由、来源证据、需要确认的后续动作。",
    renderHint: "artifact_panel",
    requiresConfirmation: true,
    riskLevel: "read",
    sourceModules: ["orbit-ai", "followups"],
    specificationZh:
      "只读取跟进候选并生成复核视图；不会创建任务、发送提醒或投递通知。任务写入必须经过确认。",
    toolFamily: "followups",
    toolName: "followups.reviewQueue",
    execute: (input, context) =>
      executeTool("followups.reviewQueue", input, context),
  },
  {
    ...commonToolFields,
    artifactKind: "relationship_chat_context",
    descriptionZh:
      "整理关系聊天上下文，用于解释关系来源、准备消息草稿或复核对话线索。",
    inputSpecZh:
      "输入：query 用户问题；locale zh/en；可选联系人、会话、草稿目标或上下文范围。",
    outputSpecZh:
      "输出：relationship_chat_context artifact，包含关系摘要、可引用上下文、来源证据和草稿类 action。",
    renderHint: "artifact_panel",
    requiresConfirmation: true,
    riskLevel: "read",
    sourceModules: ["orbit-ai", "chat"],
    specificationZh:
      "只读取关系聊天上下文并准备可复核结果；不会发送消息、保存隐私设置、删除记录或跨关系泄露内容。",
    toolFamily: "relationship_chat",
    toolName: "chat.context",
    execute: (input, context) =>
      executeTool("chat.context", input, context),
  },
] as const satisfies readonly OrbitAgentToolMetadata[];

export function getOrbitAgentToolMetadata(
  toolName: string,
): OrbitAgentToolMetadata | null {
  return (
    ORBIT_AGENT_TOOL_CATALOG.find((tool) => tool.toolName === toolName) ?? null
  );
}

export async function executeOrbitAgentTool(input: {
  toolName: string;
  arguments: unknown;
  context: OrbitAgentToolExecutionContext;
}): Promise<{
  output: OrbitAgentArtifactPayload;
  observation: unknown;
}> {
  const tool = getOrbitAgentToolMetadata(input.toolName);
  if (!tool) {
    throw new Error(`Unknown Orbit Agent tool: ${input.toolName}`);
  }
  if (!tool.allowedModes.includes(input.context.mode)) {
    throw new Error(
      `Orbit Agent tool ${tool.toolName} is not allowed in ${input.context.mode} mode.`,
    );
  }
  if (tool.riskLevel === "write" || tool.riskLevel === "external") {
    throw new Error(
      `Orbit Agent runtime cannot execute ${tool.riskLevel} tools; create an Action Proposal instead.`,
    );
  }

  const parsedInput = tool.inputSchema.parse(input.arguments);
  if (!parsedInput.success || !parsedInput.data) {
    throw new Error(
      `Invalid input for ${tool.toolName}: ${parsedInput.error ?? "unknown schema error"}`,
    );
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const output = await Promise.race([
    tool.execute(parsedInput.data, input.context),
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () =>
          reject(
            new Error(
              `Orbit Agent tool ${tool.toolName} timed out after ${tool.timeoutMs}ms.`,
            ),
          ),
        tool.timeoutMs,
      );
    }),
  ]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
  const parsedOutput = tool.outputSchema.parse(output);
  if (!parsedOutput.success || !parsedOutput.data) {
    throw new Error(
      `Invalid output for ${tool.toolName}: ${parsedOutput.error ?? "unknown schema error"}`,
    );
  }

  return {
    output: parsedOutput.data,
    observation: tool.redactObservation(parsedOutput.data),
  };
}
