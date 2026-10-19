import assert from "node:assert/strict";
import test from "node:test";
import type { Browser } from "playwright";

import { bundle, errorsOf, launch, open } from "./support/orbit-2026-harness";
import { SHELL_STUBS } from "./support/orbit-2026-shell-harness";

const current = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const next = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { OrbitAskProvider } from "./app/(app)/app/orbit-global-ask/orbit-ask-context";
    import { Orbit2026Shell } from "./app/(app)/app/orbit-2026/shell/Orbit2026Shell";
    const f = window.shellFixture;
    window.fetch = async (url) => String(url) === "/api/app/version"
      ? Response.json({ success: true, data: { webBuildId: f.nextBuildId } })
      : Response.json({ success: false }, { status: 404 });
    createRoot(document.getElementById("root")).render(<OrbitAskProvider>
      <Orbit2026Shell language="ja" signedIn currentBuildId={f.currentBuildId}><main>Task body</main></Orbit2026Shell>
    </OrbitAskProvider>);
  `, SHELL_STUBS);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

test("the signed-in shell shows the version banner only for a changed live build", async () => {
  const page = await open(browser, code, { html: `<div id="root"></div><script>window.shellFixture=${JSON.stringify({ path: "/app/tasks", lang: "ja", signedIn: true, unread: false, calls: [], currentBuildId: current, nextBuildId: next })}</script>` });
  try {
    const notice = page.getByRole("status", { name: "新しいバージョンがあります" });
    await notice.waitFor();
    assert.equal(await page.getByText("Task body").count(), 1);
    await notice.getByRole("button", { name: "あとで" }).click();
    await notice.waitFor({ state: "detached" });
    assert.deepEqual(errorsOf(page), []);
  } finally {
    await page.close();
  }
});
