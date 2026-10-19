import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";

import { LandingPage } from "./(app)/app/orbit-2026/auth-public/LandingPage";
import { OrbitLanguageProvider } from "./(app)/app/orbit-language-context";
import { resolveRequestOrbitLanguage } from "./(app)/app/orbit-language-core";
import { enabledOAuthProviders } from "../features/auth/oauth-providers";
import { auth } from "../auth";

// 匿名访客在 `/` 与 `/app` 看到同一落地页；已登录用户进入个人首页。
// 旧 starfield 首页组件保留在仓库中（其隔离测试仍有效），但不再由路由渲染。
export default async function Page() {
  const [session, requestHeaders, cookieStore] = await Promise.all([
    auth(),
    headers(),
    cookies(),
  ]);
  if (session?.user?.id) {
    redirect("/app/home");
  }
  const language = resolveRequestOrbitLanguage({
    header: requestHeaders.get("x-orbit-lang"),
    cookie: cookieStore.get("orbit-lang")?.value,
    acceptLanguage: requestHeaders.get("accept-language"),
  });

  return (
    <>
      <SessionProvider refetchOnWindowFocus={false} session={session}>
        <OrbitLanguageProvider initialLanguage={language}>
          <LandingPage googleEnabled={enabledOAuthProviders().includes("google")} />
        </OrbitLanguageProvider>
      </SessionProvider>
    </>
  );
}
