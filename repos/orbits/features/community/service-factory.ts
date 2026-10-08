/**
 * 社群加入记录的模块边界（AGENTS.md「Mock-to-Live Component Replacement」）。
 *
 * - mock：进程内内存存储（挂在 globalThis 上，dev 热重载后仍在），用于本地和测试；
 * - hybrid：未注册，按约定回落到 mock；
 * - live：`orbit_records`（Postgres）。数据库未配置时 fail closed，返回共享的
 *   NOT_IMPLEMENTED 解析失败，不回落到内存存储。
 *
 * 页面和 API route 只通过 `resolveCommunityMembershipService` 取服务。
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
import type { CommunityMembershipService } from "./contract";
import {
  createStorageCommunityMembershipService,
  type CommunityMembershipPayload,
} from "./membership";

export const COMMUNITY_MEMBERSHIP_CAPABILITY_ID = "community-membership";

interface CommunityMembershipBackend {
  store: LiveRecordStoreLike<CommunityMembershipPayload>;
  workspaceId: string;
}

interface CommunityMembershipGlobal {
  __orbitCommunityMembershipMockStore?: LiveRecordStoreLike<CommunityMembershipPayload>;
}

const communityGlobal = globalThis as typeof globalThis & CommunityMembershipGlobal;

function mockBackend(): CommunityMembershipBackend {
  communityGlobal.__orbitCommunityMembershipMockStore ??=
    createMemoryLiveRecordStore<CommunityMembershipPayload>();
  return {
    store: communityGlobal.__orbitCommunityMembershipMockStore,
    workspaceId: "orbit-community-mock",
  };
}

function liveBackend(): CommunityMembershipBackend | null {
  const configured = createConfiguredPostgresLiveRecordStore<CommunityMembershipPayload>();
  return configured
    ? { store: configured.store, workspaceId: configured.workspaceId }
    : null;
}

export const communityMembershipServiceFactory =
  createModuleServiceFactory<CommunityMembershipBackend | null>({
    capabilityId: COMMUNITY_MEMBERSHIP_CAPABILITY_ID,
    implementations: {
      live: liveBackend,
      mock: mockBackend,
    },
  });

export function resolveCommunityMembershipService(input: {
  actorId: string;
  mode?: ModuleMode | string;
}): ServiceResolution<CommunityMembershipService> {
  const resolution = communityMembershipServiceFactory.create(input.mode);
  if (resolution.success === false) return resolution;
  if (!resolution.service) {
    // live 已注册但数据库未配置：同样按 NOT_IMPLEMENTED fail closed。
    return createNotImplementedFailure(
      COMMUNITY_MEMBERSHIP_CAPABILITY_ID,
      resolution.mode,
      communityMembershipServiceFactory.availableModes,
    );
  }
  return {
    mode: resolution.mode,
    service: createStorageCommunityMembershipService({
      actorId: input.actorId,
      store: resolution.service.store,
      workspaceId: resolution.service.workspaceId,
    }),
    success: true,
  };
}

/**
 * 服务端页面读加入状态（SSR 首帧就要对）。读不到（未配置 / 存储故障）时按「未加入」渲染：
 * 页面会多露出一次社群入口，而「我已加入」是幂等写，不会造成错误状态。
 */
export async function readCommunityJoinedForActor(input: {
  actorId: string | null | undefined;
  mode?: ModuleMode | string;
}): Promise<boolean> {
  const actorId = input.actorId?.trim();
  if (!actorId) return false;
  const resolution = resolveCommunityMembershipService({ actorId, mode: input.mode });
  if (resolution.success === false) return false;
  try {
    return (await resolution.service.get()).joined;
  } catch {
    return false;
  }
}

export function resetCommunityMembershipMockStoreForTests(): void {
  delete communityGlobal.__orbitCommunityMembershipMockStore;
}
