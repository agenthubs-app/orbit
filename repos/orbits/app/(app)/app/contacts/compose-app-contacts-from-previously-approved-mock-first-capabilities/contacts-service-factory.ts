import { createContactsListSearchAndFilterService } from "../../../../../features/contacts/service-factory";
import type { ContactsListSearchAndFilterService } from "../../../../../features/contacts/service";
import {
  createModuleServiceFactory,
  type ModuleMode,
  type ServiceResolution,
} from "../../../../../shared/services/module-mode";

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
  return appContactsListSearchAndFilterServiceFactory.create(mode);
}

export function createAppContactsListSearchAndFilterService(): ContactsListSearchAndFilterService {
  const resolution = resolveAppContactsListSearchAndFilterService();

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
