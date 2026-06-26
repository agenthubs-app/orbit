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
    `${pathFromRoot} must exist for the sensitive action confirmation guard sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("confirmation guard contract exposes typed requirements for every sensitive action boundary", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/permissions/confirmation-contract")
  >("features/permissions/confirmation-contract.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/permissions/mock-confirmation-service")
  >("features/permissions/mock-confirmation-service.ts");

  const service = serviceModule.createMockSensitiveActionConfirmationService();
  const success = service.listConfirmationRequirements();
  const empty = service.listConfirmationRequirements({ scenario: "empty" });
  const pending = service.listConfirmationRequirements({ scenario: "pending" });
  const failure = service.listConfirmationRequirements({ scenario: "failure" });
  const approved = service.approveConfirmation({
    confirmationId: "demo-confirmation-1",
  });
  const rejected = service.rejectConfirmation({
    confirmationId: "demo-confirmation-1",
  });

  assert.deepEqual(contract.SENSITIVE_ACTION_KINDS, [
    "send-message",
    "add-contact",
    "create-calendar-event",
    "update-profile",
  ]);
  assert.deepEqual(contract.CONFIRMATION_GUARD_ERROR_CODES, [
    "CONFIRMATION_REQUIREMENT_NOT_FOUND",
    "CONFIRMATION_REQUIREMENT_ALREADY_RESOLVED",
    "CONFIRMATION_DECISION_NOT_ALLOWED",
    "CONFIRMATION_GUARD_MOCK_FAILED",
  ]);
  assert.equal(
    contract.CONFIRMATION_GUARD_ERROR_DEFINITIONS
      .CONFIRMATION_REQUIREMENT_NOT_FOUND.appCode,
    "NOT_FOUND",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.requirements.length, 4);
  assert.deepEqual(
    success.data.requirements.map((requirement) => requirement.action.kind),
    contract.SENSITIVE_ACTION_KINDS,
  );
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:message-draft-review",
    "evidence:card-import-review",
    "evidence:calendar-intent-review",
    "evidence:profile-change-review",
  ]);
  assert.equal(
    success.data.provenance.source,
    serviceModule.CONFIRMATION_GUARD_FIXTURE_SOURCE,
  );
  assert.equal(
    success.data.requirements[0].action.replacesOutboundAction,
    true,
  );
  assert.equal(
    success.data.requirements[0].action.externalActionExecuted,
    false,
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.deepEqual(empty.data.requirements, []);
  assert.equal(
    empty.data.nextAction,
    "Wait until a sensitive relationship action creates a sourced confirmation request.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.requirements.length, 1);
  assert.equal(pending.data.requirements[0].id, "demo-confirmation-1");
  assert.equal(
    pending.data.provenance.generationMethod,
    "rule-based-confirmation-guard",
  );

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "CONFIRMATION_GUARD_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(approved.success, true);
  assert.equal(approved.data.state, "approved");
  assert.equal(approved.data.decision.status, "approved");
  assert.equal(approved.data.decision.externalActionExecuted, false);
  assert.equal(
    approved.data.nextAction,
    "Record the approval in the mock audit trail; do not send the message.",
  );

  assert.equal(rejected.success, true);
  assert.equal(rejected.data.state, "rejected");
  assert.equal(rejected.data.decision.status, "rejected");
  assert.equal(rejected.data.decision.externalActionExecuted, false);
  assert.equal(
    rejected.data.nextAction,
    "Keep the draft in review and record the rejection in the mock audit trail.",
  );
});

test("mock confirmation guard service is deterministic and has no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/permissions/mock-confirmation-service")
  >("features/permissions/mock-confirmation-service.ts");
  const service = serviceModule.createMockSensitiveActionConfirmationService();

  assert.deepEqual(
    service.listConfirmationRequirements(),
    service.listConfirmationRequirements(),
  );
  assert.deepEqual(
    service.listConfirmationRequirements({ scenario: "unknown-scenario" }),
    service.listConfirmationRequirements(),
  );
  assert.deepEqual(
    service.approveConfirmation({ confirmationId: "demo-confirmation-1" }),
    service.approveConfirmation({ confirmationId: "demo-confirmation-1" }),
  );
  assert.deepEqual(
    service.rejectConfirmation({ confirmationId: "demo-confirmation-1" }),
    service.rejectConfirmation({ confirmationId: "demo-confirmation-1" }),
  );

  for (const filePath of [
    "features/permissions/confirmation-contract.ts",
    "features/permissions/mock-confirmation-service.ts",
    "app/api/confirmations/[id]/approve/route.ts",
    "app/api/confirmations/[id]/reject/route.ts",
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
      /calendar provider|email provider|notification provider/i,
    );
  }
});

test("confirmation API routes return stable envelopes and documented failure paths", async () => {
  const approveRoute = await importProjectModule<
    typeof import("../../app/api/confirmations/[id]/approve/route")
  >("app/api/confirmations/[id]/approve/route.ts");
  const rejectRoute = await importProjectModule<
    typeof import("../../app/api/confirmations/[id]/reject/route")
  >("app/api/confirmations/[id]/reject/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/permissions/mock-confirmation-service")
  >("features/permissions/mock-confirmation-service.ts");

  const approveResponse = await approveRoute.POST(
    new Request(
      "https://orbit.local/api/confirmations/demo-confirmation-1/approve",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-confirmation-1" }),
    },
  );
  const rejectResponse = await rejectRoute.POST(
    new Request(
      "https://orbit.local/api/confirmations/demo-confirmation-1/reject",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-confirmation-1" }),
    },
  );
  const notFoundResponse = await approveRoute.POST(
    new Request(
      "https://orbit.local/api/confirmations/missing-confirmation/approve",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "missing-confirmation" }),
    },
  );
  const failureResponse = await rejectRoute.POST(
    new Request(
      "https://orbit.local/api/confirmations/demo-confirmation-1/reject?scenario=failure",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-confirmation-1" }),
    },
  );

  assert.equal(approveResponse.status, 200);
  assert.equal(approveResponse.headers.get("cache-control"), "no-store");
  assert.equal(approveResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await approveResponse.json(), {
    success: true,
    data: fixtures.mockConfirmationApprovedFixture,
  });

  assert.equal(rejectResponse.status, 200);
  assert.deepEqual(await rejectResponse.json(), {
    success: true,
    data: fixtures.mockConfirmationRejectedFixture,
  });

  assert.equal(notFoundResponse.status, 404);
  assert.deepEqual(await notFoundResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock confirmation requirement matches that id.",
      context: {
        boundary: "developer-admin",
        confirmationGuardErrorCode: "CONFIRMATION_REQUIREMENT_NOT_FOUND",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock confirmation guard failure came from deterministic fixture rules.",
        service: "sensitive-action-confirmation-guard",
      },
    },
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock confirmation guard is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        confirmationGuardErrorCode: "CONFIRMATION_GUARD_MOCK_FAILED",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock confirmation guard failure came from deterministic fixture rules.",
        service: "sensitive-action-confirmation-guard",
      },
    },
  });
});

test("confirmation guard debug route renders success, empty, pending, and failure states", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/permissions/sensitive-action-confirmation-guard/debug-view")
  >("features/permissions/sensitive-action-confirmation-guard/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.SensitiveActionConfirmationGuardDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.equal(
    debugView.SENSITIVE_ACTION_CONFIRMATION_GUARD_SLUG,
    "sensitive-action-confirmation-guard",
  );
  assert.match(pageSource, /SENSITIVE_ACTION_CONFIRMATION_GUARD_SLUG/);
  assert.match(pageSource, /SensitiveActionConfirmationGuardDemo/);

  assert.match(html, /Sensitive action confirmation guard/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Send message/);
  assert.match(html, /Add contact/);
  assert.match(html, /Create calendar event/);
  assert.match(html, /Update profile/);
  assert.match(html, /demo-confirmation-1/);
  assert.match(html, /No message is sent/);
  assert.match(html, /No contact is written/);
  assert.match(html, /No calendar event is created/);
  assert.match(html, /No profile field is saved/);
  assert.match(html, /CONFIRMATION_GUARD_MOCK_FAILED/);
  assert.match(
    html,
    /POST \/api\/confirmations\/demo-confirmation-1\/approve/,
  );
  assert.match(
    html,
    /POST \/api\/confirmations\/demo-confirmation-1\/reject/,
  );
  assert.match(html, /Expect 404 failure envelope/);
  assert.match(
    html,
    /features\/permissions\/sensitive-action-confirmation-guard\/LIVE_IMPLEMENTATION\.md/,
  );
});

test("decision sandbox keeps the pending action context next to confirmation controls", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/permissions/sensitive-action-confirmation-guard/debug-view")
  >("features/permissions/sensitive-action-confirmation-guard/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.SensitiveActionConfirmationGuardDemo),
  );

  const contextStart = html.indexOf("Pending action under review");
  const approveButtonStart = html.indexOf("Approve mock action");
  const rejectButtonStart = html.indexOf("Reject mock action");

  assert.notEqual(
    contextStart,
    -1,
    "decision sandbox must repeat the exact pending action under review",
  );
  assert.ok(
    contextStart < approveButtonStart,
    "pending action context must appear before the approve control",
  );
  assert.ok(
    approveButtonStart < rejectButtonStart,
    "approve and reject controls should remain grouped after the context",
  );

  const decisionContext = html.slice(contextStart, approveButtonStart);

  assert.match(decisionContext, /Send message/);
  assert.match(decisionContext, /Emi Tanaka/);
  assert.match(decisionContext, /Follow-up draft review/);
  assert.match(decisionContext, /evidence:message-draft-review/);
  assert.match(decisionContext, /Great meeting you at SaaS Summit/);
  assert.match(decisionContext, /No message is sent/);
});

test("confirmation guard live handoff covers replacement requirements", () => {
  const docPath =
    "features/permissions/sensitive-action-confirmation-guard/LIVE_IMPLEMENTATION.md";
  const doc = readFileSync(join(projectRoot, docPath), "utf8");

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /features\/permissions\/confirmation-contract\.ts/);
  assert.match(doc, /features\/permissions\/mock-confirmation-service\.ts/);
  assert.match(doc, /features\/permissions\/live-confirmation-service\.ts/);
  assert.match(doc, /app\/api\/confirmations\/\[id\]\/approve\/route\.ts/);
  assert.match(doc, /app\/api\/confirmations\/\[id\]\/reject\/route\.ts/);
  assert.match(doc, /ORBIT_CONFIRMATION_PROVIDER/);
  assert.match(doc, /source and evidence provenance/i);
  assert.match(doc, /message send/i);
  assert.match(doc, /contact write/i);
  assert.match(doc, /calendar event/i);
  assert.match(doc, /profile update/i);
  assert.match(doc, /Debug review surface/i);
  assert.match(doc, /approve and reject forms/i);
});
