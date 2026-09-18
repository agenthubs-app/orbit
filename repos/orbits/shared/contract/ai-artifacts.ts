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
export interface AiContactArtifactContract {
  artifactId: string;
  taskId: string;
  kind: "contact_recommendations";
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
