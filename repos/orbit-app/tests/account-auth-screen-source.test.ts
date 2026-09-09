import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "profile", "AccountAuthScreen.tsx"),
  "utf8"
);
const authProviderSource = readFileSync(
  join(repoRoot, "src", "api", "AuthSessionProvider.tsx"),
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

test("mobile Google PKCE hashes a native typed array", () => {
  assert.match(
    authProviderSource,
    /const bytes = new Uint8Array\(value\.byteLength\);/u
  );
  assert.match(
    authProviderSource,
    /Crypto\.digest\(Crypto\.CryptoDigestAlgorithm\.SHA256, bytes\)/u
  );
});

test("account auth screen normalizes next before every post-auth navigation", () => {
  assert.match(screenSource, /normalizedNext\(firstParam\(params\.next/u);
  assert.match(screenSource, /nextHrefForAccountAuthSubmit/u);
  assert.doesNotMatch(screenSource, /router\.replace\(next as Href\)/u);
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
  assert.doesNotMatch(screenSource, /displayName:\s*"小雨"/u);
});

// Route wiring only; real submits are covered in password-reset-interactions.
test("password reset has a public native route", () => {
  const route = join(repoRoot, "app/account/reset-password.tsx");
  assert.ok(existsSync(route), "native reset route exists");
  assert.match(readFileSync(route, "utf8"), /<PasswordResetScreen\s*\/>/u);
});
