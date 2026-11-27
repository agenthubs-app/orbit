// NextAuth v5 配置(参考 seiki-world 的结构:配置放项目根,route 只 re-export)。
// 会话用 JWT 策略,不引数据库 adapter——用户记录走 features/auth 的
// live-record-store,和全仓库其余数据同一存储模式。
import { readProfileDisplayName } from "./features/profile/session-display-name";
import NextAuth from "next-auth";
import { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";

import { authClientIp, getAuthRateLimiter } from "./features/auth/auth-rate-limit";
import { enabledOAuthProviders } from "./features/auth/oauth-providers";
import { resolveAuthUserService } from "./features/auth/service-factory";
import { readAuthSessionState, type EmailVerificationFlags } from "./features/auth/session-revocation";
import { SIGNUP_COOKIE, readSignupCookie } from "./features/signup-funnel/context";
import { recordSignupFunnel } from "./features/signup-funnel/record";
import { LEGAL_VERSIONS } from "./shared/compute/legal-version";
import { cacheForRequest } from "./shared/performance/request-cache";

// 限流命中：前端 signIn 结果里 code === "rate_limited"，显示「尝试次数过多」而不是「密码错误」。
class RateLimitedSignin extends CredentialsSignin {
  code = "rate_limited";
}

function authUserService() {
  return resolveAuthUserService(
    process.env.ORBIT_MODULE_MODE ?? process.env.ORBIT_FEATURE_MODE,
  );
}

// The layout, the page and its server components each call auth(); within one server render they
// share a single revocation read. Outside a render (proxy, route handlers) React calls straight
// through, so every request still reads the row itself (D31).
const checkSessionForRequest = cacheForRequest((email: string, userId: string, authenticatedAt: number) =>
  readAuthSessionState({ email, userId, authenticatedAt }));

// The sign-up cookie of this Google callback (visitor, source, web or the App's broker page); outside a request: none.
async function takeSignupContext() {
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return readSignupCookie(store.get(SIGNUP_COOKIE)?.value);
  } catch {
    return null;
  }
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
      async authorize(credentials, request) {
        const authenticatedAt = Date.now();
        const email = typeof credentials?.email === "string" ? credentials.email : "";
        const limiter = await getAuthRateLimiter();
        const gate = await limiter.checkLogin({ ip: authClientIp(request.headers), email });
        if (gate.allowed === false) throw new RateLimitedSignin();
        const result = await authUserService().verifyCredentials({
          email,
          password:
            typeof credentials?.password === "string"
              ? credentials.password
              : "",
        });

        if (result.state !== "success") {
          if (result.error.code !== "AUTH_LIVE_STORE_UNCONFIGURED") await limiter.recordLoginFailure({ email, ip: authClientIp(request.headers) });
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
    async jwt({ token, user, account, profile, trigger, session: update }) {
      if (user) token.authenticatedAt = "authenticatedAt" in user && typeof user.authenticatedAt === "number" ? user.authenticatedAt : Date.now();
      if (!user && token.email && token.sub) {
        const authenticatedAt = typeof token.authenticatedAt === "number"
          ? token.authenticatedAt : (token.iat ?? 0) * 1000;
        const state = await checkSessionForRequest(token.email, token.sub, authenticatedAt);
        if (!state.current) return null;
        token.emailVerification = state.emailVerification;
        // Keep the original authentication time as Auth.js rotates iat on refresh.
        token.authenticatedAt = authenticatedAt;
      }
      // OAuth 首次登录:把 IdP 身份换成我们自己的用户记录,token.sub 用我们的 id。
      if (account?.provider === "google" && profile?.email) {
        // Joining an existing account relies on Google having verified the address.
        if (profile.email_verified === false) return null;
        const signup = await takeSignupContext();
        const client = signup?.client ?? "web";
        const result = await authUserService().getOrCreateOAuthUser({
          email: profile.email,
          displayName:
            typeof profile.name === "string" ? profile.name : undefined,
          provider: "google",
          providerAccountId: account.providerAccountId,
          // The versions linked next to the Google button ("by continuing you agree").
          consent: { termsVersion: LEGAL_VERSIONS.terms, privacyVersion: LEGAL_VERSIONS.privacy, client },
        });

        if (result.state !== "success") return null;
        token.sub = result.data.user.id;
        token.email = result.data.user.email;
        token.name = result.data.user.displayName;
        token.emailVerification = { verified: true, sent: false };
        // Joining may just have voided an unverified password and every session before it; this one starts after.
        token.authenticatedAt = Date.now() + 1;
        const userId = result.data.user.id;
        if (result.data.created) recordSignupFunnel(async (funnel) => {
          await funnel.accountCreated({ userId, visitorId: signup?.visitorId ?? null, client, source: signup?.source ?? "direct" });
          await funnel.step({ userId, name: "email_verified", client });
        });
        // Auth.js supplies validated ID token claims here. The deletion flow
        // accepts only Google-provided auth_time; it never substitutes callback time.
        token.googleAuthTime = typeof profile.auth_time === "number" ? profile.auth_time : null;

        return token;
      }

      // Credentials 登录:authorize 返回的 user 首轮可用,落到 token。
      if (user?.id) {
        token.sub = user.id;
      }

      // 显示名用资料姓名（2026-11-27）：每个令牌只读一次；资料改名后页面 session.update({ profileName }) 刷新。
      // token.name（账号名）不动；读不到就保持账号名，不影响登录。
      if (trigger === "update" && update && typeof (update as { profileName?: unknown }).profileName === "string") {
        token.profileName = ((update as { profileName: string }).profileName).trim() || null;
      } else if (token.sub && token.profileName === undefined) {
        token.profileName = await readProfileDisplayName(token.sub).catch(() => null);
      }

      return token;
    },
    async session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
        session.user.emailVerification = (token.emailVerification as EmailVerificationFlags | null | undefined) ?? null;
        if (typeof token.profileName === "string" && token.profileName) session.user.name = token.profileName;
      }

      return session;
    },
  },
});
