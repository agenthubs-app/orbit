import type {
  AgentActionDecisionInput,
  AgentActionDecisionResult,
  AgentActionQueueFailure,
  AgentActionQueueListInput,
  AgentActionQueueResult,
} from "./contract";
import {
  agentActionQueueFailureContext,
  agentActionQueueFailureToAppError,
} from "./contract";

export interface AgentActionQueueService {
  listActions: (input?: AgentActionQueueListInput) => AgentActionQueueResult;
  acceptAction: (
    input: AgentActionDecisionInput,
  ) => AgentActionDecisionResult;
  dismissAction: (
    input: AgentActionDecisionInput,
  ) => AgentActionDecisionResult;
}

export {
  agentActionQueueFailureContext,
  agentActionQueueFailureToAppError,
};

export type {
  AgentActionDecisionInput,
  AgentActionDecisionResult,
  AgentActionQueueFailure,
  AgentActionQueueListInput,
  AgentActionQueueResult,
};
