/**
 * AG21c R56 (W) with decision D9: one switch covers the phone and the browser, so a reminder asked for "on my phone" was
 * widened silently on the card. The switch stays one; the reply now says in one plain sentence, in the reply's language,
 * that the reminder also shows in the browser — only when the words named the phone and no other device.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { alsoInBrowserLine, asksPhoneOnly } from "../../features/agent-v1/rule/reminder";

test("R56/D9 phone-only words are told the reminder also shows in the browser (zh, ja, en); other devices named are not", () => {
  for (const words of ["这个任务有新结果就在手机上提醒我", "新しい結果が出たらスマホに通知して", "ping me on my phone when it finds something"]) assert.ok(asksPhoneOnly(words), words);
  for (const words of ["手机和浏览器都提醒我", "パソコンにも通知して", "notify me on my phone and desktop", "有新结果就提醒我"]) assert.ok(!asksPhoneOnly(words), words);
  assert.equal(alsoInBrowserLine("zh"), "这个提醒也会在浏览器里显示。");
  assert.equal(alsoInBrowserLine("ja"), "このお知らせはブラウザにも表示されます。");
  assert.equal(alsoInBrowserLine("en"), "This reminder will also show in your browser.");
  for (const language of ["zh", "ja", "en"]) assert.equal(alsoInBrowserLine(language).split(/[。.]/u).filter((piece) => piece.trim()).length, 1, "one sentence");
});
