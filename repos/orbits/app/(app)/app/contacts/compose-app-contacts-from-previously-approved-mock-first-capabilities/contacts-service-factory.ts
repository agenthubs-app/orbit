import { createContactsListSearchAndFilterService } from "../../../../../features/contacts/service-factory";
import type { ContactsListSearchAndFilterService } from "../../../../../features/contacts/service";
import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../../../../shared/services/module-mode";

// Contacts 列表页当前只需要“搜索和过滤”这一项页面级能力。
// 仍然通过 module-mode 包一层，后续接 local-remote/live 实现时不用改页面组件。
export const appContactsListSearchAndFilterServiceFactory =
  createModuleServiceFactory<ContactsListSearchAndFilterService>({
    capabilityId: "contacts",
    implementations: {
      mock: () => createContactsListSearchAndFilterService(),
    },
  });

export function resolveAppContactsListSearchAndFilterService(
  mode?: ModuleMode | string,
): ServiceResolution<ContactsListSearchAndFilterService> {
  // resolve 版本返回结构化成功/失败，适合测试不同 mode 的边界。
  return appContactsListSearchAndFilterServiceFactory.create(mode);
}

export function createAppContactsListSearchAndFilterService(): ContactsListSearchAndFilterService {
  // 页面运行时使用 throwing 版本，保持调用方代码简单。
  const resolution = resolveAppContactsListSearchAndFilterService();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
