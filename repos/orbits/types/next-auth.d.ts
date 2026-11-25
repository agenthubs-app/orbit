// NextAuth session 类型增强:session.user.id 是我们 auth_users 记录的 id。
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** 邮箱验证状态，和会话检查同一次读取；null / 没有 = 不知道，不提醒。 */
      emailVerification?: { verified: boolean; sent: boolean } | null;
    } & DefaultSession["user"];
  }
}
