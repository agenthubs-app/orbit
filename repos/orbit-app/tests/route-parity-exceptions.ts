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
  // AG17: the user approved the AG17 visual draft on 2026-11-20 — the pages for connecting an outside assistant are Web
  // only in this version; the App shows the assistant's proposals in the inbox and opens the confirm page in the browser.
  {
    route: "/agent/proposals/[proposalId]",
    reason: "外部助手（Claude）提的修改的确认页（AG17）。这一版只有网页：App 在收件箱里显示这种修改，点开时在浏览器里打开这一页。",
    decidedAt: "2026-11-20",
    decidedBy: "user",
  },
  {
    route: "/settings/agent-connections",
    reason: "设置 › 外部 AI 助手（AG17）。连接外部助手的页面这一版只有网页，App 不做。",
    decidedAt: "2026-11-20",
    decidedBy: "user",
  },
  {
    route: "/settings/agent-connections/authorize",
    reason: "Claude 连接 Orbit 时在浏览器里打开的同意页（AG17）。连接外部助手的页面这一版只有网页，App 不做。",
    decidedAt: "2026-11-20",
    decidedBy: "user",
  },
];
