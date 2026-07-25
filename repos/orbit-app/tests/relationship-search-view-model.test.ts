import assert from "node:assert/strict";
import test from "node:test";

type RelationshipSearchModule = {
  buildRelationshipSearchRequest?: (input: unknown) => unknown;
  relationshipSearchToView?: (data: unknown) => unknown;
  relationshipSearchSuggestionsToView?: (data: unknown) => unknown;
};

async function loadRelationshipSearchModule(): Promise<RelationshipSearchModule | null> {
  try {
    return (await import("../src/view-models/relationship-search")) as RelationshipSearchModule;
  } catch {
    return null;
  }
}

test("relationshipSearchSuggestionsToView maps web suggestions into Chinese chips", async () => {
  const searchModule = await loadRelationshipSearchModule();
  assert.equal(typeof searchModule?.relationshipSearchSuggestionsToView, "function");

  const view = searchModule?.relationshipSearchSuggestionsToView?.({
    nextAction: "Choose one prompt and review the returned source evidence.",
    state: "success",
    suggestions: [
      {
        businessIntent: "find_warm_intro",
        evidenceHint:
          "Uses manual dinner notes and event roster evidence in the fixture set.",
        filterPreview: {
          followUpStatuses: [],
          industries: ["climate"],
          sources: [],
          valueTypes: ["strategic_intro"]
        },
        id: "relationship-search-suggestion:climate-operator-intro",
        query: "Who can introduce me to climate pilot operators?"
      },
      {
        businessIntent: "recover_event_follow_up",
        evidenceHint:
          "Uses event-import and source evidence with a follow-up status flag.",
        filterPreview: {
          followUpStatuses: ["needs_follow_up"],
          industries: [],
          sources: [],
          valueTypes: []
        },
        id: "relationship-search-suggestion:investor-event-follow-up",
        query: "Which investors need an event follow-up this week?"
      },
      {
        businessIntent: "explore_partnership",
        evidenceHint:
          "Uses email signal evidence and relationship value tags from fixtures.",
        filterPreview: {
          followUpStatuses: [],
          industries: ["fintech"],
          sources: [],
          valueTypes: ["referral_path"]
        },
        id: "relationship-search-suggestion:fintech-referral",
        query: "Find fintech partners with referral value"
      }
    ],
    summary: "Mock suggestions expose supported natural search prompts and filters."
  });

  assert.deepEqual(view, {
    emptyText: "",
    nextAction: "选一个问题，先看来源证据。",
    suggestions: [
      {
        detail: "找暖介绍 · 气候 · 战略引荐",
        evidenceHint: "来自饭局记录和活动名单。",
        id: "relationship-search-suggestion:climate-operator-intro",
        query: "谁能介绍气候试点运营方",
        request: {
          body: {
            businessIntent: "find_warm_intro",
            industryFilters: ["climate"],
            query: "Who can introduce me to climate pilot operators?",
            valueTypeFilters: ["strategic_intro"]
          },
          endpoint: "/api/search/relationships"
        }
      },
      {
        detail: "找会后跟进 · 待跟进",
        evidenceHint: "来自活动导入记录和跟进状态。",
        id: "relationship-search-suggestion:investor-event-follow-up",
        query: "本周该跟进哪些投资人",
        request: {
          body: {
            businessIntent: "recover_event_follow_up",
            followUpStatusFilters: ["needs_follow_up"],
            query: "Which investors need an event follow-up this week?"
          },
          endpoint: "/api/search/relationships"
        }
      },
      {
        detail: "找合作机会 · 金融科技 · 引荐路径",
        evidenceHint: "来自邮件线索和关系价值标签。",
        id: "relationship-search-suggestion:fintech-referral",
        query: "找有引荐价值的金融科技伙伴",
        request: {
          body: {
            businessIntent: "explore_partnership",
            industryFilters: ["fintech"],
            query: "Find fintech partners with referral value",
            valueTypeFilters: ["referral_path"]
          },
          endpoint: "/api/search/relationships"
        }
      }
    ],
    summary: "3 个搜索建议",
    title: "推荐搜索"
  });
  assert.doesNotMatch(JSON.stringify(view), /mock|fixture|provider|implementation/i);
});

test("relationshipSearchSuggestionsToView localizes live relationship graph prompts", async () => {
  const searchModule = await loadRelationshipSearchModule();
  assert.equal(typeof searchModule?.relationshipSearchSuggestionsToView, "function");

  const view = searchModule?.relationshipSearchSuggestionsToView?.({
    nextAction: "Choose one prompt and review returned source evidence.",
    state: "success",
    suggestions: [
      {
        businessIntent: "recover_event_follow_up",
        evidenceHint: "Relationship search Postgres live storage",
        filterPreview: {
          followUpStatuses: ["needs_follow_up"],
          industries: [],
          sources: [],
          valueTypes: []
        },
        id: "relationship-search-suggestion:live-follow-up",
        query: "Who needs a follow-up from my live relationship graph?"
      },
      {
        businessIntent: "find_warm_intro",
        evidenceHint: "2026-07-23T23:09:55.346Z",
        filterPreview: {
          followUpStatuses: [],
          industries: [],
          sources: [],
          valueTypes: ["referral_path", "strategic_intro"]
        },
        id: "relationship-search-suggestion:live-intro",
        query: "Find warm introduction paths in my live relationship graph"
      },
      {
        businessIntent: "source_customer_reference",
        evidenceHint: "Relationship search Postgres live storage",
        filterPreview: {
          followUpStatuses: [],
          industries: [],
          sources: [],
          valueTypes: ["commercial_opportunity"]
        },
        id: "relationship-search-suggestion:live-customer-reference",
        query: "Find customer reference opportunities from live contacts"
      }
    ],
    summary: "Live suggestions expose supported relationship search prompts and filters."
  });

  assert.deepEqual(
    (view as { suggestions: { query: string }[] }).suggestions.map(
      (suggestion) => suggestion.query
    ),
    ["找需要跟进的人", "找暖介绍路径", "找客户参考机会"]
  );
});

test("relationshipSearchSuggestionsToView keeps empty states useful", async () => {
  const searchModule = await loadRelationshipSearchModule();
  assert.equal(typeof searchModule?.relationshipSearchSuggestionsToView, "function");

  const view = searchModule?.relationshipSearchSuggestionsToView?.({
    nextAction: "Use the default suggestions probe after fixture review completes.",
    state: "empty",
    suggestions: [],
    summary: "No mock natural search suggestions are available for this state."
  });

  assert.deepEqual(view, {
    emptyText: "暂时没有推荐搜索。",
    nextAction: "可以直接输入姓名、公司、资源或想找的人。",
    suggestions: [],
    summary: "0 个搜索建议",
    title: "推荐搜索"
  });
});

test("buildRelationshipSearchRequest prepares the web relationship search request", async () => {
  const searchModule = await loadRelationshipSearchModule();
  assert.equal(typeof searchModule?.buildRelationshipSearchRequest, "function");

  assert.deepEqual(
    searchModule?.buildRelationshipSearchRequest?.({
      followUpStatusFilters: ["needs_follow_up"],
      query: " 谁能介绍气候试点运营方 ",
      sourceFilters: ["manual"],
      valueTypeFilters: ["strategic_intro"]
    }),
    {
      request: {
        body: {
          followUpStatusFilters: ["needs_follow_up"],
          query: "谁能介绍气候试点运营方",
          sourceFilters: ["manual"],
          valueTypeFilters: ["strategic_intro"]
        },
        endpoint: "/api/search/relationships"
      },
      success: true
    }
  );

  assert.deepEqual(searchModule?.buildRelationshipSearchRequest?.({ query: "   " }), {
    error: "先输入想找的人、资源或机会。",
    success: false
  });
});

test("relationshipSearchToView maps web natural search results into Chinese cards", async () => {
  const searchModule = await loadRelationshipSearchModule();
  assert.equal(typeof searchModule?.relationshipSearchToView, "function");

  const view = searchModule?.relationshipSearchToView?.({
    appliedFilters: {
      businessIntent: "find_warm_intro",
      followUpStatuses: ["needs_follow_up"],
      industries: ["climate"],
      sources: ["manual"],
      valueTypes: ["strategic_intro"]
    },
    nextAction: "Review source evidence before taking any follow-up action.",
    query: "Who can introduce me to climate pilot operators?",
    results: [
      {
        avatarAssetUrl: "/orbit-demo-assets/avatars/contact-001.svg",
        contactId: "contact:kenji-watanabe",
        displayName: "Kenji Watanabe",
        evidence: [
          {
            excerpt:
              "Manual dinner note says Kenji asked for a warm intro to climate pilot operators this week."
          }
        ],
        followUpStatus: "needs_follow_up",
        id: "relationship-search-result:kenji-watanabe",
        industry: "climate",
        location: "Tokyo",
        matchScore: {
          band: "high",
          matchedFields: [
            "relationshipContext",
            "matchedBusinessIntents",
            "recommendedAction"
          ],
          rationale:
            "Direct query language overlaps with pilot, operator, intro, climate, and follow-up evidence.",
          value: 96
        },
        matchedBusinessIntents: ["find_warm_intro", "source_customer_reference"],
        organization: "Aster Grid",
        recommendedAction:
          "Send Kenji the climate pilot operator intro with the dinner context attached.",
        relationshipContext:
          "Met at the climate founders dinner and discussed storage pilot operators.",
        role: "Founder",
        value: {
          evidenceIds: ["evidence:relationship-search-kenji"],
          rationale:
            "Kenji has a specific operator intro request and enough dinner context for a useful warm path.",
          score: 94,
          valueTypes: ["commercial_opportunity", "strategic_intro"]
        }
      }
    ],
    state: "success",
    summary: "1 relationship result(s) matched the mock natural search boundary."
  });

  assert.deepEqual(view, {
    emptyText: "",
    filtersLabel: "意图：找暖介绍 · 行业：气候 · 来源：手动记录 · 价值：战略引荐 · 状态：待跟进",
    nextAction: "先看来源证据，再决定是否跟进。",
    queryLabel: "问题：谁能介绍气候试点运营方",
    results: [
      {
        contactId: "contact:kenji-watanabe",
        detail: "Aster Grid · 创始人 · 气候 · 东京",
        evidence: "饭局记录：Kenji 本周想找气候试点运营方的暖介绍。",
        id: "relationship-search-result:kenji-watanabe",
        imageUrl: "/orbit-demo-assets/avatars/contact-001.svg",
        name: "Kenji Watanabe",
        nextAction: "把气候试点运营方的引荐需求发给 Kenji，并附上晚餐背景。",
        relationship: "在气候创业者晚餐认识，聊过储能试点运营方。",
        score: "96",
        scoreLabel: "高匹配",
        valueLabels: ["商业机会", "战略引荐"]
      }
    ],
    summary: "1 位相关人脉",
    title: "关系搜索结果"
  });
  assert.doesNotMatch(JSON.stringify(view), /mock|fixture|provider|implementation/i);
});

test("relationshipSearchToView keeps empty states useful", async () => {
  const searchModule = await loadRelationshipSearchModule();
  assert.equal(typeof searchModule?.relationshipSearchToView, "function");

  assert.deepEqual(
    searchModule?.relationshipSearchToView?.({
      appliedFilters: {
        businessIntent: null,
        followUpStatuses: [],
        industries: [],
        sources: [],
        valueTypes: []
      },
      nextAction:
        "Clear the natural language query or choose a supported mock filter before searching relationships again.",
      query: "notfound",
      results: [],
      state: "empty",
      summary: "No relationship results are available for this mock state."
    }),
    {
      emptyText: "没有找到合适的人。换个问法，或先清空筛选。",
      filtersLabel: "未使用筛选",
      nextAction: "换个问法，或先清空筛选。",
      queryLabel: "问题：notfound",
      results: [],
      summary: "0 位相关人脉",
      title: "关系搜索结果"
    }
  );
});
