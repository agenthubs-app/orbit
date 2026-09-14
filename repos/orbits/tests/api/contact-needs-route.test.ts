import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactNeedsGetHandler,
  type ContactNeedsRouteDependencies,
} from "../../app/api/contacts/needs-matches/handler";

const payload = {
  schemaVersion: 1 as const,
  state: "ready" as const,
  goal: "寻找日本制造业采购合作伙伴",
  goalVersion: "2026-09-15T00:00:00.000Z",
  dataVersion: "a".repeat(64),
  scoringVersion: "needs-lexical-v1" as const,
  generatedAt: "2026-09-15T00:00:01.000Z",
  criteria: [],
  matches: [],
  provenance: {
    generationMethod: "rule-based-contact-needs-ranking" as const,
    databaseQueryExecuted: true,
    aiProviderRequested: false as const,
    externalNetworkRequested: false as const,
    businessDataWritten: false as const,
  },
};

function dependencies(overrides: Partial<ContactNeedsRouteDependencies> = {}): ContactNeedsRouteDependencies {
  return {
    resolveActor: async () => ({ id: "account:one" }),
    resolveMode: () => "live",
    createService: () => ({ getMatches: async () => ({ success: true, data: payload }) }),
    ...overrides,
  };
}

test("contact needs route rejects unauthenticated requests before creating a service", async () => {
  let created = false;
  const GET = createContactNeedsGetHandler(dependencies({
    resolveActor: async () => null,
    createService: () => {
      created = true;
      throw new Error("must not run");
    },
  }));
  const response = await GET(new Request("http://localhost/api/contacts/needs-matches"));
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
  assert.equal(created, false);
});

test("contact needs route uses only the authenticated actor and returns a no-store envelope", async () => {
  let receivedActorId = "";
  const GET = createContactNeedsGetHandler(dependencies({
    createService: () => ({
      getMatches: async ({ actorId }) => {
        receivedActorId = actorId;
        return { success: true, data: payload };
      },
    }),
  }));
  const response = await GET(new Request("http://localhost/api/contacts/needs-matches?actorId=account:other"));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(receivedActorId, "account:one");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body, { success: true, data: payload });
});

test("contact needs route maps a changed goal to conflict and source failures to unavailable", async () => {
  for (const [code, status] of [["CONTACT_NEED_CHANGED", 409], ["CONTACT_NEEDS_SOURCE_UNAVAILABLE", 503]] as const) {
    const GET = createContactNeedsGetHandler(dependencies({
      createService: () => ({ getMatches: async () => ({ success: false, error: { code } }) }),
    }));
    const response = await GET(new Request("http://localhost/api/contacts/needs-matches"));
    const body = await response.json();
    assert.equal(response.status, status);
    assert.equal(body.success, false);
  }
});

test("contact needs route does not return a malformed success payload", async () => {
  const GET = createContactNeedsGetHandler(dependencies({
    createService: () => ({
      getMatches: async () => ({
        success: true,
        data: { ...payload, dataVersion: "not-a-version" },
      }) as never,
    }),
  }));
  const response = await GET(new Request("http://localhost/api/contacts/needs-matches"));
  const body = await response.json();
  assert.equal(response.status, 500);
  assert.equal(body.success, false);
  assert.equal(body.error.code, "INTERNAL_ERROR");
});
