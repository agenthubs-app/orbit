import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "../../shared/ui/app-shell";

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

async function renderAppHome(searchParams: PageSearchParams): Promise<string> {
  const Page = (await import("../../app/(app)/app/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams),
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
      },
      pageElement,
    ),
  );
}

async function renderProfilePage(searchParams: PageSearchParams): Promise<string> {
  const Page = (await import("../../app/(app)/app/profile/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams),
  });

  return renderToStaticMarkup(pageElement);
}

async function renderProfilePageInShell(
  searchParams: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/profile/page")).default;
  const pageElement = await Page({
    searchParams: Promise.resolve(searchParams),
  });

  return renderToStaticMarkup(
    React.createElement(
      AppShell,
      {
        accountSummary: sprintAccountSummary,
        activeRoute: "/app/profile",
        runtimeStatus: sprintRuntimeStatus,
        topActions: sprintTopActions,
        bottomNavigation: sprintBottomNavigation,
      },
      pageElement,
    ),
  );
}

function assertStateHasVisibleRecoveryControl({
  expectedHeading,
  expectedLabel,
  expectedRecoveryCopy,
  html,
  routeLabel,
}: {
  expectedHeading: string;
  expectedLabel: string;
  expectedRecoveryCopy: string;
  html: string;
  routeLabel: string;
}) {
  assert.match(
    html,
    new RegExp(`<h2>[^<]*${expectedHeading}</h2>`),
    `${routeLabel} should expose a meaningful state heading`,
  );
  assert.match(
    html,
    new RegExp(
      `aria-label="[^"]*${expectedLabel}"[^>]*>[^<]*${expectedLabel}</(?:a|button)>`,
    ),
    `${routeLabel} should expose a visible recovery control named "${expectedLabel}"`,
  );
  assert.match(
    html,
    new RegExp(expectedRecoveryCopy),
    `${routeLabel} should include recovery copy that matches its visible control`,
  );
  assert.match(html, /aria-label="Recovery actions"/);
  assert.match(
    html,
    /<summary>来源详情 \/ Source details<\/summary>/,
    `${routeLabel} should label source evidence as information, not an extra action`,
  );
  assert.doesNotMatch(
    html,
    /<summary>Inspect source details<\/summary>/,
    `${routeLabel} should reserve action verbs for actual recovery controls`,
  );
  assert.doesNotMatch(html, />\s*<\/a>/);
  assert.doesNotMatch(html, /<span hidden>[^<]*(?:again|source|profile|recovery)[^<]*<\/span>/i);
}

test("/app scenario states expose named recovery controls", async () => {
  const cases = [
    {
      expectedHeading: "Orbit relationship command center is empty",
      expectedLabel: "Add a relationship source",
      expectedRecoveryCopy: "Add a relationship source to start from reviewed context\\.",
      html: await renderAppHome({ scenario: "empty" }),
      routeLabel: "/app?scenario=empty",
    },
    {
      expectedHeading: "Orbit relationship command center is loading",
      expectedLabel: "Return to relationship cockpit",
      expectedRecoveryCopy:
        "Return to relationship cockpit to recheck the reviewed source queue after profile, event, follow-up, and next-move evidence finish review\\.",
      html: await renderAppHome({ scenario: "pending" }),
      routeLabel: "/app?scenario=pending",
    },
    {
      expectedHeading: "Orbit relationship command center could not load",
      expectedLabel: "Return to relationship cockpit",
      expectedRecoveryCopy:
        "Return to relationship cockpit without writing records, delivering reminders, sending messages, or contacting outside tools\\.",
      html: await renderAppHome({ scenario: "failure" }),
      routeLabel: "/app?scenario=failure",
    },
  ];

  for (const pageCase of cases) {
    assertStateHasVisibleRecoveryControl(pageCase);
  }
});

test("/app/profile shell prioritizes profile recovery before global shortcuts", async () => {
  const html = await renderProfilePageInShell({ scenario: "failure" });
  const profileRecoveryIndex = html.indexOf('href="/app/profile"');
  const globalSourceIndex = html.indexOf('href="/app/contacts/new"');

  assert.ok(profileRecoveryIndex >= 0, "profile recovery control should render");
  assert.ok(globalSourceIndex >= 0, "global source shortcut should still render");
  assert.ok(
    profileRecoveryIndex < globalSourceIndex,
    "profile recovery control should appear before the global source shortcut",
  );
  assert.match(
    html,
    /aria-label="[^"]*Return to profile source review"[^>]*href="\/app\/profile"[^>]*>[^<]*Return to profile source review<\/a>/,
  );
});

test("/app/profile scenario states expose named recovery controls", async () => {
  const cases = [
    {
      expectedHeading: "Profile readiness is empty",
      expectedLabel: "Open profile setup",
      expectedRecoveryCopy: "Open profile setup to add reviewed profile context\\.",
      html: await renderProfilePage({ scenario: "empty" }),
      routeLabel: "/app/profile?scenario=empty",
    },
    {
      expectedHeading: "Profile readiness is loading",
      expectedLabel: "Review held profile sources",
      expectedRecoveryCopy:
        "Review held profile sources while manual edits, business-card draft, and suggested changes stay held\\.",
      html: await renderProfilePage({ scenario: "pending" }),
      routeLabel: "/app/profile?scenario=pending",
    },
    {
      expectedHeading: "Profile readiness could not load",
      expectedLabel: "Return to profile source review",
      expectedRecoveryCopy:
        "Return to profile source review without accepting suggestions or changing Ari(?:'|&#x27;)s profile\\.",
      html: await renderProfilePage({ scenario: "failure" }),
      routeLabel: "/app/profile?scenario=failure",
    },
  ];

  for (const pageCase of cases) {
    assertStateHasVisibleRecoveryControl(pageCase);
  }
});
