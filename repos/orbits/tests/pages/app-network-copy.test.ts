import assert from "node:assert/strict";
import test from "node:test";

import { activitySourceLabel, activityTypeLabel, contactIdFromActivityId, dueLabelCopy, systemBucketName } from "../../app/(app)/app/contacts/analysis/network-copy";

// W0043 SC-03：后端系统分组 id 封闭集（shared/compute/dashboard-distribution.ts）全覆盖。
const SYSTEM_BUCKETS: Array<[string, string, string]> = [
  ["unclassified", "未分类", "Unclassified"],
  ["location_unknown", "地区待完善", "Location missing"],
  ["location_tokyo", "东京", "Tokyo"],
  ["location_osaka", "大阪", "Osaka"],
  ["location_kyoto", "京都", "Kyoto"],
  ["location_kobe", "神户", "Kobe"],
  ["location_yokohama", "横滨", "Yokohama"],
  ["role_unknown", "角色待完善", "Role missing"],
  ["role_decision_maker", "经营决策者", "Decision makers"],
  ["role_business_growth", "业务拓展", "Business development"],
  ["role_professional_advisor", "专业顾问", "Professional advisors"],
  ["role_operations", "运营与专业角色", "Operations & specialists"],
  ["strong", "强关系", "Strong ties"],
  ["warm", "保持联系", "Keep in touch"],
  ["weak", "待重新联系", "To reconnect"],
];

test("system bucket ids map to bilingual names (zh matches the backend name; ja falls back to en)", () => {
  for (const [id, zh, en] of SYSTEM_BUCKETS) {
    assert.equal(systemBucketName(id, "zh"), zh);
    assert.equal(systemBucketName(id, "en"), en);
    assert.equal(systemBucketName(id, "ja"), en);
  }
});

test("user-entered locations and unknown ids are not renamed", () => {
  assert.equal(systemBucketName("location_%E6%B7%B1%E5%9C%B3", "en"), null);
  assert.equal(systemBucketName("toString", "en"), null);
  assert.equal(systemBucketName("constructor", "zh"), null);
});

test("dueLabel closed set maps to bilingual tags; Due soon and unknown values show nothing", () => {
  assert.equal(dueLabelCopy("Due today", "zh"), "今天到期或已逾期");
  assert.equal(dueLabelCopy("Due today", "en"), "Today or overdue");
  assert.equal(dueLabelCopy("Due tomorrow", "zh"), "明天到期");
  assert.equal(dueLabelCopy("Due in 12 days", "en"), "In 12 days");
  assert.equal(dueLabelCopy("Due in 12 days", "zh"), "12 天后到期");
  assert.equal(dueLabelCopy("No due date", "en"), "No deadline");
  assert.equal(dueLabelCopy("Due soon", "zh"), "");
  assert.equal(dueLabelCopy("本周", "en"), "");
});

test("activity templates and contact id come from structured fields only", () => {
  assert.equal(contactIdFromActivityId("activity:dashboard:contact:contact:wang"), "contact:wang");
  assert.equal(contactIdFromActivityId("activity:dashboard:task:task:1"), undefined);
  assert.equal(contactIdFromActivityId("activity:dashboard:contact:"), undefined);
  assert.equal(activityTypeLabel("new_contact", "zh"), "新增联系人");
  assert.equal(activityTypeLabel("new_contact", "en"), "New contact");
  assert.equal(activitySourceLabel("followup_due", "zh"), "跟进");
  assert.equal(activitySourceLabel("new_contact", "en"), "Contact");
});
