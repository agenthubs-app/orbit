// Account service factory 负责账号会话能力的运行时选择。
// 当前只有 mock 实现，用于登录/注册页面在无真实认证后端时保持可测。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createLiveAccountSessionService } from "./live-service";
import { createMockAccountSessionService } from "./mock-service";
import type { AccountSessionService } from "./service";
import { createConfiguredStorageAccountSessionProvider } from "./storage/account-live-record-provider";

export const accountSessionServiceFactory =
  createModuleServiceFactory<AccountSessionService>({
    capabilityId: "account-session",
    implementations: {
      live: () =>
        createLiveAccountSessionService({
          provider: createConfiguredStorageAccountSessionProvider(),
        }),
      mock: () => createMockAccountSessionService(),
    },
  });

export function resolveAccountSessionService(mode?: ModuleMode | string) {
  return accountSessionServiceFactory.create(mode);
}

export function createAccountSessionService(
  mode?: ModuleMode | string,
): AccountSessionService {
  const resolution = resolveAccountSessionService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
