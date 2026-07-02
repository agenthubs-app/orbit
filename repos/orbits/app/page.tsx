/**
 * 根路径 `/` 的页面入口。
 *
 * 这里只把公开落地页组件挂到 Next.js route 上；页面内容和交互逻辑
 * 由 `OrbitRealLandingPage` 维护。
 */
import { OrbitRealLandingPage } from "./(app)/app/orbit-real-landing-page";

export default function Page() {
  return <OrbitRealLandingPage />;
}
