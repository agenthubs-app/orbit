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
    `${pathFromRoot} must exist for the profile signal review queue sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("profile signal review queue contract exposes typed chat, activity, and contact suggestions", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/profile/signal-contract")
  >("features/profile/signal-contract.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/profile/signal-fixtures")
  >("features/profile/signal-fixtures.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/profile/mock-signal-service")
  >("features/profile/mock-signal-service.ts");

  const service = serviceModule.createMockProfileSignalReviewQueueService();
  const success = service.listUpdateSuggestions();
  const empty = service.listUpdateSuggestions({ scenario: "empty" });
  const pending = service.listUpdateSuggestions({ scenario: "pending" });
  const failure = service.listUpdateSuggestions({ scenario: "failure" });
  const accept = service.acceptUpdateSuggestion("demo-profile-suggestion-1");

  assert.deepEqual(contract.PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_CODES, [
    "PROFILE_SIGNAL_SUGGESTION_NOT_FOUND",
    "PROFILE_SIGNAL_SUGGESTION_ALREADY_RESOLVED",
    "PROFILE_SIGNAL_REVIEW_QUEUE_FAILED",
  ]);
  assert.equal(
    contract.PROFILE_SIGNAL_REVIEW_QUEUE_ERROR_DEFINITIONS
      .PROFILE_SIGNAL_SUGGESTION_NOT_FOUND.appCode,
    "NOT_FOUND",
  );

  assert.equal(success.success, true);
  assert.equal(success.data.state, "success");
  assert.equal(success.data.suggestions.length, 3);
  assert.deepEqual(
    success.data.suggestions.map((suggestion) => suggestion.sourceKind),
    ["chat", "activity", "contact"],
  );
  assert.equal(
    success.data.suggestions[0].id,
    "demo-profile-suggestion-1",
  );
  assert.equal(success.data.suggestions[0].targetProfileField, "headline");
  assert.equal(
    success.data.suggestions[0].suggestedValue,
    "Founder focused on event-grounded relationship workflows",
  );
  assert.equal(success.data.suggestions[0].status, "pending");
  assert.deepEqual(success.data.provenance.evidenceIds, [
    "evidence:chat-follow-up-goal",
    "evidence:activity-event-pattern",
    "evidence:contact-market-context",
  ]);
  assert.equal(
    success.data.provenance.source,
    fixtures.PROFILE_SIGNAL_REVIEW_QUEUE_FIXTURE_SOURCE,
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.deepEqual(empty.data.suggestions, []);
  assert.equal(
    empty.data.nextAction,
    "Keep the profile unchanged until a sourced signal creates a suggestion.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.suggestions.length, 1);
  assert.equal(pending.data.suggestions[0].status, "pending");
  assert.equal(
    pending.data.provenance.generationMethod,
    "rule-based-signal-match",
  );

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "PROFILE_SIGNAL_REVIEW_QUEUE_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(accept.success, true);
  assert.equal(accept.data.state, "accepted");
  assert.equal(accept.data.acceptedSuggestion.status, "accepted");
  assert.deepEqual(accept.data.profilePatch, {
    headline: "Founder focused on event-grounded relationship workflows",
  });
  assert.equal(
    accept.data.nextAction,
    "Apply this patch only after the operator confirms the profile save.",
  );
});

test("mock profile signal review service is deterministic and has no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/profile/mock-signal-service")
  >("features/profile/mock-signal-service.ts");
  const service = serviceModule.createMockProfileSignalReviewQueueService();

  assert.deepEqual(
    service.listUpdateSuggestions(),
    service.listUpdateSuggestions(),
  );
  assert.deepEqual(
    service.acceptUpdateSuggestion("demo-profile-suggestion-1"),
    service.acceptUpdateSuggestion("demo-profile-suggestion-1"),
  );
  assert.deepEqual(
    service.listUpdateSuggestions({ scenario: "unknown-scenario" }),
    service.listUpdateSuggestions(),
  );

  for (const filePath of [
    "features/profile/signal-contract.ts",
    "features/profile/signal-fixtures.ts",
    "features/profile/mock-signal-service.ts",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|oauth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|localStorage|indexedDB/);
    assert.doesNotMatch(
      source,
      /calendar service|email service|notification service|provider call/i,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("profile signal review queue API routes return stable envelopes and documented empty or failure paths", async () => {
  const listRoute = await importProjectModule<
    typeof import("../../app/api/profile/update-suggestions/route")
  >("app/api/profile/update-suggestions/route.ts");
  const acceptRoute = await importProjectModule<
    typeof import("../../app/api/profile/update-suggestions/[id]/accept/route")
  >("app/api/profile/update-suggestions/[id]/accept/route.ts");
  const fixtures = await importProjectModule<
    typeof import("../../features/profile/signal-fixtures")
  >("features/profile/signal-fixtures.ts");

  const listResponse = await listRoute.GET(
    new Request("https://orbit.local/api/profile/update-suggestions", {
      method: "GET",
    }),
  );
  const acceptResponse = await acceptRoute.POST(
    new Request(
      "https://orbit.local/api/profile/update-suggestions/demo-profile-suggestion-1/accept",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "demo-profile-suggestion-1" }),
    },
  );
  const emptyResponse = await listRoute.GET(
    new Request(
      "https://orbit.local/api/profile/update-suggestions?scenario=empty",
      {
        method: "GET",
      },
    ),
  );
  const pendingResponse = await listRoute.GET(
    new Request(
      "https://orbit.local/api/profile/update-suggestions?scenario=pending",
      {
        method: "GET",
      },
    ),
  );
  const failureResponse = await listRoute.GET(
    new Request(
      "https://orbit.local/api/profile/update-suggestions?scenario=failure",
      {
        method: "GET",
      },
    ),
  );
  const notFoundResponse = await acceptRoute.POST(
    new Request(
      "https://orbit.local/api/profile/update-suggestions/missing-suggestion/accept",
      {
        method: "POST",
      },
    ),
    {
      params: Promise.resolve({ id: "missing-suggestion" }),
    },
  );

  assert.equal(listResponse.status, 200);
  assert.equal(listResponse.headers.get("cache-control"), "no-store");
  assert.equal(listResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await listResponse.json(), {
    success: true,
    data: fixtures.mockProfileSignalReviewQueueFixture,
  });

  assert.equal(acceptResponse.status, 200);
  assert.deepEqual(await acceptResponse.json(), {
    success: true,
    data: fixtures.mockProfileSignalSuggestionAcceptedFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyProfileSignalReviewQueueFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: fixtures.mockPendingProfileSignalReviewQueueFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock profile signal review queue is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        profileSignalReviewQueueErrorCode:
          "PROFILE_SIGNAL_REVIEW_QUEUE_FAILED",
        provenance:
          "Mock profile signal review failure came from deterministic fixture rules.",
        service: "profile-signal-review-queue-mock",
      },
    },
  });

  assert.equal(notFoundResponse.status, 404);
  assert.deepEqual(await notFoundResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock profile update suggestion matches that id.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        profileSignalReviewQueueErrorCode:
          "PROFILE_SIGNAL_SUGGESTION_NOT_FOUND",
        provenance:
          "Mock profile signal review failure came from deterministic fixture rules.",
        service: "profile-signal-review-queue-mock",
      },
    },
  });
});

test("profile signal review queue debug route renders success, empty, pending, and failure states", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/profile/profile-signal-review-queue/debug-view")
  >("features/profile/profile-signal-review-queue/debug-view.tsx");
  const html = renderToStaticMarkup(
    React.createElement(debugView.ProfileSignalReviewQueueCapabilityDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.equal(
    debugView.PROFILE_SIGNAL_REVIEW_QUEUE_CAPABILITY_SLUG,
    "profile-signal-review-queue",
  );
  assert.match(pageSource, /PROFILE_SIGNAL_REVIEW_QUEUE_CAPABILITY_SLUG/);
  assert.match(pageSource, /ProfileSignalReviewQueueCapabilityDemo/);

  assert.match(html, /Profile signal review queue/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Chat signal/);
  assert.match(html, /Activity signal/);
  assert.match(html, /Contact signal/);
  assert.match(html, /demo-profile-suggestion-1/);
  assert.match(
    html,
    /Ari asks for follow-up copy that explains event-grounded relationship workflows/,
  );
  assert.match(html, /Source review rehearsal/);
  assert.match(html, /Inspect source excerpt/);
  assert.match(html, /Return patch only/);
  assert.match(html, /Operator save required/);
  assert.match(html, /No automatic profile mutation/);
  assert.match(html, /PROFILE_SIGNAL_REVIEW_QUEUE_FAILED/);
  assert.match(html, /GET \/api\/profile\/update-suggestions/);
  assert.match(
    html,
    /POST \/api\/profile\/update-suggestions\/demo-profile-suggestion-1\/accept/,
  );
  assert.match(html, /ORBIT_PROFILE_SIGNAL_PROVIDER/);
  assert.match(html, /Expect 503 failure envelope/);
  assert.match(
    html,
    /curl -s http:\/\/localhost:3000\/api\/profile\/update-suggestions\?scenario=empty/,
  );
  assert.match(
    html,
    /features\/profile\/profile-signal-review-queue\/LIVE_IMPLEMENTATION\.md/,
  );
});

test("profile signal review queue live handoff covers replacement requirements", () => {
  const docPath =
    "features/profile/profile-signal-review-queue/LIVE_IMPLEMENTATION.md";
  const doc = readFileSync(join(projectRoot, docPath), "utf8");

  assert.match(doc, /Live service and provider files/i);
  assert.match(doc, /Switch mechanism/i);
  assert.match(doc, /Required env vars and permissions/i);
  assert.match(doc, /Privacy and provenance constraints/i);
  assert.match(doc, /Replacement tests/i);
  assert.match(doc, /Developer evidence surface/i);
  assert.match(doc, /source review rehearsal/i);
  assert.match(doc, /features\/profile\/mock-signal-service\.ts/);
  assert.match(doc, /features\/profile\/signal-contract\.ts/);
  assert.match(doc, /app\/api\/profile\/update-suggestions\/route\.ts/);
  assert.match(
    doc,
    /app\/api\/profile\/update-suggestions\/\[id\]\/accept\/route\.ts/,
  );
  assert.match(doc, /ORBIT_PROFILE_SIGNAL_PROVIDER/);
  assert.match(doc, /source and evidence provenance/i);
});
