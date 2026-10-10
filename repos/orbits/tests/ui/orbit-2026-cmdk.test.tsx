import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { orbitAskPageContext } from "../../app/(app)/app/orbit-global-ask/orbit-ask-routes";
import { launch } from "./support/orbit-2026-harness";
import { errorsOf, LEGACY_PAGE, openShell, shellBundle } from "./support/orbit-2026-shell-harness";

// R07 (SC-R07-03): ⌘K / Ctrl+K opens the panel anywhere in the shell (also from a
// text field, never on a plain key); people search; ↵ opens a person; ⌘↵ hands the
// text to iOrbit with the page as context (the floating ask's hand-off).
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await shellBundle(LEGACY_PAGE + `
    window.searches = [];
    window.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      window.searches.push(body.query);
      const results = body.query.includes("Hana") ? [{ id: "r1", contactId: "c1", displayName: "Hana Yamada", organization: "Orbit", role: "Designer" }, { id: "r2", contactId: "c2", displayName: "Hanako Sato", organization: null, role: null }] : [];
      return new Response(JSON.stringify({ success: true, data: { results } }), { status: 200 });
    };
  `);
  browser = await launch();
});
test.after(async () => { await browser?.close(); });

async function shell(t: { after: (fn: () => Promise<void>) => void }, path: string): Promise<Page> {
  const page = await openShell(browser, code, { path });
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByText("legacy button").waitFor();
  return page;
}

const calls = (page: Page) => page.evaluate(() => (window as any).shellFixture.calls.filter((call: object) => "push" in call));

test("Ctrl+K opens it — also from a text field — and a plain k does not", async (t) => {
  const page = await shell(t, "/app/contacts");
  await page.keyboard.press("k");
  assert.equal(await page.getByRole("dialog", { name: "検索と iOrbit" }).count(), 0);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "検索と iOrbit" });
  await dialog.waitFor();
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "combobox", "the field has focus");
  assert.equal(Math.round((await dialog.boundingBox())!.width), 680);
  assert.equal(Math.round((await dialog.boundingBox())!.y), 96);
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  await page.evaluate(() => { const input = document.createElement("input"); input.id = "field"; document.body.append(input); input.focus(); });
  await page.keyboard.press("Meta+k");
  await dialog.waitFor();
});

test("people search: arrows move, ↵ opens the person", async (t) => {
  const page = await shell(t, "/app/home");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Hana");
  await page.getByRole("option", { name: /Hanako Sato/ }).waitFor();
  assert.equal(await page.getByRole("option").count(), 3, "two people and 「iOrbit に聞く」");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.getByRole("option", { selected: true }).getAttribute("id"), await page.getByRole("option", { name: /Hanako Sato/ }).getAttribute("id"));
  await page.keyboard.press("Enter");
  assert.deepEqual(await calls(page), [{ push: "/app/contacts/c2" }]);
  assert.equal(await page.getByRole("dialog").count(), 0);
});

test("⌘↵ hands the text to iOrbit with the page context chip (Japanese too)", async (t) => {
  const page = await shell(t, "/app/contacts/c1");
  await page.keyboard.press("Control+k");
  await page.getByText("表示中：この人").waitFor();
  await page.keyboard.type("来週の会議の準備");
  await page.keyboard.press("Meta+Enter");
  assert.deepEqual(await calls(page), [{ push: "/app/agent" }]);
  assert.equal(orbitAskPageContext("/app/events/e1", "ja"), "このイベント");
  assert.equal(orbitAskPageContext("/app/tasks", "zh"), "我的 Task");
});

test("the shortcut is registered once, in the shell — not in a dialog file the modal gate scans", () => {
  const palette = readFileSync("app/(app)/app/orbit-2026/shell/CommandPalette.tsx", "utf8");
  assert.equal((palette.match(/addEventListener\("keydown"/gu) ?? []).length, 1);
  assert.match(readFileSync("app/(app)/app/orbit-2026/shell/Orbit2026Shell.tsx", "utf8"), /useCommandPaletteShortcut\(/u);
  assert.doesNotMatch(readFileSync("app/(app)/app/orbit-2026/ui/Overlay.tsx", "utf8"), /addEventListener\("keydown"[^)]*\)[^;]*metaKey/u);
});
