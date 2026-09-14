export type AiSessionReferenceType = "contact" | "event" | "note";

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
  template: { id: string; version: number } | null;
}

export interface AiSessionOriginContract extends AiSessionOriginInputContract {
  firstSentText: string;
  firstUserMessageId: string;
  recordedAt: string;
  references: readonly AiSessionReferenceContract[];
  schemaVersion: 1;
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

export interface ReliableAiSendInputContract {
  clientMessageId: string;
  expectedMessageRevision: number;
  locale: "en" | "ja" | "zh";
  message: string;
  origin?: AiSessionOriginInputContract | undefined;
  protocolVersion: 2;
  references: readonly AiSessionReferenceContract[];
  requestId: string;
  sessionId: string;
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
