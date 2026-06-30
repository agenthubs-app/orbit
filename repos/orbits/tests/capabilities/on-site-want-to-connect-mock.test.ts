/**
 * 现场 want-to-connect mock 的契约测试。
 *
 * 验证匹配、意图记录、match notice 和无外部副作用边界。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as eventsWantConnectFixtures from "../../features/events/want-connect-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the on-site want-to-connect mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("on-site want-to-connect contract exposes intent mutual-interest match success fixtures and errors", async () => {
  const contract = await importProjectModule<{
    WANT_CONNECT_ERROR_CODES: readonly string[];
    WANT_CONNECT_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    WANT_CONNECT_FIXTURE_SOURCE: string;
    mockWantConnectFixture: {
      state: string;
      intent: {
        eventId: string;
        actorContactId: string;
        targetContactId: string;
        status: string;
        realtimePresenceRequested: false;
        peerNotificationDelivered: false;
        externalMessageSent: false;
      };
      mutualInterest: {
        state: string;
        actorWantsToConnect: true;
        targetWantsToConnect: true;
        rule: string;
      };
      matchNotice: {
        state: string;
        title: string;
        message: string;
        nextAction: string;
        notificationProviderRequested: false;
        externalMessageSent: false;
      };
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        generationMethod: string;
        realtimePresenceRequested: false;
        peerNotificationDelivered: false;
        externalMessageSent: false;
      };
    };
    mockEmptyWantConnectFixture: {
      state: string;
      intent: null;
      mutualInterest: { state: string };
      matchNotice: null;
      nextAction: string;
    };
    mockPendingWantConnectFixture: {
      state: string;
      mutualInterest: { state: string };
      matchNotice: null;
    };
    mockWantConnectMatchesFixture: {
      state: string;
      matches: readonly Array<{
        matchId: string;
        eventId: string;
        participantContactIds: readonly string[];
        successNotice: { title: string; state: string };
        realtimePresenceRequested: false;
        peerNotificationDelivered: false;
        externalMessageSent: false;
      }>;
    };
  }>("features/events/want-connect-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockWantConnectService: () => {
      createWantToConnectIntent: (input?: {
        eventId?: string | null;
        targetContactId?: string | null;
        actorContactId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof eventsWantConnectFixtures.mockWantConnectFixture;
        error?: { code: string; appCode: string };
      };
      listMatches: (input?: {
        eventId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof eventsWantConnectFixtures.mockWantConnectMatchesFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/events/mock-want-connect-service.ts");

  const service = serviceModule.createMockWantConnectService();
  const success = service.createWantToConnectIntent({
    eventId: "demo-event-1",
    targetContactId: "contact:priya-shah",
  });
  const matches = service.listMatches({ eventId: "demo-event-1" });
  const empty = service.listMatches({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pending = service.createWantToConnectIntent({
    eventId: "demo-event-1",
    targetContactId: "contact:aiko-mori",
    scenario: "pending",
  });
  const failure = service.createWantToConnectIntent({
    eventId: "demo-event-1",
    targetContactId: "contact:priya-shah",
    scenario: "failure",
  });
  const missingTarget = service.createWantToConnectIntent({
    eventId: "demo-event-1",
    targetContactId: "",
  });
  const missingEvent = service.listMatches({ eventId: "missing-event" });

  assert.deepEqual(contract.WANT_CONNECT_ERROR_CODES, [
    "WANT_CONNECT_EVENT_ID_REQUIRED",
    "WANT_CONNECT_EVENT_NOT_FOUND",
    "WANT_CONNECT_TARGET_REQUIRED",
    "WANT_CONNECT_PENDING",
    "WANT_CONNECT_MOCK_FAILED",
  ]);
  assert.equal(
    contract.WANT_CONNECT_ERROR_DEFINITIONS.WANT_CONNECT_EVENT_NOT_FOUND
      .appCode,
    "NOT_FOUND",
  );
  assert.match(
    contract.WANT_CONNECT_ERROR_DEFINITIONS.WANT_CONNECT_MOCK_FAILED.recovery,
    /real-time presence|peer notifications|external messaging/i,
  );

  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.intent.eventId, "demo-event-1");
  assert.equal(success.data?.intent.targetContactId, "contact:priya-shah");
  assert.equal(success.data?.intent.realtimePresenceRequested, false);
  assert.equal(success.data?.intent.peerNotificationDelivered, false);
  assert.equal(success.data?.intent.externalMessageSent, false);
  assert.equal(success.data?.mutualInterest.state, "mutual");
  assert.equal(success.data?.mutualInterest.actorWantsToConnect, true);
  assert.equal(success.data?.mutualInterest.targetWantsToConnect, true);
  assert.equal(success.data?.matchNotice.state, "ready");
  assert.equal(success.data?.matchNotice.notificationProviderRequested, false);
  assert.equal(success.data?.matchNotice.externalMessageSent, false);
  assert.equal(
    success.data?.provenance.source,
    eventsWantConnectFixtures.WANT_CONNECT_FIXTURE_SOURCE,
  );
  assert.equal(success.data?.provenance.realtimePresenceRequested, false);
  assert.equal(success.data?.provenance.peerNotificationDelivered, false);
  assert.equal(success.data?.provenance.externalMessageSent, false);

  assert.equal(matches.success, true);
  assert.equal(matches.data?.state, "success");
  assert.equal(matches.data?.matches.length, 1);
  assert.deepEqual(matches.data?.matches[0]?.participantContactIds, [
    "contact:operator",
    "contact:priya-shah",
  ]);
  assert.equal(
    matches.data?.matches[0]?.successNotice.title,
    "Mutual interest confirmed",
  );
  assert.equal(matches.data?.matches[0]?.realtimePresenceRequested, false);
  assert.equal(matches.data?.matches[0]?.peerNotificationDelivered, false);
  assert.equal(matches.data?.matches[0]?.externalMessageSent, false);

  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.matches.length, 0);
  assert.equal(
    eventsWantConnectFixtures.mockEmptyWantConnectFixture.nextAction,
    "Wait for a deterministic mutual-interest fixture before showing a match success notice.",
  );
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.matchNotice, null);
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "WANT_CONNECT_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missingTarget.success, false);
  assert.equal(missingTarget.error?.code, "WANT_CONNECT_TARGET_REQUIRED");
  assert.equal(missingEvent.success, false);
  assert.equal(missingEvent.error?.code, "WANT_CONNECT_EVENT_NOT_FOUND");
});

test("mock want-to-connect service is deterministic rule-based code with no live provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockWantConnectService: () => {
      createWantToConnectIntent: (input?: {
        eventId?: string | null;
        targetContactId?: string | null;
        actorContactId?: string | null;
        scenario?: string | null;
      }) => unknown;
      listMatches: (input?: {
        eventId?: string | null;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/events/mock-want-connect-service.ts");
  const service = serviceModule.createMockWantConnectService();
  const input = {
    eventId: "demo-event-1",
    targetContactId: "contact:priya-shah",
  };

  assert.deepEqual(
    service.createWantToConnectIntent(input),
    service.createWantToConnectIntent(input),
  );
  assert.deepEqual(
    service.listMatches({ eventId: "demo-event-1" }),
    service.listMatches({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.createWantToConnectIntent({
      ...input,
      scenario: "unknown-scenario",
    }),
    service.createWantToConnectIntent(input),
  );

  for (const filePath of [
    "features/events/want-connect-contract.ts",
    "features/events/mock-want-connect-service.ts",
    "app/api/events/[id]/want-to-connect/route.ts",
    "app/api/events/[id]/matches/route.ts",
    "features/events/on-site-want-to-connect-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("on-site want-to-connect API routes return stable envelopes with empty and failure paths", async () => {
  const intentRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/want-to-connect/route.ts");
  const matchesRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/matches/route.ts");
  const fixtures = await importProjectModule<{
    mockWantConnectFixture: unknown;
    mockEmptyWantConnectMatchesFixture: unknown;
  }>("features/events/want-connect-fixtures.ts");

  const intentResponse = await intentRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/want-to-connect",
      {
        body: JSON.stringify({ targetContactId: "contact:priya-shah" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const matchesResponse = await matchesRoute.GET(
    new Request("https://orbit.local/api/events/demo-event-1/matches", {
      method: "GET",
    }),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const emptyMatchesResponse = await matchesRoute.GET(
    new Request(
      "https://orbit.local/api/events/demo-event-1/matches?scenario=empty",
      {
        method: "GET",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const failureIntentResponse = await intentRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/want-to-connect?scenario=failure",
      {
        body: JSON.stringify({ targetContactId: "contact:priya-shah" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );

  assert.equal(intentResponse.status, 200);
  assert.equal(intentResponse.headers.get("cache-control"), "no-store");
  assert.equal(intentResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await intentResponse.json(), {
    success: true,
    data: fixtures.mockWantConnectFixture,
  });

  assert.equal(matchesResponse.status, 200);
  assert.equal(matchesResponse.headers.get("cache-control"), "no-store");
  assert.equal(matchesResponse.headers.get("x-orbit-feature-mode"), "mock");
  const matchesEnvelope = (await matchesResponse.json()) as {
    success: true;
    data: {
      state: string;
      matches: readonly Array<{
        matchId: string;
        successNotice: { message: string };
      }>;
    };
  };
  assert.equal(matchesEnvelope.success, true);
  assert.equal(matchesEnvelope.data.state, "success");
  assert.equal(matchesEnvelope.data.matches.length, 1);
  assert.match(
    matchesEnvelope.data.matches[0]?.successNotice.message ?? "",
    /Priya Shah/,
  );

  assert.equal(emptyMatchesResponse.status, 200);
  assert.deepEqual(await emptyMatchesResponse.json(), {
    success: true,
    data: fixtures.mockEmptyWantConnectMatchesFixture,
  });

  assert.equal(failureIntentResponse.status, 503);
  assert.deepEqual(await failureIntentResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock on-site want-to-connect boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock on-site want-to-connect failure came from deterministic fixture rules.",
        service: "on-site-want-to-connect-mock",
        wantConnectErrorCode: "WANT_CONNECT_MOCK_FAILED",
      },
    },
  });
});

test("on-site want-to-connect debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    ON_SITE_WANT_TO_CONNECT_MOCK_SLUG: string;
    OnSiteWantToConnectMockDemo: () => React.ReactElement;
  }>("features/events/on-site-want-to-connect-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.OnSiteWantToConnectMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/events/on-site-want-to-connect-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.ON_SITE_WANT_TO_CONNECT_MOCK_SLUG,
    "on-site-want-to-connect-mock",
  );
  assert.match(pageSource, /ON_SITE_WANT_TO_CONNECT_MOCK_SLUG/);
  assert.match(pageSource, /OnSiteWantToConnectMockDemo/);

  assert.match(html, /On-site want-to-connect mock/);
  assert.match(html, /aria-label="On-site want-to-connect operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /aria-label="On-site want-to-connect state comparison"/);
  assert.match(html, /Compare success, empty, pending, and failure outcomes/);
  assert.match(html, /Ready notice/);
  assert.match(html, /No match yet/);
  assert.match(html, /Waiting on target/);
  assert.match(html, /Controlled failure/);
  assert.match(html, /Mutual interest/);
  assert.match(html, /Match success notice/);
  assert.match(html, /real-time presence false/);
  assert.match(html, /peer notifications false/);
  assert.match(html, /external messaging false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Priya Shah/);
  assert.match(html, /Aiko Mori/);
  assert.match(html, /WANT_CONNECT_MOCK_FAILED/);
  assert.match(html, /POST \/api\/events\/demo-event-1\/want-to-connect/);
  assert.match(html, /GET \/api\/events\/demo-event-1\/matches/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_WANT_CONNECT_PROVIDER/);
  assert.match(html, /on-site-want-connect-workbench/);
  assert.match(
    html,
    /\.on-site-want-connect-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/events\/on-site-want-to-connect-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/events\/on-site-want-to-connect-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_WANT_CONNECT_PROVIDER/);
  assert.match(liveDoc, /real-time presence/i);
  assert.match(liveDoc, /peer notification/i);
  assert.match(liveDoc, /external messaging/i);
  assert.match(liveDoc, /required environment variables/i);
  assert.match(liveDoc, /permissions/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(liveDoc, /replacement tests/i);
});
