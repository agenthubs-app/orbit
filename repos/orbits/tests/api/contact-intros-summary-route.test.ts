import assert from "node:assert/strict";
import test from "node:test";
import { createContactIntrosSummaryGetHandler } from "../../app/api/contacts/intros/summary/handler";
import type { ContactIntrosSummaryContract } from "../../shared/contract/contact-intros-summary";

const actor = { id: "actor:a", accountId: "actor:a", userId: "raw-user", workspaceId: "w", name: "A", email: "a@example.test" };
const summary: ContactIntrosSummaryContract = {
  totalContacts: 7,
  referralCandidateCount: 2,
  candidates: [{
    id: "contact:a",
    displayName: "林悦",
    organization: "Orbit",
    role: "Partner",
    hasReferralPath: true,
    sourceLabel: "关系证据",
    strengthScore: 80,
  }],
};

test("contact intros summary requires the authenticated actor and uses one bounded reader result", async () => {
  let actorResolutions = 0;
  let reads = 0;
  const handler = createContactIntrosSummaryGetHandler({
    resolveActor: async () => { actorResolutions += 1; return actor; },
    reader: { async read(actorId, workspaceId) { reads += 1; assert.equal(actorId, actor.id); assert.equal(workspaceId, actor.workspaceId); return summary; } },
  });
  const response = await handler(new Request("http://localhost/api/contacts/intros/summary"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(actorResolutions, 1);
  assert.equal(reads, 1);
  assert.deepEqual((await response.json()).data, summary);
  const unauthenticated = createContactIntrosSummaryGetHandler({
    resolveActor: async () => null,
    reader: { async read() { throw new Error("must not read"); } },
  });
  assert.equal((await unauthenticated(new Request("http://localhost/api/contacts/intros/summary"))).status, 401);
});

test("contact intros summary rejects query expansion and hides reader failures", async () => {
  const handler = createContactIntrosSummaryGetHandler({
    resolveActor: async () => actor,
    reader: { async read() { throw new Error("private SQL detail"); } },
  });
  assert.equal((await handler(new Request("http://localhost/api/contacts/intros/summary?actorId=actor:b"))).status, 400);
  const failed = await handler(new Request("http://localhost/api/contacts/intros/summary"));
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private SQL detail/u);
});
