// Agent 第一版的新入口（agent-design AG01，设计稿 §3.7、§7、附录 D）。
// 协议版本 3：发送只负责落库、去重、应答，返回 requestId 和委托状态；
// 结果文档按 requestId 持久保存，两端用同一个查询读；实时通道只是它的另一种读法。
// 本文件只增不删（scripts/contract-snapshot.mjs）。后续 sprint 新增字段一律写成可选。

import type {
  AiPageContextContract,
  AiSessionOriginInputContract,
  AiSessionReferenceContract,
} from "./ai-sessions";

export type AgentProtocolVersion = 3;

/** 委托状态（设计稿 §7）。queued：前面还有一轮；waiting_user：有追问或卡在等用户。 */
export type AgentRequestStatus =
  | "queued"
  | "running"
  | "waiting_user"
  | "completed"
  | "failed"
  | "cancelled";

/** 子目标状态（设计稿附录 D）。 */
export type AgentPartStatus =
  | "answered"
  | "awaiting_clarification"
  | "awaiting_confirmation"
  | "awaiting_acceptance"
  | "suggested_external"
  | "waiting_dependency"
  | "declined"
  | "unfinished"
  | "failed";

/** AG03：子目标的承接结论与去向（设计稿附录 A），由服务端代码决定。 */
export type AgentPartVerdict = "accept" | "convert" | "decline";
export type AgentPartRoute =
  | "answer"
  | "read"
  | "probe"
  | "web_lookup"
  | "propose_write"
  | "offer_alternative"
  | "suggest_external_agent"
  | "explain_limit"
  | "clarify";
export type AgentPartWaitReason =
  | "object_ambiguous"
  | "permission_missing"
  | "dependency_pending"
  | "service_unavailable"
  | "awaiting_acceptance"
  | "awaiting_external_result";

export interface AgentPartResult {
  partId: string;
  status: AgentPartStatus;
  operationId?: string | undefined;
  /** AG03：这个子目标在本轮原话里对应的那一段（用户自己的话）。 */
  sourceQuote?: string | undefined;
  verdict?: AgentPartVerdict | undefined;
  route?: AgentPartRoute | undefined;
  waitReason?: AgentPartWaitReason | undefined;
  /** AG03：子目标停在这个状态的原因代码，如 not_in_this_version、budget、dependency_pending。 */
  reason?: string | undefined;
}

export interface AgentAnswerContract {
  text: string;
  sourceRefs: readonly string[];
}

/** 这一轮怎么结束的：用户停止，或处理失败的原因（错误码沿用 shared/errors，细分原因在 reason）。 */
export interface AgentRequestEndingContract {
  kind: "stopped_by_user" | "failed";
  at: string;
  reason?: string | undefined;
}

/**
 * 一次委托的结果文档。随处理推进逐项填入；revision 每次变化加一。
 * 只有这里写进去的内容算已交付，只在实时通道里出现过的不算。
 */
export interface AgentResultDocument {
  schemaVersion: 1;
  requestId: string;
  sessionId: string;
  status: AgentRequestStatus;
  revision: number;
  answer: AgentAnswerContract | null;
  partResults: readonly AgentPartResult[];
  ending?: AgentRequestEndingContract | undefined;
  updatedAt: string;
  /** AG02：这一轮出的确认卡（设计稿 §5.1 的 actionPreview）。两端只按它渲染，不自己拼字段。 */
  actionPreview?: AgentActionPreviewContract | undefined;
}

/** 卡片状态（设计稿附录 D）：沿用账本的十种，新增 expired。 */
export type AgentCardStatus =
  | "awaiting_confirmation"
  | "deferred"
  | "approved"
  | "executing"
  | "completed"
  | "partially_failed"
  | "failed"
  | "rejected"
  | "canceled"
  | "undone"
  | "expired";

/** 逐项回执（设计稿附录 D）。needs_review、user_confirmed、abandoned 是 AG02 新增的。 */
export type AgentCardOperationStatus =
  | "pending"
  | "succeeded"
  | "failed"
  | "skipped"
  | "undone"
  | "needs_review"
  | "user_confirmed"
  | "abandoned";

/** 卡片出新版时，标出变化的一行：卡上原来显示的值、现在的值、要改成的值。 */
export interface AgentCardChangeContract {
  operationId: string;
  field: string;
  shownBefore: unknown;
  now: unknown;
  to?: unknown;
}

export interface AgentCardOperationPreviewContract {
  operationId: string;
  partId?: string | undefined;
  /** 操作目录里的名字，如 todo.create、todo.update。 */
  capability: string;
  target?: { collection: string; id: string } | undefined;
  before?: Readonly<Record<string, unknown>> | undefined;
  after: Readonly<Record<string, unknown>>;
  /** 卡上用来认出对象的内容，如标题。 */
  shown?: Readonly<Record<string, unknown>> | undefined;
  dependsOn?: readonly string[] | undefined;
  /** 用户读到的一行字，按卡片的语言，日期带星期。 */
  text: string;
  status: AgentCardOperationStatus;
}

/** 一张卡的当前版（GET /api/agent/ledger/[id] 与结果文档的 actionPreview 同一形状）。 */
export interface AgentActionPreviewContract {
  actionId: string;
  revision: number;
  /** 决定接口要原样带回的哈希。 */
  payloadHash: string;
  status: AgentCardStatus;
  expiresAt?: string | undefined;
  origin?:
    | { kind: "conversation"; conversationId: string; requestId: string }
    | { kind: "automation"; ruleId: string; firedAt: string }
    | { kind: "connection"; connectionId: string; externalRequestKey: string }
    | undefined;
  title: string;
  /** 每项一行，合起来就是卡上的文字。 */
  summary: string;
  operations: readonly AgentCardOperationPreviewContract[];
  /** 最近一次因数据变化出新版时的差异。 */
  changes?: readonly AgentCardChangeContract[] | undefined;
  /** 旧版的编号和哈希（旧版载荷保留在服务端）。 */
  revisions: readonly { revision: number; payloadHash: string }[];
  updatedAt: string;
}

/** POST /api/agent/ledger/[id]/transition 的按钮决定（设计稿 §5.1）。可执行的字段一律由服务端重新读取。 */
export interface AgentCardDecisionInputContract {
  transition: "confirm" | "reject" | "retry" | "mark_done" | "abandon";
  revision: number;
  payloadHash: string;
  clientDecisionId: string;
  /** 处理待核对项时必带。 */
  operationId?: string | undefined;
}

export interface AgentCardDecisionResultContract {
  decisionId: string;
  clientDecisionId: string;
  actionId: string;
  decision: AgentCardDecisionInputContract["transition"];
  operationId?: string | undefined;
  outcome: "accepted" | "already_decided" | "refused";
  /** 这次是否产生了一个新的、被接受的决定。 */
  accepted: boolean;
  /** 同一个 clientDecisionId 重发：返回第一次的结果。 */
  replayed: boolean;
  /** 被拒的原因：CARD_REVISION_CHANGED、CARD_CONTENT_CHANGED、CARD_EXPIRED、CARD_CLOSED、OPERATION_NOT_IN_REVIEW。 */
  reason?: string | undefined;
  message: string;
  revision: number;
  changes?: readonly AgentCardChangeContract[] | undefined;
  decidedAt: string;
}

/** POST /api/ai/conversations，protocolVersion 3。requestId 由服务端按会话与客户端消息键生成。 */
export interface AgentSendInputContract {
  protocolVersion: AgentProtocolVersion;
  sessionId: string;
  /** 客户端消息键：同一条消息超时重发时不变，服务端据此去重。 */
  clientMessageId: string;
  locale: "en" | "ja" | "zh";
  message: string;
  references: readonly AiSessionReferenceContract[];
  origin?: AiSessionOriginInputContract | undefined;
  pageContext?: AiPageContextContract | undefined;
}

/** 发送的应答：收下即返回，不等模型。 */
export interface AgentSendReceiptContract {
  protocolVersion: AgentProtocolVersion;
  requestId: string;
  sessionId: string;
  clientMessageId: string;
  status: AgentRequestStatus;
  /** 服务端在这个会话里的接收顺序，从 1 起。 */
  receivedSeq: number;
  /** 这次是同一条消息的重发，返回的是原来那次委托。 */
  replayed: boolean;
  acceptedAt: string;
}

export type AgentSessionEventKind = "accepted" | "status" | "document";

/** 实时通道的一条事件。seq 在会话内递增；重连带上最后收到的 seq，服务端只推其后的。 */
export interface AgentSessionEventContract {
  seq: number;
  sessionId: string;
  requestId: string;
  kind: AgentSessionEventKind;
  status: AgentRequestStatus;
  at: string;
  /** kind 为 document 时带上这一版结果文档。 */
  document?: AgentResultDocument | undefined;
}

/** GET /api/ai/conversations/sessions/[id]/events 的 JSON 读法（不用事件流时）。 */
export interface AgentSessionEventsPageContract {
  sessionId: string;
  events: readonly AgentSessionEventContract[];
  /** 本页最后一条的 seq；没有新事件时等于请求里的 after。 */
  lastSeq: number;
}

/** 停止当前这一轮的应答（POST /api/ai/runs/[requestId]/transition）。 */
export interface AgentCancelResultContract {
  requestId: string;
  /** 这次请求是否改变了状态；已结束的委托返回 false 和它原来的结果。 */
  changed: boolean;
  document: AgentResultDocument;
}
