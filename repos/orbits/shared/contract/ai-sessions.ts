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
