import assert from "node:assert/strict";
import test from "node:test";

import { SENIORITY_LEVELS, seniorityGroup } from "../../shared/compute/seniority-group";
import { canWriteEnrichedValue, readStoredEnrichment, withEnrichmentProvenance } from "../../shared/domain/enrichment";
import {
  isValidCountryCode,
  normalizeRegion,
  readStoredRegion,
  regionDisplayName,
  regionFromLocationText,
} from "../../shared/domain/regions";
import { SENIORITY_LEVEL_LABELS, seniorityGroup as reexported } from "../../shared/domain/seniority";
import { SENIORITY_LEVEL_VALUES } from "../../shared/domain/source-types";
import { applyEnrichedValues } from "../../features/contacts/enrichment/apply-enrichment";

// W0045：职级派生分组、规范地区、补全来源规则（纯函数）。

test("seniorityGroup maps the six stored levels to four derived groups; the domain re-exports the compute function", () => {
  assert.deepEqual([...SENIORITY_LEVELS], [...SENIORITY_LEVEL_VALUES], "compute keeps its own copy of the six levels in sync with the domain enum");
  assert.deepEqual(
    Object.fromEntries(SENIORITY_LEVELS.map((level) => [level, seniorityGroup(level)])),
    { individual_contributor: "staff", manager: "manager", director: "decision", vp: "decision", c_level: "decision", founder: "decision" },
  );
  assert.equal(seniorityGroup(null), "other");
  assert.equal(seniorityGroup(undefined), "other");
  assert.equal(seniorityGroup("chairman"), "other");
  assert.equal(reexported, seniorityGroup, "shared/domain/seniority.ts re-exports, it does not redefine");
  for (const level of SENIORITY_LEVELS) assert.ok(SENIORITY_LEVEL_LABELS[level].zh && SENIORITY_LEVEL_LABELS[level].en);
});

test("normalizeRegion validates the ISO country and canonicalizes known city aliases", () => {
  assert.deepEqual(normalizeRegion("JP", "東京都"), { countryCode: "JP", city: "Tokyo" });
  assert.deepEqual(normalizeRegion("jp", " tokyo "), { countryCode: "JP", city: "Tokyo" });
  assert.deepEqual(normalizeRegion("CN", "上海市"), { countryCode: "CN", city: "Shanghai" });
  assert.deepEqual(normalizeRegion("JP", "Sendai"), { countryCode: "JP", city: "Sendai" }, "unknown city keeps the model's English name");
  assert.deepEqual(normalizeRegion("JP", null), { countryCode: "JP", city: null });
  assert.deepEqual(normalizeRegion("JP", "x".repeat(65)), { countryCode: "JP", city: null }, "over-long city dropped");
  for (const invalid of ["XX", "ZZ", "EU", "JPN", "", null, 7, "J"]) {
    assert.equal(normalizeRegion(invalid, "Tokyo"), null, `country ${String(invalid)} drops the whole pair`);
  }
  assert.equal(normalizeRegion("US", "Tokyo"), null, "a known city in another country is a contradiction, not a region");
  assert.equal(normalizeRegion("CN", "東京"), null);
  assert.equal(normalizeRegion("SG", "上海"), null);
  assert.deepEqual(normalizeRegion("US", "Austin"), { countryCode: "US", city: "Austin" }, "unknown cities are not cross-checked");
  assert.equal(isValidCountryCode("SG"), true);
  assert.equal(readStoredRegion({ countryCode: "XX", city: "Tokyo" }), null);
  assert.deepEqual(readStoredRegion({ countryCode: "JP", city: "Osaka" }), { countryCode: "JP", city: "Osaka" });
});

test("regionFromLocationText only hits the alias table, and 東京都 is Tokyo, not Kyoto", () => {
  assert.deepEqual(regionFromLocationText("〒100-0001 東京都千代田区千代田1-1"), { countryCode: "JP", city: "Tokyo" });
  assert.deepEqual(regionFromLocationText("京都府京都市下京区"), { countryCode: "JP", city: "Kyoto" });
  assert.deepEqual(regionFromLocationText("1 Raffles Place, Singapore 048616"), { countryCode: "SG", city: "Singapore" });
  assert.deepEqual(regionFromLocationText("上海市浦东新区"), { countryCode: "CN", city: "Shanghai" });
  assert.equal(regionFromLocationText("Kobeyashi Building, Sendai"), null, "ASCII aliases match whole words only");
  assert.equal(regionFromLocationText(""), null);
  assert.equal(regionDisplayName({ countryCode: "JP", city: "Tokyo" }, "zh"), "日本 · 东京");
  assert.equal(regionDisplayName({ countryCode: "JP", city: "Tokyo" }, "en"), "Japan · Tokyo");
});

test("canWriteEnrichedValue: user always; ai/card only over empty or ai; values without provenance count as user", () => {
  const at = "2026-10-02T00:00:00.000Z";
  const ai = { origin: "ai" as const, updatedAt: at, via: "card_ocr" as const };
  const user = { origin: "user" as const, updatedAt: at, via: "contact_edit" as const };
  const card = { origin: "card" as const, updatedAt: at, via: "legacy_profile" as const };
  for (const incoming of ["ai", "card"] as const) {
    assert.equal(canWriteEnrichedValue({ hasValue: false }, incoming), true, `${incoming} fills empty`);
    assert.equal(canWriteEnrichedValue({ hasValue: true, provenance: ai }, incoming), true, `${incoming} replaces ai`);
    assert.equal(canWriteEnrichedValue({ hasValue: true, provenance: user }, incoming), false, `${incoming} never replaces user`);
    assert.equal(canWriteEnrichedValue({ hasValue: true, provenance: card }, incoming), false, `${incoming} never replaces card`);
    assert.equal(canWriteEnrichedValue({ hasValue: true }, incoming), false, `${incoming} never replaces a legacy value`);
  }
  for (const provenance of [ai, user, card, undefined]) {
    assert.equal(canWriteEnrichedValue({ hasValue: true, provenance }, "user"), true);
  }
  assert.equal(readStoredEnrichment({ version: 1, fields: { industry: { origin: "robot", updatedAt: at, via: "card_ocr" } } }), null);
  assert.deepEqual(withEnrichmentProvenance(null, "region", ai), { version: 1, fields: { region: ai } });
});

test("applyEnrichedValues writes each value to its own field and records provenance only for what it wrote", () => {
  const at = "2026-10-02T01:00:00.000Z";
  const payload: Record<string, unknown> = {
    primaryIndustryId: "technology_internet",
    publicProfile: { bio: "keep" },
  };
  const written = applyEnrichedValues(payload, [
    { field: "industry", value: { primaryIndustryId: "professional_services", secondaryIndustryId: "professional_services.legal" }, origin: "ai", via: "card_ocr" },
    { field: "seniorityLevel", value: "director", origin: "ai", via: "card_ocr" },
    { field: "region", value: { countryCode: "JP", city: "Tokyo" }, origin: "user", via: "card_review" },
  ], at);
  assert.deepEqual(written, ["seniorityLevel", "region"], "legacy industry without provenance is protected");
  assert.equal(payload.primaryIndustryId, "technology_internet");
  assert.deepEqual(payload.publicProfile, { bio: "keep", seniorityLevel: "director" });
  assert.deepEqual(payload.region, { countryCode: "JP", city: "Tokyo" });
  assert.deepEqual(payload.enrichment, {
    version: 1,
    fields: {
      seniorityLevel: { origin: "ai", updatedAt: at, via: "card_ocr" },
      region: { origin: "user", updatedAt: at, via: "card_review" },
    },
  });
  // ai over ai is allowed, ai over user is not.
  assert.deepEqual(applyEnrichedValues(payload, [
    { field: "seniorityLevel", value: "vp", origin: "ai", via: "text_enrichment" },
    { field: "region", value: { countryCode: "JP", city: "Osaka" }, origin: "ai", via: "text_enrichment" },
  ], at), ["seniorityLevel"]);
  assert.equal((payload.publicProfile as Record<string, unknown>).seniorityLevel, "vp");
  assert.deepEqual(payload.region, { countryCode: "JP", city: "Tokyo" });
});
