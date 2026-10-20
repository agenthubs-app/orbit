import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createTranslator } from "../src/i18n/messages";

const repoRoot = new URL("..", import.meta.url).pathname;
const screenSource = readFileSync(
  join(repoRoot, "src", "screens", "profile", "AccountAuthScreen.tsx"),
  "utf8"
);
const authProviderSource = readFileSync(
  join(repoRoot, "src", "api", "AuthSessionProvider.tsx"),
  "utf8"
);
const accountScreenSource = readFileSync(
  join(repoRoot, "src", "screens", "profile", "AccountScreen.tsx"),
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

test("native login shows only an anonymous device-wide pending-write count for the current server view", () => {
  assert.match(screenSource, /readPendingWritesOnDevice/u);
  assert.match(screenSource, /mode === "login"/u);
  assert.match(screenSource, /Platform\.OS !== "web"/u);
  assert.match(screenSource, /devicePendingWrites\?\.baseUrl === server\.baseUrl/u);
  assert.match(screenSource, /locale\.t\("auth\.devicePendingWriteCount", \{ count: devicePendingWrites\.count \}\)/u);
  assert.match(screenSource, /locale\.t\("auth\.devicePendingWritesUnknown"\)/u);
  assert.doesNotMatch(screenSource, /`[^`]*\$\{[^}]*email/u);
});

test("device pending-write notices use the selected language and interpolate an anonymous count", () => {
  assert.equal(createTranslator("zh")("auth.devicePendingWriteCount", { count: 2 }), "这台设备有2项加密保存的未同步修改，使用原账号及原服务器登录后可恢复。");
  assert.equal(createTranslator("en")("auth.devicePendingWriteCount", { count: 1 }), "Encrypted changes waiting to sync on this device: 1. Sign in with the original account and server to recover them.");
  assert.equal(createTranslator("en")("auth.devicePendingWriteCount", { count: 2 }), "Encrypted changes waiting to sync on this device: 2. Sign in with the original account and server to recover them.");
  assert.equal(createTranslator("ja")("auth.devicePendingWriteCount", { count: 2 }), "この端末には暗号化して保存された未同期の変更が 2 件あります。元のアカウントと元のサーバーでログインすると復元できます。");
  assert.equal(createTranslator("zh")("auth.devicePendingWritesUnknown"), "暂时无法确认这台设备是否有待恢复的修改；登录前会再次检查。");
  assert.equal(createTranslator("en")("auth.devicePendingWritesUnknown"), "Couldn't check this device for changes to recover. The check will run again before sign-in.");
  assert.equal(createTranslator("ja")("auth.devicePendingWritesUnknown"), "この端末に復元待ちの変更があるか、現在確認できません。ログイン前に再確認します。");
});

test("the Debug outbox fixture is hidden outside signed-in development builds", () => {
  assert.match(accountScreenSource, /__DEV__ \? <Card[\s\S]*Platform\.OS !== "web" && auth\.signedIn/u);
  assert.match(accountScreenSource, /Platform\.OS === "web" \|\| !auth\.signedIn/u);
  assert.match(accountScreenSource, /enqueueDebugPendingWrite/u);
  assert.match(accountScreenSource, /Promise\.all\([\s\S]*?\)\.catch\([\s\S]*?无法读取这台设备上的待同步修改数量/u);
  assert.match(accountScreenSource, /Debug 测试修改未能写入本机队列/u);
  assert.match(accountScreenSource, /catch/u);
  assert.match(authProviderSource, /if \(!__DEV__ \|\| usesBrowserManagedSession \|\| !accountId/u);
  assert.match(authProviderSource, /domainId: "test-offline-write"/u);
  assert.match(authProviderSource, /debug-offline-write-0124-/u);
  assert.match(authProviderSource, /listDebugPendingWriteIds/u);
  assert.match(authProviderSource, /deleteDebugPendingWrite/u);
  assert.match(authProviderSource, /DELETE FROM sync_outbox WHERE mutation_id = \? AND domain_id = \? AND workspace_id = \?/u);
  assert.doesNotMatch(authProviderSource, /endpoint: "\/api\//u);
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

test("native signup fallback passes the email through one-use state, not route params", () => {
  assert.match(screenSource, /rememberSignupFallbackEmail\(values\.email, next\)/u);
  assert.match(screenSource, /takeSignupFallbackEmail\(next\)/u);
  assert.doesNotMatch(screenSource, /params\.email|email=\$\{/u);
});

test("mobile Google broker route falls back to the native login screen", () => {
  assert.ok(existsSync(mobileGoogleRoutePath));

  const routeSource = readFileSync(mobileGoogleRoutePath, "utf8");
  assert.match(routeSource, /Redirect/u);
  assert.match(routeSource, /href="\/account\/login"/u);
});

test("account auth screen is brand-first without explainer or status cards", () => {
  assert.match(screenSource, /<View style=\{styles\.brand\}>/u);
  assert.match(screenSource, /<Text allowFontScaling=\{false\} style=\{styles\.brandMark\}>O<\/Text>/u);
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
