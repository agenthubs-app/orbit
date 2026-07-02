/**
 * 权限状态与 staged authorization mock 的契约测试。
 *
 * 验证权限列表、日历授权请求和不连接真实 provider 的边界。
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
    `${pathFromRoot} must exist for the permission state sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("permission contract exposes typed states for every staged authorization boundary", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/permissions/contract")
  >("features/permissions/contract.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/permissions/fixtures")
  >("features/permissions/fixtures.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/permissions/mock-service")
  >("features/permissions/mock-service.ts");

  const service = serviceModule.createMockPermissionStateService();
  const success = service.listPermissionStates();
  const empty = service.listPermissionStates({ scenario: "empty" });
  const pending = service.listPermissionStates({ scenario: "pending" });
  const failure = service.listPermissionStates({ scenario: "failure" });
  const calendarRequest = service.requestPermission({
    capability: "calendar",
    intent: "connect-event-calendar",
  });

  assert.deepEqual(contract.PERMISSION_CAPABILITIES, [
    "contacts",
    "calendar",
    "email",
    "notifications",
    "camera",
    "business-card-scan",
    "event-data",
    "chat-analysis",
  ]);
  assert.deepEqual(contract.PERMISSION_STATE_ERROR_CODES, [
    "PERMISSION_CAPABILITY_NOT_FOUND",
    "PERMISSION_REQUEST_NOT_ALLOWED",
    "PERMISSION_STATE_MOCK_FAILED",
    "PERMISSION_STATE_LIVE_STORE_UNCONFIGURED",
  ]);
  assert.equal(
    contract.PERMISSION_STATE_ERROR_DEFINITIONS
      .PERMISSION_REQUEST_NOT_ALLOWED.appCode,
    "FORBIDDEN",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.permissions.length, 8);
  assert.deepEqual(
    success.data.permissions.map((permission) => permission.capability),
    contract.PERMISSION_CAPABILITIES,
  );
  assert.deepEqual(
    success.data.permissions.map((permission) => permission.status),
    [
      "authorized",
      "authorized",
      "not_requested",
      "authorized",
      "not_requested",
      "available_after_camera",
      "authorized",
      "not_requested",
    ],
  );
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:manual-contacts-import",
    "evidence:event-calendar-staging",
    "evidence:notification-sandbox",
    "evidence:event-roster-import",
  ]);
  assert.equal(
    success.data.provenance.source,
    fixtures.PERMISSION_STATE_FIXTURE_SOURCE,
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.deepEqual(empty.data.permissions, []);
  assert.equal(
    empty.data.nextAction,
    "Select a relationship workflow before requesting any staged permission.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.permissions[0].capability, "calendar");
  assert.equal(pending.data.permissions[0].status, "pending");
  assert.equal(
    pending.data.provenance.generationMethod,
    "rule-based-staged-authorization",
  );

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "PERMISSION_STATE_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(calendarRequest.success, true);
  assert.equal(calendarRequest.data.state, "pending");
  assert.equal(calendarRequest.data.request.capability, "calendar");
  assert.equal(calendarRequest.data.request.intent, "connect-event-calendar");
  assert.equal(calendarRequest.data.request.replacesProviderFlow, true);
  assert.equal(
    calendarRequest.data.nextAction,
    "Show a staged authorization review instead of opening a provider flow.",
  );
});

test("mock permission state service is deterministic and has no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/permissions/mock-service")
  >("features/permissions/mock-service.ts");
  const service = serviceModule.createMockPermissionStateService();

  assert.deepEqual(
    service.listPermissionStates(),
    service.listPermissionStates(),
  );
  assert.deepEqual(
    service.listPermissionStates({ scenario: "unknown-scenario" }),
    service.listPermissionStates(),
  );
  assert.deepEqual(
    service.requestPermission({
      capability: "calendar",
      intent: "connect-event-calendar",
    }),
    service.requestPermission({
      capability: "calendar",
      intent: "connect-event-calendar",
    }),
  );

  for (const filePath of [
    "features/permissions/contract.ts",
    "features/permissions/fixtures.ts",
    "features/permissions/service.ts",
    "features/permissions/mock-service.ts",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|localStorage|indexedDB/);
    assert.doesNotMatch(
      source,
      /getUserMedia|Notification\.requestPermission|service worker/i,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
    assert.doesNotMatch(
      source,
      /calendar provider|email provider|notification provider|database/i,
    );
  }
});

test("permission API routes return stable envelopes and documented empty or failure paths", async () => {
  const listRoute = await importProjectModule<
    typeof import("../../app/api/permissions/route")
  >("app/api/permissions/route.ts");
  const calendarRequestRoute = await importProjectModule<
    typeof import("../../app/api/permissions/calendar/request/route")
  >("app/api/permissions/calendar/request/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/permissions/fixtures")
  >("features/permissions/fixtures.ts");

  const listResponse = await listRoute.GET(
    new Request("https://orbit.local/api/permissions", {
      method: "GET",
    }),
  );
  const emptyResponse = await listRoute.GET(
    new Request("https://orbit.local/api/permissions?scenario=empty", {
      method: "GET",
    }),
  );
  const pendingResponse = await listRoute.GET(
    new Request("https://orbit.local/api/permissions?scenario=pending", {
      method: "GET",
    }),
  );
  const failureResponse = await listRoute.GET(
    new Request("https://orbit.local/api/permissions?scenario=failure", {
      method: "GET",
    }),
  );
  const calendarRequestResponse = await calendarRequestRoute.POST(
    new Request("https://orbit.local/api/permissions/calendar/request", {
      body: JSON.stringify({ intent: "connect-event-calendar" }),
      method: "POST",
    }),
  );
  const blockedRequestResponse = await calendarRequestRoute.POST(
    new Request(
      "https://orbit.local/api/permissions/calendar/request?scenario=blocked",
      {
        body: JSON.stringify({ intent: "connect-event-calendar" }),
        method: "POST",
      },
    ),
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await listResponse.json(), {
    success: true,
    data: fixtures.mockPermissionStateFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyPermissionStateFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: fixtures.mockPendingPermissionStateFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock permission state boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        permissionStateErrorCode: "PERMISSION_STATE_MOCK_FAILED",
        privacy: "no-relationship-data",
        provenance:
          "Mock permission state failure came from deterministic fixture rules.",
        service: "permission-state-and-staged-authorization-mock",
      },
    },
  });

  assert.equal(calendarRequestResponse.status, 200);
  assert.deepEqual(await calendarRequestResponse.json(), {
    success: true,
    data: fixtures.mockCalendarPermissionRequestFixture,
  });

  assert.equal(blockedRequestResponse.status, 403);
  assert.deepEqual(await blockedRequestResponse.json(), {
    success: false,
    error: {
      code: "FORBIDDEN",
      message:
        "That mock permission request is not allowed for the staged authorization boundary.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        permissionStateErrorCode: "PERMISSION_REQUEST_NOT_ALLOWED",
        privacy: "no-relationship-data",
        provenance:
          "Mock permission state failure came from deterministic fixture rules.",
        service: "permission-state-and-staged-authorization-mock",
      },
    },
  });
});

test("permission debug route renders success, empty, pending, and failure states", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/permissions/permission-state-and-staged-authorization-mock/debug-view")
  >(
    "features/permissions/permission-state-and-staged-authorization-mock/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.PermissionStateCapabilityDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.equal(
    debugView.PERMISSION_STATE_CAPABILITY_SLUG,
    "permission-state-and-staged-authorization-mock",
  );
  assert.match(pageSource, /PERMISSION_STATE_CAPABILITY_SLUG/);
  assert.match(pageSource, /PermissionStateCapabilityDemo/);

  assert.match(html, /Permission state and staged authorization mock/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Contacts/);
  assert.match(html, /Calendar/);
  assert.match(html, /Email/);
  assert.match(html, /Notifications/);
  assert.match(html, /Camera/);
  assert.match(html, /Business-card scan/);
  assert.match(html, /Event data/);
  assert.match(html, /Chat analysis/);
  assert.match(html, /Staged authorization review/);
  assert.match(html, /No browser prompt/);
  assert.match(html, /No provider redirect/);
  assert.match(html, /No device access/);
  assert.match(html, /PERMISSION_STATE_MOCK_FAILED/);
  assert.match(html, /GET \/api\/permissions\?scenario=empty/);
  assert.match(html, /POST \/api\/permissions\/calendar\/request/);
  assert.match(html, /Run staged calendar review/);
  assert.match(
    html,
    /<form[^>]+action="\/api\/permissions\/calendar\/request"[^>]+method="post"/,
  );
  assert.match(
    html,
    /aria-label="Run staged calendar authorization review"/,
  );
  assert.match(
    html,
    /This submits to the mock route and renders an API envelope response/,
  );
  assert.match(html, /ORBIT_PERMISSION_AUTH_PROVIDER/);
  assert.match(html, /Expect 403 failure envelope/);
  assert.match(
    html,
    /features\/permissions\/permission-state-and-staged-authorization-mock\/LIVE_IMPLEMENTATION\.md/,
  );
});

test("permission live handoff covers replacement requirements", () => {
  const docPath =
    "features/permissions/permission-state-and-staged-authorization-mock/LIVE_IMPLEMENTATION.md";
  const doc = readFileSync(join(projectRoot, docPath), "utf8");

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /features\/permissions\/service\.ts/);
  assert.match(doc, /features\/permissions\/mock-service\.ts/);
  assert.match(doc, /features\/permissions\/live-service\.ts/);
  assert.match(doc, /app\/api\/permissions\/route\.ts/);
  assert.match(doc, /app\/api\/permissions\/calendar\/request\/route\.ts/);
  assert.match(doc, /ORBIT_PERMISSION_AUTH_PROVIDER/);
  assert.match(doc, /source and evidence provenance/i);
  assert.match(doc, /browser permission prompts/i);
  assert.match(doc, /provider authorization/i);
  assert.match(doc, /Debug review surface/i);
  assert.match(doc, /Run staged calendar review/i);
  assert.match(
    doc,
    /the form action must move behind the same explicit confirmation guard/i,
  );
});
