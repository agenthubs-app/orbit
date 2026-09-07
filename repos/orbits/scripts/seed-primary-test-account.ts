import { execFileSync } from "node:child_process";

import { createStorageAuthAccountProvisioningProvider } from "../features/auth/storage/auth-account-provisioning-provider";
import { createStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
} from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";
import {
  ensurePrimaryTestAccount,
  PRIMARY_TEST_ACCOUNT,
} from "./lib/primary-test-account";

function runFixtureScript(script: string, args: readonly string[]): void {
  execFileSync(process.execPath, ["--import", "tsx", script, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
}

async function main(): Promise<void> {
  loadLocalEnv();
  const password = process.env[PRIMARY_TEST_ACCOUNT.passwordEnv] ?? "";
  const database = resolveLiveDatabaseConnectionConfig();
  if (!database) {
    throw new Error(
      "Configure ORBIT_EVENT_DATABASE_URL, ORBIT_LIVE_DATABASE_URL, or ORBIT_DATABASE_URL before seeding the primary test account.",
    );
  }

  const client = createPgLiveRecordSqlClient({
    connectionString: database.connectionString,
  });
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  let actorId = "";

  try {
    await runOrbitRecordsMigration(client);
    const user = await ensurePrimaryTestAccount({
      accountProvisioner: createStorageAuthAccountProvisioningProvider({
        store,
        workspaceId: database.workspaceId,
      }),
      password,
      provider: createStorageAuthUserProvider({
        store,
        workspaceId: database.workspaceId,
      }),
    });
    actorId = user.id;
  } finally {
    await client.close();
  }

  const emailArgs = ["--email", PRIMARY_TEST_ACCOUNT.email] as const;
  runFixtureScript("scripts/seed-account-agent-pressure-fixtures.ts", [
    ...emailArgs,
    "--mode",
    "seed",
  ]);
  runFixtureScript("scripts/seed-account-contact-fixtures.ts", emailArgs);
  runFixtureScript("scripts/seed-account-agent-pressure-fixtures.ts", [
    ...emailArgs,
    "--mode",
    "verify",
  ]);

  console.log(
    JSON.stringify(
      {
        actorId,
        account: PRIMARY_TEST_ACCOUNT.email,
        dataPolicy: "union-preserving-upsert",
        fixtureSets: ["agent-pressure", "account-network"],
        preservedExistingData: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Primary test account seeding failed.",
  );
  process.exitCode = 1;
});
