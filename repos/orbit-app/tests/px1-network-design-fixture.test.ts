import assert from "node:assert/strict";
import test from "node:test";

import { networkDesignEnabled, parseNetworkDesignContacts } from "../src/screens/network/network-design-fixture-data";

const fixture = {
  actorId: "actor-a", variant: "locked5", goalRelatedIds: ["design-person-1"], followUpContactIds: [], links: [], fits: {}, connections: {}, valueLines: {},
  rows: [{ id: "design-person-1", card: { id: "design-person-1", displayName: "伊藤 直子" }, tags: [], detail: { id: "design-person-1" } }],
};

test("PX1 network fixture accepts only the current actor's coherent contact rows", () => {
  assert.equal(parseNetworkDesignContacts(fixture, "actor-a")?.rows.length, 1);
  assert.equal(parseNetworkDesignContacts(fixture, "actor-b"), null);
  assert.equal(parseNetworkDesignContacts({ ...fixture, rows: [{ ...fixture.rows[0], card: { id: "other" } }] }, "actor-a"), null);
  assert.equal(parseNetworkDesignContacts({ ...fixture, variant: "unknown" }, "actor-a"), null);
});

test("PX1 network projection requires a development build and its explicit flag", () => {
  assert.equal(networkDesignEnabled("network", false), false);
  assert.equal(networkDesignEnabled("open-path", true), false);
  assert.equal(networkDesignEnabled("open-path,network", true), true);
});
