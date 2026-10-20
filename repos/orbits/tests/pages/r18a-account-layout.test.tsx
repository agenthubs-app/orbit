import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountLayout } from "../../app/(app)/app/orbit-2026/account/AccountLayout";

test("account submenu contains the approved destinations without paid plan or temporary host tab", () => {
  const html = renderToStaticMarkup(createElement(AccountLayout, {
    active: "profile", title: "プロフィール", children: createElement("p", null, "profile content"),
  }));
  for (const href of [
    "/app/profile", "/app/settings/integrations", "/app/settings/iorbit",
    "/app/settings/appearance", "/app/settings/notifications",
    "/app/settings/account", "/app/settings/permissions",
    "/app/settings/exports", "/app/settings/help",
  ]) assert.ok(html.includes(`href="${href}"`), href);
  assert.ok(html.includes("profile content"));
  assert.ok(!html.includes("ご利用プラン"));
  assert.ok(!html.includes("/app/events/center"));
});
