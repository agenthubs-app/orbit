/**
 * WCAG AA contrast gate for the semantic color tokens touched by the P0-1/2/3/4
 * remediation (register-pill on-accent, --text-3, --live/--amber/--rose -text
 * variants, --signal badge). Parses hex values straight out of the two source
 * files with regex and computes contrast ratios in-test, so a future token
 * edit that regresses contrast fails this test without needing a browser.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const projectRoot = join(fileURLToPath(import.meta.url), "../../..");
const referenceStyles = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-reference-styles.tsx"),
  "utf8",
);
const theme = readFileSync(
  join(projectRoot, "app/(app)/app/orbit-theme.tsx"),
  "utf8",
);

// ---- WCAG 2.x contrast math -------------------------------------------------

function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function srgbChannelToLinear(c: number) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

function contrastRatio(hexA: string, hexB: string) {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_TEXT = 4.5;

// ---- token extraction --------------------------------------------------

/** First `--name: #hex;` match at or after `fromIndex` in `source`. */
function extractToken(source: string, name: string, fromIndex = 0): string {
  const re = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,6})\\s*;`);
  const rest = source.slice(fromIndex);
  const m = rest.match(re);
  assert.ok(m, `token --${name} not found (searching from index ${fromIndex})`);
  return m![1];
}

// orbit-reference-styles.tsx: single dark-theme token block under [data-orbit-real-page].
const darkBlockStart = referenceStyles.indexOf("[data-orbit-real-page] {");
assert.ok(darkBlockStart >= 0, "dark theme token block not found");

// orbit-theme.tsx: two light-theme scopes — general, then account-auth (later in file).
const lightGeneralStart = theme.indexOf('html[data-theme="light"] [data-orbit-real-page] {');
const lightAccountAuthStart = theme.indexOf(
  'html[data-theme="light"] [data-orbit-real-page].orbit-account-auth-page {',
);
assert.ok(lightGeneralStart >= 0, "general light theme token block not found");
assert.ok(lightAccountAuthStart >= 0, "account-auth light theme token block not found");

const darkTokens = {
  onAccent: extractToken(referenceStyles, "on-accent", darkBlockStart),
  accent: extractToken(referenceStyles, "accent", darkBlockStart),
  liveText: extractToken(referenceStyles, "live-text", darkBlockStart),
  amberText: extractToken(referenceStyles, "amber-text", darkBlockStart),
  roseText: extractToken(referenceStyles, "rose-text", darkBlockStart),
  signal: extractToken(referenceStyles, "signal", darkBlockStart),
  surface: extractToken(referenceStyles, "surface", darkBlockStart),
  bg: extractToken(referenceStyles, "bg", darkBlockStart),
};

const lightTokens = {
  onAccent: extractToken(theme, "on-accent", lightGeneralStart),
  accent: extractToken(theme, "accent", lightGeneralStart),
  text3: extractToken(theme, "text-3", lightGeneralStart),
  liveText: extractToken(theme, "live-text", lightGeneralStart),
  amberText: extractToken(theme, "amber-text", lightGeneralStart),
  roseText: extractToken(theme, "rose-text", lightGeneralStart),
  signal: extractToken(theme, "signal", lightGeneralStart),
};

const accountAuthTokens = {
  text3: extractToken(theme, "text-3", lightAccountAuthStart),
};

const WHITE = "#FFFFFF";

// ---- mandated gates (verification contract) -----------------------------

test("light --text-3 reads at >=4.5:1 on white", () => {
  const ratio = contrastRatio(lightTokens.text3, WHITE);
  assert.ok(
    ratio >= AA_TEXT,
    `--text-3 ${lightTokens.text3} vs #fff = ${ratio.toFixed(2)}, need >= ${AA_TEXT}`,
  );
});

test("light --live-text reads at >=4.5:1 on white", () => {
  const ratio = contrastRatio(lightTokens.liveText, WHITE);
  assert.ok(
    ratio >= AA_TEXT,
    `--live-text ${lightTokens.liveText} vs #fff = ${ratio.toFixed(2)}, need >= ${AA_TEXT}`,
  );
});

test("light --on-accent on light --accent reads at >=4.5:1 (register pill)", () => {
  const ratio = contrastRatio(lightTokens.onAccent, lightTokens.accent);
  assert.ok(
    ratio >= AA_TEXT,
    `--on-accent ${lightTokens.onAccent} vs --accent ${lightTokens.accent} = ${ratio.toFixed(2)}, need >= ${AA_TEXT}`,
  );
});

test("light --signal vs white reads at >=4.5:1 (badge white text)", () => {
  const ratio = contrastRatio(lightTokens.signal, WHITE);
  assert.ok(
    ratio >= AA_TEXT,
    `--signal ${lightTokens.signal} vs #fff = ${ratio.toFixed(2)}, need >= ${AA_TEXT}`,
  );
});

// ---- extra coverage for the rest of this task's token changes -----------

test("dark --on-accent on dark --accent reads at >=4.5:1 (register pill, dark theme)", () => {
  const ratio = contrastRatio(darkTokens.onAccent, darkTokens.accent);
  assert.ok(
    ratio >= AA_TEXT,
    `--on-accent ${darkTokens.onAccent} vs --accent ${darkTokens.accent} = ${ratio.toFixed(2)}, need >= ${AA_TEXT}`,
  );
});

test("dark --signal vs white reads at >=4.5:1 (badge white text)", () => {
  const ratio = contrastRatio(darkTokens.signal, WHITE);
  assert.ok(
    ratio >= AA_TEXT,
    `--signal ${darkTokens.signal} vs #fff = ${ratio.toFixed(2)}, need >= ${AA_TEXT}`,
  );
});

test("account-auth light --text-3 reads at >=4.5:1 on white", () => {
  const ratio = contrastRatio(accountAuthTokens.text3, WHITE);
  assert.ok(
    ratio >= AA_TEXT,
    `account-auth --text-3 ${accountAuthTokens.text3} vs #fff = ${ratio.toFixed(2)}, need >= ${AA_TEXT}`,
  );
});

for (const [themeName, tokens, bg] of [
  ["dark", darkTokens, darkTokens.surface],
  ["light", lightTokens, WHITE],
] as const) {
  test(`${themeName} --live-text/--amber-text/--rose-text read at >=4.5:1 on their surface`, () => {
    for (const [label, hex] of [
      ["--live-text", tokens.liveText],
      ["--amber-text", tokens.amberText],
      ["--rose-text", tokens.roseText],
    ] as const) {
      const ratio = contrastRatio(hex, bg);
      assert.ok(
        ratio >= AA_TEXT,
        `${themeName} ${label} ${hex} vs ${bg} = ${ratio.toFixed(2)}, need >= ${AA_TEXT}`,
      );
    }
  });
}
