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
    `${pathFromRoot} must exist for the relationship stage and profile mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("relationship profile contract exposes typed fixtures service methods and errors", async () => {
  const contract = await importProjectModule<
    typeof import("../../features/connections/profile-contract")
  >("features/connections/profile-contract.ts");
  const serviceModule = await importProjectModule<
    typeof import("../../features/connections/mock-profile-service")
  >("features/connections/mock-profile-service.ts");

  const service = serviceModule.createMockRelationshipStageAndProfileService();
  const stageUpdate = service.updateStage({
    connectionId: "demo-connection-1",
    relationshipStage: "active",
  });
  const profileUpdate = service.updateProfile({
    connectionId: "demo-connection-1",
    context:
      "Kenji asked for a storage pilot operator introduction after the climate founders dinner.",
    mutualValue: {
      contactReceives: "A warm operator introduction for storage pilot validation.",
      orbitUserReceives:
        "A qualified climate infrastructure founder conversation.",
      valueTypes: ["commercial_opportunity", "knowledge_exchange"],
    },
    nextAction: {
      label: "Send storage pilot operator intro",
      rationale:
        "The intro is the highest-signal action from the latest source-backed context.",
    },
    relationshipType: "customer_candidate",
  });
  const empty = service.updateStage({
    connectionId: "demo-connection-1",
    scenario: "empty",
  });
  const pending = service.updateProfile({
    connectionId: "demo-connection-1",
    scenario: "pending",
  });
  const failure = service.updateStage({
    connectionId: "demo-connection-1",
    scenario: "failure",
  });
  const missing = service.updateProfile({
    connectionId: "missing-connection",
  });
  const invalidStage = service.updateStage({
    connectionId: "demo-connection-1",
    relationshipStage: "unknown-stage",
  });
  const invalidBody = service.invalidRelationshipProfileBody();

  assert.deepEqual(contract.RELATIONSHIP_PROFILE_ERROR_CODES, [
    "RELATIONSHIP_PROFILE_NOT_FOUND",
    "RELATIONSHIP_PROFILE_INVALID_BODY",
    "RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED",
    "RELATIONSHIP_PROFILE_PENDING",
    "RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED",
  ]);
  assert.deepEqual(contract.RELATIONSHIP_PROFILE_TYPES, [
    "event_peer",
    "customer_candidate",
    "partner_candidate",
    "mentor_or_advisor",
    "community_bridge",
  ]);
  assert.equal(
    contract.RELATIONSHIP_PROFILE_ERROR_DEFINITIONS
      .RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED.appCode,
    "VALIDATION_ERROR",
  );
  assert.equal(
    contract.RELATIONSHIP_PROFILE_FIXTURE_SOURCE,
    "fixture:features/connections/profile-contract.ts",
  );

  assert.equal(stageUpdate.success, true);
  assert.equal(stageUpdate.data.state, "success");
  assert.equal(stageUpdate.data.profile.connectionId, "demo-connection-1");
  assert.equal(stageUpdate.data.profile.relationshipType, "event_peer");
  assert.equal(stageUpdate.data.profile.relationshipStage, "active");
  assert.equal(
    stageUpdate.data.profile.latestSummary.text,
    "Kenji is now active because the climate dinner context and follow-up evidence point to a concrete operator intro.",
  );
  assert.equal(
    stageUpdate.data.profile.nextAction.label,
    "Send storage pilot operator intro",
  );
  assert.equal(stageUpdate.data.profile.databaseReadExecuted, false);
  assert.equal(stageUpdate.data.profile.databaseWriteExecuted, false);
  assert.equal(stageUpdate.data.profile.externalNetworkRequested, false);
  assert.equal(stageUpdate.data.profile.aiProviderRequested, false);
  assert.deepEqual(
    stageUpdate.data.provenance.evidenceIds,
    [
      "evidence:connection-climate-dinner",
      "evidence:connection-storage-pilot",
      "evidence:connection-email-context",
      "evidence:relationship-profile-rule",
    ],
  );

  assert.equal(profileUpdate.success, true);
  assert.equal(profileUpdate.data.profile.relationshipType, "customer_candidate");
  assert.equal(
    profileUpdate.data.profile.context,
    "Kenji asked for a storage pilot operator introduction after the climate founders dinner.",
  );
  assert.deepEqual(profileUpdate.data.profile.mutualValue.valueTypes, [
    "commercial_opportunity",
    "knowledge_exchange",
  ]);
  assert.equal(
    profileUpdate.data.profile.latestSummary.generationMethod,
    "rule-based-relationship-profile",
  );
  assert.equal(profileUpdate.data.provenance.databaseWriteExecuted, false);
  assert.equal(profileUpdate.data.provenance.externalNetworkRequested, false);

  assert.equal(empty.success, true);
  assert.equal(empty.data.state, "empty");
  assert.equal(empty.data.profile, null);
  assert.equal(
    empty.data.nextAction,
    "Select a mock connection before calculating relationship stage and profile fields.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data.state, "pending");
  assert.equal(pending.data.profile, null);

  assert.equal(failure.success, false);
  assert.equal(failure.error.code, "RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED");
  assert.equal(failure.error.appCode, "SERVICE_UNAVAILABLE");
  assert.equal(missing.success, false);
  assert.equal(missing.error.code, "RELATIONSHIP_PROFILE_NOT_FOUND");
  assert.equal(invalidStage.success, false);
  assert.equal(
    invalidStage.error.code,
    "RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED",
  );
  assert.equal(invalidBody.success, false);
  assert.equal(invalidBody.error.code, "RELATIONSHIP_PROFILE_INVALID_BODY");

  assert.deepEqual(
    contract.mockRelationshipStageUpdateFixture,
    stageUpdate.data,
  );
  assert.deepEqual(
    contract.mockRelationshipProfileUpdateFixture,
    profileUpdate.data,
  );
  assert.deepEqual(contract.mockEmptyRelationshipProfileFixture, empty.data);
  assert.deepEqual(contract.mockPendingRelationshipProfileFixture, pending.data);
});

test("relationship stage and profile mock is deterministic with no external provider calls", async () => {
  const serviceModule = await importProjectModule<
    typeof import("../../features/connections/mock-profile-service")
  >("features/connections/mock-profile-service.ts");
  const service = serviceModule.createMockRelationshipStageAndProfileService();
  const stageInput = {
    connectionId: "demo-connection-1",
    relationshipStage: "active",
  };
  const profileInput = {
    connectionId: "demo-connection-1",
    relationshipType: "customer_candidate",
  };

  assert.deepEqual(service.updateStage(stageInput), service.updateStage(stageInput));
  assert.deepEqual(
    service.updateProfile(profileInput),
    service.updateProfile(profileInput),
  );
  assert.deepEqual(
    service.updateStage({
      connectionId: "demo-connection-1",
      scenario: "unknown-scenario",
    }),
    service.updateStage(stageInput),
  );

  const profile = service.updateProfile(profileInput);

  assert.equal(profile.success, true);
  assert.equal(profile.data.profile.databaseReadExecuted, false);
  assert.equal(profile.data.profile.databaseWriteExecuted, false);
  assert.equal(profile.data.profile.externalNetworkRequested, false);
  assert.equal(profile.data.profile.deviceRequested, false);
  assert.equal(profile.data.profile.aiProviderRequested, false);
  assert.equal(profile.data.profile.calendarProviderRequested, false);
  assert.equal(profile.data.profile.emailProviderRequested, false);
  assert.equal(profile.data.profile.notificationDelivered, false);

  for (const filePath of [
    "features/connections/profile-contract.ts",
    "features/connections/mock-profile-service.ts",
    "app/api/connections/[id]/stage/route.ts",
    "app/api/connections/[id]/profile/route.ts",
    "features/connections/relationship-stage-and-profile-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(
      source,
      /calendar provider|email provider|notification provider|database provider/i,
    );
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
  }
});

test("relationship stage and profile API routes return stable envelopes", async () => {
  const stageRoute = await importProjectModule<{
    PATCH: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/connections/[id]/stage/route.ts");
  const profileRoute = await importProjectModule<{
    PATCH: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/connections/[id]/profile/route.ts");
  const contract = await importProjectModule<
    typeof import("../../features/connections/profile-contract")
  >("features/connections/profile-contract.ts");
  const routeContext = { params: Promise.resolve({ id: "demo-connection-1" }) };

  const stageResponse = await stageRoute.PATCH(
    new Request("https://orbit.local/api/connections/demo-connection-1/stage", {
      body: JSON.stringify({ relationshipStage: "active" }),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    }),
    routeContext,
  );
  const profileResponse = await profileRoute.PATCH(
    new Request("https://orbit.local/api/connections/demo-connection-1/profile", {
      body: JSON.stringify({
        context:
          "Kenji asked for a storage pilot operator introduction after the climate founders dinner.",
        mutualValue: {
          contactReceives:
            "A warm operator introduction for storage pilot validation.",
          orbitUserReceives:
            "A qualified climate infrastructure founder conversation.",
          valueTypes: ["commercial_opportunity", "knowledge_exchange"],
        },
        nextAction: {
          label: "Send storage pilot operator intro",
          rationale:
            "The intro is the highest-signal action from the latest source-backed context.",
        },
        relationshipType: "customer_candidate",
      }),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    }),
    routeContext,
  );
  const emptyResponse = await stageRoute.PATCH(
    new Request(
      "https://orbit.local/api/connections/demo-connection-1/stage?scenario=empty",
      {
        body: JSON.stringify({ relationshipStage: "active" }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    ),
    routeContext,
  );
  const failureResponse = await stageRoute.PATCH(
    new Request(
      "https://orbit.local/api/connections/demo-connection-1/stage?scenario=failure",
      {
        body: JSON.stringify({ relationshipStage: "active" }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    ),
    routeContext,
  );
  const pendingResponse = await profileRoute.PATCH(
    new Request(
      "https://orbit.local/api/connections/demo-connection-1/profile?scenario=pending",
      {
        body: JSON.stringify({ relationshipType: "customer_candidate" }),
        headers: {
          "content-type": "application/json",
        },
        method: "PATCH",
      },
    ),
    routeContext,
  );
  const noBodyStageResponse = await stageRoute.PATCH(
    new Request("https://orbit.local/api/connections/demo-connection-1/stage", {
      method: "PATCH",
    }),
    routeContext,
  );
  const noBodyProfileResponse = await profileRoute.PATCH(
    new Request("https://orbit.local/api/connections/demo-connection-1/profile", {
      method: "PATCH",
    }),
    routeContext,
  );
  const missingResponse = await profileRoute.PATCH(
    new Request("https://orbit.local/api/connections/missing-connection/profile", {
      body: JSON.stringify({ relationshipType: "customer_candidate" }),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    }),
    { params: Promise.resolve({ id: "missing-connection" }) },
  );
  const invalidStageResponse = await stageRoute.PATCH(
    new Request("https://orbit.local/api/connections/demo-connection-1/stage", {
      body: JSON.stringify({ relationshipStage: "unknown-stage" }),
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    }),
    routeContext,
  );
  const malformedResponse = await profileRoute.PATCH(
    new Request("https://orbit.local/api/connections/demo-connection-1/profile", {
      body: "{",
      headers: {
        "content-type": "application/json",
      },
      method: "PATCH",
    }),
    routeContext,
  );

  assert.equal(stageResponse.status, 200);
  assert.equal(stageResponse.headers.get("cache-control"), "no-store");
  assert.equal(stageResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await stageResponse.json(), {
    success: true,
    data: contract.mockRelationshipStageUpdateFixture,
  });

  assert.equal(profileResponse.status, 200);
  assert.deepEqual(await profileResponse.json(), {
    success: true,
    data: contract.mockRelationshipProfileUpdateFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: contract.mockEmptyRelationshipProfileFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: contract.mockPendingRelationshipProfileFixture,
  });

  assert.equal(noBodyStageResponse.status, 200);
  assert.deepEqual(await noBodyStageResponse.json(), {
    success: true,
    data: contract.mockRelationshipStageUpdateFixture,
  });

  assert.equal(noBodyProfileResponse.status, 200);
  assert.deepEqual(await noBodyProfileResponse.json(), {
    success: true,
    data: contract.mockRelationshipProfileUpdateFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock relationship stage and profile boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship profile failure came from deterministic fixture rules.",
        relationshipProfileErrorCode:
          "RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED",
        service: "relationship-stage-and-profile-mock",
      },
    },
  });

  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "That mock connection is not available for profile staging.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship profile failure came from deterministic fixture rules.",
        relationshipProfileErrorCode: "RELATIONSHIP_PROFILE_NOT_FOUND",
        service: "relationship-stage-and-profile-mock",
      },
    },
  });

  assert.equal(invalidStageResponse.status, 400);
  assert.deepEqual(await invalidStageResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "The requested relationship stage is not supported by Orbit.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship profile failure came from deterministic fixture rules.",
        relationshipProfileErrorCode:
          "RELATIONSHIP_PROFILE_STAGE_NOT_SUPPORTED",
        service: "relationship-stage-and-profile-mock",
      },
    },
  });

  assert.equal(malformedResponse.status, 400);
  assert.deepEqual(await malformedResponse.json(), {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "The mock relationship profile request body must be valid JSON.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock relationship profile failure came from deterministic fixture rules.",
        relationshipProfileErrorCode: "RELATIONSHIP_PROFILE_INVALID_BODY",
        service: "relationship-stage-and-profile-mock",
      },
    },
  });
});

test("relationship stage and profile debug route renders states and live handoff", async () => {
  const debugView = await importProjectModule<
    typeof import("../../features/connections/relationship-stage-and-profile-mock/debug-view")
  >(
    "features/connections/relationship-stage-and-profile-mock/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.RelationshipStageAndProfileMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/connections/relationship-stage-and-profile-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.RELATIONSHIP_STAGE_AND_PROFILE_MOCK_SLUG,
    "relationship-stage-and-profile-mock",
  );
  assert.match(pageSource, /RELATIONSHIP_STAGE_AND_PROFILE_MOCK_SLUG/);
  assert.match(pageSource, /RelationshipStageAndProfileMockDemo/);

  assert.match(html, /Relationship stage and profile mock/);
  assert.match(html, /aria-label="Relationship stage profile operator checkpoint"/);
  assert.match(html, /Relationship type/);
  assert.match(html, /Stage/);
  assert.match(html, /Context/);
  assert.match(html, /Mutual value/);
  assert.match(html, /Latest summary/);
  assert.match(html, /Next action/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Kenji Watanabe/);
  assert.match(html, /customer_candidate/);
  assert.match(html, /database reads false; database writes false/);
  assert.match(html, /ai provider false/);
  assert.match(html, /RELATIONSHIP_PROFILE_SERVICE_MOCK_FAILED/);
  assert.match(html, /PATCH \/api\/connections\/demo-connection-1\/stage/);
  assert.match(html, /PATCH \/api\/connections\/demo-connection-1\/profile/);
  assert.match(html, /PATCH \/api\/connections\/demo-connection-1\/stage\?scenario=empty/);
  assert.match(html, /PATCH \/api\/connections\/demo-connection-1\/profile\?scenario=pending/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_RELATIONSHIP_PROFILE_PROVIDER/);
  assert.match(html, /relationship-profile-workbench/);

  assert.match(
    liveDoc,
    /features\/connections\/relationship-stage-and-profile-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/connections\/relationship-stage-and-profile-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_RELATIONSHIP_PROFILE_PROVIDER/);
  assert.match(liveDoc, /stage automation/);
  assert.match(liveDoc, /relationship profiling/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/i);
  assert.match(liveDoc, /body-less PATCH probes/);
});
