/**
 * 受控的单账号运维（只在部署构建里跑；没有任何可从公网触发的接口）。
 *
 *   ORBIT_ACCOUNT_OPS=build-only npx tsx scripts/account-ops.ts <命令> [参数]
 *
 * 命令（不带 --apply 一律只读预演）：
 *   purge-preview --email <邮箱> [--user-id <账号id>]           按邮箱解析账号，列出将清除的类别与数量
 *   purge --email <邮箱> --user-id <账号id> [--apply]          彻底删除这一个账号（主办方/共同运营者会被拒）
 *   email-preview --name <姓名片段> --new-email <新邮箱>         找候选账号、确认新邮箱没被占用
 *   change-email --user-id <账号id> --from <旧邮箱> --to <新邮箱> [--also-profile-contact] [--apply]
 *                                                              换登录邮箱；加 --also-profile-contact 时资料里的联系邮箱一起换
 *   verify-login --email <邮箱>                                只读：这个邮箱现在能不能登录/找回密码
 *   event-pending --event <活动id>                             只读：该活动待审核人数
 *   deletions-in-progress                                      只读：注销申请按状态计数（pending/purging = 删除中）
 *
 * 输出只有 id、类别和数量，邮箱一律打码。构建里用完就 `exit 1`，不产生新版本。
 */
import { loadLocalEnv } from "./load-local-env";
import { normalizeAuthEmail } from "../features/auth/contract";
import { authUserRecordId } from "../features/auth/storage/auth-user-live-record-provider";
import { previewControlledAccountPurge, runControlledAccountPurge } from "../features/account/controlled-ops/account-purge";
import { previewControlledEmailChange, runControlledEmailChange } from "../features/account/controlled-ops/email-change";
import { maskEmail } from "../features/account/controlled-ops/target";
import { assertControlledAccountOpsProcess } from "../features/account/data-rights/purge/local-gate";
import { resolveLiveDatabaseConnectionConfig } from "../shared/storage/live-database-config";
import { createTransactionalPostgresClient } from "../shared/storage/transactional-postgres";
import { createEventOperationsPostgresClient } from "../features/events/event-operations/storage/postgres-client";

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : undefined;
}
const required = (name: string) => arg(name) ?? (() => { throw new Error(`--${name} required`); })();
const print = (label: string, value: unknown) => console.info(`[account-ops] ${label} ${JSON.stringify(value, null, 2)}`);

async function main() {
  assertControlledAccountOpsProcess();
  loadLocalEnv();
  const config = resolveLiveDatabaseConnectionConfig();
  if (!config) throw new Error("DATABASE_UNCONFIGURED");
  const db = createTransactionalPostgresClient({ connectionString: config.connectionString, max: 2 });
  const eventClient = createEventOperationsPostgresClient({ connectionString: config.connectionString, max: 2 });
  const { workspaceId } = config;
  const apply = process.argv.includes("--apply");
  const command = process.argv[2];
  try {
    const database = await db.query<{ db: string }>("select current_database() as db");
    print("database", { name: database.rows[0]?.db, workspace: workspaceId, command, apply });
    switch (command) {
      case "purge-preview":
        print("purge-preview", await previewControlledAccountPurge({ db, workspaceId, email: required("email"), userId: arg("user-id") }));
        break;
      case "purge":
        print("purge", await runControlledAccountPurge({ db, eventClient, workspaceId, email: required("email"), userId: required("user-id"), apply }));
        break;
      case "email-preview":
        print("email-preview", await previewControlledEmailChange({ db, workspaceId, name: required("name"), newEmail: required("new-email") }));
        break;
      case "change-email":
        print("change-email", await runControlledEmailChange({ db, workspaceId, userId: required("user-id"), fromEmail: required("from"), toEmail: required("to"), alsoProfileContactEmail: process.argv.includes("--also-profile-contact"), apply }));
        break;
      case "verify-login": {
        const email = normalizeAuthEmail(required("email"));
        const row = await db.query<{ id: string; lifecycle_state: string; has_password: boolean; revoked: boolean; deletion: boolean; reset: string | null }>(
          `select payload->>'id' as id, lifecycle_state, coalesce(payload->>'passwordHash','')<>'' as has_password,
            coalesce(payload->>'passwordRevokedAt','')<>'' as revoked, coalesce(payload->>'deletionRequestedAt','')<>'' as deletion,
            payload->'passwordReset'->>'delivery' as reset
          from orbit_records where workspace_id=$1 and collection_name='auth_users' and record_id=$2`, [workspaceId, authUserRecordId(email)]);
        const user = row.rows[0];
        print("verify-login", { email: maskEmail(email), exists: Boolean(user), userId: user?.id ?? null, active: user?.lifecycle_state === "active",
          // Same conditions as password sign-in and the reset request (features/auth/password-reset-store.ts request()).
          canSignIn: Boolean(user && user.lifecycle_state === "active" && user.has_password && !user.deletion),
          resetAccepted: Boolean(user && user.lifecycle_state === "active" && (user.has_password || user.revoked)),
          pendingResetDelivery: user?.reset ?? null });
        break;
      }
      case "deletions-in-progress": {
        const rows = await db.query<{ status: string; n: number }>(`select payload->>'status' as status,count(*)::int as n from orbit_records
          where workspace_id=$1 and collection_name='account_deletion_requests' group by 1 order by 1`, [workspaceId]);
        print("deletions-in-progress", { byStatus: Object.fromEntries(rows.rows.map((r) => [r.status, r.n])) });
        break;
      }
      case "event-pending": {
        const event = required("event");
        const rows = await db.query<{ status: string; n: number }>(`select status,count(*)::int as n from event_ops_admission_application_heads
          where workspace_id=$1 and event_id=$2 group by status order by status`, [workspaceId, event]);
        print("event-pending", { event, byStatus: Object.fromEntries(rows.rows.map((r) => [r.status, r.n])) });
        break;
      }
      default:
        throw new Error("unknown command");
    }
  } finally {
    await db.close();
    await eventClient.close();
  }
}

main().catch((error) => {
  console.error(`[account-ops] failed: ${error instanceof Error ? error.message : "UNKNOWN"}`);
  process.exitCode = 1;
});
