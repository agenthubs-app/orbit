import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(import.meta.url), "../../..");
const legacyCatalogue = join(
  projectRoot,
  "features/events/public-catalogue.ts",
);
const migrationReader = join(
  projectRoot,
  "features/events/core/backfill-sources.ts",
);

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/u.test(name) ? [path] : [];
  });
}

function resolvedTypeScriptImport(file: string, specifier: string): string {
  return `${resolve(dirname(file), specifier)}.ts`;
}

test("request-time app and event features cannot import the retired legacy event catalogue", () => {
  const violations: string[] = [];
  for (const file of [
    ...sourceFiles(join(projectRoot, "app")),
    ...sourceFiles(join(projectRoot, "features/events")),
  ]) {
    if (file === legacyCatalogue || file === migrationReader) continue;
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/from\s+["']([^"']*public-catalogue)["']/gu)) {
      const specifier = match[1];
      if (
        specifier?.startsWith(".") &&
        resolvedTypeScriptImport(file, specifier) === legacyCatalogue
      ) {
        violations.push(file.slice(projectRoot.length + 1));
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `Legacy event catalogue imports are migration-only: ${violations.join(", ")}`,
  );

  const landingAdapter = readFileSync(
    join(projectRoot, "app/(app)/app/orbit-landing-route-view-model.ts"),
    "utf8",
  );
  assert.doesNotMatch(
    landingAdapter,
    /(?:export\s+)?function\s+getOrbitLandingViewModel\s*\(/u,
    "The production presentation adapter must not expose a synchronous legacy getter.",
  );
});
