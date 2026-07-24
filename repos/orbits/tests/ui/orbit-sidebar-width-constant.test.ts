/**
 * 侧边栏宽度常量测试。
 *
 * iOrbit 历史侧边栏与（后续）人脉页左侧边栏共用同一初始宽度常量，
 * 保证两处宽度一致；拖拽调宽逻辑不受影响。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../app/(app)/app/orbit-layout-constants";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

test("shared sidebar width constant is a sane pixel value", () => {
  assert.equal(typeof ORBIT_LEFT_SIDEBAR_WIDTH, "number");
  assert.equal(ORBIT_LEFT_SIDEBAR_WIDTH, 248);
});

test("the iOrbit agent page derives its default width from the shared constant", () => {
  const source = readFileSync(
    join(projectRoot, "app/(app)/app/agent/orbit-real-agent.tsx"),
    "utf8",
  );
  assert.ok(source.includes("ORBIT_LEFT_SIDEBAR_WIDTH"));
  assert.ok(
    source.includes(
      "const HISTORY_SIDEBAR_DEFAULT_WIDTH = ORBIT_LEFT_SIDEBAR_WIDTH",
    ),
  );
  // 拖拽 clamp 逻辑必须保留
  assert.ok(source.includes("clampHistorySidebarWidth"));
});
