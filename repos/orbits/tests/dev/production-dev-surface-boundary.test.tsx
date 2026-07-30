/**
 * `/dev/**` production boundary regression.
 *
 * The route group must fail closed in production so every current and future
 * page/dynamic slug inherits one policy. Development keeps rendering the
 * workbench for local verification.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { shouldHideDevSurface } from "../../app/dev/production-boundary";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const assignedDevPagePaths = [
  "app/dev/agent-test-report/page.tsx",
  "app/dev/capabilities/page.tsx",
  "app/dev/capabilities/[slug]/page.tsx",
  "app/dev/foundation/domain/page.tsx",
  "app/dev/foundation/mock-registry/page.tsx",
  "app/dev/foundation/style/page.tsx",
  "app/dev/knowledge/page.tsx",
  "app/dev/orbit-ai/trace/page.tsx",
] as const;

test("production boundary is fail-closed only for production", () => {
  assert.equal(shouldHideDevSurface("production"), true);
  assert.equal(shouldHideDevSurface("development"), false);
  assert.equal(shouldHideDevSurface("test"), false);
  assert.equal(shouldHideDevSurface(undefined), false);
});

test("all assigned dev pages remain structurally covered by one layout", () => {
  for (const relativePath of assignedDevPagePaths) {
    assert.doesNotThrow(
      () => readFileSync(join(projectRoot, relativePath), "utf8"),
      `${relativePath} must remain below app/dev/layout.tsx`,
    );
  }

  const layoutSource = readFileSync(
    join(projectRoot, "app/dev/layout.tsx"),
    "utf8",
  );

  assert.match(layoutSource, /from "next\/navigation"/);
  assert.match(
    layoutSource,
    /shouldHideDevSurface\(process\.env\.NODE_ENV\)/,
  );
  assert.match(layoutSource, /\bnotFound\(\)/);
  assert.doesNotMatch(layoutSource, /pathname|robots/i);
});

test("style foundation decision specimens are truthfully disabled", () => {
  const pageSource = readFileSync(
    join(projectRoot, "app/dev/foundation/style/page.tsx"),
    "utf8",
  );

  assert.match(pageSource, /Static specimen only/);
  assert.match(
    pageSource,
    /<PrimaryAction disabled>Confirm next step<\/PrimaryAction>/,
  );
  assert.match(
    pageSource,
    /<SecondaryAction disabled>Keep as draft<\/SecondaryAction>/,
  );
  assert.match(
    pageSource,
    /<SecondaryAction disabled>Send externally locked<\/SecondaryAction>/,
  );
});
