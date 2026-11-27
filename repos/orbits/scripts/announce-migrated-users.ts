/**
 * Notice to the accounts migrated from party-app (features/account/announcements/migrated-user-notice.ts).
 * Build-time only, like scripts/account-ops.ts: run from a non-promoted production build that ends in `exit 1`.
 *
 *   ORBIT_ACCOUNT_OPS=build-only ORBIT_MIGRATION_NOTICE_MODE=dry   npx tsx scripts/announce-migrated-users.ts
 *   ORBIT_ACCOUNT_OPS=build-only ORBIT_MIGRATION_NOTICE_MODE=test  ORBIT_MIGRATION_NOTICE_TEST_TO=<address> npx tsx …
 *   ORBIT_ACCOUNT_OPS=build-only ORBIT_MIGRATION_NOTICE_MODE=apply ORBIT_MIGRATION_NOTICE_EXPECTED_COUNT=<dry count> npx tsx …
 *
 * ORBIT_MIGRATION_NOTICE_INTERVAL_MS: gap between two sends (default 8000; Gmail SMTP throttles bursts).
 * Without ORBIT_MIGRATION_NOTICE_MODE it does nothing. test/apply refuse unless NODE_ENV and VERCEL_ENV are both
 * `production` (otherwise the mailer would redirect). Output: counts, domains and masked samples only.
 */
import { loadLocalEnv } from "./load-local-env";
import { assertControlledAccountOpsProcess } from "../features/account/data-rights/purge/local-gate";
import { createRecordStoreNoticeLedger, loadMigratedAccounts, noticeMode, runMigratedUserNotice } from "../features/account/announcements/migrated-user-notice";
import { createTransactionalMailer } from "../features/mail/transactional";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createPgLiveRecordSqlClient, createPostgresLiveRecordStore } from "../shared/storage/postgres-live-record-store";

const print = (label: string, value: unknown) => console.info(`[migration-notice] ${label} ${JSON.stringify(value)}`);

async function main() {
  const mode = noticeMode(process.env);
  if (mode === "off") { print("disabled", { hint: "ORBIT_MIGRATION_NOTICE_MODE unset" }); return; }
  assertControlledAccountOpsProcess();
  loadLocalEnv();
  const mailer = createTransactionalMailer();
  if (mode === "test") { await runMigratedUserNotice({ env: process.env, mailer, log: print }); return; }
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const client = createPgLiveRecordSqlClient({ connectionString: config.connectionString, max: 2 });
  try {
    const database = await client.query<{ db: string }>("select current_database() as db");
    print("database", { name: database.rows[0]?.db, workspace: config.workspaceId });
    await runMigratedUserNotice({
      env: process.env, mailer, log: print,
      loadRows: () => loadMigratedAccounts(client, config.workspaceId),
      ledger: createRecordStoreNoticeLedger(createPostgresLiveRecordStore({ client }), config.workspaceId),
    });
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(`[migration-notice] failed: ${error instanceof Error ? error.message : "UNKNOWN"}`);
  process.exitCode = 1;
});
