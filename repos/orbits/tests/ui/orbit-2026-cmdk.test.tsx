import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { orbitAskPageContext } from "../../app/(app)/app/orbit-global-ask/orbit-ask-routes";
import { launch } from "./support/orbit-2026-harness";
import { errorsOf, LEGACY_PAGE, openShell, shellBundle } from "./support/orbit-2026-shell-harness";

// R07 (SC-R07-03) / R30: ⌘K / Ctrl+K opens the panel anywhere in the shell (also from a
// text field, never on a plain key); one global search (GET /api/search/global); ↵ opens a
// person; ⌘↵ hands the text to iOrbit with the page as context (the floating ask's hand-off).
let browser: Browser;
let code: { js: string; css: string };

test.before(async () => {
  code = await shellBundle(LEGACY_PAGE + `
    window.searches = [];
    // about:blank has no origin: an in-memory sessionStorage lets the test read the iOrbit hand-off.
    const sessionMemory = {};
    Object.defineProperty(window, "sessionStorage", { configurable: true, value: { getItem: (key) => (key in sessionMemory ? sessionMemory[key] : null), setItem: (key, value) => { sessionMemory[key] = String(value); }, removeItem: (key) => { delete sessionMemory[key]; } } });
    const empty = { total: 0, items: [] };
    window.fetch = async (url) => {
      const query = new URL(String(url), "http://local.test").searchParams.get("q") ?? "";
      window.searches.push(query);
      const hit = (contactId, name, org, role) => ({ contactId, name, initial: name[0], org, role, status: null, highlights: [{ field: "title", start: 0, end: 4 }], href: "/app/contacts/" + contactId });
      const people = query.includes("Hana") ? { total: 2, items: [hit("c1", "Hana Yamada", "Orbit", "Designer"), hit("c2", "Hanako Sato", null, null)] } : empty;
      const data = { query, types: ["people", "events"], people, events: empty, semantic: { available: false, enabled: false }, searchedPeople: 2, examples: [], suggestions: [], alternatives: [] };
      return new Response(JSON.stringify({ success: true, data }), { status: 200 });
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

test("global search: one GET per query, arrows move, ↵ opens the person", async (t) => {
  const page = await shell(t, "/app/home");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Hana");
  await page.getByRole("option", { name: /Hanako Sato/ }).waitFor();
  assert.equal(await page.getByRole("option").count(), 3, "two people and 「iOrbit に聞く」");
  assert.equal(await page.getByRole("tab", { name: "会話" }).count(), 0, "no 会話 chip while the account cannot search conversations (A1)");
  await page.keyboard.press("ArrowDown");
  assert.equal(await page.getByRole("option", { selected: true }).getAttribute("id"), await page.getByRole("option", { name: /Hanako Sato/ }).getAttribute("id"));
  await page.keyboard.press("Enter");
  assert.deepEqual(await calls(page), [{ push: "/app/contacts/c2" }]);
  assert.equal(await page.getByRole("dialog").count(), 0);
});

test("⌘↵ only prefills iOrbit's input (DESIGN §1: never sends) — no pending ask is written", async (t) => {
  const page = await shell(t, "/app/contacts/c1");
  await page.keyboard.press("Control+k");
  await page.getByRole("dialog", { name: "検索と iOrbit" }).waitFor();
  await page.keyboard.type("来週の会議の準備");
  await page.keyboard.press("Meta+Enter");
  assert.deepEqual(await calls(page), [{ push: "/app/agent" }]);
  const handOff = await page.evaluate(() => ({ prefill: window.sessionStorage.getItem("orbit.agent.prefill"), pending: window.sessionStorage.getItem("orbit.ask.pending") }));
  assert.deepEqual(JSON.parse(handOff.prefill!), { origin: null, query: "来週の会議の準備", returnTo: "/app/contacts/c1" });
  assert.equal(handOff.pending, null, "a pending ask would be sent on arrival");
  assert.equal(orbitAskPageContext("/app/events/e1", "ja"), "このイベント");
  assert.equal(orbitAskPageContext("/app/tasks", "zh"), "我的 Task");
});

test("the shortcut is registered once, in the shell — not in a dialog file the modal gate scans", () => {
  const palette = readFileSync("app/(app)/app/orbit-2026/shell/CommandPalette.tsx", "utf8");
  assert.equal((palette.match(/addEventListener\("keydown"/gu) ?? []).length, 1);
  assert.match(readFileSync("app/(app)/app/orbit-2026/shell/Orbit2026Shell.tsx", "utf8"), /useCommandPaletteShortcut\(/u);
  assert.doesNotMatch(readFileSync("app/(app)/app/orbit-2026/ui/Overlay.tsx", "utf8"), /addEventListener\("keydown"[^)]*\)[^;]*metaKey/u);
});
