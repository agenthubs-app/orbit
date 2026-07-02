/**
 * 活动参会者导入 mock 的契约测试。
 *
 * 验证 roster 导入、联系人草稿、provenance 和 API/debug-view 表达。
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as acquisitionEventAttendeeFixtures from "../../features/acquisition/event-attendee-fixtures";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

async function importProjectModule<TModule>(
  pathFromRoot: string,
): Promise<TModule> {
  const absolutePath = join(projectRoot, pathFromRoot);

  assert.equal(
    existsSync(absolutePath),
    true,
    `${pathFromRoot} must exist for the event attendee import mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("event attendee import contract exposes attendee roster drafts relationship labels and errors", async () => {
  const contract = await importProjectModule<{
    EVENT_ATTENDEE_IMPORT_ERROR_CODES: readonly string[];
    EVENT_ATTENDEE_IMPORT_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string }
    >;
    EVENT_ATTENDEE_IMPORT_FIXTURE_SOURCE: string;
    mockEventAttendeeImportFixture: {
      state: string;
      event: { id: string; name: string };
      contactDrafts: readonly Array<{
        id: string;
        attendeeId: string;
        displayName: string;
        relationshipStatus: { code: string; label: string };
        contactWriteExecuted: false;
        bulkDatabaseImportExecuted: false;
      }>;
      provenance: { source: string; evidenceIds: readonly string[] };
    };
    mockEventAttendeeRosterFixture: {
      state: string;
      attendees: readonly Array<{
        attendeeId: string;
        relationshipStatus: { label: string };
        organizerFeedRequested: false;
        externalLookupExecuted: false;
      }>;
    };
  }>("features/acquisition/event-attendee-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockEventAttendeeImportService: () => {
      importEventAttendees: (input?: {
        eventId?: string | null;
        relationshipStatusFilter?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof acquisitionEventAttendeeFixtures.mockEventAttendeeImportFixture;
        error?: { code: string; appCode: string };
      };
      listEventAttendees: (input?: {
        eventId?: string | null;
        relationshipStatusFilter?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof acquisitionEventAttendeeFixtures.mockEventAttendeeRosterFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/acquisition/mock-event-attendee-import-service.ts");

  const service = serviceModule.createMockEventAttendeeImportService();
  const roster = service.listEventAttendees({ eventId: "demo-event-1" });
  const success = service.importEventAttendees({ eventId: "demo-event-1" });
  const empty = service.importEventAttendees({
    eventId: "demo-event-1",
    scenario: "empty",
  });
  const pending = service.importEventAttendees({
    eventId: "demo-event-1",
    scenario: "pending",
  });
  const failure = service.importEventAttendees({
    eventId: "demo-event-1",
    scenario: "failure",
  });

  assert.deepEqual(contract.EVENT_ATTENDEE_IMPORT_ERROR_CODES, [
    "EVENT_ATTENDEE_EVENT_ID_REQUIRED",
    "EVENT_ATTENDEE_EVENT_NOT_FOUND",
    "EVENT_ATTENDEE_IMPORT_PENDING",
    "EVENT_ATTENDEE_IMPORT_MOCK_FAILED",
    "EVENT_ATTENDEE_IMPORT_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.EVENT_ATTENDEE_IMPORT_ERROR_DEFINITIONS
      .EVENT_ATTENDEE_EVENT_ID_REQUIRED.appCode,
    "VALIDATION_ERROR",
  );

  assert.equal(roster.success, true);
  assert.equal(roster.data?.state, "success");
  assert.equal(roster.data?.attendees.length, 3);
  assert.equal(roster.data?.attendees[0]?.organizerFeedRequested, false);
  assert.equal(roster.data?.attendees[0]?.externalLookupExecuted, false);
  assert.match(
    roster.data?.attendees[0]?.relationshipStatus.label ?? "",
    /potential contact/i,
  );

  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.event.id, "demo-event-1");
  assert.equal(success.data?.event.name, "Climate founders dinner");
  assert.equal(success.data?.contactDrafts.length, 3);
  assert.equal(success.data?.contactDrafts[0]?.id, "event-draft:demo-1");
  assert.equal(success.data?.contactDrafts[0]?.attendeeId, "attendee:demo-1");
  assert.equal(
    success.data?.contactDrafts[0]?.relationshipStatus.code,
    "new_potential_contact",
  );
  assert.equal(
    success.data?.contactDrafts[0]?.relationshipStatus.label,
    "New potential contact",
  );
  assert.equal(success.data?.contactDrafts[0]?.contactWriteExecuted, false);
  assert.equal(
    success.data?.contactDrafts[0]?.bulkDatabaseImportExecuted,
    false,
  );
  assert.deepEqual(success.data?.provenance.evidenceIds, [
    "evidence:event-import-roster",
    "evidence:event-import-conversation-thread",
    "evidence:event-import-goal-fit",
  ]);
  assert.equal(
    success.data?.provenance.source,
    acquisitionEventAttendeeFixtures.EVENT_ATTENDEE_IMPORT_FIXTURE_SOURCE,
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.contactDrafts.length, 0);
  assert.equal(
    empty.data?.nextAction,
    "Wait for a local attendee roster fixture before staging contact drafts.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.contactDrafts.length, 0);
  assert.equal(pending.data?.event.importStatus, "pending");

  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "EVENT_ATTENDEE_IMPORT_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
});

test("mock event attendee import service is deterministic rule-based code with no external provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockEventAttendeeImportService: () => {
      importEventAttendees: (input?: {
        eventId?: string | null;
        relationshipStatusFilter?: string | null;
        scenario?: string | null;
      }) => unknown;
      listEventAttendees: (input?: {
        eventId?: string | null;
        relationshipStatusFilter?: string | null;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/acquisition/mock-event-attendee-import-service.ts");
  const service = serviceModule.createMockEventAttendeeImportService();
  const filterInput = {
    eventId: "demo-event-1",
    relationshipStatusFilter: "new_potential_contact",
  };

  assert.deepEqual(
    service.listEventAttendees({ eventId: "demo-event-1" }),
    service.listEventAttendees({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.importEventAttendees({ eventId: "demo-event-1" }),
    service.importEventAttendees({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.importEventAttendees({
      eventId: "demo-event-1",
      scenario: "unknown-scenario",
    }),
    service.importEventAttendees({ eventId: "demo-event-1" }),
  );
  assert.deepEqual(
    service.importEventAttendees(filterInput),
    service.importEventAttendees(filterInput),
  );

  const filtered = service.importEventAttendees(filterInput) as {
    success: true;
    data: {
      contactDrafts: readonly Array<{
        relationshipStatus: { code: string };
      }>;
      provenance: { generationMethod: string };
    };
  };

  assert.equal(filtered.success, true);
  assert.equal(
    filtered.data.provenance.generationMethod,
    "rule-based-event-attendee-import",
  );
  assert.deepEqual(
    filtered.data.contactDrafts.map((draft) => draft.relationshipStatus.code),
    ["new_potential_contact"],
  );

  for (const filePath of [
    "features/acquisition/event-attendee-contract.ts",
    "features/acquisition/mock-event-attendee-import-service.ts",
    "app/api/contact-drafts/event-attendees/import/route.ts",
    "app/api/events/[id]/attendees/route.ts",
    "features/acquisition/event-attendee-import-mock/debug-view.tsx",
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

test("event attendee import API routes return stable envelopes with empty and failure paths", async () => {
  const importRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/contact-drafts/event-attendees/import/route.ts");
  const attendeesRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/attendees/route.ts");
  const fixtures = await importProjectModule<{
    mockEventAttendeeImportFixture: unknown;
    mockEventAttendeeRosterFixture: unknown;
    mockEmptyEventAttendeeImportFixture: unknown;
  }>("features/acquisition/event-attendee-fixtures.ts");

  const importResponse = await importRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/event-attendees/import",
      {
        method: "POST",
      },
    ),
  );
  const attendeesResponse = await attendeesRoute.GET(
    new Request("https://orbit.local/api/events/demo-event-1/attendees", {
      method: "GET",
    }),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const emptyResponse = await importRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/event-attendees/import?scenario=empty",
      {
        method: "POST",
      },
    ),
  );
  const failureResponse = await importRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/event-attendees/import?scenario=failure",
      {
        method: "POST",
      },
    ),
  );
  const missingRosterResponse = await attendeesRoute.GET(
    new Request("https://orbit.local/api/events/missing-event/attendees", {
      method: "GET",
    }),
    {
      params: Promise.resolve({ id: "missing-event" }),
    },
  );

  assert.equal(importResponse.status, 200);
  assert.equal(importResponse.headers.get("cache-control"), "no-store");
  assert.equal(importResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await importResponse.json(), {
    success: true,
    data: fixtures.mockEventAttendeeImportFixture,
  });

  assert.equal(attendeesResponse.status, 200);
  assert.equal(attendeesResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await attendeesResponse.json(), {
    success: true,
    data: fixtures.mockEventAttendeeRosterFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyEventAttendeeImportFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock event attendee import boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        eventAttendeeImportErrorCode: "EVENT_ATTENDEE_IMPORT_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event attendee import failure came from deterministic fixture rules.",
        service: "event-attendee-import-mock",
      },
    },
  });

  assert.equal(missingRosterResponse.status, 404);
  assert.deepEqual(await missingRosterResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock event attendee roster matches that event id.",
      context: {
        boundary: "developer-admin",
        eventAttendeeImportErrorCode: "EVENT_ATTENDEE_EVENT_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event attendee import failure came from deterministic fixture rules.",
        service: "event-attendee-import-mock",
      },
    },
  });
});

test("event attendee import debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EVENT_ATTENDEE_IMPORT_MOCK_SLUG: string;
    EventAttendeeImportMockDemo: () => React.ReactElement;
  }>("features/acquisition/event-attendee-import-mock/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.EventAttendeeImportMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/acquisition/event-attendee-import-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EVENT_ATTENDEE_IMPORT_MOCK_SLUG,
    "event-attendee-import-mock",
  );
  assert.match(pageSource, /EVENT_ATTENDEE_IMPORT_MOCK_SLUG/);
  assert.match(pageSource, /EventAttendeeImportMockDemo/);

  assert.match(html, /Event attendee import mock/);
  assert.match(html, /aria-label="Event attendee operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Drafts staged/);
  assert.match(html, /Relationship labels/);
  assert.match(html, /Mock execution/);
  assert.match(html, /organizer feed false/);
  assert.match(html, /contact writes false/);
  assert.match(html, /development live-reload diagnostics/);
  assert.match(html, /Organizer roster fixture/);
  assert.match(html, /Relationship status labels/);
  assert.match(html, /Potential contact drafts/);
  assert.match(html, /aria-label="Mock-only execution checks"/);
  assert.match(html, /Organizer feed request/);
  assert.match(html, /Contact writes/);
  assert.match(html, /Notifications/);
  assert.match(html, /Bulk database imports/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Aiko Mori/);
  assert.match(html, /New potential contact/);
  assert.match(html, /EVENT_ATTENDEE_IMPORT_MOCK_FAILED/);
  assert.match(
    html,
    /POST \/api\/contact-drafts\/event-attendees\/import/,
  );
  assert.match(html, /GET \/api\/events\/demo-event-1\/attendees/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EVENT_ATTENDEE_IMPORT_PROVIDER/);
  assert.match(html, /event-attendee-import-workbench/);
  assert.match(
    html,
    /\.event-attendee-import-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/acquisition\/live-event-attendee-import-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/acquisition\/storage\/event-attendee-live-record-provider\.ts/,
  );
  assert.match(liveDoc, /ORBIT_EVENT_ATTENDEE_IMPORT_PROVIDER/);
  assert.match(liveDoc, /organizer attendee feed/);
  assert.match(liveDoc, /bulk database import/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
