import { createEventGoalAndReadinessService } from "../../../../../features/events/service-factory";
import { createEventCrudAndImportService } from "../../../../../features/events/service-factory";
import type { EventCrudAndImportService } from "../../../../../features/events/service";
import type { EventGoalAndReadinessService } from "../../../../../features/events/goal-contract";
import { createEventRecommendationService } from "../../../../../features/recommendations/service-factory";
import type { EventRecommendationService } from "../../../../../features/recommendations/service";
import { createEventValueRecommendationService } from "../../../../../features/recommendations/service-factory";
import type { EventValueRecommendationService } from "../../../../../features/recommendations/event-value-contract";
import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../../../../shared/services/module-mode";

// Events 页面同时展示活动 CRUD、参会者推荐、活动价值推荐和准备度。
// 这里集中装配页面所需 service，避免页面组件直接耦合多个 feature factory。
export interface AppEventsRouteServices {
  events: EventCrudAndImportService;
  attendeeRecommendations: EventRecommendationService;
  eventValues: EventValueRecommendationService;
  readiness: EventGoalAndReadinessService;
}

// 每个 capabilityId 对应页面中的一个功能块，后续可按块替换 live 实现。
export const appEventsCrudServiceFactory =
  createModuleServiceFactory<EventCrudAndImportService>({
    capabilityId: "app-events:event-crud-import",
    implementations: {
      mock: () => createEventCrudAndImportService(),
    },
  });

export const appEventsAttendeeRecommendationServiceFactory =
  createModuleServiceFactory<EventRecommendationService>({
    capabilityId: "app-events:event-recommendations",
    implementations: {
      mock: () => createEventRecommendationService(),
    },
  });

export const appEventsValueRecommendationServiceFactory =
  createModuleServiceFactory<EventValueRecommendationService>({
    capabilityId: "app-events:event-value-recommendations",
    implementations: {
      mock: () => createEventValueRecommendationService(),
    },
  });

export const appEventsReadinessServiceFactory =
  createModuleServiceFactory<EventGoalAndReadinessService>({
    capabilityId: "app-events:event-readiness",
    implementations: {
      mock: () => createEventGoalAndReadinessService(),
    },
  });

function unwrapService<TService>(
  resolution: ServiceResolution<TService>,
): TService {
  // Events 页面当前使用同步装配；任一能力缺失时直接抛出明确错误。
  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function createAppEventsRouteServices(
  mode?: ModuleMode | string,
): AppEventsRouteServices {
  // 返回一个页面级 bundle，页面只关心“活动页需要哪些服务”，不关心每个服务怎么创建。
  return {
    attendeeRecommendations: unwrapService(
      appEventsAttendeeRecommendationServiceFactory.create(mode),
    ),
    eventValues: unwrapService(
      appEventsValueRecommendationServiceFactory.create(mode),
    ),
    events: unwrapService(appEventsCrudServiceFactory.create(mode)),
    readiness: unwrapService(appEventsReadinessServiceFactory.create(mode)),
  };
}
