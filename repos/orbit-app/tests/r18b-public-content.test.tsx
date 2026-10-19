import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

import { PublicInfoContent } from "../src/screens/public/PublicInfoContent";
import { renderToHtml, renderedText } from "./helpers/render";
import { createTranslator } from "../src/i18n/messages";

const t = createTranslator("ja");
const noop = () => undefined;

test("public help renders local FAQ and a non-actionable contact state when no address is configured", () => {
  const element = <PublicInfoContent kind="help" t={t} query="" onQueryChange={noop} onOpen={noop} contactEmail={null} onOpenEmail={noop} />;
  const html = renderToHtml(element);
  const text = renderedText(element);
  assert.match(text, /ヘルプセンター/);
  assert.match(text, /メールは自動で送信されますか？/);
  assert.match(text, /Gmail 連携で読むのはどの範囲？/);
  assert.match(text, /名刺の読み取りが間違っているときは？/);
  assert.match(text, /準備中/);
  assert.doesNotMatch(html, /mailto:/);
  assert.doesNotMatch(text, /メールアプリを開く|送信しました/);
});

test("local FAQ empty query state and legal placeholder do not invent results or legal text", () => {
  const empty = renderedText(<PublicInfoContent kind="help" t={t} query="領収書" onQueryChange={noop} onOpen={noop} contactEmail={null} onOpenEmail={noop} />);
  assert.match(empty, /一致する質問はありません/);
  assert.doesNotMatch(empty, /メールは自動で送信されますか？/);
  for (const kind of ["terms", "privacy"] as const) {
    const text = renderedText(<PublicInfoContent kind={kind} t={t} query="" onQueryChange={noop} onOpen={noop} contactEmail={null} onOpenEmail={noop} />);
    assert.match(text, /公開前に掲載/);
    assert.match(text, /正式な内容を準備しています。/);
    assert.doesNotMatch(text, /同意します/);
  }
});

test("configured contact state offers the mail app only, without a sent confirmation", () => {
  const text = renderedText(<PublicInfoContent kind="help" t={t} query="" onQueryChange={noop} onOpen={noop} contactEmail="help@example.com" onOpenEmail={noop} />);
  assert.match(text, /メールアプリを開く/);
  assert.doesNotMatch(text, /準備中|送信しました/);
});
