// Read-only business display data. No runtime context, provider or executable action.
export type AiContactArtifactStatus = "ready" | "empty" | "pending" | "failed" | "unsupported" | "unavailable";
export interface AiContactArtifactItemContract {
  id: string;
  title: string;
  subtitle?: string | undefined;
  body?: string | undefined;
  reason?: string | undefined;
  evidenceIds: string[];
  metadata: Array<{ label: string; value: string }>;
  contactHref: string | null;
}
/**
 * Sprint 0095: the producer kinds that carry entity items. Session recovery used
 * to keep only contact recommendations, so a task, note, schedule or event reply
 * came back from history with nothing to render.
 */
export type AiEntityArtifactKindCode =
  | "contact_recommendations"
  | "event_recommendations"
  | "data_query";

export interface AiContactArtifactContract {
  artifactId: string;
  taskId: string;
  kind: AiEntityArtifactKindCode;
  status: AiContactArtifactStatus;
  title: string;
  summary: string;
  sections: Array<{ title: string; body?: string | undefined; items: AiContactArtifactItemContract[] }>;
}
export interface AiSessionArtifactTurnContract {
  sessionId: string;
  requestId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: "ready" | "unavailable" | "oversized";
  artifacts: AiContactArtifactContract[];
}
export interface AiSessionArtifactRecoveryContract {
  turns: AiSessionArtifactTurnContract[];
  truncated: boolean;
  unavailable?: boolean;
  oversized?: boolean;
}
