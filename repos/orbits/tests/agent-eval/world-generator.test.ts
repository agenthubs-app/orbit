import assert from "node:assert/strict";
import { test } from "node:test";

import { generateBulkWorld, verifyWorldFacts, worldRecords } from "./lib/bulk-generator";
import { loadWorld } from "./lib/world";
import { stableStringify } from "./lib/yaml";

for (const name of ["regular-v1", "large-v1"]) {
  test(`${name}: the same seed generates the same records, record for record`, () => {
    const world = loadWorld(name);
    const first = generateBulkWorld(world).records;
    const second = generateBulkWorld(loadWorld(name)).records;
    assert.equal(first.length, second.length);
    for (let index = 0; index < first.length; index += 1) {
      assert.equal(stableStringify(first[index]), stableStringify(second[index]), `record ${index} (${first[index].id})`);
    }
  });

  test(`${name}: counts, facts and forbidden words hold`, () => {
    assert.deepEqual(verifyWorldFacts(loadWorld(name)), []);
  });
}

test("base-v1 (small account) has the §11 counts", () => {
  const world = loadWorld("base-v1");
  const records = worldRecords(world).filter((record) => record.account === "A");
  const count = (kind: string) => records.filter((record) => record.kind === kind).length;
  assert.equal(count("contact"), 8);
  assert.equal(count("memo"), 10);
  assert.equal(count("todo") + count("followup"), 6);
  assert.equal(count("schedule"), 2);
  assert.equal(world.anchors.filter((record) => record.kind === "platform_event").length, 7);
  assert.equal(count("my_event"), 1);
  assert.equal(count("memory"), 0);
});

test("a different seed generates different records", () => {
  const world = loadWorld("regular-v1");
  const other = { ...world, bulk: { ...world.bulk, seed: 1 } };
  assert.notEqual(stableStringify(generateBulkWorld(world).records.slice(0, 5)), stableStringify(generateBulkWorld(other).records.slice(0, 5)));
});
