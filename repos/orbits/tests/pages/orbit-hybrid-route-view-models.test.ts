import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { getOrbitLandingViewModel } from "../../app/(app)/app/orbit-landing-route-view-model";
import type { MockRuntimeFixtures } from "../../shared/mock/fixtures";
import { defaultMockFixtures } from "../../shared/mock/fixtures";

function createHybridRouteSeed(): MockRuntimeFixtures {
  const generatedAt = "2026-06-30T08:00:00.000Z";
  const accountId = "account_hybrid_routes";
  const profileId = "profile_hybrid_routes";
  const eventId = "event_hybrid_routes";
  const contactId = "contact_hybrid_ava";
  const connectionId = "connection_hybrid_ava";
  const attendeeId = "attendee_hybrid_ava";
  const source = {
    type: "event_import" as const,
    id: "source:hybrid-routes",
    label: "Hybrid routes seed",
  };

  return {
    ...defaultMockFixtures,
    id: "mock_fixture_hybrid_route_pages",
    label: "Hybrid route pages",
    description: "Seed for app route view models backed by local remote data.",
    generatedAt,
    accounts: [
      {
        id: accountId,
        name: "Hybrid Routes Workspace",
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
    ],
    profiles: [
      {
        id: profileId,
        accountId,
        displayName: "Route Tester",
        role: "Hybrid Product Lead",
        timezone: "Asia/Tokyo",
        createdAt: generatedAt,
        updatedAt: generatedAt,
      },
    ],
    evidence: [
      {
        id: "evidence_hybrid_routes_event",
        sourceType: "event_import",
        sourceId: eventId,
        summary: "Hybrid Routes Investor Salon is used to validate route page data wiring.",
        occurredAt: "2026-07-05T09:00:00.000Z",
        confidence: 0.94,
        createdBy: profileId,
      },
      {
        id: "evidence_hybrid_routes_contact",
        sourceType: "manual",
        sourceId: contactId,
        summary: "Ava Route wants to review the route model migration.",
        occurredAt: "2026-06-30T07:30:00.000Z",
        confidence: 0.91,
        createdBy: profileId,
      },
    ],
    events: [
      {
        id: eventId,
        name: "Hybrid Routes Investor Salon",
        location: "Orbit Lab",
        startsAt: "2026-07-05T09:00:00.000Z",
        endsAt: "2026-07-05T11:00:00.000Z",
        source,
        evidenceIds: ["evidence_hybrid_routes_event"],
      },
    ],
    attendees: [
      {
        id: attendeeId,
        eventId,
        contactId,
        displayName: "Ava Route",
        organization: "Route Ventures",
        role: "Partner",
        status: "reviewed",
        source,
        evidenceIds: ["evidence_hybrid_routes_contact"],
        createdAt: "2026-06-30T07:35:00.000Z",
        updatedAt: generatedAt,
      },
    ],
    eventParticipantIntents: [
      {
        id: "event_intent_hybrid_ava",
        eventId,
        attendeeId,
        contactId,
        lookingFor: ["route model migration evidence"],
        canOffer: ["hybrid investor feedback"],
        preferredLanguage: "en",
        confidence: 0.87,
        source,
        evidenceIds: ["evidence_hybrid_routes_contact"],
        createdAt: "2026-06-30T07:36:00.000Z",
        updatedAt: generatedAt,
      },
    ],
    contacts: [
      {
        id: contactId,
        displayName: "Ava Route",
        organization: "Route Ventures",
        role: "Partner",
        location: "Orbit Lab",
        primaryEmail: "ava.route@example.test",
        primaryPhone: "+81-90-0000-1111",
        profileSnippet: "Investor validating Orbit hybrid route models.",
        stage: "needs_follow_up",
        source: {
          type: "manual",
          id: "source:hybrid-ava",
          label: "Hybrid route contact seed",
        },
        evidenceIds: ["evidence_hybrid_routes_contact"],
        createdAt: "2026-06-30T07:35:00.000Z",
        updatedAt: generatedAt,
      },
    ],
    connections: [
      {
        id: connectionId,
        accountId,
        contactId,
        stage: "needs_follow_up",
        valueTypes: ["commercial_opportunity", "knowledge_exchange"],
        summary: "Ava Route is validating the hybrid route data migration.",
        relationshipStrength: 88,
        trustLevel: "warm",
        businessRelevanceScore: 93,
        sharedTopics: ["hybrid data", "route models"],
        suggestedActions: ["review hybrid route migration"],
        source: {
          type: "manual",
          id: "source:hybrid-ava-connection",
          label: "Hybrid route connection seed",
        },
        evidenceIds: ["evidence_hybrid_routes_contact"],
        createdAt: "2026-06-30T07:37:00.000Z",
        updatedAt: generatedAt,
      },
    ],
    matchRecommendations: [
      {
        id: "match_hybrid_ava",
        eventId,
        attendeeId,
        contactId,
        connectionId,
        recommendationType: "warm_intro",
        score: 97,
        businessRelevanceScore: 93,
        sharedTopics: ["hybrid data", "route models"],
        suggestedActions: ["send Ava the route migration summary"],
        reason: "Ava Route has the strongest evidence for testing hybrid route data.",
        source: {
          type: "agent_action",
          id: "source:hybrid-ava-match",
          label: "Hybrid route match seed",
        },
        evidenceIds: ["evidence_hybrid_routes_contact"],
        createdAt: "2026-06-30T07:38:00.000Z",
        updatedAt: generatedAt,
      },
    ],
    tasks: [
      {
        id: "task_hybrid_ava_review",
        title: "Review Ava route migration",
        status: "open",
        contactId,
        connectionId,
        dueAt: "2026-07-01T02:00:00.000Z",
        source: {
          type: "agent_action",
          id: "source:hybrid-ava-task",
          label: "Hybrid route task seed",
        },
        evidenceIds: ["evidence_hybrid_routes_contact"],
        createdAt: "2026-06-30T07:40:00.000Z",
        updatedAt: generatedAt,
      },
    ],
  };
}

function withHybridSeed(run: () => void) {
  const previousMode = process.env.ORBIT_MODULE_MODE;
  const previousSeed = process.env.ORBIT_LOCAL_REMOTE_DATABASE_SEED_JSON;

  try {
    process.env.ORBIT_MODULE_MODE = "hybrid";
    process.env.ORBIT_LOCAL_REMOTE_DATABASE_SEED_JSON = JSON.stringify(
      createHybridRouteSeed(),
    );

    run();
  } finally {
    if (previousMode === undefined) {
      delete process.env.ORBIT_MODULE_MODE;
    } else {
      process.env.ORBIT_MODULE_MODE = previousMode;
    }

    if (previousSeed === undefined) {
      delete process.env.ORBIT_LOCAL_REMOTE_DATABASE_SEED_JSON;
    } else {
      process.env.ORBIT_LOCAL_REMOTE_DATABASE_SEED_JSON = previousSeed;
    }
  }
}

test("public landing catalogue does not expose hybrid account or contact identity", () => {
  withHybridSeed(() => {
    const landing = getOrbitLandingViewModel();
    const hybridEvent = landing.events.find((event) =>
      event.name.includes("Hybrid Routes Investor Salon"),
    );

    assert.equal(landing.account.fullName, "Orbit");
    assert.deepEqual(landing.connections, []);
    assert.ok(hybridEvent);
    assert.equal(hybridEvent.host, "Orbit");
    assert.equal(hybridEvent.organizer, "Orbit");
    assert.deepEqual(hybridEvent.stats.attendees, []);
    assert.equal(hybridEvent.stats.authed, false);
    assert.equal(hybridEvent.stats.youRsvped, false);
    assert.equal(hybridEvent.youRsvped, false);
  });
});

test("legacy route files no longer embed old product sample records", () => {
  assert.equal(
    existsSync("app/(app)/app/orbit-hybrid-route-data.ts"),
    false,
    "the retired hybrid route data module must not return",
  );

  const routeFiles = [
    "app/(app)/app/orbit-admin-platform-route-view-model.ts",
    "app/(app)/app/orbit-agent-route-view-model.ts",
    "app/(app)/app/orbit-contacts-route-view-model.ts",
    "app/(app)/app/orbit-home-route-view-model.ts",
    "app/(app)/app/orbit-event-view-helpers.ts",
    "app/(app)/app/orbit-landing-route-view-model.ts",
    "app/(app)/app/orbit-party-route-view-model.ts",
    "app/(app)/app/orbit-profile-route-view-model.ts",
    "app/(app)/app/orbit-schedule-route-view-model.ts",
    "app/(app)/app/admin/orbit-real-admin-login.tsx",
    "app/(app)/app/admin/orbit-real-admin-shell.tsx",
    "app/(app)/app/admin/orbit-real-admin-workspace.tsx",
    "app/(app)/app/admin/orbit-real-admin-events.tsx",
    "app/(app)/app/dashboard/orbit-real-party.tsx",
  ];
  const eventHelperSource = readFileSync(
    "app/(app)/app/orbit-event-view-helpers.ts",
    "utf8",
  );
  const legacyTerms = [
    "Tokyo Business Connect",
    "TBC26S",
    "李明",
    "山田 健太",
    "三菱商事",
    "华为日本",
    "Sequoia",
    "Rakuten",
    "Tokyo Tech Co., Ltd.",
    "东京科技有限公司",
  ];

  assert.doesNotMatch(
    eventHelperSource,
    /local-remote-store|shared\/mock|getOrbitHybridRouteData/,
  );

  for (const routeFile of routeFiles) {
    const source = readFileSync(routeFile, "utf8");

    for (const legacyTerm of legacyTerms) {
      assert.equal(
        source.includes(legacyTerm),
        false,
        `${routeFile} still embeds legacy sample term ${legacyTerm}`,
      );
    }
  }
});
