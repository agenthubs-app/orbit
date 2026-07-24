// Auth service factory:live 接 Postgres live store,mock 用内存 store 跑
// 同一套逻辑(注册/校验行为完全一致,便于测试与 SSR 预览)。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { createAuthUserService } from "./auth-user-service";
import type { AuthUserService } from "./service";
import {
  createConfiguredStorageAuthUserProvider,
  createStorageAuthUserProvider,
} from "./storage/auth-user-live-record-provider";

const mockAuthUserStore = createMemoryLiveRecordStore();

export const authUserServiceFactory =
  createModuleServiceFactory<AuthUserService>({
    capabilityId: "auth-user",
    implementations: {
      live: () =>
        createAuthUserService({
          provider: createConfiguredStorageAuthUserProvider(),
        }),
      mock: () =>
        createAuthUserService({
          provider: createStorageAuthUserProvider({
            store: mockAuthUserStore,
            workspaceId: "workspace:mock",
          }),
        }),
    },
  });

export function resolveAuthUserService(
  mode?: ModuleMode | string,
): AuthUserService {
  const resolution = authUserServiceFactory.create(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
