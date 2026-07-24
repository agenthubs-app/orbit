// NextAuth session 类型增强:session.user.id 是我们 auth_users 记录的 id。
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
