import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactNeedsGetHandler,
  type ContactNeedsRouteDependencies,
} from "../../app/api/contacts/needs-matches/handler";
import { scoreContactsForNeed } from "../../features/contact-needs/scoring";
import type { ContactListItemContract } from "../../shared/contract/contacts";

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

test("route returns actual v2 components and rejects a tampered score or missing evidence contract", async () => {
  const goal = "AI restaurant ordering collaboration";
  const ranked = scoreContactsForNeed(goal, [{
    id: "contact:delivery", displayName: "Delivery", role: "Software developer", organization: "Fixture", location: "",
    profileSnippet: "Builds restaurant ordering systems and offers pilot implementation", relationshipContext: "", tags: [], evidence: [],
  } as unknown as ContactListItemContract]);
  const valid = { ...payload, goal, ...ranked, scoringVersion: "needs-evidence-v2" as const };
  const responseFor = (data: typeof valid) => createContactNeedsGetHandler(dependencies({ createService: () => ({ getMatches: async () => ({ success: true, data }) }) }))(new Request("http://localhost/api/contacts/needs-matches"));
  const response = await responseFor(valid);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result.data.matches[0].components, valid.matches[0]?.components);
  assert.deepEqual(result.data.matches[0].summary, valid.matches[0]?.summary);
  for (const match of [
    { ...valid.matches[0]!, score: 99 },
    { ...valid.matches[0]!, components: undefined },
    { ...valid.matches[0]!, criteria: valid.matches[0]!.criteria.map(item => ({ ...item, evidenceExcerpt: null })) },
  ]) assert.equal((await responseFor({ ...valid, matches: [match] })).status, 500);
});
