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

export interface EventRecommendationService {
  listEventRecommendations: (
    input?: EventRecommendationInput,
  ) => EventRecommendationsResult;
  composeOpeningLine: (
    input?: EventOpeningLineInput,
  ) => EventOpeningLineResult;
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
