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
  assert.match(html, /href="\/app\/account\/login"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, /href="\/privacy"/);
  assert.doesNotMatch(html, /mailto:|フォームを開く|送信しました/);
});

test("public legal pages expose only the approved pre-publication placeholder", () => {
  for (const kind of ["terms", "privacy"] as const) {
    const html = renderToStaticMarkup(<PublicInfoPage kind={kind} language="ja" signedIn={false} />);
    assert.match(html, /公開前に掲載/);
    assert.match(html, /正式な内容を準備しています。/);
    assert.match(html, /href="\/help"/);
    assert.match(html, /href="\/"/);
    assert.doesNotMatch(html, /mailto:|同意します/);
  }
});

test("public pages are language-aware and show settings rather than login for a session", () => {
  const signedIn = renderToStaticMarkup(<PublicInfoPage kind="help" language="ja" signedIn />);
  assert.match(signedIn, /href="\/app\/settings"/);
  assert.doesNotMatch(signedIn, /href="\/app\/account\/login"/);
  assert.match(renderToStaticMarkup(<PublicInfoPage kind="terms" language="en" signedIn={false} />), /Terms of Use/);
  assert.match(renderToStaticMarkup(<PublicInfoPage kind="privacy" language="zh" signedIn={false} />), /隐私/);
});

test("a configured support address opens the mail app with the same address", () => {
  const html = renderToStaticMarkup(<PublicInfoPage kind="help" language="ja" signedIn={false} contactEmail="help@example.com" />);
  assert.match(html, /href="mailto:help@example\.com"/);
  assert.doesNotMatch(html, /準備中|送信しました/);
});
