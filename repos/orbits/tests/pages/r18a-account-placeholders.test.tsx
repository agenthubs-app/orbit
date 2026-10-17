import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AccountPreparingPage, accountPreparingSection } from "../../app/(app)/app/orbit-2026/account/AccountPreparingPage";

test("only deferred settings sections render preparing state; static sections keep their own routes", () => {
  for (const section of ["account", "notifications", "permissions", "export", "help"]) {
    assert.equal(accountPreparingSection(section), section);
    const html = renderToStaticMarkup(createElement(AccountPreparingPage, { section: accountPreparingSection(section)! }));
    assert.ok(html.includes("/app/settings"));
    assert.ok(!html.includes("重试"));
  }
  for (const section of ["integrations", "iorbit", "appearance", "unknown"]) {
    assert.equal(accountPreparingSection(section), null);
  }
  for (const section of ["integrations", "iorbit", "appearance"]) {
    assert.ok(existsSync(new URL(`../../app/(app)/app/settings/${section}/page.tsx`, import.meta.url)));
  }
});
