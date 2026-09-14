import assert from "node:assert/strict";
import test from "node:test";
import { mockManualProfile, mockProfileFixture, mockPendingProfileFixture, mockEmptyProfileFixture, mockProfileUpdateInput } from "../../features/profile/fixtures";
import { createMockProfileService } from "../../features/profile/mock-service";
import { mockContactListItems, buildContactsListSearchPayload } from "../../features/contacts/fixtures";
import { mockContactDetail, mockUpdatedContactDetail } from "../../features/contacts/detail-fixtures";
import { mockRelationshipNaturalSearchResults, mockPilotOperatorSearchFixture, mockFintechReferralSearchFixture } from "../../features/search/fixtures";
import { validateIndustrySelection } from "../../shared/domain/industries";
import type { IndustrySelectionContract } from "../../shared/contract/industries";
import { industryFixturePeople, readIndustryFixtureProjections } from "../support/industry-fixture-inventory";
import { legacyDefaultMockFixtures } from "../../shared/mock/fixtures";
import { createMockStateStore } from "../../shared/mock/state-store";
import * as fixtureInventory from "../support/industry-fixture-inventory";

test("account seed inventory keeps all twelve people and identifies the three unresolved classifications", () => {
  const read = Reflect.get(fixtureInventory, "readAccountContactIndustryFixtureSource") as undefined | (() => {
    source: string;
    constructor: string;
    records: {
      personId: string;
      accountId: string;
      classification: string;
      basis: string;
      projections: { recordId: string; path: string; selection: IndustrySelectionContract }[];
    }[];
  });
  const source = read?.();
  assert.ok(source, "seed coverage must execute the pure constructor without loading its CLI");
  assert.equal(source.source, "shared/mock/account-contact-fixtures.ts");
  assert.equal(source.constructor, "buildAccountContactFixtures");
  assert.equal(source.records.length, 12);
  assert.equal(source.records.filter((record) => record.classification === "confirmed").length, 9);
  assert.deepEqual(source.records.filter((record) => record.classification === "missing_basis").map((record) => record.personId), [
    "orbit-person-9cb4ed0cd2-07", "orbit-person-9cb4ed0cd2-10", "orbit-person-9cb4ed0cd2-11",
  ]);
  source.records.forEach((record, index) => {
    assert.equal(record.accountId, "industry-fixture-account");
    assert.ok(record.basis.length > 0);
    assert.equal(record.projections.length, 2);
    assert.deepEqual(record.projections.map((projection) => projection.path), ["contact", "contact.publicProfile"]);
    assert.ok(record.projections.every((projection) => projection.recordId === `orbit-contact-9cb4ed0cd2-${String(index + 1).padStart(2, "0")}`));
    assert.deepEqual(record.projections[0].selection, record.projections[1].selection);
    assert.equal(validateIndustrySelection(record.projections[0].selection).valid, true);
    assert.equal(Boolean(record.projections[0].selection.secondaryIndustryId), record.classification === "confirmed");
  });
});

test("inventory classifies event domains, search preferences, aggregate buckets and message runs without inventing person industries", () => {
  const read = Reflect.get(fixtureInventory, "readNonPersonIndustryFixtureSources") as undefined | (() => {
    source: string;
    classification: string;
    reason: string;
    records: { id: string; role: string }[];
  }[]);
  const sources = read?.() ?? [];
  assert.deepEqual(sources.map(source => ({ source: source.source, records: source.records })), [
    {
      source: "shared/ai/mock-fixtures.ts",
      records: [
        { id: "demo-ai-run-1", role: "message_draft" },
        { id: "demo-ai-run-2", role: "relationship_context_summary" },
      ],
    },
    {
      source: "features/dashboard/distribution-fixtures.ts",
      records: [
        { id: "industry:climate-infrastructure", role: "aggregate_bucket" },
        { id: "industry:industrial-operations", role: "aggregate_bucket" },
        { id: "industry:venture-capital", role: "aggregate_bucket" },
        { id: "industry:developer-platforms", role: "aggregate_bucket" },
      ],
    },
    {
      source: "features/recommendations/event-value-fixtures.ts",
      records: [
        { id: "profile:demo-founder", role: "event_search_preference" },
        { id: "demo-event-1", role: "event_domain" },
        { id: "demo-event-2", role: "event_domain" },
        { id: "demo-event-3", role: "event_domain" },
      ],
    },
  ]);
  assert.ok(sources.every(source => source.classification === "no_person_industry" && source.reason.length > 0));
});

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

test("executable inventory enumerates real constructor outputs and links detail aliases to the same person", async () => {
  const projections = await readIndustryFixtureProjections();
  assert.equal(projections.length, 32);
  assert.deepEqual([...new Set(projections.map(row => row.personId))].sort(), [
    "contact:hana-sato", "contact:kenji-watanabe", "contact:mina-tan", "contact:omar-rahman", "person_mina_tanaka", "person_nia_patel", "profile_ari_kato", "profile_ari_lane",
  ]);
  assert.equal(new Set(projections.map(row => `${row.source}:${row.constructor}:${row.recordId}`)).size, 32);
  assert.deepEqual(projections.filter(row => row.constructor === "createContactsRecommendationSearchTool.recommend.candidates").map(row => row.personId).sort(), [
    "contact:hana-sato", "contact:kenji-watanabe", "contact:mina-tan", "contact:omar-rahman",
  ]);
  const detail = projections.filter(row => row.recordId === "demo-contact-1");
  assert.equal(detail.length, 2);
  assert.ok(detail.every(row => row.personId === "contact:kenji-watanabe"));
  const byPerson = new Map<string, IndustrySelectionContract>();
  for (const row of projections) {
    assert.ok(Object.hasOwn(industryFixturePeople, row.personId), `Unregistered person ${row.personId}`);
    const expected = industryFixturePeople[row.personId as keyof typeof industryFixturePeople];
    assert.deepEqual(row.selection, { primaryIndustryId: expected.primaryIndustryId, secondaryIndustryId: expected.secondaryIndustryId });
    assert.ok(expected.basis);
    assert.ok(row.accountBasis, `Missing ownership evidence for ${row.recordId}`);
    assert.equal(row.accountId, row.source === "shared/mock/fixtures.ts" ? "account_orbit_demo" : null);
    assert.ok(row.selection.primaryIndustryId);
    assert.ok(row.selection.secondaryIndustryId);
    assert.equal(validateIndustrySelection(row.selection).valid, true);
    const previous = byPerson.get(row.personId);
    if (previous) assert.deepEqual(row.selection, previous, row.personId);
    byPerson.set(row.personId, row.selection);
  }
});

test("legacy runtime people retain their industry across contacts and public profiles while the sparse attendee stays sparse", () => {
  const runtime = createMockStateStore(legacyDefaultMockFixtures).getState();
  const expected: Record<string, readonly [string, string]> = {
    person_mina_tanaka: ["professional_services", "professional_services.human_resources"],
    person_nia_patel: ["community_nonprofit", "community_nonprofit.community_operations"],
  };
  const profile = runtime.profiles[0];
  assert.equal(profile.accountId, "account_orbit_demo");
  assert.deepEqual([profile.publicProfile?.primaryIndustryId, profile.publicProfile?.secondaryIndustryId], ["technology_internet", "technology_internet.enterprise_software"]);
  assert.equal(profile.publicProfile?.industry, "SaaS");
  assert.deepEqual(runtime.networkPeople.map(person => person.id).sort(), Object.keys(expected).sort());
  for (const person of runtime.networkPeople) {
    assert.deepEqual([person.primaryIndustryId, person.secondaryIndustryId], expected[person.id], person.id);
    const contact = runtime.contacts.find(item => item.personId === person.id);
    assert.ok(contact);
    assert.deepEqual([contact.primaryIndustryId, contact.secondaryIndustryId], expected[person.id], contact.id);
  }
  const complete = runtime.attendees.find(item => item.id === "attendee_mina_tanaka");
  assert.ok(complete);
  assert.equal(complete.personId, "person_mina_tanaka");
  assert.deepEqual([complete.publicProfile?.primaryIndustryId, complete.publicProfile?.secondaryIndustryId], expected.person_mina_tanaka);
  assert.equal(complete.publicProfile?.industry, "Marketplace");
  const sparse = runtime.attendees.find(item => item.id === "attendee_nia_patel");
  assert.ok(sparse);
  assert.equal(sparse.personId, "person_nia_patel");
  assert.equal(sparse.publicProfile, undefined);
  assert.equal(sparse.checkedInAt, undefined);
  assert.equal(sparse.seat, undefined);
  assert.equal(runtime.generatedAt, "2026-06-24T12:00:00.000Z");
});
