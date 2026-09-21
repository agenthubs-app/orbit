import assert from "node:assert/strict";
import test from "node:test";
import type { ContactsAnalysisView } from "../../app/(app)/app/contacts/analysis/contacts-analysis-view-model";
import { cockpit, distributionRows, healthRows } from "../../app/(app)/app/contacts/network-0918/network-overview-model";
import { toPerson } from "../../app/(app)/app/contacts/network-0918/network-model";

const ready: ContactsAnalysisView = {
  state: "ready", generatedAt: "2026-09-21T00:00:00Z", summary: "", activity: [], analysis: { state: "unavailable" },
  metrics: { contacts: 78, newContacts: 6, highValue: 12, pendingFollowups: 9, dormant: 8 },
  goal: { state: "empty", data: { id: null, text: "", updatedAt: "", canEdit: true } },
  structure: { state: "ready", data: { summary: "", health: [{ id: "strong", count: 3, percentage: 30, risk: "low" }, { id: "weak", count: 7, percentage: 70, risk: "high" }], dimensions: { industry: [{ id: "tech", label: "科技与互联网", count: 21, percentage: 27, missingData: false, href: "" }], location: [{ id: "tokyo", label: "东京", count: 38, percentage: 49, missingData: false, href: "" }], role: [], relationship: [] } } },
  coverage: { state: "unavailable" }, opportunities: { state: "unavailable" },
};

test("cockpit uses real metrics and never design placeholders", () => {
  const cards = cockpit(ready);
  assert.equal(cards.length, 4);
  assert.deepEqual(cards.map((c) => c.n), [12, 9, 6, 8]);
  assert.deepEqual(cockpit({ state: "pending" }).map((c) => c.n), [null, null, null, null]);
});

test("distributionRows reads industry/location from analysis and source from people", () => {
  assert.deepEqual(distributionRows("industry", ready, []), [["科技与互联网", 21]]);
  assert.deepEqual(distributionRows("region", ready, []), [["东京", 38]]);
  assert.deepEqual(distributionRows("industry", { state: "pending" }, []), []);
  const people = [toPerson({ company: "", encounters: [], displayName: "A", email: "", g: "", id: "a", industry: "", initial: "A", lineId: "", location: "", lastEventId: "", met: "", note: "", notes: [], offering: "", phone: "", pipelineStatus: "in_progress", relationshipStatus: "active", seeking: "", source: "scan", stage: "Active", title: "", wechat: "", strength: "medium", valueTags: [], nextAction: null, lastInteraction: "", dormant: false })];
  assert.deepEqual(distributionRows("source", ready, people), [["活动认识", 0], ["朋友引荐", 0], ["通讯录", 0], ["名片导入", 1], ["其他来源", 0]]);
});

test("healthRows renders only the health rows the analysis returns, with design icons and colours", () => {
  const rows = healthRows(ready);
  assert.deepEqual(rows.map((r) => [r.icon, r.label, r.n, r.tag]), [["◎", "核心人脉", 3, "稳定"], ["◌", "外圈人脉", 7, "待唤醒"]]);
  assert.equal(rows[0].iconBg, "#E6F1EC");
  assert.deepEqual(healthRows({ state: "pending" }), []);
});
