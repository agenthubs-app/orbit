/**
 * contact、event、note（旧的三类，协议 2 只收这三类）。agent-design AG05：协议 3 另收 memo、todo、schedule、
 * attendance（设计稿附录 E 消息引用六类；note 视同 memo），服务端逐条授权；协议 2 与存进会话的引用仍只有旧三类。
 */
export type AiSessionReferenceType = "contact" | "event" | "note" | "memo" | "todo" | "schedule" | "attendance";

export interface AiSessionReferenceContract {
  id: string;
  type: AiSessionReferenceType;
}

export type AiSessionEntryPointId =
  | "ai.home"
  | "ai.new_chat"
  | "chat.ai_assistant"
  | "contact.followup_draft"
  | "contact.message_draft"
  | "contacts.analysis"
  | "followup.task_candidate"
  | "home.contact_priority"
  | "home.event_preparation"
  | "home.introductions"
  | "inbox.polish_draft"
  | "notes.task_suggestions";

export interface AiSessionOriginInputContract {
  entryClient: "app" | "web";
  entryPointId: AiSessionEntryPointId;
  initialGroupId: string | null;
  kind: "manual" | "structured";
  sourceDataVersion?: string | undefined;
  template: { id: string; version: number } | null;
}

export interface AiSessionOriginContract extends AiSessionOriginInputContract {
  firstSentText: string;
  firstUserMessageId: string;
  recordedAt: string;
  references: readonly AiSessionReferenceContract[];
  schemaVersion: 1;
  verification?: {
    analysisVersion: "contacts.analysis@1";
    kind: "contacts_analysis_execution";
    sourceDataVersion: string;
  } | undefined;
}

export interface LegacyAiSessionOriginContract {
  entryClient: "unknown";
  entryPointId: "legacy.unknown";
  firstSentText: null;
  firstUserMessageId: null;
  initialGroupId: null;
  kind: "legacy_unknown";
  recordedAt: null;
  references: readonly [];
  schemaVersion: 1;
  template: null;
}

export type StoredAiSessionOriginContract =
  | AiSessionOriginContract
  | LegacyAiSessionOriginContract;

export interface AiSessionOrganizationContract {
  customTitle: string | null;
  groupId: string | null;
  pinned: boolean;
  revision: number;
}

export interface AiSessionGroupContract {
  createdAt: string;
  id: string;
  name: string;
  revision: number;
  updatedAt: string;
}

export interface AiSessionOrganizationMutationContract {
  expectedRevision: number;
  mutationId: string;
  patch: Partial<
    Pick<AiSessionOrganizationContract, "customTitle" | "groupId" | "pinned">
  >;
}

export interface AiSessionDeleteContract {
  expectedRevision: number;
}

export interface AiSessionGroupCreateContract {
  id: string;
  mutationId: string;
  name: string;
}

export interface AiSessionGroupMutationContract {
  expectedRevision: number;
  mutationId: string;
  name: string;
}

export interface AiSessionGroupDeleteContract {
  expectedRevision: number;
  mutationId: string;
}

export interface ReliableAiSendInputContract {
  clientMessageId: string;
  expectedMessageRevision: number;
  locale: "en" | "ja" | "zh";
  message: string;
  origin?: AiSessionOriginInputContract | undefined;
  pageContext?: AiPageContextContract | undefined;
  protocolVersion: 2;
  references: readonly AiSessionReferenceContract[];
  requestId: string;
  sessionId: string;
}

/** User-enabled, server-validated context for one send; never persisted with the session. */
export interface AiPageContextContract {
  route: string;
  filters: Record<string, string | string[]>;
  count: number;
}

export type ReliableAiSendState =
  | "completed"
  | "failed_before_execution"
  | "outcome_unknown"
  | "pending";

export interface ReliableAiSendReceiptContract {
  messageRevision?: number | undefined;
  protocolVersion: 2;
  replayed: boolean;
  requestId: string;
  sessionId: string;
  state: ReliableAiSendState;
}
