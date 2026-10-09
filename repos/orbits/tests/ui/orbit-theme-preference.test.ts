import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { ORBIT_THEME_INIT_SCRIPT } from "../../app/(app)/app/orbit-theme-init";

// R01 / SC-R01-06: first paint follows the system until the person picks a
// theme; Settings offers automatic / light / dark and remembers the choice.

type FakeWindow = {
  stored: string | null;
  systemDark: boolean;
  theme: string | null;
  listeners: Set<() => void>;
};

function fakeBrowser(stored: string | null, systemDark: boolean, opts: { storageThrows?: boolean } = {}) {
  const state: FakeWindow = { stored, systemDark, theme: null, listeners: new Set() };
  const localStorage = {
    getItem: () => {
      if (opts.storageThrows) throw new Error("blocked");
      return state.stored;
    },
    setItem: (_: string, value: string) => { state.stored = value; },
    removeItem: () => { state.stored = null; },
  };
  const document = { documentElement: { setAttribute: (_: string, value: string) => { state.theme = value; }, getAttribute: () => state.theme } };
  const window = {
    localStorage,
    matchMedia: (query: string) => ({
      matches: query.includes("dark") ? state.systemDark : !state.systemDark,
      addEventListener: (_: string, fn: () => void) => state.listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => state.listeners.delete(fn),
    }),
  };
  return { state, localStorage, document, window };
}

function runInitScript(browser: ReturnType<typeof fakeBrowser>) {
  vm.runInNewContext(ORBIT_THEME_INIT_SCRIPT, { localStorage: browser.localStorage, document: browser.document, window: browser.window });
  return browser.state.theme;
}

test("first paint follows the system when nothing is stored", () => {
  assert.equal(runInitScript(fakeBrowser(null, true)), "dark");
  assert.equal(runInitScript(fakeBrowser(null, false)), "light");
  assert.equal(runInitScript(fakeBrowser("sepia", true)), "dark");
});

test("a stored choice wins over the system", () => {
  assert.equal(runInitScript(fakeBrowser("light", true)), "light");
  assert.equal(runInitScript(fakeBrowser("dark", false)), "dark");
});

test("blocked storage falls back to the light default, not the old dark one", () => {
  assert.equal(runInitScript(fakeBrowser(null, false, { storageThrows: true })), "light");
});

test("choosing automatic, light or dark applies it and remembers it", async (t) => {
  const browser = fakeBrowser(null, true);
  const globals = globalThis as unknown as Record<string, unknown>;
  const saved = { window: globals.window, document: globals.document, localStorage: globals.localStorage };
  Object.assign(globals, { window: browser.window, document: browser.document, localStorage: browser.localStorage });
  t.after(() => Object.assign(globals, saved));
  const theme = await import("../../app/(app)/app/orbit-theme");

  assert.equal(theme.getOrbitThemePreference(), "system");
  theme.setOrbitThemePreference("light");
  assert.equal(browser.state.stored, "light");
  assert.equal(browser.state.theme, "light");
  assert.equal(theme.getOrbitTheme(), "light");
  theme.setOrbitThemePreference("dark");
  assert.equal(browser.state.theme, "dark");
  theme.setOrbitThemePreference("system");
  assert.equal(browser.state.stored, null, "automatic clears the stored choice");
  assert.equal(browser.state.theme, "dark", "system is dark");
  assert.equal(theme.getOrbitThemePreference(), "system");
});

test("Settings offers automatic, light and dark", () => {
  const appearance = readFileSync("app/(app)/app/settings/orbit-appearance-settings.tsx", "utf8");
  for (const choice of ["system", "light", "dark"]) {
    assert.match(appearance, new RegExp(`choosePreference\\("${choice}"\\)`));
    assert.match(appearance, new RegExp(`aria-pressed=\\{preference === "${choice}"\\}`));
  }
  assert.match(appearance, /setOrbitThemePreference/);
});

test("the root layout runs the shared init script before paint", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /ORBIT_THEME_INIT_SCRIPT/);
  assert.doesNotMatch(layout, /const themeInitScript =/, "one copy of the init script");
});
