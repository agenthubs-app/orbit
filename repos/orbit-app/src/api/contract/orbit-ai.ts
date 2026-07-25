// 跨客户端契约：Orbit AI 会话。
// 对应 GET/POST /api/ai/conversations 与 /api/ai/conversations/:id 的 data 字段里
// 客户端会渲染的那几块：会话列表、消息、建议动作。
//
// artifacts、routingDecision、diagnostics 暂不跨端——它们仍在
// features/orbit-ai/conversation-contract.ts 里，形状还在动。

export type OrbitAiMessageRoleCode = "user" | "assistant" | "system";

export type OrbitAiToolFamilyCode =
  | "relationship_chat"
  | "events"
  | "contacts"
  | "followups";

// 会话列表的一条，用于历史记录面板。
export interface OrbitAiConversationSummaryContract {
  conversationId: string;
  title: string;
  lastMessagePreview: string;
  updatedAt: string;
  evidenceIds: readonly string[];
}

// 对话气泡的一条。
export interface OrbitAiMessageContract {
  messageId: string;
  conversationId: string;
  role: OrbitAiMessageRoleCode;
  content: string;
  createdAt: string;
  evidenceIds: readonly string[];
}

// 助手提出但尚未执行的动作，客户端要显示成「建议」而不是「已完成」。
export interface OrbitAiProposedToolIntentContract {
  intentId: string;
  toolFamily: OrbitAiToolFamilyCode;
  label: string;
  reason: string;
  requiresUserConfirmation: boolean;
}
