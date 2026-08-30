import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyLegacyContactIndustry,
  migrateContactPrimaryIndustries,
} from "../../scripts/migrate-contact-primary-industries";
import {
  createMemoryLiveRecordStore,
  type LiveRecord,
} from "../../shared/storage/live-record-store";

const workspaceId = "workspace:contact-industry-migration";
const actorId = "account:xiaoyu";

function contactRecord(input: {
  id: string;
  industry?: string;
  organization?: string;
  primaryIndustryId?: string;
  provider?: string;
  userId?: string;
}): LiveRecord<Record<string, unknown>> {
  return {
    workspaceId,
    collectionName: "contacts",
    recordId: input.id,
    userId: input.userId ?? actorId,
    sourceType: "manual",
    sourceId: `source:${input.id}`,
    provider: input.provider,
    evidenceIds: [],
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
    lifecycleState: "active",
    payload: {
      id: input.id,
      displayName: input.id,
      ...(input.organization ? { organization: input.organization } : {}),
      ...(input.primaryIndustryId
        ? { primaryIndustryId: input.primaryIndustryId }
        : {}),
      ...(input.industry
        ? { publicProfile: { industry: input.industry } }
        : {}),
    },
  };
}

test("legacy industry labels map to the fixed primary industry taxonomy", () => {
  assert.equal(classifyLegacyContactIndustry({ industry: "风险投资" }), "finance_investment");
  assert.equal(classifyLegacyContactIndustry({ industry: "企业人工智能" }), "technology_internet");
  assert.equal(classifyLegacyContactIndustry({ industry: "机器人" }), "manufacturing_supply_chain");
  assert.equal(classifyLegacyContactIndustry({ industry: "品牌战略" }), "media_creative");
  assert.equal(
    classifyLegacyContactIndustry({
      organization: "红桥科技",
      provider: "generated-relationship-fixtures",
    }),
    "technology_internet",
  );
  assert.equal(
    classifyLegacyContactIndustry({ organization: "红桥科技", provider: "manual" }),
    undefined,
  );
  assert.equal(classifyLegacyContactIndustry({ industry: "完全未知的行业" }), undefined);
});

test("migration previews actor-scoped changes without writing", async () => {
  const store = createMemoryLiveRecordStore([
    contactRecord({ id: "finance", industry: "风险投资" }),
    contactRecord({
      id: "preserved",
      industry: "企业软件",
      primaryIndustryId: "professional_services",
    }),
    contactRecord({ id: "unknown", industry: "完全未知的行业" }),
    contactRecord({
      id: "generated",
      organization: "北星餐饮",
      provider: "generated-relationship-fixtures",
    }),
    contactRecord({ id: "other-account", industry: "企业软件", userId: "account:other" }),
  ]);

  const report = await migrateContactPrimaryIndustries({
    actorId,
    apply: false,
    now: () => "2026-08-30T01:00:00.000Z",
    store,
    workspaceId,
  });

  assert.deepEqual(report, {
    actorId,
    applied: false,
    classified: 2,
    preserved: 1,
    scanned: 4,
    unclassified: 1,
    updated: 0,
  });
  assert.equal(
    store.getRecord({ workspaceId, collectionName: "contacts", recordId: "finance" })
      ?.payload.primaryIndustryId,
    undefined,
  );
});

test("migration applies missing industries while preserving existing choices", async () => {
  const store = createMemoryLiveRecordStore([
    contactRecord({ id: "finance", industry: "风险投资" }),
    contactRecord({
      id: "preserved",
      industry: "企业软件",
      primaryIndustryId: "professional_services",
    }),
  ]);

  const report = await migrateContactPrimaryIndustries({
    actorId,
    apply: true,
    now: () => "2026-08-30T01:00:00.000Z",
    store,
    workspaceId,
  });

  assert.equal(report.updated, 1);
  assert.equal(
    store.getRecord({ workspaceId, collectionName: "contacts", recordId: "finance" })
      ?.payload.primaryIndustryId,
    "finance_investment",
  );
  assert.equal(
    store.getRecord({ workspaceId, collectionName: "contacts", recordId: "preserved" })
      ?.payload.primaryIndustryId,
    "professional_services",
  );
});
