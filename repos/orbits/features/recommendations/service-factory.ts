import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockEventValueRecommendationService } from "./mock-event-value-service";
import { createMockEventRecommendationService } from "./mock-service";
import type { EventValueRecommendationService } from "./event-value-contract";
import type { EventRecommendationService } from "./service";

export const eventRecommendationServiceFactory =
  createModuleServiceFactory<EventRecommendationService>({
    capabilityId: "event-recommendation",
    implementations: {
      mock: () => createMockEventRecommendationService(),
    },
  });

export const eventValueRecommendationServiceFactory =
  createModuleServiceFactory<EventValueRecommendationService>({
    capabilityId: "event-value-recommendation",
    implementations: {
      mock: () => createMockEventValueRecommendationService(),
    },
  });

export function resolveEventRecommendationService(
  mode?: ModuleMode | string,
) {
  return eventRecommendationServiceFactory.create(mode);
}

export function createEventRecommendationService(
  mode?: ModuleMode | string,
): EventRecommendationService {
  const resolution = resolveEventRecommendationService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveEventValueRecommendationService(
  mode?: ModuleMode | string,
) {
  return eventValueRecommendationServiceFactory.create(mode);
}

export function createEventValueRecommendationService(
  mode?: ModuleMode | string,
): EventValueRecommendationService {
  const resolution = resolveEventValueRecommendationService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
