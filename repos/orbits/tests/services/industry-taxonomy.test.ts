import assert from "node:assert/strict";
import test from "node:test";
import * as taxonomy from "../../shared/domain/industries";

import {
  INDUSTRY_CATALOG,
  industryLabel,
  isIndustryIdCode,
} from "../../shared/domain/industries";

test("固定行业字典使用稳定且不重复的 ID", () => {
  assert.equal(INDUSTRY_CATALOG.length, 14);
  assert.equal(
    new Set(INDUSTRY_CATALOG.map((industry) => industry.id)).size,
    INDUSTRY_CATALOG.length,
  );
  assert.deepEqual(
    INDUSTRY_CATALOG.slice(0, 3).map((industry) => industry.id),
    ["food_hospitality", "technology_internet", "finance_investment"],
  );
});

test("行业标签由同一个 ID 按当前语言派生", () => {
  assert.equal(industryLabel("food_hospitality", "zh"), "餐饮与食品");
  assert.equal(industryLabel("food_hospitality", "en"), "Food & Hospitality");
  assert.equal(industryLabel("food_hospitality", "ja"), "飲食・食品");
});

test("未知行业 ID 不会被契约接受", () => {
  assert.equal(isIndustryIdCode("technology_internet"), true);
  assert.equal(isIndustryIdCode("made_up_industry"), false);
  assert.equal(isIndustryIdCode(null), false);
});

const approvedChildren = {
  food_hospitality: "restaurants cafes_beverages food_production food_distribution hotels_tourism other",
  technology_internet: "enterprise_software ai_data cloud_infrastructure cybersecurity internet_platforms other",
  finance_investment: "banking venture_capital private_equity asset_management insurance fintech other",
  professional_services: "management_consulting legal tax_accounting human_resources startup_services other",
  manufacturing_supply_chain: "industrial_equipment robotics automotive semiconductors electronics materials other",
  retail_consumer: "physical_retail ecommerce consumer_brands lifestyle_services consumer_products other",
  trade_logistics: "import_export freight warehousing cross_border_services procurement other",
  real_estate_construction: "property_development construction architecture_design property_operations real_estate_services other",
  healthcare_life_sciences: "medical_services pharmaceuticals medical_devices biotechnology health_management other",
  education_research: "school_education higher_education professional_training edtech research_institutes other",
  media_creative: "publishing_content advertising_marketing film_video games_entertainment design_creative other",
  community_nonprofit: "industry_associations nonprofits community_operations social_enterprises other",
  government_public_affairs: "public_administration public_services economic_development public_policy other",
  other: "other",
} as const;

test("每个父行业只列出获批子项，三语标签可用且排序稳定", () => {
  assert.equal(typeof taxonomy.listSecondaryIndustries, "function");
  const seen = new Set<string>();
  for (const [parentId, children] of Object.entries(approvedChildren)) {
    const entries = taxonomy.listSecondaryIndustries(parentId as keyof typeof approvedChildren);
    assert.deepEqual(entries.map((entry) => entry.id), children.split(" ").map((child) => `${parentId}.${child}`));
    for (const [index, entry] of entries.entries()) {
      assert.equal(entry.parentId, parentId);
      assert.ok(index === 0 || entry.sortOrder > entries[index - 1]!.sortOrder);
      assert.equal(seen.has(entry.id), false);
      seen.add(entry.id);
      for (const locale of ["zh", "ja", "en"] as const) {
        assert.ok(entry.labels[locale].trim().length > 0);
        assert.equal(taxonomy.secondaryIndustryLabel(entry.id, locale), entry.labels[locale]);
      }
    }
  }
  assert.equal(seen.size, 79);
  assert.equal(taxonomy.secondaryIndustryLabel("technology_internet.ai_data", "zh"), "人工智能与数据");
  assert.equal(taxonomy.secondaryIndustryLabel("technology_internet.ai_data", "ja"), "AI・データ");
  assert.equal(taxonomy.secondaryIndustryLabel("technology_internet.ai_data", "en"), "Artificial Intelligence & Data");
});

test("行业校验保留旧缺省值而拒绝未知 ID、无父子项和父子错配", () => {
  assert.equal(typeof taxonomy.validateIndustrySelection, "function");
  for (const selection of [{}, { primaryIndustryId: null, secondaryIndustryId: null }, { primaryIndustryId: "technology_internet" }, { primaryIndustryId: "technology_internet", secondaryIndustryId: "technology_internet.ai_data" }]) {
    assert.deepEqual(taxonomy.validateIndustrySelection(selection), { valid: true });
  }
  for (const [selection, reason] of [
    [{ primaryIndustryId: "unknown" }, "unknown_primary"],
    [{ primaryIndustryId: "" }, "unknown_primary"],
    [{ primaryIndustryId: "technology_internet", secondaryIndustryId: "unknown" }, "unknown_secondary"],
    [{ primaryIndustryId: "technology_internet", secondaryIndustryId: "" }, "unknown_secondary"],
    [{ secondaryIndustryId: "technology_internet.ai_data" }, "parent_mismatch"],
    [{ primaryIndustryId: "finance_investment", secondaryIndustryId: "technology_internet.ai_data" }, "parent_mismatch"],
  ] as const) {
    assert.deepEqual(taxonomy.validateIndustrySelection(selection), { valid: false, reason });
  }
});
