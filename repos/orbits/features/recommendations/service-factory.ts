// Recommendations service factory 管理活动推荐和活动价值推荐。
// 当前 mock 根据 fixture 和解释性规则返回推荐，不调用真实推荐模型。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createLiveEventValueRecommendationService } from "./live-event-value-service";
import { createLiveEventRecommendationService } from "./live-service";
import { createMockEventValueRecommendationService } from "./mock-event-value-service";
import { createMockEventRecommendationService } from "./mock-service";
import { createConfiguredStorageEventValueRecommendationProvider } from "./storage/event-value-live-record-provider";
import { createConfiguredStorageEventRecommendationProvider } from "./storage/event-recommendation-live-record-provider";
import type { EventValueRecommendationService } from "./event-value-contract";
import type { EventRecommendationService } from "./service";

export const eventRecommendationServiceFactory =
  createModuleServiceFactory<EventRecommendationService>({
    capabilityId: "event-recommendation",
    implementations: {
      live: () =>
        createLiveEventRecommendationService({
          provider: createConfiguredStorageEventRecommendationProvider(),
        }),
      mock: () => createMockEventRecommendationService(),
    },
  });

export const eventValueRecommendationServiceFactory =
  createModuleServiceFactory<EventValueRecommendationService>({
    capabilityId: "event-value-recommendation",
    implementations: {
      live: () =>
        createLiveEventValueRecommendationService({
          provider: createConfiguredStorageEventValueRecommendationProvider(),
        }),
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
