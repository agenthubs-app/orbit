/**
 * R34 SC-R34-01：`planSearchQueries(input)` 对 6 种目标 × 3 语各返回 ≤8 条，顺序 点名(≤3) → 门槛(≤3) → 市场(≤2)，
 * 每条带 `kind` 与 `query`；查询词含目标原文或行业词；不含占位符残留；premise / purpose 里的自由文本（含人名）绝不进入查询。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_SEARCH_PER_PLAN_LIMIT } from "../../features/ai-quota/constants";
import { planSearchQueries } from "../../features/plans/search/queries";
import type { PlanSearchInput } from "../../features/plans/search/types";
import type { PlanCopyLanguage } from "../../shared/compute/plan-template-copy";
import type { PlanGoalKind } from "../../shared/contract/plan-v2";
import { industryLabel } from "../../shared/domain/industries";

const KINDS: PlanGoalKind[] = ["launch", "fundraising", "sales", "hiring", "partnership", "career"];
const LANGUAGES: PlanCopyLanguage[] = ["ja", "zh", "en"];
const PERSON = "山田太郎";
const SELF = "李小雨";

function input(goalKind: PlanGoalKind, language: PlanCopyLanguage, overrides: Partial<PlanSearchInput> = {}): PlanSearchInput {
  return {
    goalKind,
    goalText: "東京で飲食店向けの予約SaaSを立ち上げる",
    industries: ["technology_internet", "food_hospitality"],
    language,
    premise: [
      { guessed: false, key: "purpose", label: "目的", source: "background", value: `${PERSON}さんと一緒に ${SELF} が進める` },
      { guessed: false, key: "team", label: "チーム", source: "background", value: `代表 ${SELF}、CTO ${PERSON}` },
      { guessed: true, key: "q1", label: "地域", source: "q1", value: "関東 · 神奈川も検討" },
    ],
    purpose: `${PERSON}に紹介してもらう`,
    ...overrides,
  };
}

test("6 kinds × 3 languages: ≤8 queries, named → threshold → market with per-kind caps, no placeholder left, goal text or industry word in each", () => {
  for (const kind of KINDS) {
    for (const language of LANGUAGES) {
      const queries = planSearchQueries(input(kind, language));
      const label = `${kind}/${language}`;
      assert.ok(queries.length > 0 && queries.length <= PLAN_SEARCH_PER_PLAN_LIMIT, `${label}: ${queries.length} queries`);
      const kinds = queries.map((query) => query.kind);
      const rank = { market: 2, named: 0, threshold: 1 } as const;
      for (let index = 1; index < kinds.length; index += 1) assert.ok(rank[kinds[index - 1]] <= rank[kinds[index]], `${label}: order ${kinds.join(",")}`);
      assert.ok(kinds.filter((value) => value === "named").length <= 3, `${label}: named > 3`);
      assert.ok(kinds.filter((value) => value === "threshold").length <= 3, `${label}: threshold > 3`);
      assert.ok(kinds.filter((value) => value === "market").length <= 2, `${label}: market > 2`);
      const industryWords = ["technology_internet", "food_hospitality"].map((id) => industryLabel(id as never, language));
      for (const { query } of queries) {
        assert.ok(!/[{}]/u.test(query), `${label}: placeholder left in "${query}"`);
        assert.ok(query.trim().length > 0 && query.length <= 120, `${label}: length of "${query}"`);
        assert.ok(query.includes("東京で飲食店向けの予約SaaSを立ち上げる") || industryWords.some((word) => query.includes(word)), `${label}: neither goal nor industry in "${query}"`);
        assert.ok(!query.includes(PERSON) && !query.includes(SELF), `${label}: person name leaked into "${query}"`);
        assert.ok(!query.includes("関東") && !query.includes("紹介してもらう"), `${label}: premise / purpose free text leaked into "${query}"`);
      }
      assert.equal(new Set(queries.map((query) => query.query)).size, queries.length, `${label}: duplicate queries`);
    }
  }
});

test("language decides the query language; the three sets of one kind differ", () => {
  const sets = LANGUAGES.map((language) => planSearchQueries(input("fundraising", language)).map((query) => query.query).join("\n"));
  assert.notEqual(sets[0], sets[1]);
  assert.notEqual(sets[1], sets[2]);
  assert.ok(/[ぁ-んァ-ン]/u.test(sets[0]), "ja set has kana");
  assert.ok(/[a-z]{3,}/iu.test(sets[2]), "en set has latin words");
});

test("without industries every query still carries the goal text; long goal text is clipped but never split a word boundary into a placeholder", () => {
  const long = "A".repeat(200);
  for (const kind of KINDS) {
    const queries = planSearchQueries(input(kind, "en", { goalText: `  ${long}  `, industries: [] }));
    assert.ok(queries.length > 0 && queries.length <= PLAN_SEARCH_PER_PLAN_LIMIT);
    for (const { query } of queries) {
      assert.ok(query.includes("A".repeat(40)), `goal missing in "${query}"`);
      assert.ok(!query.includes(long), `goal not clipped in "${query}"`);
      assert.ok(!/[{}]/u.test(query));
    }
  }
});

test("empty goal text yields no queries (nothing to search for) instead of placeholder-only strings", () => {
  assert.deepEqual(planSearchQueries(input("sales", "ja", { goalText: "   ", industries: [] })), []);
});
