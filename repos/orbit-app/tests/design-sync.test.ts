import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// R01 (RD-08): the design-token constants are generated once in
// orbits/shared/design/tokens.ts and copied here by `npm run sync:contract`.
// The copy must never be edited by hand; src/design/tokens.ts builds the
// React Native structures on top of it.
const appRoot = new URL("..", import.meta.url).pathname;

test("the design-token copy is byte-identical to the generated source", () => {
  const source = join(appRoot, "..", "orbits", "shared", "design", "tokens.ts");
  const copyDir = join(appRoot, "src", "api", "design");
  assert.equal(existsSync(copyDir), true, "run npm run sync:contract to copy the design tokens");
  assert.deepEqual(readdirSync(copyDir).sort(), ["icons.ts", "tokens.ts"], "only the generated constants reach the App, not the JSON sources or the README");
  assert.equal(readFileSync(join(copyDir, "tokens.ts"), "utf8"), readFileSync(source, "utf8"), "src/api/design/tokens.ts was edited by hand or is stale");
});

test("the App palette is the synced design palette, nothing else", async () => {
  const { designColors } = await import("../src/api/design/tokens");
  const { colors, darkColors } = await import("../src/design/tokens");
  assert.deepEqual(colors, designColors.light);
  assert.deepEqual(darkColors, designColors.dark);
});

test("the sync script copies only shared/design/tokens.ts and icons.ts and replaces a stale copy", (t) => {
  const root = mkdtempSync(join(tmpdir(), "orbit-design-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, "orbit-app");
  const shared = join(root, "orbits", "shared");
  mkdirSync(join(app, "scripts"), { recursive: true });
  copyFileSync(join(appRoot, "scripts", "sync-contract.mjs"), join(app, "scripts", "sync-contract.mjs"));
  for (const directory of ["contract", "api-schema", "domain", "compute", "design"]) mkdirSync(join(shared, directory), { recursive: true });
  writeFileSync(join(shared, "contract", "index.ts"), "export type Identifier = string;\n");
  writeFileSync(join(shared, "api-schema", "sample.ts"), "export const version = 1;\n");
  writeFileSync(join(shared, "domain", "industries.ts"), "export const INDUSTRY_IDS = ['other'] as const;\n");
  writeFileSync(join(shared, "domain", "language.ts"), "export const ORBIT_LANGUAGES = ['zh'] as const;\n");
  writeFileSync(join(shared, "compute", "compute-text.ts"), "export const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);\n");
  writeFileSync(join(shared, "design", "tokens.ts"), "export const designColors = { light: { ink: \"#1E1A24\" } } as const;\n");
  writeFileSync(join(shared, "design", "icons.ts"), "export const designIconNames = [\"home\"] as const;\n");
  writeFileSync(join(shared, "design", "tokens.json"), "{}\n");
  writeFileSync(join(shared, "design", "icons.json"), "{}\n");
  writeFileSync(join(shared, "design", "README.md"), "source notes\n");
  const target = join(app, "src", "api", "design");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "tokens.ts"), "export const hand = 'edited';\n");
  writeFileSync(join(target, "stale.ts"), "export const stale = true;\n");

  execFileSync(process.execPath, [join(app, "scripts", "sync-contract.mjs")], { cwd: app });
  assert.deepEqual(readdirSync(target).sort(), ["icons.ts", "tokens.ts"]);
  assert.equal(readFileSync(join(target, "tokens.ts"), "utf8"), readFileSync(join(shared, "design", "tokens.ts"), "utf8"));
  assert.equal(readFileSync(join(target, "icons.ts"), "utf8"), readFileSync(join(shared, "design", "icons.ts"), "utf8"));
});
