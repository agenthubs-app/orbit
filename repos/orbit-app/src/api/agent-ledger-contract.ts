// Mobile-side HTTP contract for /api/agent/ledger.
//
// The server already exposes this durable Agent Ledger surface, but the ledger
// types have not yet been promoted into shared/contract. Keep this file limited
// to the wire shape consumed by iOS; business rules remain on the server.

export const AGENT_LEDGER_ENTRY_STATUSES = [
  "awaiting_confirmation",
  "approved",
  "executing",
  "completed",
  "partially_failed",
  "failed",
  "rejected",
  "canceled",
  "undone",
  "deferred",
  // agent-design AG02 (server ledger contract): a card left too long; never executed.
  "expired"
] as const;

export const AGENT_LEDGER_TRANSITIONS = [
  "confirm",
  "defer",
  "reject",
  "cancel",
  "undo",
  "retry"
] as const;

export type AgentLedgerEntryStatusContract =
  (typeof AGENT_LEDGER_ENTRY_STATUSES)[number];
export type AgentLedgerTransitionContract =
  (typeof AGENT_LEDGER_TRANSITIONS)[number];

export interface AgentLedgerEvidenceChipContract {
  evidenceId: string;
  kind: string;
  label: string;
}

export interface AgentLedgerOperationContract {
  autoSendCapable: false;
  effectSummary: string;
  executorKey?: string;
  idempotencyKey: string;
  operationId: string;
  operationType: string;
  preview?: string;
  selectedByDefault: boolean;
  // agent-design AG02 adds needs_review, user_confirmed and abandoned (server ledger contract).
  status:
    | "pending"
    | "skipped"
    | "succeeded"
    | "failed"
    | "undone"
    | "needs_review"
    | "user_confirmed"
    | "abandoned";
  title: string;
}

export interface AgentLedgerSourceReferenceContract {
  id: string;
  label: string;
  type: string;
}

export interface AgentLedgerEntryContract {
  contactName?: string;
  conversationId?: string;
  createdAt: string;
  entryId: string;
  evidenceChips: readonly AgentLedgerEvidenceChipContract[];
  evidenceIds: readonly string[];
  immutablePayloadHash?: string;
  operations: readonly AgentLedgerOperationContract[];
  organization?: string;
  preview?: string;
  riskLevel?: "read" | "draft" | "write" | "external";
  runId?: string;
  sourceRefs: readonly AgentLedgerSourceReferenceContract[];
  status: AgentLedgerEntryStatusContract;
  title: string;
  undoable: boolean;
  updatedAt: string;
  whyNow: string;
  workflowKey?: string;
}

export interface AgentLedgerListPayloadContract {
  entries: readonly AgentLedgerEntryContract[];
  /** Opaque cursor for the next (older) page; null or absent on the last page. */
  nextCursor?: string | null;
  nextAction: string;
  state: "success" | "empty";
  summary: string;
}

export interface AgentLedgerMutationPayloadContract {
  actorLabel: string;
  decidedAt: string;
  entry: AgentLedgerEntryContract;
  nextAction: string;
  state: "success";
  transition: AgentLedgerTransitionContract | "update_draft";
}

export interface AgentLedgerTransitionRequestContract {
  actorLabel: string;
  selectedOperationIds?: readonly string[];
  transition: AgentLedgerTransitionContract;
}
