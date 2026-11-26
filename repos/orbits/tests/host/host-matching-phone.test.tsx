// 手机换桌（b13 HM-M4，2026-11-26）：成员行「移動」→ 选目标桌（不靠拖拽）；公开后只读。
import assert from "node:assert/strict";
import test from "node:test";

import { bundle, errorsOf, launch, open } from "../ui/support/orbit-2026-harness";

test("phone matching: 移動 opens the table picker and moves to the chosen table; published is read-only", async () => {
  const code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { HostMatchingPhone } from "./app/(app)/app/orbit-2026/host/HostMatchingPhone";
    import { hostTranslator } from "./app/(app)/app/orbit-2026/host/host-model";
    import { Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    import { HOST_EVENT_IDS, hostMatching } from "./shared/mock/demo-world/host-events";
    const draft = hostMatching(HOST_EVENT_IDS.cfo18);
    window.moved = [];
    createRoot(document.getElementById("root")).render(<Orbit2026Scope language="ja">
      <div id="draft" style={{width:390}}><HostMatchingPhone data={{ ...draft, state: "draft" }} t={hostTranslator("ja")} language="ja" onMoveTo={(member, from, to) => window.moved.push([member.participantId, from, to])} /></div>
      <div id="pub" style={{width:390}}><HostMatchingPhone data={{ ...draft, state: "published" }} t={hostTranslator("ja")} language="ja" /></div>
    </Orbit2026Scope>);
  `);
  const browser = await launch();
  try {
    const page = await open(browser, code, { width: 390 });
    try {
      await page.locator("#draft [data-host-table=A] [data-host-move]").first().click();
      await page.locator("[data-host-move-to=C]").click();
      const moved = await page.evaluate(() => (window as unknown as { moved: unknown[][] }).moved);
      assert.equal(moved.length, 1);
      assert.deepEqual(moved[0]!.slice(1), ["A", "C"]);
      assert.equal(await page.locator("#pub [data-host-move]").count(), 0, "no 移動 after publishing");
      assert.equal(await page.locator("#pub [data-host-publish]").count(), 0);
      assert.deepEqual(errorsOf(page), []);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});
