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

  const page = readFileSync(pagePath, "utf8");
  assert.match(page, /data-orbit-real-page="settings"/);
  assert.match(page, /<AccountTopNav active="settings"/);
  assert.match(page, /<OrbitSettingsContent/);
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
