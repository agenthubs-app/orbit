import type { AuthUserDTO, AuthUserProvider } from "../features/auth/contract";
import {
  createStorageAuthAccountProvisioningProvider,
} from "../features/auth/storage/auth-account-provisioning-provider";
import { AUTH_USER_LIVE_RECORD_COLLECTION } from "../features/auth/storage/auth-user-live-record-provider";
import { createConfiguredPostgresLiveRecordStore } from "../shared/storage/configured-live-record-store";
import { loadLocalEnv } from "./load-local-env";

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function authUserFromPayload(
  payload: Record<string, unknown>,
): AuthUserDTO | null {
  const provider = payload.provider;

  if (
    !nonEmptyString(payload.id) ||
    !nonEmptyString(payload.email) ||
    !nonEmptyString(payload.displayName) ||
    (provider !== "credentials" && provider !== "google") ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.updatedAt)
  ) {
    return null;
  }

  return {
    id: payload.id,
    email: payload.email,
    displayName: payload.displayName,
    provider: provider as AuthUserProvider,
    createdAt: payload.createdAt,
    updatedAt: payload.updatedAt,
  };
}

async function main(): Promise<void> {
  loadLocalEnv();

  const configuredStore = createConfiguredPostgresLiveRecordStore();

  if (!configuredStore) {
    throw new Error("The configured live store is unavailable.");
  }

  const provisioner = createStorageAuthAccountProvisioningProvider({
    store: configuredStore.store,
    workspaceId: configuredStore.workspaceId,
  });

  try {
    const records = await configuredStore.store.listRecords({
      workspaceId: configuredStore.workspaceId,
      collectionName: AUTH_USER_LIVE_RECORD_COLLECTION,
    });
    let provisioned = 0;
    let invalid = 0;

    for (const record of records) {
      const user = authUserFromPayload(record.payload);

      if (!user) {
        invalid += 1;
        continue;
      }

      await provisioner.ensureAccountForUser(user);
      provisioned += 1;
    }

    console.log(
      JSON.stringify({
        authUsersFound: records.length,
        invalidAuthUsers: invalid,
        membershipsEnsured: provisioned,
        workspaceId: configuredStore.workspaceId,
      }),
    );
  } finally {
    await configuredStore.client.close();
  }
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Auth account membership backfill failed.",
  );
  process.exitCode = 1;
});
