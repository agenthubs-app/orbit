import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { accountSessionToView } from "../src/view-models/account-session";

const accountScreenSource = readFileSync(
  new URL("../src/screens/profile/AccountScreen.tsx", import.meta.url),
  "utf8"
);

function flattenedText(value: unknown): string {
  return JSON.stringify(value);
}

test("accountSessionToView preserves the signed-in account identity", () => {
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
  assert.equal(view.displayName, "Ari Lane");
  assert.equal(view.workspaceName, "Orbit Founder Relationship OS");
  assert.equal(view.statusLabel, "已登录");
  assert.equal(view.roleLabel, "创始人");
  assert.equal(view.planLabel, "人脉交换工作区");
  assert.equal(view.timezoneLabel, "东京时间");
  assert.equal(
    view.summary,
    "查看当前登录身份、工作区和关系目标。"
  );
  assert.equal(
    view.goal,
    "Prioritize source-backed demo workspace follow-up with clear context."
  );
  assert.equal(
    view.nextAction,
    "回到个人资料，补全希望别人看到的信息。"
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
  assert.equal(view.displayName, "账号");
  assert.equal(view.emptyTitle, "尚未登录");
  assert.equal(view.nextAction, "登录后可以继续完善个人资料。");
  assert.equal(view.goal, "");
  assert.equal(view.workspaceName, "");
  assert.doesNotMatch(flattenedText(view), /小雨|创始人|Orbit Founder/u);
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

test("accountSessionToView does not rewrite a stored generated operator identity", () => {
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
  assert.equal(view.workspaceName, "Orbit Generated Relationship Workspace");
  assert.equal(view.roleLabel, "AI & Computer Vision Engineer");
  assert.equal(
    view.goal,
    "Use remote live storage to develop source-backed relationship workflows."
  );
});

test("accountSessionToView preserves the old main user account identity", () => {
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

  assert.equal(view.displayName, "赵翔");
  assert.equal(view.workspaceName, "Orbit Founder Relationship OS");
  assert.equal(view.roleLabel, "创始人");
  assert.equal(view.goal, "Use Orbit to find the next useful relationship.");
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

test("account screen renders the signed-out boundary before API failure states", () => {
  assert.match(accountScreenSource, /auth\.ready && !auth\.signedIn/u);
  assert.match(
    accountScreenSource,
    /accountSessionToView\(null,\s*\{\s*authenticated: false/u
  );
  assert.match(
    accountScreenSource,
    /auth\.signedIn && state\.kind === "failure"/u
  );
});
