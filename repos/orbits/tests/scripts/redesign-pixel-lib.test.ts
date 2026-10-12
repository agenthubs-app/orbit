import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { bandReport, diffStyles, loadSuite, matchesAny, missingBlocks, selectChanged, selectOnly } from "../../scripts/visual/redesign-pixel-lib.mjs";

// 门禁提速（2026-10-12）：画面清单展开、--only 前缀、--changed 的 glob、缺块检测。
function suiteFile() {
  const dir = mkdtempSync(join(tmpdir(), "suite-"));
  const file = join(dir, "suite.json");
  writeFileSync(file, JSON.stringify({
    defaults: { grid: 100 },
    sources: ["repos/orbits/app/(app)/app/orbit-2026/shell/**"],
    views: [
      { id: "W-R07-01L", width: 1440, design: "web.html" },
      { id: "W-R07-01L", width: 1024, design: "b12-missing-states.html" },
      { id: "W-R07-01H", width: 1440, design: "web.html", themes: ["light"], sources: ["repos/orbits/app/(app)/app/orbit-2026/home/*.tsx"] },
    ],
  }));
  return file;
}

test("a suite expands every view per theme into the attribution keys", () => {
  const runs = loadSuite(suiteFile());
  assert.deepEqual(runs.map((r: { key: string }) => r.key), ["W-R07-01L-1440-light", "W-R07-01L-1440-dark", "W-R07-01L-1024-light", "W-R07-01L-1024-dark", "W-R07-01H-1440-light"]);
  assert.equal(runs[0].grid, 100, "defaults apply");
});

test("--only matches an id across widths and themes, or one width", () => {
  const runs = loadSuite(suiteFile());
  assert.equal(selectOnly(runs, "W-R07-01L").length, 4);
  assert.deepEqual(selectOnly(runs, "W-R07-01L-1024, W-R07-01H").map((r: { key: string }) => r.key), ["W-R07-01L-1024-light", "W-R07-01L-1024-dark", "W-R07-01H-1440-light"]);
  assert.equal(selectOnly(runs, "W-R07-0").length, 0, "a prefix must end at a key boundary");
});

test("--changed picks views by their sources, the suite's shared sources and their design file", () => {
  const runs = loadSuite(suiteFile());
  const design = "docs/designs/redesign-2026-10";
  assert.equal(selectChanged(runs, ["repos/orbits/app/(app)/app/orbit-2026/shell/shell.module.css"], design).length, 5);
  assert.deepEqual(selectChanged(runs, ["repos/orbits/app/(app)/app/orbit-2026/home/HomePlaceholder.tsx"], design).map((r: { key: string }) => r.key), ["W-R07-01H-1440-light"]);
  assert.equal(selectChanged(runs, [`${design}/b12-missing-states.html`], design).length, 2);
  assert.equal(selectChanged(runs, [`${design}/kit/ui.css`], design).length, 5);
  assert.equal(selectChanged(runs, ["repos/orbits/app/(app)/app/orbit-2026/home/sub/deep.tsx"], design).length, 0, "* does not cross directories");
  assert.ok(matchesAny("a/b/c.ts", ["a/**"]) && !matchesAny("a.ts", ["a/**"]));
});

function png(width: number, height: number, paint?: (x: number, y: number) => boolean) {
  const p = new PNG({ width, height });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const ink = paint?.(x, y) ?? false;
    p.data[i] = p.data[i + 1] = p.data[i + 2] = ink ? 40 : 250;
    p.data[i + 3] = 255;
  }
  return p;
}

test("a missing block is reported even when the whole picture barely differs; same content is not", () => {
  // 380×80 white strip; the design has a 200×20 text-like block the implementation lacks (raw ≈ 0.05 of the strip).
  const text = (x: number, y: number) => x >= 30 && x < 230 && y >= 30 && y < 50 && (x + y) % 3 === 0;
  const missing = missingBlocks(png(380, 80, text), png(380, 80));
  assert.ok(missing.length >= 1);
  assert.ok(missing[0].x <= 48 && missing[0].x + missing[0].w >= 200, JSON.stringify(missing));
  assert.deepEqual(missingBlocks(png(380, 80, text), png(380, 80, text)), []);
});

test("the band report says how far a band moved and whether a side is empty", () => {
  const glyph = (dx: number) => (x: number, y: number) => x >= 40 + dx && x < 90 + dx && y >= 10 && y < 20;
  const cells = [{ band: 0, y0: 0, y1: 30, mismatch: 0.1 }];
  const [moved] = bandReport({ design: png(200, 30, glyph(0)), app: png(200, 30, glyph(3)), cells, threshold: 0.02, attribution: { 0: "[data] 名前" } });
  assert.equal(moved.dx, 3);
  assert.equal(moved.dy, 0);
  assert.equal(moved.status, "[data]");
  const [empty] = bandReport({ design: png(200, 30, glyph(0)), app: png(200, 30), cells, threshold: 0.02 });
  assert.equal(empty.dx, "缺内容");
  assert.equal(empty.status, "未归因");
});

test("style diff pairs elements by key and reports only real differences", () => {
  const el = (key: string, box: number[], style: Record<string, string>) => ({ key, tag: "a", box, style });
  const design = [el('"ホーム"', [10, 10, 30, 16], { "font-size": "10.5px", color: "rgb(0, 0, 0)" }), el('"佐"', [10, 900, 40, 40], {})];
  const app = [el('"ホーム"', [10.6, 13, 30, 16], { "font-size": "10.8px", color: "rgb(0, 0, 0)" })];
  const diff = diffStyles(design, app);
  assert.deepEqual(diff.rows.map((r: { prop: string }) => r.prop), ["box.y"], "0.6px position and 0.3px size are within tolerance; 3px is not");
  assert.deepEqual(diff.unmatched, ['"佐"']);
});
