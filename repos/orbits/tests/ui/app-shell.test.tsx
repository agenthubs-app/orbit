import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../shared/ui/app-shell";
import { StateView } from "../../shared/ui/state-view";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

test("app shell renders one shared workspace identity from props", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      AppShell,
      {
        accountSummary: {
          displayName: "Orbit Demo Workspace",
          initials: "OD",
          primaryContext: "Event-grounded relationship workspace",
          provenance: "hidden runtime detail",
          sourcePosture: "Sources staged for review before outreach",
        },
        activeRoute: "/app/contacts",
        runtimeStatus: {
          label: "Demo workspace status",
          details: ["Mock services stay behind existing capability contracts."],
        },
        topActions: [
          {
            id: "capture-source",
            href: "/app/contacts/new",
            label: "Add a relationship source",
            provenance: "test action prop",
            tone: "primary",
          },
        ],
        bottomNavigation: [
          { href: "/app", label: "Relationship cockpit", route: "/app" },
          { href: "/app/contacts", label: "People", route: "/app/contacts" },
          { href: "/app/agent", label: "Next moves", route: "/app/agent" },
        ],
      },
      React.createElement(StateView, {
        description: "Contact records will stay source-backed before workflow logic arrives.",
        evidence: ["Contact intake details are supplied as children."],
        eyebrow: "Contacts",
        title: "Contacts intake preview",
      }),
    ),
  );

  const identity =
    "Orbit Demo Workspace (OD) | Event-grounded relationship workspace | Sources staged for review before outreach";

  assert.equal(html.match(/aria-label="Active demo workspace identity"/g)?.length, 1);
  assert.equal(html.split(`data-workspace-identity="${identity}"`).length - 1, 1);
  assert.match(html, /data-account-initials="OD"/);
  assert.match(html, /Orbit Demo Workspace/);
  assert.match(html, /Event-grounded relationship workspace/);
  assert.match(html, /Sources staged for review before outreach/);
  assert.match(html, /Add a relationship source/);
  assert.match(html, /href="\/app\/contacts\/new"/);
  assert.match(
    html,
    /aria-current="page"[^>]*href="\/app\/contacts"[^>]*>People<\/a>/,
  );
  assert.doesNotMatch(
    html,
    /href="\/app"[^>]*aria-current="page"[^>]*>Relationship cockpit<\/a>/,
  );
  assert.match(html, /Contacts intake preview/);
  assert.match(html, /Contact intake details are supplied as children/);
});

test("shared state view includes default recovery action copy", () => {
  const html = renderToStaticMarkup(
    React.createElement(StateView, {
      description: "Relationship work is waiting for source context.",
      eyebrow: "Checking sources",
      title: "Relationship review is waiting",
    }),
  );

  assert.match(html, /Why this matters/);
  assert.match(html, /What you can use now/);
  assert.match(html, /Safe next step/);
  assert.match(html, /What to do next:/);
  assert.match(html, /Source details appear after review/);
  assert.doesNotMatch(html, /Inspect source details/);
  assert.doesNotMatch(
    html,
    />[^<]*(harness|fixture|provider|operator|placeholder|route examples|sample records|Scenario URL|raw ID)[^<]*</i,
  );
});

test("app shell renders outcome navigation labels exactly once from props", () => {
  const bottomNavigation = [
    { href: "/app", label: "Relationship cockpit", route: "/app" },
    { href: "/app/contacts", label: "People", route: "/app/contacts" },
    { href: "/app/events", label: "Events", route: "/app/events" },
    { href: "/app/followups", label: "Follow-ups", route: "/app/followups" },
    { href: "/app/chat", label: "Conversations", route: "/app/chat" },
    {
      href: "/app/dashboard",
      label: "Relationship health",
      route: "/app/dashboard",
    },
    { href: "/app/agent", label: "Next moves", route: "/app/agent" },
  ] as const;
  const html = renderToStaticMarkup(
    React.createElement(
      AppShell,
      {
        accountSummary: {
          displayName: "Orbit Demo Workspace",
          initials: "OD",
          primaryContext: "Event-grounded relationship workspace",
          provenance: "hidden runtime detail",
          sourcePosture: "Sources staged for review before outreach",
        },
        activeRoute: "/app/contacts",
        runtimeStatus: {
          label: "Demo workspace status",
          details: ["Mock services stay behind existing capability contracts."],
        },
        topActions: [],
        bottomNavigation,
      },
      React.createElement(StateView, {
        description: "Contact records will stay source-backed before workflow logic arrives.",
        evidence: ["Contact intake details are supplied as children."],
        eyebrow: "Contacts",
        title: "Contacts intake preview",
      }),
    ),
  );

  assert.equal(html.match(/aria-label="Bottom navigation"/g)?.length, 1);
  for (const item of bottomNavigation) {
    assert.match(html, new RegExp(`href="${item.href}"[^>]*>${item.label}</a>`));
  }
  assert.doesNotMatch(html, />\s*<\/a>/);
  assert.doesNotMatch(html, />Home<\/a>|>Profile<\/a>|>Contacts<\/a>|>Chat<\/a>|>Dashboard<\/a>|>Agent<\/a>/);
  assert.doesNotMatch(html, /Primary app navigation/);
});

test("app shell makes the contact intake route the primary action and keeps runtime status compact", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      AppShell as React.ComponentType<Record<string, unknown>>,
      {
        accountSummary: {
          displayName: "Orbit Demo Workspace",
          initials: "OD",
          primaryContext: "Event-grounded relationship workspace",
          provenance: "hidden runtime detail",
          sourcePosture: "Sources staged for review before outreach",
        },
        activeRoute: "/app",
        runtimeStatus: {
          label: "Demo workspace status",
          details: [
            "Mock services stay behind existing capability contracts.",
            "No live login, sync, or outbound action is connected.",
          ],
          compactBoundary:
            "Privacy boundary: staged review only; no live sync or outbound action.",
        },
        topActions: [
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
        ],
        bottomNavigation: [{ href: "/app", label: "Relationship cockpit", route: "/app" }],
        routeSupportLinks: [
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
        ],
      },
      React.createElement(StateView, {
        description: "The home workspace starts empty until source-backed records exist.",
        eyebrow: "Home",
        title: "Home",
      }),
    ),
  );

  assert.match(
    html,
    /data-app-shell-primary-action="true"[^>]*href="\/app\/contacts\/new"[^>]*>Add a relationship source<\/a>/,
  );
  assert.match(html, /<details[^>]*aria-label="Workspace status details"[^>]*data-runtime-status="compact"/);
  assert.match(html, /<summary>Demo workspace status<\/summary>/);
  assert.match(html, /data-runtime-boundary-row="compact"/);
  assert.match(
    html,
    /Privacy boundary: staged review only; no live sync or outbound action\./,
  );
  assert.ok(
    html.indexOf("Add a relationship source") < html.indexOf("Demo workspace status"),
    "primary source CTA should render before the compact runtime disclosure",
  );
  assert.ok(
    html.indexOf("Add a relationship source") < html.indexOf("Privacy boundary:"),
    "primary source CTA should stay ahead of the compact privacy boundary row",
  );
  assert.match(
    html,
    /data-workspace-record-scope="sample-records"[^>]*>Reviewed relationship context stays grouped inside Orbit Demo Workspace\./,
  );
  for (const label of [
    "No source ready",
    "Source still reviewing",
    "Source unavailable",
  ]) {
    assert.match(html, new RegExp(`href="\\/app\\/contacts\\/new\\?scenario=[^"]+"[^>]*>${label}<\\/a>`));
  }
});

test("app shell renders route support links as secondary demo checks after route content", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      AppShell as React.ComponentType<Record<string, unknown>>,
      {
        accountSummary: {
          displayName: "Orbit Demo Workspace",
          initials: "OD",
          primaryContext: "Event-grounded relationship workspace",
          provenance: "hidden runtime detail",
          sourcePosture: "Sources staged for review before outreach",
        },
        activeRoute: "/app",
        runtimeStatus: {
          label: "Demo workspace status",
          details: ["Mock services stay behind existing capability contracts."],
        },
        topActions: [
          {
            id: "add-source",
            href: "/app/contacts/new",
            label: "Add a relationship source",
            provenance: "Opens contact intake without live sync.",
            tone: "primary",
          },
        ],
        bottomNavigation: [{ href: "/app", label: "Relationship cockpit", route: "/app" }],
        routeSupportLinks: [
          {
            href: "/app?scenario=empty",
            label: "Review empty state",
          },
          {
            href: "/app?scenario=pending",
            label: "",
          },
          {
            href: "/app?scenario=failure",
            label: "Review recovery state",
          },
        ],
      },
      React.createElement("div", { "data-route-content": "product" }, "Route content"),
    ),
  );

  assert.match(html, /aria-label="Secondary demo recovery checks"/);
  assert.match(html, /data-route-support-links="secondary-demo-checks"/);
  assert.match(html, /Demo recovery checks/);
  assert.match(html, /href="\/app\?scenario=empty"[^>]*aria-label="Review empty state"[^>]*>Review empty state<\/a>/);
  assert.match(html, /href="\/app\?scenario=failure"[^>]*aria-label="Review recovery state"[^>]*>Review recovery state<\/a>/);
  assert.doesNotMatch(html, />\s*<\/a>/);
  assert.ok(
    html.indexOf('data-app-shell-primary-action="true"') <
      html.indexOf('data-route-content="product"'),
    "primary action should stay before route content",
  );
  assert.ok(
    html.indexOf('data-route-content="product"') <
      html.indexOf('data-route-support-links="secondary-demo-checks"'),
    "demo checks should render after the primary route content",
  );
});

test("app shell defers workspace shortcuts after profile recovery content", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      AppShell as React.ComponentType<Record<string, unknown>>,
      {
        accountSummary: {
          displayName: "Orbit Demo Workspace",
          initials: "OD",
          primaryContext: "Event-grounded relationship workspace",
          provenance: "hidden runtime detail",
          sourcePosture: "Sources staged for review before outreach",
        },
        activeRoute: "/app/profile",
        runtimeStatus: {
          label: "Demo workspace status",
          details: ["Mock services stay behind existing capability contracts."],
        },
        topActions: [
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
        ],
        bottomNavigation: [{ href: "/app/profile", label: "People", route: "/app/profile" }],
      },
      React.createElement(
        "section",
        { "data-route-content": "profile-recovery" },
        React.createElement(
          "a",
          {
            "aria-label": "Return to profile source review",
            href: "/app/profile",
          },
          "Return to profile source review",
        ),
      ),
    ),
  );

  const routeContentIndex = html.indexOf('data-route-content="profile-recovery"');
  const profileRecoveryIndex = html.indexOf('href="/app/profile"');
  const globalSourceIndex = html.indexOf('href="/app/contacts/new"');
  const nextMovesIndex = html.indexOf('href="/app/agent"');

  assert.ok(routeContentIndex >= 0, "profile recovery content should render");
  assert.ok(profileRecoveryIndex >= routeContentIndex);
  assert.ok(
    globalSourceIndex > routeContentIndex,
    "global source shortcut should be demoted after profile recovery content",
  );
  assert.ok(
    nextMovesIndex > routeContentIndex,
    "secondary workspace shortcut should be demoted after profile recovery content",
  );
  assert.doesNotMatch(html, />\s*<\/a>/);
});

test("app shell accepts repeated top action copy without duplicate React keys", () => {
  const consoleErrors: string[] = [];
  const originalConsoleError = console.error;

  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.join(" "));
  };

  try {
    renderToStaticMarkup(
      React.createElement(
        AppShell,
        {
          accountSummary: {
            displayName: "Rina Kato",
            initials: "RK",
            primaryContext: "Founder account",
            provenance: "test account prop",
            sourcePosture: "test source posture",
          },
          activeRoute: "/app",
          runtimeStatus: {
            label: "Demo workspace status",
            details: ["Mock services stay behind existing capability contracts."],
          },
          topActions: [
            {
              id: "contacts-source",
              href: "/app/contacts",
              label: "Open queue",
              provenance: "same visible source",
              tone: "primary",
            },
            {
              id: "agent-source",
              href: "/app/agent",
              label: "Open queue",
              provenance: "same visible source",
              tone: "secondary",
            },
          ],
          bottomNavigation: [{ href: "/app", label: "Home", route: "/app" }],
        },
        React.createElement(StateView, {
          description: "The home workspace starts empty until source-backed records exist.",
          eyebrow: "Home",
          title: "Home",
        }),
      ),
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.doesNotMatch(consoleErrors.join("\n"), /same key/i);
});

test("app shell accepts repeated runtime status detail copy without duplicate React keys", () => {
  const consoleErrors: string[] = [];
  const originalConsoleError = console.error;

  console.error = (...args: unknown[]) => {
    consoleErrors.push(args.join(" "));
  };

  try {
    renderToStaticMarkup(
      React.createElement(
        AppShell,
        {
          accountSummary: {
            displayName: "Rina Kato",
            initials: "RK",
            primaryContext: "Founder account",
            provenance: "test account prop",
            sourcePosture: "test source posture",
          },
          activeRoute: "/app",
          runtimeStatus: {
            label: "Demo workspace status",
            details: [
              "Provider detail is intentionally hidden until expanded.",
              "Provider detail is intentionally hidden until expanded.",
            ],
          },
          topActions: [
            {
              id: "contacts-source",
              href: "/app/contacts",
              label: "Open queue",
              provenance: "same visible source",
              tone: "primary",
            },
          ],
          bottomNavigation: [{ href: "/app", label: "Home", route: "/app" }],
        },
        React.createElement(StateView, {
          description: "The home workspace starts empty until source-backed records exist.",
          eyebrow: "Home",
          title: "Home",
        }),
      ),
    );
  } finally {
    console.error = originalConsoleError;
  }

  assert.doesNotMatch(consoleErrors.join("\n"), /same key/i);

  const shellSource = fs.readFileSync(
    path.join(projectRoot, "shared/ui/app-shell.tsx"),
    "utf8",
  );

  assert.doesNotMatch(shellSource, /key=\{`runtime-status:\$\{detail\}`\}/);
});

test("app shell source exposes native TypeScript props without shell state constants", () => {
  const shellSource = fs.readFileSync(
    path.join(projectRoot, "shared/ui/app-shell.tsx"),
    "utf8",
  );

  assert.doesNotMatch(shellSource, /supabase|auth|fixture|mock[A-Z]/i);
  assert.match(shellSource, /export type OrbitAppRoute =/);
  assert.match(shellSource, /export interface AppShellAccountSummary/);
  assert.match(shellSource, /sourcePosture: string/);
  assert.match(shellSource, /export interface AppShellTopAction/);
  assert.match(shellSource, /export interface AppShellRuntimeStatus/);
  assert.match(shellSource, /compactBoundary\?: string/);
  assert.match(shellSource, /id: string/);
  assert.match(shellSource, /export interface AppShellNavigationItem/);
  assert.match(shellSource, /export interface AppShellRouteSupportLink/);
  assert.match(shellSource, /export interface AppShellProps/);
  assert.match(shellSource, /routeSupportLinks\?: AppShellRouteSupportLink\[\]/);
  assert.match(shellSource, /function AppShell\([\s\S]*: AppShellProps/);
  assert.doesNotMatch(
    shellSource,
    /export const appShell(AccountSummary|TopActions|BottomNavigation)/,
  );
  assert.match(shellSource, /accountSummary/);
  assert.match(shellSource, /activeRoute/);
  assert.match(shellSource, /topActions/);
  assert.match(shellSource, /runtimeStatus/);
  assert.match(shellSource, /bottomNavigation/);
  assert.match(shellSource, /data-workspace-identity/);
  assert.match(shellSource, /data-workspace-record-scope="sample-records"/);
  assert.match(shellSource, /data-runtime-boundary-row="compact"/);
  assert.match(shellSource, /orbit-bottom-navigation/);
  assert.match(shellSource, /white-space:\s*normal/);
  assert.doesNotMatch(shellSource, /key=\{action\.(label|provenance)\}/);
});

test("app layout owns shell state as typed props without auth access", () => {
  const layoutSource = fs.readFileSync(
    path.join(projectRoot, "app/(app)/app/layout.tsx"),
    "utf8",
  );

  assert.match(layoutSource, /appShellAccountSummary: AppShellAccountSummary/);
  assert.match(layoutSource, /appShellTopActions: AppShellTopAction\[\]/);
  assert.match(layoutSource, /appShellRuntimeStatus: AppShellRuntimeStatus/);
  assert.match(layoutSource, /appShellBottomNavigation: AppShellNavigationItem\[\]/);
  assert.match(layoutSource, /sourcePosture: "Sources staged for review before outreach"/);
  assert.match(layoutSource, /href: "\/app\/contacts\/new"/);
  assert.match(layoutSource, /label: "Add a relationship source"/);
  for (const label of [
    "Orbit AI",
    "资料",
    "人脉",
    "活动",
    "跟进",
    "对话",
    "关系健康",
    "下一步",
  ]) {
    assert.match(layoutSource, new RegExp(`label: "${label}"`));
  }
  assert.doesNotMatch(layoutSource, /label: "Home"|label: "Profile"|label: "Contacts"|label: "Chat"|label: "Dashboard"|label: "Agent"/);
  assert.match(layoutSource, /const pathname = usePathname\(\)/);
  assert.match(layoutSource, /resolveOrbitAppRoute\(pathname\)/);
  assert.match(layoutSource, /routeSupportLinks=/);
  assert.match(layoutSource, /variant="ai-command"/);
  assert.doesNotMatch(layoutSource, /variant=\{activeRoute === "\/app" \? "ai-command" : "standard"\}/);
  assert.match(layoutSource, /pathname === "\/app\/contacts\/new"/);
  assert.doesNotMatch(
    layoutSource,
    /supabase|auth|getUser|useSession|provider|fixture/i,
  );
});

test("main app routes render shared state guidance", async () => {
  const routeModules = [
    {
      load: () => import("../../app/(app)/app/page"),
      purpose: "Triage the relationship work that needs attention.",
      title: "Home",
    },
    {
      load: () => import("../../app/(app)/app/profile/page"),
      purpose: "Set account identity and permission context before sources connect.",
      title: "Profile",
    },
    {
      load: () => import("../../app/(app)/app/events/page"),
      purpose: "Prepare event context, attendee sources, and goals.",
      title: "Events",
    },
    {
      load: () => import("../../app/(app)/app/contacts/page"),
      purpose: "Review people only after their origin and evidence exist.",
      title: "Contacts",
    },
    {
      load: () => import("../../app/(app)/app/followups/page"),
      purpose: "Stage reminders and drafts behind approval.",
      title: "Followups",
    },
    {
      load: () => import("../../app/(app)/app/chat/page"),
      purpose: "Summarize conversations only from approved evidence.",
      title: "Chat",
    },
    {
      load: () => import("../../app/(app)/app/dashboard/page"),
      purpose: "Read relationship health only after sourced activity exists.",
      title: "Dashboard",
    },
    {
      load: () => import("../../app/(app)/app/agent/page"),
      purpose: "Review proposed agent actions before external effects.",
      title: "Agent",
    },
  ];

  for (const routeModule of routeModules) {
    const Page = (await routeModule.load()).default;
    const html = renderToStaticMarkup(React.createElement(Page));

    assert.match(html, /workbench-surface/);
    assert.match(html, new RegExp(`<h2>${routeModule.title}</h2>`));
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(html, /Why this matters/);
    assert.match(html, new RegExp(routeModule.purpose));
    assert.match(html, /What you can use now/);
    assert.match(html, /Safe next step/);
    assert.match(html, /No outside accounts are connected here yet/);
    assert.match(html, /Next step:/);
    assert.doesNotMatch(html, /shared placeholder state/);
    assert.doesNotMatch(html, /capability service/i);
    assert.doesNotMatch(html, /Mika Tanaka|Tokyo Founder Demo Night|Kenji Sato/);
  }
});

test("route placeholders stay behind the shared state boundary", () => {
  const routeFilePaths = [
    "app/(app)/app/page.tsx",
    "app/(app)/app/profile/page.tsx",
    "app/(app)/app/events/page.tsx",
    "app/(app)/app/contacts/page.tsx",
    "app/(app)/app/followups/page.tsx",
    "app/(app)/app/chat/page.tsx",
    "app/(app)/app/dashboard/page.tsx",
    "app/(app)/app/agent/page.tsx",
  ];

  for (const routeFilePath of routeFilePaths) {
    const source = fs.readFileSync(path.join(projectRoot, routeFilePath), "utf8");

    assert.match(source, /shared\/ui\/state-view/);
    assert.match(source, /purpose=/);
    assert.match(source, /emptyState=/);
    assert.match(source, /guardrail=/);
    assert.match(source, /nextStep=/);
    assert.doesNotMatch(source, /fixture|mock[A-Z]|supabase|auth|provider/i);
  }
});
