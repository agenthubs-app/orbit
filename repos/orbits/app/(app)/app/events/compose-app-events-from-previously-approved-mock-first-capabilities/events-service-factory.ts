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

export interface AppEventsRouteServices {
  events: EventCrudAndImportService;
  attendeeRecommendations: EventRecommendationService;
  eventValues: EventValueRecommendationService;
  readiness: EventGoalAndReadinessService;
}

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
  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function createAppEventsRouteServices(
  mode?: ModuleMode | string,
): AppEventsRouteServices {
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
