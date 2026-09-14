import assert from "node:assert/strict";
import test from "node:test";
import { mockManualProfile, mockProfileFixture, mockPendingProfileFixture, mockEmptyProfileFixture, mockProfileUpdateInput } from "../../features/profile/fixtures";
import { createMockProfileService } from "../../features/profile/mock-service";
import { mockContactListItems, buildContactsListSearchPayload } from "../../features/contacts/fixtures";
import { mockContactDetail, mockUpdatedContactDetail } from "../../features/contacts/detail-fixtures";
import { mockRelationshipNaturalSearchResults, mockPilotOperatorSearchFixture, mockFintechReferralSearchFixture } from "../../features/search/fixtures";
import { validateIndustrySelection } from "../../shared/domain/industries";
import type { IndustrySelectionContract } from "../../shared/contract/industries";

// This is the first covered source family, not a claim that generated data,
// inline test fixtures, or persisted test databases have all been repaired.
test("manual profile fixtures and their real service projections retain the software industry without changing the empty case", async () => {
  const expected = ["technology_internet", "technology_internet.enterprise_software"];
  const service = createMockProfileService();
  const read = await service.getProfile();
  const updated = await service.updateProfile(mockProfileUpdateInput);
  assert.equal(read.success, true);
  assert.equal(updated.success, true);
  if (!read.success || !updated.success) throw new Error("Profile fixture service failed");
  for (const profile of [mockManualProfile, mockProfileFixture.profile, mockPendingProfileFixture.profile, mockProfileUpdateInput, read.data.profile, updated.data.profile]) {
    assert.ok(profile);
    assert.deepEqual([profile.primaryIndustryId, profile.secondaryIndustryId], expected);
    assert.equal(validateIndustrySelection(profile).valid, true);
  }
  assert.equal(mockEmptyProfileFixture.profile, null);
  assert.equal(mockManualProfile.updatedAt, "2026-06-24T11:05:00.000Z");
  assert.equal(mockProfileFixture.completeness.score, 83);
});

test("list, detail, and search fixtures keep one industry per person and preserve legacy search domains", () => {
  const expected: Record<string, readonly [string, string]> = {
    "contact:kenji-watanabe": ["manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment"],
    "contact:hana-sato": ["community_nonprofit", "community_nonprofit.community_operations"],
    "contact:omar-rahman": ["finance_investment", "finance_investment.venture_capital"],
    "contact:mina-tan": ["manufacturing_supply_chain", "manufacturing_supply_chain.industrial_equipment"],
  };
  const projections: { id: string; selection: IndustrySelectionContract }[] = [
    ...mockContactListItems.map(item => ({ id: item.id, selection: item })),
    ...buildContactsListSearchPayload().contacts.map(item => ({ id: item.id, selection: item })),
    ...mockRelationshipNaturalSearchResults.map(item => ({ id: item.contactId, selection: item })),
    ...mockPilotOperatorSearchFixture.results.map(item => ({ id: item.contactId, selection: item })),
    ...mockFintechReferralSearchFixture.results.map(item => ({ id: item.contactId, selection: item })),
    ...[mockContactDetail, mockUpdatedContactDetail].map(item => ({ id: "contact:kenji-watanabe", selection: item })),
  ];
  assert.equal(projections.length, 16);
  for (const { id, selection } of projections) {
    assert.ok(expected[id], `New normal fixture ${id} needs an industry mapping`);
    assert.deepEqual([selection.primaryIndustryId, selection.secondaryIndustryId], expected[id], id);
    assert.equal(validateIndustrySelection(selection).valid, true);
  }
  assert.deepEqual(buildContactsListSearchPayload({ query: "venture ecosystem" }).contacts.map(item => item.id), ["contact:omar-rahman"]);
  assert.equal(mockFintechReferralSearchFixture.results[0].industry, "fintech");
  assert.equal(mockPilotOperatorSearchFixture.results[0].industry, "climate");
  assert.equal(mockContactDetail.publicProfile.industry, "climate infrastructure");
});
