// Bootstrap service factory 汇总应用启动所需的用户、权限和导航初始状态。
// 现在保持 mock-only，页面入口通过它拿稳定启动数据，而不是直接读 fixture。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridAppBootstrapService } from "./app-bootstrap-mock-aggregator/hybrid-service";
import { createMockAppBootstrapService } from "./mock-service";
import type { AppBootstrapService } from "./service";

export const appBootstrapServiceFactory =
  createModuleServiceFactory<AppBootstrapService>({
    capabilityId: "app-bootstrap",
    implementations: {
      hybrid: () => createHybridAppBootstrapService(),
      mock: () => createMockAppBootstrapService(),
    },
  });

export function resolveAppBootstrapService(mode?: ModuleMode | string) {
  return appBootstrapServiceFactory.create(mode);
}

export function createAppBootstrapService(
  mode?: ModuleMode | string,
): AppBootstrapService {
  const resolution = resolveAppBootstrapService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
