import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const appRoot = new URL("..", import.meta.url).pathname;
const dictionaryFiles = ["industries.ts", "language.ts"];

test("运行时字典仅同步行业和语言，且与服务端逐字一致", () => {
  const sourceDir = join(appRoot, "..", "orbits", "shared", "domain");
  const copyDir = join(appRoot, "src", "api", "domain");
  assert.equal(existsSync(copyDir), true, "运行 npm run sync:contract 同步受控字典");
  assert.deepEqual(readdirSync(copyDir).sort(), dictionaryFiles);

  for (const name of dictionaryFiles) {
    assert.equal(readFileSync(join(copyDir, name), "utf8"), readFileSync(join(sourceDir, name), "utf8"));
  }
});

test("同步命令不会复制未授权的 domain 文件，并清理过期副本", (t) => {
  const root = mkdtempSync(join(tmpdir(), "orbit-domain-sync-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const app = join(root, "orbit-app");
  const source = join(root, "orbits", "shared");
  mkdirSync(join(app, "scripts"), { recursive: true });
  copyFileSync(join(appRoot, "scripts", "sync-contract.mjs"), join(app, "scripts", "sync-contract.mjs"));
  for (const directory of ["contract", "api-schema", "domain"]) {
    mkdirSync(join(source, directory), { recursive: true });
  }
  writeFileSync(join(source, "contract", "index.ts"), "export type Identifier = string;\n");
  writeFileSync(join(source, "api-schema", "sample.ts"), "export const version = 1;\n");
  writeFileSync(join(source, "domain", "industries.ts"), "export const INDUSTRY_IDS = ['other'] as const;\n");
  writeFileSync(join(source, "domain", "language.ts"), "export const ORBIT_LANGUAGES = ['zh'] as const;\n");
  writeFileSync(join(source, "domain", "server-only.ts"), "export const privateRuntime = true;\n");
  const target = join(app, "src", "api", "domain");
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, "stale.ts"), "export const stale = true;\n");

  for (let run = 0; run < 2; run += 1) {
    execFileSync(process.execPath, [join(app, "scripts", "sync-contract.mjs")], { cwd: app });
    assert.deepEqual(readdirSync(target).sort(), dictionaryFiles);
    assert.equal(readFileSync(join(target, "industries.ts"), "utf8"), "export const INDUSTRY_IDS = ['other'] as const;\n");
    assert.equal(readFileSync(join(target, "language.ts"), "utf8"), "export const ORBIT_LANGUAGES = ['zh'] as const;\n");
    assert.equal(readFileSync(join(app, "src", "api", "contract", "index.ts"), "utf8"), "export type Identifier = string;\n");
    assert.equal(readFileSync(join(app, "src", "api", "schema", "sample.ts"), "utf8"), "export const version = 1;\n");
  }
});
