/**
 * W0016：给一个 verify-* 测试账号签发 Auth.js 会话 cookie，只输出到 stdout，不落盘。
 *
 *   node --import tsx scripts/verify-session-cookie.ts verify-plan
 *   node --import tsx scripts/verify-session-cookie.ts verify-plan --header   # 输出 `Cookie:` 头的值
 *
 * 与 `tests/pages/web-tasks.browser.mjs` 同一签法（`next-auth/jwt` 的 `encode`，salt =
 * `authjs.session-token`）；secret 取环境变量或 `.env.local` 的 AUTH_SECRET（与 3000 / 3001 两个
 * dev server 相同）。只接受 verify-* 账号：先到本机库确认账号存在，再签。RULES 5.4：不在登录表单输密码。
 */
import { encode } from "next-auth/jwt";

import { createStorageAuthUserProvider } from "../features/auth/storage/auth-user-live-record-provider";
import {
  createPgLiveRecordSqlClient,
  createPostgresLiveRecordStore,
} from "../shared/storage/postgres-live-record-store";
import { loadLocalEnv } from "./load-local-env";
import { assertVerifyDatabaseTarget } from "./lib/verify-database-target";

export const VERIFY_SESSION_COOKIE_NAME = "authjs.session-token";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const ACCOUNT_NAME = /^verify-(new|legacy|plan|expired|event|network)$/u;

async function main(): Promise<void> {
  loadLocalEnv();
  const [account, ...flags] = process.argv.slice(2);
  if (!account || !ACCOUNT_NAME.test(account)) {
    throw new Error("用法：verify-session-cookie.ts <verify-new|verify-legacy|verify-plan|verify-expired|verify-event|verify-network> [--header]");
  }
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("没有 AUTH_SECRET（.env.local）。");

  const target = assertVerifyDatabaseTarget();
  const client = createPgLiveRecordSqlClient({ connectionString: target.connectionString, max: 1 });
  let user;
  try {
    const provider = createStorageAuthUserProvider({
      store: createPostgresLiveRecordStore<Record<string, unknown>>({ client }),
      workspaceId: target.workspaceId,
    });
    user = await provider.getUserByEmail(`${account}@orbit.test`);
  } finally {
    await client.close();
  }
  if (!user || !user.id.startsWith("user_verify_")) {
    throw new Error(`${account}@orbit.test 不存在，先执行 seed-verify-accounts.ts。`);
  }

  const cookie = await encode({
    maxAge: SESSION_MAX_AGE_SECONDS,
    salt: VERIFY_SESSION_COOKIE_NAME,
    secret,
    token: {
      authenticatedAt: Date.now(),
      email: user.email,
      name: user.displayName,
      sub: user.id,
    },
  });
  process.stdout.write(
    flags.includes("--header") ? `${VERIFY_SESSION_COOKIE_NAME}=${cookie}\n` : `${cookie}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "签发会话 cookie 失败。");
  process.exitCode = 1;
});
