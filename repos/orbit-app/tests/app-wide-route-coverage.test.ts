import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import test from "node:test";

type RouteKind = "screen" | "alias" | "redirect";

type ExpectedRoute = {
  route: string;
  consumer: string;
  kind: RouteKind;
};

type DocumentedRoute = ExpectedRoute & {
  nativeEvidence: string;
  renderEvidence: string;
};

const repoRoot = new URL("..", import.meta.url).pathname;
const appRoot = join(repoRoot, "app");
const readmePath = join(
  repoRoot,
  "docs",
  "designs",
  "2026-09-08-app-wide-style",
  "README.md"
);

const expectedRoutes: readonly ExpectedRoute[] = [
  { route: "/ai", consumer: "AiScreen", kind: "screen" },
  { route: "/ai/[id]", consumer: "AiConversationScreen", kind: "screen" },
  { route: "/agent", consumer: "AgentActionsScreen", kind: "screen" },
  { route: "/contacts", consumer: "ContactsScreen (overview)", kind: "screen" },
  { route: "/contacts/list", consumer: "ContactsScreen (list)", kind: "screen" },
  { route: "/contacts/[id]", consumer: "ContactDetailScreen", kind: "screen" },
  { route: "/contacts/new", consumer: "ContactAcquisitionScreen", kind: "screen" },
  { route: "/contacts/dashboard", consumer: "ContactsDashboardScreen", kind: "screen" },
  { route: "/contacts/graph", consumer: "ContactsDashboardScreen", kind: "alias" },
  { route: "/contacts/pipeline", consumer: "ContactPipelineScreen", kind: "screen" },
  { route: "/contacts/intros", consumer: "ContactIntrosScreen", kind: "screen" },
  {
    route: "/contacts/analysis/[dimension]/[bucketId]",
    consumer: "ContactStructureDetailScreen",
    kind: "screen"
  },
  {
    route: "/contacts/all-actions",
    consumer: "AllActionsAgentLedgerScreen",
    kind: "screen"
  },
  { route: "/events", consumer: "EventsScreen", kind: "screen" },
  { route: "/events/[id]", consumer: "EventDetailScreen", kind: "screen" },
  {
    route: "/events/[id]/register",
    consumer: "EventRegistrationScreen",
    kind: "screen"
  },
  {
    route: "/events/[id]/attendees",
    consumer: "EventAttendeesScreen",
    kind: "screen"
  },
  { route: "/events/center", consumer: "EventCenterScreen", kind: "screen" },
  {
    route: "/events/[id]/operations",
    consumer: "EventOperationsScreen",
    kind: "screen"
  },
  {
    route: "/events/[id]/operations/admission",
    consumer: "EventAdmissionReviewScreen",
    kind: "screen"
  },
  {
    route: "/events/[id]/operations/check-in",
    consumer: "EventCheckInScreen",
    kind: "screen"
  },
  {
    route: "/events/[id]/operations/roles",
    consumer: "EventRolesScreen",
    kind: "screen"
  },
  {
    route: "/events/[id]/analytics",
    consumer: "EventAnalyticsScreen",
    kind: "screen"
  },
  { route: "/inbox", consumer: "RelationshipInboxScreen", kind: "screen" },
  {
    route: "/inbox/[id]",
    consumer: "RelationshipInboxThreadScreen",
    kind: "screen"
  },
  { route: "/chat", consumer: "RelationshipChatScreen", kind: "screen" },
  {
    route: "/chat/[id]",
    consumer: "RelationshipChatDetailScreen",
    kind: "screen"
  },
  { route: "/schedule", consumer: "ScheduleScreen", kind: "screen" },
  {
    route: "/schedule/events/[id]",
    consumer: "ScheduleEventPreviewScreen",
    kind: "screen"
  },
  { route: "/today", consumer: "TodayScreen", kind: "screen" },
  { route: "/tasks", consumer: "TasksScreen", kind: "screen" },
  { route: "/tasks/[id]", consumer: "TaskDetailScreen", kind: "screen" },
  { route: "/followups", consumer: "FollowupsScreen", kind: "screen" },
  { route: "/profile", consumer: "ProfileScreen", kind: "screen" },
  { route: "/account", consumer: "AccountScreen", kind: "screen" },
  {
    route: "/account/login",
    consumer: "AccountAuthScreen (login)",
    kind: "screen"
  },
  {
    route: "/account/signup",
    consumer: "AccountAuthScreen (signup)",
    kind: "screen"
  },
  {
    route: "/account/forgot-password",
    consumer: "AccountAuthScreen (forgot)",
    kind: "screen"
  },
  {
    route: "/account/permissions",
    consumer: "AccountPermissionsScreen",
    kind: "screen"
  },
  { route: "/settings", consumer: "SettingsScreen", kind: "screen" },
  { route: "/settings/api", consumer: "ApiSettingsScreen", kind: "screen" },
  { route: "/admin", consumer: "AdminScreen (dashboard)", kind: "screen" },
  { route: "/admin/access", consumer: "AdminScreen (access)", kind: "screen" },
  { route: "/admin/events", consumer: "AdminScreen (events)", kind: "screen" },
  { route: "/login-admin", consumer: "AdminLoginScreen", kind: "screen" },
  { route: "/platform", consumer: "PlatformScreen", kind: "screen" },
  { route: "/o/[slug]", consumer: "OrganizerPublicScreen", kind: "screen" },
  { route: "/register", consumer: "RegisterInviteScreen", kind: "screen" },
  { route: "/register/[code]", consumer: "RegisterInviteScreen", kind: "screen" },
  { route: "/party", consumer: "PartyModeScreen (overview)", kind: "screen" },
  {
    route: "/party/checkin",
    consumer: "PartyModeScreen (checkin)",
    kind: "screen"
  },
  { route: "/party/graph", consumer: "PartyModeScreen (graph)", kind: "screen" },
  { route: "/home/events", consumer: "HomeScreen (events)", kind: "screen" },
  { route: "/dashboard", consumer: "DashboardScreen", kind: "screen" },
  { route: "/", consumer: "IndexRoute → resolveInitialRouteHref", kind: "redirect" },
  { route: "/home", consumer: "HomeRoute → /ai", kind: "redirect" },
  {
    route: "/account/mobile-google",
    consumer: "MobileGoogleRoute → /account/login",
    kind: "redirect"
  },
  {
    route: "/[...legacy]",
    consumer: "LegacyDeepLinkRoute → resolveInitialRouteHref",
    kind: "redirect"
  }
];

function scanAppRouteEntries(directory: string): string[] {
  const routes: string[] = [];

  function walk(currentDirectory: string): void {
    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const entryPath = join(currentDirectory, entry.name);

      if (entry.isDirectory()) {
        walk(entryPath);
        continue;
      }

      if (!/\.(j|t)sx?$/u.test(entry.name) || /^_layout\.(j|t)sx?$/u.test(entry.name)) {
        continue;
      }

      const routePath = relative(appRoot, entryPath)
        .split(sep)
        .join("/")
        .replace(/\.(j|t)sx?$/u, "")
        .replace(/(^|\/)\([^/]+\)(?=\/|$)/gu, "")
        .replace(/^\/+|\/+$/gu, "")
        .replace(/(^|\/)index$/u, "")
        .replace(/\/{2,}/gu, "/");
      const normalized = routePath ? `/${routePath}` : "/";

      routes.push(normalized);
    }
  }

  walk(directory);
  return routes.sort();
}

function coverageDelta(
  expected: readonly string[],
  actual: readonly string[]
): { missing: string[]; unexpected: string[]; duplicates: string[] } {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const duplicates = [...actualSet].filter(
    (route) => actual.filter((actualRoute) => actualRoute === route).length > 1
  );

  return {
    missing: [...expectedSet].filter((route) => !actualSet.has(route)).sort(),
    unexpected: [...actualSet].filter((route) => !expectedSet.has(route)).sort(),
    duplicates: duplicates.sort()
  };
}

function readDocumentedRouteRows(readme: string): DocumentedRoute[] {
  const section = readme.match(
    /<!-- route-coverage:start -->([\s\S]*?)<!-- route-coverage:end -->/u
  )?.[1];

  if (!section) {
    return [];
  }

  return section
    .split("\n")
    .map((line) =>
      line.match(
        /^\|\s*`(\/[^`]*)`\s*\|\s*`([^`]*)`\s*\|\s*(screen|alias|redirect)\s*\|\s*(\S.*?)\s*\|\s*(\S.*?)\s*\|$/u
      )
    )
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({
      route: match[1]!,
      consumer: match[2]!,
      kind: match[3]! as RouteKind,
      nativeEvidence: match[4]!,
      renderEvidence: match[5]!
    }));
}

test("the approved 58-route inventory matches every real app entry", () => {
  assert.equal(expectedRoutes.length, 58);
  assert.deepEqual(
    coverageDelta(
      expectedRoutes.map(({ route }) => route),
      scanAppRouteEntries(appRoot)
    ),
    { missing: [], unexpected: [], duplicates: [] }
  );
});

test("route coverage rejects both a missing approved entry and a new unaccepted entry", () => {
  const expected = expectedRoutes.map(({ route }) => route);
  const changedActual = expected.filter((route) => route !== "/ai").concat("/future");

  assert.deepEqual(coverageDelta(expected, changedActual), {
    missing: ["/ai"],
    unexpected: ["/future"],
    duplicates: []
  });
});

test("route coverage rejects a duplicate normalized app entry", () => {
  const expected = expectedRoutes.map(({ route }) => route);

  assert.deepEqual(coverageDelta(expected, expected.concat("/ai")), {
    missing: [],
    unexpected: [],
    duplicates: ["/ai"]
  });
});

test("the final README records canonical status and concrete evidence for all 58 routes", () => {
  const readme = readFileSync(readmePath, "utf8");
  const documented = readDocumentedRouteRows(readme);
  const expectedByRoute = new Map(expectedRoutes.map((entry) => [entry.route, entry]));

  assert.deepEqual(
    coverageDelta(
      expectedRoutes.map(({ route }) => route),
      documented.map(({ route }) => route)
    ),
    { missing: [], unexpected: [], duplicates: [] }
  );
  assert.equal(documented.length, 58);

  for (const row of documented) {
    const expected = expectedByRoute.get(row.route);

    assert.ok(expected, `unexpected documented route ${row.route}`);
    assert.equal(row.consumer, expected.consumer, `${row.route} canonical consumer`);
    assert.equal(row.kind, expected.kind, `${row.route} route kind`);
    assert.match(
      row.nativeEvidence,
      /(?:native-route-observations|native-detail-observation|final-native-route-observations)\.json/u,
      `${row.route} concrete native observation`
    );
    assert.match(
      row.renderEvidence,
      /tests\/[a-z0-9-]+\.test\.tsx?/u,
      `${row.route} concrete render or route-contract test`
    );
    assert.doesNotMatch(
      `${row.nativeEvidence} ${row.renderEvidence}`,
      /(?:TBD|待补|仅文件存在)/u,
      `${row.route} evidence must not be a placeholder`
    );
  }

  assert.match(readme, /Acceptance status:\s*\*\*INCOMPLETE\*\*/u);
  assert.match(readme, /Runtime Dynamic Type:\s*\*\*OPEN\*\*/u);
  assert.match(readme, /Auth\/profile software keyboard:\s*\*\*UNPROVEN\*\*/u);
});
