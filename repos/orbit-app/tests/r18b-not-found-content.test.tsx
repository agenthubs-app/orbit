import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { createTranslator } from "../src/i18n/messages";
import { NotFoundContent } from "../src/screens/public/NotFoundContent";
import { renderedText } from "./helpers/render";

test("unknown App route offers home and public help without invented recovery", () => {
  const text = renderedText(<NotFoundContent t={createTranslator("ja")} onHome={() => undefined} onHelp={() => undefined} />);
  assert.match(text, /このページは見つかりません/);
  assert.match(text, /ホームへ戻る/);
  assert.match(text, /ヘルプを見る/);
  assert.doesNotMatch(text, /最近削除|検索|復元/);
});
