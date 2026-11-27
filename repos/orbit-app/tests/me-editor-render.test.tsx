import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToHtml } from "./helpers/render";
import { createTranslator } from "../src/i18n/messages";
import { demoAccountProfiles } from "../../orbits/shared/mock/demo-world/account";
import { openProfileEditSession } from "../src/data/profile-edit-session";
import type { ManualProfileContract } from "../src/api/contract/profile";
test("R18a preview filters all public groups and never reveals exchange-only handles", async () => {
  const module = await import("../src/screens/me/AccountPreviewContent").catch(() => null);
  assert.ok(module);
  const profile = { ...demoAccountProfiles.complete.profile!, publicFields: { companyRole: false, offeringSeeking: false, intro: false }, handles: { email: "PRIVATE@example.com", phone: "PRIVATE123" } } as ManualProfileContract;
  const html = renderToHtml(createElement(module.AccountPreviewContent, { profile, t: createTranslator("ja") }));
  for (const secret of [profile.organization, profile.role, profile.bio!, ...profile.offering!, ...profile.seeking!, "PRIVATE"]) assert.ok(!html.includes(secret), secret);
  assert.ok(html.includes("人脈の相手と、申し込んだイベントの主催者だけに表示されます。"), "2026-11-27: who can see contact methods");
});
test("R18a editor renders company, role, industry, location, bio limit, tags and visibility controls", async () => {
  const module = await import("../src/screens/me/AccountEditorContent").catch(() => null);
  assert.ok(module);
  const session = openProfileEditSession({ actorId: "editor-render", apiOrigin: "http://localhost" }, demoAccountProfiles.complete.profile! as ManualProfileContract);
  const html = renderToHtml(createElement(module.AccountEditorContent, { draft: session.draft, t: createTranslator("ja"), patch: () => {}, onTags: () => {} }));
  for (const label of ["会社", "役職", "業界", "所在地", "自己紹介", "公開する項目"]) assert.ok(html.includes(label), label);
  assert.equal((html.match(/role="switch"/g) ?? []).length, 3);
  assert.ok(!html.includes("写真を追加"));
});
test("UR-P9–P15 editor: 連絡先 after the bio with who can see it; LINE / WeChat shown, email and phone behind ＋; no fixed row under 公開する項目", async () => {
  const module = await import("../src/screens/me/AccountEditorContent");
  const session = openProfileEditSession({ actorId: "editor-contacts", apiOrigin: "http://localhost" }, { ...demoAccountProfiles.complete.profile!, handles: {} } as ManualProfileContract);
  const html = renderToHtml(createElement(module.AccountEditorContent, { draft: session.draft, t: createTranslator("ja"), patch: () => {}, onTags: () => {} }));
  for (const text of ["連絡先", "人脈の相手と、申し込んだイベントの主催者だけに表示されます。", "LINE ID", "WeChat ID", "メール・電話を入れる"]) assert.ok(html.includes(text), text);
  assert.ok(html.indexOf("自己紹介") < html.indexOf("人脈の相手と"), "after the bio");
  assert.ok(!html.includes("例）name@example.com"), "email is behind ＋");
  assert.ok(!html.includes("名刺交換した相手のみ"));
});
