import assert from "node:assert/strict";
import test from "node:test";

import { accountSessionToView } from "../src/view-models/account-session";

function flattenedText(value: unknown): string {
  return JSON.stringify(value);
}

test("accountSessionToView maps demo account payload to the Chinese Orbit identity", () => {
  const view = accountSessionToView({
    account: {
      displayName: "Ari Lane",
      plan: "mock-pro",
      role: "founder-operator",
      workspaceName: "Orbit Founder Relationship OS"
    },
    nextAction:
      "Review relationship context before Orbit suggests a follow-up action.",
    profile: {
      headline: "Founder mapping event-grounded relationships",
      homeMarket: "Tokyo",
      preferredFollowUpWindow: "48 hours",
      relationshipGoal:
        "Prioritize source-backed demo workspace follow-up with clear context."
    },
    session: {
      status: "signed-in"
    },
    state: "success",
    user: {
      displayName: "Ari Lane",
      loginLabel: "demo founder",
      timezone: "Asia/Tokyo"
    }
  });

  assert.equal(view.title, "账号与工作区");
  assert.equal(view.displayName, "小雨");
  assert.equal(view.workspaceName, "Orbit");
  assert.equal(view.statusLabel, "已登录");
  assert.equal(view.roleLabel, "创始人");
  assert.equal(view.planLabel, "人脉交换工作区");
  assert.equal(view.timezoneLabel, "东京时间");
  assert.equal(
    view.summary,
    "这里决定别人看到你是谁，以及这个工作区要优先连接什么资源。"
  );
  assert.equal(
    view.goal,
    "用 Orbit 找到能互相帮忙的人：AI 落地客户、合作伙伴、日本本地资源和靠谱引荐。"
  );
  assert.equal(view.nextAction, "回到个人资料，把能提供的资源写得更具体。");

  assert.doesNotMatch(
    flattenedText(view),
    /\b(mock|fixture|provider|generated|source-backed|source:|evidence:|demo workspace|demo founder|command-center|implementation)\b/iu
  );
});

test("accountSessionToView gives a clear signed-out state", () => {
  const view = accountSessionToView({
    account: null,
    nextAction: "Use demo sign-in to restore the deterministic account fixture.",
    profile: null,
    session: {
      status: "signed-out"
    },
    state: "empty",
    user: null
  });

  assert.equal(view.statusLabel, "未登录");
  assert.equal(view.displayName, "小雨");
  assert.equal(view.emptyTitle, "账号状态不可用");
  assert.equal(view.nextAction, "先登录，再回到个人资料继续完善信息。");
  assert.deepEqual(view.authActions, [
    {
      href: "/account/login",
      label: "登录"
    },
    {
      href: "/account/signup",
      label: "创建账号"
    }
  ]);
});

test("accountSessionToView maps the known generated operator account to Orbit founder copy", () => {
  const view = accountSessionToView({
    account: {
      displayName: "Orbit Generated Relationship Workspace",
      plan: "live-relationship-os",
      role: "AI & Computer Vision Engineer",
      workspaceName: "Orbit Generated Relationship Workspace"
    },
    profile: {
      headline: "Shipped camera AI on 10M+ devices; now building trustworthy GenAI",
      relationshipGoal:
        "Use remote live storage to develop source-backed relationship workflows."
    },
    session: {
      status: "signed-in"
    },
    state: "success",
    user: {
      displayName: "小雨",
      id: "profile_orbit_generated_operator",
      timezone: "Asia/Tokyo"
    }
  });

  assert.equal(view.displayName, "小雨");
  assert.equal(view.workspaceName, "Orbit");
  assert.equal(view.roleLabel, "创始人");
  assert.equal(view.goal, "用 Orbit 找到能互相帮忙的人：AI 落地客户、合作伙伴、日本本地资源和靠谱引荐。");
});

test("accountSessionToView normalizes the old main user account to Xiaoyu", () => {
  const view = accountSessionToView({
    account: {
      displayName: "赵翔",
      plan: "live-relationship-os",
      role: "founder-operator",
      workspaceName: "Orbit Founder Relationship OS"
    },
    profile: {
      homeMarket: "Tokyo",
      relationshipGoal: "Use Orbit to find the next useful relationship."
    },
    session: {
      status: "signed-in"
    },
    state: "success",
    user: {
      displayName: "赵翔",
      timezone: "Asia/Tokyo"
    }
  });

  assert.equal(view.displayName, "小雨");
  assert.equal(view.workspaceName, "Orbit");
  assert.equal(view.roleLabel, "创始人");
  assert.equal(view.goal, "用 Orbit 找到能互相帮忙的人：AI 落地客户、合作伙伴、日本本地资源和靠谱引荐。");
});

test("accountSessionToView prefers the validated mobile session identity", () => {
  const view = accountSessionToView(
    {
      account: {
        plan: "live-relationship-os",
        role: "operator",
        workspaceName: "Orbit"
      },
      profile: {
        homeMarket: "Tokyo"
      },
      session: {
        status: "signed-out"
      }
    },
    {
      authenticated: true,
      authUser: {
        email: "person@example.com",
        id: "user_1",
        name: "田中美咲"
      }
    }
  );

  assert.equal(view.displayName, "田中美咲");
  assert.equal(view.statusLabel, "已登录");
  assert.deepEqual(view.authActions, []);
});
