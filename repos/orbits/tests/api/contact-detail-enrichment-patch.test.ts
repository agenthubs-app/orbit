import assert from "node:assert/strict";
import test from "node:test";

import { createContactDetailGetHandler, createContactDetailPatchHandler } from "../../app/api/contacts/[id]/handler";
import { createLiveContactDetailTagStatusService } from "../../features/contacts/live-detail-service";
import { contactDetailTagStatusServiceFactory } from "../../features/contacts/service-factory";
import { createStorageContactGraphProvider } from "../../features/contacts/storage/contact-live-record-provider";
import { createMemoryLiveRecordStore, type LiveRecord } from "../../shared/storage/live-record-store";

// W0045 SC-04：联系人编辑（PATCH /api/contacts/[id]）写职级／地区／行业，并把来源标为 user；越权与非法值拒绝。

const AT = "2026-09-25T00:00:00.000Z";
const base = { workspaceId: "w", sourceType: "manual", sourceId: "fixture", evidenceIds: ["e"], lifecycleState: "active" as const, createdAt: AT, updatedAt: AT };
const common = { source: { type: "manual", id: "fixture" }, evidenceIds: ["e"], createdAt: AT, updatedAt: AT };
const AI = { origin: "ai", updatedAt: AT, via: "card_ocr" };

function fixtures(): LiveRecord[] {
  return [
    {
      ...base, collectionName: "contacts", recordId: "own", userId: "a",
      payload: {
        ...common, id: "own", displayName: "Mine", stage: "active", location: "東京都千代田区",
        publicProfile: { bio: "keep me", seniorityLevel: "manager" },
        region: { countryCode: "JP", city: "Osaka" },
        enrichment: { version: 1, fields: { seniorityLevel: AI, region: AI } },
      },
    },
    { ...base, collectionName: "contacts", recordId: "foreign", userId: "b", payload: { ...common, id: "foreign", displayName: "Theirs", stage: "active" } },
  ] as LiveRecord[];
}

function harness(t: { mock: { method: (...args: never[]) => unknown } }, options: { conflict?: boolean } = {}) {
  const store = createMemoryLiveRecordStore(fixtures());
  const writes = { count: 0 };
  // 计数并可模拟「期间被别人改过」：条件更新返回 null。
  const counted = Object.assign(Object.create(store) as typeof store, {
    async updateRecordIfCurrent(...args: Parameters<NonNullable<typeof store.updateRecordIfCurrent>>) {
      writes.count += 1;
      if (options.conflict) return null;
      return store.updateRecordIfCurrent!(...args);
    },
  });
  const service = createLiveContactDetailTagStatusService({ provider: createStorageContactGraphProvider({ store: counted, workspaceId: "w" }) });
  const resolution = contactDetailTagStatusServiceFactory.create("mock");
  (t.mock.method as (object: object, name: string, impl: () => unknown) => unknown)(contactDetailTagStatusServiceFactory, "create", () => ({ ...resolution, service }));
  const insightMarks: { contactIds: readonly string[]; reasons: readonly string[] }[] = [];
  const patch = (id: string, body: unknown) => createContactDetailPatchHandler(async () => ({ id: "a" }), { markInsightsDirty: async (input) => { insightMarks.push(input); } })(
    new Request(`https://orbit.test/api/contacts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) },
  );
  const payloadOf = async (id: string) => (await store.getRecord({ workspaceId: "w", collectionName: "contacts", recordId: id }))!.payload as Record<string, unknown>;
  return { insightMarks, patch, payloadOf, store, writes };
}

test("PATCH writes seniority and canonical region and marks both as user edits", async (t) => {
  const { patch, payloadOf } = harness(t);
  // 详情读取能读到三项（职级、规范地区、来源）。
  const read = await createContactDetailGetHandler(async () => ({ id: "a" }))(new Request("https://orbit.test/api/contacts/own"), { params: Promise.resolve({ id: "own" }) });
  const detail = (await read.json() as { data: { contact: Record<string, unknown> } }).data.contact;
  assert.equal(detail.seniorityLevel, "manager");
  assert.deepEqual(detail.region, { countryCode: "JP", city: "Osaka" });
  assert.deepEqual(detail.enrichment, { version: 1, fields: { seniorityLevel: AI, region: AI } });

  const response = await patch("own", { seniorityLevel: "director", region: { countryCode: "JP", city: "東京" } });
  assert.equal(response.status, 200);
  const body = await response.json() as { data: { contact: Record<string, unknown> } };
  assert.equal(body.data.contact.seniorityLevel, "director", "the detail read sees the new seniority");
  assert.deepEqual(body.data.contact.region, { countryCode: "JP", city: "Tokyo" });

  const payload = await payloadOf("own");
  assert.deepEqual(payload.publicProfile, { bio: "keep me", seniorityLevel: "director" });
  assert.deepEqual(payload.region, { countryCode: "JP", city: "Tokyo" });
  assert.equal(payload.location, "東京都千代田区", "the raw location is untouched");
  const fields = (payload.enrichment as { fields: Record<string, { origin: string; via: string }> }).fields;
  assert.equal(fields.seniorityLevel!.origin, "user");
  assert.equal(fields.seniorityLevel!.via, "contact_edit");
  assert.equal(fields.region!.origin, "user");

  // 清空也是用户值；行业编辑沿用 updateContactPrimaryIndustry 并记 user。
  assert.equal((await patch("own", { seniorityLevel: null, region: null, primaryIndustryId: "finance_investment", secondaryIndustryId: "finance_investment.banking" })).status, 200);
  const cleared = await payloadOf("own");
  assert.equal((cleared.publicProfile as Record<string, unknown>).seniorityLevel, undefined);
  assert.equal(cleared.region, undefined);
  assert.equal(cleared.primaryIndustryId, "finance_investment");
  const clearedFields = (cleared.enrichment as { fields: Record<string, { origin: string; via: string }> }).fields;
  assert.deepEqual(
    Object.fromEntries(Object.entries(clearedFields).map(([field, provenance]) => [field, `${provenance.origin}/${provenance.via}`])),
    { seniorityLevel: "user/contact_edit", region: "user/contact_edit", industry: "user/contact_edit" },
  );
});

test("industry, seniority and region in one PATCH are one conditional update; a conflict saves nothing and returns 409", async (t) => {
  const ok = harness(t);
  assert.equal((await ok.patch("own", { primaryIndustryId: "finance_investment", secondaryIndustryId: "finance_investment.banking", seniorityLevel: "vp", region: { countryCode: "JP", city: "Kyoto" } })).status, 200);
  assert.equal(ok.writes.count, 1, "a single CAS for the whole contact payload");
  const saved = await ok.payloadOf("own");
  assert.deepEqual([saved.primaryIndustryId, (saved.publicProfile as Record<string, unknown>).seniorityLevel, saved.region], ["finance_investment", "vp", { countryCode: "JP", city: "Kyoto" }]);

  t.mock.restoreAll();
  const racing = harness(t, { conflict: true });
  const before = JSON.stringify(await racing.store.listRecords({ workspaceId: "w", limit: "unbounded" }));
  const response = await racing.patch("own", { primaryIndustryId: "finance_investment", secondaryIndustryId: "finance_investment.banking", seniorityLevel: "vp" });
  assert.equal(response.status, 409);
  assert.equal(((await response.json()) as { error: { code: string } }).error.code, "CONFLICT");
  assert.equal(JSON.stringify(await racing.store.listRecords({ workspaceId: "w", limit: "unbounded" })), before, "the industry is not saved when the seniority write conflicts");
});

test("PATCH rejects invalid seniority or region values without writing", async (t) => {
  const { patch, store } = harness(t);
  const before = JSON.stringify(await store.listRecords({ workspaceId: "w", limit: "unbounded" }));
  for (const body of [
    { seniorityLevel: "boss" },
    { seniorityLevel: 5 },
    { region: { countryCode: "XX", city: "Tokyo" } },
    { region: { countryCode: "US", city: "Tokyo" } },
    { region: { countryCode: "JP", city: 7 } },
    { region: "JP" },
    { region: { city: "Tokyo" } },
  ]) {
    const response = await patch("own", body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
  assert.equal(JSON.stringify(await store.listRecords({ workspaceId: "w", limit: "unbounded" })), before);
});

test("PATCH and GET never reach another actor's contact", async (t) => {
  const { patch, store } = harness(t);
  const before = JSON.stringify(await store.listRecords({ workspaceId: "w", limit: "unbounded" }));
  const response = await patch("foreign", { seniorityLevel: "vp", region: { countryCode: "JP", city: "Tokyo" } });
  assert.equal(response.status, 404);
  const read = await createContactDetailGetHandler(async () => ({ id: "a" }))(new Request("https://orbit.test/api/contacts/foreign"), { params: Promise.resolve({ id: "foreign" }) });
  assert.equal(read.status, 404);
  assert.equal(JSON.stringify(await store.listRecords({ workspaceId: "w", limit: "unbounded" })), before);
});

test("the provider refuses an enrichment edit outside the actor boundary", async () => {
  const store = createMemoryLiveRecordStore(fixtures());
  const provider = createStorageContactGraphProvider({ store, workspaceId: "w" });
  await assert.rejects(Promise.resolve().then(() => provider.updateContactEnrichment!("foreign", "a", { seniorityLevel: "vp" })), /outside the actor boundary/);
});

test("W0051 SC-01：改行业／职级／地区（补全字段）把这位联系人的洞察标为待更新（reason enrichment）；他人联系人不标", async (t) => {
  const { insightMarks, patch } = harness(t);
  assert.equal((await patch("own", { seniorityLevel: "director" })).status, 200);
  assert.deepEqual(insightMarks.map((mark) => [mark.contactIds, mark.reasons]), [[["own"], ["enrichment"]]]);
  assert.notEqual((await patch("foreign", { seniorityLevel: "director" })).status, 200);
  assert.equal(insightMarks.length, 1);
});
