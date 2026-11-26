import { createConfiguredPostgresLiveRecordStore } from "../../shared/storage/configured-live-record-store";
import { createMemoryLiveRecordStore, type LiveRecordStoreLike } from "../../shared/storage/live-record-store";
import { resolveModuleMode } from "../../shared/services/module-mode";
import { profileContactMethods } from "../../shared/compute/profile-contact-methods";
import {
  createStorageProfileOnboardingProgressService,
  type ProfileOnboardingProgressPayload,
} from "./onboarding-progress";

interface ProgressGlobal {
  __orbitProfileOnboardingProgressMockStore?: LiveRecordStoreLike<ProfileOnboardingProgressPayload>;
}
const progressGlobal = globalThis as typeof globalThis & ProgressGlobal;

export function resolveProfileOnboardingProgressService(actorId: string, canFinishRepair?: () => Promise<boolean>) {
  const mode = resolveModuleMode();
  if (mode === "live") {
    const configured = createConfiguredPostgresLiveRecordStore<ProfileOnboardingProgressPayload>();
    if (!configured) return null;
    return createStorageProfileOnboardingProgressService({
      actorId,
      store: configured.store,
      workspaceId: configured.workspaceId,
      ...(canFinishRepair ? { canFinishRepair } : {}),
      async hasContactMethod() {
        const { rows } = await configured.client.query<{ handles: unknown }>(
          `select payload -> 'handles' as handles from orbit_records
           where workspace_id = $1 and collection_name = 'profiles' and user_id = $2
             and payload ->> 'accountId' = $2 and lifecycle_state = 'active'
           order by coalesce(occurred_at, updated_at) desc, updated_at desc, record_id limit 1`,
          [configured.workspaceId, actorId],
        );
        return Object.keys(profileContactMethods(rows[0]?.handles)).length > 0;
      },
    });
  }
  progressGlobal.__orbitProfileOnboardingProgressMockStore ??= createMemoryLiveRecordStore<ProfileOnboardingProgressPayload>();
  return createStorageProfileOnboardingProgressService({
    actorId,
    store: progressGlobal.__orbitProfileOnboardingProgressMockStore,
    workspaceId: "orbit-profile-onboarding-mock",
  });
}
