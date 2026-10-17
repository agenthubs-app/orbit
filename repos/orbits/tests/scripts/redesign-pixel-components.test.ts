import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import {
  CONTRAST_MAX_UNEXPLAINED, checkContrastBand, compareImages, cropPair, listSpecCellsInPage, loadSuite, parseColor, parseRegion,
  prepareSpecCellInPage, reasonPrefix, resolveContrastSubstitutions,
} from "../../scripts/visual/redesign-pixel-lib.mjs";

// R31a 工具里程碑（SC-R31a-01 / 02）：规格格定位与裁剪、分侧 --region、清单里的 {theme}、[contrast] 归因判定。
const root = new URL("../..", import.meta.url).pathname;
const tokens = JSON.parse(readFileSync(join(root, "shared/design/tokens.json"), "utf8"));
const substitutions = JSON.parse(readFileSync(join(root, "scripts/visual/contrast-substitutions.json"), "utf8"));

type Rgb = [number, number, number];
const mix = (fg: Rgb, bg: Rgb, a: number): Rgb => [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a))) as Rgb;
function canvas(width: number, height: number, bg: Rgb, paint?: (x: number, y: number) => Rgb | null) {
  const p = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const c = paint?.(x, y) ?? bg;
    p.data[i] = c[0]; p.data[i + 1] = c[1]; p.data[i + 2] = c[2]; p.data[i + 3] = 255;
  }
  return p;
}
// 字形样：竖笔画，边缘半覆盖（α 0.25 / 0.5 / 0.75），中间全覆盖——真实抗锯齿文字的样子。
const coverage = (x: number, y: number) => {
  if (y < 8 || y >= 24) return 0;
  const k = x % 12;
  return [0, 0.25, 0.5, 1, 1, 0.75, 0, 0, 0, 0, 0, 0][k];
};
const glyph = (fg: Rgb, bg: Rgb) => (x: number, y: number) => (coverage(x, y) ? mix(fg, bg, coverage(x, y)) : null);
const light = (name: string) => parseColor(tokens.color.light[name]) as Rgb;

test("a suite fills {theme} into the implementation route of each theme", () => {
  const dir = mkdtempSync(join(tmpdir(), "suite-"));
  const file = join(dir, "suite.json");
  writeFileSync(file, JSON.stringify({ defaults: { grid: 30 }, views: [{ id: "A-R31a-confirm-0", design: "01-system.html", section: "c-confirm", cell: 0, path: "/showcase/components/c-confirm-0?theme={theme}", region: "0,120,322,390" }] }));
  const runs = loadSuite(file);
  assert.deepEqual(runs.map((r: { key: string; path: string }) => [r.key, r.path]), [
    ["A-R31a-confirm-0-app-light", "/showcase/components/c-confirm-0?theme=light"],
    ["A-R31a-confirm-0-app-dark", "/showcase/components/c-confirm-0?theme=dark"],
  ]);
});

test("--region takes integers; a separate design region crops each side on its own", () => {
  assert.deepEqual(parseRegion("0,120,322,390"), [0, 120, 322, 390]);
  assert.throws(() => parseRegion("0,120,322"), /x,y,w,h/);
  assert.throws(() => parseRegion("0.5,120,322,390"), /整数/);
  assert.deepEqual(parseRegion("c,c,322,390", { width: 402, height: 874 }), [40, 242, 322, 390], "a centred dialog on a 402×874 device");
  assert.deepEqual(parseRegion("c,b,380,390", { width: 390, height: 844 }), [5, 454, 380, 390], "a sheet on the bottom edge");
  assert.throws(() => parseRegion("c,c,322,390"), /屏幕尺寸/);
  assert.throws(() => parseRegion("0,b,322,390".replace("0", "b")), /x,y,w,h/);
  const design = canvas(60, 60, [255, 255, 255], (x, y) => (x >= 10 && y >= 10 && x < 20 && y < 20 ? [0, 0, 0] : null));
  const app = canvas(60, 60, [255, 255, 255], (x, y) => (x >= 30 && y >= 40 && x < 40 && y < 50 ? [0, 0, 0] : null));
  const same = cropPair({ design, app, region: [10, 10, 10, 10], designRegion: undefined });
  assert.equal(same.design.width, 10);
  assert.equal(same.app.data[0], 255, "one region crops both sides at the same place");
  const split = cropPair({ design, app, region: [30, 40, 10, 10], designRegion: [10, 10, 10, 10] });
  assert.equal(split.design.data[0], 0);
  assert.equal(split.app.data[0], 0, "the implementation rect and the design rect are independent");
});

test("[contrast]: a listed substitution explains the band; an unlisted colour or a mixed-in defect fails", () => {
  const subs = resolveContrastSubstitutions(substitutions, tokens, "light");
  const bg = light("surface");
  const design = canvas(240, 30, bg, glyph(light("ink-3"), bg));
  const listed = checkContrastBand({ design, app: canvas(240, 30, bg, glyph(light("ink-3-text"), bg)), y0: 0, y1: 30, subs });
  assert.ok(listed.diff > 200, `the two colours really differ (${listed.diff} px)`);
  assert.equal(listed.pass, true, JSON.stringify(listed));
  assert.equal(listed.unexplained, 0);

  // 非清单：设计 coral 字 → 实现 ink-2 字（不是 RD-05 的加深替换）。
  const unlisted = checkContrastBand({ design: canvas(240, 30, bg, glyph(light("coral"), bg)), app: canvas(240, 30, bg, glyph(light("ink-2"), bg)), y0: 0, y1: 30, subs });
  assert.equal(unlisted.pass, false);
  assert.ok(unlisted.ratio > CONTRAST_MAX_UNEXPLAINED);

  // 同一带里混一块真实缺陷：实现多出一个 mac-blue 方块（设计稿没有）。
  const defect = canvas(240, 30, bg, (x, y) => (x >= 200 && x < 230 && y >= 6 && y < 26 ? light("mac-blue-ink") : glyph(light("ink-3-text"), bg)(x, y)));
  const mixed = checkContrastBand({ design, app: defect, y0: 0, y1: 30, subs });
  assert.equal(mixed.pass, false, JSON.stringify(mixed));
});

test("the gate accepts a [contrast] band only when the substitution check passes", () => {
  const out = mkdtempSync(join(tmpdir(), "gate-"));
  const bg = light("bg");
  const design = canvas(240, 60, bg, (x, y) => (y < 30 ? glyph(light("ink-3"), bg)(x, y) : glyph(light("ink-3"), bg)(x, y - 30)));
  const app = canvas(240, 60, bg, (x, y) => (y < 30 ? glyph(light("ink-3-text"), bg)(x, y) : glyph(light("coral"), bg)(x, y - 30)));
  const attribution = join(out, "attribution.json");
  writeFileSync(attribution, JSON.stringify({ v: { 0: "[contrast] ink-3 → ink-3-text（RD-05）", 1: "[contrast] 冒充：coral 不在清单里" } }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the lib is untyped JS; the result grows with --grid
  const r: any = compareImages({ design, app, out, grid: 30, gridDy: 0, attributionPath: attribution, viewKey: "v", rawThreshold: Infinity, contrast: { subs: resolveContrastSubstitutions(substitutions, tokens, "light") }, meta: {} });
  assert.equal(r.overBands, 2);
  assert.equal(r.unattributed, 1);
  assert.equal(r.bandsReport.find((b: { band: number }) => b.band === 0).status, "[contrast]");
  assert.match(r.bandsReport.find((b: { band: number }) => b.band === 1).status, /^\[contrast\]✗/);
  assert.equal(r.exitCode, 5);
  assert.equal(reasonPrefix("[raster] 字形"), "[raster]");
  assert.equal(reasonPrefix("[recorded] x"), null);
});

test("contrast-substitutions.json only lists pairs that are in tokens.json color.contrast", () => {
  const pairs = new Set((tokens.color.contrast as string[][]).map(([fg, bg]) => `${fg}|${bg}`));
  assert.ok(Array.isArray(substitutions.substitutions) && substitutions.substitutions.length > 0);
  const seen = new Set();
  for (const s of substitutions.substitutions) {
    const key = `${s.design}|${s.impl}|${s.bg}`;
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
    assert.deepEqual(s.contrast, [s.impl, s.bg], `${key}: contrast must name the implementation pair`);
    assert.ok(pairs.has(`${s.impl}|${s.bg}`), `${s.impl} × ${s.bg} is not in tokens.json color.contrast — add it there first`);
    for (const theme of ["light", "dark"]) for (const name of [s.design, s.impl, s.bg]) assert.ok(tokens.color[theme][name], `${name} missing in ${theme}`);
    assert.notEqual(s.design, s.impl);
  }
});

// 规格格：#<sec2 id> 之后第 n 个格；comp 只取演示区（不截 .doccard）；duo 按主题取 .stage；mini() 缩放格不比。
const SPEC_HTML = `<!doctype html><html><head><style>
  body { margin: 0; font: 12px sans-serif; } .doc { width: 900px; margin: 0 auto; padding-left: .5px; }
  [data-theme=light] { --bg: #f7f5f7; } [data-theme=dark] { --bg: #19181c; }
  .comp { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 18px; } .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .stage { padding: 34px 18px 18px; background: linear-gradient(red, blue); } .cell { display: flex; flex-direction: column; gap: 8px; }
  .box { width: 120px; height: 40px; background: var(--bg); } .doccard { height: 200px; background: #ccc; }
</style></head><body><div class="doc">
  <div class="section-title" id="c-a"><h2>① A</h2></div>
  <div class="comp"><div><div class="duo">${["light", "dark"].map((t) => `<div class="stage" data-theme="${t}"><span class="stage-t">${t}</span><div class="srow"><div class="cell"><div class="cap">cap 1</div><div class="box"></div></div><div class="cell" style="width:150px"><div class="cap">cap 2</div><div class="box" style="height:30px"></div></div></div></div>`).join("")}</div></div><div class="doccard"></div></div>
  <div class="comp"><div><div class="cell"><div class="cap">mini</div><div class="mini" style="width:50px;height:50px"><div style="transform:scale(.5)"><div class="box"></div></div></div></div><div class="cell"><div class="cap">plain</div><div class="box" style="width:80px"></div></div></div><div class="doccard"></div></div>
  <div class="section-title" id="c-b"><h2>② B</h2></div>
  <div class="comp"><div><div class="box"></div></div></div>
</div></body></html>`;

test("spec cells: the nth cell of a section per theme, caption and doc card left out, mini cells refused", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    await page.setContent(SPEC_HTML);
    // tsx 转译 lib 时给具名箭头函数包一层 __name(…)；页面里没有这个助手（CLI 直接用 node 跑，不经 tsx）。
    await page.evaluate("window.__name = (f) => f");
    const light = await page.evaluate(listSpecCellsInPage, { section: "c-a", theme: "light" });
    assert.deepEqual(light.units.map((u: { kind: string; cap: string; mini: boolean }) => [u.kind, u.cap, u.mini]), [["cell", "cap 1", false], ["cell", "cap 2", false], ["cell", "mini", true], ["cell", "plain", false]]);
    assert.deepEqual(light.units[0].rect.slice(2), [120, 40], "the crop is the cell content without its caption");
    const dark = await page.evaluate(listSpecCellsInPage, { section: "c-a", theme: "dark" });
    assert.ok(dark.units[0].rect[0] > light.units[0].rect[0], "dark picks the dark stage");
    assert.equal((await page.evaluate(listSpecCellsInPage, { section: "② B", theme: "light" })).units[0].kind, "demo", "a section can be named by its title too");
    assert.equal(await page.evaluate(listSpecCellsInPage, { section: "nope", theme: "light" }), null);

    const prepared = await page.evaluate(prepareSpecCellInPage, { section: "c-a", cell: 1, theme: "dark", stage: "flat" });
    assert.ok(prepared.rect.every((v: number) => Number.isInteger(v)), `snapped to whole pixels: ${prepared.rect}`);
    assert.deepEqual(prepared.rect.slice(2), [120, 30]);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector(".stage[data-theme=dark]")!).backgroundImage), "none", "flat stage drops the doc-page fog");
    const plain = await page.evaluate(prepareSpecCellInPage, { section: "c-a", cell: 3, theme: "dark", stage: "flat" });
    assert.equal(await page.evaluate(() => document.querySelectorAll(".cell")[5].getAttribute("data-theme")), "dark", "a cell outside a stage takes the theme itself");
    assert.deepEqual(plain.rect.slice(2), [80, 40]);
    await assert.rejects(page.evaluate(prepareSpecCellInPage, { section: "c-a", cell: 2, theme: "light", stage: "flat" }), /mini/);
    await assert.rejects(page.evaluate(prepareSpecCellInPage, { section: "c-a", cell: 9, theme: "light", stage: "flat" }), /格序号/);
  } finally {
    await browser.close();
  }
});
