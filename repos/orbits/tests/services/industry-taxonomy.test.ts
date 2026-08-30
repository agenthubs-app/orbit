import assert from "node:assert/strict";
import test from "node:test";

import {
  INDUSTRY_CATALOG,
  industryLabel,
  isIndustryIdCode,
} from "../../shared/contract/industries";

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
