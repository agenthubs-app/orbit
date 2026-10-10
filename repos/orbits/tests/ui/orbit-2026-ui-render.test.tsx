import assert from "node:assert/strict";
import test from "node:test";
import type { Browser, Page } from "playwright";

import { bundle, contrast, errorsOf, launch, open } from "./support/orbit-2026-harness";

// R06 (SC-R06-01 / 02 / 04): the real component library, rendered through the
// showcase page in Chromium with the shipped CSS Modules and tokens.
let browser: Browser;
let code: { js: string; css: string };

// Every element with its own text, its colour, and the first opaque background up
// the tree. A plain script string: tsx would wrap named helpers in __name().
const TEXT_SAMPLES = `(() => {
  const opaque = (value) => value && value !== "transparent" && !/rgba\\([^)]*,\\s*0\\)$/.test(value);
  const out = [];
  for (const el of document.querySelectorAll("[data-orbit-2026] *")) {
    const own = [...el.childNodes].filter((node) => node.nodeType === 3 && node.textContent.trim()).map((node) => node.textContent.trim()).join(" ");
    if (!own || el.closest("[disabled], [aria-hidden='true']")) continue;
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) < 1) continue;
    let node = el, background = "";
    while (node) { const bg = getComputedStyle(node).backgroundColor; if (opaque(bg)) { background = bg; break; } node = node.parentElement; }
    out.push({ text: own.slice(0, 30), color: style.color, background: background || getComputedStyle(document.body).backgroundColor, size: parseFloat(style.fontSize), weight: Number(style.fontWeight) });
  }
  return out;
})()`;

test.before(async () => {
  code = await bundle(`
    import React from "react";
    import { createRoot } from "react-dom/client";
    import { ComponentShowcase } from "./app/showcase/components/ComponentShowcase";
    createRoot(document.getElementById("root")).render(<ComponentShowcase language={new URLSearchParams(location.search).get("lang") || "ja"} />);
  `);
  browser = await launch();
});

test.after(async () => { await browser?.close(); });

async function showcase(t: { after: (fn: () => Promise<void>) => void }, options: Parameters<typeof open>[2] = {}): Promise<Page> {
  const page = await open(browser, code, options);
  t.after(async () => { const errors = errorsOf(page); await page.close(); assert.deepEqual(errors, []); });
  await page.getByRole("heading", { name: "Button" }).waitFor();
  return page;
}

test("every component family renders inside one new scope, never inside the legacy one", async (t) => {
  const page = await showcase(t);
  for (const name of ["Button", "Card · Chip · Avatar · MacTile · Kbd", "ListRow (hover actions)", "SearchField · TextField · Accordion · Table", "Toast (max 3 · error stays · undo bar)", "Modal · ConfirmDialog · Drawer · Popover · ContextMenu", "ConfirmCard · WhyDisclosure", "Toggle · Check · Segmented · Filters", "Progress · Ring · CountUp", "States"]) {
    assert.equal(await page.getByRole("heading", { name, exact: true }).count(), 1, name);
  }
  assert.equal(await page.locator("[data-orbit-2026]").count(), 1);
  assert.equal(await page.locator("[data-orbit-real-page] [data-orbit-2026], [data-orbit-2026] [data-orbit-real-page]").count(), 0);
  // The new button carries `btn` (legacy ratchet) and the token-driven style.
  const save = page.getByRole("button", { name: "保存" }).first();
  assert.match((await save.getAttribute("class"))!, /(^|\s)btn(\s|$)/u);
  assert.equal(await save.evaluate((el) => getComputedStyle(el).borderRadius), "999px");
});

for (const dark of [false, true]) {
  test(`${dark ? "dark" : "light"}: every visible text meets 4.5:1 on its background (3:1 for large text)`, async (t) => {
    const page = await showcase(t, { dark });
    const samples: { text: string; color: string; background: string; size: number; weight: number }[] = await page.evaluate(TEXT_SAMPLES);
    assert.ok(samples.length > 60, `${samples.length} text samples`);
    const failing = samples.filter((sample) => {
      const large = sample.size >= 24 || (sample.size >= 18.66 && sample.weight >= 700);
      return contrast(sample.color, sample.background) < (large ? 3 : 4.5);
    }).map((sample) => `${sample.text} ${sample.color} on ${sample.background} = ${contrast(sample.color, sample.background).toFixed(2)}`);
    assert.deepEqual(failing, []);
  });
}

test("keyboard: Tab reaches the controls with a visible focus ring; arrows move the segmented control; Space flips a switch", async (t) => {
  const page = await showcase(t);
  for (let index = 0; index < 12; index += 1) {
    await page.keyboard.press("Tab");
    const ring = await page.evaluate(() => { const el = document.activeElement as HTMLElement; const s = getComputedStyle(el); return { tag: el.tagName, outline: s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0 }; });
    assert.ok(ring.outline, `focus ${index} on ${ring.tag} has no visible ring`);
  }
  const segment = page.getByRole("tablist", { name: "Task" });
  await segment.getByRole("tab", { selected: true }).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await segment.getByRole("tab", { selected: true }).textContent(), "プラン");
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), "プラン");
  await page.keyboard.press("End");
  assert.equal(await segment.getByRole("tab", { selected: true }).textContent(), "メモ");
  const toggle = page.getByRole("switch", { name: "通知を許可する" });
  await toggle.focus();
  await page.keyboard.press("Space");
  assert.equal(await toggle.getAttribute("aria-checked"), "false");
});

test("「完了」 is ok green: the completion check and the completed chip", async (t) => {
  const page = await showcase(t);
  const ok = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ok").trim());
  const check = page.getByRole("checkbox", { name: "完了にする" });
  assert.equal(await check.getAttribute("aria-checked"), "true");
  const mark = await check.evaluate((el) => getComputedStyle(el.firstElementChild!).backgroundColor);
  const expected = await page.evaluate((value) => { const probe = document.createElement("i"); probe.style.color = value; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; }, ok);
  assert.equal(mark, expected);
  const chipBg = await page.getByText("完了", { exact: true }).evaluate((el) => getComputedStyle(el).backgroundColor);
  const okSoft = await page.evaluate(() => { const probe = document.createElement("i"); probe.style.color = "var(--ok-soft)"; document.body.append(probe); const color = getComputedStyle(probe).color; probe.remove(); return color; });
  assert.equal(chipBg, okSoft);
});

test("row hover actions: hidden until hover or focus on desktop, always shown and ≥44 at 390", async (t) => {
  const desktop = await showcase(t);
  const action = desktop.getByRole("button", { name: /^完了にする Hana Yamada$/ });
  assert.equal(await action.evaluate((el) => getComputedStyle(el.parentElement!).opacity), "0");
  await desktop.getByRole("button", { name: /Hana Yamada/ }).first().hover();
  await desktop.waitForTimeout(250);
  assert.equal(await action.evaluate((el) => getComputedStyle(el.parentElement!).opacity), "1");
  const narrow = await showcase(t, { width: 390 });
  const small = narrow.getByRole("button", { name: /^完了にする Hana Yamada$/ });
  assert.equal(await small.evaluate((el) => getComputedStyle(el.parentElement!).opacity), "1");
  const box = (await small.boundingBox())!;
  assert.ok(box.width >= 44 && box.height >= 44);
});

test("drawer widths follow the breakpoints: lg 600 (520 under 1280), md 520, sm 380", async (t) => {
  for (const [width, size, expected] of [[1440, "lg", 600], [1440, "md", 520], [1440, "sm", 380], [1024, "lg", 520], [1024, "sm", 380], [390, "lg", 362]] as const) {
    const page = await showcase(t, { width });
    await page.getByRole("button", { name: `drawer ${size}` }).click();
    const box = (await page.getByRole("dialog").boundingBox())!;
    assert.equal(Math.round(box.width), expected, `${width} ${size}`);
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
  }
});

test("Reduce Motion: dialogs and toasts only fade; nothing moves or counts", async (t) => {
  for (const options of [{ reducedMotion: true }, {}] as const) {
    const page = await showcase(t, options);
    if (!("reducedMotion" in options)) await page.getByRole("switch", { name: "reduce motion" }).click();
    await page.getByRole("button", { name: "modal 480" }).click();
    const moves = await page.getByRole("dialog").evaluate((el) => el.getAnimations().flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes()).filter((frame) => "transform" in frame || "translate" in frame || "scale" in frame).length);
    assert.equal(moves, 0, JSON.stringify(options));
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "error" }).click();
    const toastMoves = await page.locator('[role="alert"][data-kind="error"]').evaluate((el) => el.getAnimations().flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes()).filter((frame) => "transform" in frame).length);
    assert.equal(toastMoves, 0);
    assert.equal(await page.locator("[role=progressbar] i").first().evaluate((el) => el.getAnimations().length), 0, "skeleton shimmer stops");
  }
  // Without Reduce Motion the dialog does move in (the check above is not vacuous).
  const moving = await showcase(t);
  await moving.getByRole("button", { name: "modal 480" }).click();
  assert.ok(await moving.getByRole("dialog").evaluate((el) => el.getAnimations().flatMap((animation) => (animation.effect as KeyframeEffect).getKeyframes()).some((frame) => "transform" in frame)));
});

test("three widths × two themes fit without horizontal scroll", async (t) => {
  for (const width of [1440, 1024, 390]) for (const dark of [false, true]) {
    const page = await showcase(t, { width, dark });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${width} ${dark}`);
    if (process.env.ORBIT_2026_SCREENSHOTS) await page.screenshot({ path: `${process.env.ORBIT_2026_SCREENSHOTS}/showcase-${dark ? "dark" : "light"}-${width}.png`, fullPage: true });
  }
});
