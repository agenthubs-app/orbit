import assert from "node:assert/strict";
import test from "node:test";

import { registerInviteToView } from "../src/view-models/register-invite";

test("registerInviteToView combines event and profile into a Chinese mobile invite preview", () => {
  const view = registerInviteToView({
    eventPayload: {
      event: {
        description:
          "JA: 投資家向け。 ZH: 投资人与创业者提前登记融资阶段和想认识的人。 EN: Investor founder intake.",
        evidence: [
          {
            excerpt:
              "JA: 投資家向け。 ZH: 报名信息会用于会前整理介绍重点。 EN: Signup context."
          }
        ],
        id: "event_signup_03",
        nextAction: "Review the source-backed event in Orbit.",
        recommendedPreparation:
          "Review the source-backed event before taking action.",
        relationshipContext:
          "event_signup_03 profile_orbit_generated_operator JA: 投資家向け。 ZH: 根据报名信息提前整理融资阶段、介绍诉求和会谈主题。 EN: Prepare from signup data.",
        sourceMetadata: {
          captureMethod: "signup_invite",
          label:
            "日中投資家・創業者申込サロン / 日中投资人与创业者报名沙龙 / Japan-China Investor Founder Signup Salon"
        },
        startsAt: "2026-07-04T10:00:00.000Z",
        status: "confirmed",
        title: "Tokyo founder salon",
        venue: "Shibuya"
      }
    },
    inviteCode: "event_signup_03",
    profilePayload: {
      profile: {
        bio: "Orbit 的创始人，主要做 AI 在企业里的真实落地。",
        displayName: "赵翔",
        headline: "Orbit 创始人，用 AI 帮企业提效、降本、落地增长",
        industry: "AI 企业应用 · 日本市场 · B2B",
        offering: ["企业知识库 / RAG / 内部助手方案", "中日市场资源"],
        organization: "Orbit",
        relationshipGoal: "找到能长期互相帮忙的人。",
        role: "创始人",
        seeking: ["正在导入 AI 的企业", "日本市场合作伙伴"],
        timezone: "Tokyo",
        topics: ["企业 AI 降本增效", "Agent 工作流"]
      }
    }
  });

  assert.deepEqual(view, {
    actions: [
      {
        href: "/events/event_signup_03/register",
        label: "继续填写活动问题"
      },
      { href: "/profile", label: "检查个人资料" }
    ],
    event: {
      code: "EVENTSIGNUP03",
      description: "投资人与创业者提前登记融资阶段和想认识的人。",
      id: "event_signup_03",
      sourceLabel: "日中投资人与创业者报名沙龙",
      startsAt: "7月4日 周六 19:00",
      status: "已确认",
      theme: "报名邀请",
      title: "日中投资人与创业者报名沙龙",
      venue: "Shibuya"
    },
    guardrail: "这里先检查资料；提交报名在活动问题页完成。",
    profile: {
      company: "Orbit",
      headline: "Orbit 创始人，用 AI 帮企业提效、降本、落地增长",
      name: "赵翔",
      offering: [
        "企业知识库 / RAG / 内部助手方案",
        "中日市场资源"
      ],
      role: "创始人",
      seeking: [
        "正在导入 AI 的企业",
        "日本市场合作伙伴"
      ],
      topics: [
        "企业 AI 降本增效",
        "Agent 工作流"
      ]
    },
    readiness: {
      completedCount: 3,
      items: [
        {
          detail: "账号已确认，可以继续填写活动问题。",
          id: "account",
          status: "complete",
          title: "账号"
        },
        {
          detail: "能提供、想寻找和话题都已补齐。",
          id: "profile",
          status: "complete",
          title: "公开资料"
        },
        {
          detail: "下一步进入这场活动的问题页。",
          id: "registration",
          status: "next",
          title: "活动问题"
        }
      ],
      summary: "3 / 3 项可继续",
      title: "报名准备"
    },
    summary: "先确认别人会看到的资料，再回答这场活动的问题。",
    title: "报名资料准备"
  });
});

test("registerInviteToView has a controlled empty state when event context is missing", () => {
  const view = registerInviteToView({
    eventPayload: null,
    profilePayload: null
  });

  assert.equal(view.title, "报名资料准备");
  assert.equal(view.event.title, "活动待确认");
  assert.equal(view.event.code, "EVENT");
  assert.equal(view.guardrail, "这里先检查资料；提交报名在活动问题页完成。");
  assert.deepEqual(view.readiness, {
    completedCount: 1,
    items: [
      {
        detail: "账号已确认，可以继续填写活动问题。",
        id: "account",
        status: "complete",
        title: "账号"
      },
      {
        detail: "先补能提供、想寻找和话题。",
        id: "profile",
        status: "needs_attention",
        title: "公开资料"
      },
      {
        detail: "先打开一场可报名活动。",
        id: "registration",
        status: "blocked",
        title: "活动问题"
      }
    ],
    summary: "1 / 3 项可继续",
    title: "报名准备"
  });
  assert.equal(view.profile.name, "");
  assert.deepEqual(view.actions, [
    { href: "/events", label: "查看活动列表" },
    { href: "/profile", label: "检查个人资料" }
  ]);
});

test("registerInviteToView sends signed-out users through auth before event registration", () => {
  const view = registerInviteToView({
    authenticated: false,
    eventPayload: {
      event: {
        id: "event_signup_03",
        sourceMetadata: {
          captureMethod: "signup_invite",
          label:
            "日中投資家・創業者申込サロン / 日中投资人与创业者报名沙龙 / Japan-China Investor Founder Signup Salon"
        },
        startsAt: "2026-07-04T10:00:00.000Z",
        status: "confirmed",
        venue: "Shibuya"
      }
    },
    inviteCode: "event_signup_03",
    profilePayload: null
  });

  assert.equal(view.guardrail, "先登录或创建账号，再继续这场活动。");
  assert.deepEqual(view.readiness.items[0], {
    detail: "先登录或创建账号。",
    id: "account",
    status: "needs_attention",
    title: "账号"
  });
  assert.equal(view.readiness.summary, "1 / 3 项可继续");
  assert.deepEqual(view.actions, [
    {
      href: "/account/login?next=%2Fevents%2Fevent_signup_03%2Fregister",
      label: "登录继续报名"
    },
    {
      href: "/account/signup?next=%2Fevents%2Fevent_signup_03%2Fregister",
      label: "创建账号"
    },
    { href: "/profile", label: "检查个人资料" }
  ]);
});
