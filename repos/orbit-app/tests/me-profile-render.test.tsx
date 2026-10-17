import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToHtml } from "./helpers/render";
import { createTranslator } from "../src/i18n/messages";
import { demoAccountProfiles, demoAccountSeekCandidates } from "../../orbits/shared/mock/demo-world/account";

test("R18a App my page renders 25/50/100 server completeness, missing weights, AI candidates and the approved entry order", async () => {
  const view = await import("../src/screens/me/MyPageContent").catch(() => null);
  assert.ok(view, "R18a new my-page screen is missing");
  const t = createTranslator("ja");
  for (const [variant, score] of [["new",25],["regular",50],["complete",100]] as const) {
    const html = renderToHtml(createElement(view.MyPageContent, {
      data: demoAccountProfiles[variant], t, candidates: variant === "regular" ? demoAccountSeekCandidates : [],
      unread: 5, going: 2, hostEntry: createElement("span", {}, "主催したイベント"), onOpen: () => {}, onCandidate: () => {},
    }));
    assert.ok(html.includes(score + "%"));
    assert.equal(html.includes("+25%"), score !== 100);
    assert.equal(html.includes("AI の候補"), variant === "regular");
    assert.equal(html.includes("完成しました"), score === 100);
    const entries = ["公開プロフィールのプレビュー","受信箱","招待コード","主催したイベント","参加するイベント","設定"];
    for (let i = 1; i < entries.length; i++) assert.ok(html.indexOf(entries[i - 1]) < html.indexOf(entries[i]), entries[i]);
    for (const unsupported of ["今月の閲覧","ご利用プラン","NFC","写真を追加"]) assert.ok(!html.includes(unsupported));
  }
});

test("R18a App summary failures and zero upcoming events hide only their rows", async () => {
  const view = await import("../src/screens/me/MyPageContent").catch(() => null);
  assert.ok(view, "R18a new my-page screen is missing");
  const html = renderToHtml(createElement(view.MyPageContent, { data: demoAccountProfiles.complete, t: createTranslator("ja"), candidates: [], unread: null, going: 0, hostEntry: null, onOpen: () => {}, onCandidate: () => {} }));
  assert.ok(!html.includes("受信箱"));
  assert.ok(!html.includes("参加するイベント"));
  assert.ok(!html.includes("主催したイベント"));
  assert.ok(html.includes("招待コード"));
  assert.ok(html.includes("公開プロフィールのプレビュー"));
});
