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

async function renderEventDetailPage(
  searchParams?: PageSearchParams,
): Promise<string> {
  const Page = (await import("../../app/(app)/app/events/[id]/page")).default;
  const element = await Page({
    params: Promise.resolve({ id: "demo-event-1" }),
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("/app/events/demo-event-1 declares its dynamic route parameter", async () => {
  const pageModule = await import("../../app/(app)/app/events/[id]/page");

  assert.equal(typeof pageModule.generateStaticParams, "function");
  assert.deepEqual(await pageModule.generateStaticParams(), [
    { id: "demo-event-1" },
  ]);
});

test("/app/events/demo-event-1 composes approved event detail capabilities", async () => {
  const routeModule = await import(
    "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service"
  );
  const expectedCapabilities = [
    "attendee-roster",
    "event-goal",
    "event-readiness",
    "event-recommendations",
    "opening-line",
    "want-to-connect",
    "encounter-notes",
    "post-event-review",
  ];
  const model = routeModule.loadAppEventDetailRoute({
    eventId: "demo-event-1",
  });
  const html = await renderEventDetailPage();
  const text = visibleText(html);

  assert.deepEqual(
    routeModule.APP_EVENT_DETAIL_COMPOSED_CAPABILITIES,
    expectedCapabilities,
  );
  assert.equal(model.routeState, "success");

  if (model.routeState === "success") {
    assert.deepEqual(model.composedCapabilities, expectedCapabilities);
  }

  assert.match(html, /<h1>Climate founders dinner<\/h1>/);
  assert.match(html, /Aiko Mori/);
  assert.match(html, /Readiness 75/);
  assert.match(html, /Mina Park/);
  assert.match(html, /Opening line/);
  assert.match(html, /Priya Shah/);
  assert.match(html, /evidence:event-roster-privacy-gate/);
  assert.match(html, /data-state-boundary="app-event-detail-success"/);
  assert.doesNotMatch(html, /data-state-boundary="shared-ui-state-view"/);
  assert.doesNotMatch(html, />[^<]*\b[Mm]ock\b[^<]*</);
  assert.doesNotMatch(text, /\bfixture\b/i);
});

test("/app/events/demo-event-1 reconciles composed event logistics to one canonical record", async () => {
  const html = await renderEventDetailPage();
  const text = visibleText(html);
  const routeModule = await import(
    "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service"
  );
  const model = routeModule.loadAppEventDetailRoute({
    eventId: "demo-event-1",
  });

  assert.equal(model.routeState, "success");

  if (model.routeState === "success") {
    assert.equal(model.canonicalEvent?.venue, "Kanda Founders Table");
    assert.equal(model.sourceConsistency?.reconciledSourceCount, 4);
    assert.equal(model.sourceConsistency?.apiEvidenceSurfaceCount, 3);
    assert.equal(model.sourceConsistency?.apiEvidenceContradictionCount, 1);
    assert.match(
      model.sourceConsistency?.apiEvidenceSummary ?? "",
      /1 of 3 route API evidence surfaces carries older event logistics/i,
    );
  }

  assert.match(html, /<h2>[^<]*Venue and time stay anchored<\/h2>/);
  assert.match(text, /Kanda Founders Table/);
  assert.match(text, /Orbit already resolved older attendee logistics/);
  assert.match(
    text,
    /One source was reconciled before recommendations were shown/,
  );
  assert.doesNotMatch(text, /Daikanyama Founders Room/);
  assert.doesNotMatch(text, /\b25 Jun\b|June 25/);
});

test("/app/events/demo-event-1 shows the relationship priority before secondary event details", async () => {
  const html = await renderEventDetailPage();
  const text = visibleText(html);
  const priorityIndex = text.indexOf("Meet Priya Shah first");
  const selectedEventIndex = text.indexOf("Current event: Climate founders dinner");
  const secondaryLeadIndex = text.indexOf("After Priya, review Mina Park");
  const sourceConsistencyIndex = text.indexOf(
    "Venue and time stay anchored",
  );

  assert.match(html, /data-route-priority="app-event-detail-next-action"/);
  assert.match(html, /data-selected-event="demo-event-1"/);
  assert.match(text, /Current event: Climate founders dinner/);
  assert.match(text, /Source story: Calendar source confirmed the dinner/);
  assert.match(text, /Venue\/time confidence: Kanda Founders Table/);
  assert.match(text, /First person to meet: Priya Shah/);
  assert.match(text, /In-room action: .*Mark Priya Shah to meet on this page/);
  assert.match(html, /<h2>[^<]*Meet Priya Shah first<\/h2>/);
  assert.match(text, /Mark Priya Shah as the first person to meet/);
  assert.match(text, /Priya spoke about storage reliability/);
  assert.match(text, /Opening line context/);
  assert.match(
    text,
    /Priya Shah also wants to connect. Keep the introduction on-site/,
  );
  assert.match(text, /After Priya, review Mina Park/);
  assert.match(text, /Treat Mina Park as the next evidence-backed lead after Priya Shah/);
  assert.match(text, /Orbit has already checked venue and time against trusted event sources/);
  assert.match(
    text,
    /Orbit already resolved older attendee logistics/,
  );
  assert.match(
    text,
    /One source was reconciled before recommendations were shown/,
  );
  assert.doesNotMatch(text, /Some attendee records still mention older event logistics/);
  assert.doesNotMatch(text, /One checked record still needs logistics review/);
  assert.match(text, /Kanda Founders Table/);
  assert.match(text, /trusted event details/i);
  assert.doesNotMatch(text, /event detail record/i);
  assert.match(text, /Opening line/);
  assert.match(text, /This page does not send messages, alerts, saved-record writes, or outside network requests/);
  assert.doesNotMatch(text, /\bOrbit Operator\b/i);
  assert.doesNotMatch(text, /Start with source-backed work/i);
  assert.doesNotMatch(text, /\bAPI evidence\b/i);
  assert.doesNotMatch(text, /\broute APIs?\b/i);
  assert.doesNotMatch(text, /\broute\b/i);
  assert.doesNotMatch(text, /\bcomposed capability\b/i);
  assert.doesNotMatch(text, /\bsource consistency\b/i);
  assert.doesNotMatch(text, /\bwant-to-connect\b/i);
  assert.ok(priorityIndex > -1, "priority checkpoint should be visible");
  assert.ok(selectedEventIndex > -1, "selected event context should be visible");
  assert.ok(secondaryLeadIndex > -1, "secondary recommendation should be visible");
  assert.ok(sourceConsistencyIndex > -1, "source consistency checkpoint should be visible");
  assert.ok(
    selectedEventIndex < priorityIndex,
    "selected event context should carry into the first action",
  );
  assert.ok(
    priorityIndex < sourceConsistencyIndex,
    "relationship priority should appear before secondary event details",
  );
  assert.ok(
    priorityIndex < secondaryLeadIndex,
    "secondary recommendation should appear after the immediate relationship action",
  );
});

test("/app/events/demo-event-1 records want-to-connect intent without external side effects", async (t) => {
  const html = await renderEventDetailPage({
    action: "want-to-connect",
    targetContactId: "contact:priya-shah",
  });
  const reloadedHtml = await renderEventDetailPage({
    action: "want-to-connect",
    targetContactId: "contact:priya-shah",
  });
  const repeatedClickHtml = await renderEventDetailPage({
    action: "want-to-connect",
    targetContactId: "contact:priya-shah",
  });
  const text = visibleText(html);
  const repeatedClickText = visibleText(repeatedClickHtml);

  assert.match(text, /Priya Shah is marked for this page preview/);
  assert.match(text, /Use this as your in-room prompt/);
  assert.match(text, /This preview only changes what you see here/);
  assert.match(html, /Mark Priya Shah to meet/);
  assert.match(
    text,
    /No realtime presence, peer notification, external message, saved-record write, or outside network request ran/,
  );
  assert.doesNotMatch(text, /saved record changed/i);
  assert.match(html, /data-action-result="event-detail-want-connect-recorded"/);
  assert.match(html, /data-action-evidence="evidence:want-connect-local-intent"/);
  assert.match(html, /data-action-storage="route-only"/);
  assert.match(html, /data-side-effects="none"/);
  assert.doesNotMatch(text, /route-only/i);
  assert.match(text, /Realtime presence: .*none/);
  assert.match(text, /Peer notifications: .*none/);
  assert.match(text, /External messages: .*none/);
  assert.match(text, /Saved-record writes: .*none/);
  assert.match(text, /Calendar updates: .*none/);
  assert.match(text, /Notifications: .*none/);
  assert.match(text, /Outside network requests: .*none/);
  assert.match(
    reloadedHtml,
    /data-action-evidence="evidence:want-connect-local-intent"/,
  );
  assert.equal(
    (repeatedClickHtml.match(/data-action-result="event-detail-want-connect-recorded"/g) ?? [])
      .length,
    1,
  );
  assert.match(
    repeatedClickText,
    /No realtime presence, peer notification, external message, saved-record write, or outside network request ran/,
  );
  assert.match(repeatedClickHtml, /data-side-effects="none"/);

  t.diagnostic(
    [
      "app-events-demo-event-1 action=want-to-connect",
      "result=event-detail-want-connect-recorded",
      "reload-render=stable",
      "repeated-click=stable",
      "side-effects=none",
    ].join(" "),
  );
});

test("/app/events/demo-event-1 renders empty loading and failure states through a route boundary", async (t) => {
  const scenarios = [
    {
      scenario: "empty",
      expectedTitle: "No event workspace is ready",
      expectedCopy:
        "Choose an event with an approved roster before reviewing people, lines, notes, or post-event contacts.",
      expectedRecoveryHref: "/app/events",
      expectedRecoveryLabel: "Return to events",
    },
    {
      scenario: "pending",
      expectedTitle: "Event workspace is loading",
      expectedCopy:
        "Roster access and preparation signals are still waiting for review.",
      expectedRecoveryHref: "/app/events/demo-event-1",
      expectedRecoveryLabel: "Check current event",
    },
    {
      scenario: "failure",
      expectedTitle: "Event workspace could not load",
      expectedCopy:
        "Orbit could not load relationship context for this event.",
      expectedRecoveryHref: "/app/events/demo-event-1",
      expectedRecoveryLabel: "Retry event",
    },
  ] as const;

  for (const state of scenarios) {
    const html = await renderEventDetailPage({ scenario: state.scenario });

    assert.match(html, new RegExp(`<h2>[^<]*${state.expectedTitle}</h2>`));
    assert.match(html, new RegExp(escapeRegex(state.expectedCopy)));
    assert.match(html, /data-state-boundary="app-event-detail-route-state-view"/);
    assert.match(
      html,
      new RegExp(
        `data-route-state-url="/app/events/demo-event-1\\?scenario=${state.scenario}"`,
      ),
    );
    assert.match(html, /aria-label="[^"]*Event detail route recovery actions"/);
    assert.match(
      html,
      new RegExp(
        `href="${escapeRegex(state.expectedRecoveryHref)}">[^<]*${escapeRegex(
          state.expectedRecoveryLabel,
        )}</a>`,
      ),
    );
    t.diagnostic(
      `app-events-demo-event-1 navigate=/app/events/demo-event-1?scenario=${state.scenario} boundary=app-event-detail-route-state-view title="${state.expectedTitle}" recovery="${state.expectedRecoveryLabel}"`,
    );
  }
});

test("/app/events/demo-event-1 API evidence surfaces return success envelopes", async (t) => {
  const eventRoute = await import("../../app/api/events/[id]/route");
  const attendeesRoute = await import("../../app/api/events/[id]/attendees/route");
  const recommendationsRoute = await import(
    "../../app/api/recommendations/event/[id]/route"
  );
  const routeModule = await import(
    "../../app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service"
  );
  const probes = [
    {
      name: "app-events-demo-event-1-page_1",
      response: await eventRoute.GET(
        new Request("http://localhost/api/events/demo-event-1"),
        { params: Promise.resolve({ id: "demo-event-1" }) },
      ),
      expectedDatum: "Climate founders dinner",
    },
    {
      name: "app-events-demo-event-1-page_2",
      response: await attendeesRoute.GET(
        new Request("http://localhost/api/events/demo-event-1/attendees"),
        { params: Promise.resolve({ id: "demo-event-1" }) },
      ),
      expectedDatum: "Aiko Mori",
    },
    {
      name: "app-events-demo-event-1-page_3",
      response: await recommendationsRoute.GET(
        new Request("http://localhost/api/recommendations/event/demo-event-1"),
        { params: Promise.resolve({ id: "demo-event-1" }) },
      ),
      expectedDatum: "Mina Park",
    },
  ] as const;

  const bodies: Record<(typeof probes)[number]["name"], any> = {};

  for (const probe of probes) {
    const body = await probe.response.json();

    assert.equal(probe.response.status, 200, probe.name);
    assert.equal(body.success, true, probe.name);
    assert.match(JSON.stringify(body.data), new RegExp(escapeRegex(probe.expectedDatum)));
    bodies[probe.name] = body;
    t.diagnostic(`${probe.name} status=200 success=true datum=${probe.expectedDatum}`);
  }

  const model = routeModule.loadAppEventDetailRoute({ eventId: "demo-event-1" });

  assert.equal(model.routeState, "success");

  if (model.routeState === "success") {
    assert.equal(bodies["app-events-demo-event-1-page_1"].data.event.venue, "Kanda Founders Table");
    assert.equal(
      bodies["app-events-demo-event-1-page_2"].data.event.venue,
      "Daikanyama Founders Room",
    );
    assert.equal(
      bodies["app-events-demo-event-1-page_3"].data.event.venue,
      "Kanda Founders Table",
    );
    assert.equal(model.sourceConsistency.apiEvidenceContradictionCount, 1);
    assert.match(model.sourceConsistency.apiEvidenceSummary, /attendee roster/i);
  }
});

test("/app/events/demo-event-1 route adapter avoids raw fixtures and documents mock to live replacement", () => {
  const pageSource = fs.readFileSync(
    path.join(projectRoot, "app/(app)/app/events/[id]/page.tsx"),
    "utf8",
  );
  const adapterSource = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/event-detail-route-service.ts",
    ),
    "utf8",
  );
  const liveDoc = fs.readFileSync(
    path.join(
      projectRoot,
      "app/(app)/app/events/compose-app-events-demo-event-1-from-previously-approved-mock-first-capabilities/LIVE_IMPLEMENTATION.md",
    ),
    "utf8",
  );

  assert.doesNotMatch(pageSource, /fixtures/i);
  assert.doesNotMatch(pageSource, /createMock/i);
  assert.match(pageSource, /\.workbench-header,/);
  assert.match(pageSource, /\[aria-label="Account and next steps"\]/);
  assert.match(pageSource, /loadAppEventDetailRoute/);
  assert.match(adapterSource, /createModuleServiceFactory/);
  assert.match(adapterSource, /createEventCrudAndImportService/);
  assert.match(adapterSource, /createEventAttendeeRosterService/);
  assert.match(adapterSource, /createEventRecommendationService/);
  assert.match(adapterSource, /createEventGoalAndReadinessService/);
  assert.match(adapterSource, /createWantConnectService/);
  assert.match(adapterSource, /createEventEncounterNoteService/);
  assert.match(adapterSource, /createPostEventContactReviewService/);

  for (const required of [
    "live service/provider files",
    "switch mechanism",
    "required env vars or permissions",
    "privacy/provenance constraints",
    "replacement tests",
    "route state checks",
    "data-action-evidence",
    "data-side-effects",
    "top-level relationship priority",
    "reload-after-action",
    "repeated-click persistence",
  ]) {
    assert.match(liveDoc.toLowerCase(), new RegExp(required));
  }

  for (const heading of [
    "## Live Service/Provider Files",
    "## Switch Mechanism",
    "## Required Env Vars Or Permissions",
    "## Privacy/Provenance Constraints",
    "## Replacement Tests",
  ]) {
    assert.match(liveDoc, new RegExp(`^${escapeRegex(heading)}$`, "m"));
  }
});
