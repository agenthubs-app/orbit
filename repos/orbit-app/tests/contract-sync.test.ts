import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

// src/api/contract 是 repos/orbits/shared/contract 的副本。
// App 不在构建期 import ../orbits，但测试可以读它来校验副本没过期
// （与 route-parity.test.ts 读取网页版路由是同一种做法）。
//
// 这个测试红了，说明网页版改了跨端契约而移动端还没跟上：
// 先跑 npm run sync:contract，再修被 typecheck 指出来的 view-model。

const repoRoot = new URL("..", import.meta.url).pathname;
const sourceDir = join(repoRoot, "..", "orbits", "shared", "contract");
const copyDir = join(repoRoot, "src", "api", "contract");

function typeFiles(directory: string): string[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith(".ts"))
    .sort();
}

test("契约副本与 orbits 的源文件同名同数", () => {
  assert.equal(existsSync(sourceDir), true, `找不到契约源目录：${sourceDir}`);
  assert.deepEqual(typeFiles(copyDir), typeFiles(sourceDir));
});

test("契约副本与源逐字一致", () => {
  const drifted = typeFiles(sourceDir).filter(
    (name) =>
      readFileSync(join(sourceDir, name), "utf8") !==
      readFileSync(join(copyDir, name), "utf8"),
  );

  assert.deepEqual(
    drifted,
    [],
    "契约副本已过期，跑 npm run sync:contract 重新同步",
  );
});

test("契约副本保持自包含，可以脱离 orbits 编译", () => {
  const offenders: string[] = [];

  typeFiles(copyDir).forEach((name) => {
    const source = readFileSync(join(copyDir, name), "utf8");

    [...source.matchAll(/from\s+"([^"]+)"/gu)].forEach((match) => {
      const importPath = match[1] ?? "";

      if (!importPath.startsWith("./")) {
        offenders.push(`${name} -> ${importPath}`);
      }
    });
  });

  assert.deepEqual(offenders, []);
});
