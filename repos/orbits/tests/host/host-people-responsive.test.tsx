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
