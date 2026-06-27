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

async function renderAgentPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/agent/page")).default;
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

test("/app/agent composes approved agent capabilities into the relationship workspace", async () => {
  const html = await renderAgentPage();
  const text = visibleText(html);

  assert.match(html, /<h2>[^<]*Agent review<\/h2>/);
  assert.match(html, /Maya Chen/);
  assert.match(html, /Kumo Grid/);
  assert.match(html, /Send reliability memo to Maya Chen/);
  assert.match(html, /Medium autonomy/);
  assert.match(html, /Send message/);
  assert.match(
    html,
    /data-notification-queue-entry-id="queue:notification:maya-deck"/,
  );
  assert.match(html, /data-evidence-id="evidence:notification:maya-deck"/);
  assert.match(html, /data-state-boundary="app-agent-success"/);
  assert.doesNotMatch(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, /Agent will list suggested actions/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);
  assert.doesNotMatch(text, internalCopyPattern);
  assert.doesNotMatch(text, /\b(?:queue|evidence|source|agent|signal|task|connection|reminder):[a-z0-9:-]+/i);
  assert.doesNotMatch(text, /\boperator\b/i);
});

test("/app/agent previews the core review action without external side effects", async (t) => {
  const html = await renderAgentPage({
    action: "review-top-agent-action",
  });
  const reloadedHtml = await renderAgentPage({
    action: "review-top-agent-action",
  });
  const text = visibleText(html);

  assert.match(html, /Agent review ready: Send reliability memo to Maya Chen/);
  assert.match(html, /Review top agent action/);
  assert.match(text, /Confirmation recorded: no/);
  assert.match(text, /External sandbox result: no-op preview/);
  assert.match(text, /Message sent: no/);
  assert.match(text, /Notifications delivered: none/);
  assert.match(html, /data-agent-result="agent-review-top-action-preview"/);
  assert.match(
    html,
    /data-action-evidence="agent-review-top-action-local-preview"/,
  );
  assert.match(html, /data-side-effects="none"/);
  assert.match(
    reloadedHtml,
    /data-action-evidence="agent-review-top-action-local-preview"/,
  );
  assert.match(visibleText(reloadedHtml), /Message sent: no/);

  t.diagnostic(
    [
      "app-agent action=review-top-agent-action",
      "result=agent-review-top-action-preview",
      "reload-render=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/agent renders empty loading and failure states through the shared state boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "No agent actions are ready",
      expectedCopy:
        "Add a sourced relationship cue before reviewing agent actions, autonomy settings, confirmations, sandbox checks, and notification queues.",
      expectedRecoveryHref: "/app/agent",
      expectedRecoveryLabel: "Show ready agent workspace",
    },
    {
      scenario: "pending",
      expectedTitle: "Agent review is waiting for confirmation",
      expectedCopy:
        "Agent work stays paused while confirmations, source evidence, and delivery limits are checked.",
      expectedRecoveryHref: "/app/agent",
      expectedRecoveryLabel: "Return to ready agent workspace",
    },
    {
      scenario: "failure",
      expectedTitle: "Agent workspace could not load",
      expectedCopy:
        "Agent actions, settings, confirmations, sandbox checks, and notification queue entries are unavailable while source evidence is checked.",
      expectedRecoveryHref: "/app/agent",
      expectedRecoveryLabel: "Reload agent workspace",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderAgentPage({ scenario: state.scenario });
    const text = visibleText(html);

    assert.match(html, new RegExp(`<h2>[^<]*${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(state.expectedCopy));
    assert.match(html, /data-state-boundary="shared-ui-state-view"/);
    assert.match(
      html,
      new RegExp(`data-route-state-url="/app/agent\\?scenario=${state.scenario}"`),
    );
    assert.match(html, /aria-label="[^"]*Agent route recovery actions"/);
    assert.match(
      html,
      new RegExp(
        `href="${state.expectedRecoveryHref}">[^<]*${state.expectedRecoveryLabel}</a>`,
      ),
    );
    assert.doesNotMatch(html, />[^<]*(Scenario URL|mock|harness|providers?)[^<]*</i);
    assert.doesNotMatch(text, internalCopyPattern);
    assert.doesNotMatch(text, /\b(?:queue|evidence|source|agent|signal|task|connection|reminder):[a-z0-9:-]+/i);
    t.diagnostic(
      `app-agent navigate=/app/agent?scenario=${state.scenario} boundary=shared-ui-state-view title="${state.expectedTitle}" recovery="${state.expectedRecoveryLabel}"`,
    );
  }
});

test("/app/agent evidence APIs return success envelopes", async (t) => {
  const actionsRoute = await import("../../app/api/agent/actions/route");
  const settingsRoute = await import("../../app/api/agent/settings/route");
  const notificationsRoute = await import("../../app/api/notifications/route");

  const actionsResponse = await actionsRoute.GET(
    new Request("http://localhost/api/agent/actions"),
  );
  const actionsBody = await actionsResponse.json();
  const settingsResponse = await settingsRoute.GET(
    new Request("http://localhost/api/agent/settings"),
  );
  const settingsBody = await settingsResponse.json();
  const notificationsResponse = await notificationsRoute.GET(
    new Request("http://localhost/api/notifications"),
  );
  const notificationsBody = await notificationsResponse.json();

  assert.equal(actionsResponse.status, 200);
  assert.equal(actionsBody.success, true);
  assert.equal(actionsBody.data.actions[0].contactName, "Aiko Tanaka");
  assert.equal(settingsResponse.status, 200);
  assert.equal(settingsBody.success, true);
  assert.equal(settingsBody.data.currentLevel, "medium");
  assert.equal(notificationsResponse.status, 200);
  assert.equal(notificationsBody.success, true);
  assert.equal(
    notificationsBody.data.notificationQueue[0].queueEntryId,
    "queue:notification:maya-deck",
  );
  t.diagnostic(
    "app-agent api-envelope GET /api/agent/actions=200 success=true first-contact=Aiko GET /api/agent/settings=200 success=true current-level=medium GET /api/notifications=200 success=true first-queue=queue:notification:maya-deck",
  );
});

test("/app/agent route adapter avoids raw fixtures and documents mock to live replacement", () => {
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/agent-command-center.tsx",
    ),
    "utf8",
  );
  const routeViewModelSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/agent-route-view-model.ts",
    ),
    "utf8",
  );
  const serviceFactorySource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/agent-service-factory.ts",
    ),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/agent/compose-app-agent-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(adapterSource, /from\s+["'][^"']*fixtures?/i);
  assert.doesNotMatch(adapterSource, /features\/(?:agent|notifications|permissions)/);
  assert.doesNotMatch(adapterSource, /createMock/);
  assert.doesNotMatch(adapterSource, /createAppAgentRouteServices/);
  assert.match(adapterSource, /loadAppAgentRouteViewModel/);
  assert.match(adapterSource, /RouteStateBoundary/);
  assert.match(routeViewModelSource, /features\/agent\/contract/);
  assert.match(routeViewModelSource, /features\/agent\/settings-contract/);
  assert.match(routeViewModelSource, /features\/agent\/external-action-contract/);
  assert.match(routeViewModelSource, /features\/notifications\/contract/);
  assert.match(routeViewModelSource, /features\/permissions\/confirmation-contract/);
  assert.match(routeViewModelSource, /createAppAgentRouteServices/);
  assert.doesNotMatch(routeViewModelSource, /from "react"/);
  assert.doesNotMatch(routeViewModelSource, /shared\/ui/);
  assert.match(serviceFactorySource, /createModuleServiceFactory/);
  assert.match(serviceFactorySource, /createAgentActionQueueService/);
  assert.match(serviceFactorySource, /createAgentAutonomySettingsService/);
  assert.match(serviceFactorySource, /createSensitiveActionConfirmationService/);
  assert.match(serviceFactorySource, /createExternalActionSandboxService/);
  assert.match(serviceFactorySource, /createReminderScheduleNotificationService/);
  assert.doesNotMatch(
    serviceFactorySource,
    /Agent route services are unavailable in the requested mode/,
  );

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
