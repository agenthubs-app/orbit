import { redirect } from "next/navigation";

import { OrbitLanding0918 } from "./orbit-landing-0918";
import { OrbitReferenceStyles } from "./orbit-reference-styles";
import { auth } from "../../../auth";

// Orbit_0918 新 UI 落地页（批次 0）：匿名访客看到营销落地页；已登录会员的
// 首页仍是 /app/home 个人控制台。旧 starfield 组件保留但不再由路由渲染。
export default async function AppHomePage() {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/app/home");
  }

  return (
    <>
      <OrbitReferenceStyles />
      <OrbitLanding0918 authenticated={false} />
    </>
  );
}
