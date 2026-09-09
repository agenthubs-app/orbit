import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createLiveNetworkDistributionAnalyticsService } from "../../features/dashboard/live-distribution-service";
import { createStorageNetworkDistributionAnalyticsProvider } from "../../features/dashboard/storage/network-distribution-live-record-provider";
import { createMemoryLiveRecordStore } from "../../shared/storage/live-record-store";
import { seedGeneratedRelationshipFixturesIntoLiveStore } from "../../shared/storage/seed-generated-fixtures";
import { loadContactsStructureDetail, structureDetailToView } from "../../app/(app)/app/contacts/analysis/contacts-structure-route-service";
import { ContactsStructureDetail } from "../../app/(app)/app/contacts/analysis/contacts-structure-detail";

async function fixture() {
  const workspaceId = "workspace:web-analysis-detail";
  const store = createMemoryLiveRecordStore<Record<string, unknown>>();
  await seedGeneratedRelationshipFixturesIntoLiveStore({ now: () => "2026-09-08T00:00:00Z", store, workspaceId });
  for (const record of store.listRecords({ collectionName: "contacts", workspaceId })) {
    store.upsertRecord({ ...record, payload: { ...record.payload, primaryIndustryId: "technology_internet" } });
  }
  return createLiveNetworkDistributionAnalyticsService({ provider: createStorageNetworkDistributionAnalyticsProvider({ store, workspaceId }) });
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
