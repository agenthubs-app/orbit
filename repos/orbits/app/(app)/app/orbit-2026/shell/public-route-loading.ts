// 2026-11-24 无外壳页面的加载态（app/(app)/app/loading.tsx 经 RouteSkeleton）：先出最终布局，不先闪灰杠或应用外壳。
// Pure (no React) so the rules are tested on their own.
//   landing      — 最终画面 = 落地页（登录 / 注册 / 忘记密码 / 重置 / 改密 的弹窗随后出现在它上面；未登录的 /app 本身）。
//   publicEvents — 未登录的イベント一覧：公开顶栏 + 标题 + 登录评估卡（列表由页面自己读完再出现）。
//   publicEvent  — 未登录的活动详情、参加コード着地页：公开顶栏 + 页头（详情由页面自己读完再出现）。
//   blank        — 其余没有外壳、也没有可直接画的静态布局的页（审核中 / 已删除 / App 的 Google 登录 / 管理员入口 /
//                  旧主办方地址 / 未知地址）：什么都不画，好过先画一个和最终无关的骨架。
//   null         — 走原来的骨架（已登录的页面）。
// 未登录访问私有页由 proxy.ts 直接送去登录页，不经过这里。
export type PublicRouteLoading = "landing" | "publicEvents" | "publicEvent" | "blank";

const LANDING_ALWAYS = new Set(["/app/account/reset-password", "/app/account/change-password"]);
const LANDING_SIGNED_OUT = new Set(["/app", "/app/account/login", "/app/account/signup", "/app/account/forgot-password"]);

export function publicRouteLoadingFor(pathname: string, signedIn: boolean): PublicRouteLoading | null {
  const path = pathname.replace(/\/+$/u, "") || "/";
  if (LANDING_ALWAYS.has(path)) return "landing";
  // 已登录打开登录 / 注册页会被带回 next（默认首页）：不画落地页，以免先闪一下落地页。
  if (path.startsWith("/app/account/")) return signedIn ? "blank" : LANDING_SIGNED_OUT.has(path) ? "landing" : "blank";
  if (path === "/app/login-admin" || path === "/app/admin/access" || path === "/app/o" || path.startsWith("/app/o/")) return "blank";
  if (signedIn) return null;
  if (LANDING_SIGNED_OUT.has(path)) return "landing";
  if (path === "/app/events") return "publicEvents";
  if (/^\/app\/events\/[^/]+$/u.test(path) && path !== "/app/events/center" && path !== "/app/events/assessments") return "publicEvent";
  if (/^\/app\/register\/[^/]+$/u.test(path)) return "publicEvent";
  return "blank";
}
