/**
 * 侧边栏宽度单一来源测试。
 *
 * iOrbit 历史侧边栏与人脉左侧栏必须同宽（212px，以人脉为准），且这个宽度只能有
 * 一个来源。iOrbit 仍然可以拖拽调宽，但下限必须不高于初始宽度。
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ORBIT_LEFT_SIDEBAR_WIDTH } from "../../app/(app)/app/orbit-layout-constants";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("the shared sidebar width matches the 人脉 column", () => {
  assert.equal(ORBIT_LEFT_SIDEBAR_WIDTH, 212);
});

test("the iOrbit sidebar derives its default width from the shared constant", () => {
  const agent = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.ok(agent.includes("ORBIT_LEFT_SIDEBAR_WIDTH"));
  assert.ok(
    agent.includes("const HISTORY_SIDEBAR_DEFAULT_WIDTH = ORBIT_LEFT_SIDEBAR_WIDTH"),
  );
});

test("the iOrbit drag lower bound does not exceed the initial width", () => {
  const agent = source("app/(app)/app/agent/orbit-real-agent.tsx");
  const min = Number(
    /const HISTORY_SIDEBAR_MIN_WIDTH = (\d+)/.exec(agent)?.[1] ?? "0",
  );

  assert.ok(min > 0, "HISTORY_SIDEBAR_MIN_WIDTH must be a number literal");
  assert.ok(
    min <= ORBIT_LEFT_SIDEBAR_WIDTH,
    `min ${min} would clamp the ${ORBIT_LEFT_SIDEBAR_WIDTH}px initial width upward`,
  );
});

test("the iOrbit sidebar is still resizable", () => {
  const agent = source("app/(app)/app/agent/orbit-real-agent.tsx");

  assert.ok(agent.includes("clampHistorySidebarWidth"));
  assert.ok(agent.includes("HISTORY_SIDEBAR_MAX_WIDTH = 380"));
});

test("no contacts surface hardcodes the sidebar column width", () => {
  const contactsDir = join(projectRoot, "app/(app)/app/contacts");
  const offenders = readdirSync(contactsDir)
    .filter((name) => name.endsWith(".tsx"))
    .filter((name) =>
      readFileSync(join(contactsDir, name), "utf8").includes("212px 1fr"),
    );

  assert.deepEqual(offenders, []);
});

test("the two ledger pages collapse to one column on mobile", () => {
  for (const file of [
    "app/(app)/app/today/page.tsx",
    "app/(app)/app/contacts/all-actions/page.tsx",
  ]) {
    const pageSource = readFileSync(join(projectRoot, file), "utf8");
    assert.ok(pageSource.includes("@media (max-width: 760px)"), file);
  }
});

test("the mobile bar uses a theme token, not hardcoded light glass", () => {
  const shellSource = source("app/(app)/app/orbit-account-shell.tsx");
  assert.ok(shellSource.includes("var(--glass-bar"));
});
