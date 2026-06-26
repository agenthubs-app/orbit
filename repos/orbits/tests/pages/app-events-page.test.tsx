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

async function renderEventsPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/events/page")).default;
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

test("/app/events composes approved event capabilities into the app route", async () => {
  const html = await renderEventsPage();
  const text = visibleText(html);

  assert.match(html, /<h2>Event briefing<\/h2>/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Mina Park/);
  assert.match(html, /Climate operators breakfast/);
  assert.match(html, /Readiness 75/);
  assert.match(html, /data-evidence-id="evidence:events-calendar-fixture"/);
  assert.match(html, /data-state-boundary="app-events-success"/);
  assert.doesNotMatch(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(html, />[^<]*\b[Pp]roviders?\b[^<]*</);
  assert.doesNotMatch(text, internalCopyPattern);
});

test("/app/events starts with the current event preparation priority", async () => {
  const html = await renderEventsPage();
  const text = visibleText(html);
  const priorityIndex = text.indexOf("Current event priority");
  const inventoryIndex = text.indexOf("Event choices");
  const diagnosticsIndex = text.indexOf("Preparation signals");

  assert.match(html, /data-route-priority="app-events-current-event"/);
  assert.match(text, /Prepare for Climate founders dinner/);
  assert.match(text, /Kanda Founders Table/);
  assert.match(text, /Mina Park/);
  assert.match(text, /storage pilot/i);
  assert.match(text, /Readiness 75/);
  assert.match(text, /Open Climate founders dinner workspace/);
  assert.match(
    html,
    /href="\/app\/events\/demo-event-1">Open Climate founders dinner workspace<\/a>/,
  );
  assert.ok(priorityIndex > -1, "current event priority should be visible");
  assert.ok(inventoryIndex > -1, "event choices should remain visible");
  assert.ok(diagnosticsIndex > -1, "preparation signals should remain visible");
  assert.ok(
    priorityIndex < inventoryIndex,
    "current event priority should appear before event inventory",
  );
  assert.ok(
    priorityIndex < diagnosticsIndex,
    "current event priority should appear before diagnostics",
  );
  assert.doesNotMatch(text, internalCopyPattern);
});

test("/app/events event cards link into detail and describe event work", async () => {
  const html = await renderEventsPage();
  const text = visibleText(html);

  assert.match(html, /aria-label="Event choices"/);
  assert.match(
    html,
    /href="\/app\/events\/demo-event-1"[^>]*>Review Climate founders dinner<\/a>/,
  );
  assert.match(text, /Venue: Kanda Founders Table/);
  assert.match(text, /Attendee opportunity: Mina Park/);
  assert.match(text, /Readiness: 75/);
  assert.match(text, /Relationship value: storage pilot/i);
  assert.match(text, /Review attendee context before the dinner/);
  assert.doesNotMatch(text, /technical inventory/i);
  assert.doesNotMatch(text, internalCopyPattern);
});

test("/app/events previews the core event recommendation action without external side effects", async (t) => {
  const html = await renderEventsPage({
    action: "accept-top-event",
  });
  const reloadedHtml = await renderEventsPage({
    action: "accept-top-event",
  });
  const text = visibleText(html);

  assert.match(html, /Event recommendation accepted: Climate operators breakfast/);
  assert.match(html, /Accept event value recommendation/);
  assert.match(
    text,
    /No calendar changes, saved records, messages, or notifications were made/,
  );
  assert.match(text, /Calendar changes: none/);
  assert.match(text, /Saved records: none/);
  assert.match(text, /Realtime presence: none/);
  assert.match(text, /Peer notifications: none/);
  assert.match(text, /External messages: none/);
  assert.match(text, /Messages and notifications: none/);
  assert.match(text, /Notifications: none/);
  assert.match(text, /Outside network requests: none/);
  assert.match(html, /data-task-result="events-accept-top-event-preview"/);
  assert.match(html, /data-action-evidence="events-accept-top-event-local-preview"/);
  assert.match(html, /data-side-effects="none"/);
  assert.doesNotMatch(text, internalCopyPattern);
  assert.match(
    reloadedHtml,
    /data-action-evidence="events-accept-top-event-local-preview"/,
  );
  assert.match(
    visibleText(reloadedHtml),
    /No calendar changes, saved records, messages, or notifications were made/,
  );

  t.diagnostic(
    [
      "app-events action=accept-top-event",
      "result=events-accept-top-event-preview",
      "reload-render=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/events renders empty loading and failure states through a route state boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "No event context is ready",
      expectedCopy:
        "Create or import a sourced event before reviewing recommendations and readiness.",
      expectedRecoveryHref: "/app/events",
      expectedRecoveryLabel: "Show sourced events",
    },
    {
      scenario: "pending",
      expectedTitle: "Event context is loading",
      expectedCopy:
        "Event sources, recommendation rules, and readiness checks are still being prepared.",
      expectedRecoveryHref: "/app/events",
      expectedRecoveryLabel: "Return to ready events",
    },
    {
      scenario: "failure",
      expectedTitle: "Events could not load",
      expectedCopy:
        "Event sources could not be loaded, so recommendations and readiness are paused.",
      expectedRecoveryHref: "/app/events",
      expectedRecoveryLabel: "Reload events",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderEventsPage({ scenario: state.scenario });
    const text = visibleText(html);

    assert.match(html, new RegExp(`<h2>${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(state.expectedCopy));
    assert.match(html, /data-state-boundary="app-events-route-state-view"/);
    assert.match(
      html,
      new RegExp(`data-route-state-url="/app/events\\?scenario=${state.scenario}"`),
    );
    assert.match(html, /aria-label="Events recovery actions"/);
    assert.match(
      html,
      new RegExp(
        `href="${state.expectedRecoveryHref}">${state.expectedRecoveryLabel}</a>`,
      ),
    );
    assert.doesNotMatch(html, />[^<]*(Scenario URL|mock|harness|providers?)[^<]*</i);
    assert.doesNotMatch(text, internalCopyPattern);
    t.diagnostic(
      `app-events navigate=/app/events?scenario=${state.scenario} boundary=app-events-route-state-view title="${state.expectedTitle}" recovery="${state.expectedRecoveryLabel}"`,
    );
  }
});

test("/app/events evidence APIs return success envelopes", async (t) => {
  const eventsRoute = await import("../../app/api/events/route");
  const eventValueRoute = await import(
    "../../app/api/recommendations/events/route"
  );

  const eventsResponse = await eventsRoute.GET(
    new Request("http://localhost/api/events"),
  );
  const eventsBody = await eventsResponse.json();
  const eventValueResponse = await eventValueRoute.GET(
    new Request("http://localhost/api/recommendations/events"),
  );
  const eventValueBody = await eventValueResponse.json();

  assert.equal(eventsResponse.status, 200);
  assert.equal(eventsBody.success, true);
  assert.equal(eventsBody.data.events[0].title, "Climate founders dinner");
  assert.equal(eventValueResponse.status, 200);
  assert.equal(eventValueBody.success, true);
  assert.equal(
    eventValueBody.data.recommendations[0].title,
    "Climate operators breakfast",
  );
  t.diagnostic(
    "app-events api-envelope GET /api/events=200 success=true first-event=Climate founders dinner GET /api/recommendations/events=200 success=true top-value-event=Climate operators breakfast",
  );
});

test("/app/events route adapter avoids raw fixtures and documents mock to live replacement", () => {
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-command-center.tsx",
    ),
    "utf8",
  );
  const serviceFactorySource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/events-service-factory.ts",
    ),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/events/compose-app-events-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(adapterSource, /from\s+["'][^"']*fixtures?/i);
  assert.doesNotMatch(adapterSource, /createMock/);
  assert.match(adapterSource, /createAppEventsRouteServices/);
  assert.match(adapterSource, /RouteStateBoundary/);
  assert.match(adapterSource, /app-events-route-state-view/);
  assert.match(serviceFactorySource, /createModuleServiceFactory/);
  assert.match(serviceFactorySource, /createEventCrudAndImportService/);
  assert.match(serviceFactorySource, /createEventRecommendationService/);
  assert.match(
    serviceFactorySource,
    /createEventValueRecommendationService/,
  );
  assert.match(serviceFactorySource, /createEventGoalAndReadinessService/);

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
