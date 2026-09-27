// Chat service factory. After the legacy chat retirement (Sprint 0104) only the
// relationship inbox's staged draft threads remain here; person-to-person
// conversations live in features/relationship-communication.
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createLiveAsyncRelationshipConversationService } from "./live-async-service";
import { createMockAsyncRelationshipConversationService } from "./mock-service";
import { createConfiguredStorageAsyncRelationshipConversationProvider } from "./storage/async-relationship-conversation-live-record-provider";
import type { AsyncRelationshipConversationService } from "./service";

export const asyncRelationshipConversationServiceFactory =
  createModuleServiceFactory<AsyncRelationshipConversationService>({
    capabilityId: "async-relationship-conversation",
    implementations: {
      hybrid: () =>
        createLiveAsyncRelationshipConversationService({
          provider:
            createConfiguredStorageAsyncRelationshipConversationProvider(),
        }),
      live: () =>
        createLiveAsyncRelationshipConversationService({
          provider:
            createConfiguredStorageAsyncRelationshipConversationProvider(),
        }),
      mock: () => createMockAsyncRelationshipConversationService(),
    },
  });

export function resolveAsyncRelationshipConversationService(
  mode?: ModuleMode | string,
) {
  return asyncRelationshipConversationServiceFactory.create(mode);
}

export function createAsyncRelationshipConversationService(
  mode?: ModuleMode | string,
): AsyncRelationshipConversationService {
  const resolution = resolveAsyncRelationshipConversationService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
