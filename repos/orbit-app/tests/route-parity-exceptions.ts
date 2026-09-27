// Web pages that intentionally have no native App route.
// Every entry must name who decided it, when, and why. `route-parity.test.ts`
// fails when an entry has no reason, when the web page no longer exists, or
// when the App has since gained the route, so this list cannot go stale.
// Only add an entry after an explicit user decision; never to silence a gap.

export interface RouteParityException {
  route: string;
  reason: string;
  decidedAt: string;
  decidedBy: string;
}

export const webOnlyRouteExceptions: readonly RouteParityException[] = [
  {
    route: "/admin/read-cost",
    reason: "网页管理页（读取量治理），只给管理员在网页上使用，App 不做。",
    decidedAt: "2026-09-27",
    decidedBy: "user",
  },
  {
    route: "/agent/plan",
    reason:
      "不符合事务管家定位；内容以后拆进 App 首页和收件箱，不做原样移植；网页端暂不改。",
    decidedAt: "2026-09-27",
    decidedBy: "user",
  },
  {
    route: "/agent/strategy",
    reason:
      "不符合事务管家定位；内容以后拆进 App 首页和收件箱，不做原样移植；网页端暂不改。",
    decidedAt: "2026-09-27",
    decidedBy: "user",
  },
];
