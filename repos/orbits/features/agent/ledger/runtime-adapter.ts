import type {
  AgentLedgerEntry,
  AgentLedgerFailure,
  AgentLedgerListResult,
  AgentLedgerMutationResult,
  AgentLedgerOperation,
  AgentLedgerProvenance,
  AgentLedgerTransition,
} from "./contract";
import { AGENT_LEDGER_ERROR_DEFINITIONS } from "./contract";
import type { AgentLedgerService } from "./service";
import type {
  AgentActionRecord,
  AgentRunDetail,
} from "../runtime/contract";
import type { AgentRuntimeService } from "../runtime/service";

export interface RuntimeBackedAgentLedgerServiceOptions {
  runtime: AgentRuntimeService;
  now?: () => string;
}

function provenance(input: {
  evidenceIds: readonly string[];
  write?: boolean;
  external?: boolean;
}): AgentLedgerProvenance {
  return {
    source: "agent-runtime:ledger-projection",
    sourceLabel: "Persistent Orbit Agent runtime",
    evidenceIds: input.evidenceIds,
    collectedAt: new Date().toISOString(),
    privacy: "live-agent-ledger-preview",
    generationMethod: "live-store-query",
    autonomousExecutionStarted: false,
    externalSideEffectExecuted: input.external ?? false,
    externalNetworkRequested: input.external ?? false,
    messageAutoSendExecuted: false,
    liveDatabaseReadExecuted: true,
    liveDatabaseWriteExecuted: input.write ?? false,
  };
}

function operationStatus(
  operationId: string,
  action: AgentActionRecord,
  detail: AgentRunDetail | null,
): AgentLedgerOperation["status"] {
  if (action.status === "undone") return "undone";
  if (action.status === "rejected" || action.status === "canceled") {
    return "skipped";
  }
  const receipts =
    detail?.receipts.filter(
      (receipt) =>
        receipt.actionId === action.actionId &&
        receipt.operationId === operationId,
    ) ?? [];
  if (receipts.some((receipt) => receipt.status === "completed")) {
    return "succeeded";
  }
  const outbox = detail?.outbox.find(
    (event) =>
      event.actionId === action.actionId &&
      event.operationId === operationId,
  );
  if (
    outbox?.status === "dead_letter" ||
    (receipts.length > 0 &&
      receipts.every((receipt) => receipt.status === "failed"))
  ) {
    return "failed";
  }
  return "pending";
}

export function agentActionToLedgerEntry(
  action: AgentActionRecord,
  detail: AgentRunDetail | null,
): AgentLedgerEntry {
  const executionStarted = [
    "executing",
    "completed",
    "partially_failed",
    "failed",
    "undone",
  ].includes(action.status);
  const externalSideEffectExecuted =
    executionStarted && action.riskLevel === "external";
  const actionProvenance = provenance({
    evidenceIds: action.evidenceIds,
    write: executionStarted,
    external: externalSideEffectExecuted,
  });
  return {
    entryId: action.actionId,
    runId: action.runId,
    workflowKey: action.workflowKey,
    workflowVersion: action.workflowVersion,
    conversationId: action.conversationId,
    payloadVersion: action.payloadVersion,
    immutablePayloadHash: action.immutablePayloadHash,
    title: action.title,
    contactName: action.contactName,
    organization: action.organization,
    status: action.status,
    riskLevel: action.riskLevel,
    preview: action.preview,
    whyNow: action.whyNow,
    evidenceChips: action.evidenceChips,
    operations: action.operations.map((operation) => ({
      operationId: operation.operationId,
      operationType: operation.operationType,
      title: operation.preview,
      effectSummary: operation.preview,
      selectedByDefault: true,
      status: operationStatus(operation.operationId, action, detail),
      idempotencyKey: operation.idempotencyKey,
      executorKey: operation.executorKey,
      payloadVersion: operation.payloadVersion,
      payload: operation.payload,
      preview: operation.preview,
      riskLevel: operation.riskLevel,
      compensation: operation.compensation,
      draftPreview:
        operation.operationType === "save_message_draft"
          ? String(operation.payload.draftText ?? operation.preview)
          : operation.operationType === "save_event_goal"
            ? String(operation.payload.goal ?? operation.preview)
            : undefined,
      autoSendCapable: false,
    })),
    undoable: action.compensation.supported,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
    approvedAt: action.approvedAt,
    executingAt: action.executingAt,
    completedAt: action.completedAt,
    failedAt: action.failedAt,
    rejectedAt: action.rejectedAt,
    canceledAt: action.canceledAt,
    deferredAt: action.deferredAt,
    undoneAt: action.undoneAt,
    viewedAt: action.viewedAt,
    approvedBy: action.approvedBy,
    sourceRefs: action.sourceRefs,
    evidenceIds: action.evidenceIds,
    provenance: actionProvenance,
    autonomousExecutionStarted: false,
    externalSideEffectExecuted,
    messageAutoSendExecuted: false,
  };
}

function failure(
  code: keyof typeof AGENT_LEDGER_ERROR_DEFINITIONS,
): AgentLedgerFailure {
  return {
    success: false,
    error: {
      ...AGENT_LEDGER_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: provenance({ evidenceIds: [] }),
      evidenceIds: [],
    },
  };
}

function editableDraftField(
  value: unknown,
): "draftText" | "goal" | "title" | "dueAt" | undefined {
  return value === "draftText" ||
    value === "goal" ||
    value === "title" ||
    value === "dueAt"
    ? value
    : undefined;
}

export function createRuntimeBackedAgentLedgerService({
  runtime,
}: RuntimeBackedAgentLedgerServiceOptions): AgentLedgerService {
  async function mutation(
    actionId: string,
    transition: AgentLedgerTransition | "update_draft",
    actorLabel: string,
    change: () => Promise<AgentActionRecord>,
  ): Promise<AgentLedgerMutationResult> {
    try {
      const action = await change();
      const detail = await runtime.getRun(action.runId);
      return {
        success: true,
        data: {
          state: "success",
          entry: agentActionToLedgerEntry(action, detail),
          transition,
          actorLabel,
          decidedAt: action.updatedAt,
          provenance: provenance({
            evidenceIds: action.evidenceIds,
            write: true,
          }),
          nextAction:
            action.status === "approved"
              ? "操作已进入持久化执行队列，可以离开页面；状态会继续更新。"
              : "操作账本已更新。",
        },
      };
    } catch {
      const existing = await runtime.listActions({});
      return existing.some((action) => action.actionId === actionId)
        ? failure("AGENT_LEDGER_TRANSITION_INVALID")
        : failure("AGENT_LEDGER_ENTRY_NOT_FOUND");
    }
  }

  return {
    async listEntries(input = {}): Promise<AgentLedgerListResult> {
      const actions = await runtime.listActions({
        status: input.status,
        workflowKey: input.workflowKey,
        createdAfter: input.createdAfter,
        createdBefore: input.createdBefore,
      });
      const entries = await Promise.all(
        actions.map(async (action) =>
          agentActionToLedgerEntry(action, await runtime.getRun(action.runId)),
        ),
      );
      return {
        success: true,
        data: {
          state:
            input.scenario === "empty" || entries.length === 0
              ? "empty"
              : "success",
          entries: input.scenario === "empty" ? [] : entries,
          summary: `账本共 ${entries.length} 条记录，可追溯、可撤销。`,
          provenance: provenance({
            evidenceIds: entries.flatMap((entry) => entry.evidenceIds),
          }),
          nextAction: "在 Today 或 All actions 中复核等待确认的操作。",
        },
      };
    },
    async applyTransition(input): Promise<AgentLedgerMutationResult> {
      if (!input.entryId) {
        return failure("AGENT_LEDGER_ENTRY_ID_REQUIRED");
      }
      const actorLabel = input.actorLabel?.trim() || "Orbit user";
      switch (input.transition) {
        case "confirm":
          if (!input.selectedOperationIds?.length) {
            return failure("AGENT_LEDGER_NO_OPERATIONS_SELECTED");
          }
          if (
            input.draftUpdates?.some(
              (update) =>
                !update.operationId ||
                typeof update.draftText !== "string" ||
                (update.field && !editableDraftField(update.field)) ||
                !input.selectedOperationIds?.includes(update.operationId),
            )
          ) {
            return failure("AGENT_LEDGER_DRAFT_NOT_EDITABLE");
          }
          return mutation(input.entryId, "confirm", actorLabel, async () => {
            for (const update of input.draftUpdates ?? []) {
              await runtime.updateDraft({
                actionId: input.entryId as string,
                operationId: update.operationId as string,
                draftText: update.draftText as string,
                field: editableDraftField(update.field),
              });
            }
            return runtime.approveAction({
              actionId: input.entryId as string,
              actorLabel,
              selectedOperationIds: input.selectedOperationIds ?? undefined,
            });
          });
        case "defer":
          return mutation(input.entryId, "defer", actorLabel, () =>
            runtime.deferAction(input.entryId as string),
          );
        case "reject":
          return mutation(input.entryId, "reject", actorLabel, () =>
            runtime.rejectAction(input.entryId as string),
          );
        case "cancel":
          return mutation(input.entryId, "cancel", actorLabel, () =>
            runtime.cancelAction(input.entryId as string),
          );
        case "retry":
          return mutation(input.entryId, "retry", actorLabel, () =>
            runtime.retryAction(input.entryId as string),
          );
        case "undo":
          return mutation(input.entryId, "undo", actorLabel, () =>
            runtime.undoAction(input.entryId as string),
          );
        default:
          return failure("AGENT_LEDGER_TRANSITION_INVALID");
      }
    },
    async updateDraft(input): Promise<AgentLedgerMutationResult> {
      if (!input.entryId) {
        return failure("AGENT_LEDGER_ENTRY_ID_REQUIRED");
      }
      if (!input.operationId || typeof input.draftText !== "string") {
        return failure("AGENT_LEDGER_DRAFT_NOT_EDITABLE");
      }
      const field = editableDraftField(input.field);
      if (input.field && !field) {
        return failure("AGENT_LEDGER_DRAFT_NOT_EDITABLE");
      }
      return mutation(input.entryId, "update_draft", "Orbit user", () =>
        runtime.updateDraft({
          actionId: input.entryId as string,
          operationId: input.operationId as string,
          draftText: input.draftText as string,
          field,
        }),
      );
    },
  };
}
