import assert from "node:assert/strict";
import test from "node:test";

import { bundle, errorsOf, launch, open } from "../ui/support/orbit-2026-harness";

test("the four people buckets scroll inside their 390px card", async () => {
  const code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { HostPeopleView } from "./app/(app)/app/orbit-2026/host/HostPeople";
    import { hostTranslator } from "./app/(app)/app/orbit-2026/host/host-model";
    import { Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    import { HOST_EVENT_IDS, hostPeople } from "./shared/mock/demo-world/host-events";
    const data = hostPeople(HOST_EVENT_IDS.roundtable, "pending");
    createRoot(document.getElementById("root")).render(<Orbit2026Scope language="ja">
      <div style={{width:390,padding:"0 18px",boxSizing:"border-box"}}>
        <HostPeopleView data={data} t={hostTranslator("ja")} rows={data.rows} query={{bucket:"pending",incomplete:false,q:""}} selected={new Set()} />
      </div>
    </Orbit2026Scope>);
  `);
  const browser = await launch();
  try {
    const page = await open(browser, code, { width: 390 });
    try {
      const tablist = page.getByRole("tablist");
      await tablist.getByRole("tab").last().waitFor();
      const measure = await tablist.evaluate((el) => ({
        tabs: el.querySelectorAll('[role="tab"]').length,
        width: el.getBoundingClientRect().width,
        cardWidth: el.closest('[data-host-people]')!.getBoundingClientRect().width,
        right: el.getBoundingClientRect().right,
        cardRight: el.closest('[data-host-people]')!.getBoundingClientRect().right,
        scrollWidth: el.scrollWidth,
        overflowX: getComputedStyle(el).overflowX,
      }));
      assert.equal(measure.tabs, 4);
      assert.ok(measure.width <= measure.cardWidth, JSON.stringify(measure));
      assert.ok(measure.right <= measure.cardRight, JSON.stringify(measure));
      assert.ok(measure.scrollWidth > measure.width, JSON.stringify(measure));
      assert.equal(measure.overflowX, "auto");
      assert.deepEqual(errorsOf(page), []);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});

test("phone (b13 HM-P1–P3): swipe reveals 待ち / 見送り, 選択 enters selection with a bottom bar, all inside 390", async () => {
  const code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { HostPeopleView } from "./app/(app)/app/orbit-2026/host/HostPeople";
    import { hostTranslator } from "./app/(app)/app/orbit-2026/host/host-model";
    import { Orbit2026Scope } from "./app/(app)/app/orbit-2026/ui";
    import { HOST_EVENT_IDS, hostPeople } from "./shared/mock/demo-world/host-events";
    const data = hostPeople(HOST_EVENT_IDS.roundtable, "pending");
    window.decided = [];
    function App() {
      const [selecting, setSelecting] = React.useState(false);
      const [selected, setSelected] = React.useState(new Set());
      return <Orbit2026Scope language="ja">
        <div style={{width:390,padding:"0 18px",boxSizing:"border-box"}}>
          <HostPeopleView phone language="ja" data={data} t={hostTranslator("ja")} rows={data.rows} query={{bucket:"pending",incomplete:false,q:""}}
            selected={selected} selecting={selecting} onSelecting={(on) => { setSelecting(on); if (!on) setSelected(new Set()); }}
            onSelect={(id) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
            onDecide={(row, decision) => window.decided.push([row.actorId, decision])} onBulk={(decision) => window.decided.push(["bulk", decision])} />
        </div>
      </Orbit2026Scope>;
    }
    createRoot(document.getElementById("root")).render(<App />);
  `);
  const browser = await launch();
  try {
    const page = await open(browser, code, { width: 390 });
    try {
      const face = page.locator("[data-host-row]").first();
      await face.waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
      // 左滑（鼠标拖动同一套 pointer 事件）。
      const box = (await face.boundingBox())!;
      await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width - 140, box.y + box.height / 2, { steps: 8 });
      await page.mouse.move(box.x + box.width - 220, box.y + box.height / 2, { steps: 8 });
      await page.mouse.up();
      assert.equal(await face.getAttribute("data-open"), "true");
      await face.getByRole("button", { name: /見送りにする/ }).click();
      const decided = await page.evaluate(() => (window as unknown as { decided: string[][] }).decided);
      assert.deepEqual(decided[0]![1], "reject");
      // 選択 → 勾一个 → 底部条批准。
      await page.locator("[data-host-select]").click();
      await page.getByRole("checkbox").first().click();
      await page.locator("[data-host-bulk] button").first().click();
      const after = await page.evaluate(() => (window as unknown as { decided: string[][] }).decided);
      assert.deepEqual(after[1], ["bulk", "approve"]);
      assert.deepEqual(errorsOf(page), []);
    } finally { await page.close(); }
  } finally { await browser.close(); }
});
