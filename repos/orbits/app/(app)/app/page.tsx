import { redirect } from "next/navigation";

import { LandingPage } from "./orbit-2026/auth-public/LandingPage";
import { auth } from "../../../auth";
import { enabledOAuthProviders } from "../../../features/auth/oauth-providers";

// Orbit_0918 新 UI 落地页（批次 0）：匿名访客看到营销落地页；已登录会员的
// 首页仍是 /app/home 个人控制台。旧 starfield 组件保留但不再由路由渲染。
export default async function AppHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/app/home");
  }

  return (
    <>
      <LandingPage googleEnabled={enabledOAuthProviders().includes("google")} />
    </>
  );
}
