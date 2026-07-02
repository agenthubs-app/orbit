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

// AgentActionQueueService 管理“AI 建议动作”的审核队列。
// 接受或忽略动作只改变队列状态；真正的外部副作用必须走额外确认/执行层。
export interface AgentActionQueueService {
  // 列出等待用户审核的建议动作。
  listActions: (
    input?: AgentActionQueueListInput,
  ) => AgentActionQueueServiceResult<AgentActionQueueResult>;
  // 用户接受某个建议动作。
  acceptAction: (
    input: AgentActionDecisionInput,
  ) => AgentActionQueueServiceResult<AgentActionDecisionResult>;
  // 用户忽略某个建议动作。
  dismissAction: (
    input: AgentActionDecisionInput,
  ) => AgentActionQueueServiceResult<AgentActionDecisionResult>;
}

export type AgentActionQueueServiceResult<TResult> = TResult | Promise<TResult>;

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
