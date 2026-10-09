// Renders shared/design/tokens.json into the files both clients read.
//
//   npm run design:tokens            write the generated files
//
// Outputs (each starts with a "do not edit" header; tests/ui/design-tokens-generated.test.ts
// fails when a file drifts from what this script renders):
//   shared/design/tokens.ts               import-free constants; synced into the App
//                                         by `npm run sync:contract` (repos/orbit-app)
//   app/(app)/app/orbit-2026/tokens.css   Web custom properties, light + dark
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HEADER = "由 shared/design/tokens.json 生成，禁止手改；改源文件后运行 npm run design:tokens";

export const DESIGN_TOKEN_SOURCE = "shared/design/tokens.json";
export const DESIGN_TOKEN_TS = "shared/design/tokens.ts";
export const DESIGN_TOKEN_CSS = "app/(app)/app/orbit-2026/tokens.css";
export const DESIGN_TOKEN_OUTPUTS = [DESIGN_TOKEN_TS, DESIGN_TOKEN_CSS];

// "ink-3-text" → "ink3Text", "plum-700" → "plum700", "card-web" → "cardWeb".
export function camelTokenName(name) {
  return name.replace(/-([a-z0-9])/g, (_, next) => next.toUpperCase());
}

const quote = (value) => JSON.stringify(value);

function tsObject(entries, indent) {
  const pad = "  ".repeat(indent);
  const lines = entries.map(([key, value]) => `${pad}  ${key}: ${value}`);
  return `{\n${lines.join(",\n")}\n${pad}}`;
}

function tsMap(record, render, indent) {
  return tsObject(Object.entries(record).map(([key, value]) => [camelTokenName(key), render(value)]), indent);
}

function renderTs(tokens) {
  const colors = (theme) => tsMap(tokens.color[theme], quote, 1);
  const num = (value) => String(value);
  return [
    `// ${HEADER}`,
    "// Pure constants, zero imports: this file is copied verbatim into repos/orbit-app/src/api/design/.",
    "",
    "export const designColors = {",
    `  light: ${colors("light")},`,
    `  dark: ${colors("dark")}`,
    "} as const;",
    "",
    "export type DesignColorName = keyof typeof designColors.light;",
    "",
    `export const designRadius = ${tsMap(tokens.radius, num, 0)} as const;`,
    "",
    `export const designSpace = ${tsObject([
      ["gap", num(tokens.space.gap)],
      ["scale", `[${tokens.space.scale.join(", ")}]`],
    ], 0)} as const;`,
    "",
    `export const designFont = ${tsObject([
      ["family", tsMap(tokens.font.family, quote, 1)],
      ["size", tsMap(tokens.font.size, num, 1)],
      ["weight", tsMap(tokens.font.weight, num, 1)],
      ["lineHeight", tsMap(tokens.font["line-height"], num, 1)],
    ], 0)} as const;`,
    "",
    `export const designShadow = ${tsObject(Object.entries(tokens.shadow).map(([key, value]) => [camelTokenName(key), tsMap(value, quote, 1)]), 0)} as const;`,
    "",
    `export const designMotion = ${tsObject([
      ["ease", quote(tokens.motion.ease)],
      ["duration", tsMap(tokens.motion.duration, num, 1)],
    ], 0)} as const;`,
    "",
  ].join("\n");
}

function cssBlock(selector, declarations, indent = 0) {
  const pad = "  ".repeat(indent);
  return `${pad}${selector} {\n${declarations.map((line) => `${pad}  ${line}`).join("\n")}\n${pad}}`;
}

function themeDeclarations(tokens, theme) {
  return [
    `color-scheme: ${theme};`,
    ...Object.entries(tokens.color[theme]).map(([name, value]) => `--${name}: ${value};`),
    ...Object.entries(tokens.shadow).map(([name, value]) => `--shadow-${name}: ${value[theme]};`),
  ];
}

function renderCss(tokens) {
  const px = (value) => `${value}px`;
  const shared = [
    ...Object.entries(tokens.radius).map(([name, value]) => `--r-${name}: ${px(value)};`),
    `--gap: ${px(tokens.space.gap)};`,
    ...tokens.space.scale.map((value) => `--space-${value}: ${px(value)};`),
    ...Object.entries(tokens.font.family).map(([name, value]) => `--font-${name}: ${value};`),
    // Unknown or missing <html lang> falls back to Japanese (RD-11).
    "--font: var(--font-ja);",
    ...Object.entries(tokens.font.size).map(([name, value]) => `--fs-${name}: ${px(value)};`),
    ...Object.entries(tokens.font.weight).map(([name, value]) => `--fw-${name}: ${value};`),
    ...Object.entries(tokens.font["line-height"]).map(([name, value]) => `--lh-${name}: ${value};`),
    `--ease: ${tokens.motion.ease};`,
    ...Object.entries(tokens.motion.duration).map(([name, value]) => `--dur-${name}: ${value}ms;`),
  ];
  return [
    `/* ${HEADER} */`,
    "/* Light is the default; dark applies when the user picked it (data-theme=\"dark\")",
    "   or, with no choice stored, when the system is dark. */",
    "",
    cssBlock(":root", [...themeDeclarations(tokens, "light"), ...shared]),
    "",
    cssBlock(":root:lang(zh)", ["--font: var(--font-zh);"]),
    "",
    cssBlock(":root:lang(en)", ["--font: var(--font-en);"]),
    "",
    `@media (prefers-color-scheme: dark) {\n${cssBlock(':root:not([data-theme="light"])', themeDeclarations(tokens, "dark"), 1)}\n}`,
    "",
    cssBlock(':root[data-theme="dark"]', themeDeclarations(tokens, "dark")),
    "",
  ].join("\n");
}

export function renderDesignTokenOutputs(tokens) {
  return {
    [DESIGN_TOKEN_TS]: renderTs(tokens),
    [DESIGN_TOKEN_CSS]: renderCss(tokens),
  };
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const tokens = JSON.parse(readFileSync(path.join(root, DESIGN_TOKEN_SOURCE), "utf8"));
  for (const [file, content] of Object.entries(renderDesignTokenOutputs(tokens))) {
    const target = path.join(root, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, content);
    console.log(`wrote ${file}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
