import assert from "node:assert/strict";
import test from "node:test";
import { createContactPipelinePageGetHandler } from "../../app/api/contacts/pipeline/handler";
import type { ContactPipelinePageContract } from "../../shared/contract/contact-pipeline-page";

const actor = { id: "actor:a", accountId: "actor:a", userId: "raw-user", workspaceId: "w" };
const page: ContactPipelinePageContract = {
  asOf: "2026-09-26T00:00:00.000Z",
  stage: "in_progress",
  stageCounts: { to_contact: 12, in_progress: 27, nurture: 4, archived: 1 },
  items: [{ id: "contact:1", displayName: "Lin", organization: "Orbit", role: "Partner" }],
  hasMore: false,
  nextCursor: null,
  actions: [],
};

test("contact pipeline API resolves actor and stage page through the dedicated reader", async () => {
  let read: unknown;
  const handler = createContactPipelinePageGetHandler({
    resolveActor: async () => actor,
    reader: { async page(query, actorId, workspaceId) { read = { query, actorId, workspaceId }; return page; } },
  });
  const response = await handler(new Request("https://orbit.test/api/contacts/pipeline?stage=in_progress&limit=20"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(read, { query: { stage: "in_progress", limit: 20, cursor: null }, actorId: actor.id, workspaceId: actor.workspaceId });
  assert.deepEqual((await response.json()).data, page);

  const unauthenticated = createContactPipelinePageGetHandler({
    resolveActor: async () => null,
    reader: { async page() { throw new Error("must not query without actor"); } },
  });
  assert.equal((await unauthenticated(new Request("https://orbit.test/api/contacts/pipeline?stage=in_progress"))).status, 401);
});

test("contact pipeline API rejects unbounded/ambiguous parameters and fails the whole read closed", async () => {
  let reads = 0;
  const handler = createContactPipelinePageGetHandler({
    resolveActor: async () => actor,
    reader: { async page() { reads += 1; throw new Error("private SQL detail"); } },
  });
  for (const url of [
    "https://orbit.test/api/contacts/pipeline",
    "https://orbit.test/api/contacts/pipeline?stage=all",
    "https://orbit.test/api/contacts/pipeline?stage=in_progress&limit=21",
    "https://orbit.test/api/contacts/pipeline?stage=in_progress&limit=0",
    "https://orbit.test/api/contacts/pipeline?stage=in_progress&stage=archived",
    "https://orbit.test/api/contacts/pipeline?stage=in_progress&actorId=actor:b",
  ]) assert.equal((await handler(new Request(url))).status, 400, url);
  assert.equal(reads, 0);
  const failed = await handler(new Request("https://orbit.test/api/contacts/pipeline?stage=in_progress"));
  assert.equal(failed.status, 503);
  assert.doesNotMatch(await failed.text(), /private SQL detail/u);
});
