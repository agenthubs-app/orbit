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
    `${pathFromRoot} must exist for the email and calendar relationship signal mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("email calendar signal contract exposes fixtures service interface and permission guarded error definitions", async () => {
  const contract = await importProjectModule<{
    EMAIL_CALENDAR_SIGNAL_ERROR_CODES: readonly string[];
    EMAIL_CALENDAR_SIGNAL_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; recovery: string }
    >;
    EMAIL_CALENDAR_SIGNAL_FIXTURE_SOURCE: string;
    EMAIL_CALENDAR_SIGNAL_SOURCE_KINDS: readonly string[];
    mockEmailCalendarSignalFixture: {
      state: string;
      signals: readonly Array<{
        id: string;
        sourceKind: string;
        signalKind: string;
        displayName: string;
        permission: { required: true; state: string };
        confirmation: { required: true; state: string };
        gmailApiRequested: false;
        googleCalendarApiRequested: false;
        microsoftGraphApiRequested: false;
        backgroundSyncEnqueued: false;
        messageBodyIngested: false;
        databaseWriteExecuted: false;
        notificationDelivered: false;
      }>;
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        gmailApiRequested: false;
        googleCalendarApiRequested: false;
        microsoftGraphApiRequested: false;
        backgroundSyncEnqueued: false;
        messageBodyIngested: false;
        externalNetworkRequested: false;
        databaseWriteExecuted: false;
        aiProviderRequested: false;
        notificationDelivered: false;
      };
    };
    mockEmptyEmailCalendarSignalFixture: {
      state: string;
      signals: readonly unknown[];
      nextAction: string;
    };
    mockPendingEmailCalendarSignalFixture: {
      state: string;
      signals: readonly unknown[];
      nextAction: string;
    };
  }>("features/acquisition/email-calendar-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockEmailCalendarSignalService: () => {
      listEmailCalendarSignals: (input?: {
        scenario?: string | null;
        sourceKind?: string | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockEmailCalendarSignalFixture;
        error?: { code: string; appCode: string };
      };
      confirmEmailCalendarSignal: (input: {
        signalId: string;
        actorLabel?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: { state: string; confirmedSignal: { id: string } };
        error?: { code: string; appCode: string };
      };
    };
  }>("features/acquisition/mock-email-calendar-service.ts");

  const service = serviceModule.createMockEmailCalendarSignalService();
  const success = service.listEmailCalendarSignals();
  const gmailOnly = service.listEmailCalendarSignals({ sourceKind: "gmail" });
  const empty = service.listEmailCalendarSignals({ scenario: "empty" });
  const pending = service.listEmailCalendarSignals({ scenario: "pending" });
  const failure = service.listEmailCalendarSignals({ scenario: "failure" });
  const confirmed = service.confirmEmailCalendarSignal({
    signalId: "demo-calendar-signal-1",
    actorLabel: "Demo operator",
  });
  const missing = service.confirmEmailCalendarSignal({
    signalId: "missing-signal",
  });

  assert.deepEqual(contract.EMAIL_CALENDAR_SIGNAL_SOURCE_KINDS, [
    "gmail",
    "google_calendar",
    "microsoft_graph",
  ]);
  assert.deepEqual(contract.EMAIL_CALENDAR_SIGNAL_ERROR_CODES, [
    "EMAIL_CALENDAR_SIGNAL_PERMISSION_REQUIRED",
    "EMAIL_CALENDAR_SIGNAL_NOT_FOUND",
    "EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED",
    "EMAIL_CALENDAR_SIGNAL_PENDING",
    "EMAIL_CALENDAR_SIGNAL_MOCK_FAILED",
  ]);
  assert.equal(
    contract.EMAIL_CALENDAR_SIGNAL_ERROR_DEFINITIONS
      .EMAIL_CALENDAR_SIGNAL_PERMISSION_REQUIRED.appCode,
    "FORBIDDEN",
  );

  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.signals.length, 3);
  assert.deepEqual(
    success.data?.signals.map((signal) => signal.sourceKind),
    ["gmail", "google_calendar", "microsoft_graph"],
  );
  assert.equal(success.data?.signals[0]?.permission.required, true);
  assert.equal(success.data?.signals[0]?.confirmation.required, true);
  assert.equal(success.data?.signals[0]?.confirmation.state, "pending");
  assert.equal(success.data?.signals[0]?.gmailApiRequested, false);
  assert.equal(success.data?.signals[1]?.googleCalendarApiRequested, false);
  assert.equal(success.data?.signals[2]?.microsoftGraphApiRequested, false);
  assert.equal(success.data?.signals[0]?.backgroundSyncEnqueued, false);
  assert.equal(success.data?.signals[0]?.messageBodyIngested, false);
  assert.equal(success.data?.provenance.source, contract.EMAIL_CALENDAR_SIGNAL_FIXTURE_SOURCE);
  assert.equal(success.data?.provenance.gmailApiRequested, false);
  assert.equal(success.data?.provenance.googleCalendarApiRequested, false);
  assert.equal(success.data?.provenance.microsoftGraphApiRequested, false);
  assert.equal(success.data?.provenance.backgroundSyncEnqueued, false);
  assert.equal(success.data?.provenance.messageBodyIngested, false);
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.databaseWriteExecuted, false);
  assert.equal(success.data?.provenance.aiProviderRequested, false);
  assert.equal(success.data?.provenance.notificationDelivered, false);

  assert.equal(gmailOnly.success, true);
  assert.deepEqual(
    gmailOnly.data?.signals.map((signal) => signal.sourceKind),
    ["gmail"],
  );
  assert.equal(gmailOnly.data?.provenance.source, contract.EMAIL_CALENDAR_SIGNAL_FIXTURE_SOURCE);

  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.signals.length, 0);
  assert.equal(
    empty.data?.nextAction,
    "Grant mock email and calendar permission before reviewing relationship signals.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.signals.length, 0);

  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "EMAIL_CALENDAR_SIGNAL_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data?.state, "confirmed");
  assert.equal(confirmed.data?.confirmedSignal.id, "demo-calendar-signal-1");

  assert.equal(missing.success, false);
  assert.equal(missing.error?.code, "EMAIL_CALENDAR_SIGNAL_NOT_FOUND");
});

test("mock email calendar signal service is deterministic rule-based code with no external provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockEmailCalendarSignalService: () => {
      listEmailCalendarSignals: (input?: {
        scenario?: string | null;
        sourceKind?: string | null;
      }) => unknown;
      confirmEmailCalendarSignal: (input: {
        signalId: string;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/acquisition/mock-email-calendar-service.ts");
  const service = serviceModule.createMockEmailCalendarSignalService();
  const filterInput = { sourceKind: "google_calendar" };

  assert.deepEqual(
    service.listEmailCalendarSignals(),
    service.listEmailCalendarSignals(),
  );
  assert.deepEqual(
    service.listEmailCalendarSignals({ scenario: "unknown-scenario" }),
    service.listEmailCalendarSignals(),
  );
  assert.deepEqual(
    service.listEmailCalendarSignals(filterInput),
    service.listEmailCalendarSignals(filterInput),
  );
  assert.deepEqual(
    service.confirmEmailCalendarSignal({
      signalId: "demo-calendar-signal-1",
    }),
    service.confirmEmailCalendarSignal({
      signalId: "demo-calendar-signal-1",
    }),
  );

  const filtered = service.listEmailCalendarSignals(filterInput) as {
    success: true;
    data: {
      signals: readonly Array<{ sourceKind: string; displayName: string }>;
      provenance: { generationMethod: string };
    };
  };
  const blocked = service.confirmEmailCalendarSignal({
    signalId: "demo-calendar-signal-1",
    scenario: "blocked",
  }) as { success: false; error: { code: string; appCode: string } };

  assert.equal(filtered.success, true);
  assert.equal(
    filtered.data.provenance.generationMethod,
    "rule-based-email-calendar-signal",
  );
  assert.deepEqual(
    filtered.data.signals.map((signal) => signal.sourceKind),
    ["google_calendar"],
  );
  assert.deepEqual(
    filtered.data.signals.map((signal) => signal.displayName),
    ["Noah Silva"],
  );
  assert.equal(blocked.success, false);
  assert.equal(blocked.error.code, "EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED");
  assert.equal(blocked.error.appCode, "FORBIDDEN");

  for (const filePath of [
    "features/acquisition/email-calendar-contract.ts",
    "features/acquisition/mock-email-calendar-service.ts",
    "app/api/relationship-signals/email-calendar/route.ts",
    "app/api/relationship-signals/[id]/confirm/route.ts",
    "features/acquisition/email-and-calendar-relationship-signal-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /googleapis|microsoft-graph-client|GraphServiceClient/);
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("email calendar signal API routes return stable envelopes with empty pending and failure paths", async () => {
  const listRoute = await importProjectModule<{
    GET: (request: Request) => Promise<Response>;
  }>("app/api/relationship-signals/email-calendar/route.ts");
  const confirmRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/relationship-signals/[id]/confirm/route.ts");
  const fixtures = await importProjectModule<{
    mockEmailCalendarSignalFixture: unknown;
    mockEmptyEmailCalendarSignalFixture: unknown;
    mockPendingEmailCalendarSignalFixture: unknown;
    mockEmailCalendarSignalConfirmedFixture: unknown;
  }>("features/acquisition/email-calendar-contract.ts");

  const listResponse = await listRoute.GET(
    new Request("https://orbit.local/api/relationship-signals/email-calendar", {
      method: "GET",
    }),
  );
  const emptyResponse = await listRoute.GET(
    new Request(
      "https://orbit.local/api/relationship-signals/email-calendar?scenario=empty",
      { method: "GET" },
    ),
  );
  const pendingResponse = await listRoute.GET(
    new Request(
      "https://orbit.local/api/relationship-signals/email-calendar?scenario=pending",
      { method: "GET" },
    ),
  );
  const failureResponse = await listRoute.GET(
    new Request(
      "https://orbit.local/api/relationship-signals/email-calendar?scenario=failure",
      { method: "GET" },
    ),
  );
  const confirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/relationship-signals/demo-calendar-signal-1/confirm",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "demo-calendar-signal-1" }) },
  );
  const blockedConfirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/relationship-signals/demo-calendar-signal-1/confirm?scenario=blocked",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "demo-calendar-signal-1" }) },
  );
  const missingConfirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/relationship-signals/missing-signal/confirm",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "missing-signal" }) },
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await listResponse.json(), {
    success: true,
    data: fixtures.mockEmailCalendarSignalFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyEmailCalendarSignalFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: fixtures.mockPendingEmailCalendarSignalFixture,
  });

  assert.equal(confirmResponse.status, 200);
  assert.deepEqual(await confirmResponse.json(), {
    success: true,
    data: fixtures.mockEmailCalendarSignalConfirmedFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock email and calendar relationship signal boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        emailCalendarSignalErrorCode: "EMAIL_CALENDAR_SIGNAL_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock email and calendar relationship signal failure came from deterministic fixture rules.",
        service: "email-and-calendar-relationship-signal-mock",
      },
    },
  });

  assert.equal(blockedConfirmResponse.status, 403);
  assert.deepEqual(await blockedConfirmResponse.json(), {
    success: false,
    error: {
      code: "FORBIDDEN",
      message:
        "The mock email and calendar relationship signal requires explicit user confirmation before conversion.",
      context: {
        boundary: "developer-admin",
        emailCalendarSignalErrorCode:
          "EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock email and calendar relationship signal failure came from deterministic fixture rules.",
        service: "email-and-calendar-relationship-signal-mock",
      },
    },
  });

  assert.equal(missingConfirmResponse.status, 404);
  assert.deepEqual(await missingConfirmResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock email and calendar relationship signal matches that id.",
      context: {
        boundary: "developer-admin",
        emailCalendarSignalErrorCode: "EMAIL_CALENDAR_SIGNAL_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock email and calendar relationship signal failure came from deterministic fixture rules.",
        service: "email-and-calendar-relationship-signal-mock",
      },
    },
  });
});

test("email calendar signal debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    EMAIL_CALENDAR_SIGNAL_MOCK_SLUG: string;
    EmailCalendarRelationshipSignalMockDemo: () => React.ReactElement;
  }>(
    "features/acquisition/email-and-calendar-relationship-signal-mock/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.EmailCalendarRelationshipSignalMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/acquisition/email-and-calendar-relationship-signal-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.EMAIL_CALENDAR_SIGNAL_MOCK_SLUG,
    "email-and-calendar-relationship-signal-mock",
  );
  assert.match(pageSource, /EMAIL_CALENDAR_SIGNAL_MOCK_SLUG/);
  assert.match(pageSource, /EmailCalendarRelationshipSignalMockDemo/);

  assert.match(html, /Email and calendar relationship signal mock/);
  assert.match(html, /aria-label="Email calendar signal operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Signals available/);
  assert.match(html, /Gmail fixture/);
  assert.match(html, /Google Calendar fixture/);
  assert.match(html, /Microsoft Graph fixture/);
  assert.match(html, /permission required/);
  assert.match(html, /confirmation required/);
  assert.match(html, /message body ingestion false/);
  assert.match(html, /background sync false/);
  assert.match(html, /provider calls false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Aiko Watanabe/);
  assert.match(html, /Noah Silva/);
  assert.match(html, /EMAIL_CALENDAR_SIGNAL_MOCK_FAILED/);
  assert.match(html, /GET \/api\/relationship-signals\/email-calendar/);
  assert.match(
    html,
    /POST \/api\/relationship-signals\/demo-calendar-signal-1\/confirm/,
  );
  assert.match(
    html,
    /GET \/api\/relationship-signals\/email-calendar\?scenario=empty/,
  );
  assert.match(
    html,
    /GET \/api\/relationship-signals\/email-calendar\?scenario=failure/,
  );
  assert.match(html, /Probe result matrix/);
  assert.match(html, /envelope success true/);
  assert.match(html, /envelope success false/);
  assert.match(html, /Run pending probe/);
  assert.match(html, /Run blocked probe/);
  assert.match(html, /Run not-found probe/);
  assert.match(html, /Missing signal adversarial probe/);
  assert.match(html, /EMAIL_CALENDAR_SIGNAL_CONFIRMATION_REQUIRED/);
  assert.match(html, /EMAIL_CALENDAR_SIGNAL_NOT_FOUND/);
  assert.match(
    html,
    /POST \/api\/relationship-signals\/missing-signal\/confirm/,
  );
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_EMAIL_CALENDAR_SIGNAL_PROVIDER/);
  assert.match(html, /email-calendar-signal-workbench/);
  assert.match(
    html,
    /\.email-calendar-signal-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/acquisition\/email-and-calendar-relationship-signal-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/acquisition\/email-and-calendar-relationship-signal-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_EMAIL_CALENDAR_SIGNAL_PROVIDER/);
  assert.match(liveDoc, /Gmail/);
  assert.match(liveDoc, /Google Calendar/);
  assert.match(liveDoc, /Microsoft Graph/);
  assert.match(liveDoc, /message body ingestion/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
