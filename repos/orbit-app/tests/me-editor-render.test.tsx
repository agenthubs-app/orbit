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
  assert.ok(html.includes("名刺交換した相手のみ"));
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
