// Events service factory 管理活动相关的一组能力：
// 活动 CRUD/导入、参会者名册、目标准备、遇见记录、想认识和会后联系人复盘。
// 当前 mock 服务只生成可复核页面数据，不访问真实日历、活动平台或联系人库。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridEventCrudAndImportService } from "./event-crud-and-import/hybrid-service";
import { createLiveEventCrudAndImportService } from "./event-crud-and-import/live-service";
import { createConfiguredStorageEventStoreProvider } from "./event-crud-and-import/providers/storage-event-provider";
import { createMockEventAttendeeRosterService } from "./mock-attendee-service";
import { createMockEventEncounterNoteService } from "./mock-encounter-service";
import { createMockEventGoalAndReadinessService } from "./mock-goal-service";
import { createMockPostEventContactReviewService } from "./mock-post-event-service";
import { createMockEventCrudAndImportService } from "./mock-service";
import { createMockWantConnectService } from "./mock-want-connect-service";
import type { EventAttendeeRosterService } from "./attendee-contract";
import type { EventEncounterNoteService } from "./encounter-contract";
import type { EventGoalAndReadinessService } from "./goal-contract";
import type { PostEventContactReviewService } from "./post-event-contract";
import type { EventCrudAndImportService } from "./service";
import type { WantConnectService } from "./want-connect-contract";

export const eventCrudAndImportServiceFactory =
  createModuleServiceFactory<EventCrudAndImportService>({
    capabilityId: "event-crud-import",
    implementations: {
      hybrid: () => createHybridEventCrudAndImportService(),
      live: () =>
        createLiveEventCrudAndImportService({
          provider: createConfiguredStorageEventStoreProvider(),
        }),
      mock: () => createMockEventCrudAndImportService(),
    },
  });

export const eventAttendeeRosterServiceFactory =
  createModuleServiceFactory<EventAttendeeRosterService>({
    capabilityId: "event-attendee-roster",
    implementations: {
      mock: () => createMockEventAttendeeRosterService(),
    },
  });

export const eventGoalAndReadinessServiceFactory =
  createModuleServiceFactory<EventGoalAndReadinessService>({
    capabilityId: "event-goal-readiness",
    implementations: {
      mock: () => createMockEventGoalAndReadinessService(),
    },
  });

export const eventEncounterNoteServiceFactory =
  createModuleServiceFactory<EventEncounterNoteService>({
    capabilityId: "event-encounter-note",
    implementations: {
      mock: () => createMockEventEncounterNoteService(),
    },
  });

export const wantConnectServiceFactory =
  createModuleServiceFactory<WantConnectService>({
    capabilityId: "want-to-connect",
    implementations: {
      mock: () => createMockWantConnectService(),
    },
  });

export const postEventContactReviewServiceFactory =
  createModuleServiceFactory<PostEventContactReviewService>({
    capabilityId: "post-event-contact-review",
    implementations: {
      mock: () => createMockPostEventContactReviewService(),
    },
  });

export function resolveEventCrudAndImportService(mode?: ModuleMode | string) {
  return eventCrudAndImportServiceFactory.create(mode);
}

export function createEventCrudAndImportService(
  mode?: ModuleMode | string,
): EventCrudAndImportService {
  const resolution = resolveEventCrudAndImportService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveEventAttendeeRosterService(
  mode?: ModuleMode | string,
) {
  return eventAttendeeRosterServiceFactory.create(mode);
}

export function createEventAttendeeRosterService(
  mode?: ModuleMode | string,
): EventAttendeeRosterService {
  const resolution = resolveEventAttendeeRosterService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveEventGoalAndReadinessService(
  mode?: ModuleMode | string,
) {
  return eventGoalAndReadinessServiceFactory.create(mode);
}

export function createEventGoalAndReadinessService(
  mode?: ModuleMode | string,
): EventGoalAndReadinessService {
  const resolution = resolveEventGoalAndReadinessService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveEventEncounterNoteService(
  mode?: ModuleMode | string,
) {
  return eventEncounterNoteServiceFactory.create(mode);
}

export function createEventEncounterNoteService(
  mode?: ModuleMode | string,
): EventEncounterNoteService {
  const resolution = resolveEventEncounterNoteService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveWantConnectService(mode?: ModuleMode | string) {
  return wantConnectServiceFactory.create(mode);
}

export function createWantConnectService(
  mode?: ModuleMode | string,
): WantConnectService {
  const resolution = resolveWantConnectService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolvePostEventContactReviewService(
  mode?: ModuleMode | string,
) {
  return postEventContactReviewServiceFactory.create(mode);
}

export function createPostEventContactReviewService(
  mode?: ModuleMode | string,
): PostEventContactReviewService {
  const resolution = resolvePostEventContactReviewService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
