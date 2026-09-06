import type {
  AgentActionOperationPayload,
  AgentActionRiskLevel,
} from "./contract";

export interface AgentExecutorContext {
  actionId: string;
  runId: string;
  operationId: string;
  idempotencyKey: string;
  now: string;
  /** Persisted successful execution reference, supplied only during compensation. */
  resultRef?: string;
}

export interface AgentExecutorResult {
  resultRef?: string;
  summary: string;
}

export interface AgentActionExecutor {
  key: string;
  riskLevel: AgentActionRiskLevel;
  execute: (
    payload: Readonly<Record<string, unknown>>,
    context: AgentExecutorContext,
  ) => Promise<AgentExecutorResult>;
  compensate?: (
    payload: Readonly<Record<string, unknown>>,
    context: AgentExecutorContext,
  ) => Promise<AgentExecutorResult>;
}

export interface AgentExecutorRegistry {
  get: (key: string) => AgentActionExecutor | null;
  execute: (
    operation: AgentActionOperationPayload,
    context: AgentExecutorContext,
  ) => Promise<AgentExecutorResult>;
  compensate: (
    operation: AgentActionOperationPayload,
    context: AgentExecutorContext,
  ) => Promise<AgentExecutorResult>;
}

export class AgentExecutorPolicyError extends Error {
  constructor(
    readonly code:
      | "EXECUTOR_NOT_FOUND"
      | "EXECUTOR_RISK_MISMATCH"
      | "COMPENSATION_NOT_SUPPORTED"
      | "EXTERNAL_MESSAGE_SEND_FORBIDDEN",
    message: string,
  ) {
    super(message);
    this.name = "AgentExecutorPolicyError";
  }
}

function isForbiddenMessageExecutor(key: string): boolean {
  const normalized = key.toLowerCase();
  return (
    normalized.includes("send_message") ||
    normalized.includes("send_email") ||
    normalized.includes("bulk_outreach")
  );
}

export function createAgentExecutorRegistry(
  executors: readonly AgentActionExecutor[],
): AgentExecutorRegistry {
  const byKey = new Map(executors.map((executor) => [executor.key, executor]));

  function requireExecutor(
    operation: AgentActionOperationPayload,
  ): AgentActionExecutor {
    if (isForbiddenMessageExecutor(operation.executorKey)) {
      throw new AgentExecutorPolicyError(
        "EXTERNAL_MESSAGE_SEND_FORBIDDEN",
        "Orbit Agent never executes external message or email sends.",
      );
    }

    const executor = byKey.get(operation.executorKey);
    if (!executor) {
      throw new AgentExecutorPolicyError(
        "EXECUTOR_NOT_FOUND",
        `No executor is registered for ${operation.executorKey}.`,
      );
    }
    if (executor.riskLevel !== operation.riskLevel) {
      throw new AgentExecutorPolicyError(
        "EXECUTOR_RISK_MISMATCH",
        `Executor ${executor.key} does not match the approved risk level.`,
      );
    }
    return executor;
  }

  return {
    get: (key) => byKey.get(key) ?? null,
    execute: (operation, context) =>
      requireExecutor(operation).execute(operation.payload, context),
    compensate(operation, context) {
      const executor = requireExecutor(operation);
      if (!operation.compensation.supported || !executor.compensate) {
        throw new AgentExecutorPolicyError(
          "COMPENSATION_NOT_SUPPORTED",
          `Operation ${operation.operationId} cannot be undone.`,
        );
      }
      return executor.compensate(operation.payload, context);
    },
  };
}
