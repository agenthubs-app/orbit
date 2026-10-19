import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { createTranslator } from "../src/i18n/messages";
import { NotFoundContent } from "../src/screens/public/NotFoundContent";
import { renderToHtml, renderedText } from "./helpers/render";

test("unknown App route offers home and public help without invented recovery", () => {
  const text = renderedText(<NotFoundContent t={createTranslator("ja")} onHome={() => undefined} onHelp={() => undefined} />);
  assert.match(text, /このページは見つかりません/);
  assert.match(text, /ホームへ戻る/);
  assert.match(text, /ヘルプを見る/);
  assert.doesNotMatch(text, /最近削除|検索|復元/);
});

test("Japanese App 404 keeps the approved two-line explanation on a phone", () => {
  const html = renderToHtml(<NotFoundContent t={createTranslator("ja")} onHome={() => undefined} onHelp={() => undefined} />);
  assert.match(html, /URL が\n間違って/u);
});
