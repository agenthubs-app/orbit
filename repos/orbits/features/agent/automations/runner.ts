import type {
  AgentAutomation,
  AgentAutomationService,
} from "./contract";
import type { AgentMemoryContext } from "../memory/contract";
import {
  createOrbitAgentConversationService,
} from "../../orbit-ai/service-factory";

export interface AgentAutomationExecutionResult {
  summary: string;
  runId?: string;
}

export interface AgentAutomationRunnerDependencies {
  execute?: (
    automation: AgentAutomation,
  ) => Promise<AgentAutomationExecutionResult>;
  now?: () => string;
  workerId?: string;
  memory?: readonly AgentMemoryContext[];
}

async function finishClaimedAgentAutomation(
  service: AgentAutomationService,
  claimed: AgentAutomation,
  execute: (
    automation: AgentAutomation,
  ) => Promise<AgentAutomationExecutionResult>,
  now: () => string,
): Promise<AgentAutomation> {
  const leaseId = claimed.lease?.leaseId;
  if (!leaseId) {
    throw new Error(
      `Agent automation ${claimed.automationId} is missing its execution lease.`,
    );
  }
  try {
    const result = await execute(claimed);
    return service.recordRun({
      automationId: claimed.automationId,
      completedAt: now(),
      leaseId,
      outcome: {
        status: "success",
        summary: result.summary,
        runId: result.runId,
      },
    });
  } catch (error) {
    return service.recordRun({
      automationId: claimed.automationId,
      completedAt: now(),
      leaseId,
      outcome: {
        status: "failure",
        summary:
          error instanceof Error
            ? error.message
            : "Agent automation execution failed.",
      },
    });
  }
}

async function executeWithOrbitAgent(
  automation: AgentAutomation,
  memory: readonly AgentMemoryContext[] = [],
): Promise<AgentAutomationExecutionResult> {
  const service = createOrbitAgentConversationService();
  const result = await service.sendMessage({
    conversationId: `automation:${automation.automationId}`,
    locale: "zh",
    memory,
    message: automation.instruction,
  });
  if (result.success === false) {
    throw new Error(result.error.message);
  }
  return {
    summary: result.data.assistantMessage,
    runId: result.data.runId,
  };
}

export async function runAgentAutomation(
  service: AgentAutomationService,
  automationId: string,
  dependencies: AgentAutomationRunnerDependencies = {},
): Promise<AgentAutomation> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const execute =
    dependencies.execute ??
    ((automation) =>
      executeWithOrbitAgent(automation, dependencies.memory));
  const workerId = dependencies.workerId ?? "agent-automation-runner";
  const claimed = await service.claim({
    automationId,
    claimedAt: now(),
    workerId,
  });
  return finishClaimedAgentAutomation(service, claimed, execute, now);
}

export async function runDueAgentAutomations(
  service: AgentAutomationService,
  input: {
    limit: number;
    now: string;
    workerId: string;
  },
  dependencies: Omit<
    AgentAutomationRunnerDependencies,
    "now" | "workerId"
  > = {},
): Promise<readonly AgentAutomation[]> {
  const execute =
    dependencies.execute ??
    ((automation) =>
      executeWithOrbitAgent(automation, dependencies.memory));
  const claimed = await service.claimDue(input);
  return Promise.all(
    claimed.map((automation) =>
      finishClaimedAgentAutomation(
        service,
        automation,
        execute,
        () => new Date().toISOString(),
      ),
    ),
  );
}
