import assert from "node:assert/strict";
import test from "node:test";

import {
  AUTH_BUTTON_LABELS,
  AUTH_ERROR_COPY,
  authRoutePath,
  authTitleId,
  bridgeLegacyAuthError,
  validateEmail,
  validatePassword,
  validateResetPair,
} from "../../app/(app)/app/account/auth-0918/auth-model";

// 认证弹窗 任务 2：auth-model 纯函数（设计 renderVals 496 validEmail / 526–529 校验文案 / 517–520 按钮文案）。

const zh = (copy: { zh: string } | null) => copy?.zh ?? null;

test("validateEmail mirrors the design regex: one @, no whitespace, a dot in the domain", () => {
  assert.equal(validateEmail("you@company.com"), null);
  assert.equal(validateEmail("a.b+c@sub.domain.co"), null);
  for (const bad of ["", "   ", "you", "you@", "@company.com", "you@company", "you company@x.com", "a@b@c.com"]) {
    assert.equal(zh(validateEmail(bad)), "请输入有效的邮箱地址。", `expected rejection for ${JSON.stringify(bad)}`);
  }
});

test("validatePassword requires 8 characters; the reset variant carries the 新密码 copy", () => {
  assert.equal(validatePassword("1234567")?.zh, "密码至少 8 位。");
  assert.equal(validatePassword("")?.zh, "密码至少 8 位。");
  assert.equal(validatePassword("12345678"), null);
  assert.equal(validateResetPair("1234567", "1234567")?.zh, "新密码至少 8 位。");
});

test("validateResetPair: length first, then equality", () => {
  assert.equal(validateResetPair("abcdefgh", "abcdefgh"), null);
  assert.equal(validateResetPair("abcdefgh", "abcdefgX")?.zh, "两次输入的密码不一致。");
  assert.equal(validateResetPair("short", "different")?.zh, "新密码至少 8 位。");
});

test("button label table matches renderVals 517–520 verbatim", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(AUTH_BUTTON_LABELS).map(([view, labels]) => [view, { idle: labels.idle.zh, loading: labels.loading.zh, success: labels.success?.zh ?? null }])),
    {
      forgot: { idle: "申请重置链接", loading: "发送中…", success: null },
      login: { idle: "登录", loading: "登录中…", success: "✓ 已登录" },
      register: { idle: "创建账号", loading: "创建中…", success: "✓ 账号已创建" },
      reset: { idle: "设置新密码", loading: "保存中…", success: null },
    },
  );
});

test("authRoutePath maps the four views onto the existing /app/account routes and encodes next", () => {
  const next = "/app/contacts/new?eventId=e_1&source=auth";
  assert.equal(authRoutePath("login", next), `/app/account/login?next=${encodeURIComponent(next)}`);
  assert.equal(authRoutePath("register", next), `/app/account/signup?next=${encodeURIComponent(next)}`);
  assert.equal(authRoutePath("forgot", next), `/app/account/forgot-password?next=${encodeURIComponent(next)}`);
  assert.equal(authRoutePath("reset", next), `/app/account/reset-password?next=${encodeURIComponent(next)}`);
  assert.equal(authRoutePath("login", ""), "/app/account/login");
});

test("authTitleId is one id per view (aria-labelledby target)", () => {
  const ids = (["login", "register", "forgot", "reset"] as const).map(authTitleId);
  assert.equal(new Set(ids).size, 4);
  for (const id of ids) assert.match(id, /^au-title-/);
});

test("bridgeLegacyAuthError maps the hook's login-failure and 409 copy onto the design copy; other messages pass through", () => {
  const t = (copy: { zh: string; en: string }) => copy.zh;
  assert.equal(bridgeLegacyAuthError("邮箱或密码不正确。", t), AUTH_ERROR_COPY.loginFailed.zh);
  assert.equal(bridgeLegacyAuthError("该邮箱已注册,请直接登录。", t), AUTH_ERROR_COPY.emailTaken.zh);
  assert.equal(AUTH_ERROR_COPY.loginFailed.zh, "邮箱或密码不正确，请重试。");
  assert.equal(AUTH_ERROR_COPY.emailTaken.zh, "该邮箱已注册，请直接登录。");
  assert.equal(bridgeLegacyAuthError("Password too weak", t), "Password too weak");
  assert.equal(bridgeLegacyAuthError("", t), "");
  const en = (copy: { zh: string; en: string }) => copy.en;
  assert.equal(bridgeLegacyAuthError("Email or password is incorrect.", en), AUTH_ERROR_COPY.loginFailed.en);
});
