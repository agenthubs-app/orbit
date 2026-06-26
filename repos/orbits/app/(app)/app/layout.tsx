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

const appShellAccountSummary: AppShellAccountSummary = {
  displayName: "Orbit Demo Workspace",
  initials: "OD",
  primaryContext: "Event-grounded relationship workspace",
  provenance:
    "Demo source state comes from existing mock services; no live login is connected.",
  sourcePosture: "Sources staged for review before outreach",
};

const appShellTopActions: AppShellTopAction[] = [
  {
    id: "add-source",
    href: "/app/contacts/new",
    label: "Add a relationship source",
    provenance: "Opens contact intake without live sync.",
    tone: "primary",
  },
  {
    id: "review-next-moves",
    href: "/app/agent",
    label: "Review next moves",
    provenance: "Opens the local action queue.",
    tone: "secondary",
  },
];

const appShellRuntimeStatus: AppShellRuntimeStatus = {
  label: "Demo workspace status",
  compactBoundary: "Privacy boundary: staged review only; no live sync or outbound action.",
  details: [
    "Mock services stay behind existing capability contracts.",
    "No live login, sync, or outbound action is connected.",
  ],
};

const appShellBottomNavigation: AppShellNavigationItem[] = [
  { href: "/app", label: "Orbit AI", route: "/app" },
  { href: "/app/contacts", label: "人脉", route: "/app/contacts" },
  { href: "/app/events", label: "活动", route: "/app/events" },
  { href: "/app/followups", label: "跟进", route: "/app/followups" },
  { href: "/app/chat", label: "对话", route: "/app/chat" },
  {
    href: "/app/dashboard",
    label: "关系健康",
    route: "/app/dashboard",
  },
  { href: "/app/agent", label: "下一步", route: "/app/agent" },
];

const appShellContactsNewRouteSupportLinks: AppShellRouteSupportLink[] = [
  {
    href: "/app/contacts/new?scenario=empty",
    label: "No source ready",
  },
  {
    href: "/app/contacts/new?scenario=pending",
    label: "Source still reviewing",
  },
  {
    href: "/app/contacts/new?scenario=failure",
    label: "Source unavailable",
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
      variant={activeRoute === "/app" ? "ai-command" : "standard"}
    >
      {children}
    </AppShell>
  );
}
