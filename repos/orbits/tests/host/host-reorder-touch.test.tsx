// 触屏排序（b13 HM-S3 / S7b，2026-11-26）：题目与议程都能用 ↑↓ 调顺序，不依赖拖拽。
import assert from "node:assert/strict";
import test from "node:test";

import { bundle, errorsOf, launch, open } from "../ui/support/orbit-2026-harness";

test("questions and agenda reorder with ↑↓ buttons (no drag)", async () => {
  const code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { QuestionsEditor, SetupAgendaCard } from "./app/(app)/app/orbit-2026/host/HostSetup";
    import { hostTranslator } from "./app/(app)/app/orbit-2026/host/host-model";
    import { Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    const t = hostTranslator("ja");
    function App() {
      const [qs, setQs] = React.useState([
        { id: "a", kind: "single", options: ["x", "y"], prompt: "A", required: true },
        { id: "b", kind: "free", options: [], prompt: "B", required: false },
        { id: "c", kind: "multiple", options: ["p", "q"], prompt: "C", required: true },
      ]);
      const [agendaOpen, setAgendaOpen] = React.useState(false);
      const event = {
        eventId: "agenda-test",
        version: 1,
        startsAt: "2026-11-26T10:00:00Z",
        endsAt: "2026-11-26T12:00:00Z",
        agenda: [{ at: "19:00", title: "受付" }, { at: "19:30", title: "講演" }],
      };
      window.state = { qs: qs.map((q) => q.id).join("") };
      return <Orbit2026Scope language="ja"><div style={{width:390}}>
        <div id="q"><QuestionsEditor questions={qs} t={t} language="ja" editing={-1} onEdit={() => {}} onChange={setQs} /></div>
        <button id="open-agenda" onClick={() => setAgendaOpen(true)}>アジェンダ</button>
        {agendaOpen ? <SetupAgendaCard event={event} t={t} ended={false} onSaved={() => {}} onBack={() => setAgendaOpen(false)} /> : null}
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
      await page.locator("#open-agenda").click();
      await page.locator("[data-host-setup-sub=agenda] [data-host-reorder]").click();
      const reorder = page.locator("[data-host-setup-sub=agenda-reorder]");
      assert.equal(await page.getByRole("dialog").count(), 1);
      assert.equal(await page.locator("[data-host-setup-agenda-save]").count(), 0);
      await reorder.locator("[data-reorder-row='1'] [data-reorder-up]").click();
      assert.match(await reorder.locator("[data-reorder-row='0']").innerText(), /講演/);
      await reorder.locator("[data-host-reorder-done]").click();
      const agenda = page.locator("[data-host-setup-sub=agenda]");
      assert.equal(await agenda.locator("[data-agenda-row='0'] [data-agenda-field=title]").inputValue(), "講演");
      assert.equal(await agenda.locator("[data-host-setup-agenda-save]").isEnabled(), true);
      assert.deepEqual(errorsOf(page), []);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});
