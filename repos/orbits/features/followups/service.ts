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

export interface FollowupTaskGenerationService {
  listTasks: (
    input?: FollowupTaskGenerationListInput,
  ) => FollowupTaskGenerationResult;
  generateTasks: (
    input?: FollowupTaskGenerationGenerateInput,
  ) => FollowupTaskGenerationResult;
}

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
