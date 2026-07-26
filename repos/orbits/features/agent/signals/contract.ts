export const AGENT_SIGNAL_TYPES = [
  "followup_due",
  "event_upcoming",
  "relationship_stale",
] as const;

export type AgentSignalType = (typeof AGENT_SIGNAL_TYPES)[number];

export const AGENT_SIGNAL_STATUSES = [
  "new",
  "acknowledged",
  "snoozed",
  "dismissed",
  "resolved",
] as const;

export type AgentSignalStatus = (typeof AGENT_SIGNAL_STATUSES)[number];
export type AgentSignalSeverity = "critical" | "high" | "medium" | "low";

export interface AgentSignalSource {
  sourceType: string;
  sourceId: string;
  sourceLabel: string;
  capturedAt: string;
  provider?: string;
  evidenceIds: readonly string[];
}

export interface AgentSignalChange {
  field: string;
  before?: string;
  after?: string;
}

export interface AgentSignalAction {
  actionId: "open" | "ask_agent" | "mark_done";
  label: string;
  href: string;
  prompt?: string;
}

export interface AgentSignal {
  signalId: string;
  fingerprint: string;
  type: AgentSignalType;
  title: string;
  summary: string;
  reason: string;
  severity: AgentSignalSeverity;
  importance: number;
  confidence: number;
  status: AgentSignalStatus;
  targetType: "task" | "event" | "contact";
  targetId: string;
  occurredAt: string;
  firstObservedAt: string;
  lastObservedAt: string;
  lastMeaningfulChangeAt: string;
  materialHash: string;
  changes: readonly AgentSignalChange[];
  sources: readonly AgentSignalSource[];
  actions: readonly AgentSignalAction[];
  snoozedUntil?: string;
  resolvedAt?: string;
}

export interface AgentSignalCandidate
  extends Omit<
    AgentSignal,
    | "signalId"
    | "status"
    | "firstObservedAt"
    | "lastObservedAt"
    | "lastMeaningfulChangeAt"
    | "changes"
    | "snoozedUntil"
    | "resolvedAt"
  > {
  material: Readonly<Record<string, string>>;
}

export interface AgentSignalRefreshResult {
  signals: readonly AgentSignal[];
  observed: number;
  created: number;
  changed: number;
  resolved: number;
  refreshedAt: string;
}

export interface AgentSignalService {
  list(input?: {
    includeResolved?: boolean;
    limit?: number;
  }): Promise<readonly AgentSignal[]>;
  refresh(): Promise<AgentSignalRefreshResult>;
  updateStatus(
    signalId: string,
    input: {
      status: Exclude<AgentSignalStatus, "new" | "resolved">;
      snoozedUntil?: string;
    },
  ): Promise<AgentSignal>;
}

export interface AgentSignalRecordPayload extends Record<string, unknown> {
  kind: "signal";
  material: Readonly<Record<string, string>>;
  signal: AgentSignal;
}
