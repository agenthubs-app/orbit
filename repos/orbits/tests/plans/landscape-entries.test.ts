import assert from "node:assert/strict";
import test from "node:test";

import { PLAN_GOAL_KINDS } from "../../shared/compute/plan-templates";
import { isIndustryIdCode } from "../../shared/domain/industries";
import { LANDSCAPE_ENTRIES } from "../../features/plans/landscape/entries";
import { landscapeChecksum, LANDSCAPE_MAX_ENTRIES, publishedEntriesFor, resolveCitations } from "../../features/plans/landscape/store";
import type { LandscapeEntry } from "../../features/plans/landscape/types";

// R23 SC-R23-08（DESIGN §6）：业界现状库的字段、版本、发布与过期规则。
const NOW = new Date("2026-10-10T03:00:00Z");
/** 已知例外：发布条目少于 3 条的目标类型（REPORT「已知例外」）。现在没有。 */
export const LANDSCAPE_UNDER_THREE: readonly string[] = [];

test("every entry is complete, has a unique id + version, and its checksum matches its content", () => {
  const seen = new Set<string>();
  for (const entry of LANDSCAPE_ENTRIES) {
    const key = `${entry.id}@${entry.version}`;
    assert.ok(!seen.has(key), `duplicated ${key}`);
    seen.add(key);
    assert.match(entry.id, /^L-\d{3}$/);
    assert.ok(entry.goalKinds.length > 0 && entry.goalKinds.every((kind) => (PLAN_GOAL_KINDS as readonly string[]).includes(kind)), key);
    assert.ok(entry.industries.every((industry) => isIndustryIdCode(industry)), key);
    for (const language of ["ja", "zh", "en"] as const) {
      assert.ok(entry.title[language].trim(), `${key} title ${language}`);
      assert.ok(entry.summary[language].trim(), `${key} summary ${language}`);
    }
    assert.match(entry.source.url, /^https:\/\//, key);
    assert.match(entry.source.publishedOn, /^\d{4}-\d{2}-\d{2}$/, key);
    assert.match(entry.updatedOn, /^\d{4}-\d{2}-\d{2}$/, key);
    assert.ok(entry.source.label.trim(), key);
    assert.equal(entry.checksum, landscapeChecksum(entry), `${key}: content changed without a new checksum (bump the version)`);
    if (entry.status === "published") assert.ok(entry.reviewedBy, `${key}: published entries carry the review record`);
  }
});

test("each goal kind has at least 3 published entries (known exceptions read from one constant)", () => {
  for (const kind of PLAN_GOAL_KINDS) {
    if (LANDSCAPE_UNDER_THREE.includes(kind)) continue;
    assert.ok(publishedEntriesFor({ goalKind: kind, now: NOW }).length >= 3, kind);
  }
});

const sample = (patch: Partial<LandscapeEntry>): LandscapeEntry => ({
  checksum: "",
  goalKinds: ["sales"],
  id: "L-900",
  industries: [],
  reviewedBy: "REVIEW.md",
  source: { label: "x", publishedOn: "2026-01-01", url: "https://example.org" },
  status: "published",
  summary: { en: "e", ja: "j", zh: "z" },
  title: { en: "e", ja: "j", zh: "z" },
  updatedOn: "2026-09-01",
  version: 1,
  ...patch,
});

test("only published entries checked within 12 months are offered; drafts, retired and stale ones are not", () => {
  const entries = [
    sample({ id: "L-901" }),
    sample({ id: "L-902", status: "draft" }),
    sample({ id: "L-903", status: "retired" }),
    sample({ id: "L-904", updatedOn: "2025-10-09" }),
    sample({ id: "L-905", updatedOn: "2025-10-10" }),
  ];
  assert.deepEqual(publishedEntriesFor({ entries, goalKind: "sales", now: NOW }).map((entry) => entry.id).sort(), ["L-901", "L-905"]);
  assert.deepEqual(publishedEntriesFor({ entries, goalKind: "hiring", now: NOW }), []);
});

test("the latest published version is offered; older versions still resolve for saved citations", () => {
  const entries = [sample({ id: "L-910", version: 1 }), sample({ id: "L-910", summary: { en: "new", ja: "新", zh: "新" }, version: 2 })];
  assert.deepEqual(publishedEntriesFor({ entries, goalKind: "sales", now: NOW }).map((entry) => entry.version), [2]);
  assert.equal(resolveCitations([{ id: "L-910", version: 1 }], "ja", entries)[0]?.summary, "j");
  assert.deepEqual(resolveCitations([{ id: "L-999", version: 1 }], "ja", entries), []);
});

test("industry entries only match the goal's industries and come first; at most 12 are offered", () => {
  const entries = [
    sample({ id: "L-920" }),
    sample({ id: "L-921", industries: ["technology_internet"] }),
    sample({ id: "L-922", industries: ["manufacturing_supply_chain"] }),
    ...Array.from({ length: 15 }, (_, index) => sample({ id: `L-${930 + index}` })),
  ];
  const offered = publishedEntriesFor({ entries, goalKind: "sales", industries: ["technology_internet"], now: NOW });
  assert.equal(offered[0]?.id, "L-921");
  assert.ok(!offered.some((entry) => entry.id === "L-922"));
  assert.equal(offered.length, LANDSCAPE_MAX_ENTRIES);
});
