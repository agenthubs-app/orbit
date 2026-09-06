// NextAuth v5 配置(参考 seiki-world 的结构:配置放项目根,route 只 re-export)。
// 会话用 JWT 策略,不引数据库 adapter——用户记录走 features/auth 的
// live-record-store,和全仓库其余数据同一存储模式。
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { enabledOAuthProviders } from "./features/auth/oauth-providers";
import { resolveAuthUserService } from "./features/auth/service-factory";
import { isPasswordSessionCurrent } from "./features/auth/session-revocation";

function authUserService() {
  return resolveAuthUserService(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  // zrok 隧道/代理场景需要信任转发的 Host,与 dev 的 allowedDevOrigins 配套。
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/app/account/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const authenticatedAt = Date.now();
        const result = await authUserService().verifyCredentials({
          email: typeof credentials?.email === "string" ? credentials.email : "",
          password:
            typeof credentials?.password === "string"
              ? credentials.password
              : "",
        });

        if (result.state !== "success") {
          // authorize 返回 null 即 401;具体原因不外泄,防账号枚举。
          return null;
        }

        return {
          id: result.data.user.id,
          email: result.data.user.email,
          name: result.data.user.displayName,
          authenticatedAt,
        };
      },
    }),
    // Google 仅在 AUTH_GOOGLE_ID + AUTH_GOOGLE_SECRET 都配置时启用。
    // allowDangerousEmailAccountLinking 的语义由 getOrCreateOAuthUser 实现
    // (IdP 已验证邮箱所有权,同邮箱并入既有账号)。
    ...enabledOAuthProviders().map((providerId) => {
      switch (providerId) {
        case "google":
          return Google({ allowDangerousEmailAccountLinking: true });
      }
    }),
  ],
  callbacks: {
    async jwt({ token, user, account, profile }) {
      if (user) token.authenticatedAt = "authenticatedAt" in user && typeof user.authenticatedAt === "number" ? user.authenticatedAt : Date.now();
      if (!user && token.email && token.sub) {
        const authenticatedAt = typeof token.authenticatedAt === "number"
          ? token.authenticatedAt : (token.iat ?? 0) * 1000;
        if (!await isPasswordSessionCurrent({ email: token.email, userId: token.sub, authenticatedAt })) return null;
        // Keep the original authentication time as Auth.js rotates iat on refresh.
        token.authenticatedAt = authenticatedAt;
      }
      // OAuth 首次登录:把 IdP 身份换成我们自己的用户记录,token.sub 用我们的 id。
      if (account?.provider === "google" && profile?.email) {
        const result = await authUserService().getOrCreateOAuthUser({
          email: profile.email,
          displayName:
            typeof profile.name === "string" ? profile.name : undefined,
          provider: "google",
          providerAccountId: account.providerAccountId,
        });

        if (result.state === "success") {
          token.sub = result.data.user.id;
          token.email = result.data.user.email;
          token.name = result.data.user.displayName;
        }

        return token;
      }

      // Credentials 登录:authorize 返回的 user 首轮可用,落到 token。
      if (user?.id) {
        token.sub = user.id;
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }

      return session;
    },
  },
});
