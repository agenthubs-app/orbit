/**
 * Referral/recommended contact 确认 mock 的契约测试。
 *
 * 验证推荐联系人、草稿确认和引荐来源 provenance。
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
    `${pathFromRoot} must exist for the referral and recommended contact confirm mock sprint`,
  );

  return (await import(pathToFileURL(absolutePath).href)) as TModule;
}

test("referral recommendation contract exposes referral sources recommender context confirmed contacts and errors", async () => {
  const contract = await importProjectModule<{
    REFERRAL_RECOMMENDATION_ERROR_CODES: readonly string[];
    REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS: Record<
      string,
      { appCode: string; recovery: string }
    >;
    REFERRAL_RECOMMENDATION_FIXTURE_SOURCE: string;
    REFERRAL_SOURCE_KINDS: readonly string[];
    mockReferralRecommendationFixture: {
      state: string;
      referralSources: readonly Array<{
        kind: string;
        label: string;
        recommenderCount: number;
        externalNetworkRequested: false;
        automaticOutreachExecuted: false;
      }>;
      recommendations: readonly Array<{
        id: string;
        displayName: string;
        sourceKind: string;
        recommender: {
          displayName: string;
          relationshipToUser: string;
          warmPath: string;
          externalNetworkDiscoveryExecuted: false;
          automaticOutreachExecuted: false;
        };
        confirmation: { required: true; state: string };
        multiHopSocialGraphDiscoveryExecuted: false;
        automaticFriendOfFriendOutreachExecuted: false;
        externalNetworkRequested: false;
        databaseWriteExecuted: false;
        aiProviderRequested: false;
        notificationDelivered: false;
      }>;
      contactDrafts: readonly Array<{
        id: string;
        recommendationId: string;
        displayName: string;
        confirmationRequired: true;
        userConfirmed: false;
        contactWriteExecuted: false;
        externalActionExecuted: false;
        databaseWriteExecuted: false;
      }>;
      provenance: {
        source: string;
        evidenceIds: readonly string[];
        multiHopSocialGraphDiscoveryExecuted: false;
        automaticFriendOfFriendOutreachExecuted: false;
        externalNetworkRequested: false;
        deviceContactReadExecuted: false;
        calendarReadExecuted: false;
        emailReadExecuted: false;
        databaseWriteExecuted: false;
        aiProviderRequested: false;
        notificationDelivered: false;
      };
    };
    mockEmptyReferralRecommendationFixture: {
      state: string;
      recommendations: readonly unknown[];
      contactDrafts: readonly unknown[];
      nextAction: string;
    };
    mockPendingReferralRecommendationFixture: {
      state: string;
      recommendations: readonly unknown[];
      contactDrafts: readonly unknown[];
      nextAction: string;
    };
    mockConfirmedRecommendedContactFixture: {
      state: string;
      confirmedContact: {
        id: string;
        recommendationId: string;
        displayName: string;
        userConfirmed: true;
        contactWriteExecuted: false;
        externalOutreachExecuted: false;
        databaseWriteExecuted: false;
        notificationDelivered: false;
      };
      provenance: { source: string; evidenceIds: readonly string[] };
    };
  }>("features/acquisition/referral-contract.ts");
  const serviceModule = await importProjectModule<{
    createMockReferralRecommendationService: () => {
      createReferralContactDrafts: (input?: {
        sourceKind?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockReferralRecommendationFixture;
        error?: { code: string; appCode: string };
      };
      confirmRecommendedContact: (input: {
        recommendationId: string;
        actorLabel?: string | null;
        scenario?: string | null;
      }) => {
        success: boolean;
        data?: typeof contract.mockConfirmedRecommendedContactFixture;
        error?: { code: string; appCode: string };
      };
    };
  }>("features/acquisition/mock-referral-service.ts");

  const service = serviceModule.createMockReferralRecommendationService();
  const success = service.createReferralContactDrafts();
  const investorOnly = service.createReferralContactDrafts({
    sourceKind: "investor_intro",
  });
  const empty = service.createReferralContactDrafts({ scenario: "empty" });
  const pending = service.createReferralContactDrafts({ scenario: "pending" });
  const failure = service.createReferralContactDrafts({ scenario: "failure" });
  const confirmed = service.confirmRecommendedContact({
    recommendationId: "demo-recommendation-1",
    actorLabel: "Demo operator",
  });
  const missing = service.confirmRecommendedContact({
    recommendationId: "missing-recommendation",
  });

  assert.deepEqual(contract.REFERRAL_SOURCE_KINDS, [
    "founder_referral",
    "investor_intro",
    "community_referral",
  ]);
  assert.deepEqual(contract.REFERRAL_RECOMMENDATION_ERROR_CODES, [
    "REFERRAL_SOURCE_NOT_SUPPORTED",
    "REFERRAL_RECOMMENDATION_NOT_FOUND",
    "REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED",
    "REFERRAL_RECOMMENDATION_PENDING",
    "REFERRAL_RECOMMENDATION_MOCK_FAILED",
  ]);
  assert.equal(
    contract.REFERRAL_RECOMMENDATION_ERROR_DEFINITIONS
      .REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED.appCode,
    "FORBIDDEN",
  );

  assert.equal(success.success, true);
  assert.equal(success.data?.state, "success");
  assert.equal(success.data?.referralSources.length, 3);
  assert.deepEqual(
    success.data?.referralSources.map((source) => source.kind),
    ["founder_referral", "investor_intro", "community_referral"],
  );
  assert.equal(success.data?.referralSources[0]?.externalNetworkRequested, false);
  assert.equal(success.data?.referralSources[0]?.automaticOutreachExecuted, false);
  assert.equal(success.data?.recommendations.length, 3);
  assert.equal(success.data?.recommendations[0]?.id, "demo-recommendation-1");
  assert.equal(success.data?.recommendations[0]?.confirmation.required, true);
  assert.equal(success.data?.recommendations[0]?.confirmation.state, "pending");
  assert.equal(
    success.data?.recommendations[0]?.recommender.displayName,
    "Maya Chen",
  );
  assert.equal(
    success.data?.recommendations[0]?.recommender.externalNetworkDiscoveryExecuted,
    false,
  );
  assert.equal(
    success.data?.recommendations[0]?.multiHopSocialGraphDiscoveryExecuted,
    false,
  );
  assert.equal(
    success.data?.recommendations[0]?.automaticFriendOfFriendOutreachExecuted,
    false,
  );
  assert.equal(success.data?.recommendations[0]?.externalNetworkRequested, false);
  assert.equal(success.data?.recommendations[0]?.databaseWriteExecuted, false);
  assert.equal(success.data?.recommendations[0]?.aiProviderRequested, false);
  assert.equal(success.data?.recommendations[0]?.notificationDelivered, false);
  assert.equal(success.data?.contactDrafts.length, 3);
  assert.equal(success.data?.contactDrafts[0]?.confirmationRequired, true);
  assert.equal(success.data?.contactDrafts[0]?.userConfirmed, false);
  assert.equal(success.data?.contactDrafts[0]?.contactWriteExecuted, false);
  assert.equal(success.data?.contactDrafts[0]?.externalActionExecuted, false);
  assert.equal(success.data?.contactDrafts[0]?.databaseWriteExecuted, false);
  assert.equal(
    success.data?.provenance.source,
    contract.REFERRAL_RECOMMENDATION_FIXTURE_SOURCE,
  );
  assert.equal(
    success.data?.provenance.multiHopSocialGraphDiscoveryExecuted,
    false,
  );
  assert.equal(
    success.data?.provenance.automaticFriendOfFriendOutreachExecuted,
    false,
  );
  assert.equal(success.data?.provenance.externalNetworkRequested, false);
  assert.equal(success.data?.provenance.deviceContactReadExecuted, false);
  assert.equal(success.data?.provenance.calendarReadExecuted, false);
  assert.equal(success.data?.provenance.emailReadExecuted, false);
  assert.equal(success.data?.provenance.databaseWriteExecuted, false);
  assert.equal(success.data?.provenance.aiProviderRequested, false);
  assert.equal(success.data?.provenance.notificationDelivered, false);

  assert.equal(investorOnly.success, true);
  assert.deepEqual(
    investorOnly.data?.recommendations.map(
      (recommendation) => recommendation.sourceKind,
    ),
    ["investor_intro"],
  );
  assert.equal(
    investorOnly.data?.provenance.source,
    contract.REFERRAL_RECOMMENDATION_FIXTURE_SOURCE,
  );

  assert.equal(empty.success, true);
  assert.equal(empty.data?.state, "empty");
  assert.equal(empty.data?.recommendations.length, 0);
  assert.equal(empty.data?.contactDrafts.length, 0);
  assert.equal(
    empty.data?.nextAction,
    "Ask a trusted recommender to share a mock referral before staging recommended contact drafts.",
  );

  assert.equal(pending.success, true);
  assert.equal(pending.data?.state, "pending");
  assert.equal(pending.data?.contactDrafts.length, 0);

  assert.equal(failure.success, false);
  assert.equal(failure.error?.code, "REFERRAL_RECOMMENDATION_MOCK_FAILED");
  assert.equal(failure.error?.appCode, "SERVICE_UNAVAILABLE");

  assert.equal(confirmed.success, true);
  assert.equal(confirmed.data?.state, "confirmed");
  assert.equal(
    confirmed.data?.confirmedContact.recommendationId,
    "demo-recommendation-1",
  );
  assert.equal(confirmed.data?.confirmedContact.userConfirmed, true);
  assert.equal(confirmed.data?.confirmedContact.contactWriteExecuted, false);
  assert.equal(confirmed.data?.confirmedContact.externalOutreachExecuted, false);
  assert.equal(confirmed.data?.confirmedContact.databaseWriteExecuted, false);
  assert.equal(confirmed.data?.confirmedContact.notificationDelivered, false);

  assert.equal(missing.success, false);
  assert.equal(missing.error?.code, "REFERRAL_RECOMMENDATION_NOT_FOUND");
});

test("mock referral recommendation service is deterministic rule-based code with no external provider calls", async () => {
  const serviceModule = await importProjectModule<{
    createMockReferralRecommendationService: () => {
      createReferralContactDrafts: (input?: {
        sourceKind?: string | null;
        scenario?: string | null;
      }) => unknown;
      confirmRecommendedContact: (input: {
        recommendationId: string;
        scenario?: string | null;
      }) => unknown;
    };
  }>("features/acquisition/mock-referral-service.ts");
  const service = serviceModule.createMockReferralRecommendationService();
  const filterInput = { sourceKind: "community_referral" };

  assert.deepEqual(
    service.createReferralContactDrafts(),
    service.createReferralContactDrafts(),
  );
  assert.deepEqual(
    service.createReferralContactDrafts({ scenario: "unknown-scenario" }),
    service.createReferralContactDrafts(),
  );
  assert.deepEqual(
    service.createReferralContactDrafts(filterInput),
    service.createReferralContactDrafts(filterInput),
  );
  assert.deepEqual(
    service.confirmRecommendedContact({
      recommendationId: "demo-recommendation-1",
    }),
    service.confirmRecommendedContact({
      recommendationId: "demo-recommendation-1",
    }),
  );

  const filtered = service.createReferralContactDrafts(filterInput) as {
    success: true;
    data: {
      recommendations: readonly Array<{
        sourceKind: string;
        displayName: string;
      }>;
      provenance: { generationMethod: string };
    };
  };
  const blocked = service.confirmRecommendedContact({
    recommendationId: "demo-recommendation-1",
    scenario: "blocked",
  }) as { success: false; error: { code: string; appCode: string } };
  const unsupported = service.createReferralContactDrafts({
    sourceKind: "linkedin",
  }) as { success: false; error: { code: string; appCode: string } };

  assert.equal(filtered.success, true);
  assert.equal(
    filtered.data.provenance.generationMethod,
    "rule-based-referral-recommendation",
  );
  assert.deepEqual(
    filtered.data.recommendations.map((recommendation) => recommendation.sourceKind),
    ["community_referral"],
  );
  assert.deepEqual(
    filtered.data.recommendations.map((recommendation) => recommendation.displayName),
    ["Rina Park"],
  );
  assert.equal(blocked.success, false);
  assert.equal(
    blocked.error.code,
    "REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED",
  );
  assert.equal(blocked.error.appCode, "FORBIDDEN");
  assert.equal(unsupported.success, false);
  assert.equal(unsupported.error.code, "REFERRAL_SOURCE_NOT_SUPPORTED");

  for (const filePath of [
    "features/acquisition/referral-contract.ts",
    "features/acquisition/mock-referral-service.ts",
    "app/api/contact-drafts/referral/route.ts",
    "app/api/contact-drafts/recommended/[id]/confirm/route.ts",
    "features/acquisition/referral-and-recommended-contact-confirm-mock/debug-view.tsx",
  ]) {
    const source = readFileSync(join(projectRoot, filePath), "utf8");

    assert.doesNotMatch(source, /\bfetch\s*\(/);
    assert.doesNotMatch(source, /Supabase|createClient|OAuth/i);
    assert.doesNotMatch(source, /XMLHttpRequest|WebSocket|EventSource/);
    assert.doesNotMatch(source, /navigator|mediaDevices|localStorage|indexedDB/);
    assert.doesNotMatch(source, /from ["']node:net["']|from ["']node:http/);
    assert.doesNotMatch(source, /googleapis|microsoft-graph-client|GraphServiceClient/);
    assert.doesNotMatch(source, /openai|anthropic|ai provider/i);
    assert.doesNotMatch(source, /linkedin|twitter|facebook|instagram/i);
  }
});

test("referral recommendation API routes return stable envelopes with empty pending and failure paths", async () => {
  const referralRoute = await importProjectModule<{
    POST: (request: Request) => Promise<Response>;
  }>("app/api/contact-drafts/referral/route.ts");
  const confirmRoute = await importProjectModule<{
    POST: (
      request: Request,
      context: { params: Promise<{ id: string }> },
    ) => Promise<Response>;
  }>("app/api/contact-drafts/recommended/[id]/confirm/route.ts");
  const fixtures = await importProjectModule<{
    mockReferralRecommendationFixture: unknown;
    mockEmptyReferralRecommendationFixture: unknown;
    mockPendingReferralRecommendationFixture: unknown;
    mockConfirmedRecommendedContactFixture: unknown;
  }>("features/acquisition/referral-contract.ts");

  const referralResponse = await referralRoute.POST(
    new Request("https://orbit.local/api/contact-drafts/referral", {
      method: "POST",
    }),
  );
  const emptyResponse = await referralRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/referral?scenario=empty",
      { method: "POST" },
    ),
  );
  const pendingResponse = await referralRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/referral?scenario=pending",
      { method: "POST" },
    ),
  );
  const failureResponse = await referralRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/referral?scenario=failure",
      { method: "POST" },
    ),
  );
  const confirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/recommended/demo-recommendation-1/confirm",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "demo-recommendation-1" }) },
  );
  const blockedConfirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/recommended/demo-recommendation-1/confirm?scenario=blocked",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "demo-recommendation-1" }) },
  );
  const missingConfirmResponse = await confirmRoute.POST(
    new Request(
      "https://orbit.local/api/contact-drafts/recommended/missing-recommendation/confirm",
      { method: "POST" },
    ),
    { params: Promise.resolve({ id: "missing-recommendation" }) },
  );

  assert.equal(referralResponse.status, 201);
  assert.equal(referralResponse.headers.get("cache-control"), "no-store");
  assert.equal(referralResponse.headers.get("x-orbit-feature-mode"), "mock");
  assert.deepEqual(await referralResponse.json(), {
    success: true,
    data: fixtures.mockReferralRecommendationFixture,
  });

  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(await emptyResponse.json(), {
    success: true,
    data: fixtures.mockEmptyReferralRecommendationFixture,
  });

  assert.equal(pendingResponse.status, 200);
  assert.deepEqual(await pendingResponse.json(), {
    success: true,
    data: fixtures.mockPendingReferralRecommendationFixture,
  });

  assert.equal(confirmResponse.status, 200);
  assert.deepEqual(await confirmResponse.json(), {
    success: true,
    data: fixtures.mockConfirmedRecommendedContactFixture,
  });

  assert.equal(failureResponse.status, 503);
  assert.deepEqual(await failureResponse.json(), {
    success: false,
    error: {
      code: "SERVICE_UNAVAILABLE",
      message:
        "The mock referral recommendation boundary is pinned to a controlled failure scenario.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock referral recommendation failure came from deterministic fixture rules.",
        referralRecommendationErrorCode:
          "REFERRAL_RECOMMENDATION_MOCK_FAILED",
        service: "referral-and-recommended-contact-confirm-mock",
      },
    },
  });

  assert.equal(blockedConfirmResponse.status, 403);
  assert.deepEqual(await blockedConfirmResponse.json(), {
    success: false,
    error: {
      code: "FORBIDDEN",
      message:
        "The mock recommended contact requires explicit user confirmation before it becomes a contact draft.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock referral recommendation failure came from deterministic fixture rules.",
        referralRecommendationErrorCode:
          "REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED",
        service: "referral-and-recommended-contact-confirm-mock",
      },
    },
  });

  assert.equal(missingConfirmResponse.status, 404);
  assert.deepEqual(await missingConfirmResponse.json(), {
    success: false,
    error: {
      code: "NOT_FOUND",
      message: "No mock recommended contact matches that id.",
      context: {
        boundary: "developer-admin",
        mode: "mock",
        privacy: "no-relationship-data",
        provenance:
          "Mock referral recommendation failure came from deterministic fixture rules.",
        referralRecommendationErrorCode: "REFERRAL_RECOMMENDATION_NOT_FOUND",
        service: "referral-and-recommended-contact-confirm-mock",
      },
    },
  });
});

test("referral recommendation debug route renders all states and the live replacement handoff", async () => {
  const debugView = await importProjectModule<{
    REFERRAL_RECOMMENDATION_MOCK_SLUG: string;
    ReferralRecommendationMockDemo: () => React.ReactElement;
  }>(
    "features/acquisition/referral-and-recommended-contact-confirm-mock/debug-view.tsx",
  );
  const html = renderToStaticMarkup(
    React.createElement(debugView.ReferralRecommendationMockDemo),
  );
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );
  const liveDocPath =
    "features/acquisition/referral-and-recommended-contact-confirm-mock/LIVE_IMPLEMENTATION.md";
  const liveDoc = readFileSync(join(projectRoot, liveDocPath), "utf8");

  assert.equal(
    debugView.REFERRAL_RECOMMENDATION_MOCK_SLUG,
    "referral-and-recommended-contact-confirm-mock",
  );
  assert.match(pageSource, /REFERRAL_RECOMMENDATION_MOCK_SLUG/);
  assert.match(pageSource, /ReferralRecommendationMockDemo/);

  assert.match(html, /Referral and recommended contact confirm mock/);
  assert.match(html, /aria-label="Referral recommendation operator checkpoint"/);
  assert.match(html, /Ready for verifier review/);
  assert.match(html, /Recommended contacts/);
  assert.match(html, /Founder referral fixture/);
  assert.match(html, /Investor intro fixture/);
  assert.match(html, /Community referral fixture/);
  assert.match(html, /confirmation required/);
  assert.match(html, /multi-hop graph false/);
  assert.match(html, /automatic outreach false/);
  assert.match(html, /provider calls false/);
  assert.match(html, /Success state/);
  assert.match(html, /Empty state/);
  assert.match(html, /Pending state/);
  assert.match(html, /Failure state/);
  assert.match(html, /Kai Mori/);
  assert.match(html, /Sofia Alvarez/);
  assert.match(html, /Rina Park/);
  assert.match(html, /User-confirmed recommended contact/);
  assert.match(
    html,
    /aria-label="Confirm mock recommended contact demo-recommendation-1"/,
  );
  assert.match(html, /Confirm recommended contact/);
  assert.match(
    html,
    /action="\/api\/contact-drafts\/recommended\/demo-recommendation-1\/confirm"/,
  );
  assert.match(html, /REFERRAL_RECOMMENDATION_MOCK_FAILED/);
  assert.match(html, /REFERRAL_RECOMMENDATION_CONFIRMATION_REQUIRED/);
  assert.match(html, /REFERRAL_RECOMMENDATION_NOT_FOUND/);
  assert.match(html, /POST \/api\/contact-drafts\/referral/);
  assert.match(
    html,
    /POST \/api\/contact-drafts\/recommended\/demo-recommendation-1\/confirm/,
  );
  assert.match(
    html,
    /POST \/api\/contact-drafts\/referral\?scenario=empty/,
  );
  assert.match(
    html,
    /POST \/api\/contact-drafts\/referral\?scenario=failure/,
  );
  assert.match(html, /Missing recommendation adversarial probe/);
  assert.match(html, /envelope success true/);
  assert.match(html, /envelope success false/);
  assert.match(html, new RegExp(liveDocPath));
  assert.match(html, /ORBIT_REFERRAL_RECOMMENDATION_PROVIDER/);
  assert.match(html, /referral-recommendation-workbench/);
  assert.match(
    html,
    /\.referral-recommendation-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );

  assert.match(
    liveDoc,
    /features\/acquisition\/referral-and-recommended-contact-confirm-mock\/live-service\.ts/,
  );
  assert.match(
    liveDoc,
    /features\/acquisition\/referral-and-recommended-contact-confirm-mock\/providers\//,
  );
  assert.match(liveDoc, /ORBIT_REFERRAL_RECOMMENDATION_PROVIDER/);
  assert.match(liveDoc, /referral source/);
  assert.match(liveDoc, /recommender context/);
  assert.match(liveDoc, /user confirmation/);
  assert.match(liveDoc, /privacy/);
  assert.match(liveDoc, /provenance/);
  assert.match(liveDoc, /replacement tests/);
});
