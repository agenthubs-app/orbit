import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const repoRoot = new URL("..", import.meta.url).pathname;
const screensRoot = join(repoRoot, "src", "screens");
const allowedDirectClientFiles = new Set([
  join("src", "screens", "settings", "ApiSettingsScreen.tsx")
]);

function sourceFiles(root: string): string[] {
  return readdirSync(root)
    .flatMap((entry) => {
      const fullPath = join(root, entry);
      const stats = statSync(fullPath);

      if (stats.isDirectory()) {
        return sourceFiles(fullPath);
      }

      return /\.(ts|tsx)$/u.test(entry) ? [fullPath] : [];
    })
    .sort();
}

test("action screens use the authenticated Orbit API client", () => {
  const offenders = sourceFiles(screensRoot)
    .filter((filePath) => !allowedDirectClientFiles.has(relative(repoRoot, filePath)))
    .filter((filePath) => {
      const source = readFileSync(filePath, "utf8");
      return /createOrbitApiClient\s*\(/u.test(source);
    })
    .map((filePath) => relative(repoRoot, filePath));

  assert.deepEqual(offenders, []);
});
