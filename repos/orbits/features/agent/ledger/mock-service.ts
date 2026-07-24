/**
 * Mock agent ledger service：内存状态机。
 *
 * 状态转换规则：
 *   awaiting_confirmation | deferred --confirm--> completed | partially_failed | failed
 *   awaiting_confirmation --defer--> deferred
 *   (completed | partially_failed) 且 undoable --undo--> undone
 *   partially_failed | failed --retry--> 只重跑 failed 子操作
 * 幂等：executionCounts 按 idempotencyKey 统计，重试不重跑 succeeded 的子操作。
 */
import {
  AGENT_LEDGER_ERROR_DEFINITIONS,
  AGENT_LEDGER_TRANSITIONS,
  type AgentLedgerDraftUpdateInput,
  type AgentLedgerEntry,
  type AgentLedgerEntryStatus,
  type AgentLedgerErrorCode,
  type AgentLedgerFailure,
  type AgentLedgerListInput,
  type AgentLedgerListResult,
  type AgentLedgerMutationResult,
  type AgentLedgerOperation,
  type AgentLedgerProvenance,
  type AgentLedgerTransition,
  type AgentLedgerTransitionInput,
} from "./contract";
import type { AgentLedgerService } from "./service";
import {
  agentLedgerEntryFixtures,
  mockAgentLedgerProvenance,
} from "./fixtures";

const DEFAULT_ACTOR_LABEL = "本地用户";

function cloneEntries(): AgentLedgerEntry[] {
  return agentLedgerEntryFixtures.map((entry) => ({
    ...entry,
    evidenceChips: entry.evidenceChips.map((chip) => ({ ...chip })),
    operations: entry.operations.map((operation) => ({ ...operation })),
    sourceRefs: entry.sourceRefs.map((ref) => ({ ...ref })),
    evidenceIds: [...entry.evidenceIds],
  }));
}

function transitionProvenance(): AgentLedgerProvenance {
  return {
    ...mockAgentLedgerProvenance,
    generationMethod: "rule-based-ledger-transition",
  };
}

function ledgerFailure(code: AgentLedgerErrorCode): AgentLedgerFailure {
  return {
    success: false,
    error: {
      ...AGENT_LEDGER_ERROR_DEFINITIONS[code],
      state: "failure",
      provenance: transitionProvenance(),
      evidenceIds: [],
    },
  };
}

function deriveEntryStatus(
  operations: readonly AgentLedgerOperation[],
): AgentLedgerEntryStatus {
  const executed = operations.filter((operation) => operation.status !== "skipped");
  const failed = executed.filter((operation) => operation.status === "failed");
  const succeeded = executed.filter((operation) => operation.status === "succeeded");

  if (failed.length === 0) {
    return "completed";
  }
  return succeeded.length > 0 ? "partially_failed" : "failed";
}

function isKnownTransition(value: unknown): value is AgentLedgerTransition {
  return (
    typeof value === "string" &&
    (AGENT_LEDGER_TRANSITIONS as readonly string[]).includes(value)
  );
}

export function createMockAgentLedgerService(): AgentLedgerService & {
  getExecutionCount: (idempotencyKey: string) => number;
} {
  const entries = cloneEntries();
  const executionCounts = new Map<string, number>();

  function findEntry(entryId: string): AgentLedgerEntry | undefined {
    return entries.find((entry) => entry.entryId === entryId);
  }

  function executeOperation(operation: AgentLedgerOperation): void {
    executionCounts.set(
      operation.idempotencyKey,
      (executionCounts.get(operation.idempotencyKey) ?? 0) + 1,
    );
    operation.status = operation.mockOutcome === "fail" ? "failed" : "succeeded";
  }

  function mutationSuccess(
    entry: AgentLedgerEntry,
    transition: AgentLedgerTransition | "update_draft",
    actorLabel: string,
  ): AgentLedgerMutationResult {
    entry.updatedAt = new Date().toISOString();

    return {
      success: true,
      data: {
        state: "success",
        entry,
        transition,
        actorLabel,
        decidedAt: entry.updatedAt,
        provenance: transitionProvenance(),
        nextAction:
          "账本已更新。所有写操作可在 All actions 中追溯，消息只存草稿、不会自动发送。",
      },
    };
  }

  return {
    listEntries(input?: AgentLedgerListInput): AgentLedgerListResult {
      if (input?.scenario === "failure") {
        return ledgerFailure("AGENT_LEDGER_MOCK_FAILED");
      }
      const filtered =
        input?.status != null && input.status !== ""
          ? entries.filter((entry) => entry.status === input.status)
          : entries;
      const state = input?.scenario === "empty" || filtered.length === 0 ? "empty" : "success";

      return {
        success: true,
        data: {
          state,
          entries: state === "empty" && input?.scenario === "empty" ? [] : filtered,
          summary: `账本共 ${filtered.length} 条记录，可追溯、可撤销。`,
          provenance: mockAgentLedgerProvenance,
          nextAction: "在 All actions 中复核等待确认的条目。",
        },
      };
    },

    applyTransition(input: AgentLedgerTransitionInput): AgentLedgerMutationResult {
      if (input.scenario === "failure") {
        return ledgerFailure("AGENT_LEDGER_MOCK_FAILED");
      }
      if (!input.entryId) {
        return ledgerFailure("AGENT_LEDGER_ENTRY_ID_REQUIRED");
      }
      const entry = findEntry(input.entryId);
      if (!entry) {
        return ledgerFailure("AGENT_LEDGER_ENTRY_NOT_FOUND");
      }
      if (!isKnownTransition(input.transition)) {
        return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
      }
      const actorLabel = input.actorLabel?.trim() || DEFAULT_ACTOR_LABEL;

      switch (input.transition) {
        case "confirm": {
          if (entry.status !== "awaiting_confirmation" && entry.status !== "deferred") {
            return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
          }
          const selected = new Set(input.selectedOperationIds ?? []);
          const selectedOps = entry.operations.filter((operation) =>
            selected.has(operation.operationId),
          );
          if (selectedOps.length === 0) {
            return ledgerFailure("AGENT_LEDGER_NO_OPERATIONS_SELECTED");
          }
          for (const operation of entry.operations) {
            if (selected.has(operation.operationId)) {
              executeOperation(operation);
            } else {
              operation.status = "skipped";
            }
          }
          entry.status = deriveEntryStatus(entry.operations);
          entry.undoable = entry.operations.some(
            (operation) => operation.status === "succeeded",
          );
          return mutationSuccess(entry, "confirm", actorLabel);
        }
        case "defer": {
          if (entry.status !== "awaiting_confirmation") {
            return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
          }
          entry.status = "deferred";
          return mutationSuccess(entry, "defer", actorLabel);
        }
        case "undo": {
          const undoableNow =
            entry.undoable &&
            (entry.status === "completed" || entry.status === "partially_failed");
          if (!undoableNow) {
            return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
          }
          for (const operation of entry.operations) {
            if (operation.status === "succeeded") {
              operation.status = "undone";
            }
          }
          entry.status = "undone";
          entry.undoable = false;
          return mutationSuccess(entry, "undo", actorLabel);
        }
        case "retry": {
          if (entry.status !== "partially_failed" && entry.status !== "failed") {
            return ledgerFailure("AGENT_LEDGER_TRANSITION_INVALID");
          }
          for (const operation of entry.operations) {
            if (operation.status === "failed") {
              executeOperation(operation);
            }
          }
          entry.status = deriveEntryStatus(entry.operations);
          return mutationSuccess(entry, "retry", actorLabel);
        }
      }
    },

    updateDraft(input: AgentLedgerDraftUpdateInput): AgentLedgerMutationResult {
      if (!input.entryId) {
        return ledgerFailure("AGENT_LEDGER_ENTRY_ID_REQUIRED");
      }
      const entry = findEntry(input.entryId);
      if (!entry) {
        return ledgerFailure("AGENT_LEDGER_ENTRY_NOT_FOUND");
      }
      const operation = entry.operations.find(
        (candidate) => candidate.operationId === input.operationId,
      );
      const editable =
        operation?.operationType === "save_message_draft" &&
        (entry.status === "awaiting_confirmation" || entry.status === "deferred");
      if (!operation || !editable || typeof input.draftText !== "string") {
        return ledgerFailure("AGENT_LEDGER_DRAFT_NOT_EDITABLE");
      }
      operation.draftPreview = input.draftText;
      return mutationSuccess(entry, "update_draft", DEFAULT_ACTOR_LABEL);
    },

    getExecutionCount(idempotencyKey: string): number {
      return executionCounts.get(idempotencyKey) ?? 0;
    },
  };
}
