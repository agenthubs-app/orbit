import assert from "node:assert/strict";
import test from "node:test";
import type { ApiResult } from "../src/api/types";
import {
  contactStatusFilterOptions,
  contactAvatarFor,
  contactsToSummaries
} from "../src/view-models/contacts";
import { conversationsToSummaries } from "../src/view-models/conversations";
import { eventsToSummaries } from "../src/view-models/events";
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
      coverPath: "/orbit-covers/events/tokyo-ai-partner-meetup.jpg",
      id: "event-1",
      location: "Shibuya",
      startsAt: "8月4日 周二 14:00",
      status: "已确认",
      title: "东京 AI 落地伙伴对接会"
    }
  ]);
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
      }
    ]
  });

  assert.deepEqual(
    summaries.map((contact) => contact.role),
    ["产品经理", "门店经营者"]
  );
  assert.doesNotMatch(JSON.stringify(summaries), /Product Manager|Store Owner/u);
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
