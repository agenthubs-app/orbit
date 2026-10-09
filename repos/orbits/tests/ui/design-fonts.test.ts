import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// R01 / RD-09 (SC-R01-06): fonts follow the interface language, load from one
// place, and the serif / mono display faces of the old UI are gone.
function productFiles() {
  const files: string[] = [];
  for (const root of ["app", "features", "shared"]) {
    for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(tsx?|css|mjs)$/.test(entry.name)) continue;
      const path = join(entry.parentPath, entry.name);
      if (path.startsWith("app/dev/") || path === "app/globals.css") continue;
      files.push(path);
    }
  }
  return files;
}

test("web fonts load from the root layout only", () => {
  const loaders: string[] = [];
  for (const path of productFiles()) {
    const text = readFileSync(path, "utf8");
    if (/fonts\.googleapis\.com\/css2/.test(text)) loaders.push(path);
    assert.doesNotMatch(text, /iorbit-starfield\/fonts\/(desktop|mobile)\.css/, `${path} loads the old starfield font sheet`);
  }
  assert.deepEqual(loaders, ["app/layout.tsx"]);
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /family=Noto\+Sans\+JP:wght@400;500;700;800/);
});

test("no product file names the old serif or mono faces", () => {
  const offenders: string[] = [];
  for (const path of productFiles()) {
    const text = readFileSync(path, "utf8");
    for (const face of ["Noto Serif SC", "Newsreader", "JetBrains Mono", "Songti SC"]) {
      if (text.includes(face)) offenders.push(`${path}: ${face}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("the font stack follows <html lang>, Japanese by default", () => {
  const css = readFileSync("app/(app)/app/orbit-2026/tokens.css", "utf8");
  assert.match(css, /--font-ja: "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP"/);
  assert.match(css, /--font-zh: "PingFang SC", "Noto Sans SC"/);
  assert.match(css, /--font: var\(--font-ja\);/);
  assert.match(css, /:root:lang\(zh\) \{\s*--font: var\(--font-zh\);/);
  assert.match(css, /:root:lang\(en\) \{\s*--font: var\(--font-en\);/);
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /import "\.\/\(app\)\/app\/orbit-2026\/tokens\.css";/);
  assert.match(layout, /<html lang=\{htmlLang\}/);
});
