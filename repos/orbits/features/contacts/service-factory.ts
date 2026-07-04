// Contacts service factory 管理联系人列表搜索/过滤和单个联系人详情编辑预览。
// mock/hybrid/live 通过同一个 factory 切换；live 列表读取共享 live record storage。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridContactsListSearchAndFilterService } from "./contact-graph-query";
import { createLiveContactDetailTagStatusService } from "./live-detail-service";
import { createLiveContactsListSearchAndFilterService } from "./live-service";
import { createMockContactDetailTagStatusService } from "./mock-detail-service";
import { createMockContactsListSearchAndFilterService } from "./mock-service";
import { createConfiguredStorageContactGraphProvider } from "./storage/contact-live-record-provider";
import type { ContactDetailTagStatusService } from "./detail-contract";
import type { ContactsListSearchAndFilterService } from "./service";

export const contactsListSearchAndFilterServiceFactory =
  createModuleServiceFactory<ContactsListSearchAndFilterService>({
    capabilityId: "contacts-list-search-filter",
    implementations: {
      hybrid: () => createHybridContactsListSearchAndFilterService(),
      live: () =>
        createLiveContactsListSearchAndFilterService({
          provider: createConfiguredStorageContactGraphProvider(),
        }),
      mock: () => createMockContactsListSearchAndFilterService(),
    },
  });

export const contactDetailTagStatusServiceFactory =
  createModuleServiceFactory<ContactDetailTagStatusService>({
    capabilityId: "contact-detail-tag-status",
    implementations: {
      live: () =>
        createLiveContactDetailTagStatusService({
          provider: createConfiguredStorageContactGraphProvider(),
        }),
      mock: () => createMockContactDetailTagStatusService(),
    },
  });

export function resolveContactsListSearchAndFilterService(
  mode?: ModuleMode | string,
) {
  return contactsListSearchAndFilterServiceFactory.create(mode);
}

export function createContactsListSearchAndFilterService(
  mode?: ModuleMode | string,
): ContactsListSearchAndFilterService {
  const resolution = resolveContactsListSearchAndFilterService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveContactDetailTagStatusService(
  mode?: ModuleMode | string,
) {
  return contactDetailTagStatusServiceFactory.create(mode);
}

export function createContactDetailTagStatusService(
  mode?: ModuleMode | string,
): ContactDetailTagStatusService {
  const resolution = resolveContactDetailTagStatusService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
