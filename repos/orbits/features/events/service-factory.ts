// Events service factory 管理活动相关的一组能力：
// 活动 CRUD/导入、参会者名册、目标准备、遇见记录、想认识和会后联系人复盘。
// 当前 mock 服务只生成可复核页面数据，不访问真实日历、活动平台或联系人库。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridEventCrudAndImportService } from "./event-crud-and-import/hybrid-service";
import { createLiveEventCrudAndImportService } from "./event-crud-and-import/live-service";
import { createConfiguredStorageEventStoreProvider } from "./event-crud-and-import/providers/storage-event-provider";
import { createMockEventAttendeeRosterService } from "./attendee-roster/mock-service";
import { createLiveEventAttendeeRosterService } from "./attendee-roster/live-service";
import { createConfiguredGeneratedEventAttendeeRosterProvider } from "./attendee-roster/storage/generated-attendee-roster-live-record-provider";
import type { EventAttendeeRosterService } from "./attendee-roster/contract";
import { createMockEventEncounterNoteService } from "./encounter-note/mock-service";
import { createLiveEventEncounterNoteService } from "./encounter-note/live-service";
import type { EventEncounterNoteService } from "./encounter-note/contract";
import { createMockEventCrudAndImportService } from "./event-crud-and-import/mock-service";
import type { EventCrudAndImportService } from "./event-crud-and-import/service";
import { createMockEventGoalAndReadinessService } from "./goal-readiness/mock-service";
import { createLiveEventGoalAndReadinessService } from "./goal-readiness/live-service";
import { createConfiguredGeneratedEventGoalReadinessProvider } from "./goal-readiness/storage/generated-goal-readiness-live-record-provider";
import type { EventGoalAndReadinessService } from "./goal-readiness/contract";
import { createMockPostEventContactReviewService } from "./post-event-review/mock-service";
import { createLivePostEventContactReviewService } from "./post-event-review/live-service";
import type { PostEventContactReviewService } from "./post-event-review/contract";
import { createConfiguredGeneratedPostEventContactReviewProvider } from "./post-event-review/storage/generated-post-event-review-live-record-provider";
import { createConfiguredGeneratedEventEncounterNoteProvider } from "./encounter-note/storage/generated-encounter-note-live-record-provider";
import { createConfiguredGeneratedWantConnectProvider } from "./want-connect/storage/generated-want-connect-live-record-provider";
import {
  createConfiguredEventCapabilityRecordProvider,
  EVENT_WORK_RECORD_COLLECTIONS,
} from "./storage/event-work-record-provider";
import { createMockWantConnectService } from "./want-connect/mock-service";
import { createLiveWantConnectService } from "./want-connect/live-service";
import type { WantConnectService } from "./want-connect/contract";

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
      hybrid: () =>
        createLiveEventAttendeeRosterService({
          provider: createConfiguredEventCapabilityRecordProvider({
            collectionName: EVENT_WORK_RECORD_COLLECTIONS.attendeeRoster,
          }),
        }),
      live: () =>
        createLiveEventAttendeeRosterService({
          provider: createConfiguredGeneratedEventAttendeeRosterProvider(),
        }),
      mock: () => createMockEventAttendeeRosterService(),
    },
  });

export const eventGoalAndReadinessServiceFactory =
  createModuleServiceFactory<EventGoalAndReadinessService>({
    capabilityId: "event-goal-readiness",
    implementations: {
      hybrid: () =>
        createLiveEventGoalAndReadinessService({
          provider: createConfiguredEventCapabilityRecordProvider({
            collectionName: EVENT_WORK_RECORD_COLLECTIONS.goalReadiness,
          }),
        }),
      live: () =>
        createLiveEventGoalAndReadinessService({
          provider: createConfiguredGeneratedEventGoalReadinessProvider(),
        }),
      mock: () => createMockEventGoalAndReadinessService(),
    },
  });

export const eventEncounterNoteServiceFactory =
  createModuleServiceFactory<EventEncounterNoteService>({
    capabilityId: "event-encounter-note",
    implementations: {
      hybrid: () =>
        createLiveEventEncounterNoteService({
          provider: createConfiguredEventCapabilityRecordProvider({
            collectionName: EVENT_WORK_RECORD_COLLECTIONS.encounterNotes,
          }),
        }),
      live: () =>
        createLiveEventEncounterNoteService({
          provider: createConfiguredGeneratedEventEncounterNoteProvider(),
        }),
      mock: () => createMockEventEncounterNoteService(),
    },
  });

export const wantConnectServiceFactory =
  createModuleServiceFactory<WantConnectService>({
    capabilityId: "want-to-connect",
    implementations: {
      hybrid: () =>
        createLiveWantConnectService({
          provider: createConfiguredEventCapabilityRecordProvider({
            collectionName: EVENT_WORK_RECORD_COLLECTIONS.wantConnect,
          }),
        }),
      live: () =>
        createLiveWantConnectService({
          provider: createConfiguredGeneratedWantConnectProvider(),
        }),
      mock: () => createMockWantConnectService(),
    },
  });

export const postEventContactReviewServiceFactory =
  createModuleServiceFactory<PostEventContactReviewService>({
    capabilityId: "post-event-contact-review",
    implementations: {
      hybrid: () =>
        createLivePostEventContactReviewService({
          provider: createConfiguredEventCapabilityRecordProvider({
            collectionName: EVENT_WORK_RECORD_COLLECTIONS.postEventReview,
          }),
        }),
      live: () =>
        createLivePostEventContactReviewService({
          provider: createConfiguredGeneratedPostEventContactReviewProvider(),
        }),
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
