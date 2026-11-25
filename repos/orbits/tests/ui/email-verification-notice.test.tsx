import assert from "node:assert/strict";
import test from "node:test";
import { SessionContext } from "next-auth/react";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { OrbitLanguageProvider } from "../../app/(app)/app/orbit-language-context";
import { EmailVerificationNotice, sendResultText, showsEmailNotice } from "../../app/(app)/app/orbit-2026/email-verification/EmailVerificationNotice";
import { EmailVerificationRow } from "../../app/(app)/app/orbit-2026/email-verification/EmailVerificationRow";


function render(node: typeof EmailVerificationNotice, emailVerification: { verified: boolean; sent: boolean } | null | undefined, path = "/app/home", language: "ja" | "zh" | "en" = "ja") {
  const session = { data: emailVerification === undefined ? null : { expires: "", user: { email: "a@example.test", emailVerification, id: "u1" } }, status: "authenticated", update: async () => null };
  return renderToStaticMarkup(createElement(SessionContext.Provider, { value: session as never },
    createElement(PathnameContext.Provider, { value: path }, createElement(OrbitLanguageProvider, { initialLanguage: language, children: createElement(node) }))));
}

test("未验证：每个登录后的页面都有，关不掉；已验证、不知道、没登录：没有", () => {
  const html = render(EmailVerificationNotice, { sent: true, verified: false }, "/app/profile/onboarding");
  assert.match(html, /メールアドレスが未確認です/u);
  assert.equal(html.match(/<button/gu)?.length, 1, "只有一个按钮");
  assert.match(html, />再送する<\/button>/u);
  assert.match(render(EmailVerificationNotice, { sent: false, verified: false }), />確認メールを送る<\/button>/u);
  assert.match(render(EmailVerificationNotice, { sent: true, verified: false }, "/app/home", "zh"), /邮箱还没有验证.*重新发送/u);
  assert.match(render(EmailVerificationNotice, { sent: true, verified: false }, "/app/home", "en"), /Your email is not verified.*Resend/u);
  for (const flags of [{ sent: true, verified: true }, null, undefined]) assert.equal(render(EmailVerificationNotice, flags), "");
});

test("受付端末、登录框、管理台不显示", () => {
  for (const path of ["/app/events/e1/operations/check-in", "/app/account/login", "/app/admin", "/app/login-admin"]) assert.equal(showsEmailNotice(path), false, path);
  for (const path of ["/app/home", "/app/profile/onboarding", "/app/events/e1", "/app/settings/account", "/app/administration"]) assert.equal(showsEmailNotice(path), true, path);
});

test("账号页的状态行", () => {
  assert.match(render(EmailVerificationRow, { sent: true, verified: false }), /メールアドレスの確認.*未確認.*再送する/u);
  const verified = render(EmailVerificationRow, { sent: false, verified: true });
  assert.match(verified, /確認済み/u);
  assert.doesNotMatch(verified, /<button/u);
});

test("发送结果写清发到哪、为什么没发", () => {
  assert.equal(sendResultText({ kind: "sent" }, "a@example.test", "zh"), "已发送到a@example.test");
  assert.equal(sendResultText({ kind: "wait", seconds: 45 }, "", "ja"), "あと 45 秒で再送できます");
  assert.equal(sendResultText({ kind: "limit" }, "", "zh"), "今天不能再发了，请明天再试");
  assert.equal(sendResultText({ kind: "fail" }, "", "en"), "Could not send it. Try again shortly");
  assert.equal(sendResultText({ kind: "idle" }, "", "ja"), null);
});
