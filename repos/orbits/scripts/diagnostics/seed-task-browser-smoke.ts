import { hash } from "bcryptjs";

import { createStorageAuthAccountProvisioningProvider } from "../../features/auth/storage/auth-account-provisioning-provider";
import { createStorageAuthUserProvider } from "../../features/auth/storage/auth-user-live-record-provider";
import { createProfileService } from "../../features/profile/service-factory";
import { resolveLiveDatabaseConnectionConfig } from "../../shared/storage/live-database-config";
import { runOrbitRecordsMigration } from "../../shared/storage/migrations";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
} from "../../shared/storage/postgres-live-record-store";

const database = resolveLiveDatabaseConnectionConfig();
const password = process.env.ORBIT_TASK_BROWSER_TEST_PASSWORD ?? "";
const target = database && new URL(database.connectionString);

if (
  !database ||
  database.target !== "local" ||
  (target?.hostname !== "127.0.0.1" && target?.hostname !== "localhost") ||
  target?.pathname !== "/orbit_line_d_browser" ||
  database.workspaceId !== "workspace:line-d-browser" ||
  password.length < 12
) {
  throw new Error("Use the dedicated loopback Task browser database and test password.");
}

async function main() {
  if (!database) throw new Error("Dedicated Task browser database is unavailable.");
  const client = createPgLiveRecordSqlClient({ connectionString: database.connectionString });
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  const now = new Date().toISOString();
  const user = {
    id: "user_orbit_task_browser_qa",
    email: "task-browser-qa@orbit.test",
    displayName: "Task Browser QA",
    provider: "credentials" as const,
    passwordHash: await hash(password, 12),
    providerAccountId: null,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await runOrbitRecordsMigration(client);
    await createStorageAuthUserProvider({ store, workspaceId: database.workspaceId }).saveUser(user);
    await createStorageAuthAccountProvisioningProvider({ store, workspaceId: database.workspaceId }).ensureAccountForUser(user);

    const profileId = `profile:${user.id}`;
    const existing = await store.getRecord({
      workspaceId: database.workspaceId,
      collectionName: "profiles",
      recordId: profileId,
    });
    if (!existing) throw new Error("Synthetic profile was not provisioned.");
    await store.upsertRecord({
      ...existing,
      payload: {
        ...existing.payload,
        displayName: user.displayName,
        displayNameConfirmed: true,
        birthDate: "2000-02-29",
        publicProfile: {
          primaryIndustryId: "technology_internet",
          secondaryIndustryId: "technology_internet.enterprise_software",
        },
        updatedAt: now,
      },
      updatedAt: now,
    });
  } finally {
    await client.close();
  }

  const profile = await createProfileService("live").getProfile({ actorId: user.id });
  if (!profile.success || profile.data.onboarding?.status !== "complete") {
    throw new Error("Synthetic Task browser profile is not onboarding-complete.");
  }
  console.log("Synthetic Task browser account and complete profile are ready in the dedicated local database.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Synthetic Task browser account setup failed.");
  process.exitCode = 1;
});
