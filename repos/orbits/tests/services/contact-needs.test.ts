import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactNeedsService,
} from "../../features/contact-needs/service";
import {
  scoreContactsForNeed,
} from "../../features/contact-needs/scoring";
import type { ContactListItemContract } from "../../shared/contract/contacts";

function contact(overrides: Partial<ContactListItemContract> & Pick<ContactListItemContract, "id" | "displayName">): ContactListItemContract {
  return {
    role: "",
    organization: "",
    location: "",
    profileSnippet: "",
    relationshipContext: "",
    lastInteractionAt: "2026-09-01T00:00:00.000Z",
    nextAction: "",
    source: { type: "manual", id: `source:${overrides.id}`, label: "手动", evidenceId: `evidence:${overrides.id}` },
    evidence: [],
    tags: [],
    value: { score: 50, valueTypes: [], rationale: "", evidenceIds: [] },
    status: "active",
    databaseQueryExecuted: true,
    searchIndexReadExecuted: false,
    externalNetworkRequested: false,
    aiProviderRequested: false,
    calendarProviderRequested: false,
    emailProviderRequested: false,
    notificationDelivered: false,
    ...overrides,
  };
}

const japanManufacturing = contact({
  id: "contact:a",
  displayName: "田中健",
  role: "采购负责人",
  organization: "关东精工",
  location: "日本东京",
  profileSnippet: "负责制造业采购合作",
  relationshipContext: "讨论过供应链合作",
  primaryIndustryId: "manufacturing_supply_chain",
});
const usTechnology = contact({
  id: "contact:b",
  displayName: "Alex Chen",
  role: "Investment Director",
  organization: "Northstar Ventures",
  location: "United States, California",
  profileSnippet: "Technology investor focused on enterprise software",
  relationshipContext: "Discussed venture investment",
  primaryIndustryId: "technology_internet",
});
const sparse = contact({ id: "contact:c", displayName: "林悦" });

test("the same contacts reorder when the user's need changes", () => {
  const manufacturing = scoreContactsForNeed(
    "寻找日本制造业采购合作伙伴",
    [usTechnology, sparse, japanManufacturing],
  );
  assert.deepEqual(
    manufacturing.matches.map(({ contactId, score, status }) => ({ contactId, score, status })),
    [
      { contactId: "contact:a", score: 100, status: "matched" },
      { contactId: "contact:b", score: 0, status: "no_match" },
      { contactId: "contact:c", score: null, status: "insufficient_data" },
    ],
  );
  assert.deepEqual(manufacturing.matches[0]?.criteria.map((criterion) => criterion.label), ["日本", "制造与供应链", "采购"]);
  assert.equal(manufacturing.matches[0]?.criteria.every((criterion) => criterion.matched), true);

  const investment = scoreContactsForNeed(
    "寻找美国科技投资合作伙伴",
    [japanManufacturing, usTechnology, sparse],
  );
  assert.deepEqual(investment.matches.map((item) => item.contactId), ["contact:b", "contact:a", "contact:c"]);
  assert.equal(investment.matches[0]?.score, 100);
  assert.equal(investment.matches[1]?.score, 0);
});

test("ranking deduplicates contacts, uses stable ties, and ignores old relationship scores", () => {
  const first = contact({ ...usTechnology, id: "contact:z", displayName: "Z", value: { ...usTechnology.value, score: 2 } });
  const duplicate = contact({ ...first, value: { ...first.value, score: 99 } });
  const second = contact({ ...usTechnology, id: "contact:y", displayName: "Y", value: { ...usTechnology.value, score: 98 } });
  const result = scoreContactsForNeed("寻找美国科技投资合作伙伴", [first, second, duplicate]);
  assert.deepEqual(result.matches.map((item) => item.contactId), ["contact:y", "contact:z"]);
  assert.deepEqual(result.matches.map((item) => item.score), [100, 100]);
});

test("a location requirement stays insufficient when location is missing, not a false low score", () => {
  const missingLocation = contact({
    id: "contact:m",
    displayName: "Mika",
    role: "采购负责人",
    profileSnippet: "制造业采购",
    primaryIndustryId: "manufacturing_supply_chain",
  });
  const result = scoreContactsForNeed("寻找日本制造业采购合作伙伴", [missingLocation]);
  assert.equal(result.matches[0]?.score, null);
  assert.equal(result.matches[0]?.status, "insufficient_data");
  assert.deepEqual(result.matches[0]?.missingFields, ["location"]);
});

test("unsupported exclusion goals in every UI language require clarification instead of reversing intent", () => {
  for (const goal of [
    "不要制造业联系人",
    "製造業を除く相手を探す",
    "Find technology contacts excluding investors",
  ]) {
    const result = scoreContactsForNeed(goal, [japanManufacturing, usTechnology]);
    assert.deepEqual(result.criteria, [], goal);
    assert.equal(result.matches.every((item) => item.score === null), true, goal);
  }
});

test("data version changes for scoring evidence but not old relationship value or input order", () => {
  const baseline = scoreContactsForNeed("寻找美国科技投资合作伙伴", [usTechnology, japanManufacturing]);
  const reorderedAndRevalued = scoreContactsForNeed("寻找美国科技投资合作伙伴", [
    { ...japanManufacturing, value: { ...japanManufacturing.value, score: 1 } },
    { ...usTechnology, value: { ...usTechnology.value, score: 99 } },
  ]);
  assert.equal(reorderedAndRevalued.dataVersion, baseline.dataVersion);
  const evidenceChanged = scoreContactsForNeed("寻找美国科技投资合作伙伴", [
    { ...usTechnology, location: "Japan" },
    japanManufacturing,
  ]);
  assert.notEqual(evidenceChanged.dataVersion, baseline.dataVersion);
});

function profile(goal: string, updatedAt: string) {
  return {
    success: true as const,
    data: {
      state: "success" as const,
      profile: {
        id: "profile:1",
        displayName: "User",
        headline: "",
        organization: "",
        role: "",
        homeMarket: "",
        relationshipGoal: goal,
        targetRelationshipTypes: [],
        preferredFollowUpWindow: "",
        preferredLanguage: "zh" as const,
        preferredIntroChannels: [],
        updatedAt,
      },
      completeness: { score: 1, status: "ready" as const, completedFields: [], missingFields: [], nextBestField: null },
      onboarding: { policyVersion: 1 as const, status: "complete" as const, missingFields: [] },
      editor: { canSave: false, dirtyFields: [], lastSavedAt: updatedAt, validationMessages: [] },
      provenance: { source: "test", sourceLabel: "test", evidenceIds: [], collectedAt: updatedAt, privacy: "actor-scoped-profile" as const },
      nextAction: "",
    },
  };
}

function contacts(items: ContactListItemContract[]) {
  return {
    success: true as const,
    data: {
      state: items.length ? "success" as const : "empty" as const,
      query: "",
      appliedFilters: { query: "", sourceFilters: [], statusFilters: [], tagFilters: [], valueFilters: [] },
      availableFilters: { tags: [], sources: [], values: [], statuses: [] },
      contacts: items,
      summary: "",
      provenance: {
        source: "test", sourceLabel: "test", evidenceIds: [], collectedAt: "2026-09-15T00:00:00.000Z",
        privacy: "live-contacts-list-search-filter" as const, generationMethod: "live-store-query" as const,
        searchIndexReadExecuted: false, databaseQueryExecuted: true, externalNetworkRequested: false as const,
        deviceRequested: false as const, aiProviderRequested: false as const, calendarProviderRequested: false as const,
        emailProviderRequested: false as const, notificationDelivered: false as const,
      },
      nextAction: "",
    },
  };
}

test("service binds scores to one actor profile version and detects a mid-read goal change", async () => {
  const actorIds: string[] = [];
  let profileRead = 0;
  const service = createContactNeedsService({
    loadProfile: async (actorId) => {
      actorIds.push(actorId);
      profileRead += 1;
      return profileRead === 1
        ? profile("寻找日本制造业采购合作伙伴", "2026-09-15T00:00:00.000Z")
        : profile("寻找美国科技投资合作伙伴", "2026-09-15T00:00:01.000Z");
    },
    loadContacts: async (actorId) => {
      actorIds.push(actorId);
      return contacts([japanManufacturing, usTechnology]);
    },
    now: () => "2026-09-15T00:00:02.000Z",
  });
  const result = await service.getMatches({ actorId: "account:one" });
  assert.deepEqual(result, { success: false, error: { code: "CONTACT_NEED_CHANGED" } });
  assert.deepEqual(actorIds, ["account:one", "account:one", "account:one"]);
});

test("service returns an explicit unconfigured state without inventing scores", async () => {
  const unchanged = profile("  ", "2026-09-15T00:00:00.000Z");
  const service = createContactNeedsService({
    loadProfile: async () => unchanged,
    loadContacts: async () => contacts([japanManufacturing]),
    now: () => "2026-09-15T00:00:02.000Z",
  });
  const result = await service.getMatches({ actorId: "account:one" });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.state, "unconfigured");
  assert.equal(result.data.goal, "");
  assert.deepEqual(result.data.matches, []);
});
