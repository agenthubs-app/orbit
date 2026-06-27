/* eslint-disable no-unused-vars -- The base ESLint config lacks JSX variable usage tracking. */
"use client";

import "../../globals.css";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  AppShell,
  type AppShellAccountSummary,
  type AppShellNavigationItem,
  type AppShellRouteSupportLink,
  type AppShellRuntimeStatus,
  type AppShellTopAction,
  resolveOrbitAppRoute,
} from "../../../shared/ui/app-shell";
import { bilingualText } from "../../../shared/ui/bilingual";

const appShellAccountSummary: AppShellAccountSummary = {
  displayName: bilingualText("Orbit 演示工作区", "Orbit Demo Workspace"),
  initials: "OD",
  primaryContext: bilingualText(
    "围绕活动展开的关系工作区",
    "Event-grounded relationship workspace",
  ),
  provenance:
    bilingualText(
      "演示来源来自当前预览数据；未连接真实登录。",
      "Demo source state comes from current preview data; no live login is connected.",
    ),
  sourcePosture: bilingualText(
    "对外联系前先复核来源",
    "Sources staged for review before outreach",
  ),
};

const appShellTopActions: AppShellTopAction[] = [
  {
    id: "add-source",
    href: "/app/contacts/new",
    label: bilingualText("添加关系来源", "Add a relationship source"),
    provenance: bilingualText(
      "打开联系人录入，不做实时同步。",
      "Opens contact intake without live sync.",
    ),
    tone: "primary",
  },
  {
    id: "review-next-moves",
    href: "/app/agent",
    label: bilingualText("检查下一步", "Review next moves"),
    provenance: bilingualText(
      "打开本地动作审核队列。",
      "Opens the local action queue.",
    ),
    tone: "secondary",
  },
];

const appShellRuntimeStatus: AppShellRuntimeStatus = {
  label: bilingualText("演示工作区状态", "Demo workspace status"),
  compactBoundary: bilingualText(
    "隐私边界：只做待确认复核；不实时同步，不对外执行。",
    "Privacy boundary: staged review only; no live sync or outbound action.",
  ),
  details: [
    bilingualText(
      "预览服务仍在既有能力契约之后。",
      "Preview services stay behind existing capability contracts.",
    ),
    bilingualText(
      "没有连接真实登录、同步或对外动作。",
      "No live login, sync, or outbound action is connected.",
    ),
  ],
};

const appShellBottomNavigation: AppShellNavigationItem[] = [
  { href: "/app", label: bilingualText("Orbit AI", "Orbit AI"), route: "/app" },
  { href: "/app/profile", label: bilingualText("资料", "Profile"), route: "/app/profile" },
  { href: "/app/contacts", label: bilingualText("人脉", "Contacts"), route: "/app/contacts" },
  { href: "/app/events", label: bilingualText("活动", "Events"), route: "/app/events" },
  { href: "/app/followups", label: bilingualText("跟进", "Follow-ups"), route: "/app/followups" },
  { href: "/app/chat", label: bilingualText("对话", "Chat"), route: "/app/chat" },
  {
    href: "/app/dashboard",
    label: bilingualText("关系健康", "Health"),
    route: "/app/dashboard",
  },
  { href: "/app/agent", label: bilingualText("下一步", "Next"), route: "/app/agent" },
];

const appShellContactsNewRouteSupportLinks: AppShellRouteSupportLink[] = [
  {
    href: "/app/contacts/new?scenario=empty",
    label: bilingualText("暂无可用来源", "No source ready"),
  },
  {
    href: "/app/contacts/new?scenario=pending",
    label: bilingualText("来源仍在复核", "Source still reviewing"),
  },
  {
    href: "/app/contacts/new?scenario=failure",
    label: bilingualText("来源不可用", "Source unavailable"),
  },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const activeRoute = resolveOrbitAppRoute(pathname);
  const routeSupportLinks =
    pathname === "/app/contacts/new" ? appShellContactsNewRouteSupportLinks : [];

  return (
    <AppShell
      accountSummary={appShellAccountSummary}
      activeRoute={activeRoute}
      bottomNavigation={appShellBottomNavigation}
      routeSupportLinks={routeSupportLinks}
      runtimeStatus={appShellRuntimeStatus}
      topActions={appShellTopActions}
      variant="ai-command"
    >
      {children}
    </AppShell>
  );
}
