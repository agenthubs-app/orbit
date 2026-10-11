import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { checkCopy } from "../../scripts/copy-qa/check.mjs";
import { loadInviteMessageCopy } from "../../scripts/copy-qa/sources.mjs";
import {
  INVITE_MESSAGE_BODY_COPY, INVITE_MESSAGE_LANGUAGES, INVITE_MESSAGE_TONES, INVITE_RESEND_REQUEST_COPY, inviteMessageText, inviteResendRequestText,
} from "../../shared/compute/invite-message-templates";

// R15（DESIGN §2.4「メッセージの下書き」、§2.5 第 6 条、§9 #23）：三种语气 × 三语的固定模板，不调 AI；
// 只做草稿（Orbit 不代发），模板里不出现「送信」。

const fill = { name: "佐藤 健一", link: "https://orbitailink.com/i/K7QX-2M9P", until: "10/14" };

test("the polite Japanese draft matches the design (b11 A2 ③): thanks, the app, the link with its date, my name", () => {
  assert.equal(
    inviteMessageText({ tone: "polite", language: "ja", ...fill }),
    "先日はありがとうございました。\nOrbit という名刺・人脈アプリで、お互いの連絡先を交換できればと思います。下のリンクから 1分ほどで登録できます（アプリは不要です）。\nhttps://orbitailink.com/i/K7QX-2M9P（10/14 まで）\n佐藤 健一",
  );
});

test("every tone in every UI language fills all placeholders and ends with my name", () => {
  for (const tone of INVITE_MESSAGE_TONES) for (const language of INVITE_MESSAGE_LANGUAGES) {
    const text = inviteMessageText({ tone, language, ...fill });
    assert.doesNotMatch(text, /\{[a-z]+\}/u, `${tone}/${language}`);
    assert.ok(text.includes(fill.link) && text.includes(fill.until), `${tone}/${language}`);
    assert.ok(text.endsWith(`\n${fill.name}`), `${tone}/${language}`);
  }
});

test("the English tone is English whatever the UI language", () => {
  const english = inviteMessageText({ tone: "english", language: "en", ...fill });
  assert.equal(inviteMessageText({ tone: "english", language: "ja", ...fill }), english);
  assert.equal(inviteMessageText({ tone: "english", language: "zh", ...fill }), english);
  assert.doesNotMatch(english, /[぀-ヿ]|まで|前有效/u);
  assert.notEqual(inviteMessageText({ tone: "polite", language: "ja", ...fill }), inviteMessageText({ tone: "casual", language: "ja", ...fill }));
});

test("with no name there is no empty signature line", () => {
  const text = inviteMessageText({ tone: "polite", language: "ja", ...fill, name: "  " });
  assert.ok(text.endsWith("（10/14 まで）"));
});

test("a value that looks like a placeholder is not filled twice", () => {
  const text = inviteMessageText({ tone: "polite", language: "en", ...fill, name: "{link}" });
  assert.ok(text.endsWith("\n{link}"));
});

test("the resend request draft (b11 A2 ⑧) in three languages", () => {
  assert.equal(inviteResendRequestText({ language: "ja", inviter: "佐藤" }), "佐藤さん、Orbit の招待リンクの期限が切れていました。お手数ですが、もう一度送っていただけますか？");
  for (const language of INVITE_MESSAGE_LANGUAGES) {
    const text = inviteResendRequestText({ language, inviter: "Sato" });
    assert.ok(text.includes("Sato"), language);
    assert.doesNotMatch(text, /\{[a-z]+\}/u, language);
  }
});

test("no draft says Orbit sends it (no 送信 / 发送 / sent)", () => {
  const all = JSON.stringify([INVITE_MESSAGE_BODY_COPY, INVITE_RESEND_REQUEST_COPY]);
  assert.doesNotMatch(all, /送信|发送|\bsent\b/iu);
});

test("copy-qa: the templates are in scope and have zero issues", async () => {
  const entries = await loadInviteMessageCopy(process.cwd());
  assert.ok(entries.length >= 4);
  assert.ok(entries.every((entry: { kind?: string }) => entry.kind));
  assert.deepEqual(checkCopy(entries).issues, []);
  assert.match(readFileSync("scripts/copy-qa/cli.mjs", "utf8"), /loadInviteMessageCopy/u);
});
