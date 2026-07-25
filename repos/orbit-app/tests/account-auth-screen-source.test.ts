import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "profile", "AccountAuthScreen.tsx"),
  "utf8"
);
const mobileGoogleRoutePath = join(
  repoRoot,
  "app",
  "account",
  "mobile-google.tsx"
);

test("account auth screen renders helper links such as forgot password", () => {
  assert.match(screenSource, /view\.helperLinks/u);
  assert.match(screenSource, /helperLink/u);
});

test("account auth screen can start the mobile Google login bridge", () => {
  assert.match(screenSource, /googleEnabled/u);
  assert.match(screenSource, /startGoogleSignIn/u);
  assert.match(screenSource, /oauthActions/u);
});

test("mobile Google broker route falls back to the native login screen", () => {
  assert.ok(existsSync(mobileGoogleRoutePath));

  const routeSource = readFileSync(mobileGoogleRoutePath, "utf8");
  assert.match(routeSource, /Redirect/u);
  assert.match(routeSource, /href="\/account\/login"/u);
});

test("account auth screen is brand-first without explainer or status cards", () => {
  assert.match(screenSource, /function OrbitAuthLogo/u);
  assert.match(screenSource, /<OrbitAuthLogo \/>/u);
  assert.doesNotMatch(
    screenSource,
    /title="登录说明"|title="账号状态"|SessionPreview|accountSessionToView|ORBIT_API_ENDPOINTS\.accountMe/u
  );
});

test("forgot password moves to the verification form without showing a failed reset state", () => {
  assert.match(screenSource, /setForgotStep\(2\)/u);
  assert.match(screenSource, /验证码邮件还没开通/u);
  assert.doesNotMatch(
    screenSource,
    /重置密码暂时不能发送，请先返回登录/u
  );
});
