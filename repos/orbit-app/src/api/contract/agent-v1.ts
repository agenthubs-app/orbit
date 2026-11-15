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

export interface AgentPartResult {
  partId: string;
  status: AgentPartStatus;
  operationId?: string | undefined;
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
