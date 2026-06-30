import type {
  OrbitAgentArtifactKind,
  OrbitAgentArtifactSourceModule,
} from "../artifact-contract";
import type { OrbitAiTraceRenderHint } from "../trace-contract";
import type { GeminiOrbitAgentToolName } from "../gemini-provider";

export type OrbitAgentToolRiskLevel = "read" | "draft" | "write" | "external";

export interface OrbitAgentToolMetadata {
  artifactKind: OrbitAgentArtifactKind;
  descriptionZh: string;
  inputSpecZh: string;
  outputSchema: string;
  outputSpecZh: string;
  renderHint: OrbitAiTraceRenderHint | string;
  requiresConfirmation: boolean;
  riskLevel: OrbitAgentToolRiskLevel;
  sourceModules: readonly OrbitAgentArtifactSourceModule[];
  specificationZh: string;
  toolFamily: "events" | "contacts" | "followups" | "relationship_chat";
  toolName: GeminiOrbitAgentToolName;
}

export const ORBIT_AGENT_TOOL_CATALOG = [
  {
    artifactKind: "event_recommendations",
    descriptionZh:
      "根据活动上下文推荐值得复核的活动、参会目标和下一步准备事项。",
    inputSpecZh:
      "输入：query 用户请求；locale zh/en；可选活动主题、时间窗口或关系目标。",
    outputSchema: "OrbitAgentArtifactPayload",
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
  },
  {
    artifactKind: "contact_recommendations",
    descriptionZh:
      "根据关系图谱和已确认来源推荐可联系的人脉或介绍路径。",
    inputSpecZh:
      "输入：query 用户目标；locale zh/en；可选行业、主题、联系人姓名或关系范围。",
    outputSchema: "OrbitAgentArtifactPayload",
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
  },
  {
    artifactKind: "followup_queue",
    descriptionZh:
      "复核跟进队列，找出本周、逾期或沉睡关系中的下一步机会。",
    inputSpecZh:
      "输入：query 用户请求；locale zh/en；可选时间范围、优先级或跟进类型。",
    outputSchema: "OrbitAgentArtifactPayload",
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
  },
  {
    artifactKind: "relationship_chat_context",
    descriptionZh:
      "整理关系聊天上下文，用于解释关系来源、准备消息草稿或复核对话线索。",
    inputSpecZh:
      "输入：query 用户问题；locale zh/en；可选联系人、会话、草稿目标或上下文范围。",
    outputSchema: "OrbitAgentArtifactPayload",
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
  },
] as const satisfies readonly OrbitAgentToolMetadata[];

export function getOrbitAgentToolMetadata(
  toolName: string,
): OrbitAgentToolMetadata | null {
  return (
    ORBIT_AGENT_TOOL_CATALOG.find((tool) => tool.toolName === toolName) ?? null
  );
}
