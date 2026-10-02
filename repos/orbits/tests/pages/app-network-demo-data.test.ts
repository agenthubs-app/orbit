/**
 * W0005 示例人脉数据（`_demo/demo-network.ts`）与服务端判定（`_demo/demo-guide-view.ts`）。
 *
 * - 30 位联系人、id 全带 `demo:`、六个来源格子与四个阶段的计数与原型一致；
 * - 8 位完整详情（时间线、话题、我能提供、对方需求、下一步），其余简版；
 * - 与 W0004 首页示例同一个故事（DEMO_PEOPLE 的人、公司都在；JETRO 交流会同一天）；
 * - 服务端判定：开关关零读取、资料读不到 fail closed、只有「在示例里」才非空。
 */
import assert from "node:assert/strict";
import test from "node:test";

import { demoModeViewFromGuideStatus, readDemoModeViewForActor } from "../../app/(app)/app/_demo/demo-guide-view";
import {
  DEMO_NETWORK_SIZE,
  DEMO_RICH_CONTACT_IDS,
  buildDemoNetworkAnalysis,
  buildDemoNetworkDetail,
  buildDemoNetworkViewModel,
  demoContactIdFromHref,
  isDemoContactId,
} from "../../app/(app)/app/_demo/demo-network";
import { DEMO_PEOPLE, buildDemoHomeData } from "../../app/(app)/app/_demo/demo-persona";
import { sourceCounts, stageCounts, toPerson } from "../../app/(app)/app/contacts/network-0918/network-model";

const NOW = new Date("2026-09-28T03:00:00.000Z"); // 东京 9/28 12:00

test("30 demo contacts, all with demo: ids and unique", () => {
  const vm = buildDemoNetworkViewModel(NOW, "zh");
  assert.equal(DEMO_NETWORK_SIZE, 30);
  assert.equal(vm.connections.length, 30);
  assert.ok(vm.connections.every((contact) => isDemoContactId(contact.id)));
  assert.equal(new Set(vm.connections.map((contact) => contact.id)).size, 30);
  assert.deepEqual(vm.events, []);
});

test("source grid counts and pipeline stage counts match the prototype", () => {
  const people = buildDemoNetworkViewModel(NOW, "zh").connections.map(toPerson);
  assert.deepEqual(sourceCounts(people), { all: 30, contact: 5, event: 9, other: 3, referral: 5, scan: 8 });
  assert.deepEqual(stageCounts(people), { advance: 5, archived: 3, explore: 9, keep: 13 });
  assert.ok(people.every((person) => person.href.startsWith("/app/contacts/demo%3A")));
});

test("the W0004 persona's people are here, at the same companies", () => {
  const vm = buildDemoNetworkViewModel(NOW, "zh");
  for (const person of DEMO_PEOPLE) {
    const contact = vm.connections.find((item) => item.displayName === person.name);
    assert.ok(contact, person.name);
    // JETRO 东京 / 东京商工会议所 在人脉里的公司名与首页一致。
    assert.equal(contact.company, person.company, person.name);
  }
});

test("dates follow Tokyo's today, and the JETRO mixer is the same day as on the home demo", () => {
  const vm = buildDemoNetworkViewModel(NOW, "zh");
  const byName = (name: string) => vm.connections.find((item) => item.displayName === name)!;
  assert.equal(byName("王砚").lastInteraction, "昨天");
  assert.equal(byName("铃木健").lastInteraction, "昨天");
  assert.equal(byName("林志远").lastInteraction, "8/14"); // 45 天前
  const home = buildDemoHomeData(NOW, "zh");
  const jetro = home.home.events.find((event) => event.id === "demo-event-jetro-business")!;
  const jetroDay = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "Asia/Tokyo", year: "numeric" }).format(new Date(jetro.startsAt));
  const [, month, day] = jetroDay.split("-").map(Number);
  assert.equal(byName("山田太郎").nextAction?.text, `${month}/${day} 交流会上再见一次`);
});

test("8 contacts have a full detail: timeline, topics, offer, need, next steps", () => {
  assert.equal(DEMO_RICH_CONTACT_IDS.length, 8);
  for (const id of DEMO_RICH_CONTACT_IDS) {
    const detail = buildDemoNetworkDetail(id, NOW, "zh");
    assert.ok(detail, id);
    const profile = detail.encounters[0]!.context.publicProfile;
    assert.ok(profile.topics.length > 0, id);
    assert.ok(profile.offering.length > 0, id);
    assert.ok(profile.seeking.length > 0, id);
    assert.ok(detail.nextAction?.text, id);
  }
  const wang = buildDemoNetworkDetail("demo:wang-yan", NOW, "zh")!;
  assert.deepEqual(wang.notes.map((note) => note.body), [
    "电话：他说 IT 部门的铃木是系统采购的决策人",
    "札幌展会展位聊了 15 分钟，对日语会议纪要感兴趣",
  ]);
  // 时间线按东京钟点显示（弹窗读 UTC 分量）。
  assert.equal(wang.notes[0]!.createdAt, "2026-09-27T17:30:00.000Z");
  assert.equal(wang.editableInteraction?.occurredAt, wang.notes[0]!.createdAt);
  assert.equal(wang.lastInteraction, wang.notes[0]!.body);
  assert.deepEqual(wang.nextAction, { reason: "会后发 1 分钟演示视频", text: "今天见面时请他引荐铃木" });
  assert.equal(wang.met, "札幌工业展会");
  // 铃木、高桥是昨晚刚导入的：还没有互动记录。
  assert.equal(buildDemoNetworkDetail("demo:suzuki-ken", NOW, "zh")!.notes.length, 0);
});

test("the other 22 get the short detail; unknown or non-demo ids return null", () => {
  const detail = buildDemoNetworkDetail("demo:kato-ryo", NOW, "zh")!;
  assert.equal(detail.notes.length, 1);
  assert.match(detail.notes[0]!.body, /示例简版详情/);
  assert.deepEqual(detail.encounters[0]!.context.publicProfile.topics, ["设计"]);
  assert.deepEqual(detail.encounters[0]!.context.publicProfile.seeking, ["待了解"]);
  assert.equal(detail.nextAction, null);
  assert.equal(buildDemoNetworkDetail("demo:nobody", NOW, "zh"), null);
  assert.equal(buildDemoNetworkDetail("wang-yan", NOW, "zh"), null);
});

test("English builds the same people in English", () => {
  const vm = buildDemoNetworkViewModel(NOW, "en");
  const wang = vm.connections.find((item) => item.id === "demo:wang-yan")!;
  assert.equal(wang.displayName, "Wang Yan");
  assert.equal(wang.company, "Hokushin Seiko");
  assert.equal(wang.lastInteraction, "Yesterday");
  assert.doesNotMatch(JSON.stringify(vm), /[一-鿿]/);
  const detail = buildDemoNetworkDetail("demo:sato-misaki", NOW, "en")!;
  assert.doesNotMatch(JSON.stringify(detail), /[一-鿿]/);
});

test("demo analysis numbers come from the 30 demo contacts", () => {
  const analysis = buildDemoNetworkAnalysis(NOW, "zh");
  assert.equal(analysis.state, "ready");
  if (analysis.state !== "ready") return;
  assert.equal(analysis.metrics.contacts, 30);
  assert.equal(analysis.metrics.highValue, 5);
  assert.equal(analysis.metrics.dormant, 2);
  // 动态里的人名是结构化字段（概览据此挂「示例」角标），label 里不嵌人名。
  assert.deepEqual(analysis.activity.map((item) => item.contactName), ["铃木健", "高桥由美", "王砚", "佐藤美咲"]);
  for (const item of analysis.activity) assert.ok(!item.label.includes(item.contactName!), item.label);
  assert.equal(analysis.structure.state, "ready");
  if (analysis.structure.state !== "ready") return;
  const industry = analysis.structure.data.dimensions.industry;
  assert.equal(industry.reduce((sum, bucket) => sum + bucket.count, 0), 30);
  assert.ok(industry.length <= 7);
  assert.equal(industry.at(-1)?.label, "其他");
  assert.equal(analysis.opportunities.state, "ready");
  if (analysis.opportunities.state !== "ready") return;
  assert.ok(analysis.opportunities.data.actions.every((action) => demoContactIdFromHref(action.primary.href)));
  const names = buildDemoNetworkViewModel(NOW, "zh").connections.map((contact) => contact.displayName);
  for (const action of analysis.opportunities.data.actions) {
    assert.ok(names.includes(action.contactName), action.contactName);
    assert.ok(!names.some((name) => action.title.includes(name) || action.judgment.includes(name)), action.title);
  }
});

test("demoContactIdFromHref only recognises known demo contacts", () => {
  assert.equal(demoContactIdFromHref("/app/contacts/demo%3Awang-yan"), "demo:wang-yan");
  assert.equal(demoContactIdFromHref("/app/contacts/demo:wang-yan"), "demo:wang-yan");
  assert.equal(demoContactIdFromHref("/app/contacts/demo%3Anobody"), null);
  assert.equal(demoContactIdFromHref("/app/contacts/contact-1"), null);
  assert.equal(demoContactIdFromHref("/app/contacts/pipeline"), null);
  assert.equal(demoContactIdFromHref("/app/contacts/%E0%A4%A"), null);
});

/* ── 服务端判定 ─────────────────────────────────────────────────────── */

const IN_DEMO = {
  bannerCollapsed: true,
  grandfathered: false,
  inDemo: true,
  progress: { completed: 2, confirmedContacts: 3, nextStep: "plan" as const, steps: { contacts: true, goal: true, plan: false } },
};

test("guide view: flag off reads nothing", async () => {
  const reads: string[] = [];
  const view = await readDemoModeViewForActor(
    { actorId: "account:a" },
    {
      enabled: () => false,
      readGuideStatus: async () => { reads.push("guide"); return IN_DEMO; },
      readRelationshipGoal: async () => { reads.push("profile"); return ""; },
    },
  );
  assert.equal(view, null);
  assert.deepEqual(reads, []);
});

test("guide view: a profile or guide read failure falls back to the real page", async () => {
  assert.equal(
    await readDemoModeViewForActor({ actorId: "account:a" }, {
      enabled: () => true,
      readGuideStatus: async () => IN_DEMO,
      readRelationshipGoal: async () => { throw new Error("down"); },
    }),
    null,
  );
  assert.equal(
    await readDemoModeViewForActor({ actorId: "account:a" }, {
      enabled: () => true,
      readGuideStatus: async () => { throw new Error("down"); },
      readRelationshipGoal: async () => "goal",
    }),
    null,
  );
});

test("guide view: passes the goal to the progress check and maps only in-demo statuses", async () => {
  const seen: unknown[] = [];
  const view = await readDemoModeViewForActor({ actorId: "account:a", userId: "subject:a" }, {
    enabled: () => true,
    readGuideStatus: async (input) => { seen.push(input); return IN_DEMO; },
    readRelationshipGoal: async () => "三个月内找到 5 家试用客户",
  });
  assert.deepEqual(seen, [{ actorId: "account:a", relationshipGoal: "三个月内找到 5 家试用客户", userId: "subject:a" }]);
  assert.deepEqual(view, {
    bannerCollapsed: true,
    completed: 2,
    confirmedContacts: 3,
    nextStep: "plan",
    steps: { contacts: true, goal: true, plan: false },
  });
  assert.equal(demoModeViewFromGuideStatus(null), null);
  assert.equal(demoModeViewFromGuideStatus({ bannerCollapsed: false, grandfathered: true, inDemo: false, progress: null }), null);
});

/* ── W0054：示例完整快照（结构／机会／洞察） ─────────────────────── */

test("W0054 SC-04: the demo snapshot's evidence and every insight row trace back to the 30 demo contacts; texts are bilingual and carry no digits", async () => {
  const { buildDemoNetworkSnapshotView, buildDemoInsightsView, buildDemoOpportunitiesView, buildDemoStructureExtras } = await import("../../app/(app)/app/_demo/demo-network-analysis");
  const ids = new Set(buildDemoNetworkViewModel(NOW, "zh").connections.map((contact) => contact.id));
  for (const lang of ["zh", "en"] as const) {
    const snapshot = buildDemoNetworkSnapshotView(NOW, lang);
    assert.equal(snapshot.state, "ready");
    assert.deepEqual([...new Set(snapshot.blocks.map((block) => block.kind))].sort(), ["diagnosis", "gap", "insight", "plan"]);
    for (const block of snapshot.blocks) {
      assert.ok(block.evidence.contactIds.length > 0, block.key);
      assert.ok(block.evidence.contactIds.every((id) => ids.has(id)), `${block.key} evidence is a demo contact`);
      assert.doesNotMatch(block.text, /\d/, `${block.key}: a snapshot sentence carries no statistics`);
    }
    const extras = buildDemoStructureExtras(NOW, lang);
    assert.equal(extras.snapshot.state, "ready");
    const insights = buildDemoInsightsView(NOW, lang, {});
    assert.equal(insights.rows.length, 30);
    assert.deepEqual(new Set(insights.rows.map((row) => row.contactId)), ids);
    for (const row of insights.rows) {
      assert.ok(row.insight.goalRelation?.zh && row.insight.goalRelation.en, row.contactId);
      assert.ok(row.insight.nextStep?.zh && row.insight.nextStep.en, row.contactId);
      assert.ok(row.insight.evidence.length > 0);
    }
    const opportunities = buildDemoOpportunitiesView(NOW, lang);
    assert.ok((opportunities.dormant ?? []).every((row) => ids.has(row.contactId)));
  }
  // 默认按相关度排序，最相关的是要找的 IT 负责人／商会对接人。
  const sorted = buildDemoInsightsView(NOW, "zh", {}).rows.map((row) => row.insight.relevance ?? 0);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => b - a));
});
