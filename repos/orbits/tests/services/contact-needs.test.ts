import assert from "node:assert/strict";
import test from "node:test";

import {
  createContactNeedsService,
} from "../../features/contact-needs/service";
import {
  CONTACT_NEEDS_SCORING_VERSION,
  criteriaForNeed,
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
  profileSnippet: "负责制造业采购实施合作",
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

test("ordering aliases preserve the original goal and count one business concept", () => {
  for (const goal of [
    "我现在在做餐厅AI点单系统，想认识一些合作方。",
    "餐廳點單與點餐系統合作", "餐厅点单与点餐系统合作",
    "レストランの注文システムで協力相手を探す", "Restaurant ordering and order-taking collaboration",
  ]) {
    assert.equal(criteriaForNeed(goal).filter(item => item.id === "scenario:ordering").length, 1, goal);
  }
});

test("a store operator's own tax landing request is not implementation experience", () => {
  const result = scoreContactsForNeed("我现在在做餐厅AI点单系统，想认识一些合作方。", [contact({
    id: "intent", displayName: "Anonymous", role: "门店经营者",
    profileSnippet: "某机构的门店经营者。本次关注日本落地可信赖的税务与设立顾问，可提供关西合作渠道介绍。",
  })]);
  const match = result.matches[0]!;
  const implementation = match.criteria.find(item => item.id === "collaboration:implementation")!;
  assert.equal(implementation.matched, false);
  assert.equal(implementation.strength, "none");
  assert.equal(implementation.evidenceField, null);
  assert.equal(implementation.evidenceExcerpt, null);
  const component = match.components!.find(item => item.dimension === "collaboration")!;
  assert.equal(component.baseWeight, 20);
  assert.equal(component.points, 0);
  assert.equal(component.weight, 100 * 20 / 90);
  assert.ok(match.score !== null && match.score < 100);
});

test("future, negated and unrelated implementation claims do not earn collaboration points", () => {
  for (const profileSnippet of [
    "希望为餐厅实施点单系统，可提供试点合作。", "计划负责餐厅点单系统交付。", "没有完成餐厅点单系统实施。",
    "曾为餐厅完成日本税务落地与公司设立。", "门店经营者希望找实施合作方。",
    "レストランの注文システム導入を希望しています。", "注文システム導入を担当する予定です。", "注文システムを導入していません。",
    "レストラン向け税務サービスの導入を完了しました。",
    "Hopes to implement restaurant ordering systems and can offer a pilot.", "Will be responsible for restaurant ordering implementation.",
    "Has never delivered restaurant ordering implementation.", "Implemented tax incorporation services for restaurants.",
    "Completed manufacturing procurement implementation; seeks restaurant ordering partners.",
  ]) {
    const match = scoreContactsForNeed("AI restaurant ordering collaboration", [contact({ id: "claim", displayName: "Claim", role: "门店经营者", profileSnippet })]).matches[0]!;
    const criterion = match.criteria.find(item => item.id === "collaboration:implementation")!;
    assert.equal(criterion.matched, false, profileSnippet);
    assert.equal(criterion.evidenceField, null, profileSnippet);
    assert.equal(match.components!.find(item => item.dimension === "collaboration")!.points, 0, profileSnippet);
  }
});

test("related completed work and actual duties survive mixed requests with original source excerpts", () => {
  for (const [profileSnippet, expectedExcerpt] of [
    ["曾为3家餐厅上线点单系统，完成POS对接交付。希望认识合作方。", "曾为3家餐厅上线点单系统"],
    ["负责餐厅点餐系统实施，计划寻找新的合作方。", "负责餐厅点餐系统实施"],
    ["レストランの注文システム導入を完了しました。協業を希望しています。", "レストランの注文システム導入を完了しました"],
    ["レストランの注文システム導入を担当しています。", "レストランの注文システム導入を担当しています"],
    ["Delivered restaurant ordering systems. Seeking collaboration partners.", "Delivered restaurant ordering systems"],
    ["Responsible for restaurant ordering implementation and looking for partners.", "Responsible for restaurant ordering implementation"],
  ]) {
    const match = scoreContactsForNeed("AI restaurant ordering collaboration", [contact({ id: "fact", displayName: "Fact", profileSnippet })]).matches[0]!;
    const criterion = match.criteria.find(item => item.id === "collaboration:implementation")!;
    assert.equal(criterion.matched, true, profileSnippet);
    assert.equal(criterion.strength, "direct", profileSnippet);
    assert.equal(criterion.evidenceField, "profile", profileSnippet);
    assert.equal(criterion.evidenceExcerpt, expectedExcerpt, profileSnippet);
    assert.equal(match.components!.find(item => item.dimension === "collaboration")!.points, 100 * 20 / 90, profileSnippet);
  }
  const role = "餐厅点餐系统实施负责人";
  const match = scoreContactsForNeed("餐厅点餐合作", [contact({ id: "role", displayName: "Role", role, profileSnippet: "希望寻找合作方" })]).matches[0]!;
  assert.equal(match.criteria.find(item => item.id === "collaboration:implementation")?.evidenceField, "role");
  assert.equal(match.criteria.find(item => item.id === "collaboration:implementation")?.evidenceExcerpt, role);
});

for (const profileSnippet of [
  "将负责餐厅点单系统实施。", "レストラン注文システムの導入は未完了です。",
  "No completed restaurant ordering implementation projects.", "曾讨论餐厅点单系统实施方案。",
]) test(`unfulfilled or discussed work is not implementation experience: ${profileSnippet}`, () => {
  const match = scoreContactsForNeed("AI restaurant ordering collaboration", [contact({ id: "unfulfilled", displayName: "Anonymous", profileSnippet })]).matches[0]!;
  assert.equal(match.criteria.find(item => item.id === "collaboration:implementation")?.matched, false);
  assert.equal(match.components!.find(item => item.dimension === "collaboration")!.points, 0);
});

test("restaurant ordering collaboration ranks delivery evidence above generic AI, in three languages", () => {
  const delivery = contact({ id: "delivery", displayName: "Delivery", role: "Software developer", profileSnippet: "Builds restaurant ordering systems; offers implementation and pilot collaboration" });
  const pilot = contact({ id: "pilot", displayName: "Pilot", role: "餐厅店长", profileSnippet: "提供餐饮门店点餐试点合作" });
  const ai = contact({ id: "ai", displayName: "AI", role: "Investment director", profileSnippet: "AI", tags: ["AI", "AI"] });
  for (const goal of ["现在在做餐厅AI点餐系统，想找一些合作伙伴", "レストランのAI注文システムを作っています。協力相手を探す", "I am building an AI restaurant ordering system, looking for collaboration partners"]) {
    const result = scoreContactsForNeed(goal, [ai, pilot, delivery]);
    assert.equal(CONTACT_NEEDS_SCORING_VERSION, "needs-evidence-v2");
    assert.equal(result.criteria.some(item => /现在|在做|一些|系统|system/.test(item.label)), false);
    assert.equal(result.matches[0]?.contactId, "delivery");
    assert.ok((result.matches.find(item => item.contactId === "pilot")?.score ?? 0) > (result.matches.find(item => item.contactId === "ai")?.score ?? 0));
    const weak = result.matches.find(item => item.contactId === "ai")!;
    assert.ok(weak.score !== null && weak.score <= 15);
    assert.equal((weak as any).summary.code, "weak_ai");
    const components = (result.matches[0] as any).components;
    assert.deepEqual(components.map((item: any) => item.baseWeight), [35, 35, 20]);
    assert.equal(result.matches[0]?.score, Math.round(components.reduce((sum: number, item: any) => sum + item.points, 0)));
    assert.equal(result.matches[0]?.summary?.criterionIds.includes("capability:delivery"), true);
    assert.equal(result.matches[0]?.summary?.criterionIds.length, 2);
  }
});

test("names and organizations are not capability evidence; Latin substrings and repeated tags cannot boost scores", () => {
  const misleading = contact({ id: "misleading", displayName: "AI Restaurant Developer", organization: "Restaurant Ordering Pilot AI", role: "Retail manager", profileSnippet: "Retail operations" });
  const substring = contact({ id: "substring", displayName: "Substring", role: "Chairperson", profileSnippet: "Retail manager" });
  const tagged = contact({ id: "tagged", displayName: "Tagged", tags: ["AI", "AI", "restaurant", "developer"] });
  const result = scoreContactsForNeed("AI restaurant ordering collaboration", [misleading, substring, tagged]);
  assert.equal(result.matches.find(item => item.contactId === "misleading")?.score, 0);
  assert.equal(result.matches.find(item => item.contactId === "substring")?.score, 0);
  const pending = result.matches.find(item => item.contactId === "tagged")!;
  assert.equal(pending.score, null);
  assert.equal(pending.criteria.some(item => item.matched && item.evidenceField === "tags" && item.evidenceExcerpt === "AI"), true);
  const single = scoreContactsForNeed("AI restaurant ordering collaboration", [{ ...tagged, tags: ["AI"] }]);
  assert.deepEqual((pending as any).components, (single.matches[0] as any).components);
});

test("explicit counterpart capability is separate from the user's own project", () => {
  const criteria = criteriaForNeed("我做餐厅点餐软件，寻找投资人合作");
  assert.equal(criteria.some(item => item.id === "capability:investment"), true);
  assert.equal(criteria.some(item => item.id === "capability:delivery"), false);
  const contextOnly = criteriaForNeed("我在做采购软件，寻找餐饮门店合作伙伴");
  assert.equal(contextOnly.some(item => item.id === "capability:procurement"), false);
});

test("structured industry evidence quotes the field that actually matched", () => {
  const secondary = contact({ id: "secondary", displayName: "Secondary", primaryIndustryId: "technology_internet", secondaryIndustryId: "manufacturing_supply_chain.industrial_equipment" });
  const result = scoreContactsForNeed("制造业", [secondary]);
  const criterion = result.matches[0]?.criteria.find(item => item.id === "industry:manufacturing_supply_chain");
  assert.equal(criterion?.matched, true);
  assert.equal(criterion?.evidenceField, "industry");
  assert.equal(criterion?.evidenceExcerpt, secondary.secondaryIndustryId);
});

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
  assert.deepEqual(manufacturing.matches[0]?.criteria.map((criterion) => criterion.label), ["日本", "制造与供应链", "采购", "落地合作"]);
  assert.equal(manufacturing.matches[0]?.criteria.every((criterion) => criterion.matched), true);

  const investment = scoreContactsForNeed(
    "寻找美国科技投资合作伙伴",
    [japanManufacturing, usTechnology, sparse],
  );
  assert.deepEqual(investment.matches.map((item) => item.contactId), ["contact:b", "contact:a", "contact:c"]);
  // Investment is proven, implementation collaboration is not: its 20 points stay unearned.
  assert.equal(investment.matches[0]?.score, 80);
  // Manufacturing procurement implementation does not prove technology-investment collaboration.
  assert.equal(investment.matches[1]?.score, 0);
});

test("ranking deduplicates contacts, uses stable ties, and ignores old relationship scores", () => {
  const first = contact({ ...usTechnology, id: "contact:z", displayName: "Z", value: { ...usTechnology.value, score: 2 } });
  const duplicate = contact({ ...first, value: { ...first.value, score: 99 } });
  const second = contact({ ...usTechnology, id: "contact:y", displayName: "Y", value: { ...usTechnology.value, score: 98 } });
  const result = scoreContactsForNeed("寻找美国科技投资合作伙伴", [first, second, duplicate]);
  assert.deepEqual(result.matches.map((item) => item.contactId), ["contact:y", "contact:z"]);
  assert.deepEqual(result.matches.map((item) => item.score), [80, 80]);
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
