import type {
  FollowupTaskGenerationFailure,
  FollowupTaskGenerationGenerateInput,
  FollowupTaskGenerationListInput,
  FollowupTaskGenerationResult,
} from "./contract";
import {
  followupTaskGenerationFailureContext,
  followupTaskGenerationFailureToAppError,
} from "./contract";

// FollowupTaskGenerationService 是“待跟进任务”能力的边界。
// 它只生成或读取可复核任务建议，不直接发送消息、创建提醒或写外部系统。
export interface FollowupTaskGenerationService {
  // 读取当前跟进队列。
  listTasks: (
    input?: FollowupTaskGenerationListInput,
  ) => FollowupTaskGenerationServiceResult<FollowupTaskGenerationResult>;
  // 根据当前上下文生成任务建议；执行仍需要用户确认。
  generateTasks: (
    input?: FollowupTaskGenerationGenerateInput,
  ) => FollowupTaskGenerationServiceResult<FollowupTaskGenerationResult>;
}

export type FollowupTaskGenerationServiceResult<TResult> =
  | Promise<TResult>
  | TResult;

export {
  followupTaskGenerationFailureContext,
  followupTaskGenerationFailureToAppError,
};

export type {
  FollowupTaskGenerationFailure,
  FollowupTaskGenerationGenerateInput,
  FollowupTaskGenerationListInput,
  FollowupTaskGenerationResult,
};
