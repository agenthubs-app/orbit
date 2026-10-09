import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DESIGN_ICON_OUTPUTS,
  DESIGN_ICON_SOURCE,
  DESIGN_TOKEN_OUTPUTS,
  parseIconBody,
  renderDesignIconOutputs,
} from "../../scripts/design-tokens/generate.mjs";

// R02 (SC-R02-01): shared/design/icons.json is the one icon source. The same
// generator that renders the tokens renders shared/design/icons.ts, which the
// App copies by `npm run sync:contract` and the Web Icon imports directly.
type IconEntry = { body: string; source: "kit" | "drawn"; fill?: string[] };
const icons = JSON.parse(readFileSync(DESIGN_ICON_SOURCE, "utf8")) as Record<string, IconEntry>;
const outputs = renderDesignIconOutputs(icons) as Record<string, string>;

// The design kit's own icons: kit.js `P` (48) and the five ui.css mask icons.
const KIT = "../../docs/designs/redesign-2026-10/kit";
const kitJs = readFileSync(`${KIT}/kit.js`, "utf8");
const KIT_P = Object.fromEntries([...kitJs.slice(kitJs.indexOf("const P = {"), kitJs.indexOf("};", kitJs.indexOf("const P = {"))).matchAll(/(\w+): '([^']*)'/g)].map((m) => [m[1]!, m[2]!]));
const KIT_MASK = ["alert", "trash", "undo", "wifioff", "copy"];

test("the source carries every kit icon, verbatim, marked as kit", () => {
  assert.equal(Object.keys(KIT_P).length, 48);
  for (const [name, body] of Object.entries(KIT_P)) {
    assert.equal(icons[name]?.body, body, `${name} differs from kit.js`);
    assert.equal(icons[name]?.source, "kit");
  }
  const css = readFileSync(`${KIT}/ui.css`, "utf8");
  for (const name of KIT_MASK) {
    assert.match(css, new RegExp(`\\.lic\\.i-${name} \\{`), `${name} is not a kit mask icon`);
    assert.equal(icons[name]?.source, "kit", `${name} (kit ui.css mask) missing`);
    // the mask's data URI, decoded, carries the same geometry
    const uri = decodeURIComponent(css.match(new RegExp(`\\.lic\\.i-${name} \\{ --lic: url\\("data:image/svg\\+xml,([^"]*)"\\)`))![1]!).replace(/'/g, '"');
    const inner = uri.replace(/^<svg[^>]*>|<\/svg>$/g, "").replace(/fill="black"/g, 'fill="currentColor"');
    assert.equal(icons[name]!.body, inner, `${name} differs from the kit mask`);
  }
});

test("every entry follows the contract: body, source, and fill only when a dot is solid", () => {
  for (const [name, entry] of Object.entries(icons)) {
    assert.match(name, /^[a-z]+(?:-[a-z]+)*$/, `${name}: names are lowercase, hyphenated`);
    assert.deepEqual(Object.keys(entry).filter((key) => !["body", "source", "fill"].includes(key)), [], name);
    assert.ok(entry.source === "kit" || entry.source === "drawn", name);
    const solid = entry.body.includes('fill="currentColor"');
    assert.deepEqual(entry.fill, solid ? ["dot"] : undefined, `${name}: fill must mark solid dots`);
    assert.ok(parseIconBody(entry.body).length > 0, `${name} has no shapes`);
  }
  assert.ok(Object.values(icons).filter((entry) => entry.source === "drawn").length > 0);
  for (const name of ["target", "more", "nfc", "list"]) assert.deepEqual(icons[name]!.fill, ["dot"], `${name} has solid dots`);
});

test("bodies parse into path / circle / rect with known attributes only", () => {
  assert.deepEqual(parseIconBody('<path d="M14 6v12" stroke-dasharray="2 2"/><circle cx="12" cy="12" r=".8" fill="currentColor"/><rect x="4" y="4" width="7" height="7" rx="2"/>'), [
    { tag: "path", d: "M14 6v12", strokeDasharray: "2 2" },
    { tag: "circle", cx: 12, cy: 12, r: 0.8, fill: "currentColor" },
    { tag: "rect", x: 4, y: 4, width: 7, height: 7, rx: 2 },
  ]);
  assert.throws(() => parseIconBody('<polyline points="1 2 3"/>'), /unsupported/);
  assert.throws(() => parseIconBody('<path d="M0 0" stroke="red"/>'), /unsupported/);
});

test("icons.ts is byte-identical to what the source renders, and rendering is deterministic", () => {
  assert.deepEqual(Object.keys(outputs), [...DESIGN_ICON_OUTPUTS]);
  for (const [path, content] of Object.entries(outputs)) {
    assert.equal(readFileSync(path, "utf8"), content, `${path} is stale or hand-edited; run npm run design:tokens`);
    assert.match(content.split("\n")[0]!, /由 shared\/design\/icons\.json 生成，禁止手改/);
    assert.doesNotMatch(content, /^\s*import\s/m, "the App copy must stay import-free");
  }
  assert.deepEqual(renderDesignIconOutputs(icons), outputs);
  for (const file of DESIGN_ICON_OUTPUTS) assert.ok(!DESIGN_TOKEN_OUTPUTS.includes(file), "icons do not touch the token outputs");
});

test("icons.ts carries the kit's stroke spec and every icon name", () => {
  const ts = outputs["shared/design/icons.ts"]!;
  assert.match(ts, /viewBox: "0 0 24 24"/);
  assert.match(ts, /strokeWidth: 1\.7/);
  assert.match(ts, /sizes: \[16, 20, 21, 24\]/);
  assert.match(ts, /defaultSize: 20/);
  // kit/ui.css: stroke-width 1.7, 20 default, .sm 16, .lg 24, tab bar 21
  const css = readFileSync(`${KIT}/ui.css`, "utf8");
  assert.match(css, /svg\.i \{ width: 20px; height: 20px; stroke: currentColor; fill: none; stroke-width: 1\.7;/);
  assert.match(css, /\.tabbar button svg\.i \{ width: 21px; height: 21px; \}/);
  for (const name of Object.keys(icons)) assert.ok(ts.includes(`${JSON.stringify(name)}`), `${name} missing from icons.ts`);
});

test("the Ionicons mapping only points at icons that exist", () => {
  const mapping = readFileSync("../../docs/designs/redesign-2026-10/sprints/R02-icons/icon-mapping.md", "utf8");
  const table = mapping.slice(mapping.indexOf("| Ionicons |"), mapping.indexOf("## 补画清单"));
  const targets = [...table.matchAll(/^\| `[\w-]+` \| `([\w-]+)`/gm)].map((m) => m[1]!);
  assert.ok(targets.length > 100, "mapping table rows not found");
  for (const target of targets) assert.ok(icons[target], `mapping points at missing icon ${target}`);
  const drawnList = mapping.slice(mapping.indexOf("## 补画清单"), mapping.indexOf("## 不收进图标集的"));
  const drawn = [...drawnList.matchAll(/^\| `([\w-]+)` \|/gm)].map((m) => m[1]!).sort();
  assert.deepEqual(drawn, Object.keys(icons).filter((name) => icons[name]!.source === "drawn").sort(), "drawn list and source disagree");
});
