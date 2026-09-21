import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");

function source(path: string): string {
  return readFileSync(join(projectRoot, path), "utf8");
}

test("settings route renders inside the shared account shell", () => {
  const pagePath = join(projectRoot, "app/(app)/app/settings/page.tsx");
  assert.ok(existsSync(pagePath));

  // 设置页与个人资料同壳（Orbit_0918 个人中心）：外层 profile-0918 作用域 + 顶栏 settings 高亮 + settings 屏。
  const page = readFileSync(pagePath, "utf8");
  assert.match(page, /data-orbit-real-page="profile-0918"/);
  assert.match(page, /<AccountTopNav active="settings"/);
  assert.match(page, /<ProfileScreens view="settings"/);

  // 五个既有设置模块仍然挂载，且包在 .pc-legacy-settings 皮肤作用域里（配色不回退）。
  const legacy = source(
    "app/(app)/app/profile/profile-0918/profile-legacy-settings.tsx",
  );
  assert.match(legacy, /className="pc-legacy-settings"/);
  assert.match(legacy, /\.pc-legacy-settings\{/);
  assert.match(legacy, /\.pc-legacy-settings \.card\{/);
  for (const component of [
    "OrbitAppearanceSettings",
    "OrbitAgentMemorySettings",
    "OrbitAgentFeedbackSettings",
    "OrbitAgentAutomationSettings",
    "OrbitAgentExecutionSettings",
  ]) {
    assert.match(legacy, new RegExp(`<${component} />`));
  }
  const screens = source("app/(app)/app/profile/profile-0918/profile-screens.tsx");
  assert.match(screens, /<ProfileLegacySettings \/>/);
});

test("appearance settings offers explicit light and dark choices", () => {
  const appearance = source(
    "app/(app)/app/settings/orbit-appearance-settings.tsx",
  );

  assert.match(appearance, /chooseTheme\("light"\)/);
  assert.match(appearance, /chooseTheme\("dark"\)/);
  assert.match(appearance, /aria-pressed=\{theme === "light"\}/);
  assert.match(appearance, /aria-pressed=\{theme === "dark"\}/);
  assert.match(appearance, /getOrbitTheme/);
  assert.match(appearance, /toggleOrbitTheme/);
});

test("settings page copy follows the shared language preference", () => {
  const content = source("app/(app)/app/settings/orbit-settings-content.tsx");
  assert.match(content, /useOrbitLanguage/);
  assert.match(content, /en: "Settings", zh: "设置"/);
  assert.match(content, /<OrbitAppearanceSettings/);
});
