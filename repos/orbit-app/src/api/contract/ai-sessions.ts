export type AiSessionReferenceType = "contact" | "event" | "note";

export interface AiSessionReferenceContract {
  id: string;
  type: AiSessionReferenceType;
}

export interface ReliableAiSendInputContract {
  clientMessageId: string;
  expectedMessageRevision: number;
  locale: "en" | "ja" | "zh";
  message: string;
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
