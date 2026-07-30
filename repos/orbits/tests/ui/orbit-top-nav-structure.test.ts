/**
 * 顶部导航结构测试：3 段式骨架 + 移动端汉堡（ui 基准布局统一的回归闸门）。
 *
 * CSS（orbit-reference-styles）一直健在；丢的是 DOM 结构。本测试锁定 DOM 端。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const shell = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-public-shell.tsx"),
  "utf8",
);
const accountShell = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-account-shell.tsx"),
  "utf8",
);

test("the nav renders the unified three-segment skeleton", () => {
  assert.ok(shell.includes('"orbit-top-nav orbit-nav-menu"'), "orbit-nav-menu class");
  assert.ok(shell.includes("orbit-nav-lead"), "brand segment");
  assert.ok(shell.includes("orbit-brand-word"), "visible brand word");
  assert.ok(shell.includes("orbit-nav-page-title"), "mobile page title");
});

test("the agent pill and the flex spacer are gone", () => {
  assert.ok(!shell.includes("orbit-agent-btn"));
  assert.ok(!shell.includes('<div style={{ flex: 1 }} />'));
});

test("iOrbit is the first nav link, outside the links array", () => {
  const navsStart = shell.indexOf('className="orbit-nav-links"');
  const mapStart = shell.indexOf("links.map", navsStart);
  const between = shell.slice(navsStart, mapStart);
  assert.ok(between.includes("iOrbit"), "iOrbit literal link precedes links.map");
});

test("top actions rely on the CSS class, not inline flex styles", () => {
  const actionsIdx = shell.indexOf('className="orbit-top-actions"');
  assert.ok(actionsIdx > 0);
  const snippet = shell.slice(actionsIdx, actionsIdx + 120);
  assert.ok(!snippet.includes("style={{"), "no inline style on .orbit-top-actions");
});

test("the language toggle uses discrete buttons in .orbit-lang-toggle", () => {
  assert.ok(shell.includes("orbit-lang-toggle"));
  assert.ok(!shell.includes("orbit-lang-button"), "cycling button retired");
});

test("the mobile hamburger and compact menu layer are present", () => {
  for (const cls of [
    "orbit-nav-menu-btn",
    "orbit-nav-menu-layer",
    "orbit-nav-menu-scrim",
    "orbit-nav-menu-panel",
    "orbit-nav-menu-item",
  ]) {
    assert.ok(shell.includes(cls), cls);
  }
  const menuIdx = shell.indexOf("const menuItems");
  const menuBlock = shell.slice(menuIdx, shell.indexOf("];", menuIdx));
  assert.ok(menuBlock.includes('"agent"'), "iOrbit present in the mobile menu");
  assert.ok(menuBlock.includes('"today"'), "Today present in the mobile menu");
  assert.ok(!menuBlock.includes("icon:"), "mobile destinations are text-only");
  assert.ok(shell.includes("OrbitNavMobileAccountLinks"), "session-aware account group present");
  assert.ok(shell.includes("orbit-nav-menu-divider"), "primary and account groups are separated");
});

// T3 (today-schedule merge): the hamburger used to carry a standalone
// "schedule" entry (clock icon) alongside "today". Schedule folded into
// Today (now labeled 日程/Schedule, calendar icon) — the standalone entry
// must be gone.
test("the standalone schedule item is gone and the primary order stays canonical", () => {
  const menuIdx = shell.indexOf("const menuItems");
  const menuBlock = shell.slice(menuIdx, shell.indexOf("];", menuIdx));

  assert.ok(!/key: "schedule"/.test(menuBlock), "no standalone schedule entry in the mobile menu");
  assert.ok(
    menuBlock.indexOf('key: "agent"') < menuBlock.indexOf('key: "events"'),
    "mobile menu starts with iOrbit",
  );
  assert.ok(
    menuBlock.indexOf('key: "events"') < menuBlock.indexOf('key: "today"'),
    "mobile menu keeps 活动/Events before 日程/Schedule",
  );
  assert.ok(
    menuBlock.indexOf('key: "today"') < menuBlock.indexOf('key: "cards"'),
    "mobile menu keeps 日程/Schedule before 人脉/Contacts",
  );
});

test("session account control and inbox extras stay in the actions segment", () => {
  const actionsIdx = shell.indexOf('className="orbit-top-actions"');
  const headerEnd = shell.indexOf("</header>", actionsIdx);
  const actions = shell.slice(actionsIdx, headerEnd);
  assert.ok(actions.includes("OrbitNavAccountControl"));
  assert.ok(actions.includes("{mobileRightExtra}"));
  assert.ok(actions.includes("{rightExtra}"));
  assert.ok(actions.includes("orbit-nav-mobile-extra"));
  assert.ok(actions.includes("orbit-nav-account-slot"));
  assert.ok(actions.includes("orbit-nav-extra"));
  const mobileExtraIdx = accountShell.indexOf("mobileRightExtra={");
  const rightExtraIdx = accountShell.indexOf("rightExtra={", mobileExtraIdx);
  const mobileExtras = accountShell.slice(mobileExtraIdx, rightExtraIdx);
  const rightExtraEnd = accountShell.indexOf("/>", rightExtraIdx);
  const desktopExtras = accountShell.slice(rightExtraIdx, rightExtraEnd);
  assert.ok(mobileExtras.includes("{mobileRightExtra}"));
  assert.ok(mobileExtras.includes("<RelationshipInboxTrigger />"));
  assert.ok(
    desktopExtras.indexOf("{rightExtra}") <
      desktopExtras.indexOf("<RelationshipInboxTrigger"),
    "desktop extras keep page actions and the global inbox together",
  );
});

test("theme controls are absent from global navigation", () => {
  const themeSource = readFileSync(
    join(projectRoot, "app/(app)/app/orbit-theme.tsx"),
    "utf8",
  );

  assert.ok(!themeSource.includes("OrbitThemeToggle"), "floating toggle component removed");
  assert.ok(!themeSource.includes(".orbit-theme-toggle"), "floating toggle styles removed");
  assert.ok(!shell.includes("OrbitNavThemeMenuItem"), "hamburger theme item removed");
  assert.ok(!shell.includes("toggleOrbitTheme"), "navigation no longer mutates theme");
});

test("the ledger pages carry the real-page scope the nav CSS requires", () => {
  for (const file of [
    "app/(app)/app/today/today-page-content.tsx",
    "app/(app)/app/contacts/all-actions/page.tsx",
  ]) {
    const pageSource = readFileSync(join(projectRoot, file), "utf8");
    assert.ok(pageSource.includes("data-orbit-real-page="), file);
  }
});
