import { join } from "node:path";

import { build } from "esbuild";
import { chromium, type Browser, type Page } from "playwright";

import { nativeUiStubs } from "./native-ui-stubs";

// R04 component harness: bundles the real ui components with react-native-web and
// renders a scenario in Chromium. The "native" shim adds what the browser lacks:
//   - Text scales with fixture.fontScale (system text size) unless maxFontSizeMultiplier caps it;
//   - Pressable exposes hitSlop as data-hitslop so touch targets can be measured;
//   - BackHandler listeners are reachable through window.fireBack();
//   - AccessibilityInfo.isReduceMotionEnabled follows fixture.systemReducedMotion;
//   - Text with adjustsFontSizeToFit (iOS-only shrinking) is marked data-shrink;
//   - Keyboard listeners are reachable through window.fireKeyboard(height).
// Scenarios live in the entry passed to `bundleScenarios`.
const nativeShim = `
import React from "react";
import * as RNW from "react-native-web";
export * from "react-native-web";
const fixture = () => window.uiFixture || {};
export const useWindowDimensions = () => ({ ...RNW.useWindowDimensions(), fontScale: fixture().fontScale || 1 });
export const Text = React.forwardRef(({ allowFontScaling = true, maxFontSizeMultiplier, style, lineBreakStrategyIOS, adjustsFontSizeToFit, minimumFontScale, dataSet, ...props }, ref) => {
  const flat = RNW.StyleSheet.flatten(style) || {};
  const raw = allowFontScaling ? (fixture().fontScale || 1) : 1;
  const scale = maxFontSizeMultiplier ? Math.min(raw, maxFontSizeMultiplier) : raw;
  return <RNW.Text ref={ref} {...props} dataSet={adjustsFontSizeToFit ? { ...dataSet, shrink: "1" } : dataSet} style={[style, { fontSize: typeof flat.fontSize === "number" ? flat.fontSize * scale : undefined, lineHeight: typeof flat.lineHeight === "number" ? flat.lineHeight * scale : undefined }]} />;
});
export const Pressable = React.forwardRef(({ hitSlop, dataSet, ...props }, ref) => <RNW.Pressable ref={ref} {...props} dataSet={{ ...dataSet, hitslop: String(typeof hitSlop === "number" ? hitSlop : hitSlop ? Math.min(hitSlop.top ?? 0, hitSlop.left ?? 0) : 0) }} />);
const backListeners = new Set();
window.fireBack = () => { for (const listener of [...backListeners].reverse()) if (listener()) return true; return false; };
export const BackHandler = { addEventListener: (_event, listener) => { backListeners.add(listener); return { remove: () => backListeners.delete(listener) }; } };
const keyboardListeners = new Set();
window.fireKeyboard = (height) => { for (const [event, listener] of keyboardListeners) if (event === (height > 0 ? "keyboardDidShow" : "keyboardDidHide")) listener({ endCoordinates: { height } }); };
export const Keyboard = { ...RNW.Keyboard, addListener: (event, listener) => { const entry = [event, listener]; keyboardListeners.add(entry); return { remove: () => keyboardListeners.delete(entry) }; }, dismiss() {} };
export const AccessibilityInfo = { ...RNW.AccessibilityInfo, isReduceMotionEnabled: async () => Boolean(fixture().systemReducedMotion), addEventListener: () => ({ remove() {} }), setAccessibilityFocus: (node) => { window.lastFocus = node; } };
export const findNodeHandle = (instance) => { if (instance && instance.setAttribute) instance.setAttribute("data-focus-target", "1"); return instance; };
`;

export async function bundleScenarios(entry: string): Promise<string> {
  const result = await build({
    stdin: { contents: entry, loader: "tsx", resolveDir: process.cwd() },
    bundle: true,
    define: { __ORBIT_LEGACY_TEST_LANGUAGE__: '"ja"', "process.env.NODE_ENV": '"test"', "process.env": "{}", __DEV__: "false" },
    format: "iife",
    jsx: "automatic",
    plugins: [nativeUiStubs, {
      name: "ui-harness",
      setup(plugin) {
        plugin.onResolve({ filter: /^react-native$/ }, () => ({ path: "native", namespace: "ui-harness" }));
        plugin.onResolve({ filter: /^react-native-web$/ }, () => ({ path: require.resolve("react-native-web") }));
        plugin.onResolve({ filter: /^react-native-svg$/ }, () => ({ path: join(process.cwd(), "tests/helpers/stubs/react-native-svg.js") }));
        plugin.onLoad({ filter: /.*/, namespace: "ui-harness" }, () => ({ contents: nativeShim, loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
    resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".jsx", ".js", ".json"],
    write: false,
  });
  return result.outputFiles[0]!.text;
}

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: true });
}

export async function openScenario(browser: Browser, script: string, fixture: Record<string, unknown>, options: { width?: number; dark?: boolean } = {}): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: options.width ?? 390, height: 844 }, colorScheme: options.dark ? "dark" : "light" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setContent(`<!doctype html><html><body style="margin:0"><div id="root" style="min-height:100vh;display:flex;flex-direction:column"></div><script>window.uiFixture=${JSON.stringify(fixture)}</script></body></html>`);
  await page.addScriptTag({ content: script });
  await page.waitForTimeout(80);
  if (errors.length) throw new Error(errors.join("\n"));
  return page;
}
