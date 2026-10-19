import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { WebVersionBannerView } from "../../app/(app)/app/orbit-2026/auth-public/WebVersionBanner";

test("the version notice warns about unsaved input and exposes close and reload actions", () => {
  const html = renderToStaticMarkup(<WebVersionBannerView language="ja" onDismiss={() => undefined} onReload={() => undefined} />);
  assert.match(html, /新しいバージョンがあります/);
  assert.match(html, /入力中なら、内容を確認してから再読み込み。/);
  assert.match(html, /あとで/);
  assert.match(html, /再読み込み/);
  assert.doesNotMatch(html, /保存されました|自動保存/);
  assert.match(html, /role="status"/);
});
