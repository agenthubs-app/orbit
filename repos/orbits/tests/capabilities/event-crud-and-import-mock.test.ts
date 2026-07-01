/**
 * 活动 CRUD 与导入 mock 的契约测试。
 *
 * 验证活动列表、详情、手动创建、导入和本地 no-op 行为。
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
    `${pathFromRoot} must exist for the event CRUD and import mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("event CRUD and import contract exposes statuses source metadata fixtures and errors", async () => {
  const contract = await importProjectModule<{
    EVENT_CRUD_AND_IMPORT_ERROR_CODES: readonly string[];
    EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; message: string; recovery: string }
    >;
    EVENT_STATUS_VALUES: readonly string[];
    EVENT_SOURCE_CAPTURE_METHODS: readonly string[];
  }>("features/events/contract.ts");
  const fixtures = await importProjectModule<{
    EVENT_CRUD_IMPORT_FIXTURE_SOURCE: string;
    mockEventListFixture: {
      state: string;
      events: readonly Array<{
        id: string;
        title: string;
        status: string;
        sourceMetadata: {
          captureMethod: string;
          provider: string;
          calendarSyncRequested: false;
          organizerFeedRequested: false;
          liveDatabaseWriteExecuted: false;
        };
      }>;
      importedRecords: readonly Array<{
        id: string;
        externalRecordId: string;
        sourceMetadata: { captureMethod: string };
      }>;
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        generationMethod: string;
      };
    };
    mockManualEventCreationFixture: {
      state: string;
      event: {
        id: string;
        title: string;
        status: string;
        sourceMetadata: { captureMethod: string; provider: string };
      };
      provenance: { evidenceIds: readonly string[] };
    };
    mockEmptyEventListFixture: {
      state: string;
      events: readonly unknown[];
      importedRecords: readonly unknown[];
      nextAction: string;
    };
  }>("features/events/fixtures.ts");
  const serviceModule = await importProjectModule<{
    createMockEventCrudAndImportService: () => {
      listEvents: (input?: {
        scenario?: string | null;
        statusFilter?: string | null;
      }) => {
        success: boolean;
        data?: typeof fixtures.mockEventListFixture;
        error?: { code: string; appCode: string };
      };
      createEvent: (input?: {
        title?: string | null;
        sourceNote?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof fixtures.mockManualEventCreationFixture;
        error?: { code: string; appCode: string };
      };
      getEvent: (input: {
        eventId?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: { event: typeof fixtures.mockEventListFixture.events[number] };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/events/mock-service.ts");

  assert.deepEqual(contract.EVENT_STATUS_VALUES, [
    "draft",
    "confirmed",
    "imported",
    "pending_import",
    "cancelled",
  ]);
  assert.deepEqual(contract.EVENT_SOURCE_CAPTURE_METHODS, [
    "manual_form",
    "calendar_sync_fixture",
    "organizer_feed_fixture",
  ]);
  assert.deepEqual(contract.EVENT_CRUD_AND_IMPORT_ERROR_CODES, [
    "EVENTS_EVENT_ID_REQUIRED",
    "EVENTS_EVENT_NOT_FOUND",
    "EVENTS_REQUEST_BODY_INVALID",
    "EVENTS_TITLE_REQUIRED",
    "EVENTS_SOURCE_NOTE_REQUIRED",
    "EVENTS_IMPORT_PENDING",
    "EVENTS_IMPORT_MOCK_FAILED",
    "EVENTS_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS.EVENTS_TITLE_REQUIRED
      .appCode,
    "VALIDATION_ERROR",
  );
  assert.match(
    contract.EVENT_CRUD_AND_IMPORT_ERROR_DEFINITIONS.EVENTS_IMPORT_MOCK_FAILED
      .recovery,
    /calendar|organizer|database|notification/i,
  );

  assert.equal(fixtures.mockEventListFixture.state, "success");
  assert.equal(fixtures.mockEventListFixture.events.length, 3);
  assert.equal(fixtures.mockEventListFixture.events[0]?.id, "demo-event-1");
  assert.equal(
    fixtures.mockEventListFixture.events[0]?.title,
    "Climate founders dinner",
  );
  assert.equal(
    fixtures.mockEventListFixture.events[0]?.sourceMetadata.captureMethod,
    "calendar_sync_fixture",
  );
  assert.equal(
    fixtures.mockEventListFixture.events[0]?.sourceMetadata.provider,
    "mock-calendar-sync-fixture",
  );
  assert.equal(
    fixtures.mockEventListFixture.events[0]?.sourceMetadata
      .calendarSyncRequested,
    false,
  );
  assert.equal(
    fixtures.mockEventListFixture.events[0]?.sourceMetadata
      .organizerFeedRequested,
    false,
  );
  assert.equal(
    fixtures.mockEventListFixture.events[0]?.sourceMetadata
      .liveDatabaseWriteExecuted,
    false,
  );
  assert.equal(fixtures.mockEventListFixture.importedRecords.length, 2);
  assert.equal(
    fixtures.mockEventListFixture.importedRecords[0]?.externalRecordId,
    "mock-calendar:climate-founders-dinner",
  );
  assert.deepEqual(fixtures.mockEventListFixture.provenance.evidenceIds, [
    "evidence:events-calendar-fixture",
    "evidence:events-organizer-fixture",
    "evidence:events-manual-note",
  ]);
  assert.equal(
    fixtures.mockEventListFixture.provenance.source,
    fixtures.EVENT_CRUD_IMPORT_FIXTURE_SOURCE,
  );
  assert.equal(fixtures.mockManualEventCreationFixture.state, "success");
  assert.equal(
    fixtures.mockManualEventCreationFixture.event.sourceMetadata.captureMethod,
    "manual_form",
  );
  assert.equal(
    fixtures.mockEmptyEventListFixture.nextAction,
    "Create a manual event or import a local event fixture before planning outreach.",
  );

  const service = serviceModule.createMockEventCrudAndImportService();
  const list = service.listEvents();
  const filtered = service.listEvents({ statusFilter: "confirmed" });
  const created = service.createEvent({
    title: "Founder investor salon",
    sourceNote:
      "Operator met the host at a founder dinner and wants the context preserved.",
  });
  const demoCreated = service.createEvent();
  const detail = service.getEvent({ eventId: "demo-event-1" });
  const empty = service.listEvents({ scenario: "empty" });
  const pending = service.listEvents({ scenario: "pending" });
  const failure = service.listEvents({ scenario: "failure" });
  const missingTitle = service.createEvent({ title: "  " });
  const missingSourceNote = service.createEvent({
    title: "Founder investor salon",
    sourceNote: "  ",
  });
  const missingEvent = service.getEvent({ eventId: "missing-event" });

  assert.equal(list.success, true);
  assert.equal(list.data?.events.length, 3);
  assert.equal(filtered.success, true);
  assert.deepEqual(
    filtered.data?.events.map((event) => event.status),
    ["confirmed"],
  );
  assert.equal(created.success, true);
  assert.equal(created.data?.event.id, "event:manual:founder-investor-salon");
  assert.equal(created.data?.event.title, "Founder investor salon");
  assert.equal(
    created.data?.event.description,
    "Operator met the host at a founder dinner and wants the context preserved.",
  );
  assert.equal(demoCreated.success, true);
  assert.equal(
    demoCreated.data?.event.id,
    fixtures.mockManualEventCreationFixture.event.id,
  );
  assert.equal(detail.success, true);
  assert.equal(detail.data?.event.id, "demo-event-1");
  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.events.length, 0);
  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "EVENTS_IMPORT_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missingTitle.success, false);
  assert.equal(missingTitle.error?.code, "EVENTS_TITLE_REQUIRED");
  assert.equal(missingSourceNote.success, false);
  assert.equal(missingSourceNote.error?.code, "EVENTS_SOURCE_NOTE_REQUIRED");
  assert.equal(missingEvent.success, false);
  assert.equal(missingEvent.error?.code, "EVENTS_EVENT_NOT_FOUND");
});

test("mock event CRUD and import service is deterministic rule-based code with no live provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockEventCrudAndImportService: () => {
      listEvents: (input?: {
        scenario?: string | null;
        statusFilter?: string | null;
      }) => unknown;
      createEvent: (input?: {
        title?: string | null;
        venue?: string | null;
        scenario?: string | null;
      }) => unknown;
      getEvent: (input: { eventId?: string | null }) => unknown;
    };
  }>("features/events/mock-service.ts");
  const service = serviceModule.createMockEventCrudAndImportService();
  const input = { statusFilter: "confirmed" };
  const createInput = {
    title: "Founder investor salon",
    sourceNote: "Operator-entered source note for deterministic testing.",
    venue: "Orbit studio",
  };

  assert.deepEqual(service.listEvents(), service.listEvents());
  assert.deepEqual(service.listEvents(input), service.listEvents(input));
  assert.deepEqual(
    service.createEvent(createInput),
    service.createEvent(createInput),
  );
  assert.deepEqual(
    service.listEvents({ scenario: "unknown-scenario" }),
    service.listEvents(),
  );

  const created = service.createEvent(createInput) as {
    success: true;
    data: {
      event: {
        externalNetworkRequested: false;
        calendarProviderRequested: false;
        organizerFeedRequested: false;
        liveDatabaseWriteExecuted: false;
        notificationDelivered: false;
      };
      provenance: { generationMethod: string };
    };
  };

  assert.equal(created.success, true);
  assert.equal(
    created.data.provenance.generationMethod,
    "rule-based-manual-event-creation",
  );
  assert.equal(created.data.event.externalNetworkRequested, false);
  assert.equal(created.data.event.calendarProviderRequested, false);
  assert.equal(created.data.event.organizerFeedRequested, false);
  assert.equal(created.data.event.liveDatabaseWriteExecuted, false);
  assert.equal(created.data.event.notificationDelivered, false);

  for (const filePath of [
    "features/events/contract.ts",
    "features/events/fixtures.ts",
    "features/events/service.ts",
    "features/events/mock-service.ts",
    "app/api/events/route.ts",
    "app/api/events/[id]/route.ts",
    "features/events/event-crud-and-import/debug-view.tsx",
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

test("event CRUD and import API routes return stable envelopes with empty and failure paths", async () => {
  const eventsRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
    POST: (request: Request) => Promise<Response>;
  }>("app/api/events/route.ts");
  const eventDetailRoute = await importProjectModule<{
    GET: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/events/[id]/route.ts");
  const fixtures = await importProjectModule<{
    mockEventListFixture: unknown;
    mockManualEventCreationFixture: unknown;
    mockEmptyEventListFixture: unknown;
  }>("features/events/fixtures.ts");

  const listResponse = await eventsRoute.GET(
    new Request("https://orbit.local/api/events"),
  );
  const createResponse = await eventsRoute.POST(
    new Request("https://orbit.local/api/events", {
      method: "POST",
    }),
  );
  const detailResponse = await eventDetailRoute.GET(
    new Request("https://orbit.local/api/events/demo-event-1"),
    {
      params: Promise.resolve({ id: "demo-event-1" }),
    },
  );
  const emptyResponse = await eventsRoute.GET(
    new Request("https://orbit.local/api/events?scenario=empty"),
  );
  const failureResponse = await eventsRoute.GET(
    new Request("https://orbit.local/api/events?scenario=failure"),
  );
  const missingTitleResponse = await eventsRoute.POST(
    new Request("https://orbit.local/api/events", {
      body: JSON.stringify({ title: " " }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const malformedJsonResponse = await eventsRoute.POST(
    new Request("https://orbit.local/api/events", {
      body: "{",
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const emptyFormResponse = await eventsRoute.POST(
    new Request("https://orbit.local/api/events", {
      body: new URLSearchParams({
        sourceNote: "",
        title: "",
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    }),
  );
  const missingSourceNoteResponse = await eventsRoute.POST(
    new Request("https://orbit.local/api/events", {
      body: JSON.stringify({
        sourceNote: " ",
        title: "Founder investor salon",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  );
  const missingEventResponse = await eventDetailRoute.GET(
    new Request("https://orbit.local/api/events/missing-event"),
    {
      params: Promise.resolve({ id: "missing-event" }),
    },
  );
  const reloadAfterFailureResponse = await eventsRoute.GET(
    new Request("https://orbit.local/api/events"),
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await listResponse.json(), {
    success: true,
    data: fixtures.mockEventListFixture,
  });

  assert.equal(createResponse.status, 201);
  assert.equal(createResponse.headers.get("cache-control"), "no-store");
  assert.deepEqual(await createResponse.json(), {
    success: true,
    data: fixtures.mockManualEventCreationFixture,
  });

  assert.equal(detailResponse.status, 200);
  const detailEnvelope = (await detailResponse.json()) as {
    success: true;
    data: { event: { id: string; title: string } };
  };
  assert.equal(detailEnvelope.success, true);
  assert.equal(detailEnvelope.data.event.id, "demo-event-1");
  assert.equal(detailEnvelope.data.event.title, "Climate founders dinner");

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyEventListFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock event CRUD and import boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        eventCrudImportErrorCode: "EVENTS_IMPORT_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event CRUD and import failure came from deterministic fixture rules.",
        service: "event-crud-and-import-mock",
      },
    },
  });

  assert.equal(missingTitleResponse.status, 400);
  assert.deepEqual(await missingTitleResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "A manual event title is required before staging the mock event.",
      context: {
        boundary: "developer-admin",
        eventCrudImportErrorCode: "EVENTS_TITLE_REQUIRED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event CRUD and import failure came from deterministic fixture rules.",
        service: "event-crud-and-import-mock",
      },
    },
  });

  assert.equal(malformedJsonResponse.status, 400);
  assert.deepEqual(await malformedJsonResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message:
        "The manual event request body must be valid JSON before staging the mock event.",
      context: {
        boundary: "developer-admin",
        eventCrudImportErrorCode: "EVENTS_REQUEST_BODY_INVALID",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event CRUD and import failure came from deterministic fixture rules.",
        service: "event-crud-and-import-mock",
      },
    },
  });

  assert.equal(emptyFormResponse.status, 400);
  assert.deepEqual(await emptyFormResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "A manual event title is required before staging the mock event.",
      context: {
        boundary: "developer-admin",
        eventCrudImportErrorCode: "EVENTS_TITLE_REQUIRED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event CRUD and import failure came from deterministic fixture rules.",
        service: "event-crud-and-import-mock",
      },
    },
  });

  assert.equal(missingSourceNoteResponse.status, 400);
  assert.deepEqual(await missingSourceNoteResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message:
        "A source note is required before staging a manual event in the mock.",
      context: {
        boundary: "developer-admin",
        eventCrudImportErrorCode: "EVENTS_SOURCE_NOTE_REQUIRED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event CRUD and import failure came from deterministic fixture rules.",
        service: "event-crud-and-import-mock",
      },
    },
  });

  assert.equal(missingEventResponse.status, 404);
  assert.deepEqual(await missingEventResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock event matches that event id.",
      context: {
        boundary: "developer-admin",
        eventCrudImportErrorCode: "EVENTS_EVENT_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock event CRUD and import failure came from deterministic fixture rules.",
        service: "event-crud-and-import-mock",
      },
    },
  });

  assert.equal(reloadAfterFailureResponse.status, 200);
  assert.deepEqual(await reloadAfterFailureResponse.json(), {
    success: true,
    data: fixtures.mockEventListFixture,
  });
});

test("event CRUD and import debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EVENT_CRUD_AND_IMPORT_MOCK_SLUG: string;
    EventCrudAndImportMockDemo: () => React.ReactElement;
  }>("features/events/event-crud-and-import/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.EventCrudAndImportMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/events/event-crud-and-import/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EVENT_CRUD_AND_IMPORT_MOCK_SLUG,
    "event-crud-and-import-mock",
  );
  assert.match(pageSource, /EVENT_CRUD_AND_IMPORT_MOCK_SLUG/);
  assert.match(pageSource, /EventCrudAndImportMockDemo/);

  assert.match(html, /Event CRUD and import mock/);
  assert.match(html, /aria-label="Event CRUD operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Manual creation/);
  assert.match(html, /Imported records/);
  assert.match(html, /Mock execution/);
  assert.match(html, /calendar sync false/);
  assert.match(html, /organizer feeds false/);
  assert.match(html, /database writes false/);
  assert.match(html, /Calendar sync fixture/);
  assert.match(html, /Organizer feed fixture/);
  assert.match(html, /Manual event creation/);
  assert.match(html, /Imported event records/);
  assert.match(html, /aria-label="Mock-only event execution checks"/);
  assert.match(html, /Calendar provider/);
  assert.match(html, /Organizer feed/);
  assert.match(html, /Live database writes/);
  assert.match(html, /Notifications/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Climate founders dinner/);
  assert.match(html, /Founder investor salon/);
  assert.match(html, /Source note/);
  assert.match(html, /name="sourceNote"/);
  assert.match(html, /Run empty form probe/);
  assert.match(html, /Reload success state/);
  assert.match(html, /EVENTS_IMPORT_MOCK_FAILED/);
  assert.match(html, /GET \/api\/events/);
  assert.match(html, /POST \/api\/events/);
  assert.match(html, /GET \/api\/events\/demo-event-1/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EVENT_IMPORT_PROVIDER/);
  assert.match(html, /event-crud-import-workbench/);
  assert.match(
    html,
    /\.event-crud-import-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/events\/event-crud-and-import\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/events\/event-crud-and-import\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_EVENT_IMPORT_PROVIDER/);
  assert.match(liveDoc, /calendar sync/i);
  assert.match(liveDoc, /organizer feed/i);
  assert.match(liveDoc, /live event database/i);
  assert.match(liveDoc, /privacy/i);
  assert.match(liveDoc, /provenance/i);
  assert.match(liveDoc, /replacement tests/i);
});
