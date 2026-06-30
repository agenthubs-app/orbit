/**
 * Capability dashboard 页面测试。
 *
 * 锁住 registry 页到 debug dashboard 的链接和 live handoff 文案。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("capability registry page links to the capability debug dashboard", () => {
  const source = readFileSync(
    join(projectRoot, "app/dev/capabilities/page.tsx"),
    "utf8",
  );

  assert.match(source, /Capability debug dashboard/);
  assert.match(source, /\/dev\/capabilities\/capability-debug-dashboard/);
  assert.match(
    source,
    /all registered\s+capabilities, mock scenarios, API probes, and reset controls/i,
  );
});

test("capability debug dashboard slug is registered in the shared dev route", () => {
  const source = readFileSync(
    join(projectRoot, "app/dev/capabilities/[slug]/page.tsx"),
    "utf8",
  );

  assert.match(source, /CAPABILITY_DEBUG_DASHBOARD_SLUG/);
  assert.match(source, /CapabilityDebugDashboardDemo/);
  assert.match(source, /slug === CAPABILITY_DEBUG_DASHBOARD_SLUG/);
});
