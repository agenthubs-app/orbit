import { createEventGoalAndReadinessService } from "../../../../../features/events/service-factory";
import { createEventCrudAndImportService } from "../../../../../features/events/service-factory";
import type { EventCrudAndImportService } from "../../../../../features/events/event-crud-and-import/service";
import type { EventGoalAndReadinessService } from "../../../../../features/events/goal-readiness/contract";
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
      live: ({ requestedMode }) => createEventCrudAndImportService(requestedMode),
      mock: ({ requestedMode }) => createEventCrudAndImportService(requestedMode),
    },
  });

export const appEventsAttendeeRecommendationServiceFactory =
  createModuleServiceFactory<EventRecommendationService>({
    capabilityId: "app-events:event-recommendations",
    implementations: {
      live: ({ requestedMode }) => createEventRecommendationService(requestedMode),
      mock: ({ requestedMode }) => createEventRecommendationService(requestedMode),
    },
  });

export const appEventsValueRecommendationServiceFactory =
  createModuleServiceFactory<EventValueRecommendationService>({
    capabilityId: "app-events:event-value-recommendations",
    implementations: {
      live: ({ requestedMode }) =>
        createEventValueRecommendationService(requestedMode),
      mock: ({ requestedMode }) =>
        createEventValueRecommendationService(requestedMode),
    },
  });

export const appEventsReadinessServiceFactory =
  createModuleServiceFactory<EventGoalAndReadinessService>({
    capabilityId: "app-events:event-readiness",
    implementations: {
      live: ({ requestedMode }) =>
        createEventGoalAndReadinessService(requestedMode),
      mock: ({ requestedMode }) =>
        createEventGoalAndReadinessService(requestedMode),
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

export function resolveAppEventsRouteServices(
  mode?: ModuleMode | string,
): ServiceResolution<AppEventsRouteServices> {
  const attendeeRecommendations =
    appEventsAttendeeRecommendationServiceFactory.create(mode);
  const eventValues = appEventsValueRecommendationServiceFactory.create(mode);
  const events = appEventsCrudServiceFactory.create(mode);
  const readiness = appEventsReadinessServiceFactory.create(mode);

  if (attendeeRecommendations.success === false) {
    return attendeeRecommendations;
  }

  if (eventValues.success === false) {
    return eventValues;
  }

  if (events.success === false) {
    return events;
  }

  if (readiness.success === false) {
    return readiness;
  }

  return {
    success: true,
    mode: events.mode,
    service: {
      attendeeRecommendations: attendeeRecommendations.service,
      eventValues: eventValues.service,
      events: events.service,
      readiness: readiness.service,
    },
  };
}

export function createAppEventsRouteServices(
  mode?: ModuleMode | string,
): AppEventsRouteServices {
  // 返回一个页面级 bundle，页面只关心“活动页需要哪些服务”，不关心每个服务怎么创建。
  return unwrapService(resolveAppEventsRouteServices(mode));
}
