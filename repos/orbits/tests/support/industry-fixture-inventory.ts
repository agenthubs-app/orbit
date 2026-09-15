import type { IndustrySelectionContract } from "../../shared/contract/industries";
import { mockManualProfile, mockProfileFixture, mockPendingProfileFixture, mockProfileUpdateInput } from "../../features/profile/fixtures";
import { createMockProfileService } from "../../features/profile/mock-service";
import { mockContactListItems, buildContactsListSearchPayload } from "../../features/contacts/fixtures";
import { mockContactDetail, mockUpdatedContactDetail } from "../../features/contacts/detail-fixtures";
import { mockRelationshipNaturalSearchResults, mockPilotOperatorSearchFixture, mockFintechReferralSearchFixture } from "../../features/search/fixtures";
import { legacyDefaultMockFixtures } from "../../shared/mock/fixtures";
import { createMockStateStore } from "../../shared/mock/state-store";
import { createContactsRecommendationSearchTool } from "../../features/contacts/contact-recommendation-search";
import { createMockRelationshipNaturalSearchService } from "../../features/search/mock-service";
import { mockAiProviderRuns } from "../../shared/ai/mock-fixtures";
import { mockNetworkDistributionAnalyticsFixture } from "../../features/dashboard/distribution-fixtures";
import { mockEventValueRecommendationProfile, mockEventValueRecommendations } from "../../features/recommendations/event-value-fixtures";
import { buildAccountContactFixtures } from "../../shared/mock/account-contact-fixtures";

// Incremental inventory: pending families below remain in SC-05's denominator.
// Do not import seed CLIs here: some load credentials or write during import.
export const industryFixturePeople = {
  profile_ari_kato: {
    primaryIndustryId: "technology_internet",
    secondaryIndustryId: "technology_internet.enterprise_software",
    basis: "Legacy Orbit founder providing relationship-operations software.",
  },
  person_mina_tanaka: {
    primaryIndustryId: "professional_services",
    secondaryIndustryId: "professional_services.human_resources",
    basis: "Northstar Labs hiring marketplace: the attendee profile explicitly seeks operators for hiring marketplaces, not a retail marketplace.",
  },
  person_nia_patel: {
    primaryIndustryId: "community_nonprofit",
    secondaryIndustryId: "community_nonprofit.community_operations",
    basis: "Civic Operators Guild community lead, linked by personId in both contact and attendee records.",
  },
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
    source: "shared/mock/fixtures.ts",
    constructor: "legacyDefaultMockFixtures.attendees",
    recordId: "attendee_nia_patel",
    classification: "missing_field_negative",
    reason: "Explicit sparse attendee has RSVP but no public profile, seat, or check-in; normal linked person/contact have an industry without inventing the missing profile.",
    test: "tests/services/secondary-industry-fixture-coverage.test.ts: legacy runtime people retain their industry across contacts and public profiles while the sparse attendee stays sparse",
  },
  {
    source: "features/profile/fixtures.ts",
    constructor: "mockEmptyProfileFixture",
    classification: "missing_field_negative",
    reason: "No profile exists; preserve null instead of inventing a person or industry.",
    test: "tests/services/secondary-industry-fixture-coverage.test.ts: manual profile fixtures and their real service projections retain the software industry without changing the empty case",
  },
] as const;

export const pendingIndustryFixtureSources = [
  { source: "shared/mock/generated-relationship-fixtures.ts", reason: "Generated runtime projections require the separately reviewed source/output mapping; do not edit the generated output by hand." },
  { source: "scripts/seed-account-contact-fixtures.ts", reason: "Pure constructor inventory covers 12 people / 24 projections: 9 confirmed, 3 missing classification basis. CLI and persisted records have not been executed or verified." },
  { source: "scripts/seed-account-agent-pressure-fixtures.ts", reason: "Seed CLI: inspect pure builders without import or execution." },
  { source: "scripts/seed-event-operations-e2e.ts", reason: "Seed CLI: inspect pure builders without import or execution." },
  { source: "scripts/seed-primary-test-account.ts", reason: "Seed CLI: inspect pure builders without import or execution." },
  { source: "shared/storage/seed-generated-fixtures.ts", reason: "Trace all generated person projections without seeding a database." },
  { source: "Web tests/ and test helpers", reason: "Normal inline fixtures, acquisition-confirmation objects, and negative/legacy cases still require record-level enumeration." },
  { source: "App tests/ and tests/helpers/", reason: "Normal profile/contact/AI/HTTP fixtures and their negative cases still require record-level enumeration." },
  { source: "repos/mockdata seed/generated/exports and root generator", reason: "132 users, 132 contacts, 500 participant source rows plus related projections; not unique-person totals. Exact mapping/output scope awaits separate review." },
  { source: "Persisted isolated test records", reason: "Environment, workspace, actor, record IDs, expected versions and write approval are not established." },
] as const;

export function readAccountContactIndustryFixtureSource() {
  const missingBasis: Record<number, string> = {
    6: "社群／非营利父类下的可持续顾问，尚不能区分社群运营、公益组织或另一个父类的咨询业务。",
    9: "只有制造业和工厂数字化信息，未说明具体生产行业，不能从其技术需求反推行业。",
    10: "数字医疗试点评估不能唯一对应医疗服务、器械或健康管理，目录没有数字医疗子类。",
  };
  return {
    source: "shared/mock/account-contact-fixtures.ts",
    constructor: "buildAccountContactFixtures",
    records: buildAccountContactFixtures("industry-fixture-account").map(({ sourceIndex, fixture, contact, connection }) => {
      if (!contact.personId || !contact.publicProfile || connection.contactId !== contact.id) {
        throw new Error(`Incomplete account fixture links at source index ${sourceIndex}`);
      }
      if (!contact.secondaryIndustryId && !missingBasis[sourceIndex]) {
        throw new Error(`Unexplained missing industry at source index ${sourceIndex}`);
      }
      return {
        personId: contact.personId,
        accountId: connection.accountId,
        classification: missingBasis[sourceIndex] ? "missing_basis" : "confirmed",
        basis: missingBasis[sourceIndex] ?? `固定源定义：${fixture.industry}；${fixture.profileBio}`,
        projections: [
          { path: "contact", selection: contact },
          { path: "contact.publicProfile", selection: contact.publicProfile },
        ].map(({ path, selection }) => ({
          recordId: contact.id,
          path,
          selection: {
            primaryIndustryId: selection.primaryIndustryId,
            secondaryIndustryId: selection.secondaryIndustryId,
          },
        })),
      };
    }),
  };
}

// These families remain explicitly registered, outside the normal-person count.
// Their full source and consumer paths were inspected; no person industry is inferred.
export function readNonPersonIndustryFixtureSources() {
  return [
    {
      source: "shared/ai/mock-fixtures.ts",
      constructor: "mockAiProviderRuns",
      classification: "no_person_industry",
      reason: "AI provider run() constructs message drafts and relationship summaries. mock-provider.payloadForRun preserves that output role; recipient names are references, not industry-bearing profiles.",
      records: mockAiProviderRuns.map(run => ({ id: run.runId, role: run.output.kind })),
    },
    {
      source: "features/dashboard/distribution-fixtures.ts",
      constructor: "mockNetworkDistributionAnalyticsFixture.industryDistribution",
      classification: "no_person_industry",
      reason: "mock-distribution-service clones aggregate buckets and gap recommendations, with counts and example references rather than individual person profiles. Do not assign one person's industry to a bucket.",
      records: mockNetworkDistributionAnalyticsFixture.industryDistribution.map(bucket => ({ id: bucket.bucketId, role: "aggregate_bucket" })),
    },
    {
      source: "features/recommendations/event-value-fixtures.ts",
      constructor: "mockEventValueRecommendationProfile + mockEventValueRecommendations",
      classification: "no_person_industry",
      reason: "The profile holds an event search preference. mock-event-value-service.scoreForInput compares that preference to the recommended event's domain; neither field states the user's own industry.",
      records: [
        { id: mockEventValueRecommendationProfile.profileId, role: "event_search_preference" },
        ...mockEventValueRecommendations.map(event => ({ id: event.eventId, role: "event_domain" })),
      ],
    },
  ];
}

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
  const add = (source: string, constructor: string, recordId: string, personId: string, selection: IndustrySelectionContract | null, accountId: string | null = null) => {
    if (!selection) throw new Error(`Missing normal fixture ${source}:${constructor}:${recordId}`);
    rows.push({
      source, constructor, recordId, personId,
      accountId,
      accountBasis: accountId
        ? "Legacy profile.accountId and person-to-contact-to-connection.accountId links in the same runtime fixture."
        : "Unscoped capability fixture; no authenticated account ownership is encoded in this source.",
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
  const recommendations = await createContactsRecommendationSearchTool({
    relationshipSearchService: createMockRelationshipNaturalSearchService(),
  }).recommend({ query: "" });
  if (recommendations.state !== "success") throw new Error("Recommendation fixture service failed during inventory");
  for (const candidate of recommendations.candidates) {
    add("features/search/fixtures.ts", "createContactsRecommendationSearchTool.recommend.candidates", candidate.contactId, candidate.contactId, candidate);
  }
  const legacy = createMockStateStore(legacyDefaultMockFixtures).getState();
  for (const profile of legacy.profiles) {
    add("shared/mock/fixtures.ts", "legacyDefaultMockFixtures.profiles.publicProfile", profile.id, profile.id, profile.publicProfile ?? null, profile.accountId);
  }
  const accountForPerson = (personId: string) => {
    const contacts = legacy.contacts.filter(contact => contact.personId === personId);
    const accounts = new Set(legacy.connections.filter(connection => contacts.some(contact => contact.id === connection.contactId)).map(connection => connection.accountId));
    if (accounts.size !== 1) throw new Error(`Ambiguous legacy account for ${personId}`);
    return [...accounts][0];
  };
  for (const person of legacy.networkPeople) {
    add("shared/mock/fixtures.ts", "legacyDefaultMockFixtures.networkPeople", person.id, person.id, person, accountForPerson(person.id));
  }
  for (const contact of legacy.contacts) {
    if (!contact.personId) throw new Error(`Missing person link for ${contact.id}`);
    add("shared/mock/fixtures.ts", "legacyDefaultMockFixtures.contacts", contact.id, contact.personId, contact, accountForPerson(contact.personId));
  }
  for (const attendee of legacy.attendees) {
    if (attendee.id === "attendee_nia_patel" && !attendee.publicProfile) continue; // Explicit negative above; tested separately.
    if (!attendee.personId) throw new Error(`Missing person link for ${attendee.id}`);
    add("shared/mock/fixtures.ts", "legacyDefaultMockFixtures.attendees.publicProfile", attendee.id, attendee.personId, attendee.publicProfile ?? null, accountForPerson(attendee.personId));
  }
  return rows;
}

// This combines the already enumerated sources; pending families remain open.
// It is an inventory, never a list of authorized database write targets.
export async function readIndustryFixtureCoverage() {
  const rows = await readIndustryFixtureProjections();
  const people = new Map<string, { personId: string; classification: string; basis: string; projections: { source: string; recordId: string; path: string; selection: IndustrySelectionContract }[] }>();
  for (const row of rows) {
    const mapping = industryFixturePeople[row.personId as keyof typeof industryFixturePeople];
    if (!mapping) throw new Error(`Unregistered normal fixture ${row.personId}`);
    if (row.selection.primaryIndustryId !== mapping.primaryIndustryId || row.selection.secondaryIndustryId !== mapping.secondaryIndustryId) throw new Error(`Conflicting industry projection for ${row.personId}`);
    const person = people.get(row.personId) ?? { personId: row.personId, classification: "confirmed", basis: mapping.basis, projections: [] };
    person.projections.push({ source: row.source, recordId: row.recordId, path: row.constructor, selection: row.selection });
    people.set(row.personId, person);
  }
  const accountSource = readAccountContactIndustryFixtureSource();
  for (const record of accountSource.records) {
    if (people.has(record.personId)) throw new Error(`Duplicate source person ${record.personId}`);
    people.set(record.personId, { personId: record.personId, classification: record.classification, basis: record.basis, projections: record.projections.map(projection => ({ ...projection, source: accountSource.source })) });
  }
  const values = [...people.values()];
  return {
    complete: false,
    counts: {
      people: values.length,
      confirmedPeople: values.filter(person => person.classification === "confirmed").length,
      missingBasisPeople: values.filter(person => person.classification === "missing_basis").length,
      projections: values.reduce((total, person) => total + person.projections.length, 0),
      exceptions: industryFixtureExceptions.length,
      nonPersonRecords: readNonPersonIndustryFixtureSources().reduce((total, source) => total + source.records.length, 0),
      pendingSources: pendingIndustryFixtureSources.length,
    },
    people: values,
    exceptions: industryFixtureExceptions,
    pendingSources: pendingIndustryFixtureSources,
  };
}
