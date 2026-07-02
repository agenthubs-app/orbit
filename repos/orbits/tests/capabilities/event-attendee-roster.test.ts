/**
 * 活动参会者名单 mock 的契约测试。
 *
 * 锁住 roster payload、推荐候选、import 结果和受控失败路径。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as acquisitionEventAttendeeFixtures from "../../features/acquisition/event-attendee-fixtures";
import * as eventsAttendeeFixtures from "../../features/events/attendee-roster/fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the event attendee roster mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("event attendee roster contract exposes tags known-contact markers recommendation pool and errors", async () => {
  const contract = await importProjectModule<{
    EVENT_ATTENDEE_ROSTER_ERROR_CODES: readonly string[];
    EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    EVENT_ATTENDEE_ROSTER_FIXTURE_SOURCE: string;
    mockEventAttendeeRosterFixture: {
      state: string;
      attendees: readonly Array<{
        attendeeId: string;
        displayName: string;
        attendeeTags: readonly Array<{ code: string; label: string }>;
        knownContactMarker: {
          isKnownContact: boolean;
          contactId: string | null;
          matchSource: string;
        };
        eligibleRecommendation: {
          isEligible: boolean;
          recommendationCandidateId: string | null;
          reasons: readonly string[];
        };
        organizerFeedRequested: false;
        externalLookupExecuted: false;
        databaseWriteExecuted: false;
        aiProviderRequested: false;
      }>;
      knownContactMarkers: readonly Array<{
        attendeeId: string;
        isKnownContact: boolean;
        contactId: string | null;
      }>;
      eligibleRecommendationPool: readonly Array<{
        attendeeId: string;
        recommendationCandidateId: string;
      }>;
      provenance: { source: string; evidenceIds: readonly string[] };
    };
    mockEmptyEventAttendeeRosterFixture: {
      state: string;
      attendees: readonly unknown[];
      eligibleRecommendationPool: readonly unknown[];
      nextAction: string;
    };
    mockEventAttendeeRosterImportFixture: {
      state: string;
      importBatch: {
        id: string;
        recommendationCandidateIds: readonly string[];
        organizerFeedRequested: false;
        liveDatabaseWriteExecuted: false;
      };
    };
  }>("features/events/attendee-roster/contract.ts");
  const serviceModule = await importProjectModule<{
    createMockEventAttendeeRosterService: () => {
      getAttendeeRoster: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        tagFilter?: string | null;
        eligibleOnly?: boolean;
      }) => {
        success: boolean;
        data?: typeof acquisitionEventAttendeeFixtures.mockEventAttendeeRosterFixture;
        error?: { code: string; appCode: string };
      };
      importAttendeeRoster: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        tagFilter?: string | null;
        eligibleOnly?: boolean;
      }) => {
        success: boolean;
        data?: typeof eventsAttendeeFixtures.mockEventAttendeeRosterImportFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/events/attendee-roster/mock-service.ts");

  const service = serviceModule.createMockEventAttendeeRosterService();
  const roster = service.getAttendeeRoster({ eventId: "demo-event-1" });
  const filtered = service.getAttendeeRoster({
    eventId: "demo-event-1",
    tagFilter: "storage_pilot",
  });
  const eligibleOnly = service.getAttendeeRoster({
    eventId: "demo-event-1",
    eligibleOnly: true,
  });
  const importResult = service.importAttendeeRoster({
    eventId: "demo-event-1",
  });
  const empty = service.importAttendeeRoster({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pending = service.getAttendeeRoster({
    eventId: "demo-event-1",
    scenario: "pending",
  });
  const failure = service.getAttendeeRoster({
    eventId: "demo-event-1",
    scenario: "failure",
  });
  const missingEvent = service.getAttendeeRoster({ eventId: "missing-event" });

  assert.deepEqual(contract.EVENT_ATTENDEE_ROSTER_ERROR_CODES, [
    "EVENT_ATTENDEE_ROSTER_EVENT_ID_REQUIRED",
    "EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND",
    "EVENT_ATTENDEE_ROSTER_ACCESS_PENDING",
    "EVENT_ATTENDEE_ROSTER_MOCK_FAILED",
    "EVENT_ATTENDEE_ROSTER_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS
      .EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND.appCode,
    "NOT_FOUND",
  );
  assert.match(
    contract.EVENT_ATTENDEE_ROSTER_ERROR_DEFINITIONS
      .EVENT_ATTENDEE_ROSTER_MOCK_FAILED.recovery,
    /organizer|database|AI|calendar|email|notification/i,
  );

  assert.equal(roster.success, true);
  assert.equal(roster.data?.state, "success");
  assert.equal(roster.data?.attendees.length, 3);
  assert.equal(roster.data?.attendees[0]?.attendeeId, "attendee:demo-1");
  assert.deepEqual(
    roster.data?.attendees[0]?.attendeeTags.map((tag) => tag.code),
    ["climate_operator", "partner_path"],
  );
  assert.equal(
    roster.data?.attendees[1]?.knownContactMarker.isKnownContact,
    true,
  );
  assert.equal(
    roster.data?.attendees[1]?.knownContactMarker.contactId,
    "contact:luis-ortega",
  );
  assert.equal(
    roster.data?.attendees[1]?.knownContactMarker.matchSource,
    "existing-contact-fixture",
  );
  assert.deepEqual(
    roster.data?.eligibleRecommendationPool.map(
      (candidate) => candidate.recommendationCandidateId,
    ),
    [
      "recommendation-candidate:attendee-demo-1",
      "recommendation-candidate:attendee-demo-3",
    ],
  );
  assert.equal(roster.data?.attendees[0]?.organizerFeedRequested, false);
  assert.equal(roster.data?.attendees[0]?.externalLookupExecuted, false);
  assert.equal(roster.data?.attendees[0]?.databaseWriteExecuted, false);
  assert.equal(roster.data?.attendees[0]?.aiProviderRequested, false);
  assert.equal(
    roster.data?.provenance.source,
    eventsAttendeeFixtures.EVENT_ATTENDEE_ROSTER_FIXTURE_SOURCE,
  );

  assert.equal(filtered.success, true);
  assert.deepEqual(
    filtered.data?.attendees.map((attendee) => attendee.displayName),
    ["Priya Shah"],
  );
  assert.equal(eligibleOnly.success, true);
  assert.deepEqual(
    eligibleOnly.data?.attendees.map((attendee) => attendee.attendeeId),
    ["attendee:demo-1", "attendee:demo-3"],
  );

  assert.equal(importResult.success, true);
  assert.equal(importResult.data?.state, "success");
  assert.deepEqual(importResult.data?.importBatch.recommendationCandidateIds, [
    "recommendation-candidate:attendee-demo-1",
    "recommendation-candidate:attendee-demo-3",
  ]);
  assert.equal(importResult.data?.importBatch.organizerFeedRequested, false);
  assert.equal(importResult.data?.importBatch.liveDatabaseWriteExecuted, false);

  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.eligibleRecommendationPool.length, 0);
  assert.equal(
    eventsAttendeeFixtures.mockEmptyEventAttendeeRosterFixture.nextAction,
    "Wait for a privacy-approved local roster fixture before recommending attendees.",
  );
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "EVENT_ATTENDEE_ROSTER_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missingEvent.success, false);
  assert.equal(missingEvent.error?.code, "EVENT_ATTENDEE_ROSTER_EVENT_NOT_FOUND");
});

test("mock event attendee roster service is deterministic rule-based code with no live provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockEventAttendeeRosterService: () => {
      getAttendeeRoster: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        tagFilter?: string | null;
      }) => unknown;
      importAttendeeRoster: (input?: {
        eventId?: string | null;
        scenario?: string | null;
        tagFilter?: string | null;
      }) => unknown;
    };
  }>("features/events/attendee-roster/mock-service.ts");
  const service = serviceModule.createMockEventAttendeeRosterService();
  const input = {
    eventId: "demo-event-1",
    tagFilter: "climate_operator",
  };

  assert.deepEqual(
    service.getAttendeeRoster({ eventId: "demo-event-1" }),
    service.getAttendeeRoster({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.importAttendeeRoster({ eventId: "demo-event-1" }),
    service.importAttendeeRoster({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.getAttendeeRoster({
      eventId: "demo-event-1",
      scenario: "unknown-scenario",
    }),
    service.getAttendeeRoster({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.importAttendeeRoster(input),
    service.importAttendeeRoster(input),
  );

  for (const filePath of [
    "features/events/attendee-roster/contract.ts",
    "features/events/attendee-roster/mock-service.ts",
    "app/api/events/[id]/attendees/route.ts",
    "app/api/events/[id]/attendees/import/route.ts",
    "features/events/attendee-roster/debug-view.tsx",
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

test("event attendee roster API routes return stable envelopes with empty and failure paths", async () => {
  const attendeesRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/attendees/route.ts");
  const importRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/attendees/import/route.ts");
  const fixtures = await importProjectModule<{
    mockEventAttendeeRosterImportFixture: unknown;
    mockEmptyEventAttendeeRosterImportFixture: unknown;
  }>("features/events/attendee-roster/fixtures.ts");

  const rosterResponse = await attendeesRoute.GET(
    new Request("https://orbit.local/api/events/demo-event-1/attendees", {
      method: "GET",
    }),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const importResponse = await importRoute.POST(
    new Request("https://orbit.local/api/events/demo-event-1/attendees/import", {
      method: "POST",
    }),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const emptyImportResponse = await importRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/attendees/import?scenario=empty",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const failureImportResponse = await importRoute.POST(
    new Request(
      "https://orbit.local/api/events/demo-event-1/attendees/import?scenario=failure",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );

  assert.equal(rosterResponse.status, 200);
  assert.equal(rosterResponse.headers.get("cache-control"), "no-store");
  assert.equal(rosterResponse.headers.get("x-orbit-feature-mode"), "mock");
  const rosterEnvelope = (await rosterResponse.json()) as {
    success: true;
    data: {
      state: string;
      event: {
        id: string;
        name: string;
        organizer: string;
        venue: string;
        startsAt: string;
      };
      attendees: readonly Array<{
        attendeeId: string;
        displayName: string;
        organization: string;
        email: string;
        eventRole: string;
        checkInStatus: string;
      }>;
    };
  };
  const importEnvelope = (await importResponse.json()) as {
    success: true;
    data: {
      event: {
        id: string;
        name: string;
        organizer: string;
        venue: string;
        startsAt: string;
      };
      attendees: readonly Array<{
        attendeeId: string;
        displayName: string;
        organization: string;
        email: string;
        eventRole: string;
        checkInStatus: string;
      }>;
    };
  };
  assert.equal(rosterEnvelope.success, true);
  assert.equal(rosterEnvelope.data.state, "success");
  assert.equal(rosterEnvelope.data.attendees.length, 3);
  assert.deepEqual(
    {
      id: importEnvelope.data.event.id,
      name: importEnvelope.data.event.name,
      organizer: importEnvelope.data.event.organizer,
      venue: importEnvelope.data.event.venue,
      startsAt: importEnvelope.data.event.startsAt,
    },
    {
      id: rosterEnvelope.data.event.id,
      name: rosterEnvelope.data.event.name,
      organizer: rosterEnvelope.data.event.organizer,
      venue: rosterEnvelope.data.event.venue,
      startsAt: rosterEnvelope.data.event.startsAt,
    },
  );
  assert.deepEqual(
    importEnvelope.data.attendees.map((attendee) => ({
      attendeeId: attendee.attendeeId,
      displayName: attendee.displayName,
      organization: attendee.organization,
      email: attendee.email,
      eventRole: attendee.eventRole,
      checkInStatus: attendee.checkInStatus,
    })),
    rosterEnvelope.data.attendees.map((attendee) => ({
      attendeeId: attendee.attendeeId,
      displayName: attendee.displayName,
      organization: attendee.organization,
      email: attendee.email,
      eventRole: attendee.eventRole,
      checkInStatus: attendee.checkInStatus,
    })),
  );

  assert.equal(importResponse.status, 200);
  assert.equal(importResponse.headers.get("cache-control"), "no-store");
  assert.equal(importResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(importEnvelope, {
    success: true,
    data: fixtures.mockEventAttendeeRosterImportFixture,
  });

  assert.equal(emptyImportResponse.status, 200);
  assert.deepEqual(await emptyImportResponse.json(), {
    success: true,
    data: fixtures.mockEmptyEventAttendeeRosterImportFixture,
  });

  assert.equal(failureImportResponse.status, 503);
  assert.deepEqual(await failureImportResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock event attendee roster boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        eventAttendeeRosterErrorCode: "EVENT_ATTENDEE_ROSTER_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event attendee roster failure came from deterministic fixture rules.",
        service: "attendee-roster",
      },
    },
  });
});

test("event attendee roster debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EVENT_ATTENDEE_ROSTER_MOCK_SLUG: string;
    EventAttendeeRosterMockDemo: () => React.ReactElement;
  }>("features/events/attendee-roster/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.EventAttendeeRosterMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/events/attendee-roster/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EVENT_ATTENDEE_ROSTER_MOCK_SLUG,
    "attendee-roster",
  );
  assert.match(pageSource, /EVENT_ATTENDEE_ROSTER_MOCK_SLUG/);
  assert.match(pageSource, /EventAttendeeRosterMockDemo/);

  assert.match(html, /Event attendee roster mock/);
  assert.match(html, /aria-label="Event attendee roster operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Attendee tags/);
  assert.match(html, /Known contacts/);
  assert.match(html, /Eligible recommendation pool/);
  assert.match(html, /organizer feed false/);
  assert.match(html, /database writes false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Aiko Mori/);
  assert.match(html, /Luis Ortega/);
  assert.match(html, /Priya Shah/);
  assert.match(html, /EVENT_ATTENDEE_ROSTER_MOCK_FAILED/);
  assert.match(html, /GET \/api\/events\/demo-event-1\/attendees/);
  assert.match(html, /POST \/api\/events\/demo-event-1\/attendees\/import/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EVENT_ATTENDEE_ROSTER_PROVIDER/);
  assert.match(html, /event-attendee-roster-workbench/);
  assert.match(
    html,
    /\.event-attendee-roster-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/events\/attendee-roster\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/events\/attendee-roster\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_EVENT_ATTENDEE_ROSTER_PROVIDER/);
  assert.match(liveDoc, /organizer attendee API/);
  assert.match(liveDoc, /privacy-gated roster access/);
  assert.match(liveDoc, /shared event metadata and attendee identity/);
  assert.match(liveDoc, /required environment variables/);
  assert.match(liveDoc, /permissions/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
