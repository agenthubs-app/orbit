// Bootstrap service factory 汇总应用启动所需的用户、权限和导航初始状态。
// 页面入口通过它拿稳定启动数据，而不是直接读 fixture 或 live storage。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridAppBootstrapService } from "./app-bootstrap-mock-aggregator/hybrid-service";
import { createLiveAppBootstrapService } from "./live-service";
import { createMockAppBootstrapService } from "./mock-service";
import type { MockAppBootstrapService } from "./mock-service";
import type { AppBootstrapService } from "./service";
import { createConfiguredStorageAppBootstrapProvider } from "./storage/bootstrap-live-record-provider";

export const appBootstrapServiceFactory =
  createModuleServiceFactory<AppBootstrapService>({
    capabilityId: "app-bootstrap",
    implementations: {
      hybrid: () => createHybridAppBootstrapService(),
      live: () =>
        createLiveAppBootstrapService({
          provider: createConfiguredStorageAppBootstrapProvider(),
        }),
      mock: () => createMockAppBootstrapService(),
    },
  });

export function resolveAppBootstrapService(mode?: ModuleMode | string) {
  return appBootstrapServiceFactory.create(mode);
}

export function createAppBootstrapService(mode: "mock"): MockAppBootstrapService;
export function createAppBootstrapService(
  mode?: ModuleMode | string,
): AppBootstrapService;
export function createAppBootstrapService(
  mode?: ModuleMode | string,
): AppBootstrapService {
  const resolution = resolveAppBootstrapService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
