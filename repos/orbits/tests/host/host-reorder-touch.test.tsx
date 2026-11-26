// 触屏排序（b13 HM-S3 / S7b，2026-11-26）：题目与议程都能用 ↑↓ 调顺序，不依赖拖拽。
import assert from "node:assert/strict";
import test from "node:test";

import { bundle, errorsOf, launch, open } from "../ui/support/orbit-2026-harness";

test("questions and agenda reorder with ↑↓ buttons (no drag)", async () => {
  const code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { QuestionsEditor } from "./app/(app)/app/orbit-2026/host/HostSetup";
    import { AgendaEditor } from "./app/(app)/app/orbit-2026/host/AgendaEditor";
    import { hostTranslator } from "./app/(app)/app/orbit-2026/host/host-model";
    import { Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    const t = hostTranslator("ja");
    function App() {
      const [qs, setQs] = React.useState([
        { id: "a", kind: "single", options: ["x", "y"], prompt: "A", required: true },
        { id: "b", kind: "free", options: [], prompt: "B", required: false },
        { id: "c", kind: "multiple", options: ["p", "q"], prompt: "C", required: true },
      ]);
      const [rows, setRows] = React.useState([{ at: "19:00", title: "受付", detail: "" }, { at: "19:30", title: "講演", detail: "" }]);
      window.state = { qs: qs.map((q) => q.id).join(""), rows: rows.map((r) => r.title).join("|") };
      return <Orbit2026Scope language="ja"><div style={{width:390}}>
        <div id="q"><QuestionsEditor questions={qs} t={t} language="ja" editing={-1} onEdit={() => {}} onChange={setQs} /></div>
        <div id="a"><AgendaEditor rows={rows} t={t} start="19:00" end="21:00" phone onChange={setRows} /></div>
      </div></Orbit2026Scope>;
    }
    createRoot(document.getElementById("root")).render(<App />);
  `);
  const browser = await launch();
  try {
    const page = await open(browser, code, { width: 390 });
    try {
      await page.locator("#q [data-host-reorder]").click();
      await page.locator("#q [data-reorder-row='0'] [data-reorder-down]").click();
      assert.equal(await page.evaluate(() => (window as unknown as { state: { qs: string } }).state.qs), "bac");
      assert.equal(await page.locator("#q [data-reorder-row='0'] [data-reorder-up]").isDisabled(), true, "first row cannot go up");
      await page.locator("#q [data-host-reorder-done]").click();
      await page.locator("#a [data-host-reorder]").click();
      await page.locator("#a [data-reorder-row='1'] [data-reorder-up]").click();
      assert.equal(await page.evaluate(() => (window as unknown as { state: { rows: string } }).state.rows), "講演|受付");
      assert.deepEqual(errorsOf(page), []);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});
