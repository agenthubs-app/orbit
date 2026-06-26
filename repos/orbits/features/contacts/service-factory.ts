import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createMockContactDetailTagStatusService } from "./mock-detail-service";
import { createMockContactsListSearchAndFilterService } from "./mock-service";
import type { ContactDetailTagStatusService } from "./detail-contract";
import type { ContactsListSearchAndFilterService } from "./service";

export const contactsListSearchAndFilterServiceFactory =
  createModuleServiceFactory<ContactsListSearchAndFilterService>({
    capabilityId: "contacts-list-search-filter",
    implementations: {
      mock: () => createMockContactsListSearchAndFilterService(),
    },
  });

export const contactDetailTagStatusServiceFactory =
  createModuleServiceFactory<ContactDetailTagStatusService>({
    capabilityId: "contact-detail-tag-status",
    implementations: {
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
