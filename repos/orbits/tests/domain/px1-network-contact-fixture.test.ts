import assert from "node:assert/strict";
import test from "node:test";

import { localContactDirectorySummary } from "../../shared/api-schema/contact-local-directory";
import { designNetworkPeople } from "../../features/network-analysis/design-fixtures";
import { designNetworkContactFixture } from "../../features/network-analysis/design-fixtures/contacts";

const monthStart = "2026-10-01T00:00:00.000Z";

test("PX1 four contact states project the same people as network analysis", () => {
  for (const variant of ["empty", "locked5", "few14", "many286"] as const) {
    const world = designNetworkContactFixture(variant);
    const people = designNetworkPeople(variant);
    assert.equal(world.rows.length, people.length);
    assert.deepEqual(world.rows.map((row) => row.id), people.map((person) => person.id));
    world.rows.forEach((row, index) => {
      assert.equal(row.card?.displayName, people[index]?.name);
      assert.equal(row.card?.organization, people[index]?.organization);
      assert.equal(row.card?.primaryIndustryId, people[index]?.primaryIndustryId);
      assert.equal(row.card?.status, people[index]?.status);
    });
  }
});

test("PX1 5-person and 286-person board totals are internally consistent", () => {
  const expected = [
    { variant: "locked5", total: 5, goal: 2, followUp: 0, added: 3, density: { 1: 1, 2: 2, 3: 2 }, source: { meishi: 4, manual: 1 } },
    { variant: "many286", total: 286, goal: 9, followUp: 12, added: 24, density: { 1: 74, 2: 171, 3: 41 }, source: { meishi: 204, phone: 41, linkedin: 22, event: 8, manual: 8, self: 3 } },
  ] as const;
  for (const item of expected) {
    const world = designNetworkContactFixture(item.variant);
    const summary = localContactDirectorySummary(world.rows, { goalRelatedIds: world.goalRelatedIds, followUpContactIds: world.followUpContactIds, monthStart });
    assert.equal(summary.total, item.total);
    assert.deepEqual(summary.tabCounts, { goalRelated: item.goal, needsFollowUp: item.followUp });
    assert.equal(summary.addedThisMonth, item.added);
    assert.deepEqual(summary.densityCounts, item.density);
    assert.deepEqual(summary.sourceChips, item.source);
  }
});

test("PX1 controlled detail samples use real detail fields and keep account data out", () => {
  const world = designNetworkContactFixture("many286");
  for (const row of world.rows) {
    assert.equal(row.detail?.id, row.id);
    assert.equal(row.detail?.displayName, row.card?.displayName);
    assert.equal("actorId" in (row.detail ?? {}), false);
    assert.equal("accountId" in (row.detail ?? {}), false);
  }
  assert.ok(world.rows.some((row) => Array.isArray(row.detail?.fieldHistory) && row.detail.fieldHistory.length > 0));
  assert.ok(world.rows.some((row) => row.card?.sourceChip === "self"));
  assert.equal(world.fits["design-person-003"]?.fits[0]?.status, "candidate");
  assert.deepEqual(world.connections["design-person-121"]?.pausedFields, ["email"]);
  assert.equal(world.valueLines["design-person-003"]?.evidence[0], "card");
});
