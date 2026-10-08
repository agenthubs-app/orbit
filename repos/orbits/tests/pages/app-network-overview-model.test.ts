import assert from "node:assert/strict";
import test from "node:test";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { TIER_HEALTH_META, distributionRows } from "../../app/(app)/app/contacts/network-0918/network-overview-model";

const ready: ContactsAnalysisView = {
  state: "ready", generatedAt: "2026-09-21T00:00:00Z", summary: "", activity: [], analysis: { state: "unavailable" },
  metrics: { contacts: 78, newContacts: 6, highValue: 12, pendingFollowups: 9, dormant: 8 },
  goal: { state: "empty", data: { id: null, text: "", updatedAt: "", canEdit: true } },
  structure: { state: "ready", data: { summary: "", health: [{ id: "core", count: 3, percentage: 30 }, { id: "dormant", count: 7, percentage: 70 }], dimensions: { industry: [{ id: "tech", label: "科技与互联网", count: 21, percentage: 27, missingData: false, href: "" }], location: [{ id: "tokyo", label: "东京", count: 38, percentage: 49, missingData: false, href: "" }], role: [], relationship: [] } } },
  coverage: { state: "unavailable" }, opportunities: { state: "unavailable" },
};

const SOURCES = { contact: 2, event: 30, other: 6, referral: 10, scan: 30 };

test("distributionRows reads industry/location from the full analysis distribution and source from the full source facets (W0052)", () => {
  assert.deepEqual(distributionRows("industry", ready, SOURCES, "zh"), [["科技与互联网", 21]]);
  assert.deepEqual(distributionRows("region", ready, SOURCES, "zh"), [["东京", 38]]);
  assert.deepEqual(distributionRows("industry", { state: "pending" }, SOURCES, "zh"), []);
  assert.deepEqual(distributionRows("source", ready, SOURCES, "zh"), [["活动认识", 30], ["朋友引荐", 10], ["通讯录", 2], ["名片导入", 30], ["其他来源", 6]]);
  assert.deepEqual(distributionRows("source", ready, SOURCES, "en").map((r) => r[0]), ["Met at events", "Referred", "Address book", "Business cards", "Other"]);
  // ja 跟 t() 一样回退英文。
  assert.equal(distributionRows("source", ready, SOURCES, "ja")[0][0], "Met at events");
  assert.deepEqual(distributionRows("source", ready, null, "zh"), [], "source facets unavailable → no rows");
});

test("TIER_HEALTH_META is the one tier icon/copy/colour table shared by the overview and the structure tab", () => {
  assert.deepEqual(Object.keys(TIER_HEALTH_META), ["new", "active", "core", "dormant"]);
  assert.deepEqual([TIER_HEALTH_META.core.icon, TIER_HEALTH_META.core.label.zh, TIER_HEALTH_META.core.bg], ["◎", "核心", "#E6F1EC"]);
  assert.equal(TIER_HEALTH_META.dormant.desc.zh, "曾经热络，60 天没有往来");
});
