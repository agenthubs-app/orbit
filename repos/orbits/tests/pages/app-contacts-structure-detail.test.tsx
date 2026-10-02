import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createLiveNetworkDistributionAnalyticsService } from "../../features/dashboard/live-distribution-service";
import { createMemoryNetworkDistributionProvider } from "../support/memory-dashboard-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { loadContactsStructureDetail, structureDetailToView } from "../../app/(app)/app/contacts/analysis/contacts-structure-route-service";
import { ContactsStructureDetail } from "../../app/(app)/app/contacts/analysis/contacts-structure-detail";
import { distributionService } from "../support/structure-tab-fixture";

async function fixture() {
  const workspaceId = "workspace:web-analysis-detail";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ now: () => "2026-09-08T00:00:00Z", store, workspaceId });
  for (const record of store.listRecords({ limit: "unbounded", collectionName: "contacts", workspaceId })) {
    store.upsertRecord({ ...record, payload: { ...record.payload, primaryIndustryId: "technology_internet" } });
  }
  return createLiveNetworkDistributionAnalyticsService({ provider: createMemoryNetworkDistributionProvider({ store, workspaceId }) });
}

test("all four dimensions load the service's matched contacts and actual group proportions", async () => {
  const service = await fixture();
  const distributions = await service.getDistributions();
  if (!distributions.success) throw new Error("Missing fixture");
  for (const dimension of ["industry", "location", "role", "relationship"] as const) {
    const bucket = distributions.data.structureDistributions[dimension][0];
    assert.ok(bucket);
    const view = await loadContactsStructureDetail({ actorId: "actor:one", dimension, bucketId: bucket.bucketId, language: "en", service });
    assert.equal(view.state, "ready");
    if (view.state !== "ready") continue;
    assert.equal(view.count, bucket.contactCount);
    assert.equal(view.percentage, bucket.percentage);
    assert.equal(view.contacts.length, bucket.contactCount);
    assert.equal(view.dimension, dimension);
    const html = renderToStaticMarkup(<ContactsStructureDetail view={view} />);
    for (const contact of view.contacts) assert.ok(html.includes(contact.href));
    assert.match(html, /tab=structure/);
  }
});

test("invalid dimension or missing actor never invokes the detail provider", async () => {
  let calls = 0;
  const service = { getStructureDetail: async () => { calls++; throw new Error("Must not run"); } };
  for (const input of [{ actorId: "", dimension: "industry", bucketId: "one" }, { actorId: "actor:one", dimension: "email", bucketId: "one" }, { actorId: "actor:one", dimension: "industry", bucketId: " " }]) {
    assert.deepEqual(await loadContactsStructureDetail({ ...input, language: "zh", service }), { state: "error" });
  }
  assert.equal(calls, 0);
});

test("detail mapping rejects a wrong group and preserves literal contact fields and encoded links", async () => {
  const service = await fixture();
  const result = await service.getStructureDetail({ dimension: "industry", bucketId: "technology_internet" });
  if (!result.success) throw new Error("Missing fixture");
  const data = structuredClone(result.data);
  assert.deepEqual(structureDetailToView(data, "location", "technology_internet", "zh"), { state: "error" });
  assert.deepEqual(structureDetailToView(data, "industry", "another", "zh"), { state: "error" });
  const edited = { ...data, contacts: [{ ...data.contacts[0], id: "contact:one/two", displayName: "CRM:林", tags: ["VIP:A", "未翻译"], organization: "CRM:Literal" }] };
  const view = structureDetailToView(edited, "industry", "technology_internet", "en");
  assert.equal(view.state, "ready");
  if (view.state !== "ready") return;
  assert.equal(view.label, "Technology & Internet");
  assert.equal(view.contacts[0].href, "/app/contacts/contact%3Aone%2Ftwo");
  assert.equal(view.contacts[0].name, "CRM:林");
  assert.equal(view.contacts[0].organization, "CRM:Literal");
  assert.deepEqual(view.contacts[0].tags, ["VIP:A", "未翻译"]);
});

test("malformed and failed details show a recoverable error, not an empty contact group", async () => {
  assert.deepEqual(structureDetailToView({}, "industry", "one", "zh"), { state: "error" });
  const view = await loadContactsStructureDetail({ actorId: "actor:one", dimension: "industry", bucketId: "one", language: "zh", service: { getStructureDetail: async () => { throw new Error("offline"); } } });
  assert.deepEqual(view, { state: "error" });
  const html = renderToStaticMarkup(<ContactsStructureDetail view={view} />);
  assert.match(html, /role="alert"/);
  assert.doesNotMatch(html, /暂无联系人/);
});

test("SC-W0043-03: system group names and the detail insight are bilingual templates built from counts", () => {
  const input = (bucketId: string, label: string, contactCount: number) => ({
    state: contactCount ? "success" : "empty", dimension: "role",
    bucket: { bucketId, label, contactCount, percentage: 40, missingData: false },
    totalContactCount: 10,
    relationshipQuality: [{ id: "strong", label: "强关系", contactCount: 1, percentage: 25 }, { id: "warm", label: "保持联系", contactCount: 3, percentage: 75 }, { id: "weak", label: "待重新联系", contactCount: 0, percentage: 0 }],
    commonTags: [], insight: "经营决策者共有 4 位联系人，当前以保持联系为主。", contacts: [],
  });
  const en = structureDetailToView(input("role_decision_maker", "经营决策者", 4), "role", "role_decision_maker", "en");
  const zh = structureDetailToView(input("role_decision_maker", "经营决策者", 4), "role", "role_decision_maker", "zh");
  if (en.state !== "ready" || zh.state !== "ready") throw new Error("Missing detail");
  assert.equal(en.label, "Decision makers");
  assert.equal(en.insight, "This group has 4 contacts; most are warm ties.");
  assert.equal(zh.label, "经营决策者");
  assert.equal(zh.insight, "经营决策者共有 4 位联系人，当前以中关系为主。");
  const empty = structureDetailToView(input("unclassified", "未分类", 0), "role", "unclassified", "en");
  if (empty.state !== "ready") throw new Error("Missing detail");
  assert.equal(empty.label, "Unclassified");
  assert.equal(empty.insight, "No contacts in this group yet.");
  const userLocation = structureDetailToView({ ...input("location_%E6%B7%B1%E5%9C%B3", "深圳南山", 2), dimension: "location" }, "location", "location_%E6%B7%B1%E5%9C%B3", "en");
  if (userLocation.state !== "ready") throw new Error("Missing detail");
  assert.equal(userLocation.label, "深圳南山");
  const html = renderToStaticMarkup(<ContactsStructureDetail view={en} />);
  assert.match(html, /This group has 4 contacts; most are warm ties/);
  assert.doesNotMatch(html, /经营决策者共有/);
});

// ---- W0049：结构标签新维度的名单下钻 ----

test("W0049 SC-02: seniority, region, industry secondary and tier groups open lists whose size equals the group on the chart", async () => {
  const service = distributionService();
  const distributions = await service.getDistributions();
  if (!distributions.success) throw new Error("Missing fixture");
  const structure = distributions.data.structureDistributions;
  // 分母随维度：二级 = 所在一级人数（科技 15），其余 = 35（夹具里 35 人都有档位行）。
  const cases: Array<[string, string, number, string, number]> = [
    ["seniority", structure.seniority![0]!.bucketId, structure.seniority![0]!.contactCount, "Decision makers", 35],
    ["region", structure.region![0]!.bucketId, structure.region![0]!.contactCount, "Japan · Tokyo", 35],
    ["industry_secondary", structure.industry[0]!.secondary![0]!.bucketId, structure.industry[0]!.secondary![0]!.contactCount, "Enterprise Software & SaaS", 15],
    ["tier", "dormant", distributions.data.relationshipTierDistribution!.find((bucket) => bucket.tier === "dormant")!.relationshipCount, "To re-engage", 35],
  ];
  for (const [dimension, bucketId, count, label, total] of cases) {
    const view = await loadContactsStructureDetail({ actorId: "actor:one", dimension, bucketId, language: "en", service });
    assert.equal(view.state, "ready", dimension);
    if (view.state !== "ready") continue;
    assert.equal(view.count, count, dimension);
    assert.equal(view.contacts.length, count, dimension);
    assert.equal(view.label, label, dimension);
    assert.equal(view.total, total, dimension);
    const html = renderToStaticMarkup(<ContactsStructureDetail view={view} />);
    for (const contact of view.contacts) assert.ok(html.includes(contact.href));
  }
  // 不在白名单的维度与不存在的分组仍是错误态。
  assert.deepEqual(await loadContactsStructureDetail({ actorId: "actor:one", dimension: "secondary", bucketId: "x", language: "zh", service }), { state: "error" });
  assert.deepEqual(await loadContactsStructureDetail({ actorId: "actor:one", dimension: "tier", bucketId: "warm", language: "zh", service }), { state: "error" });
});
