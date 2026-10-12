import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { PNG } from "pngjs";

import { loadSuite, matchesAny, missingBlocks, selectChanged, selectOnly } from "../../scripts/visual/redesign-pixel-lib.mjs";

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
