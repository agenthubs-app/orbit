/**
 * 引导记录的模块边界（AGENTS.md「Mock-to-Live Component Replacement」），与
 * `features/community/service-factory.ts` 同一形态：
 *
 * - mock：进程内内存存储（挂在 globalThis 上，dev 热重载后仍在），用于本地和测试；
 * - hybrid：未注册，按约定回落到 mock；
 * - live：`orbit_records`（Postgres）。数据库未配置时 fail closed，返回共享的
 *   NOT_IMPLEMENTED 解析失败，不回落到内存存储。
 *
 * 页面和 API route 只通过 `resolveGuideStateService` 取服务。
 */
import {
  createModuleServiceFactory,
  createNotImplementedFailure,
  type ModuleMode,
  type ServiceResolution,
} from "../../shared/services/module-mode";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import {
  createMemoryLiveRecordStore,
  type LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";
import {
  createStorageGuideStateService,
  type GuideStatePayload,
  type GuideStateService,
} from "./guide-state";

export const GUIDE_STATE_CAPABILITY_ID = "guide-state";

interface GuideStateBackend {
  store: LiveRecordStoreLike<GuideStatePayload>;
  workspaceId: string;
}

interface GuideStateGlobal {
  __orbitGuideStateMockStore?: LiveRecordStoreLike<GuideStatePayload>;
}

const guideGlobal = globalThis as typeof globalThis & GuideStateGlobal;

function mockBackend(): GuideStateBackend {
  guideGlobal.__orbitGuideStateMockStore ??= createMemoryLiveRecordStore<GuideStatePayload>();
  return { store: guideGlobal.__orbitGuideStateMockStore, workspaceId: "orbit-guide-mock" };
}

function liveBackend(): GuideStateBackend | null {
  const configured = createConfiguredPostgresLiveRecordStore<GuideStatePayload>();
  return configured ? { store: configured.store, workspaceId: configured.workspaceId } : null;
}

export const guideStateServiceFactory = createModuleServiceFactory<GuideStateBackend | null>({
  capabilityId: GUIDE_STATE_CAPABILITY_ID,
  implementations: {
    live: liveBackend,
    mock: mockBackend,
  },
});

export function resolveGuideStateService(input: {
  actorId: string;
  mode?: ModuleMode | string;
}): ServiceResolution<GuideStateService> {
  const resolution = guideStateServiceFactory.create(input.mode);
  if (resolution.success === false) return resolution;
  if (!resolution.service) {
    return createNotImplementedFailure(
      GUIDE_STATE_CAPABILITY_ID,
      resolution.mode,
      guideStateServiceFactory.availableModes,
    );
  }
  return {
    mode: resolution.mode,
    service: createStorageGuideStateService({
      actorId: input.actorId,
      store: resolution.service.store,
      workspaceId: resolution.service.workspaceId,
    }),
    success: true,
  };
}

export function resetGuideStateMockStoreForTests(): void {
  delete guideGlobal.__orbitGuideStateMockStore;
}
