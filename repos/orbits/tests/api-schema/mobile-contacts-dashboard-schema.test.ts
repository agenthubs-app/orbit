import assert from "node:assert/strict";
import test from "node:test";

import { mobileContactsDashboardPayloadSchema } from "../../shared/api-schema/mobile-contacts-dashboard";

function validPayload(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-31T00:00:00.000Z",
    aggregate: {
      state: "success",
      relationshipAssetTotals: {
        contacts: 78,
        connections: 78,
        evidenceBackedRelationships: 78,
        eventsRepresented: 16,
      },
      newContacts: { count: 3, windowLabel: "30 days", contacts: [] },
      highValueCount: 12,
      highValueRelationships: [],
      pendingFollowups: { count: 4, tasks: [] },
      dormantContacts: { count: 5, contacts: [] },
      recentActivity: [],
      summary: "当前人脉概览",
      nextAction: "查看优先事项",
    },
    summary: null,
    opportunities: null,
    gaps: null,
    distributions: {
      state: "success",
      industryDistribution: [],
      valueTypeDistribution: [],
      relationshipStrengthDistribution: [],
      structureDistributions: {
        industry: [
          {
            bucketId: "technology_internet",
            label: "科技与互联网",
            contactCount: 21,
            percentage: 27,
            evidenceIds: ["evidence:contact:1"],
            missingData: false,
            primaryIndustryId: "technology_internet",
          },
        ],
        location: [],
        role: [],
        relationship: [],
      },
      summary: "四维结构",
      nextAction: "查看分组",
    },
    profile: null,
    contacts: null,
    unavailableSections: ["summary", "opportunities", "gaps", "profile", "contacts"],
  };
}

test("mobile contacts dashboard schema accepts a versioned partial aggregate", () => {
  const result = mobileContactsDashboardPayloadSchema.safeParse(validPayload());

  assert.equal(result.success, true);
});

test("mobile contacts dashboard schema rejects malformed nested distribution data", () => {
  const payload = validPayload();
  const distributions = payload.distributions as Record<string, unknown>;
  const dimensions = distributions.structureDistributions as Record<string, unknown>;
  const industry = dimensions.industry as Record<string, unknown>[];
  industry[0] = { ...industry[0], percentage: "27" };

  const result = mobileContactsDashboardPayloadSchema.safeParse(payload);

  assert.equal(result.success, false);
});

test("mobile contacts dashboard schema rejects unknown schema versions", () => {
  const result = mobileContactsDashboardPayloadSchema.safeParse({
    ...validPayload(),
    schemaVersion: 2,
  });

  assert.equal(result.success, false);
});
