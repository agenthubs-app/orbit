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
import type {
  OrbitIntegrationProvider,
} from "../../integrations/contract";

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

export interface AgentNaturalLanguageActionPermissionGuard {
  assertPermission: (input: {
    provider: OrbitIntegrationProvider;
    permission: string;
  }) => Promise<void>;
}

export class AgentNaturalLanguageActionPermissionError extends Error {
  readonly code = "AGENT_ACTION_PERMISSION_REQUIRED";

  constructor(
    readonly provider: OrbitIntegrationProvider,
    readonly permissions: readonly string[],
  ) {
    super(
      `${provider} must be connected with ${permissions.join(", ")} before this action can be proposed.`,
    );
    this.name = "AgentNaturalLanguageActionPermissionError";
  }
}

export class AgentMemoryLearningDisabledError extends Error {
  readonly code = "AGENT_MEMORY_LEARNING_DISABLED";

  constructor() {
    super(
      "Approved learning from Agent conversations is disabled in Memory settings.",
    );
    this.name = "AgentMemoryLearningDisabledError";
  }
}

export class AgentExternalCalendarWritesDisabledError extends Error {
  readonly code = "AGENT_EXTERNAL_CALENDAR_WRITES_DISABLED";

  constructor() {
    super(
      "External calendar writes are disabled in Agent execution settings.",
    );
    this.name = "AgentExternalCalendarWritesDisabledError";
  }
}

async function capabilityFor(
  request: AgentNaturalLanguageActionRequest,
  permissionGuard?: AgentNaturalLanguageActionPermissionGuard,
): Promise<AgentCapabilityDefinition> {
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
    if (
      request.capabilityId !== "calendar.syncEvent" ||
      !permissionGuard
    ) {
      throw new AgentNaturalLanguageActionPermissionError(
        request.capabilityId === "calendar.syncEvent"
          ? request.arguments.provider
          : "google_calendar",
        capability.requiredPermissions,
      );
    }
    try {
      for (const permission of capability.requiredPermissions) {
        await permissionGuard.assertPermission({
          provider: request.arguments.provider,
          permission,
        });
      }
    } catch {
      throw new AgentNaturalLanguageActionPermissionError(
        request.arguments.provider,
        capability.requiredPermissions,
      );
    }
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
    | "save_memory"
    | "sync_event_to_calendar";
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
    case "calendar.syncEvent":
      return {
        operationType: "sync_event_to_calendar",
        payload: request.arguments,
        preview: `${request.arguments.startsAt} · ${request.arguments.title}${
          request.arguments.location
            ? ` · ${request.arguments.location}`
            : ""
        }`,
        title:
          request.arguments.provider === "microsoft_graph"
            ? "同步到 Microsoft Calendar"
            : "同步到 Google Calendar",
      };
  }
}

export function createAgentNaturalLanguageActionProposalService(input: {
  externalCalendarWritesEnabled?: boolean;
  memoryLearningAllowed?: boolean;
  permissionGuard?: AgentNaturalLanguageActionPermissionGuard;
  runtime: AgentRuntimeService;
}): AgentNaturalLanguageActionProposalService {
  return {
    async propose(proposalInput) {
      const conversationId = proposalInput.conversationId.trim();
      const message = proposalInput.message.trim();
      if (!conversationId || !message || proposalInput.requests.length === 0) {
        return { actions: [], runId: null };
      }
      if (
        input.memoryLearningAllowed === false &&
        proposalInput.requests.some(
          (request) => request.capabilityId === "memory.save",
        )
      ) {
        throw new AgentMemoryLearningDisabledError();
      }
      if (
        input.externalCalendarWritesEnabled === false &&
        proposalInput.requests.some(
          (request) => request.capabilityId === "calendar.syncEvent",
        )
      ) {
        throw new AgentExternalCalendarWritesDisabledError();
      }

      const capabilities = await Promise.all(
        proposalInput.requests.map((request) =>
          capabilityFor(request, input.permissionGuard),
        ),
      );
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
            supported:
              request.capabilityId === "calendar.syncEvent"
                ? false
                : capability.compensationSupported,
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
