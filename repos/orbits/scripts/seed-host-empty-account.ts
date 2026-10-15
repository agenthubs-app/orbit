/**
 * R17（host/DESIGN.md §4「种子空账号」）：建 / 重置主催空账号 `qa-host-empty@orbit.test`（只写本机开发库）。
 *
 *   node --import tsx scripts/seed-host-empty-account.ts
 *
 * - 账号没有任何活动、主办方资料、共同运营角色：運営センター P01（b6 #0）/ App P04（b6 #21）用它验收空态。
 * - 密码与主 QA 账号同一个环境变量（ORBIT_PRIMARY_TEST_ACCOUNT_PASSWORD），脚本不打印密码、连接串、cookie。
 * - 只连本机库（localhost / 127.0.0.1），否则退出。
 */
import { hash } from "bcryptjs";

import { AUTH_PASSWORD_MIN_LENGTH } from "../features/auth/contract";
import { createStorageAuthAccountProvisioningProvider } from "../features/auth/storage/auth-account-provisioning-provider";
import { createStorageAuthUserProvider, toAuthUserDTO } from "../features/auth/storage/auth-user-live-record-provider";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { runOrbitRecordsMigration } from "../shared/storage/migrations";
import { createPgLiveRecordSqlClient, createPostgresLiveRecordStore } from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";
import { PRIMARY_TEST_ACCOUNT } from "./lib/primary-test-account";

export const HOST_EMPTY_ACCOUNT = { displayName: "Orbit QA 主催（空）", email: "qa-host-empty@orbit.test", fallbackActorId: "user_orbit_qa_host_empty" } as const;

async function main(): Promise<void> {
  loadLocalEnv();
  const password = process.env[PRIMARY_TEST_ACCOUNT.passwordEnv] ?? "";
  if (password.length < AUTH_PASSWORD_MIN_LENGTH) throw new Error(`${PRIMARY_TEST_ACCOUNT.passwordEnv} must be set (min ${AUTH_PASSWORD_MIN_LENGTH} characters).`);
  const database = resolveLiveDatabaseConnectionConfig();
  if (!database) throw new Error("Configure the local database URL before seeding.");
  const host = new URL(database.connectionString).hostname;
  if (!["localhost", "127.0.0.1"].includes(host)) throw new Error("Refusing to seed a non-local database.");
  const client = createPgLiveRecordSqlClient({ connectionString: database.connectionString });
  const store = createPostgresLiveRecordStore<Record<string, unknown>>({ client });
  try {
    await runOrbitRecordsMigration(client);
    const provider = createStorageAuthUserProvider({ store, workspaceId: database.workspaceId });
    const existing = await provider.getUserByEmail(HOST_EMPTY_ACCOUNT.email);
    const now = new Date().toISOString();
    const user = {
      createdAt: existing?.createdAt ?? now,
      displayName: HOST_EMPTY_ACCOUNT.displayName,
      email: HOST_EMPTY_ACCOUNT.email,
      id: existing?.id ?? HOST_EMPTY_ACCOUNT.fallbackActorId,
      passwordHash: await hash(password, 12),
      provider: "credentials" as const,
      providerAccountId: null,
      updatedAt: now,
    };
    await provider.saveUser(user);
    await createStorageAuthAccountProvisioningProvider({ store, workspaceId: database.workspaceId }).ensureAccountForUser(toAuthUserDTO(user));
    console.log(JSON.stringify({ account: HOST_EMPTY_ACCOUNT.email, actorId: user.id, events: 0, organizerProfiles: 0 }, null, 2));
  } finally {
    await client.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Host empty account seeding failed.");
  process.exitCode = 1;
});
