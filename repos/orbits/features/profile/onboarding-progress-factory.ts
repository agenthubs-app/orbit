import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { resolveModuleMode } from "../../shared/services/module-mode";
import {
  createStorageProfileOnboardingProgressService,
  type ProfileOnboardingProgressPayload,
} from "./onboarding-progress";

interface ProgressGlobal {
  __orbitProfileOnboardingProgressMockStore?: LiveRecordStoreLike<ProfileOnboardingProgressPayload>;
}
const progressGlobal = globalThis as typeof globalThis & ProgressGlobal;

export function resolveProfileOnboardingProgressService(actorId: string) {
  const mode = resolveModuleMode();
  if (mode === "live") {
    const configured = createConfiguredPostgresLiveRecordStore<ProfileOnboardingProgressPayload>();
    return configured ? createStorageProfileOnboardingProgressService({ actorId, store: configured.store, workspaceId: configured.workspaceId }) : null;
  }
  progressGlobal.__orbitProfileOnboardingProgressMockStore ??= createMemoryLiveRecordStore<ProfileOnboardingProgressPayload>();
  return createStorageProfileOnboardingProgressService({
    actorId,
    store: progressGlobal.__orbitProfileOnboardingProgressMockStore,
    workspaceId: "orbit-profile-onboarding-mock",
  });
}
