import assert from "node:assert/strict";
import test from "node:test";

import { matchFieldsNeedingConfirmation, mergeInferredMatchFields, mergeMatchFieldsUpdate, readMatchFields, validateMatchFieldsUpdate } from "../../features/profile/match-fields";
import { normalizeInference, parseMatchFieldsInference } from "../../features/profile/match-fields-inference";

test("a saved field becomes confirmed; an omitted one keeps its value and source; null clears", () => {
  const current = mergeInferredMatchFields(undefined, { businessCategoryIds: ["kitchen_bath"], identity: "corporate", sellsTo: "business", evidence: { identity: "junior manager" } }, "2026-11-28T00:00:00Z");
  assert.equal(current?.sources?.identity, "inferred");
  const saved = mergeMatchFieldsUpdate(current, { identity: "founder", customerIndustryIds: ["real_estate_construction.property_development"] });
  assert.equal(saved?.identity, "founder");
  assert.equal(saved?.sources?.identity, "confirmed");
  assert.equal(saved?.evidence?.identity, undefined, "a confirmed value has no inference evidence");
  assert.equal(saved?.sources?.businessCategoryIds, "inferred");
  assert.deepEqual(saved?.customerIndustryIds, ["real_estate_construction.property_development"]);
  const cleared = mergeMatchFieldsUpdate(saved, { sellsTo: null });
  assert.equal(cleared?.sellsTo, undefined);
  assert.equal(cleared?.sources?.sellsTo, undefined);
});

test("an inference never overwrites what the person confirmed, and an empty inference leaves the field empty", () => {
  const confirmed = mergeMatchFieldsUpdate(undefined, { identity: "investor" });
  const next = mergeInferredMatchFields(confirmed, { businessCategoryIds: [], identity: "founder", sellsTo: null }, "2026-11-28T00:00:00Z");
  assert.equal(next?.identity, "investor");
  assert.equal(next?.businessCategoryIds, undefined);
  assert.deepEqual(matchFieldsNeedingConfirmation(next), ["investStages"]);
});

test("saves outside the catalogs are refused; stored junk is dropped on read", () => {
  assert.throws(() => validateMatchFieldsUpdate({ identity: "wizard" as never }));
  assert.throws(() => validateMatchFieldsUpdate({ businessCategoryIds: ["not_a_category"] }));
  assert.throws(() => validateMatchFieldsUpdate({ customerIndustryIds: ["a", "b", "c", "d"] }));
  assert.deepEqual(readMatchFields({ identity: "wizard", businessCategoryIds: ["kitchen_bath", "nope"] }), { businessCategoryIds: ["kitchen_bath"] });
});

test("inference output is checked against the catalogs; angel investors are investors", () => {
  const parsed = parseMatchFieldsInference(JSON.stringify({ identity: "finance_advisor", businessCategoryIds: ["ma_advisory", "made_up"], sellsTo: "business", customerIndustryIds: ["retail_consumer", "x"], investStages: ["seed"] }), { offering: ["エンジェル投資"], role: "本部长" });
  assert.equal(parsed?.identity, "investor");
  assert.equal(parsed?.sellsTo, null);
  assert.deepEqual(parsed?.businessCategoryIds, ["angel_investing", "ma_advisory"]);
  assert.equal(parseMatchFieldsInference("not json"), null);
  assert.equal(normalizeInference({ identity: "founder", sellsTo: "consumer", customerIndustryIds: ["retail_consumer"] }).customerIndustryIds?.length, 0);
});
