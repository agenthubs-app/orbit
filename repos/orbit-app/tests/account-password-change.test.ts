import assert from "node:assert/strict";
import test from "node:test";

import {
  changePasswordHref,
  credentialsLandingHref,
  passwordChangeFailureKey,
  passwordChangeProblemKey,
  readMustChangePassword,
  submitPasswordChange,
  trimPastedPassword,
  validatePasswordChange
} from "../src/view-models/password-change";
import { en } from "../src/i18n/en";
import { ja } from "../src/i18n/ja";
import { zh } from "../src/i18n/zh";

const messages = { en, ja, zh } as const;

// 首次登录强制改密（与 Web features/auth/password-change*.ts、use-password-change.ts 同规则）。

test("change-password validation: current required, 8+ chars, ≤72 UTF-8 bytes, different from current", () => {
  assert.equal(validatePasswordChange("", "new-password-1"), "current-required");
  assert.equal(validatePasswordChange("old-pass", "short7!"), "too-short");
  assert.equal(validatePasswordChange("old-pass", "12345678"), null);
  assert.equal(validatePasswordChange("old-pass", "a".repeat(72)), null);
  assert.equal(validatePasswordChange("old-pass", "a".repeat(73)), "too-long");
  // 25 × 3-byte CJK = 75 bytes although only 25 characters.
  assert.equal(validatePasswordChange("old-pass", "密".repeat(25)), "too-long");
  assert.equal(validatePasswordChange("same-pass-1", "same-pass-1"), "same");
  for (const problem of ["current-required", "too-short", "too-long", "same"] as const) {
    for (const locale of ["zh", "ja", "en"] as const) assert.ok(messages[locale][passwordChangeProblemKey(problem)], `${locale} ${problem}`);
  }
  for (const code of ["CONFLICT", "INVALID_INPUT", "NO_PASSWORD", "SAME_PASSWORD", "UNAUTHORIZED", "WRONG_PASSWORD", "NETWORK", "UNKNOWN"] as const) {
    for (const locale of ["zh", "ja", "en"] as const) assert.ok(messages[locale][passwordChangeFailureKey(code)], `${locale} ${code}`);
  }
});

test("after email + password login: a marked account goes to change-password with next, otherwise on as before", () => {
  assert.equal(credentialsLandingHref(true, "/events/e1?tab=details"), "/account/change-password?next=%2Fevents%2Fe1%3Ftab%3Ddetails&first=1");
  assert.equal(credentialsLandingHref(false, "/events/e1?tab=details"), "/profile/onboarding?next=%2Fevents%2Fe1%3Ftab%3Ddetails");
  // An auth page or an unknown target never becomes the place to return to.
  assert.equal(changePasswordHref("/account/login"), "/account/change-password?next=%2Fhome");
  assert.equal(changePasswordHref("https://evil.test/"), "/account/change-password?next=%2Fhome");
});

function fakeFetch(answer: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  return { calls, fetchImpl: async (url: string, init?: RequestInit) => { calls.push({ url, ...(init ? { init } : {}) }); return answer(url, init); } };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

test("status: only an explicit true asks for a change; errors never block sign-in", async () => {
  const marked = fakeFetch(() => json({ mustChangePassword: true }));
  assert.equal(await readMustChangePassword({ baseUrl: "https://orbit.test/", cookieHeader: "authjs.session-token=abc", fetchImpl: marked.fetchImpl }), true);
  assert.equal(marked.calls[0]!.url, "https://orbit.test/api/auth/password/status");
  assert.equal(marked.calls[0]!.init?.method, "GET");
  assert.equal((marked.calls[0]!.init?.headers as Record<string, string>).Cookie, "authjs.session-token=abc");
  for (const answer of [() => json({ mustChangePassword: false }), () => json({ mustChangePassword: "true" }), () => json({ success: false }, 401), () => json({}, 503), () => new Response("<html>", { status: 200 }), () => { throw new TypeError("offline"); }]) {
    assert.equal(await readMustChangePassword({ baseUrl: "https://orbit.test", cookieHeader: "c=1", fetchImpl: fakeFetch(answer).fetchImpl }), false);
  }
});

test("change: posts {currentPassword,newPassword} with the session cookie and maps server codes", async () => {
  const ok = fakeFetch(() => json({ success: true, data: { message: "密码已更新。" } }));
  assert.deepEqual(await submitPasswordChange({ baseUrl: "https://orbit.test", cookieHeader: "c=1", currentPassword: "Init-0001", newPassword: "mine-12345", fetchImpl: ok.fetchImpl }), { ok: true });
  const call = ok.calls[0]!;
  assert.equal(call.url, "https://orbit.test/api/auth/password/change");
  assert.equal(call.init?.method, "POST");
  assert.deepEqual(JSON.parse(String(call.init?.body)), { currentPassword: "Init-0001", newPassword: "mine-12345" });
  assert.equal((call.init?.headers as Record<string, string>)["Content-Type"], "application/json");
  assert.equal((call.init?.headers as Record<string, string>).Cookie, "c=1");
  const failed = async (status: number, code: string) => submitPasswordChange({ baseUrl: "https://orbit.test", cookieHeader: "c=1", currentPassword: "a", newPassword: "b", fetchImpl: fakeFetch(() => json({ success: false, error: { code, message: "x" } }, status)).fetchImpl });
  assert.deepEqual(await failed(400, "WRONG_PASSWORD"), { code: "WRONG_PASSWORD", ok: false });
  assert.deepEqual(await failed(409, "CONFLICT"), { code: "CONFLICT", ok: false });
  assert.deepEqual(await failed(401, "UNAUTHORIZED"), { code: "UNAUTHORIZED", ok: false });
  assert.deepEqual(await failed(503, "SERVICE_UNAVAILABLE"), { code: "UNKNOWN", ok: false });
  assert.deepEqual(await submitPasswordChange({ baseUrl: "https://orbit.test", cookieHeader: "", currentPassword: "a", newPassword: "b", fetchImpl: fakeFetch(() => { throw new TypeError("offline"); }).fetchImpl }), { code: "NETWORK", ok: false });
});

test("paste trimming touches only a multi-character insertion (as Web trimPastedPassword)", () => {
  assert.equal(trimPastedPassword("", "  Init-0001\n"), "Init-0001");
  assert.equal(trimPastedPassword("ab", "ab  cd "), "abcd");
  assert.equal(trimPastedPassword("abcd", "a xy d"), "axyd");
  // Typing one character at a time (a space included) stays as typed.
  assert.equal(trimPastedPassword("ab", "ab "), "ab ");
  assert.equal(trimPastedPassword(" ", "  "), "  ");
  // Deleting is untouched; a paste with no surrounding spaces is untouched.
  assert.equal(trimPastedPassword("abc ", "abc"), "abc");
  assert.equal(trimPastedPassword("", "secret-1"), "secret-1");
});
