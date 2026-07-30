// Followups service factory 管理跟进任务生成和消息草稿生成。
// 当前 mock 只生成建议和草稿，不创建真实任务、不发送消息。
import { createModuleServiceFactory, type ModuleMode } from "../../shared/services/module-mode";
import { createHybridFollowupTaskGenerationService } from "./followup-task-generation-mock/hybrid-service";
import { createLiveFollowupTaskGenerationService } from "./live-service";
import { createLiveMessageDraftGeneratorService } from "./live-message-draft-service";
import { createMockMessageDraftGeneratorService } from "./mock-message-draft-service";
import { createMockFollowupTaskGenerationService } from "./mock-service";
import { createStagedContactInvitationService } from "./staged-contact-invitation-service";
import { createUnavailableContactInvitationService } from "./staged-contact-invitation-service";
import type { ContactInvitationService } from "./contact-invitation-contract";
import type { MessageDraftGeneratorService } from "./message-draft-contract";
import type { FollowupTaskGenerationService } from "./service";
import { createConfiguredStorageFollowupTaskProvider } from "./storage/followup-live-record-provider";
import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import {
  createMemoryLiveRecordStore,
  type LiveRecordStoreLike,
} from "../../shared/storage/live-record-store";

export const followupTaskGenerationServiceFactory =
  createModuleServiceFactory<FollowupTaskGenerationService>({
    capabilityId: "followup-task-generation",
    implementations: {
      hybrid: () => createHybridFollowupTaskGenerationService(),
      live: () =>
        createLiveFollowupTaskGenerationService({
          provider: createConfiguredStorageFollowupTaskProvider(),
        }),
      mock: () => createMockFollowupTaskGenerationService(),
    },
  });

export const messageDraftGeneratorServiceFactory =
  createModuleServiceFactory<MessageDraftGeneratorService>({
    capabilityId: "message-draft-generator",
    implementations: {
      live: () => createLiveMessageDraftGeneratorService(),
      mock: () => createMockMessageDraftGeneratorService(),
    },
  });

const mockContactInvitationStore =
  createMemoryLiveRecordStore<Record<string, unknown>>();

export interface ContactInvitationServiceContext {
  actorId: string;
  now?: () => string;
  store?: LiveRecordStoreLike<Record<string, unknown>>;
  workspaceId: string;
}

export function resolveFollowupTaskGenerationService(
  mode?: ModuleMode | string,
) {
  return followupTaskGenerationServiceFactory.create(mode);
}

export function createFollowupTaskGenerationService(
  mode?: ModuleMode | string,
): FollowupTaskGenerationService {
  const resolution = resolveFollowupTaskGenerationService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveMessageDraftGeneratorService(
  mode?: ModuleMode | string,
) {
  return messageDraftGeneratorServiceFactory.create(mode);
}

export function createMessageDraftGeneratorService(
  mode?: ModuleMode | string,
): MessageDraftGeneratorService {
  const resolution = resolveMessageDraftGeneratorService(mode);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}

export function resolveContactInvitationService(
  mode?: ModuleMode | string,
  context?: ContactInvitationServiceContext,
) {
  if (!context?.actorId.trim() || !context.workspaceId.trim()) {
    return {
      success: false as const,
      error: {
        message: "An authenticated actor is required for contact invitations.",
      },
    };
  }

  const normalizedMode = mode === "live" ? "live" : "mock";
  const configured =
    normalizedMode === "live" && !context.store
      ? createConfiguredPostgresLiveRecordStore()
      : null;
  const store =
    context.store ??
    (normalizedMode === "live" ? configured?.store : mockContactInvitationStore);

  return {
    success: true as const,
    service: store
      ? createStagedContactInvitationService({
          actorId: context.actorId,
          now: context.now,
          store,
          workspaceId: context.workspaceId,
        })
      : createUnavailableContactInvitationService(),
  };
}

export function createContactInvitationService(
  mode?: ModuleMode | string,
  context?: ContactInvitationServiceContext,
): ContactInvitationService {
  const resolution = resolveContactInvitationService(mode, context);

  if (resolution.success === false) {
    throw new Error(resolution.error.message);
  }

  return resolution.service;
}
