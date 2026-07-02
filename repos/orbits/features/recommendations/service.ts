import type {
  EventOpeningLineInput,
  EventOpeningLineResult,
  EventRecommendationFailure,
  EventRecommendationInput,
  EventRecommendationsResult,
} from "./contract";
import {
  eventRecommendationFailureContext,
  eventRecommendationFailureToAppError,
} from "./contract";

// EventRecommendationService 负责活动前的人脉推荐和开场白草稿。
// 它返回可复核建议，不直接联系推荐对象，也不写入真实活动系统。
export type EventRecommendationServiceResult<TResult> = TResult | Promise<TResult>;

export interface EventRecommendationService {
  // 基于活动上下文列出推荐联系人。
  listEventRecommendations: (
    input?: EventRecommendationInput,
  ) => EventRecommendationServiceResult<EventRecommendationsResult>;
  // 为某个推荐对象生成开场白草稿。
  composeOpeningLine: (
    input?: EventOpeningLineInput,
  ) => EventRecommendationServiceResult<EventOpeningLineResult>;
}

export {
  eventRecommendationFailureContext,
  eventRecommendationFailureToAppError,
};

export type {
  EventOpeningLineResult,
  EventRecommendationFailure,
  EventRecommendationsResult,
};
