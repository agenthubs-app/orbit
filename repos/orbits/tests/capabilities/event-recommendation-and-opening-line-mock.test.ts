/**
 * 活动推荐与 opening line mock 的契约测试。
 *
 * 锁住推荐联系人、匹配信号、开场白生成和确认前边界。
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
    `${pathFromRoot} must exist for the event recommendation and opening-line mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("event recommendation contract exposes ranked attendees signals opening lines fixtures and errors", async () => {
  const contract = await importProjectModule<{
    EVENT_RECOMMENDATION_ERROR_CODES: readonly string[];
    EVENT_RECOMMENDATION_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    EVENT_RECOMMENDATION_FIXTURE_SOURCE: string;
    mockEventRecommendationsFixture: {
      state: string;
      event: { id: string; title: string; venue: string };
      recommendations: readonly Array<{
        recommendationId: string;
        attendee: { attendeeId: string; displayName: string };
        rank: number;
        score: number;
        reasons: readonly string[];
        matchSignals: readonly Array<{
          signalId: string;
          label: string;
          weight: number;
          vectorSearchExecuted: false;
          aiProviderRequested: false;
        }>;
        openingLine: {
          text: string;
          generatedBy: string;
          aiProviderRequested: false;
        };
        vectorSearchExecuted: false;
        rankingProviderRequested: false;
        aiProviderRequested: false;
      }>;
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        generationMethod: string;
        aiProviderRequested: false;
        vectorSearchExecuted: false;
      };
    };
    mockEmptyEventRecommendationsFixture: {
      state: string;
      recommendations: readonly unknown[];
      nextAction: string;
    };
    mockPendingEventRecommendationsFixture: {
      state: string;
      recommendations: readonly unknown[];
      nextAction: string;
    };
    mockOpeningLineFixture: {
      state: string;
      recommendation: { attendee: { attendeeId: string } };
      openingLine: { text: string; evidenceIds: readonly string[] };
      provenance: { generationMethod: string };
    };
  }>("features/recommendations/contract.ts");
  const serviceModule = await importProjectModule<{
    createMockEventRecommendationService: () => {
      listEventRecommendations: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        limit?: number | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockEventRecommendationsFixture;
        error?: { code: string; appCode: string };
      };
      composeOpeningLine: (input?: {
        eventId?: string | null;
        attendeeId?: string | null;
        scenario?: string | null;
        style?: string | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockOpeningLineFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/recommendations/mock-service.ts");

  assert.deepEqual(contract.EVENT_RECOMMENDATION_ERROR_CODES, [
    "EVENT_RECOMMENDATION_EVENT_ID_REQUIRED",
    "EVENT_RECOMMENDATION_EVENT_NOT_FOUND",
    "EVENT_RECOMMENDATION_ATTENDEE_NOT_FOUND",
    "EVENT_RECOMMENDATION_PENDING",
    "EVENT_RECOMMENDATION_MOCK_FAILED",
  ]);
  assert.equal(
    contract.EVENT_RECOMMENDATION_ERROR_DEFINITIONS
      .EVENT_RECOMMENDATION_MOCK_FAILED.appCode,
    "SERVICE_UNAVAILABLE",
  );
  assert.match(
    contract.EVENT_RECOMMENDATION_ERROR_DEFINITIONS
      .EVENT_RECOMMENDATION_MOCK_FAILED.recovery,
    /network|database|model|calendar|email|notification/i,
  );

  assert.equal(contract.mockEventRecommendationsFixture.state, "success");
  assert.equal(contract.mockEventRecommendationsFixture.event.id, "demo-event-1");
  assert.equal(
    contract.mockEventRecommendationsFixture.event.title,
    "Climate founders dinner",
  );
  assert.deepEqual(
    contract.mockEventRecommendationsFixture.recommendations.map(
      (recommendation) => recommendation.recommendationId,
    ),
    [
      "event-rec:demo-event-1:mina-park",
      "event-rec:demo-event-1:leo-grant",
      "event-rec:demo-event-1:sam-rivera",
    ],
  );
  assert.deepEqual(
    contract.mockEventRecommendationsFixture.recommendations.map(
      (recommendation) => recommendation.rank,
    ),
    [1, 2, 3],
  );
  assert.equal(
    contract.mockEventRecommendationsFixture.recommendations[0].attendee
      .displayName,
    "Mina Park",
  );
  assert.equal(
    contract.mockEventRecommendationsFixture.recommendations[0].openingLine
      .aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockEventRecommendationsFixture.recommendations[0].matchSignals[0]
      .vectorSearchExecuted,
    false,
  );
  assert.equal(
    contract.mockEventRecommendationsFixture.recommendations[0]
      .rankingProviderRequested,
    false,
  );
  assert.equal(
    contract.mockEventRecommendationsFixture.provenance.source,
    contract.EVENT_RECOMMENDATION_FIXTURE_SOURCE,
  );
  assert.equal(
    contract.mockEventRecommendationsFixture.provenance.aiProviderRequested,
    false,
  );
  assert.equal(
    contract.mockEventRecommendationsFixture.provenance.vectorSearchExecuted,
    false,
  );
  assert.equal(contract.mockEmptyEventRecommendationsFixture.state, "empty");
  assert.equal(
    contract.mockEmptyEventRecommendationsFixture.nextAction,
    "Import or review local event attendees before asking for recommendations.",
  );
  assert.equal(contract.mockPendingEventRecommendationsFixture.state, "pending");
  assert.equal(contract.mockOpeningLineFixture.state, "success");
  assert.equal(
    contract.mockOpeningLineFixture.openingLine.text,
    "Mina, your storage pilot work came up in the climate dinner context. I would like to compare notes on operator rollout blockers.",
  );
  assert.equal(
    contract.mockOpeningLineFixture.provenance.generationMethod,
    "rule-based-opening-line",
  );

  const service = serviceModule.createMockEventRecommendationService();
  const success = service.listEventRecommendations({ eventId: "demo-event-1" });
  const limited = service.listEventRecommendations({
    eventId: "demo-event-1",
    limit: 2,
  });
  const empty = service.listEventRecommendations({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pending = service.listEventRecommendations({
    eventId: "demo-event-1",
    scenario: "pending",
  });
  const failure = service.listEventRecommendations({
    eventId: "demo-event-1",
    scenario: "failure",
  });
  const missingEvent = service.listEventRecommendations({
    eventId: "missing-event",
  });
  const openingLine = service.composeOpeningLine({
    eventId: "demo-event-1",
    attendeeId: "attendee:mina-park",
  });
  const alternativeOpeningLine = service.composeOpeningLine({
    eventId: "demo-event-1",
    attendeeId: "attendee:leo-grant",
    style: "context_question",
  });
  const missingAttendee = service.composeOpeningLine({
    eventId: "demo-event-1",
    attendeeId: "attendee:unknown",
  });

  assert.equal(success.success, true);
  assert.equal(success.data?.recommendations.length, 3);
  assert.equal(limited.success, true);
  assert.equal(limited.data?.recommendations.length, 2);
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.recommendations.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "EVENT_RECOMMENDATION_MOCK_FAILED");
  assert.equal(missingEvent.success, false);
  assert.equal(missingEvent.error?.code, "EVENT_RECOMMENDATION_EVENT_NOT_FOUND");
  assert.equal(openingLine.success, true);
  assert.equal(
    openingLine.data?.openingLine.generatedBy,
    "mock-opening-line-rule",
  );
  assert.equal(openingLine.data?.openingLine.aiProviderRequested, false);
  assert.equal(alternativeOpeningLine.success, true);
  assert.match(alternativeOpeningLine.data?.openingLine.text ?? "", /Leo/);
  assert.equal(missingAttendee.success, false);
  assert.equal(
    missingAttendee.error?.code,
    "EVENT_RECOMMENDATION_ATTENDEE_NOT_FOUND",
  );
});

test("mock event recommendation service is deterministic rule-based code with no live provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockEventRecommendationService: () => {
      listEventRecommendations: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        limit?: number | null;
      }) => unknown;
      composeOpeningLine: (input?: {
        eventId?: string | null;
        attendeeId?: string | null;
        scenario?: string | null;
        style?: string | null;
      }) => unknown;
    };
  }>("features/recommendations/mock-service.ts");
  const service = serviceModule.createMockEventRecommendationService();

  assert.deepEqual(
    service.listEventRecommendations({ eventId: "demo-event-1" }),
    service.listEventRecommendations({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.listEventRecommendations({ eventId: "demo-event-1", limit: 2 }),
    service.listEventRecommendations({ eventId: "demo-event-1", limit: 2 }),
  );
  assert.deepEqual(
    service.composeOpeningLine({
      attendeeId: "attendee:mina-park",
      eventId: "demo-event-1",
    }),
    service.composeOpeningLine({
      attendeeId: "attendee:mina-park",
      eventId: "demo-event-1",
    }),
  );
  assert.deepEqual(
    service.listEventRecommendations({
      eventId: "demo-event-1",
      scenario: "unknown",
    }),
    service.listEventRecommendations({ eventId: "demo-event-1" }),
  );

  for (const filePath of [
    "features/recommendations/contract.ts",
    "features/recommendations/fixtures.ts",
    "features/recommendations/service.ts",
    "features/recommendations/mock-service.ts",
    "app/api/recommendations/event/[id]/route.ts",
    "app/api/recommendations/event/[id]/opening-line/route.ts",
    "features/recommendations/event-recommendation-and-opening-line-mock/debug-view.tsx",
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

test("event recommendation API routes return stable envelopes with empty and failure paths", async () => {
  const recommendationsRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/recommendations/event/[id]/route.ts");
  const openingLineRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/recommendations/event/[id]/opening-line/route.ts");
  const contract = await importProjectModule<{
    mockEmptyEventRecommendationsFixture: unknown;
  }>("features/recommendations/contract.ts");

  const recommendationsResponse = await recommendationsRoute.GET(
    new Request("https://orbit.local/api/recommendations/event/demo-event-1", {
      method: "GET",
    }),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const openingLineResponse = await openingLineRoute.POST(
    new Request(
      "https://orbit.local/api/recommendations/event/demo-event-1/opening-line",
      {
        body: JSON.stringify({ attendeeId: "attendee:mina-park" }),
        headers: {
          "content-type": "application/json",
        },
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const emptyRecommendationsResponse = await recommendationsRoute.GET(
    new Request(
      "https://orbit.local/api/recommendations/event/demo-event-1?scenario=empty",
      {
        method: "GET",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const failureOpeningLineResponse = await openingLineRoute.POST(
    new Request(
      "https://orbit.local/api/recommendations/event/demo-event-1/opening-line?scenario=failure",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const missingEventResponse = await recommendationsRoute.GET(
    new Request("https://orbit.local/api/recommendations/event/missing-event", {
      method: "GET",
    }),
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
  assert.equal(openingLineResponse.status, 200);
  assert.equal(openingLineResponse.headers.get("cache-control"), "no-store");
  assert.equal(openingLineResponse.headers.get("x-orbit-feature-mode"), "mock");

  const recommendationsEnvelope = (await recommendationsResponse.json()) as {
    success: true;
    data: {
      state: string;
      event: { id: string; title: string };
      recommendations: readonly Array<{
        attendee: { attendeeId: string; displayName: string };
        score: number;
        openingLine: { aiProviderRequested: false };
      }>;
      provenance: { vectorSearchExecuted: false };
    };
  };
  const openingLineEnvelope = (await openingLineResponse.json()) as {
    success: true;
    data: {
      state: string;
      recommendation: {
        attendee: { attendeeId: string; displayName: string };
      };
      openingLine: {
        text: string;
        aiProviderRequested: false;
        externalNetworkRequested: false;
      };
    };
  };

  assert.equal(recommendationsEnvelope.success, true);
  assert.equal(recommendationsEnvelope.data.state, "success");
  assert.equal(recommendationsEnvelope.data.event.id, "demo-event-1");
  assert.equal(recommendationsEnvelope.data.recommendations.length, 3);
  assert.equal(
    recommendationsEnvelope.data.recommendations[0].attendee.displayName,
    "Mina Park",
  );
  assert.equal(
    recommendationsEnvelope.data.recommendations[0].openingLine
      .aiProviderRequested,
    false,
  );
  assert.equal(
    recommendationsEnvelope.data.provenance.vectorSearchExecuted,
    false,
  );
  assert.equal(openingLineEnvelope.success, true);
  assert.equal(openingLineEnvelope.data.state, "success");
  assert.equal(
    openingLineEnvelope.data.recommendation.attendee.attendeeId,
    "attendee:mina-park",
  );
  assert.match(openingLineEnvelope.data.openingLine.text, /Mina/);
  assert.equal(openingLineEnvelope.data.openingLine.aiProviderRequested, false);
  assert.equal(
    openingLineEnvelope.data.openingLine.externalNetworkRequested,
    false,
  );
  assert.equal(emptyRecommendationsResponse.status, 200);
  assert.deepEqual(await emptyRecommendationsResponse.json(), {
    success: true,
    data: contract.mockEmptyEventRecommendationsFixture,
  });
  assert.equal(failureOpeningLineResponse.status, 503);
  assert.deepEqual(await failureOpeningLineResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock event recommendation and opening-line boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        eventRecommendationErrorCode: "EVENT_RECOMMENDATION_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event recommendation and opening-line failure came from deterministic fixture rules.",
        service: "event-recommendation-and-opening-line-mock",
      },
    },
  });
  assert.equal(missingEventResponse.status, 404);
  assert.deepEqual(await missingEventResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock event recommendation fixture matches that event id.",
      context: {
        boundary: "developer-admin",
        eventRecommendationErrorCode: "EVENT_RECOMMENDATION_EVENT_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event recommendation and opening-line failure came from deterministic fixture rules.",
        service: "event-recommendation-and-opening-line-mock",
      },
    },
  });
});

test("event recommendation debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EVENT_RECOMMENDATION_OPENING_LINE_MOCK_SLUG: string;
    EventRecommendationOpeningLineMockDemo: () => React.ReactElement;
  }>(
    "features/recommendations/event-recommendation-and-opening-line-mock/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.EventRecommendationOpeningLineMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/recommendations/event-recommendation-and-opening-line-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EVENT_RECOMMENDATION_OPENING_LINE_MOCK_SLUG,
    "event-recommendation-and-opening-line-mock",
  );
  assert.match(pageSource, /EVENT_RECOMMENDATION_OPENING_LINE_MOCK_SLUG/);
  assert.match(pageSource, /EventRecommendationOpeningLineMockDemo/);

  assert.match(html, /Event recommendation and opening-line mock/);
  assert.match(
    html,
    /aria-label="Event recommendation operator checkpoint"/,
  );
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /aria-label="Event recommendation state matrix"/);
  assert.match(html, /Success: 3 ranked attendees/);
  assert.match(html, /Empty: no attendees ready/);
  assert.match(html, /Pending: recommendations paused/);
  assert.match(html, /Failure: controlled error/);
  assert.match(html, /Ranked recommendations/);
  assert.match(html, /Match signals/);
  assert.match(html, /Opening-line composer/);
  assert.match(html, /vector search false/);
  assert.match(html, /model calls false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Mina Park/);
  assert.match(html, /Storage pilot work/);
  assert.match(html, /EVENT_RECOMMENDATION_MOCK_FAILED/);
  assert.match(html, /GET \/api\/recommendations\/event\/demo-event-1/);
  assert.match(
    html,
    /POST \/api\/recommendations\/event\/demo-event-1\/opening-line/,
  );
  assert.match(html, /Missing event/);
  assert.match(html, /GET \/api\/recommendations\/event\/missing-event/);
  assert.match(html, /Expected status: 404/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EVENT_RECOMMENDATION_PROVIDER/);
  assert.match(html, /event-recommendation-workbench/);
  assert.match(
    html,
    /\.event-recommendation-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/recommendations\/event-recommendation-and-opening-line-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/recommendations\/event-recommendation-and-opening-line-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_EVENT_RECOMMENDATION_PROVIDER/);
  assert.match(liveDoc, /ranking provider/);
  assert.match(liveDoc, /opening-line generation provider/);
  assert.match(liveDoc, /required environment variables/);
  assert.match(liveDoc, /permissions/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
