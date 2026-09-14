import type { IndustrySelectionContract } from "../../shared/contract/industries";
import { mockManualProfile, mockProfileFixture, mockPendingProfileFixture, mockProfileUpdateInput } from "../../features/profile/fixtures";
import { createMockProfileService } from "../../features/profile/mock-service";
import { mockContactListItems, buildContactsListSearchPayload } from "../../features/contacts/fixtures";
import { mockContactDetail, mockUpdatedContactDetail } from "../../features/contacts/detail-fixtures";
import { mockRelationshipNaturalSearchResults, mockPilotOperatorSearchFixture, mockFintechReferralSearchFixture } from "../../features/search/fixtures";

// Incremental inventory: pending families below remain in SC-05's denominator.
// Do not import seed CLIs here: some load credentials or write during import.
export const industryFixturePeople = {
  profile_ari_lane: {
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
    basis: "Orbit founder building relationship operating software.",
  },
  "contact:kenji-watanabe": {
    primaryIndustryId: "manufacturing_supply_chain",
    secondaryIndustryId: "manufacturing_supply_chain.industrial_equipment",
    basis: "Aster Grid founder developing storage pilot partnerships.",
  },
  "contact:hana-sato": {
    primaryIndustryId: "community_nonprofit",
    secondaryIndustryId: "community_nonprofit.community_operations",
    basis: "Tokyo Climate Guild community lead; climate is the community's topic.",
  },
  "contact:omar-rahman": {
    primaryIndustryId: "finance_investment",
    secondaryIndustryId: "finance_investment.venture_capital",
    basis: "Northstar Ventures platform partner working with venture portfolios.",
  },
  "contact:mina-tan": {
    primaryIndustryId: "manufacturing_supply_chain",
    secondaryIndustryId: "manufacturing_supply_chain.industrial_equipment",
    basis: "Storage pilot partnerships; shared contact ID links HarborGrid/Harbor Storage projections.",
  },
} as const;

export const industryFixtureExceptions = [
  {
    source: "features/profile/fixtures.ts",
    constructor: "mockEmptyProfileFixture",
    classification: "missing_field_negative",
    reason: "No profile exists; preserve null instead of inventing a person or industry.",
    test: "tests/services/secondary-industry-fixture-coverage.test.ts: manual profile fixtures and their real service projections retain the software industry without changing the empty case",
  },
] as const;

export const pendingIndustryFixtureSources = [
  { source: "shared/mock/fixtures.ts", reason: "Legacy profile/contact/attendee records and networkPeople require mapping and projection coverage; networkPeople currently has no industry fields. Preserve the explicitly sparse attendee case." },
  { source: "shared/mock/generated-relationship-fixtures.ts", reason: "Generated runtime projections require the separately reviewed source/output mapping; do not edit the generated output by hand." },
  { source: "shared/ai/mock-fixtures.ts", reason: "Two inspected runs hold message/context text, not person industry fields; finish consumer classification before excluding the family." },
  { source: "features/dashboard/distribution-fixtures.ts", reason: "Inspected values are aggregate industry buckets, not individual people; retain aggregate/consumer classification work." },
  { source: "features/recommendations/event-value-fixtures.ts", reason: "Profile industryPreference describes the desired event domain, not the person's industry; inspect remaining projections separately." },
  { source: "scripts/seed-account-contact-fixtures.ts", reason: "Seed CLI: inspect pure builders without import or execution." },
  { source: "scripts/seed-account-agent-pressure-fixtures.ts", reason: "Seed CLI: inspect pure builders without import or execution." },
  { source: "scripts/seed-event-operations-e2e.ts", reason: "Seed CLI: inspect pure builders without import or execution." },
  { source: "scripts/seed-primary-test-account.ts", reason: "Seed CLI: inspect pure builders without import or execution." },
  { source: "shared/storage/seed-generated-fixtures.ts", reason: "Trace all generated person projections without seeding a database." },
  { source: "Web tests/ and test helpers", reason: "Normal inline fixtures, acquisition-confirmation objects, and negative/legacy cases still require record-level enumeration." },
  { source: "App tests/ and tests/helpers/", reason: "Normal profile/contact/AI/HTTP fixtures and their negative cases still require record-level enumeration." },
  { source: "repos/mockdata seed/generated/exports and root generator", reason: "132 users, 132 contacts, 500 participant source rows plus related projections; not unique-person totals. Exact mapping/output scope awaits separate review." },
  { source: "Persisted isolated test records", reason: "Environment, workspace, actor, record IDs, expected versions and write approval are not established." },
] as const;

export type IndustryFixtureProjection = {
  source: string;
  constructor: string;
  recordId: string;
  personId: string;
  accountId: string | null;
  accountBasis: string;
  selection: IndustrySelectionContract;
};

export async function readIndustryFixtureProjections(): Promise<IndustryFixtureProjection[]> {
  const service = createMockProfileService();
  const read = await service.getProfile();
  const updated = await service.updateProfile(mockProfileUpdateInput);
  if (!read.success || !updated.success) throw new Error("Profile fixture service failed during inventory");
  const rows: IndustryFixtureProjection[] = [];
  const add = (source: string, constructor: string, recordId: string, personId: string, selection: IndustrySelectionContract | null) => {
    if (!selection) throw new Error(`Missing normal fixture ${source}:${constructor}:${recordId}`);
    rows.push({
      source, constructor, recordId, personId,
      accountId: null,
      accountBasis: "Unscoped capability fixture; no authenticated account ownership is encoded in this source.",
      selection: { primaryIndustryId: selection.primaryIndustryId, secondaryIndustryId: selection.secondaryIndustryId },
    });
  };
  for (const [constructor, profile] of [
    ["mockManualProfile", mockManualProfile],
    ["mockProfileFixture.profile", mockProfileFixture.profile],
    ["mockPendingProfileFixture.profile", mockPendingProfileFixture.profile],
    ["mockProfileUpdateInput", mockProfileUpdateInput],
    ["createMockProfileService.getProfile", read.data.profile],
    ["createMockProfileService.updateProfile", updated.data.profile],
  ] as const) {
    const profileId = profile && "id" in profile ? profile.id : mockManualProfile.id;
    add("features/profile/fixtures.ts", constructor, profileId, profileId, profile);
  }
  for (const [constructor, items] of [
    ["mockContactListItems", mockContactListItems],
    ["buildContactsListSearchPayload.contacts", buildContactsListSearchPayload().contacts],
  ] as const) {
    for (const item of items) add("features/contacts/fixtures.ts", constructor, item.id, item.id, item);
  }
  for (const [constructor, items] of [
    ["mockRelationshipNaturalSearchResults", mockRelationshipNaturalSearchResults],
    ["mockPilotOperatorSearchFixture.results", mockPilotOperatorSearchFixture.results],
    ["mockFintechReferralSearchFixture.results", mockFintechReferralSearchFixture.results],
  ] as const) {
    for (const item of items) add("features/search/fixtures.ts", constructor, item.id, item.contactId, item);
  }
  for (const [constructor, item] of [
    ["mockContactDetail", mockContactDetail],
    ["mockUpdatedContactDetail", mockUpdatedContactDetail],
  ] as const) {
    add("features/contacts/detail-fixtures.ts", constructor, item.id, "contact:kenji-watanabe", item);
  }
  return rows;
}
