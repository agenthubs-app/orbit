import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { resolveModuleMode } from "../../shared/services/module-mode";
import { createStorageProfileIntroQuota, type ProfileIntroQuotaPayload } from "./intro-onboarding-quota";

interface IntroQuotaGlobal {
  __orbitIntroQuotaMockStore?: LiveRecordStoreLike<ProfileIntroQuotaPayload>;
}
const globalQuota = globalThis as typeof globalThis & IntroQuotaGlobal;

export function resolveProfileIntroQuota(actorId: string) {
  const mode = resolveModuleMode();
  if (mode === "live") {
    const configured = createConfiguredPostgresLiveRecordStore<ProfileIntroQuotaPayload>();
    return configured ? createStorageProfileIntroQuota({ actorId, store: configured.store, workspaceId: configured.workspaceId }) : null;
  }
  globalQuota.__orbitIntroQuotaMockStore ??= createMemoryLiveRecordStore<ProfileIntroQuotaPayload>();
  return createStorageProfileIntroQuota({ actorId, store: globalQuota.__orbitIntroQuotaMockStore, workspaceId: "orbit-profile-intro-mock" });
}
