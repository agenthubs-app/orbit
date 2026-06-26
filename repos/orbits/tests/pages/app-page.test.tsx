import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../shared/ui/app-shell";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

type PageSearchParams = Record<string, string | string[] | undefined>;

const sprintAccountSummary = {
  displayName: "Orbit Demo Workspace",
  initials: "OD",
  primaryContext: "Event-grounded relationship workspace",
  provenance: "Mock services stay behind existing capability contracts.",
  sourcePosture: "Sources staged for review before outreach",
};

const sprintRuntimeStatus = {
  label: "Demo workspace status",
  details: [
    "Mock services stay behind existing capability contracts.",
    "No live login, sync, or outbound action is connected.",
  ],
  compactBoundary: "Privacy boundary: staged review only; no live sync or outbound action.",
};

const sprintTopActions = [
  {
    id: "add-source",
    href: "/app/contacts/new",
    label: "Add a relationship source",
    provenance: "Opens contact intake without live sync.",
    tone: "primary" as const,
  },
  {
    id: "review-next-moves",
    href: "/app/agent",
    label: "Review next moves",
    provenance: "Opens the local action queue.",
    tone: "secondary" as const,
  },
];

const sprintBottomNavigation = [
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
] as const;

const sharedWorkspaceIdentity =
  "Orbit Demo Workspace (OD) | Event-grounded relationship workspace | Sources staged for review before outreach";

const contactIntakeRecoveryLinks = [
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
] as const;

async function renderAppHome(searchParams?: PageSearchParams): Promise<string> {
  const Page = (await import("../../app/(app)/app/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(
    React.createElement(
      AppShell,
      {
        accountSummary: sprintAccountSummary,
        activeRoute: "/app",
        runtimeStatus: sprintRuntimeStatus,
        topActions: sprintTopActions,
        bottomNavigation: sprintBottomNavigation,
        variant: "ai-command",
      },
      pageElement,
    ),
  );
}

test("/app AI shell suppresses legacy workspace chrome", async () => {
  const html = await renderAppHome();

  assert.equal(
    html.split(`data-workspace-identity="${sharedWorkspaceIdentity}"`).length - 1,
    0,
  );
  assert.doesNotMatch(html, /aria-label="Active demo workspace identity"/);
  assert.doesNotMatch(html, /data-app-shell-primary-action="true"/);
  assert.doesNotMatch(html, /data-runtime-status="compact"/);
  assert.doesNotMatch(html, /Know who needs your attention/);
  assert.match(html, /href="\/app"[^>]*>Orbit AI<\/a>/);
  assert.match(html, /aria-current="page"/);
});

test("/app opens as an AI chat command center with a functional side stage", async () => {
  const html = await renderAppHome();

  assert.match(html, /data-orbit-ai-command-center="true"/);
  assert.match(html, /aria-label="Orbit AI 对话"/);
  assert.match(html, /问 Orbit AI/);
  assert.match(html, /你现在想在东京推进什么？/);
  assert.match(html, /告诉我你想推进哪类机会/);
  assert.match(html, /aria-label="Orbit 功能侧栏"/);
  assert.match(html, /实时关系轨道/);
  assert.match(html, /从聊天打开功能面板/);
  assert.match(html, /href="\/app\?lang=en"[^>]*>English<\/a>/);
  for (const expected of [
    { href: "/app?panel=events", label: "推荐活动" },
    { href: "/app?panel=people", label: "推荐人脉" },
    { href: "/app?panel=followups", label: "准备跟进" },
    { href: "/app?panel=agent", label: "检查下一步" },
  ]) {
    assert.match(
      html,
      new RegExp(`href="${expected.href.replace("?", "\\?")}"[^>]*>${expected.label}</a>`),
    );
  }
  assert.ok(
    html.indexOf("问 Orbit AI") < html.indexOf("Orbit 功能侧栏"),
    "AI chat should lead before the functional side stage",
  );
  assert.ok(
    html.indexOf("中文") < html.indexOf("English"),
    "Chinese should be the active primary language before the English option",
  );
  assert.doesNotMatch(html, /Ask Orbit AI/);
  assert.doesNotMatch(html, /One relationship priority/);
  assert.doesNotMatch(html, /App workbench composed capabilities/);
  assert.doesNotMatch(html, /App workbench capability labels/);
});

test("/app keeps English as the secondary language option", async () => {
  const html = await renderAppHome({ lang: "en" });

  assert.match(html, /lang="en"/);
  assert.match(html, /Ask Orbit AI/);
  assert.match(html, /What are you trying to achieve in Tokyo\?/);
  assert.match(html, /Open a function panel from chat/);
  assert.match(html, /href="\/app"[^>]*>中文<\/a>/);
  assert.match(html, /href="\/app\?panel=events&amp;lang=en"[^>]*>Recommend events<\/a>/);
});

test("/app uses a relationship console layout instead of a card stack", async () => {
  const html = await renderAppHome({ panel: "events" });

  assert.match(html, /data-orbit-ai-layout="relationship-console"/);
  assert.match(html, /data-visual-signature="relationship-field"/);
  assert.match(html, /aria-label="当前任务面板"/);
  assert.match(html, /data-action-bar="reviewed-preview"/);
  assert.match(html, /待确认/);
  assert.match(html, /来源已绑定/);
  assert.doesNotMatch(html, /orbit-ai-stage-card/);
});

test("/app side stage opens functional panels from AI intent", async () => {
  const panelCases = [
    {
      panel: "events",
      expectedTitle: "推荐活动",
      expectedCopy: "Tokyo SaaS Leaders Roundtable",
      expectedAction: "打开活动工作区",
    },
    {
      panel: "people",
      expectedTitle: "优先联系人",
      expectedCopy: "Akari Mori",
      expectedAction: "打开人脉工作区",
    },
    {
      panel: "followups",
      expectedTitle: "跟进队列",
      expectedCopy: "给 Akari Mori 发送摘要",
      expectedAction: "打开跟进",
    },
    {
      panel: "agent",
      expectedTitle: "发送前检查",
      expectedCopy: "发送前确认介绍草稿",
      expectedAction: "打开下一步",
    },
    {
      panel: "dashboard",
      expectedTitle: "关系信号",
      expectedCopy: "高价值关系",
      expectedAction: "打开关系健康",
    },
  ] as const;

  for (const panelCase of panelCases) {
    const html = await renderAppHome({ panel: panelCase.panel });

    assert.match(html, new RegExp(panelCase.expectedTitle));
    assert.match(html, new RegExp(panelCase.expectedCopy));
    assert.match(html, new RegExp(panelCase.expectedAction));
    assert.match(html, /data-side-effects="none"/);
  }
});

test("/app AI command stage summarizes functional paths with clear links", async () => {
  const html = await renderAppHome();

  for (const expected of [
    { href: "/app/events", label: "打开活动工作区" },
    { href: "/app/contacts", label: "打开人脉工作区" },
    { href: "/app/followups", label: "打开跟进" },
    { href: "/app/chat", label: "打开对话" },
    { href: "/app/dashboard", label: "打开关系健康" },
    { href: "/app/agent", label: "检查下一步" },
  ]) {
    assert.match(
      html,
      new RegExp(`href="${expected.href}"[^>]*>${expected.label}</a>`),
    );
  }

  assert.match(html, /功能面板/);
  assert.match(html, /活动、人脉、跟进、对话、关系健康和下一步/);
  assert.doesNotMatch(html, />\s*<\/(?:a|button)>/);
});

test("/app AI command center exposes responsive stage guardrails", async () => {
  const html = await renderAppHome();

  assert.match(html, /min-width: 0;/);
  assert.match(
    html,
    /grid-template-columns: minmax\(min\(100%, 360px\), 0\.92fr\) minmax\(min\(100%, 420px\), 1\.08fr\);/,
  );
  assert.match(html, /@media \(max-width: 900px\)/);
  assert.match(
    html,
    /\.orbit-ai-command-center \.orbit-ai-command-link,[\s\S]*?white-space: normal;/,
  );
  assert.match(
    html,
    /\.orbit-ai-command-center \.orbit-ai-stage-grid,[\s\S]*?min-width: 0;/,
  );
  assert.doesNotMatch(
    html,
    /\.orbit-ai-command-center \.orbit-ai-command-link,[\s\S]*?white-space: nowrap/,
  );
  assert.doesNotMatch(
    html,
    /\.orbit-ai-stage-action \{[\s\S]*?white-space: nowrap/,
  );
});

test("/app shell composition exposes outcome navigation without empty labels", async () => {
  const html = await renderAppHome();

  assert.equal(html.match(/aria-label="Bottom navigation"/g)?.length, 1);
  for (const item of sprintBottomNavigation) {
    assert.match(html, new RegExp(`href="${item.href}"[^>]*>${item.label}</a>`));
  }
  assert.doesNotMatch(html, />\s*<\/a>/);
  assert.doesNotMatch(html, />Home<\/a>|>Profile<\/a>|>Contacts<\/a>|>Chat<\/a>|>Dashboard<\/a>|>Agent<\/a>/);
});

test("/app scenario states keep the clean AI shell while showing recovery content", async () => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "Orbit relationship command center is empty",
    },
    {
      scenario: "pending",
      expectedTitle: "Orbit relationship command center is loading",
    },
    {
      scenario: "failure",
      expectedTitle: "Orbit relationship command center could not load",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderAppHome({ scenario: state.scenario });

    assert.match(html, new RegExp(`<h2>${state.expectedTitle}</h2>`));
    assert.doesNotMatch(html, /data-runtime-status="compact"/);
    assert.doesNotMatch(html, /<details[^>]*open/);
    assert.doesNotMatch(html, /Know who needs your attention/);
  }
});

test("/app contacts intake route is present and composes through the existing page module", async () => {
  const Page = (await import("../../app/(app)/app/contacts/new/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve({}),
  });
  const html = renderToStaticMarkup(pageElement);

  assert.match(html, /app-contacts-new-route/);
  assert.match(html, /Contact acquisition|relationship source|source-backed/i);
});

test("/app contacts intake shell supplies visible source recovery labels", async () => {
  const Page = (await import("../../app/(app)/app/contacts/new/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve({}),
  });
  const html = renderToStaticMarkup(
    React.createElement(
      AppShell as React.ComponentType<Record<string, unknown>>,
      {
        accountSummary: sprintAccountSummary,
        activeRoute: "/app",
        runtimeStatus: sprintRuntimeStatus,
        topActions: sprintTopActions,
        bottomNavigation: sprintBottomNavigation,
        routeSupportLinks: contactIntakeRecoveryLinks,
      },
      pageElement,
    ),
  );

  assert.match(
    html,
    /aria-label="Secondary demo recovery checks"[^>]*data-route-support-links="secondary-demo-checks"/,
  );
  assert.match(html, /Demo recovery checks/);
  for (const link of contactIntakeRecoveryLinks) {
    assert.match(html, new RegExp(`href="${link.href.replace("?", "\\?")}"[^>]*>${link.label}</a>`));
  }
  assert.doesNotMatch(html, />\s*<\/a>/);
});

test("all primary app routes can share the same shell identity string", async () => {
  const routeModules = [
    { activeRoute: "/app", load: () => import("../../app/(app)/app/page") },
    { activeRoute: "/app/profile", load: () => import("../../app/(app)/app/profile/page") },
    { activeRoute: "/app/contacts", load: () => import("../../app/(app)/app/contacts/page") },
    { activeRoute: "/app/events", load: () => import("../../app/(app)/app/events/page") },
    { activeRoute: "/app/followups", load: () => import("../../app/(app)/app/followups/page") },
    { activeRoute: "/app/chat", load: () => import("../../app/(app)/app/chat/page") },
    { activeRoute: "/app/dashboard", load: () => import("../../app/(app)/app/dashboard/page") },
    { activeRoute: "/app/agent", load: () => import("../../app/(app)/app/agent/page") },
  ] as const;

  for (const routeModule of routeModules) {
    const Page = (await routeModule.load()).default;
    const pageElement = await Page({});
    const html = renderToStaticMarkup(
      React.createElement(
        AppShell,
        {
          accountSummary: sprintAccountSummary,
          activeRoute: routeModule.activeRoute,
          runtimeStatus: sprintRuntimeStatus,
          topActions: sprintTopActions,
          bottomNavigation: sprintBottomNavigation,
        },
        pageElement,
      ),
    );

    assert.equal(
      html.split(`data-workspace-identity="${sharedWorkspaceIdentity}"`).length - 1,
      1,
      `${routeModule.activeRoute} should render the shared workspace identity once`,
    );
  }
});

test("app shell mock-to-live replacement doc names provider switch and replacement tests", () => {
  const liveDoc = fs.readFileSync(
    path.join(projectRoot, "shared/ui/app-shell/LIVE_IMPLEMENTATION.md"),
    "utf8",
  );

  for (const required of [
    "live service/provider files",
    "switch from mock to live",
    "required env vars or permissions",
    "privacy/provenance constraints",
    "replacement tests",
  ]) {
  assert.match(liveDoc.toLowerCase(), new RegExp(required));
  }
});

test("app layout wires contact intake recovery links without editing the route page", () => {
  const layoutSource = fs.readFileSync(
    path.join(projectRoot, "app/(app)/app/layout.tsx"),
    "utf8",
  );

  assert.match(layoutSource, /const pathname = usePathname\(\)/);
  assert.match(layoutSource, /pathname === "\/app\/contacts\/new"/);
  assert.match(layoutSource, /routeSupportLinks=/);
  for (const label of [
    "No source ready",
    "Source still reviewing",
    "Source unavailable",
  ]) {
    assert.match(layoutSource, new RegExp(`label: "${label}"`));
  }
});

test("/app page wrapper delegates to AppWorkbench without direct service imports", () => {
  const pageSource = fs.readFileSync(
    path.join(projectRoot, "app/(app)/app/page.tsx"),
    "utf8",
  );

  assert.match(pageSource, /OrbitAiCommandCenter/);
  assert.match(pageSource, /<OrbitAiCommandCenter searchParams=\{searchParams\} \/>/);
  assert.doesNotMatch(
    pageSource,
    /from\s+["'][^"']*(?:features|shared\/services|shared\/api|shared\/domain)\//,
  );
});
