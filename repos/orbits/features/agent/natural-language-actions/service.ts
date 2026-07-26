import type { AgentActionSourceReference } from "../contract";
import {
  createAgentCapabilityRegistry,
} from "../capabilities/registry";
import type { AgentCapabilityDefinition } from "../capabilities/contract";
import type {
  AgentActionOperationPayload,
  AgentActionRecord,
} from "../runtime/contract";
import { stablePayloadHash } from "../runtime/hash";
import type { AgentRuntimeService } from "../runtime/service";
import type { AgentNaturalLanguageActionRequest } from "./contract";

const WORKFLOW_KEY = "natural_language_action_v1";

export interface AgentNaturalLanguageActionProposalInput {
  conversationId: string;
  message: string;
  requests: readonly AgentNaturalLanguageActionRequest[];
}

export interface AgentNaturalLanguageActionProposalResult {
  actions: readonly AgentActionRecord[];
  runId: string | null;
}

export interface AgentNaturalLanguageActionProposalService {
  propose: (
    input: AgentNaturalLanguageActionProposalInput,
  ) => Promise<AgentNaturalLanguageActionProposalResult>;
}

function shortHash(value: unknown): string {
  return stablePayloadHash(value).replace("fnv1a:", "");
}

function capabilityFor(
  request: AgentNaturalLanguageActionRequest,
): AgentCapabilityDefinition {
  const capability = createAgentCapabilityRegistry().getByExecutorKey(
    request.capabilityId,
  );
  if (
    !capability?.executorKey ||
    capability.kind !== "action" ||
    capability.executionBoundary !== "runtime_executor" ||
    !capability.triggers.includes("chat") ||
    capability.confirmationPolicy !== "per_operation"
  ) {
    throw new Error(
      `Capability ${request.capabilityId} cannot be proposed from Agent chat.`,
    );
  }
  if (capability.requiredPermissions.length > 0) {
    throw new Error(
      `Capability ${request.capabilityId} is missing required permissions: ${capability.requiredPermissions.join(", ")}.`,
    );
  }
  return capability;
}

function actionCopy(
  request: AgentNaturalLanguageActionRequest,
): {
  operationType:
    | "create_followup_task"
    | "create_followup_reminder"
    | "save_message_draft"
    | "save_memory";
  payload: Readonly<Record<string, unknown>>;
  preview: string;
  title: string;
} {
  switch (request.capabilityId) {
    case "followups.createTask":
      return {
        operationType: "create_followup_task",
        payload: request.arguments,
        preview: request.arguments.dueAt
          ? `创建跟进任务「${request.arguments.title}」，截止 ${request.arguments.dueAt}`
          : `创建跟进任务「${request.arguments.title}」`,
        title: "创建跟进任务",
      };
    case "notifications.createReminder":
      return {
        operationType: "create_followup_reminder",
        payload: request.arguments,
        preview: `在 ${request.arguments.dueAt} 提醒「${request.arguments.title}」`,
        title: "创建提醒",
      };
    case "followups.saveDraft":
      return {
        operationType: "save_message_draft",
        payload: request.arguments,
        preview: request.arguments.draftText,
        title: "保存消息草稿",
      };
    case "memory.save":
      return {
        operationType: "save_memory",
        payload: request.arguments,
        preview: `记住：${request.arguments.content}`,
        title: "保存到 Agent Memory",
      };
  }
}

export function createAgentNaturalLanguageActionProposalService(input: {
  runtime: AgentRuntimeService;
}): AgentNaturalLanguageActionProposalService {
  return {
    async propose(proposalInput) {
      const conversationId = proposalInput.conversationId.trim();
      const message = proposalInput.message.trim();
      if (!conversationId || !message || proposalInput.requests.length === 0) {
        return { actions: [], runId: null };
      }

      const capabilities = proposalInput.requests.map(capabilityFor);
      const runId = `run:natural-language:${shortHash({
        conversationId,
        message,
        requests: proposalInput.requests,
      })}`;
      await input.runtime.createRun({
        conversationId,
        runId,
        trigger: "chat",
        workflowKey: WORKFLOW_KEY,
        workflowVersion: 1,
      });
      await input.runtime.addRunStep({
        attempt: 1,
        inputRef: `conversation:${conversationId}`,
        kind: "ai",
        name: "validate_natural_language_action_proposals",
        outputRef: `${runId}:proposals`,
        runId,
        status: "completed",
        stepId: `${runId}:validate`,
      });

      const evidenceId = `evidence:agent-chat:${conversationId}:${shortHash(
        message,
      )}`;
      const sourceRef: AgentActionSourceReference = {
        generatedBy: "model-provider-planner",
        id: `source:agent-chat:${conversationId}`,
        label: "Explicit user request in Agent chat",
        providerRecordId: conversationId,
        type: "chat_summary",
      };
      const actions: AgentActionRecord[] = [];

      for (let index = 0; index < proposalInput.requests.length; index += 1) {
        const request = proposalInput.requests[index];
        const capability = capabilities[index];
        const copy = actionCopy(request);
        const actionId = `action:natural-language:${shortHash({
          index,
          request,
          runId,
        })}`;
        const operationId = `${actionId}:operation:1`;
        const payload: Readonly<Record<string, unknown>> = {
          ...copy.payload,
          evidenceIds: [evidenceId],
          ...(request.capabilityId === "memory.save"
            ? { memoryId: `memory:agent:${shortHash({ actionId, request })}` }
            : {}),
        };
        const operation: AgentActionOperationPayload = {
          compensation: {
            executorKey: capability.executorKey,
            supported: capability.compensationSupported,
          },
          executorKey: capability.executorKey,
          idempotencyKey: `${actionId}:v1`,
          operationId,
          operationType: copy.operationType,
          payload,
          payloadVersion: 1,
          preview: copy.preview,
          riskLevel: capability.riskLevel,
        };
        actions.push(
          await input.runtime.proposeAction({
            actionId,
            compensation: operation.compensation,
            conversationId,
            evidenceChips: [
              {
                evidenceId,
                kind: "chat_summary",
                label: "Agent 对话中的明确请求",
              },
            ],
            evidenceIds: [evidenceId],
            operations: [operation],
            payloadVersion: 1,
            preview: copy.preview,
            riskLevel: capability.riskLevel,
            runId,
            sourceRefs: [sourceRef],
            title: copy.title,
            whyNow:
              "用户在当前 Agent 对话中明确提出了这项写操作；确认前不会写入。",
            workflowKey: WORKFLOW_KEY,
            workflowVersion: 1,
          }),
        );
      }

      return { actions, runId };
    },
  };
}
