import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

type PageSearchParams = Record<string, string | string[] | undefined>;

const internalCopyPattern =
  /\b(route|boundary|mock|harness|providers?|fixtures?|live|vector|model calls?|deterministic|database(?:s)?|console)\b/i;

async function renderDashboardPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/dashboard/page")).default;
  const element = await Page({
    searchParams: Promise.resolve(searchParams ?? {}),
  });

  return renderToStaticMarkup(element);
}

function visibleText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertTextOrder(text: string, earlier: string, later: string) {
  const earlierIndex = text.indexOf(earlier);
  const laterIndex = text.indexOf(later);

  assert.notEqual(earlierIndex, -1, `Expected to find "${earlier}"`);
  assert.notEqual(laterIndex, -1, `Expected to find "${later}"`);
  assert.ok(
    earlierIndex < laterIndex,
    `Expected "${earlier}" to appear before "${later}"`,
  );
}

test("/app/dashboard composes approved dashboard capabilities into the relationship workspace", async () => {
  const html = await renderDashboardPage();
  const text = visibleText(html);

  assert.match(html, /<h2>[^<]*Network health priority<\/h2>/);
  assert.match(text, /Current priority: Maya Chen at Kumo Grid/);
  assert.match(text, /Why it matters now/);
  assert.match(
    text,
    /Climate infrastructure pilot expansion is ready while enterprise buyer coverage remains below target\./,
  );
  assert.match(text, /Source confidence: High/);
  assert.match(text, /Review status: .*Ready for human review/);
  assert.match(html, /Maya Chen/);
  assert.match(html, /Kumo Grid/);
  assert.match(html, /Climate infrastructure/);
  assert.match(html, /<summary>[^<]*Evidence source trail<\/summary>/);
  assert.doesNotMatch(
    html,
    /<details(?![^>]*hidden)[^>]*><summary>Technical provenance IDs<\/summary>/,
  );
  assert.match(html, /Recommended next move/);
  assert.match(
    text,
    /Send the reliability memo and ask whether Kumo Grid can review pilot scope this week\./,
  );
  assert.match(text, /Enterprise buyer coverage/);
  assert.match(html, /Network coverage score/);
  assert.match(html, /Provenance warnings/);
  assert.match(html, /No active provenance warnings/);
  assert.match(
    text,
    /No side effects: no saved record, audit report, compliance report, message, notification, automated writing call, or outside network request occurs from this page\./,
  );
  assertTextOrder(text, "Network health priority", "Relationship assets");
  assertTextOrder(text, "Network health priority", "Relationship health signals");
  assertTextOrder(text, "Network health priority", "Distribution and coverage");
  assertTextOrder(text, "Network health priority", "Provenance warnings");
  assertTextOrder(text, "No side effects:", "Relationship assets");
  assert.match(html, /data-state-boundary="app-dashboard-success"/);
  assert.doesNotMatch(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, /Dashboard will show relationship health/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);
  assert.doesNotMatch(text, internalCopyPattern);
});

test("/app/dashboard previews the dashboard review action without external side effects", async (t) => {
  const html = await renderDashboardPage({
    action: "run-dashboard-review",
  });
  const reloadedHtml = await renderDashboardPage({
    action: "run-dashboard-review",
  });
  const text = visibleText(html);

  assert.match(html, /Run dashboard review/);
  assert.match(html, /Dashboard review ready: 3 opportunity prompts refreshed/);
  assert.match(text, /Review preview refreshed local guidance/);
  assert.match(text, /Refreshed prompts: 3/);
  assert.match(text, /Audit findings queued for review: 0/);
  assert.match(text, /Source confidence: High/);
  assert.match(text, /What remains local/);
  assert.match(text, /No saved record/);
  assert.match(text, /No audit report/);
  assert.match(text, /No compliance report/);
  assert.match(text, /No message/);
  assert.match(text, /No notification/);
  assert.match(text, /No automated writing call/);
  assert.match(text, /No outside network request/);
  assert.match(html, /data-dashboard-result="dashboard-run-review-preview"/);
  assert.match(
    html,
    /data-action-evidence="dashboard-run-review-local-preview"/,
  );
  assert.match(html, /data-side-effects="none"/);
  assert.match(
    reloadedHtml,
    /data-action-evidence="dashboard-run-review-local-preview"/,
  );
  assert.match(visibleText(reloadedHtml), /No outside network request/);

  t.diagnostic(
    [
      "app-dashboard action=run-dashboard-review",
      "result=dashboard-run-review-preview",
      "reload-render=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/dashboard renders empty loading and failure states through the shared state boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "Dashboard has no relationship signals",
      expectedCopy:
        "Add source-backed contacts or event context before reviewing dashboard trends.",
      expectedRecoveryHref: "/app/dashboard",
      expectedRecoveryLabel: "Show active dashboard",
    },
    {
      scenario: "pending",
      expectedTitle: "Dashboard is still checking relationship signals",
      expectedCopy:
        "Dashboard review stays paused while sourced activity and provenance are checked.",
      expectedRecoveryHref: "/app/dashboard",
      expectedRecoveryLabel: "Return to active dashboard",
    },
    {
      scenario: "failure",
      expectedTitle: "Dashboard could not load",
      expectedCopy:
        "Dashboard summary, network gaps, opportunities, and provenance warnings are unavailable while relationship evidence is checked.",
      expectedRecoveryHref: "/app/dashboard",
      expectedRecoveryLabel: "Reload dashboard",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderDashboardPage({ scenario: state.scenario });
    const text = visibleText(html);

    assert.match(html, new RegExp(`<h2>[^<]*${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(state.expectedCopy));
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(
      html,
      new RegExp(
        `data-route-state-url="/app/dashboard\\?scenario=${state.scenario}"`,
      ),
    );
    assert.match(html, /aria-label="[^"]*Dashboard route recovery actions"/);
    assert.match(
      html,
      new RegExp(
        `href="${state.expectedRecoveryHref}">[^<]*${state.expectedRecoveryLabel}</a>`,
      ),
    );
    assert.match(
      text,
      /No saved record, audit report, compliance report, message, notification, automated writing call, or outside network request occurs while this state is shown\./,
    );
    assert.doesNotMatch(html, />[^<]*(Scenario URL|mock|harness|providers?)[^<]*</i);
    assert.doesNotMatch(text, internalCopyPattern);
    t.diagnostic(
      `app-dashboard navigate=/app/dashboard?scenario=${state.scenario} boundary=shared-ui-state-view title="${state.expectedTitle}" recovery="${state.expectedRecoveryLabel}"`,
    );
  }
});

test("/app/dashboard evidence APIs return success envelopes", async (t) => {
  const dashboardRoute = await import("../../app/api/dashboard/route");
  const distributionsRoute = await import("../../app/api/dashboard/distributions/route");
  const gapsRoute = await import("../../app/api/dashboard/network-gaps/route");
  const opportunitiesRoute = await import("../../app/api/dashboard/opportunities/route");

  const dashboardResponse = await dashboardRoute.GET(
    new Request("http://localhost/api/dashboard"),
  );
  const dashboardBody = await dashboardResponse.json();
  const distributionsResponse = await distributionsRoute.GET(
    new Request("http://localhost/api/dashboard/distributions"),
  );
  const distributionsBody = await distributionsResponse.json();
  const gapsResponse = await gapsRoute.GET(
    new Request("http://localhost/api/dashboard/network-gaps"),
  );
  const gapsBody = await gapsResponse.json();
  const opportunitiesResponse = await opportunitiesRoute.GET(
    new Request("http://localhost/api/dashboard/opportunities"),
  );
  const opportunitiesBody = await opportunitiesResponse.json();

  assert.equal(dashboardResponse.status, 200);
  assert.equal(dashboardBody.success, true);
  assert.equal(dashboardBody.data.newContacts.contacts[0].name, "Maya Chen");
  assert.equal(distributionsResponse.status, 200);
  assert.equal(distributionsBody.success, true);
  assert.equal(
    distributionsBody.data.industryDistribution[0].label,
    "Climate infrastructure",
  );
  assert.equal(gapsResponse.status, 200);
  assert.equal(gapsBody.success, true);
  assert.equal(gapsBody.data.coverageScore, 68);
  assert.equal(opportunitiesResponse.status, 200);
  assert.equal(opportunitiesBody.success, true);
  assert.equal(
    opportunitiesBody.data.highPriorityOpportunities[0].title,
    "Climate infrastructure pilot expansion",
  );
  t.diagnostic(
    "app-dashboard api-envelope GET /api/dashboard=200 success=true first-contact=Maya GET /api/dashboard/distributions=200 success=true first-industry=Climate GET /api/dashboard/network-gaps=200 success=true coverage=68 GET /api/dashboard/opportunities=200 success=true first-opportunity=Maya",
  );
});

test("/app/dashboard route adapter avoids raw fixtures and documents mock to live replacement", () => {
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-command-center.tsx",
    ),
    "utf8",
  );
  const serviceFactorySource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/dashboard-service-factory.ts",
    ),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/dashboard/compose-app-dashboard-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(adapterSource, /from\s+["'][^"']*fixtures?/i);
  assert.doesNotMatch(adapterSource, /createMock/);
  assert.match(adapterSource, /createAppDashboardRouteServices/);
  assert.match(adapterSource, /\.orbit-runtime-row/);
  assert.match(adapterSource, /\.orbit-account-summary/);
  assert.match(adapterSource, /display: none;/);
  assert.match(adapterSource, /RouteStateBoundary/);
  assert.match(serviceFactorySource, /createModuleServiceFactory/);
  assert.match(serviceFactorySource, /createDashboardAggregateService/);
  assert.match(serviceFactorySource, /createNetworkDistributionAnalyticsService/);
  assert.match(serviceFactorySource, /createOpportunityReminderAnalyticsService/);
  assert.match(serviceFactorySource, /createSourceConsistencyProvenanceAuditService/);

  for (const required of [
    "live service/provider files",
    "switch mechanism",
    "required env vars or permissions",
    "privacy/provenance constraints",
    "replacement tests",
    "route state checks",
    "route recovery actions",
    "data-action-evidence",
  ]) {
    assert.match(liveDoc.toLowerCase(), new RegExp(required));
  }

  assert.match(liveDoc, /## Evaluator Evidence Summary/);
  assert.match(liveDoc, /Live files:/);
  assert.match(liveDoc, /Switch:/);
  assert.match(liveDoc, /Env and permissions:/);
  assert.match(liveDoc, /Privacy and provenance:/);
  assert.match(liveDoc, /Replacement tests:/);
});
