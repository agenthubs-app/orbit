import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { bundle, launch, open } from "./support/orbit-2026-harness";

// R06 gate (RD-18): the new scope is never inside the legacy [data-orbit-real-page]
// scope, and new component files never pull in the legacy styles.
const UI = "app/(app)/app/orbit-2026";
const LEGACY_IMPORTS = /orbit-reference-styles|orbit-reference-primitives|network-0918|0918\/|orbit-real-page|design\/controls|orbit-dev-root|globals\.css/u;

test("new component files import no legacy style modules and never render the legacy scope", () => {
  const offenders: string[] = [];
  for (const root of [UI, "app/showcase/components"]) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(tsx?|css)$/.test(entry.name)) continue;
      const path = join(entry.parentPath, entry.name);
      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(/(?:import|from)\s+["']([^"']+)["']/g)) if (LEGACY_IMPORTS.test(match[1]!)) offenders.push(`${path}: ${match[1]}`);
      if (/data-orbit-real-page/.test(source) && !path.endsWith("Scope.tsx")) offenders.push(`${path}: data-orbit-real-page`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("rendered: the scope sits outside the legacy scope, and nesting it inside is reported", async () => {
  const code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { Orbit2026Scope, Button } from "./${UI}/ui";
    window.logged = [];
    const error = console.error; console.error = (...args) => { window.logged.push(String(args[0])); error(...args); };
    createRoot(document.getElementById("outside")).render(<Orbit2026Scope language="ja"><Button label="ok" /></Orbit2026Scope>);
    createRoot(document.getElementById("inside")).render(<Orbit2026Scope language="ja"><Button label="nested" /></Orbit2026Scope>);
  `);
  const browser = await launch();
  try {
    const page = await open(browser, code, { html: '<div id="outside"></div><div data-orbit-real-page=""><div id="inside"></div></div>' });
    await page.getByRole("button", { name: "nested" }).waitFor();
    assert.equal(await page.evaluate(() => document.querySelector("#outside [data-orbit-2026]")!.closest("[data-orbit-real-page]")), null);
    const logged: string[] = await page.evaluate(() => (window as any).logged);
    assert.equal(logged.filter((line) => line.includes("RD-18")).length, 1, "only the nested one is reported");
  } finally {
    await browser.close();
  }
});
