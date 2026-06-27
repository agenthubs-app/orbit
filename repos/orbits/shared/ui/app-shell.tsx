import type { ReactNode } from "react";
import { bilingualText } from "./bilingual";
import { WorkbenchFrame } from "./primitives";

export type OrbitAppRoute =
  | "/app"
  | "/app/profile"
  | "/app/events"
  | "/app/contacts"
  | "/app/followups"
  | "/app/chat"
  | "/app/dashboard"
  | "/app/agent";

export interface AppShellAccountSummary {
  displayName: string;
  initials: string;
  primaryContext: string;
  provenance: string;
  sourcePosture: string;
}

export interface AppShellTopAction {
  id: string;
  href: string;
  label: string;
  provenance: string;
  tone?: "primary" | "secondary";
}

export interface AppShellRuntimeStatus {
  label: string;
  details: string[];
  compactBoundary?: string;
}

export interface AppShellNavigationItem {
  href: string;
  label: string;
  route: OrbitAppRoute;
}

export interface AppShellRouteSupportLink {
  href: string;
  label: string;
}

export interface AppShellProps {
  accountSummary: AppShellAccountSummary;
  activeRoute: OrbitAppRoute;
  topActions: AppShellTopAction[];
  runtimeStatus: AppShellRuntimeStatus;
  bottomNavigation: AppShellNavigationItem[];
  routeSupportLinks?: AppShellRouteSupportLink[];
  variant?: "standard" | "ai-command";
  children: ReactNode;
}

const orbitAppRoutes: OrbitAppRoute[] = [
  "/app",
  "/app/profile",
  "/app/events",
  "/app/contacts",
  "/app/followups",
  "/app/chat",
  "/app/dashboard",
  "/app/agent",
];

const routeSet = new Set<string>(orbitAppRoutes);
const nestedRoutePrefixes: OrbitAppRoute[] = [
  "/app/profile",
  "/app/events",
  "/app/contacts",
  "/app/followups",
  "/app/chat",
  "/app/dashboard",
  "/app/agent",
];

interface OrbitProductNavigationItem {
  id: string;
  href: string;
  label: string;
  englishLabel: string;
  route?: OrbitAppRoute;
}

const orbitProductNavigationItems: OrbitProductNavigationItem[] = [
  {
    id: "home",
    href: "/app",
    label: "Orbit AI",
    englishLabel: "AI home",
    route: "/app",
  },
  {
    id: "profile",
    href: "/app/profile",
    label: "资料",
    englishLabel: "Profile",
    route: "/app/profile",
  },
  {
    id: "people",
    href: "/app/contacts",
    label: "人脉",
    englishLabel: "People",
    route: "/app/contacts",
  },
  {
    id: "events",
    href: "/app/events",
    label: "活动",
    englishLabel: "Events",
    route: "/app/events",
  },
  {
    id: "schedule",
    href: "/app?panel=schedule",
    label: "日程",
    englishLabel: "Schedule",
  },
  {
    id: "followups",
    href: "/app/followups",
    label: "跟进",
    englishLabel: "Follow-ups",
    route: "/app/followups",
  },
  {
    id: "chat",
    href: "/app/chat",
    label: "对话",
    englishLabel: "Chat",
    route: "/app/chat",
  },
  {
    id: "dashboard",
    href: "/app/dashboard",
    label: "健康",
    englishLabel: "Health",
    route: "/app/dashboard",
  },
  {
    id: "agent",
    href: "/app/agent",
    label: "下一步",
    englishLabel: "Next",
    route: "/app/agent",
  },
];

function classNames(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(" ");
}

function formatWorkspaceIdentity(accountSummary: AppShellAccountSummary): string {
  return `${accountSummary.displayName} (${accountSummary.initials}) | ${accountSummary.primaryContext} | ${accountSummary.sourcePosture}`;
}

function normalizeRouteSupportLinks(
  routeSupportLinks: AppShellRouteSupportLink[],
): AppShellRouteSupportLink[] {
  return routeSupportLinks.filter((link) => link.label.trim());
}

export function resolveOrbitAppRoute(pathname: string | null): OrbitAppRoute {
  if (!pathname) {
    return "/app";
  }

  if (routeSet.has(pathname)) {
    return pathname as OrbitAppRoute;
  }

  const nestedRoute = nestedRoutePrefixes.find((route) =>
    pathname.startsWith(`${route}/`),
  );

  return nestedRoute ?? "/app";
}

function OrbitProductNavIcon({ id }: { id: string }) {
  const commonProps = {
    "aria-hidden": true,
    className: "orbit-product-nav-icon",
    fill: "none",
    viewBox: "0 0 24 24",
  };

  if (id === "home") {
    return (
      <svg {...commonProps}>
        <path d="M4 11.5 12 5l8 6.5V20H5v-8.5Z" />
        <path d="M9 20v-5h6v5" />
      </svg>
    );
  }

  if (id === "profile") {
    return (
      <svg {...commonProps}>
        <circle cx="12" cy="8" r="3.2" />
        <path d="M5 20a7 7 0 0 1 14 0" />
      </svg>
    );
  }

  if (id === "people") {
    return (
      <svg {...commonProps}>
        <circle cx="8" cy="8.5" r="2.7" />
        <circle cx="16" cy="8.5" r="2.7" />
        <path d="M3.5 19a5 5 0 0 1 9 0" />
        <path d="M11.5 19a5 5 0 0 1 9 0" />
      </svg>
    );
  }

  if (id === "events" || id === "schedule") {
    return (
      <svg {...commonProps}>
        <rect height="15" rx="2" width="16" x="4" y="5" />
        <path d="M8 3v4M16 3v4M4 10h16" />
        {id === "schedule" && <path d="M8 15h3M14 15h2" />}
      </svg>
    );
  }

  if (id === "followups" || id === "chat") {
    return (
      <svg {...commonProps}>
        <path d="M4 6.5h16v10H9l-5 4v-14Z" />
        <path d="M8 10h8M8 13.5h5" />
      </svg>
    );
  }

  if (id === "dashboard") {
    return (
      <svg {...commonProps}>
        <path d="M5 19V9M12 19V5M19 19v-7" />
        <path d="M4 19h16" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M9 11.5 12 14l5-6" />
      <path d="M4 12v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
      <path d="M7 5h10" />
    </svg>
  );
}

const appShellStyles = `
.orbit-app-shell .workbench-shell,
.orbit-app-shell .workbench-header,
.orbit-account-summary,
.orbit-account-copy,
.orbit-secondary-actions,
.orbit-route-support-panel,
.orbit-route-support-actions,
.orbit-bottom-navigation,
.orbit-product-rail,
.orbit-product-nav,
.orbit-product-nav-link,
.orbit-product-nav-copy,
.orbit-product-rail-foot,
.orbit-product-stage {
  min-width: 0;
}

.orbit-app-shell .workbench-header {
  align-content: start;
}

.orbit-app-shell .workbench-intro {
  max-width: 690px;
}

.orbit-app-shell-ai-command {
  background: #16181d;
  color: #f3f4f6;
  min-height: 100vh;
  padding: 12px;
}

.orbit-app-shell-product {
  --orbit-canvas: #f3f4f6;
  --orbit-surface: #ffffff;
  --orbit-surface-raised: #fafafb;
  --orbit-text: #2c2e34;
  --orbit-muted-text: #6b6f78;
  --orbit-border: #ecedf0;
  --orbit-border-strong: #d7d9de;
  --orbit-primary-action: #16181d;
  --orbit-primary-action-hover: #0e8b6b;
  --orbit-primary-action-text: #ffffff;
  --orbit-evidence: #0e8b6b;
  --orbit-confirmation: #4fa47e;
  --orbit-privacy: #5b6470;
  --orbit-warning: #c0863a;
  --orbit-success: #0e8b6b;
  --orbit-accent-soft: #e7f5ef;
  --orbit-color-canvas: #f3f4f6;
  --orbit-color-surface: #ffffff;
  --orbit-color-surface-raised: #fafafb;
  --orbit-color-border: #ecedf0;
  --orbit-color-border-strong: #d7d9de;
  --orbit-color-text: #2c2e34;
  --orbit-color-muted: #6b6f78;
  --orbit-color-subtle: #82868f;
  --orbit-color-primary: #16181d;
  --orbit-color-primary-strong: #0e8b6b;
  --orbit-color-primary-text: #ffffff;
  --orbit-color-focus: #0e8b6b;
  --orbit-color-accent-soft: #e7f5ef;
  --orbit-color-evidence: #0e8b6b;
  --orbit-color-confirmation: #4fa47e;
  --orbit-color-privacy: #5b6470;
  --orbit-color-warning: #c0863a;
  --orbit-color-success: #0e8b6b;
}

.orbit-app-shell-ai-command .workbench-shell {
  gap: 0;
  max-width: 1380px;
}

.orbit-app-shell-product .workbench-shell {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  min-height: calc(100vh - 24px);
}

.orbit-app-shell-ai-command > .workbench-shell > section[aria-label="Active Orbit route"] {
  display: grid;
  min-width: 0;
}

.orbit-app-shell-product > .workbench-shell > section[aria-label="Active Orbit route"] {
  background: #f3f4f6;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-left: 0;
  border-radius: 0 14px 14px 0;
  color: #2c2e34;
  min-height: calc(100vh - 24px);
  overflow: auto;
  padding: 20px;
}

.orbit-app-shell-product .workbench-surface {
  background: #ffffff;
  border-color: #e4e5e9;
}

.orbit-app-shell-product .workbench-surface-raised {
  background: #fafafb;
  box-shadow: 0 16px 40px rgba(18, 22, 28, 0.08);
}

.orbit-product-rail {
  align-items: center;
  background: #16181d;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px 0 0 14px;
  color: rgba(255, 255, 255, 0.58);
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: space-between;
  min-height: calc(100vh - 24px);
  padding: 14px 8px;
}

.orbit-product-rail-brand {
  align-items: center;
  background: #6fe3c0;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 12px;
  color: #111318;
  display: inline-flex;
  font-size: 0.82rem;
  font-weight: 850;
  height: 40px;
  justify-content: center;
  letter-spacing: 0;
  line-height: 1;
  width: 40px;
}

.orbit-product-nav {
  align-items: stretch;
  display: grid;
  gap: 6px;
  width: 100%;
}

.orbit-product-nav-link {
  align-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
  color: rgba(255, 255, 255, 0.56);
  display: grid;
  gap: 5px;
  justify-items: center;
  line-height: 1.15;
  padding: 8px 4px;
  text-align: center;
  text-decoration: none;
}

.orbit-product-nav-link:hover,
.orbit-product-nav-link[aria-current="page"] {
  background: rgba(111, 227, 192, 0.12);
  border-color: rgba(111, 227, 192, 0.18);
  color: #6fe3c0;
}

.orbit-product-nav-icon {
  flex: none;
  height: 20px;
  stroke: currentColor;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.8;
  width: 20px;
}

.orbit-product-nav-copy {
  display: grid;
  gap: 1px;
  justify-items: center;
}

.orbit-product-nav-copy span:first-child {
  color: currentColor;
  font-size: 0.74rem;
  font-weight: 760;
  overflow-wrap: anywhere;
}

.orbit-product-nav-en {
  color: rgba(255, 255, 255, 0.36);
  font-size: 0.58rem;
  font-weight: 650;
}

.orbit-product-rail-foot {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: grid;
  gap: 6px;
  padding-top: 10px;
  text-align: center;
  width: 100%;
}

.orbit-product-rail-foot p {
  color: rgba(255, 255, 255, 0.66);
  font-size: 0.66rem;
  font-weight: 720;
  line-height: 1.35;
  margin: 0;
}

.orbit-product-rail-foot span {
  color: rgba(255, 255, 255, 0.38);
  font-size: 0.58rem;
}

.orbit-primary-source-link {
  align-items: center;
  background: var(--orbit-color-primary);
  border: 1px solid var(--orbit-color-primary-strong);
  border-radius: var(--orbit-radius-control);
  color: var(--orbit-color-primary-text);
  display: inline-flex;
  font-size: 0.94rem;
  font-weight: 760;
  justify-content: center;
  line-height: 1.25;
  min-height: 44px;
  padding: 10px 16px;
  text-decoration: none;
  white-space: normal;
  width: fit-content;
}

.orbit-primary-source-link:hover {
  background: var(--orbit-color-primary-strong);
}

.orbit-runtime-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: var(--orbit-space-sm);
  max-width: 760px;
}

.orbit-runtime-boundary {
  background: var(--orbit-color-surface-raised);
  border: 1px solid var(--orbit-color-border);
  border-radius: 999px;
  color: var(--orbit-color-privacy);
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.4;
  margin: 0;
  min-height: 28px;
  padding: 5px 10px;
}

.orbit-runtime-status {
  color: var(--orbit-color-muted);
  font-size: 0.78rem;
  line-height: 1.45;
  max-width: 560px;
  width: fit-content;
}

.orbit-runtime-status summary {
  align-items: center;
  background: var(--orbit-color-surface-raised);
  border: 1px solid var(--orbit-color-border);
  border-radius: 999px;
  color: var(--orbit-color-privacy);
  cursor: pointer;
  display: inline-flex;
  font-weight: 700;
  min-height: 28px;
  padding: 5px 10px;
}

.orbit-runtime-status[open] {
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-card);
  box-shadow: var(--orbit-shadow-card);
  display: grid;
  gap: var(--orbit-space-sm);
  padding: var(--orbit-space-sm);
  width: min(100%, 560px);
}

.orbit-runtime-status[open] summary {
  width: fit-content;
}

.orbit-runtime-status ul {
  display: grid;
  gap: 6px;
  margin: 0;
  padding-inline-start: 18px;
}

.orbit-account-summary {
  align-items: center;
  background: var(--orbit-color-surface);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-card);
  box-shadow: var(--orbit-shadow-card);
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: auto minmax(0, 1fr);
  padding: var(--orbit-space-md);
}

.orbit-account-avatar {
  align-items: center;
  background: rgba(65, 72, 95, 0.08);
  border: 1px solid rgba(65, 72, 95, 0.22);
  border-radius: 999px;
  color: var(--orbit-color-privacy);
  display: inline-flex;
  font-weight: 800;
  height: 44px;
  justify-content: center;
  line-height: 1;
  width: 44px;
}

.orbit-account-copy {
  display: grid;
  gap: 4px;
}

.orbit-account-name {
  color: var(--orbit-color-text);
  font-size: 0.98rem;
  font-weight: 760;
  line-height: 1.25;
  margin: 0;
  overflow-wrap: anywhere;
}

.orbit-account-meta {
  color: var(--orbit-color-muted);
  font-size: 0.86rem;
  line-height: 1.45;
  margin: 0;
  overflow-wrap: anywhere;
}

.orbit-secondary-actions {
  align-items: start;
  display: grid;
  gap: var(--orbit-space-sm);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 164px), max-content));
}

.orbit-secondary-actions .orbit-chip {
  max-width: 100%;
  text-decoration: none;
  white-space: normal;
}

.orbit-deferred-actions {
  border-top: 1px solid var(--orbit-color-border);
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 164px), 1fr));
  padding-top: var(--orbit-space-sm);
}

.orbit-deferred-actions .orbit-chip {
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: center;
  width: 100%;
}

.orbit-route-support-panel {
  background: var(--orbit-color-surface-raised);
  border: 1px solid var(--orbit-color-border);
  border-radius: var(--orbit-radius-card);
  display: grid;
  gap: var(--orbit-space-sm);
  padding: var(--orbit-space-md);
}

.orbit-route-support-panel h2,
.orbit-route-support-panel p {
  margin: 0;
  overflow-wrap: anywhere;
}

.orbit-route-support-panel h2 {
  color: var(--orbit-color-text);
  font-size: 0.95rem;
  line-height: 1.25;
}

.orbit-route-support-panel p {
  color: var(--orbit-color-muted);
  font-size: 0.86rem;
  line-height: 1.45;
}

.orbit-route-support-actions {
  align-items: stretch;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr));
}

.orbit-route-support-actions .orbit-chip {
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: center;
  text-decoration: none;
  white-space: normal;
  width: 100%;
}

.orbit-bottom-navigation {
  align-items: stretch;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 132px), 1fr));
}

.orbit-bottom-navigation .orbit-chip {
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  text-align: center;
  text-decoration: none;
  white-space: normal;
  width: 100%;
}

@media (max-width: 430px) {
  .orbit-account-summary {
    align-items: start;
    grid-template-columns: minmax(0, 1fr);
  }

  .orbit-primary-source-link,
  .orbit-runtime-row,
  .orbit-runtime-boundary,
  .orbit-runtime-status,
  .orbit-runtime-status summary,
  .orbit-route-support-panel {
    width: 100%;
  }
}

@media (max-width: 980px) {
  .orbit-app-shell-product .workbench-shell {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
  }

  .orbit-product-rail {
    align-items: center;
    border-radius: 14px 14px 0 0;
    flex-direction: row;
    min-height: 0;
    overflow-x: auto;
    padding: 8px;
  }

  .orbit-product-nav {
    display: flex;
    gap: 6px;
    width: auto;
  }

  .orbit-product-nav-link {
    min-width: 58px;
  }

  .orbit-product-rail-foot {
    border-left: 1px solid rgba(255, 255, 255, 0.1);
    border-top: 0;
    padding-left: 10px;
    padding-top: 0;
    width: auto;
  }

  .orbit-app-shell-product > .workbench-shell > section[aria-label="Active Orbit route"] {
    border-left: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0 0 14px 14px;
    min-height: 0;
    padding: 14px;
  }
}
`;

export function AppShell({
  accountSummary,
  activeRoute,
  topActions,
  runtimeStatus,
  bottomNavigation,
  routeSupportLinks = [],
  variant = "standard",
  children,
}: AppShellProps) {
  const workspaceIdentity = formatWorkspaceIdentity(accountSummary);
  const primaryAction =
    topActions.find((action) => action.tone === "primary") ?? topActions[0];
  const secondaryActions = topActions.filter((action) => action !== primaryAction);
  const visibleRouteSupportLinks = normalizeRouteSupportLinks(routeSupportLinks);
  const shouldDeferWorkspaceActions = activeRoute === "/app/profile";
  const isAiCommandVariant = variant === "ai-command";
  const headerPrimaryAction = shouldDeferWorkspaceActions ? null : primaryAction;
  const leadingSecondaryActions = shouldDeferWorkspaceActions ? [] : secondaryActions;
  const deferredWorkspaceActions = shouldDeferWorkspaceActions ? topActions : [];
  const isProductShell = isAiCommandVariant && activeRoute !== "/app";

  return (
    <WorkbenchFrame
      className={classNames(
        "orbit-app-shell",
        isAiCommandVariant && "orbit-app-shell-ai-command",
        isProductShell && "orbit-app-shell-product",
      )}
    >
      <style>{appShellStyles}</style>
      <div
        className="workbench-shell"
        data-reference-style={isAiCommandVariant ? "orbit-ui-reference" : undefined}
      >
        {isProductShell && (
          <aside
            aria-label="Orbit workspace identity"
            className="orbit-product-rail"
            data-workspace-identity={workspaceIdentity}
          >
            <a
              aria-label="Orbit AI home"
              className="orbit-product-rail-brand"
              href="/app"
            >
              AI
            </a>
            <nav aria-label="Orbit 产品导航" className="orbit-product-nav">
              {orbitProductNavigationItems.map((item) => {
                const isActive = item.route === activeRoute;

                return (
                  <a
                    className="orbit-product-nav-link"
                    data-orbit-product-nav-item={item.id}
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    key={`orbit-product-nav:${item.id}`}
                    title={`${item.label} / ${item.englishLabel}`}
                  >
                    <OrbitProductNavIcon id={item.id} />
                    <span className="orbit-product-nav-copy">
                      <span>{item.label}</span>
                      <span className="orbit-product-nav-en">{item.englishLabel}</span>
                    </span>
                  </a>
                );
              })}
            </nav>
            <div className="orbit-product-rail-foot">
              <p>
                中文主
                <br />
                <span>English secondary</span>
              </p>
            </div>
          </aside>
        )}

        {!isAiCommandVariant && (
          <header className="workbench-header">
            <p className="workbench-kicker">Orbit</p>
            <h1>{bilingualText("知道现在该关注谁", "Know who needs your attention")}</h1>
            <p className="workbench-intro">
              {bilingualText(
                "从关系来源、对话内容和你能确认的下一步开始。每个页面都保留同一个工作区身份，让有来源的记录先进入复核。",
                "Start from where a relationship came from, what was said, and the next step you can stand behind. Every screen keeps the same workspace identity while source-backed records move through review.",
              )}
            </p>
            {headerPrimaryAction && (
              <a
                className="orbit-primary-source-link"
                data-app-shell-primary-action="true"
                href={headerPrimaryAction.href}
              >
                {headerPrimaryAction.label}
              </a>
            )}
            <div className="orbit-runtime-row" data-runtime-boundary-row="compact">
              {runtimeStatus.compactBoundary && (
                <p className="orbit-runtime-boundary">
                  {runtimeStatus.compactBoundary}
                </p>
              )}
              <details
                aria-label="Workspace status details"
                className="orbit-runtime-status"
                data-runtime-status="compact"
              >
                <summary>{runtimeStatus.label}</summary>
                <ul>
                  <li>{accountSummary.provenance}</li>
                  {runtimeStatus.details.map((detail, detailIndex) => (
                    <li key={`runtime-status:${detailIndex}:${detail}`}>{detail}</li>
                  ))}
                  {topActions.map((action) => (
                    <li key={`runtime-action:${action.id}`}>
                      {action.label}: {action.provenance}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </header>
        )}

        {!isAiCommandVariant && (
          <section
            aria-label="Active demo workspace identity"
            className="orbit-account-summary"
            data-workspace-identity={workspaceIdentity}
          >
            <span
              aria-label="Account initials"
              className="orbit-account-avatar"
              data-account-initials={accountSummary.initials}
            >
              {accountSummary.initials}
            </span>
            <div className="orbit-account-copy">
              <p className="orbit-account-name">{accountSummary.displayName}</p>
              <p className="orbit-account-meta">
                {bilingualText("工作上下文", "Working context")}:{" "}
                {accountSummary.primaryContext}
              </p>
              <p className="orbit-account-meta">
                {bilingualText("来源状态", "Source posture")}:{" "}
                {accountSummary.sourcePosture}
              </p>
              <p
                className="orbit-account-meta"
                data-workspace-record-scope="sample-records"
              >
                {bilingualText(
                  "已复核的关系上下文会留在当前工作区。",
                  "Reviewed relationship context stays grouped inside this workspace.",
                )}{" "}
                {accountSummary.displayName}
              </p>
            </div>
          </section>
        )}

        {!isAiCommandVariant && leadingSecondaryActions.length > 0 && (
          <div aria-label="Secondary workspace actions" className="orbit-secondary-actions">
            {leadingSecondaryActions.map((action) => (
              <a
                className="orbit-chip orbit-chip-neutral"
                href={action.href}
                key={`secondary-action-link:${action.id}`}
              >
                {action.label}
              </a>
            ))}
          </div>
        )}

        <section
          aria-label="Active Orbit route"
          className={isProductShell ? "orbit-product-stage" : undefined}
        >
          {children}
        </section>

        {!isAiCommandVariant && deferredWorkspaceActions.length > 0 && (
          <div
            aria-label="Secondary workspace actions"
            className="orbit-secondary-actions orbit-deferred-actions"
            data-app-shell-deferred-actions="profile-route"
          >
            {deferredWorkspaceActions.map((action) => (
              <a
                className="orbit-chip orbit-chip-neutral"
                data-app-shell-deferred-action={action.id}
                href={action.href}
                key={`deferred-action-link:${action.id}`}
              >
                {action.label}
              </a>
            ))}
          </div>
        )}

        {visibleRouteSupportLinks.length > 0 && (
          <aside
            aria-label="Secondary demo recovery checks"
            className="orbit-route-support-panel"
            data-route-support-links="secondary-demo-checks"
          >
            <h2>{bilingualText("恢复状态检查", "Demo recovery checks")}</h2>
            <p>
              {bilingualText(
                "在同一路由查看空状态、等待状态和恢复状态，不触发主要关系动作。",
                "Check the same route with empty, pending, and recovery states without moving the primary relationship action.",
              )}
            </p>
            <nav
              aria-label="Recovery route checks"
              className="chip-row orbit-route-support-actions"
            >
              {visibleRouteSupportLinks.map((link) => {
                const label = link.label.trim();

                return (
                  <a
                    className="orbit-chip orbit-chip-neutral"
                    href={link.href}
                    aria-label={label}
                    key={`route-support-link:${link.href}`}
                  >
                    {label}
                  </a>
                );
              })}
            </nav>
          </aside>
        )}

        {!isAiCommandVariant && (
          <nav aria-label="Bottom navigation" className="chip-row orbit-bottom-navigation">
            {bottomNavigation.map((item) => {
              const isActive = item.route === activeRoute;

              return (
                <a
                  aria-current={isActive ? "page" : undefined}
                  className={classNames(
                    "orbit-chip",
                    isActive ? "orbit-chip-primary" : "orbit-chip-neutral",
                  )}
                  href={item.href}
                  key={item.route}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
        )}
      </div>
    </WorkbenchFrame>
  );
}
