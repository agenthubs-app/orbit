import {
  AGENT_ACTION_QUEUE_ERROR_DEFINITIONS,
  type AgentActionDecisionInput,
  type AgentActionDecisionResult,
  type AgentActionQueueFailure,
  type AgentActionQueueItem,
  type AgentActionQueueProvenance,
  type AgentActionQueueResult,
  type AgentActionType,
} from "../contract";
import type { AgentActionQueueService } from "../service";
import type { AgentLedgerEntry } from "./contract";
import type { AgentLedgerService } from "./service";

export interface LedgerAgentActionQueueAdapterOptions {
  ledger: AgentLedgerService;
}

function provenance(
  entry?: AgentLedgerEntry,
  write = false,
): AgentActionQueueProvenance {
  return {
    source: "agent-ledger:queue-compatibility-adapter",
    sourceLabel: "Agent Ledger compatibility queue",
    evidenceIds: entry?.evidenceIds.length
      ? entry.evidenceIds
      : ["evidence:agent-ledger-compatibility"],
    collectedAt: entry?.updatedAt ?? new Date().toISOString(),
    privacy: "live-agent-action-queue-preview",
    generationMethod: write ? "live-store-decision" : "live-store-query",
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseReadExecuted: true,
    liveDatabaseWriteExecuted: write,
    productionAuditLogWriteExecuted: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationProviderRequested: false,
    deviceRequested: false,
  };
}

function actionType(entry: AgentLedgerEntry): AgentActionType {
  if (entry.workflowKey === "post_event_followup_v1") {
    return "post_event_followup";
  }
  const operationType = entry.operations[0]?.operationType;
  if (operationType === "create_followup_reminder") return "event_reminder";
  if (operationType === "save_message_draft") {
    return "message_draft_suggestion";
  }
  if (operationType === "sync_event_to_calendar") {
    return "appointment_suggestion";
  }
  return "dormant_activation";
}

function queueItem(entry: AgentLedgerEntry): AgentActionQueueItem {
  return {
    actionId: entry.entryId,
    actionType: actionType(entry),
    title: entry.title,
    contactName: entry.contactName ?? "关系工作",
    organization: entry.organization ?? "",
    priority:
      entry.status === "awaiting_confirmation"
        ? "high"
        : entry.status === "deferred"
          ? "medium"
          : "low",
    recommendedAction: entry.preview ?? entry.operations[0]?.effectSummary ?? "",
    reason: entry.whyNow,
    dueLabel:
      entry.status === "awaiting_confirmation"
        ? "Awaiting confirmation"
        : entry.status,
    confirmationRequired:
      entry.status === "awaiting_confirmation" || entry.status === "deferred",
    sourceRefs: entry.sourceRefs,
    evidenceIds: entry.evidenceIds,
    provenance: provenance(entry),
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: false,
    externalNetworkRequested: false,
    liveDatabaseWriteExecuted: false,
  };
}

function failure(
  code: keyof typeof AGENT_ACTION_QUEUE_ERROR_DEFINITIONS,
): AgentActionQueueFailure {
  const actionProvenance = provenance();
  return {
    success: false,
    error: {
      ...AGENT_ACTION_QUEUE_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: actionProvenance,
      evidenceIds: actionProvenance.evidenceIds,
    },
  };
}

export function createLedgerAgentActionQueueAdapter({
  ledger,
}: LedgerAgentActionQueueAdapterOptions): AgentActionQueueService {
  async function decide(
    input: AgentActionDecisionInput,
    decision: "accepted" | "dismissed",
  ): Promise<AgentActionDecisionResult> {
    if (!input.actionId) {
      return failure("AGENT_ACTION_QUEUE_ACTION_ID_REQUIRED");
    }
    const listed = await ledger.listEntries();
    if (listed.success === false) {
      return failure("AGENT_ACTION_QUEUE_LIVE_STORE_UNCONFIGURED");
    }
    const entry = listed.data.entries.find(
      (candidate) => candidate.entryId === input.actionId,
    );
    if (!entry) return failure("AGENT_ACTION_QUEUE_ACTION_NOT_FOUND");

    const transitioned = await ledger.applyTransition({
      entryId: input.actionId,
      transition: decision === "accepted" ? "confirm" : "reject",
      selectedOperationIds:
        decision === "accepted"
          ? entry.operations.map((operation) => operation.operationId)
          : undefined,
      actorLabel: input.actorLabel,
      scenario: input.scenario,
    });
    if (transitioned.success === false) {
      return failure("AGENT_ACTION_QUEUE_MOCK_FAILED");
    }
    return {
      success: true,
      data: {
        state: "success",
        actionId: entry.entryId,
        actionTitle: entry.title,
        decision,
        actorLabel: input.actorLabel?.trim() || "Orbit user",
        decidedAt: transitioned.data.decidedAt,
        confirmationRequired: decision === "accepted",
        externalSideEffectExecuted: false,
        autonomousExecutionStarted: false,
        evidenceIds: entry.evidenceIds,
        provenance: provenance(transitioned.data.entry, true),
        nextAction:
          decision === "accepted"
            ? "Action approved and durably queued for background execution."
            : "Action rejected; no executor will run.",
      },
    };
  }

  return {
    async listActions(input = {}): Promise<AgentActionQueueResult> {
      const result = await ledger.listEntries({
        status: input.status,
        workflowKey: input.workflowKey,
        createdAfter: input.createdAfter,
        createdBefore: input.createdBefore,
        scenario: input.scenario,
      });
      if (result.success === false) {
        return failure("AGENT_ACTION_QUEUE_LIVE_STORE_UNCONFIGURED");
      }
      const actions = result.data.entries
        .map(queueItem)
        .filter(
          (item) => !input.actionType || item.actionType === input.actionType,
        );
      return {
        success: true,
        data: {
          state: actions.length > 0 ? "success" : "empty",
          actions,
          summary: `${actions.length} actions loaded from the Agent Ledger.`,
          provenance: provenance(result.data.entries[0]),
          nextAction: "Review an action before approving a write.",
        },
      };
    },
    acceptAction: (input) => decide(input, "accepted"),
    dismissAction: (input) => decide(input, "dismissed"),
  };
}
