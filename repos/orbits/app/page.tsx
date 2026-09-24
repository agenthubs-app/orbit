import { cookies, headers } from "next/headers";
import { SessionProvider } from "next-auth/react";

import { OrbitLanding0918 } from "./(app)/app/orbit-landing-0918";
import { OrbitLanguageProvider } from "./(app)/app/orbit-language-context";
import { normalizeOrbitLanguage } from "./(app)/app/orbit-language-core";
import { OrbitReferenceStyles } from "./(app)/app/orbit-reference-styles";
import { auth } from "../auth";

// Orbit_0918 新 UI 落地页（批次 0）：`/` 与 `/app` 渲染同一营销落地页。
// 旧 starfield 首页组件保留在仓库中（其隔离测试仍有效），但不再由路由渲染。
export default async function Page() {
  const [session, requestHeaders, cookieStore] = await Promise.all([
    auth(),
    headers(),
    cookies(),
  ]);
  const language = normalizeOrbitLanguage(
    requestHeaders.get("x-orbit-lang") ?? cookieStore.get("orbit-lang")?.value,
  );

  return (
    <>
      <OrbitReferenceStyles />
      <SessionProvider refetchOnWindowFocus={false} session={session}>
        <OrbitLanguageProvider initialLanguage={language}>
          <OrbitLanding0918 authenticated={Boolean(session?.user?.id)} />
        </OrbitLanguageProvider>
      </SessionProvider>
    </>
  );
}
