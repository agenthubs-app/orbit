// 跨客户端契约：Orbit AI 会话。
// 对应 GET/POST /api/ai/conversations 与 /api/ai/conversations/:id 的 data 字段里
// 客户端会渲染的那几块：会话列表、消息、建议动作。
//
// 人脉结果的只读展示投影见 ai-artifacts.ts；原始 runtime、routingDecision、
// diagnostics 仍留在 features/orbit-ai/conversation-contract.ts，不跨端复制。

export type OrbitAiMessageRoleCode = "user" | "assistant" | "system";

export type OrbitAiToolFamilyCode =
  | "relationship_chat"
  | "events"
  | "contacts"
  | "profile"
  | "followups"
  | "notes"
  | "tasks"
  | "schedule";

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

export type OrbitAiTaskCategoryCode =
  | "relationship"
  | "meeting"
  | "event"
  | "work"
  | "personal"
  | "other";

export interface OrbitAiTaskInteractionContract {
  state: "created" | "suggested" | "needs_date_confirmation" | "failed";
  title: string;
  category: OrbitAiTaskCategoryCode;
  reason?: string;
  dueAt?: string;
  taskId?: string;
  suggestionId?: string;
  sourceNoteId?: string;
  sourceNoteVersion?: number;
  relatedContactIds?: readonly string[];
}

// Sprint 0085：对话里的实体草稿卡。
// 模型只能提出草稿；确认按钮是用户动作，写入由服务端确定性代码完成。
// 同一会话同时只有一张 pending_confirmation 的卡，否则"确认"指代不清。
export type OrbitAiEntityDraftKindCode =
  | "task"
  | "note"
  | "schedule"
  | "event"
  | "contact";

export type OrbitAiEntityDraftStateCode =
  | "pending_confirmation"
  | "created"
  | "cancelled"
  | "superseded"
  | "failed";

export interface OrbitAiEntityDraftSourceRefContract {
  kind: "note" | "contact" | "event" | "task" | "schedule";
  id: string;
}

export interface OrbitAiEntityDraftCardContract {
  draftId: string;
  kind: OrbitAiEntityDraftKindCode;
  state: OrbitAiEntityDraftStateCode;
  revision: number;
  /** 每种实体的字段名不同，值一律是文本；卡片按 kind 决定显示哪几行。 */
  fields: Readonly<Record<string, string>>;
  sourceRefs: readonly OrbitAiEntityDraftSourceRefContract[];
  /** 写入成功后才有：可点开的真实记录 id。 */
  createdRecordId?: string;
  /** 上一次确认失败的原因；卡片仍可重试。 */
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}
