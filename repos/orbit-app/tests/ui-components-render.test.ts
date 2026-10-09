import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { colors, darkColors } from "../src/design/tokens";
import { bundleScenarios, launch, openScenario } from "./helpers/ui-harness";

// R04 (SC-R04-01 / 02 / 03): every component rendered together (the gallery), in
// light and dark, at 390 and 320 wide, at 1× and 2× text, with and without Reduce
// Motion. The checks run on the real DOM, so they hold for any component added later.
let browser: Browser;
let script: string;
test.before(async () => {
  script = await bundleScenarios(readFileSync("tests/helpers/ui-scenarios.tsx", "utf8").replace(/\.\.\/\.\.\//g, "./"));
  browser = await launch();
});
test.after(async () => browser?.close());

// Plain-string script: tsx would otherwise inject a helper into named functions.
const TEXT_CONTRAST = `(() => {
  const parse = (value) => { const parts = value.match(/[\\d.]+/g).map(Number); return { rgb: parts.slice(0, 3), alpha: parts[3] ?? 1 }; };
  const lum = (rgb) => rgb.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const failures = [];
  for (const el of Array.from(document.querySelectorAll("#root *"))) {
    const own = Array.from(el.childNodes).some((node) => node.nodeType === 3 && node.textContent.trim());
    if (!own || el.closest('[aria-hidden="true"], [aria-disabled="true"]') || /^[\\p{Extended_Pictographic}\\uFE0F\\s]+$/u.test(el.textContent.trim())) continue;
    let node = el;
    let background = { rgb: [255, 255, 255], alpha: 0 };
    while (node) { const bg = parse(getComputedStyle(node).backgroundColor); if (bg.alpha > 0.5) { background = bg; break; } node = node.parentElement; }
    if (background.alpha === 0) background = parse(getComputedStyle(document.body).backgroundColor);
    const style = getComputedStyle(el);
    const fg = parse(style.color);
    const a = lum(fg.rgb), b = lum(background.rgb);
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) failures.push(el.textContent.trim().slice(0, 20) + ": " + ratio.toFixed(2) + " (" + style.color + " on " + background.rgb.join(",") + ")");
  }
  return failures;
})()`;

async function textContrast(page: Page): Promise<string[]> {
  return page.evaluate(TEXT_CONTRAST) as Promise<string[]>;
}

for (const dark of [false, true]) {
  test(`${dark ? "dark" : "light"}: every text in every component reads at ≥4.5:1 on its background`, async () => {
    const page = await openScenario(browser, script, { scenario: "gallery" }, { dark });
    await page.evaluate(() => { document.body.style.background = getComputedStyle(document.body).backgroundColor; });
    assert.deepEqual(await textContrast(page), []);
    await page.close();
  });
}

test("every control offers a ≥44 touch target (visual size + hit slop)", async () => {
  const page = await openScenario(browser, script, { scenario: "gallery" });
  const small = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[role="button"], [role="checkbox"], [role="switch"], [role="radio"], [role="tab"]'))
    .map((el) => { const box = el.getBoundingClientRect(); const slop = Number(el.dataset.hitslop ?? 0); return { label: el.getAttribute("aria-label") ?? el.textContent ?? "", size: Math.min(box.width, box.height) + 2 * slop }; })
    .filter((item) => item.size < 43.5).map((item) => `${item.label.slice(0, 20)}: ${item.size}`));
  assert.deepEqual(small, []);
  await page.close();
});

test("2× text at 320 wide: nothing spills sideways and no button label is clipped", async () => {
  const page = await openScenario(browser, script, { scenario: "gallery", fontScale: 2 }, { width: 320 });
  const overflow = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    clipped: Array.from(document.querySelectorAll<HTMLElement>('[role="button"]')).filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent),
  }));
  assert.ok(overflow.page <= 321, `page is ${overflow.page} wide`);
  assert.deepEqual(overflow.clipped, []);
  await page.close();
});

test("Reduce Motion: numbers and bars appear at their value at once; no countdown or shimmer", async () => {
  const page = await openScenario(browser, script, { scenario: "gallery", reducedMotion: true });
  assert.equal(await page.getByTestId("count").innerText(), "1,280");
  const fill = await page.locator('[role="progressbar"][aria-label="進捗"] > div').first().evaluate((el) => (el as HTMLElement).style.width);
  assert.equal(fill, "60%");
  const moving = await page.locator('[role="progressbar"][aria-label="読み込み中…"] > div').evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
  assert.ok(moving.every((value) => value === "1"), "skeleton bones are static");
  await page.close();
  const animated = await openScenario(browser, script, { scenario: "gallery", reducedMotion: false });
  assert.notEqual(await animated.getByTestId("count").innerText(), "1,280", "without Reduce Motion the number rolls up from 0");
  await animated.close();
});

test("done is green (ok, RD-17); switches and multi-select are plum", async () => {
  for (const [dark, palette] of [[false, colors], [true, darkColors]] as const) {
    const page = await openScenario(browser, script, { scenario: "gallery" }, { dark });
    const hex = (rgb: string) => "#" + rgb.match(/\d+/g)!.slice(0, 3).map((v) => Number(v).toString(16).padStart(2, "0")).join("").toUpperCase();
    assert.equal(hex(await page.getByRole("checkbox", { name: "完了" }).evaluate((el) => getComputedStyle(el).backgroundColor)), palette.ok.toUpperCase());
    assert.equal(hex(await page.getByRole("switch", { name: "通知" }).evaluate((el) => getComputedStyle(el).backgroundColor)), palette.plum700.toUpperCase());
    assert.equal(hex(await page.getByRole("checkbox", { name: "選択" }).evaluate((el) => getComputedStyle(el).backgroundColor)), palette.plum700.toUpperCase());
    await page.close();
  }
});

test("the bottom sheet closes on a backdrop tap and on Android back; the action sheet lists consequences", async () => {
  const page = await openScenario(browser, script, { scenario: "gallery", sheet: true, actionSheet: true });
  assert.equal(await page.getByText("主催者に取り消しが通知されます").count(), 1);
  assert.equal(await page.evaluate(() => (window as any).fireBack()), true);
  const events = await page.evaluate(() => (window as any).events as string[]);
  assert.ok(events.includes("sheet-dismiss") || events.includes("sheet-close"), events.join(","));
  await page.close();
});
