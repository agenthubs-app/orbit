import { createEventGoalAndReadinessService } from "../../../../../features/events/service-factory";
import { createEventCrudAndImportService } from "../../../../../features/events/service-factory";
import type { EventCrudAndImportService } from "../../../../../features/events/event-crud-and-import/service";
import type { EventGoalAndReadinessService } from "../../../../../features/events/goal-readiness/contract";
import {
  createActorScopedEventRecommendationService,
  createEventRecommendationService,
} from "../../../../../features/recommendations/service-factory";
import type { EventRecommendationService } from "../../../../../features/recommendations/service";
import {
  createActorScopedEventValueRecommendationService,
  createEventValueRecommendationService,
} from "../../../../../features/recommendations/service-factory";
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

export interface AppEventsRouteServiceOptions {
  actorId?: string | null;
  mode?: ModuleMode | string;
}

// 每个 capabilityId 对应页面中的一个功能块，后续可按块替换 live 实现。
const appEventsCrudServiceFactory =
  createModuleServiceFactory<EventCrudAndImportService>({
    capabilityId: "app-events:event-crud-import",
    implementations: {
      live: ({ requestedMode }) => createEventCrudAndImportService(requestedMode),
      mock: ({ requestedMode }) => createEventCrudAndImportService(requestedMode),
    },
  });

function appEventsAttendeeRecommendationServiceFactory(
  actorId?: string | null,
) {
  const normalizedActorId = actorId?.trim() ?? "";

  return createModuleServiceFactory<EventRecommendationService>({
    capabilityId: "app-events:event-recommendations",
    implementations: {
      live: () =>
        createActorScopedEventRecommendationService(normalizedActorId),
      mock: ({ requestedMode }) =>
        createEventRecommendationService(requestedMode),
    },
  });
}

function appEventsValueRecommendationServiceFactory(actorId?: string | null) {
  const normalizedActorId = actorId?.trim() ?? "";

  return createModuleServiceFactory<EventValueRecommendationService>({
    capabilityId: "app-events:event-value-recommendations",
    implementations: {
      live: () =>
        createActorScopedEventValueRecommendationService(normalizedActorId),
      mock: ({ requestedMode }) =>
        createEventValueRecommendationService(requestedMode),
    },
  });
}

const appEventsReadinessServiceFactory =
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
  options: AppEventsRouteServiceOptions = {},
): ServiceResolution<AppEventsRouteServices> {
  const attendeeRecommendations =
    appEventsAttendeeRecommendationServiceFactory(options.actorId).create(
      options.mode,
    );
  const eventValues = appEventsValueRecommendationServiceFactory(
    options.actorId,
  ).create(options.mode);
  const events = appEventsCrudServiceFactory.create(options.mode);
  const readiness = appEventsReadinessServiceFactory.create(options.mode);

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
  options: AppEventsRouteServiceOptions = {},
): AppEventsRouteServices {
  // 返回一个页面级 bundle，页面只关心“活动页需要哪些服务”，不关心每个服务怎么创建。
  return unwrapService(resolveAppEventsRouteServices(options));
}
