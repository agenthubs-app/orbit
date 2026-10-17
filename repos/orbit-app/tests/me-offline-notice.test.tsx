import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToHtml } from "./helpers/render";
import { createTranslator } from "../src/i18n/messages";
test("R18a offline account copy includes its real synchronization timestamp", async () => {
  const module = await import("../src/screens/me/AccountCopyNotice").catch(() => null); assert.ok(module);
  const html = renderToHtml(createElement(module.AccountCopyNotice, { t: createTranslator("zh"), language: "zh", copy: { offline: true, lastSyncedAt: "2026-09-28T01:10:00Z", reason: "unreachable" } }));
  assert.ok(html.includes("截至")); assert.ok(html.includes("9月28日"));
  const live = renderToHtml(createElement(module.AccountCopyNotice, { t: createTranslator("zh"), language: "zh", copy: null })); assert.equal(live, "");
});
