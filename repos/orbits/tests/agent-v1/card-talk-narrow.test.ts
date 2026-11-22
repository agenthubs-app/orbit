import assert from "node:assert/strict";
import test from "node:test";

import { stripCardTalk } from "../../features/agent-v1/entry/approval-claims";

/**
 * agent-design AG05 (carried from the AG04 coordinator review): CARD_TALK only matches wording that
 * explicitly means Orbit's confirmation card or the buttons on it. Ordinary sentences about a greeting
 * card, an RSVP page's confirm button or a confirmation email are kept on a turn with no card.
 */

const KEPT = [
  // zh
  "生日卡片上写什么好？可以写一句真诚的祝福。",
  "请对方在报名页点确认就行。",
  "收到确认邮件后，按确认链接完成报名。",
  "贺卡上的字不用太长。",
  "让客户在合同页面上按下确认按钮之前，先把条款读一遍。",
  // ja
  "誕生日カードには短いメッセージを書くとよいです。",
  "申込ページで「確認」を押してもらえば完了です。",
  "確認メールが届いたら、リンクから登録を確定してください。",
  // en
  "Write a short note on the birthday card.",
  "Ask them to click Confirm on the RSVP page.",
  "Once the confirmation email arrives, press the confirm link inside it.",
  "Press Confirm on the booking site to hold the seat.",
];

const DROPPED = [
  "改期需要你在确认卡上点确认才会生效。",
  "在 Orbit 的确认卡片上点一下「确认」就会改好。",
  "卡上的「确认」按钮按下之后才会执行。",
  "変更は確認カードの「Confirm」を押した時点で反映されます。",
  "確認カードの確認ボタンを押すと保存されます。",
  "Changes only happen after you press Confirm on a confirmation card.",
  "Tap the confirm button on the card and it will be saved.",
];

test("greeting-card, RSVP-confirm and confirmation-email sentences are kept (zh, ja, en)", () => {
  for (const sentence of KEPT) assert.deepEqual(stripCardTalk(sentence).dropped, [], sentence);
});

test("sentences about Orbit's confirmation card or its buttons are still dropped (zh, ja, en)", () => {
  for (const sentence of DROPPED) assert.equal(stripCardTalk(sentence).dropped.length, 1, sentence);
});
