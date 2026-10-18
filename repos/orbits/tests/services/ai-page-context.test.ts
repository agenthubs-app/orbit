import assert from "node:assert/strict";
import test from "node:test";

import { authorizeAiPageContext } from "../../features/orbit-ai/page-context";

const context = { route: "/app/contacts", filters: { industry: ["manufacturing_supply_chain"] }, count: 12 };

test("R21 page context rechecks the authenticated actor's current contact count", async () => {
  const reads: unknown[] = [];
  const authorized = await authorizeAiPageContext({
    actorId: "actor:alice", proposed: context,
    countContacts: async (actorId, filters) => { reads.push({ actorId, filters }); return 12; },
  });
  assert.deepEqual(authorized, context);
  assert.deepEqual(reads, [{ actorId: "actor:alice", filters: { industry: ["manufacturing_supply_chain"] } }]);
  await assert.rejects(authorizeAiPageContext({
    actorId: "actor:alice", proposed: context, countContacts: async () => 11,
  }), /PAGE_CONTEXT_STALE/);
});

test("R21 page context refuses private, free text, forged and oversized filters before reading", async () => {
  let reads = 0;
  const countContacts = async () => { reads += 1; return 12; };
  for (const proposed of [
    { ...context, route: "/app/contacts/other-user" },
    { ...context, route: "https://evil.test/app/contacts" },
    { ...context, filters: { query: "secret person" } },
    { ...context, filters: { industry: ["manufacturing_supply_chain", "DROP TABLE"] } },
    { ...context, count: 1000000 },
  ]) {
    await assert.rejects(authorizeAiPageContext({ actorId: "actor:alice", proposed, countContacts }), /PAGE_CONTEXT_INVALID/);
  }
  assert.equal(reads, 0);
});
