import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PublicInfoPage } from "../../app/(app)/app/orbit-2026/auth-public/PublicInfoPage";

test("public help has local FAQ, safe navigation, and no unconfigured contact action", () => {
  const html = renderToStaticMarkup(<PublicInfoPage kind="help" language="ja" signedIn={false} />);
  assert.match(html, /data-orbit-2026/);
  assert.match(html, /ヘルプセンター/);
  assert.match(html, /メールは自動で送信されますか？/);
  assert.match(html, /Gmail 連携で読むのはどの範囲？/);
  assert.match(html, /名刺の読み取りが間違っているときは？/);
  assert.match(html, /type="search"/);
  assert.match(html, /準備中/);
  assert.match(html, /href="\/app\/account\/login\?next=%2Fhelp"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy"/);
  assert.doesNotMatch(html, /mailto:|フォームを開く|送信しました/);
});

test("public legal pages show substantive terms and privacy policy in each language", () => {
  for (const [language, termsHeading, privacyHeading] of [
    ["ja", "アカウント", "イベント・連絡先の共有"],
    ["zh", "账号", "活动与联系人共享"],
    ["en", "Your account", "Events and contact sharing"],
  ] as const) {
    for (const [kind, heading] of [["terms", termsHeading], ["privacy", privacyHeading]] as const) {
      const html = renderToStaticMarkup(<PublicInfoPage kind={kind} language={language} signedIn={false} />);
      assert.ok(html.includes(`<h2>${heading}</h2>`), `${language} ${kind} should render its document`);
      assert.match(html, /href="\/help"/);
      assert.doesNotMatch(html, /公開前に掲載|正式内容仍在准备中|The full text is being prepared|mailto:/);
    }
  }
});

test("public pages are language-aware and show settings rather than login for a session", () => {
  const signedIn = renderToStaticMarkup(<PublicInfoPage kind="help" language="ja" signedIn />);
  assert.match(signedIn, /href="\/app\/settings"/);
  assert.doesNotMatch(signedIn, /href="\/app\/account\/login/);
  assert.match(renderToStaticMarkup(<PublicInfoPage kind="terms" language="en" signedIn={false} />), /Terms of Use/);
  assert.match(renderToStaticMarkup(<PublicInfoPage kind="privacy" language="zh" signedIn={false} />), /隐私/);
});

test("a configured support address opens the mail app with the same address", () => {
  const html = renderToStaticMarkup(<PublicInfoPage kind="help" language="ja" signedIn={false} contactEmail="help@example.com" />);
  assert.match(html, /href="mailto:help@example\.com"/);
  assert.doesNotMatch(html, /準備中|送信しました/);
});
