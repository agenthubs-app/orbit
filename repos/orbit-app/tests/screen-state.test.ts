import assert from "node:assert/strict";
import test from "node:test";
import type { ApiResult } from "../src/api/types";
import {
  buildContactsSearchRequest,
  contactStatusFilterOptions,
  contactSearchFilterSections,
  contactAvatarFor,
  contactsSearchToView,
  contactsToSummaries,
  toggleContactSearchFilter
} from "../src/view-models/contacts";
import { conversationsToSummaries } from "../src/view-models/conversations";
import {
  eventDiscoveryFilterCounts,
  eventDiscoveryTopics,
  eventsToSummaries,
  filterEventSummaries
} from "../src/view-models/events";
import { profileToSummary } from "../src/view-models/profile";
import { resultToRouteState } from "../src/view-models/route-state";
import { tasksToScheduleItems } from "../src/view-models/schedule";

const meta = {
  featureMode: "live",
  privacy: "no-relationship-data",
  runtimeBoundary: "developer-admin"
};

test("resultToRouteState maps successful non-empty data", () => {
  const result: ApiResult<{ items: string[] }> = {
    success: true,
    data: { items: ["a"] },
    meta,
    status: 200
  };

  assert.deepEqual(
    resultToRouteState(result, (data) => data.items.length === 0),
    {
      kind: "success",
      data: { items: ["a"] },
      meta,
      status: 200
    }
  );
});

test("resultToRouteState maps successful empty data", () => {
  const result: ApiResult<{ items: string[] }> = {
    success: true,
    data: { items: [] },
    meta,
    status: 200
  };

  assert.deepEqual(
    resultToRouteState(result, (data) => data.items.length === 0),
    {
      kind: "empty",
      data: { items: [] },
      meta,
      status: 200
    }
  );
});

test("resultToRouteState maps API failures and offline failures", () => {
  const failed: ApiResult<never> = {
    success: false,
    error: { code: "SERVICE_UNAVAILABLE", message: "database unavailable" },
    meta,
    status: 503
  };
  const offline: ApiResult<never> = {
    success: false,
    error: { code: "ORBIT_APP_NETWORK_ERROR", message: "connection refused" },
    meta: {
      featureMode: null,
      privacy: null,
      runtimeBoundary: null
    },
    status: 0
  };

  assert.equal(resultToRouteState(failed, () => false).kind, "failure");
  assert.equal(resultToRouteState(offline, () => false).kind, "offline");
});

test("eventsToSummaries maps Orbit event list payloads", () => {
  const summaries = eventsToSummaries({
    events: [
      {
        id: "event-1",
        sourceMetadata: {
          label:
            "東京AI実装パートナー申込会 / 东京 AI 落地伙伴对接会 / Tokyo AI Implementation Partner Registration Meetup"
        },
        title:
          "東京AI実装パートナー申込会 / Tokyo AI Implementation Partner Registration Meetup",
        venue: "Shibuya",
        startsAt: "2026-08-04T14:00:00+09:00",
        status: "confirmed"
      }
    ]
  });

  assert.deepEqual(summaries, [
    {
      actionLabel: "报名",
      coverPath: "/orbit-covers/events/tokyo-ai-partner-meetup.jpg",
      id: "event-1",
      location: "Shibuya",
      participantCountLabel: "报名人数待确认",
      startsAt: "8月4日 周二 14:00",
      status: "已确认",
      subtitle: "",
      topics: [],
      title: "东京 AI 落地伙伴对接会"
    }
  ]);
});

test("eventsToSummaries exposes image-list metadata for event lists", () => {
  const summaries = eventsToSummaries({
    events: [
      {
        host: "Orbit",
        id: "event-module-1",
        industry: "企业 AI",
        location: "大阪",
        participantCount: 42,
        startsAt: "2026-08-12T19:00:00+09:00",
        status: "scheduled",
        tags: ["中日商务", "企业 AI", "渠道合作"],
        theme: "AI 落地",
        title: "关西企业 AI 交流会"
      },
      {
        id: "event-module-ended",
        participantCount: 0,
        startsAt: "2026-07-02T19:00:00+09:00",
        status: "ended",
        title: "创业者复盘会"
      }
    ]
  });

  assert.deepEqual(summaries[0], {
    actionLabel: "报名",
    coverPath: "/orbit-covers/events/kansai-business-connect.jpg",
    id: "event-module-1",
    location: "大阪",
    participantCountLabel: "42 人已报名",
    startsAt: "8月12日 周三 19:00",
    status: "已确认",
    subtitle: "AI 落地 · Orbit",
    topics: ["企业 AI", "AI 落地", "中日商务"],
    title: "关西企业 AI 交流会"
  });
  assert.equal(summaries[1]?.actionLabel, "查看");
  assert.equal(summaries[1]?.participantCountLabel, "报名人数待确认");
});

test("filterEventSummaries supports event discovery search, status, and topic chips", () => {
  const summaries = eventsToSummaries({
    events: [
      {
        id: "event-live",
        industry: "企业 AI",
        location: "东京",
        startsAt: "2026-07-24T18:30:00+09:00",
        status: "live",
        tags: ["AI 落地", "渠道合作"],
        theme: "晚宴",
        title: "东京 AI 负责人晚宴"
      },
      {
        id: "event-next",
        industry: "跨境商务",
        location: "大阪",
        startsAt: "2026-08-02T14:00:00+09:00",
        status: "scheduled",
        tags: ["渠道合作", "电商"],
        theme: "关西渠道",
        title: "关西跨境商务交流会"
      },
      {
        id: "event-ended",
        industry: "创业",
        location: "京都",
        startsAt: "2026-06-02T14:00:00+09:00",
        status: "ended",
        tags: ["复盘"],
        title: "创业者复盘会"
      }
    ]
  });

  assert.deepEqual(eventDiscoveryFilterCounts(summaries), {
    active: 1,
    all: 3,
    ended: 1,
    upcoming: 1
  });
  assert.deepEqual(eventDiscoveryTopics(summaries).slice(0, 6), [
    "企业 AI",
    "晚宴",
    "AI 落地",
    "跨境商务",
    "关西渠道",
    "渠道合作"
  ]);
  assert.deepEqual(
    filterEventSummaries(summaries, {
      query: "大阪",
      status: "all",
      topic: ""
    }).map((event) => event.id),
    ["event-next"]
  );
  assert.deepEqual(
    filterEventSummaries(summaries, {
      query: "商务",
      status: "upcoming",
      topic: "跨境商务"
    }).map((event) => event.id),
    ["event-next"]
  );
  assert.deepEqual(
    filterEventSummaries(summaries, {
      query: "晚宴",
      status: "upcoming",
      topic: ""
    }).map((event) => event.id),
    []
  );
});

test("eventsToSummaries attaches web event cover paths", () => {
  const summaries = eventsToSummaries({
    events: [
      {
        id: "event_signup_01",
        sourceMetadata: {
          label:
            "関西越境ビジネス申込テスト会 / 关西跨境商务报名测试会 / Kansai Cross-Border Business Signup Lab"
        },
        startsAt: "2026-07-21T10:00:00+09:00",
        status: "confirmed",
        venue: "Osaka"
      }
    ]
  });

  assert.equal(
    summaries[0]?.coverPath,
    "/orbit-covers/events/kansai-business-connect.jpg"
  );
});

test("contactsToSummaries maps contact list payloads", () => {
  const summaries = contactsToSummaries({
    contacts: [
      {
        avatarAssetUrl: "/orbit-demo-assets/avatars/contact-001.svg",
        displayName: "Maya Chen",
        id: "contact-1",
        nextAction: "Review Maya Chen with source evidence before agent use.",
        organization: "Northstar",
        profileSnippet:
          "Northstar の投資家。 / Northstar 的投资人。本次关注「日本落地可信赖的税务与设立顾问」，可提供「关西合作渠道介绍」。 / Investor at Northstar.",
        relationshipContext:
          "Maya Chen has a concrete current-user relationship record from Warm referral for Maya Chen.",
        role: "Partner",
        status: "needs_follow_up",
          value: {
            score: 91,
          valueTypes: ["strategic_fit", "community_resource", "referral_path"]
          }
      }
    ]
  });

  assert.deepEqual(summaries, [
    {
      imageUrl: "/orbit-demo-assets/avatars/contact-001.svg",
      id: "contact-1",
      name: "Maya Chen",
      nextAction: "查看来源证据后再跟进 Maya Chen。",
      organization: "Northstar",
      relationship:
        "Northstar 的投资人。本次关注「日本落地可信赖的税务与设立顾问」，可提供「关西合作渠道介绍」。",
      role: "合伙人",
      status: "待联系",
      valueLabels: ["战略契合", "社群资源", "引荐路径"],
      valueScore: 91
    }
  ]);
});

test("contactsToSummaries localizes English relationship copy for mobile", () => {
  const summaries = contactsToSummaries({
    contacts: [
      {
        displayName: "Kenji Watanabe",
        id: "contact:kenji-watanabe",
        nextAction: "Send Kenji the storage pilot operator intro by Friday.",
        organization: "Aster Grid",
        profileSnippet:
          "Founder at Aster Grid working on storage pilot partnerships.",
        relationshipContext:
          "Met at the climate founders dinner and discussed storage pilot operators.",
        role: "Founder",
        status: "needs_follow_up",
        value: {
          score: 91,
          valueTypes: [
            "commercial_opportunity",
            "knowledge_exchange",
            "community_context"
          ]
        }
      }
    ]
  });

  assert.deepEqual(summaries[0], {
    id: "contact:kenji-watanabe",
    name: "Kenji Watanabe",
    nextAction: "给 Kenji Watanabe 补一条引荐跟进。",
    organization: "Aster Grid",
    relationship: "Aster Grid 的创始人，正在推进储能试点合作。",
    role: "创始人",
    status: "待联系",
    valueLabels: ["商业机会", "知识交流", "社群资源"],
    valueScore: 91
  });
  assert.doesNotMatch(
    JSON.stringify(summaries),
    /Founder at|storage pilot|Commercial opportunity|Send Kenji/iu
  );
});

test("contactsToSummaries prefers web avatar assets when present", () => {
  const summaries = contactsToSummaries({
    contacts: [
      {
        avatar: { src: "/orbit-demo-assets/avatars/contact-039.svg" },
        avatarAssetUrl: "/orbit-demo-assets/avatars/contact-001.svg",
        displayName: "西村 大地",
        id: "contact_039",
        organization: "Kansai Bridge",
        profileSnippet: "关西渠道顾问。",
        role: "Advisor",
        status: "active"
      },
      {
        displayName: "青木 瑞希",
        id: "contact_037",
        organization: "Osaka Retail Lab",
        photoUrl: "https://cdn.example.com/aoki.png",
        profileSnippet: "零售自动化负责人。",
        role: "Operator",
        status: "needs_follow_up"
      }
    ]
  });

  assert.equal(
    summaries[0]?.imageUrl,
    "/orbit-demo-assets/avatars/contact-001.svg"
  );
  assert.equal(summaries[1]?.imageUrl, "https://cdn.example.com/aoki.png");
});

test("contactAvatarFor creates stable initials for contact cards", () => {
  assert.deepEqual(
    contactAvatarFor({ id: "contact_001", name: "Maya Chen" }),
    {
      initial: "M",
      tone: "violet"
    }
  );
  assert.equal(
    contactAvatarFor({ id: "contact_029", name: "岡田 隼人" }).initial,
    "岡"
  );
});

test("contactsToSummaries localizes common live contact roles", () => {
  const summaries = contactsToSummaries({
    contacts: [
      {
        displayName: "後藤 信也",
        id: "contact-product",
        organization: "Morning Light Technologies",
        profileSnippet: "晨光科技的产品经理。",
        role: "Product Manager",
        status: "active"
      },
      {
        displayName: "佐藤 健一",
        id: "contact-store",
        organization: "North Star Foods",
        profileSnippet: "北星餐饮的门店经营者。",
        role: "Store Owner",
        status: "active"
      },
      {
        displayName: "江東 新",
        id: "contact-president",
        organization: "株式会社アイ・エム・エス",
        profileSnippet: "关系背景待补充。",
        role: "代表取締役社長",
        status: "active"
      },
      {
        displayName: "李 文",
        id: "contact-founder-ceo",
        organization: "Aoba Technologies",
        profileSnippet: "青叶科技的创始人。",
        role: "Founder CEO",
        status: "active"
      }
    ]
  });

  assert.deepEqual(
    summaries.map((contact) => [contact.organization, contact.role]),
    [
      ["Morning Light Technologies", "产品经理"],
      ["North Star Foods", "门店经营者"],
      ["IMS 股份公司", "代表董事兼社长"],
      ["Aoba Technologies", "创始人兼 CEO"]
    ]
  );
  assert.doesNotMatch(
    JSON.stringify(summaries),
    /Product Manager|Store Owner|株式会社|代表取締役社長|Founder CEO/u
  );
});

test("buildContactsSearchRequest prepares the web contact deep search request", () => {
  assert.deepEqual(
    buildContactsSearchRequest({
      query: " storage ",
      status: "needs_follow_up"
    }),
    {
      request: {
        body: {
          query: "storage",
          statusFilters: ["needs_follow_up"]
        },
        endpoint: "/api/contacts/search"
      },
      success: true
    }
  );

  assert.deepEqual(buildContactsSearchRequest({ query: "   " }), {
    error: "先输入要找的人、公司或资源。",
    success: false
  });

  assert.deepEqual(
    buildContactsSearchRequest({
      query: "  ",
      sourceFilters: ["manual"],
      status: "needs_follow_up",
      tagFilters: ["topic:storage-pilots"],
      valueFilters: ["commercial_opportunity"]
    }),
    {
      request: {
        body: {
          sourceFilters: ["manual"],
          statusFilters: ["needs_follow_up"],
          tagFilters: ["topic:storage-pilots"],
          valueFilters: ["commercial_opportunity"]
        },
        endpoint: "/api/contacts/search"
      },
      success: true
    }
  );
});

test("contactSearchFilterSections maps web source tag and value filters into Chinese chips", () => {
  const sections = contactSearchFilterSections(
    {
      availableFilters: {
        sources: [
          { count: 2, label: "Manual note", selected: false, value: "manual" },
          {
            count: 1,
            label: "Email signal",
            selected: false,
            value: "email_signal"
          },
          {
            count: 0,
            label: "Business card OCR",
            selected: false,
            value: "business_card_ocr"
          }
        ],
        tags: [
          {
            count: 2,
            label: "Storage pilots",
            selected: false,
            value: "topic:storage-pilots"
          },
          {
            count: 1,
            label: "Venture ecosystem",
            selected: false,
            value: "topic:venture-ecosystem"
          }
        ],
        values: [
          {
            count: 2,
            label: "Commercial opportunity",
            selected: false,
            value: "commercial_opportunity"
          },
          {
            count: 2,
            label: "Referral path",
            selected: false,
            value: "referral_path"
          }
        ]
      }
    },
    {
      sourceFilters: ["manual"],
      tagFilters: ["topic:storage-pilots"],
      valueFilters: ["commercial_opportunity"]
    }
  );

  assert.deepEqual(sections, [
    {
      key: "source",
      options: [
        { count: 2, label: "手动记录", selected: true, value: "manual" },
        { count: 1, label: "邮件线索", selected: false, value: "email_signal" }
      ],
      title: "来源"
    },
    {
      key: "tag",
      options: [
        {
          count: 2,
          label: "储能试点",
          selected: true,
          value: "topic:storage-pilots"
        },
        {
          count: 1,
          label: "创投生态",
          selected: false,
          value: "topic:venture-ecosystem"
        }
      ],
      title: "标签"
    },
    {
      key: "value",
      options: [
        {
          count: 2,
          label: "商业机会",
          selected: true,
          value: "commercial_opportunity"
        },
        {
          count: 2,
          label: "引荐路径",
          selected: false,
          value: "referral_path"
        }
      ],
      title: "价值"
    }
  ]);

  assert.deepEqual(toggleContactSearchFilter(["manual"], "manual"), []);
  assert.deepEqual(toggleContactSearchFilter(["manual"], "email_signal"), [
    "manual",
    "email_signal"
  ]);
});

test("contactsSearchToView maps web deep search payload into Chinese search cards", () => {
  const view = contactsSearchToView({
    appliedFilters: {
      query: "storage",
      sourceFilters: ["manual"],
      statusFilters: ["needs_follow_up"],
      tagFilters: ["topic:storage-pilots"],
      valueFilters: ["commercial_opportunity"]
    },
    contacts: [
      {
        avatarAssetUrl: "/orbit-demo-assets/avatars/contact-001.svg",
        displayName: "Kenji Watanabe",
        evidence: [
          {
            excerpt:
              "Manual note says Kenji asked for a storage pilot operator intro after the climate founders dinner."
          }
        ],
        id: "contact-storage-1",
        nextAction: "Send the storage intro.",
        organization: "Aster Grid",
        profileSnippet:
          "Founder at Aster Grid focused on storage pilot partnerships.",
        relationshipContext:
          "Manual note says Kenji asked for a storage pilot operator intro after the climate founders dinner.",
        role: "Founder",
        source: {
          evidenceId: "evidence-storage-1",
          label: "Manual note",
          type: "manual"
        },
        status: "needs_follow_up",
        value: {
          evidenceIds: ["evidence-storage-1"],
          rationale: "Storage pilot opportunity.",
          score: 91,
          valueTypes: ["commercial_opportunity"]
        }
      }
    ],
    nextAction:
      "Review the matched contacts with source evidence before creating tasks.",
    query: "storage",
    state: "success",
    summary: "1 mock contacts matched local search and filter rules."
  });

  assert.deepEqual(view, {
    emptyText: "",
    filtersLabel:
      "关键词：storage · 来源：手动记录 · 状态：待联系 · 标签：储能试点 · 价值：商业机会",
    nextAction: "先看匹配到的人和来源证据，再决定要不要跟进。",
    results: [
      {
        detail: "Aster Grid · 创始人 · 待联系",
        id: "contact-storage-1",
        imageUrl: "/orbit-demo-assets/avatars/contact-001.svg",
        name: "Kenji Watanabe",
        nextAction: "给 Kenji Watanabe 补一条引荐跟进。",
        relationship: "Aster Grid 的创始人，正在推进储能试点合作。",
        valueLabels: ["商业机会"],
        valueScore: 91
      }
    ],
    summary: "1 位匹配",
    title: "深度搜索"
  });
});

test("contactsSearchToView gives a direct Chinese empty state", () => {
  assert.deepEqual(
    contactsSearchToView({
      appliedFilters: {
        query: "notfound",
        sourceFilters: [],
        statusFilters: [],
        tagFilters: [],
        valueFilters: []
      },
      contacts: [],
      nextAction:
        "Clear the local search and filters, or add a mock contact fixture before reviewing the list.",
      query: "notfound",
      state: "empty",
      summary: "No mock contacts matched the local search and filter rules."
    }),
    {
      emptyText: "换个关键词，或先清空筛选。",
      filtersLabel: "关键词：notfound",
      nextAction: "这次没有找到合适的人。",
      results: [],
      summary: "暂无匹配",
      title: "深度搜索"
    }
  );
});

test("contactStatusFilterOptions maps backend status filters to Chinese chips", () => {
  const options = contactStatusFilterOptions(
    {
      availableFilters: {
        statuses: [
          { count: 4, label: "Active", selected: false, value: "active" },
          {
            count: 2,
            label: "Needs follow up",
            selected: true,
            value: "needs_follow_up"
          }
        ]
      },
      contacts: [{ id: "contact-1" }, { id: "contact-2" }]
    },
    "needs_follow_up"
  );

  assert.deepEqual(options, [
    { count: 6, label: "全部", selected: false, value: null },
    { count: 2, label: "待联系", selected: true, value: "needs_follow_up" },
    { count: 4, label: "在推进", selected: false, value: "active" },
    { count: 0, label: "培养中", selected: false, value: "nurture" },
    { count: 0, label: "已归档", selected: false, value: "archived" }
  ]);
  assert.doesNotMatch(JSON.stringify(options), /Active|Needs follow up/u);
});

test("tasksToScheduleItems maps follow-up task payloads", () => {
  const items = tasksToScheduleItems({
    tasks: [
      {
        contactName: "Maya Chen",
        organization: "Kumo Grid",
        priority: "today",
        recommendedAction: "Review follow-up for contact_024",
        taskId: "task-1",
        title: "Review follow-up for contact_024",
        dueAt: "2026-07-24T10:00:00+09:00",
        dueInDays: 0
      }
    ]
  });

  assert.deepEqual(items, [
    {
      contactName: "Maya Chen",
      dayLabel: "7月24日 周五",
      dueAt: "7月24日 周五 10:00",
      id: "task-1",
      monthLabel: "2026年7月",
      organization: "Kumo Grid",
      priority: "待确认",
      recommendedAction: "跟进 Maya Chen 的关系进展。",
      timeLabel: "10:00",
      title: "跟进 Maya Chen"
    }
  ]);
});

test("conversationsToSummaries maps Orbit AI payloads", () => {
  const summaries = conversationsToSummaries({
    conversations: [
      {
        conversationId: "conversation-1",
        lastMessagePreview: "Prepare me for tomorrow",
        title: "Tomorrow prep"
      }
    ]
  });

  assert.deepEqual(summaries, [
    {
      id: "conversation-1",
      preview: "Prepare me for tomorrow",
      title: "Tomorrow prep"
    }
  ]);
});

test("profileToSummary maps profile payloads and empty profiles", () => {
  assert.deepEqual(
    profileToSummary({
      profile: {
        bio:
          "Orbit 的创始人，帮助企业把 AI 放进销售、客服、运营和内部知识库这些真实流程里。",
        displayName: "林晓",
        headline: "Relationship operator",
        homeMarket: "Tokyo",
        industry: "AI 企业应用",
        offering: ["AI 落地方案拆解", "业务流程自动化建议"],
        organization: "Orbit",
        relationshipGoal: "Use Orbit to find the next useful relationship.",
        role: "创始人",
        seeking: ["有真实 AI 导入需求的企业"],
        topics: ["销售和客服自动化", "日本市场落地"]
      }
    }),
    {
      bio:
        "Orbit 的创始人，帮助企业把 AI 放进销售、客服、运营和内部知识库这些真实流程里。",
      displayName: "林晓",
      headline: "Relationship operator",
      industry: "AI 企业应用",
      offering: ["AI 落地方案拆解", "业务流程自动化建议"],
      organization: "Orbit",
      relationshipGoal: "Use Orbit to find the next useful relationship.",
      role: "创始人",
      seeking: ["有真实 AI 导入需求的企业"],
      timezone: "Tokyo"
      ,
      topics: ["销售和客服自动化", "日本市场落地"]
    }
  );

  const fallbackProfile = profileToSummary({ profile: null });
  assert.equal(fallbackProfile.displayName, "小雨");
  assert.equal(fallbackProfile.organization, "Orbit");
  assert.equal(fallbackProfile.role, "创始人");
  assert.match(fallbackProfile.bio, /AI 接进真实业务/u);

  const demoProfile = profileToSummary({
    profile: {
      displayName: "小雨",
      id: "profile_orbit_generated_operator",
      organization: "OPPO Japan Research"
    }
  });
  assert.equal(demoProfile.displayName, "小雨");
  assert.equal(demoProfile.organization, "Orbit");
});

test("profileToSummary normalizes the old Orbit main user payload to Xiaoyu", () => {
  const profile = profileToSummary({
    profile: {
      bio: "短介绍",
      displayName: "赵翔",
      headline: "Relationship operator",
      homeMarket: "Tokyo",
      industry: "AI 企业应用",
      offering: ["AI 落地方案拆解"],
      organization: "Orbit",
      relationshipGoal: "Use Orbit to find the next useful relationship.",
      role: "创始人",
      seeking: ["有真实 AI 导入需求的企业"],
      topics: ["企业 AI 降本增效"]
    }
  });

  assert.equal(profile.displayName, "小雨");
  assert.equal(profile.organization, "Orbit");
  assert.equal(profile.role, "创始人");
  assert.match(profile.bio, /销售线索整理/u);
  assert.deepEqual(profile.topics, [
    "企业 AI 导入",
    "知识库与内部检索",
    "Agent 工作流",
    "销售和客服自动化",
    "中日商务合作"
  ]);
});
