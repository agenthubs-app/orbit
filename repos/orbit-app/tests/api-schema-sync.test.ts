import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const appRoot = new URL("..", import.meta.url).pathname;
const sourceDir = join(appRoot, "..", "orbits", "shared", "api-schema");
const copyDir = join(appRoot, "src", "api", "schema");

function schemaFiles(directory: string): string[] {
  return existsSync(directory)
    ? readdirSync(directory).filter((name) => name.endsWith(".ts")).sort()
    : [];
}

test("API Schema 副本与服务端真源保持逐字一致", () => {
  assert.equal(existsSync(sourceDir), true, `找不到 Schema 真源：${sourceDir}`);
  assert.equal(existsSync(copyDir), true, `找不到 Schema 副本：${copyDir}`);
  assert.deepEqual(schemaFiles(copyDir), schemaFiles(sourceDir));

  const drifted = schemaFiles(sourceDir).filter(
    (name) =>
      readFileSync(join(sourceDir, name), "utf8") !==
      readFileSync(join(copyDir, name), "utf8"),
  );

  assert.deepEqual(drifted, [], "API Schema 副本已过期，请运行 npm run sync:contract");
});
