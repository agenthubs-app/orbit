import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

let browser: Browser, script: string;
// Real picker + DOM/RNW interaction; only locale/theme boundaries are fixed in
// the native component fixture. No actor/API/runtime acceptance is claimed here.
test.before(async () => {
  const result = await build({
    stdin: { contents: `
import React, { useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { PersonalScheduleDateTimePicker } from "./src/screens/schedule/PersonalScheduleDateTimePicker";
const listeners = new Set(); let revision = 0;
const state = window.fixture = { kind: "date", draft: "2027-02-15", zone: "Asia/Tokyo", language: "zh", disabled: false, open: false, record: 1, ...window.initialFixture,
  update(patch) { Object.assign(state, patch); revision++; listeners.forEach(fn => fn()); } };
function App() {
  useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => revision);
  return <><button aria-label="Open" onClick={() => state.update({ open: true })}>Open</button><output id="draft">{state.draft}</output>{state.open ? <PersonalScheduleDateTimePicker key={state.record + ":" + state.kind} kind={state.kind} value={state.draft} zone={state.zone} disabled={state.disabled} onCancel={() => state.update({ open: false })} onConfirm={draft => { if (!state.disabled) state.update({ draft, open: false }); }} /> : null}</>;
}
createRoot(document.getElementById("root")).render(<App />);
`, loader: "tsx", resolveDir: process.cwd() },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    plugins: [{ name: "picker-platform", setup(p) {
      p.onResolve({ filter: /^react-native$/ }, () => ({ path: "react-native-web", external: false, namespace: "native-picker" }));
      p.onLoad({ filter: /.*/, namespace: "native-picker" }, () => ({ contents: 'export * from "react-native-web";', resolveDir: process.cwd(), loader: "js" }));
      p.onResolve({ filter: /\/(theme|OrbitLocaleContext)$/ }, () => ({ path: "picker-boundary", namespace: "picker-fixture" }));
      p.onLoad({ filter: /.*/, namespace: "picker-fixture" }, () => ({ contents: 'import { createTranslator } from "./src/i18n/messages"; export const useOrbitLocale = () => ({ language: window.fixture.language, t: createTranslator(window.fixture.language) }); export const createThemedStyles = factory => () => ({ styles: factory({ text: "#111", text3: "#555", surface: "#fff", surface2: "#eee", accent: "#176", border: "#ddd" }) });', loader: "js", resolveDir: process.cwd() }));
    } }],
  });
  script = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
test.after(async () => { await browser?.close(); });
async function open(t: { after(fn: () => Promise<void>): void }, patch: Record<string, unknown> = {}) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  page.setDefaultTimeout(1800);
  t.after(async () => { await page.close(); assert.deepEqual(errors, []); });
  await page.route("**/*", route => route.abort());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(patch => { (window as any).initialFixture = patch; }, patch);
  await page.addScriptTag({ content: script });
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  return page;
}
async function draft(page: Page) { return page.locator("#draft").textContent(); }

test("unavailable zone is read-only instead of throwing away the picker", async t => {
  const page = await open(t, { zone: "invalid" });
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).isDisabled(), true);
  assert.equal(await draft(page), "2027-02-15");
});

test("calendar navigation and confirm actions retain forty-four-pixel touch targets", async t => {
  const page = await open(t);
  for (const name of ["上个月", "下个月", "完成"]) {
    const box = await page.getByRole("dialog").getByRole("button", { name, exact: true }).boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44, name + ": " + JSON.stringify(box));
  }
});

test("calendar offers real leap days, navigation stages no change, confirmation applies only selection", async t => {
  const page = await open(t);
  assert.equal(await page.getByRole("button", { name: "2027-02-29", exact: true }).count(), 0);
  await page.evaluate(() => (window as any).fixture.update({ record: 2, draft: "2028-02-15" }));
  await page.getByRole("button", { name: "2028-02-29", exact: true }).waitFor();
  await page.getByRole("button", { name: "下个月", exact: true }).click();
  assert.equal(await draft(page), "2028-02-15");
  await page.getByRole("button", { name: "上个月", exact: true }).click();
  await page.getByRole("button", { name: "2028-02-29", exact: true }).click();
  assert.equal(await draft(page), "2028-02-15");
  await page.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).click();
  assert.equal(await draft(page), "2028-02-29");
});

test("time stages arbitrary minutes and disabled confirmation cannot apply them", async t => {
  const page = await open(t, { kind: "time", draft: "09:37" });
  assert.equal(await page.getByRole("radio", { name: "mm 37", exact: true }).getAttribute("aria-checked"), "true");
  await page.getByRole("radio", { name: "mm 38", exact: true }).click();
  assert.equal(await draft(page), "09:37");
  await page.evaluate(() => (window as any).fixture.update({ disabled: true }));
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: "完成", exact: true }).isDisabled(), true);
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await draft(page), "09:37");
});

test("hour and minute groups have localized accessible names", async t => {
  for (const [language, hour, minute, cancel] of [["zh", "小时", "分钟", "取消"], ["en", "Hour", "Minute", "Cancel"], ["ja", "時", "分", "キャンセル"]]) {
    const page = await open(t, { kind: "time", draft: "09:37", language });
    assert.equal(await page.getByRole("radiogroup", { name: hour, exact: true }).count(), 1);
    assert.equal(await page.getByRole("radiogroup", { name: minute, exact: true }).count(), 1);
    await page.getByRole("dialog").getByRole("button", { name: cancel, exact: true }).click();
    assert.equal(await draft(page), "09:37");
  }
});

test("stored minute is initially visible in its scroll column", async t => {
  const page = await open(t, { kind: "time", draft: "09:37" });
  await page.waitForTimeout(350);
  const box = await page.getByRole("radio", { name: "mm 37", exact: true }).boundingBox();
  assert.ok(box && box.y >= 0 && box.y + box.height <= 844, `selected minute stays on screen: ${JSON.stringify(box)}`);
});
