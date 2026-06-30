/**
 * 活动价值推荐 mock 的契约测试。
 *
 * 验证本地评分推荐、accept 结果和无外部副作用的动作边界。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the event value recommendation mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("event value recommendation contract exposes fixtures errors and mock-only provenance", async () => {
  const contract = await importProjectModule<{
    EVENT_VALUE_RECOMMENDATION_ERROR_CODES: readonly string[];
    EVENT_VALUE_RECOMMENDATION_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    EVENT_VALUE_RECOMMENDATION_FIXTURE_SOURCE: string;
    mockEventValueRecommendationsFixture: {
      state: string;
      profile: {
        goal: string;
        location: string;
        industryPreference: string;
      };
      recommendations: readonly Array<{
        eventId: string;
        title: string;
        location: string;
        industry: string;
        attendeeDensity: number;
        calendarFit: string;
        valueScore: number;
        scoreBand: string;
        factors: {
          profileGoal: number;
          location: number;
          industryPreference: number;
          attendeeDensity: number;
          calendarFit: number;
        };
        evidenceIds: readonly string[];
        calendarAvailabilitySynced: false;
        liveEventDiscoveryFeedRequested: false;
        externalNetworkRequested: false;
      }>;
      provenance: {
        source: string;
        generationMethod: string;
        calendarProviderRequested: false;
        liveEventDiscoveryFeedRequested: false;
        externalNetworkRequested: false;
        databaseQueryExecuted: false;
        aiProviderRequested: false;
      };
    };
    mockEmptyEventValueRecommendationsFixture: {
      state: string;
      recommendations: readonly unknown[];
      nextAction: string;
    };
    mockPendingEventValueRecommendationsFixture: {
      state: string;
      recommendations: readonly unknown[];
      nextAction: string;
    };
  }>("features/recommendations/event-value-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockEventValueRecommendationService: () => {
      listRecommendedEvents: (input?: {
        profileGoal?: string | null;
        location?: string | null;
        industryPreference?: string | null;
        calendarFit?: string | null;
        scenario?: string | null;
        limit?: number | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockEventValueRecommendationsFixture;
        error?: { code: string; appCode: string };
      };
      acceptRecommendedEvent: (input?: {
        eventId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: {
          state: string;
          acceptedEvent: { eventId: string; title: string };
          action: {
            generatedBy: string;
            externalNetworkRequested: false;
            calendarProviderRequested: false;
            notificationDelivered: false;
          };
        };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/recommendations/mock-event-value-service.ts");

  assert.deepEqual(contract.EVENT_VALUE_RECOMMENDATION_ERROR_CODES, [
    "EVENT_VALUE_RECOMMENDATION_EVENT_ID_REQUIRED",
    "EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND",
    "EVENT_VALUE_RECOMMENDATION_PENDING",
    "EVENT_VALUE_RECOMMENDATION_MOCK_FAILED",
  ]);
  assert.equal(
    contract.EVENT_VALUE_RECOMMENDATION_ERROR_DEFINITIONS
      .EVENT_VALUE_RECOMMENDATION_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.EVENT_VALUE_RECOMMENDATION_ERROR_DEFINITIONS
      .EVENT_VALUE_RECOMMENDATION_MOCK_FAILED.recovery,
    /network|database|AI provider|calendar|email|notification|feed/i,
  );

  assert.equal(contract.mockEventValueRecommendationsFixture.state, "success");
  assert.equal(
    contract.mockEventValueRecommendationsFixture.profile.goal,
    "Find climate operators with buyer urgency",
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.profile.location,
    "Tokyo",
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.recommendations[0].eventId,
    "demo-event-1",
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.recommendations[0].title,
    "Climate operators breakfast",
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.recommendations[0].valueScore,
    94,
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.recommendations[0].factors
      .profileGoal,
    0.35,
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.recommendations[0]
      .calendarAvailabilitySynced,
    false,
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.recommendations[0]
      .liveEventDiscoveryFeedRequested,
    false,
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.provenance.source,
    contract.EVENT_VALUE_RECOMMENDATION_FIXTURE_SOURCE,
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.provenance
      .calendarProviderRequested,
    false,
  );
  assert.equal(
    contract.mockEventValueRecommendationsFixture.provenance
      .liveEventDiscoveryFeedRequested,
    false,
  );
  assert.equal(
    contract.mockEmptyEventValueRecommendationsFixture.state,
    "empty",
  );
  assert.equal(
    contract.mockEmptyEventValueRecommendationsFixture.nextAction,
    "Adjust the local demo profile filters or review event fixtures before recommending events.",
  );
  assert.equal(
    contract.mockPendingEventValueRecommendationsFixture.state,
    "pending",
  );

  const service = serviceModule.createMockEventValueRecommendationService();
  const success = service.listRecommendedEvents();
  const focused = service.listRecommendedEvents({
    profileGoal: "partnership",
    industryPreference: "fintech",
    location: "Tokyo",
    calendarFit: "open",
    limit: 2,
  });
  const empty = service.listRecommendedEvents({ scenario: "empty" });
  const pending = service.listRecommendedEvents({ scenario: "pending" });
  const failure = service.listRecommendedEvents({ scenario: "failure" });
  const accepted = service.acceptRecommendedEvent({
    eventId: "demo-event-1",
  });
  const missingEvent = service.acceptRecommendedEvent({
    eventId: "missing-event",
  });

  assert.equal(success.success, true);
  assert.deepEqual(
    success.data?.recommendations.map((recommendation) => recommendation.eventId),
    ["demo-event-1", "demo-event-2", "demo-event-3"],
  );
  assert.equal(focused.success, true);
  assert.equal(focused.data?.recommendations.length, 2);
  assert.equal(focused.data?.recommendations[0].location, "Tokyo");
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.recommendations.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(
    failure.error?.code,
    "EVENT_VALUE_RECOMMENDATION_MOCK_FAILED",
  );
  assert.equal(accepted.success, true);
  assert.equal(accepted.data?.state, "accepted");
  assert.equal(accepted.data?.acceptedEvent.eventId, "demo-event-1");
  assert.equal(accepted.data?.action.generatedBy, "mock-event-value-service");
  assert.equal(accepted.data?.action.externalNetworkRequested, false);
  assert.equal(accepted.data?.action.calendarProviderRequested, false);
  assert.equal(accepted.data?.action.notificationDelivered, false);
  assert.equal(missingEvent.success, false);
  assert.equal(
    missingEvent.error?.code,
    "EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND",
  );
});

test("mock event value recommendation service is deterministic and has no live provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockEventValueRecommendationService: () => {
      listRecommendedEvents: (input?: {
        profileGoal?: string | null;
        location?: string | null;
        industryPreference?: string | null;
        calendarFit?: string | null;
        scenario?: string | null;
        limit?: number | null;
      }) => unknown;
      acceptRecommendedEvent: (input?: {
        eventId?: string | null;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/recommendations/mock-event-value-service.ts");
  const service = serviceModule.createMockEventValueRecommendationService();

  assert.deepEqual(
    service.listRecommendedEvents(),
    service.listRecommendedEvents(),
  );
  assert.deepEqual(
    service.listRecommendedEvents({
      calendarFit: "open",
      industryPreference: "climate",
      limit: 2,
      location: "Tokyo",
      profileGoal: "operator urgency",
    }),
    service.listRecommendedEvents({
      calendarFit: "open",
      industryPreference: "climate",
      limit: 2,
      location: "Tokyo",
      profileGoal: "operator urgency",
    }),
  );
  assert.deepEqual(
    service.acceptRecommendedEvent({ eventId: "demo-event-1" }),
    service.acceptRecommendedEvent({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.listRecommendedEvents({ scenario: "unknown" }),
    service.listRecommendedEvents(),
  );

  for (const filePath of [
    "features/recommendations/event-value-contract.ts",
    "features/recommendations/mock-event-value-service.ts",
    "app/api/recommendations/events/route.ts",
    "app/api/recommendations/events/[id]/accept/route.ts",
    "features/recommendations/event-value-recommendation-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /OpenAI|Anthropic|Pinecone|Weaviate|Qdrant/);
  }
});

test("event value recommendation API routes return stable envelopes with empty and failure paths", async () => {
  const recommendationsRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/recommendations/events/route.ts");
  const acceptRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/recommendations/events/[id]/accept/route.ts");
  const contract = await importProjectModule<{
    mockEmptyEventValueRecommendationsFixture: unknown;
  }>("features/recommendations/event-value-contract.ts");

  const recommendationsResponse = await recommendationsRoute.GET(
    new Request("https://orbit.local/api/recommendations/events", {
      method: "GET",
    }),
  );
  const acceptedResponse = await acceptRoute.POST(
    new Request(
      "https://orbit.local/api/recommendations/events/demo-event-1/accept",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const emptyResponse = await recommendationsRoute.GET(
    new Request(
      "https://orbit.local/api/recommendations/events?scenario=empty",
      {
        method: "GET",
      },
    ),
  );
  const failureResponse = await recommendationsRoute.GET(
    new Request(
      "https://orbit.local/api/recommendations/events?scenario=failure",
      {
        method: "GET",
      },
    ),
  );
  const missingAcceptResponse = await acceptRoute.POST(
    new Request(
      "https://orbit.local/api/recommendations/events/missing-event/accept",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "missing-event" }),
    },
  );

  assert.equal(recommendationsResponse.status, 200);
  assert.equal(recommendationsResponse.headers.get("cache-control"), "no-store");
  assert.equal(
    recommendationsResponse.headers.get("x-orbit-feature-mode"),
    "mock",
  );
  assert.equal(acceptedResponse.status, 200);
  assert.equal(acceptedResponse.headers.get("cache-control"), "no-store");
  assert.equal(acceptedResponse.headers.get("x-orbit-feature-mode"), "mock");

  const recommendationsEnvelope = (await recommendationsResponse.json()) as {
    success: true;
    data: {
      state: string;
      recommendations: readonly Array<{
        eventId: string;
        title: string;
        valueScore: number;
        calendarAvailabilitySynced: false;
        liveEventDiscoveryFeedRequested: false;
      }>;
      provenance: {
        calendarProviderRequested: false;
        liveEventDiscoveryFeedRequested: false;
      };
    };
  };
  const acceptedEnvelope = (await acceptedResponse.json()) as {
    success: true;
    data: {
      state: string;
      acceptedEvent: { eventId: string; title: string };
      action: {
        externalNetworkRequested: false;
        calendarProviderRequested: false;
        notificationDelivered: false;
      };
    };
  };

  assert.equal(recommendationsEnvelope.success, true);
  assert.equal(recommendationsEnvelope.data.state, "success");
  assert.equal(recommendationsEnvelope.data.recommendations.length, 3);
  assert.equal(
    recommendationsEnvelope.data.recommendations[0].eventId,
    "demo-event-1",
  );
  assert.equal(
    recommendationsEnvelope.data.recommendations[0]
      .calendarAvailabilitySynced,
    false,
  );
  assert.equal(
    recommendationsEnvelope.data.provenance.liveEventDiscoveryFeedRequested,
    false,
  );
  assert.equal(acceptedEnvelope.success, true);
  assert.equal(acceptedEnvelope.data.state, "accepted");
  assert.equal(acceptedEnvelope.data.acceptedEvent.eventId, "demo-event-1");
  assert.equal(acceptedEnvelope.data.action.externalNetworkRequested, false);
  assert.equal(acceptedEnvelope.data.action.calendarProviderRequested, false);
  assert.equal(acceptedEnvelope.data.action.notificationDelivered, false);
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: contract.mockEmptyEventValueRecommendationsFixture,
  });
  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock event value recommendation boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        eventValueRecommendationErrorCode:
          "EVENT_VALUE_RECOMMENDATION_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event value recommendation failure came from deterministic fixture rules.",
        service: "event-value-recommendation-mock",
      },
    },
  });
  assert.equal(missingAcceptResponse.status, 404);
  assert.deepEqual(await missingAcceptResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock event value recommendation fixture matches that event id.",
      context: {
        boundary: "developer-admin",
        eventValueRecommendationErrorCode:
          "EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event value recommendation failure came from deterministic fixture rules.",
        service: "event-value-recommendation-mock",
      },
    },
  });
});

test("event value recommendation dev probe manifest exercises every API path", async () => {
  const debugView = await importProjectModule<{
    EVENT_VALUE_RECOMMENDATION_API_PROBES: readonly Array<{
      label: string;
      method: "GET" | "POST";
      path: string;
      expectedStatus: number;
    }>;
  }>(
    "features/recommendations/event-value-recommendation-mock/debug-view.tsx",
  );
  const recommendationsRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/recommendations/events/route.ts");
  const acceptRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/recommendations/events/[id]/accept/route.ts");

  assert.deepEqual(
    debugView.EVENT_VALUE_RECOMMENDATION_API_PROBES.map((probe) => [
      probe.method,
      probe.path,
      probe.expectedStatus,
    ]),
    [
      ["GET", "/api/recommendations/events", 200],
      ["POST", "/api/recommendations/events/demo-event-1/accept", 200],
      ["GET", "/api/recommendations/events?scenario=empty", 200],
      ["GET", "/api/recommendations/events?scenario=pending", 200],
      ["GET", "/api/recommendations/events?scenario=failure", 503],
      ["POST", "/api/recommendations/events/missing-event/accept", 404],
    ],
  );

  for (const probe of debugView.EVENT_VALUE_RECOMMENDATION_API_PROBES) {
    let response: Response;

    if (probe.method === "GET") {
      response = await recommendationsRoute.GET(
        new Request(`https://orbit.local${probe.path}`, {
          method: probe.method,
        }),
      );
    } else {
      const eventId = probe.path.split("/").at(-2);

      response = await acceptRoute.POST(
        new Request(`https://orbit.local${probe.path}`, {
          method: probe.method,
        }),
        {
          params: Promise.resolve({ id: eventId ?? "" }),
        },
      );
    }

    const envelope = (await response.json()) as {
      success: boolean;
      data?: { state?: string };
      error?: { context?: { eventValueRecommendationErrorCode?: string } };
    };

    assert.equal(response.status, probe.expectedStatus, probe.label);
    assert.equal(typeof envelope.success, "boolean", probe.label);

    if (probe.path.includes("scenario=pending")) {
      assert.equal(envelope.success, true);
      assert.equal(envelope.data?.state, "pending");
    }

    if (probe.path.includes("scenario=failure")) {
      assert.equal(envelope.success, false);
      assert.equal(
        envelope.error?.context?.eventValueRecommendationErrorCode,
        "EVENT_VALUE_RECOMMENDATION_MOCK_FAILED",
      );
    }

    if (probe.path.includes("missing-event")) {
      assert.equal(envelope.success, false);
      assert.equal(
        envelope.error?.context?.eventValueRecommendationErrorCode,
        "EVENT_VALUE_RECOMMENDATION_EVENT_NOT_FOUND",
      );
    }
  }
});

test("event value recommendation debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EVENT_VALUE_RECOMMENDATION_MOCK_SLUG: string;
    EventValueRecommendationMockDemo: () => React.ReactElement;
  }>(
    "features/recommendations/event-value-recommendation-mock/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.EventValueRecommendationMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/recommendations/event-value-recommendation-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EVENT_VALUE_RECOMMENDATION_MOCK_SLUG,
    "event-value-recommendation-mock",
  );
  assert.match(pageSource, /EVENT_VALUE_RECOMMENDATION_MOCK_SLUG/);
  assert.match(pageSource, /EventValueRecommendationMockDemo/);

  assert.match(html, /Event value recommendation mock/);
  assert.match(
    html,
    /aria-label="Event value recommendation operator checkpoint"/,
  );
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /aria-label="Event value recommendation state matrix"/);
  assert.match(html, /Success: 3 event recommendations/);
  assert.match(html, /Empty: no matching events/);
  assert.match(html, /Pending: calendar fit review/);
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /Profile fit signals/);
  assert.match(html, /Ranked event values/);
  assert.match(html, /Accept recommendation action/);
  assert.match(html, /calendar sync false/);
  assert.match(html, /event discovery feed false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Climate operators breakfast/);
  assert.match(html, /buyer urgency/);
  assert.match(html, /EVENT_VALUE_RECOMMENDATION_MOCK_FAILED/);
  assert.match(html, /GET \/api\/recommendations\/events/);
  assert.match(
    html,
    /POST \/api\/recommendations\/events\/demo-event-1\/accept/,
  );
  assert.match(html, /Pending recommendations/);
  assert.match(html, /GET \/api\/recommendations\/events\?scenario=pending/);
  assert.match(html, /Missing event/);
  assert.match(html, /POST \/api\/recommendations\/events\/missing-event\/accept/);
  assert.match(html, /Expected status: 404/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EVENT_VALUE_RECOMMENDATION_PROVIDER/);
  assert.match(html, /event-value-workbench/);
  assert.match(
    html,
    /\.event-value-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/recommendations\/event-value-recommendation-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/recommendations\/event-value-recommendation-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_EVENT_VALUE_RECOMMENDATION_PROVIDER/);
  assert.match(liveDoc, /calendar availability provider/);
  assert.match(liveDoc, /event discovery feed provider/);
  assert.match(liveDoc, /required environment variables/);
  assert.match(liveDoc, /permissions/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
