import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser } from "playwright";

const root = new URL("..", import.meta.url).pathname;
let browser: Browser;
let script: string;

test.before(async () => {
  const built = await build({
    stdin: { contents: `
      import React from "react";
      import { createRoot } from "react-dom/client";
      import { RootVersionGate } from "./src/components/RootVersionGate";
      const f = window.fixture;
      function App() {
        const [path, setPath] = React.useState("/home");
        window.changePath = setPath;
        const check = React.useCallback(() => new Promise(resolve => f.pending.push(resolve)), []);
        return <RootVersionGate scopeKey={path} check={check}
          blocked={(decision, retry) => <div><p>Blocked {decision.kind}</p><button onClick={retry}>Retry</button></div>}>
          {allowed => <div data-navigator="" style={{ display: allowed ? "block" : "none" }}><p>Private screen {path}</p></div>}
        </RootVersionGate>;
      }
      createRoot(document.getElementById("root")).render(<App />);
    `, resolveDir: root, loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
  });
  script = built.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });

test("root gate checks in the background: screens stay usable while checking, only a block decision hides them", async () => {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.setContent('<div id="root"></div><script>window.fixture={pending:[]}</script>');
    await page.addScriptTag({ content: script });
    // UX-4: no "checking" screen — the navigator is visible while the first check runs.
    await page.getByText("Private screen /home").waitFor();
    assert.equal(await page.locator("[data-navigator]").count(), 1, "the root navigator mounts on the first render");
    await page.evaluate(() => window.fixture.pending.shift()({ kind: "allow" }));
    await page.evaluate(() => window.changePath("/tasks/123"));
    await page.getByText("Private screen /tasks/123").waitFor();
    assert.equal(await page.getByText(/Private screen/).isVisible(), true, "a re-check keeps the last allow decision");
    await page.evaluate(() => window.fixture.pending.shift()({ kind: "force-update", latestAppVersion: "2.0.0" }));
    await page.getByText("Blocked force-update").waitFor();
    assert.equal(await page.getByText(/Private screen/).isVisible(), false);
    await page.getByRole("button", { name: "Retry" }).click();
    assert.equal(await page.getByText(/Private screen/).isVisible(), false, "a retry keeps the block until the new decision arrives");
    await page.evaluate(() => window.fixture.pending.shift()({ kind: "maintenance" }));
    await page.getByText("Blocked maintenance").waitFor();
    await page.getByRole("button", { name: "Retry" }).click();
    await page.evaluate(() => window.fixture.pending.shift()({ kind: "allow" }));
    await page.getByText("Private screen /tasks/123").waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
