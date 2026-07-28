import assert from "node:assert/strict";
import test from "node:test";

import {
  accountAuthToView,
  nextHrefForAccountAuthSubmit,
  type AccountAuthMode
} from "../src/view-models/account-auth";

function flattenedText(value: unknown): string {
  return JSON.stringify(value);
}

test("accountAuthToView maps each auth mode to Chinese mobile copy", () => {
  const cases: Record<
    AccountAuthMode,
    {
      primaryLabel: string;
      switchHref: string;
      switchLabel: string;
      title: string;
    }
  > = {
    forgot: {
      primaryLabel: "密码重置暂不可用",
      switchHref: "/account/login",
      switchLabel: "返回登录",
      title: "重置密码"
    },
    login: {
      primaryLabel: "登录",
      switchHref: "/account/signup",
      switchLabel: "还没有账号，创建账号",
      title: "欢迎回来"
    },
    signup: {
      primaryLabel: "创建账号",
      switchHref: "/account/login",
      switchLabel: "已有账号，去登录",
      title: "创建你的 Orbit 账号"
    }
  };

  for (const [mode, expected] of Object.entries(cases) as [
    AccountAuthMode,
    (typeof cases)[AccountAuthMode]
  ][]) {
    const view = accountAuthToView(mode);

    assert.equal(view.title, expected.title);
    assert.equal(view.primaryLabel, expected.primaryLabel);
    assert.equal(view.switchLabel, expected.switchLabel);
    assert.equal(view.switchHref, expected.switchHref);
    assert.equal(view.defaultNext, "/dashboard");
    assert.equal(view.boundary, "使用网页端同一组邮箱和密码。");
    assert.doesNotMatch(
      flattenedText(view),
      /\b(mock|fixture|provider|source-backed|implementation|command-center)\b/iu
    );
  }
});

test("accountAuthToView returns the fields required by each mode", () => {
  assert.deepEqual(
    accountAuthToView("login").fields.map((field) => field.name),
    ["email", "password"]
  );
  assert.deepEqual(
    accountAuthToView("signup").fields.map((field) => field.name),
    ["email", "password"]
  );
  assert.deepEqual(
    accountAuthToView("forgot").fields.map((field) => field.name),
    []
  );
});

test("accountAuthToView exposes account recovery helper links", () => {
  assert.deepEqual(accountAuthToView("login").helperLinks, [
    {
      href: "/account/forgot-password",
      label: "忘记密码"
    }
  ]);
  assert.deepEqual(accountAuthToView("forgot").helperLinks, []);
  assert.equal(
    accountAuthToView("forgot").restrictionMessage,
    "系统没有发送邮件或验证码。请返回登录，或联系为你提供账号的活动主办方。"
  );
  assert.deepEqual(accountAuthToView("signup").helperLinks, []);
});

test("accountAuthToView exposes Google when the mobile auth provider is enabled", () => {
  assert.deepEqual(accountAuthToView("login", { googleEnabled: true }).oauthActions, [
    {
      id: "google",
      label: "使用 Google 登录",
    }
  ]);
  assert.deepEqual(accountAuthToView("signup", { googleEnabled: true }).oauthActions, [
    {
      id: "google",
      label: "使用 Google 登录",
    }
  ]);
  assert.deepEqual(accountAuthToView("forgot", { googleEnabled: true }).oauthActions, []);
  assert.deepEqual(accountAuthToView("login").oauthActions, []);
});

test("nextHrefForAccountAuthSubmit keeps fallback navigation deterministic", () => {
  assert.equal(
    nextHrefForAccountAuthSubmit({
      email: "xinyi@example.com",
      mode: "login",
      next: "/profile"
    }),
    "/profile"
  );
  assert.equal(
    nextHrefForAccountAuthSubmit({
      email: "xinyi@example.com",
      mode: "signup",
      next: "/events"
    }),
    "/account/login?created=1&email=xinyi%40example.com&next=%2Fevents"
  );
  assert.equal(
    nextHrefForAccountAuthSubmit({
      email: "xinyi@example.com",
      mode: "forgot",
      next: "/dashboard"
    }),
    "/account/login?next=%2Fdashboard"
  );
});
