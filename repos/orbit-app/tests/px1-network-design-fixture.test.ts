import assert from "node:assert/strict";
import test from "node:test";

import { networkDesignEnabled, parseNetworkDesignContacts } from "../src/screens/network/network-design-fixture-data";

const fixture = {
  actorId: "actor-a", variant: "locked5", goalRelatedIds: ["design-person-1"], followUpContactIds: [], links: [], fits: {}, connections: {}, valueLines: {},
  rows: [{ id: "design-person-1", card: { id: "design-person-1", displayName: "伊藤 直子", organization: "Orbit", role: "Founder", sourceType: "manual", status: "active", pendingInitialization: false, nextActionPreview: "", valueTypes: [], updatedAt: "2026-10-07T03:00:00.000Z" }, tags: [], search: { text: "伊藤 直子", occurredAt: "2026-10-07T03:00:00.000Z", updatedAt: "2026-10-07T03:00:00.000Z", error: null }, detail: { id: "design-person-1" } }],
};

test("PX1 network fixture accepts only the current actor's coherent contact rows", () => {
  assert.equal(parseNetworkDesignContacts(fixture, "actor-a")?.rows.length, 1);
  assert.equal(parseNetworkDesignContacts(fixture, "actor-b"), null);
  assert.deepEqual(parseNetworkDesignContacts({ ...fixture, rows: [{ ...fixture.rows[0], card: { id: "other" } }] }, "actor-a")?.rows, []);
  assert.equal(parseNetworkDesignContacts({ ...fixture, variant: "unknown" }, "actor-a"), null);
});

test("PX1 fixture keeps good rows with extra fields and skips each malformed row", () => {
  const extra = { ...fixture.rows[0]!, futureField: "kept", card: { ...fixture.rows[0]!.card, futureCardField: "ignored" } };
  const parsed = parseNetworkDesignContacts({ ...fixture, futureEnvelopeField: true, rows: [null, { id: "broken", card: { id: "broken" } }, extra, { ...extra, search: null }] }, "actor-a");
  assert.equal(parsed?.rows.length, 1);
  assert.equal(parsed?.rows[0]?.id, "design-person-1");
  assert.equal(parsed?.rows[0]?.card?.displayName, "伊藤 直子");
});

test("PX1 network projection requires a development build and its explicit flag", () => {
  assert.equal(networkDesignEnabled("network", false), false);
  assert.equal(networkDesignEnabled("open-path", true), false);
  assert.equal(networkDesignEnabled("open-path,network", true), true);
});
